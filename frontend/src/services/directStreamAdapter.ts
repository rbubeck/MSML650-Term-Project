import {
  TranscribeStreamClient,
  type AudioBytes,
  type StreamClientHandlers,
  type StreamStartOptions,
} from '@live-transcription/stream-client';
import type { PcmChunk } from '../audio/microphone';
import type { SourceCaptureStatus } from '../audio/sourceCapture';
import type { StreamUIAdapter, StreamUIHandlers } from './streamPort';

export interface StreamTransport {
  start(options: StreamStartOptions): Promise<void>;
  sendAudio(bytes: AudioBytes): boolean;
  stop(): Promise<void>;
  cancel(): void;
}

export interface CaptureBridge {
  acquire(): Promise<void>;
  startProcessing(): Promise<void>;
  pauseProcessing(): Promise<void>;
  stop(): Promise<void>;
}

export type TransportFactory = (handlers: StreamClientHandlers) => StreamTransport;
export type CaptureFactory = (
  onChunk: (chunk: PcmChunk) => void,
  onStatus: (status: SourceCaptureStatus) => void,
  onSourceEnded: () => void,
) => CaptureBridge;

export interface DirectStreamAdapterOptions {
  readonly requestCapability: (sessionId: string) => Promise<StreamStartOptions>;
  readonly createCapture: CaptureFactory;
  readonly createTransport?: TransportFactory;
  readonly onCaptureStatus?: (status: SourceCaptureStatus) => void;
}

/** Provider transport is independent of microphone/system source selection. */
export class DirectStreamAdapter implements StreamUIAdapter {
  private capture: CaptureBridge | undefined;
  private transport: StreamTransport | undefined;
  private connecting = false;
  private stopping: Promise<void> | undefined;
  private aborting: Promise<void> | undefined;
  private paused = false;

  constructor(private readonly options: DirectStreamAdapterOptions) {}

  async start(sessionId: string, handlers: StreamUIHandlers): Promise<void> {
    if (this.connecting || this.capture || this.transport) {
      throw new Error('The transcription stream is already active.');
    }
    this.connecting = true;
    let failed = false;
    const transport = (this.options.createTransport ?? ((h) => new TranscribeStreamClient(h)))({
      onPartial: (result) =>
        handlers.onCaption({
          streamEpoch: result.streamEpoch,
          resultId: result.resultId,
          text: result.text,
          startMs: result.startMs,
          endMs: result.endMs,
          phase: 'partial',
          ...(result.channelId ? { channelId: result.channelId } : {}),
        }),
      onFinal: (result) =>
        handlers.onCaption({
          streamEpoch: result.streamEpoch,
          resultId: result.resultId,
          text: result.text,
          startMs: result.startMs,
          endMs: result.endMs,
          phase: 'final-observed',
          ...(result.channelId ? { channelId: result.channelId } : {}),
        }),
      onError: (error) => {
        if (failed) return;
        failed = true;
        handlers.onFailure(error.message);
        void this.abortAfterFailure();
      },
      onDisconnected: (event) => {
        if (event.expected || failed) return;
        failed = true;
        handlers.onDisconnected();
        void this.abortAfterFailure();
      },
    });
    this.transport = transport;
    const capture = this.options.createCapture(
      (chunk) => {
        if (this.transport !== transport) return;
        const audio = this.paused ? new Uint8Array(chunk.pcm.byteLength) : chunk.pcm;
        // The stream client emits a safe onError for buffer overflow/invalid audio.
        if (!transport.sendAudio(audio) && !failed) {
          failed = true;
          handlers.onFailure('Audio could not be sent to the transcription stream.');
          void this.abortAfterFailure();
        }
      },
      (status) =>
        this.options.onCaptureStatus?.(
          this.paused ? { ...status, micLevel: 0, systemLevel: 0 } : status,
        ),
      () => {
        if (this.capture !== capture || failed) return;
        failed = true;
        handlers.onDisconnected();
        void this.abortAfterFailure();
      },
    );
    this.capture = capture;

    try {
      // acquire() runs *before the first await* and calls getDisplayMedia directly
      // from the UI click. Do not move capability or socket awaits before this.
      await capture.acquire();
      if (this.capture !== capture) throw new Error('Audio capture was canceled.');
      const capability = await this.options.requestCapability(sessionId);
      if (this.capture !== capture) throw new Error('Audio capture was canceled.');
      await transport.start(capability);
      if (this.capture !== capture) throw new Error('Audio capture was canceled.');
      await capture.startProcessing();
      if (this.capture !== capture) throw new Error('Audio capture was canceled.');
    } catch (error) {
      if (this.capture === capture) this.capture = undefined;
      if (this.transport === transport) this.transport = undefined;
      transport.cancel();
      await capture.stop();
      throw error;
    } finally {
      this.connecting = false;
    }
  }

  /** Keep the provider session alive, but replace captured PCM with silence. */
  pause(): Promise<void> {
    if (!this.capture || !this.transport) {
      return Promise.reject(new Error('No active transcription stream is available to pause.'));
    }
    this.paused = true;
    return Promise.resolve();
  }

  /** Resume real PCM on the existing capture and provider connection. */
  resume(): Promise<void> {
    if (!this.capture || !this.transport) {
      return Promise.reject(new Error('No paused transcription stream is available to resume.'));
    }
    this.paused = false;
    return Promise.resolve();
  }

  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    this.stopping = this.stopActive();
    return this.stopping;
  }

  private async stopActive(): Promise<void> {
    const capture = this.capture;
    const transport = this.transport;
    this.capture = undefined;
    try {
      // Processing must flush before the provider end frame. Media tracks are
      // released only after that epoch has closed.
      await capture?.pauseProcessing();
      this.transport = undefined;
      await transport?.stop();
      await capture?.stop();
    } finally {
      this.paused = false;
      this.transport = undefined;
      this.stopping = undefined;
    }
  }

  private abortAfterFailure(): Promise<void> {
    if (this.aborting) return this.aborting;
    this.aborting = this.abortActive();
    return this.aborting;
  }

  private async abortActive(): Promise<void> {
    const capture = this.capture;
    const transport = this.transport;
    this.capture = undefined;
    this.transport = undefined;
    this.paused = false;
    transport?.cancel();
    try {
      await capture?.stop();
    } finally {
      this.aborting = undefined;
    }
  }
}
