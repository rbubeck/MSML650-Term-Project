import {
  TranscribeStreamClient,
  type AudioBytes,
  type StreamClientHandlers,
  type StreamStartOptions,
} from '@live-transcription/stream-client';
import { MicrophoneCapture, type CaptureStatus, type PcmChunk } from '../audio/microphone';
import type { StreamUIAdapter, StreamUIHandlers } from './streamPort';

export interface StreamTransport {
  start(options: StreamStartOptions): Promise<void>;
  sendAudio(audio: AudioBytes): boolean;
  stop(): Promise<void>;
  cancel(): void;
}

export interface PcmCapture {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export type StreamCapabilityProvider = (sessionId: string) => Promise<StreamStartOptions>;
export type StreamTransportFactory = (handlers: StreamClientHandlers) => StreamTransport;
export type PcmCaptureFactory = (
  onChunk: (chunk: PcmChunk) => void,
  onStatus: (status: CaptureStatus) => void,
) => PcmCapture;

export interface DirectStreamAdapterOptions {
  readonly requestCapability: StreamCapabilityProvider;
  readonly createTransport?: StreamTransportFactory;
  readonly createCapture?: PcmCaptureFactory;
  readonly onCaptureStatus?: (status: CaptureStatus) => void;
}

/**
 * Person 1/3 integration boundary. The capability provider must return an already validated,
 * API-authorized URL and epoch; this adapter does not define or parse the HTTP response shape.
 */
export class DirectStreamAdapter implements StreamUIAdapter {
  private readonly createTransport: StreamTransportFactory;
  private readonly createCapture: PcmCaptureFactory;
  private readonly onCaptureStatus: (status: CaptureStatus) => void;
  private transport: StreamTransport | undefined;
  private capture: PcmCapture | undefined;
  private starting = false;
  private stopping: Promise<void> | undefined;
  private aborting: Promise<void> | undefined;

  constructor(private readonly options: DirectStreamAdapterOptions) {
    this.createTransport =
      options.createTransport ?? ((handlers) => new TranscribeStreamClient(handlers));
    this.createCapture =
      options.createCapture ?? ((onChunk, onStatus) => new MicrophoneCapture(onChunk, onStatus));
    this.onCaptureStatus = options.onCaptureStatus ?? (() => undefined);
  }

  async start(sessionId: string, handlers: StreamUIHandlers): Promise<void> {
    if (this.starting || this.transport || this.capture) {
      throw new Error('The live stream is already active.');
    }
    this.starting = true;
    let failureSeen = false;
    const transport = this.createTransport({
      onPartial: (result) =>
        handlers.onCaption({
          resultId: result.resultId,
          text: result.text,
          relativeStartMs: result.startMs,
          phase: 'partial',
        }),
      onFinal: (result) =>
        handlers.onCaption({
          resultId: result.resultId,
          text: result.text,
          relativeStartMs: result.startMs,
          phase: 'final-observed',
        }),
      onError: (error) => {
        failureSeen = true;
        handlers.onFailure(error.message);
        void this.abortAfterFailure();
      },
      onDisconnected: (event) => {
        if (!event.expected && !failureSeen) handlers.onDisconnected();
        if (!event.expected) void this.abortAfterFailure();
      },
    });
    this.transport = transport;

    try {
      const capability = await this.options.requestCapability(sessionId);
      await transport.start(capability);
      const capture = this.createCapture((chunk) => {
        if (this.transport === transport) transport.sendAudio(chunk.pcm);
      }, this.onCaptureStatus);
      this.capture = capture;
      await capture.start();
    } catch (error: unknown) {
      this.capture = undefined;
      this.transport = undefined;
      transport.cancel();
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
    const capture = this.capture;
    const transport = this.transport;
    this.capture = undefined;
    try {
      // Capture flushes its final padded PCM chunk before the provider end frame is sent.
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
    // Clear first so a capture flush cannot send audio after a failed provider stream.
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
