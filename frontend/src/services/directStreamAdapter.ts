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
        // The stream client emits a safe onError for buffer overflow/invalid audio.
        if (!transport.sendAudio(chunk.pcm) && !failed) {
          failed = true;
          handlers.onFailure('Audio could not be sent to the transcription stream.');
          void this.abortAfterFailure();
        }
      },
      this.options.onCaptureStatus ?? (() => undefined),
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
      // Capture.flush() must run before the provider end frame.
      await capture?.stop();
      this.transport = undefined;
      await transport?.stop();
    } finally {
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
    transport?.cancel();
    try {
      await capture?.stop();
    } finally {
      this.aborting = undefined;
    }
  }
}
