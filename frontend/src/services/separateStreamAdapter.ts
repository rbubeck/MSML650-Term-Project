import type { StreamClientHandlers, StreamStartOptions } from '@live-transcription/stream-client';
import type { PcmChunk } from '../audio/microphone';
import { StereoSourceCapture } from '../audio/stereoSourceCapture';
import {
  SourceCapture,
  type AudioSourceSelection,
  type SourceCaptureStatus,
} from '../audio/sourceCapture';
import {
  DirectStreamAdapter,
  type CaptureBridge,
  type CaptureFactory,
  type TransportFactory,
} from './directStreamAdapter';
import type { LiveCaptionEvent } from './streamPort';

export type AudioSource = 'microphone' | 'system';

/** A result's source comes from its physical capture stream, not inferred speech identity. */
export type SourceCaptionEvent = LiveCaptionEvent & { readonly source: AudioSource };

export interface SeparateStreamHandlers {
  readonly onCaption: (event: SourceCaptionEvent) => void;
  readonly onFailure: (message: string) => void;
  readonly onDisconnected: () => void;
}

export type SourceCaptureFactory = (
  source: AudioSource,
  onChunk: (chunk: PcmChunk) => void,
  onStatus: (status: SourceCaptureStatus) => void,
  onEnded: () => void,
) => CaptureBridge;

export interface SeparateStreamOptions {
  readonly selection: AudioSourceSelection;
  /** Currently the team smoke API has one owner/session ID. The caller must opt in to concurrency. */
  readonly requestCapability: (sessionId: string) => Promise<StreamStartOptions>;
  /** True only for AWS microphone + tab capture, using ONE stereo WebSocket. */
  readonly stereo?: boolean;
  readonly requestStereoCapability?: (sessionId: string) => Promise<StreamStartOptions>;
  readonly createStereoCapture?: CaptureFactory;
  readonly createTransport?: (handlers: StreamClientHandlers) => {
    start(options: StreamStartOptions): Promise<void>;
    sendAudio(bytes: ArrayBuffer | Uint8Array): boolean;
    stop(): Promise<void>;
    cancel(): void;
  };
  readonly createCapture?: SourceCaptureFactory;
  readonly onCaptureStatus?: (status: SourceCaptureStatus) => void;
}

/**
 * Runs one independent AudioWorklet -> PCM -> Transcribe connection per selected source.
 * Two capture starts are invoked in the SAME Start click, without awaiting either:
 * the display picker therefore still receives browser transient user activation.
 * Audio from one source is never fed to the other's provider connection.
 */
export class SeparateStreamAdapter {
  private active: DirectStreamAdapter[] = [];
  private stopping: Promise<void> | undefined;
  private starting = false;
  private failed = false;
  private captureStatus: Partial<Record<AudioSource, SourceCaptureStatus>> = {};

  constructor(private readonly options: SeparateStreamOptions) {}

  async start(sessionId: string, handlers: SeparateStreamHandlers): Promise<void> {
    if (this.starting || this.active.length > 0) {
      throw new Error('A transcription session is already active.');
    }
    const sources: AudioSource[] = [
      ...(this.options.selection.system ? (['system'] as const) : []),
      ...(this.options.selection.microphone ? (['microphone'] as const) : []),
    ];
    if (sources.length === 0) throw new Error('Select at least one audio source.');
    if (this.options.stereo && sources.length === 2) {
      return this.startStereo(sessionId, handlers);
    }

    this.starting = true;
    this.failed = false;
    this.captureStatus = {};

    const fail = (message: string, disconnected: boolean): void => {
      if (this.failed || this.active.length === 0) return;
      this.failed = true;
      if (disconnected) handlers.onDisconnected();
      else handlers.onFailure(message);
      void this.stop();
    };

    const entries = sources.map((source) => {
      const statusForSource = (status: SourceCaptureStatus): void => {
        this.captureStatus[source] = status;
        const mic = this.captureStatus.microphone;
        const system = this.captureStatus.system;
        this.options.onCaptureStatus?.({
          receivedChunks: (mic?.receivedChunks ?? 0) + (system?.receivedChunks ?? 0),
          sampleRate: status.sampleRate,
          micLevel: mic?.micLevel ?? 0,
          meetingLevel: system?.meetingLevel ?? 0,
        });
      };
      const adapter = new DirectStreamAdapter({
        requestCapability: this.options.requestCapability,
        createCapture: (onChunk, onStatus, onEnded) =>
          this.options.createCapture
            ? this.options.createCapture(source, onChunk, onStatus, onEnded)
            : new SourceCapture(
                { microphone: source === 'microphone', system: source === 'system' },
                onChunk,
                onStatus,
                onEnded,
              ),
        ...(this.options.createTransport
          ? { createTransport: this.options.createTransport as TransportFactory }
          : {}),
        onCaptureStatus: statusForSource,
      });
      return { source, adapter };
    });
    this.active = entries.map((entry) => entry.adapter);

    try {
      // IMPORTANT: start BOTH promises before awaiting either. The system source
      // is first so getDisplayMedia() executes immediately from the Start click.
      const starts = entries.map(({ source, adapter }) =>
        adapter.start(sessionId, {
          onCaption: (event) => {
            if (!this.failed && this.active.includes(adapter)) {
              handlers.onCaption({ ...event, source });
            }
          },
          onFailure: (message) => fail(message, false),
          onDisconnected: () => fail('A source or transcription connection ended.', true),
        }),
      );
      const results = await Promise.allSettled(starts);
      const failure = results.find(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );
      if (failure) throw failure.reason;
      if (this.failed || this.active.length === 0) {
        throw new Error('Recording ended during startup.');
      }
    } catch (error) {
      this.failed = true;
      await this.stop();
      throw error;
    } finally {
      this.starting = false;
    }
  }

  /** A single AWS Transcribe connection carries left mic and right tab audio. */
  private async startStereo(sessionId: string, handlers: SeparateStreamHandlers): Promise<void> {
    const requestCapability = this.options.requestStereoCapability;
    if (!requestCapability) throw new Error('Stereo capability is not configured.');
    this.starting = true;
    this.failed = false;
    this.captureStatus = {};
    const adapter = new DirectStreamAdapter({
      requestCapability,
      createCapture: (onChunk, onStatus, onEnded) =>
        this.options.createStereoCapture
          ? this.options.createStereoCapture(onChunk, onStatus, onEnded)
          : new StereoSourceCapture(onChunk, onStatus, onEnded),
      ...(this.options.createTransport
        ? { createTransport: this.options.createTransport as TransportFactory }
        : {}),
      onCaptureStatus: (status) => this.options.onCaptureStatus?.(status),
    });
    this.active = [adapter];
    const fail = (message: string, disconnected: boolean): void => {
      if (this.failed || !this.active.includes(adapter)) return;
      this.failed = true;
      if (disconnected) handlers.onDisconnected();
      else handlers.onFailure(message);
      void this.stop();
    };
    try {
      // DirectStreamAdapter invokes getDisplayMedia before its first await.
      await adapter.start(sessionId, {
        onCaption: (event) => {
          if (this.failed || !this.active.includes(adapter)) return;
          if (event.channelId !== 'ch_0' && event.channelId !== 'ch_1') {
            fail(
              'AWS returned a transcript without a channel ID. The stereo backend configuration may be wrong.',
              false,
            );
            return;
          }
          handlers.onCaption({
            ...event,
            source: event.channelId === 'ch_0' ? 'microphone' : 'system',
          });
        },
        onFailure: (message) => fail(message, false),
        onDisconnected: () => fail('The audio share or AWS stream ended.', true),
      });
      if (this.failed || !this.active.includes(adapter)) {
        throw new Error('Stereo transcription ended during startup.');
      }
    } catch (error) {
      this.failed = true;
      await this.stop().catch(() => undefined);
      throw error;
    } finally {
      this.starting = false;
    }
  }

  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    this.stopping = this.stopActive();
    return this.stopping;
  }

  private async stopActive(): Promise<void> {
    const adapters = this.active;
    this.active = [];
    try {
      const outcomes = await Promise.allSettled(adapters.map((adapter) => adapter.stop()));
      const rejection = outcomes.find(
        (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
      );
      if (rejection) throw new Error('One of the transcription streams could not stop cleanly.');
    } finally {
      this.captureStatus = {};
      this.stopping = undefined;
    }
  }
}
