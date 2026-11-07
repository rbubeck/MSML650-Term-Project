import { describe, expect, it, vi } from 'vitest';
import type {
  AudioBytes,
  StreamClientHandlers,
  StreamStartOptions,
} from '@live-transcription/stream-client';
import type { CaptureStatus, PcmChunk } from '../audio/microphone';
import { DirectStreamAdapter, type PcmCapture, type StreamTransport } from './directStreamAdapter';

class FakeTransport implements StreamTransport {
  readonly calls: string[] = [];
  readonly audio: AudioBytes[] = [];
  startOptions: StreamStartOptions | undefined;
  cancelled = false;

  constructor(readonly handlers: StreamClientHandlers) {}

  async start(options: StreamStartOptions): Promise<void> {
    this.calls.push('transport:start');
    this.startOptions = options;
  }

  sendAudio(audio: AudioBytes): boolean {
    this.calls.push('transport:audio');
    this.audio.push(audio);
    return true;
  }

  async stop(): Promise<void> {
    this.calls.push('transport:stop');
  }

  cancel(): void {
    this.calls.push('transport:cancel');
    this.cancelled = true;
  }
}

class FakeCapture implements PcmCapture {
  readonly calls: string[] = [];
  failStart = false;

  constructor(
    private readonly onChunk: (chunk: PcmChunk) => void,
    private readonly onStatus: (status: CaptureStatus) => void,
  ) {}

  async start(): Promise<void> {
    this.calls.push('capture:start');
    if (this.failStart) throw new Error('Microphone unavailable.');
    this.onStatus({ receivedChunks: 0, sampleRate: 48_000, level: 0 });
  }

  emit(pcm = new ArrayBuffer(3_200), final = false): void {
    this.onChunk({ pcm, sequence: 0, startSample: 0, validSamples: 1_600, final });
  }

  async stop(): Promise<void> {
    this.calls.push('capture:stop');
    this.emit(new ArrayBuffer(3_200), true);
  }
}

function result(isPartial: boolean) {
  return {
    streamEpoch: 3,
    resultId: 'result-1',
    text: isPartial ? 'hello wor' : 'hello world',
    isPartial,
    startMs: 120,
    endMs: 900,
  } as const;
}

describe('DirectStreamAdapter', () => {
  it('connects before capture, routes PCM, and maps partial/final results for the UI', async () => {
    const order: string[] = [];
    let transport: FakeTransport | undefined;
    let capture: FakeCapture | undefined;
    const statuses: CaptureStatus[] = [];
    const captions: unknown[] = [];
    const adapter = new DirectStreamAdapter({
      requestCapability: async (sessionId) => {
        order.push(`capability:${sessionId}`);
        return { url: 'wss://fake.invalid/stream', streamEpoch: 3 };
      },
      createTransport: (handlers) => {
        transport = new FakeTransport(handlers);
        const originalStart = transport.start.bind(transport);
        transport.start = async (options) => {
          order.push('transport:start');
          await originalStart(options);
        };
        return transport;
      },
      createCapture: (onChunk, onStatus) => {
        capture = new FakeCapture(onChunk, onStatus);
        const originalStart = capture.start.bind(capture);
        capture.start = async () => {
          order.push('capture:start');
          await originalStart();
        };
        return capture;
      },
      onCaptureStatus: (status) => statuses.push(status),
    });

    await adapter.start('session-1', {
      onCaption: (caption) => captions.push(caption),
      onFailure: vi.fn(),
      onDisconnected: vi.fn(),
    });
    capture?.emit();
    transport?.handlers.onPartial?.(result(true));
    transport?.handlers.onFinal?.(result(false));

    expect(order).toEqual(['capability:session-1', 'transport:start', 'capture:start']);
    expect(transport?.startOptions).toEqual({ url: 'wss://fake.invalid/stream', streamEpoch: 3 });
    expect(transport?.audio).toHaveLength(1);
    expect(statuses[0]?.sampleRate).toBe(48_000);
    expect(captions).toEqual([
      {
        streamEpoch: 3,
        resultId: 'result-1',
        text: 'hello wor',
        startMs: 120,
        endMs: 900,
        phase: 'partial',
      },
      {
        streamEpoch: 3,
        resultId: 'result-1',
        text: 'hello world',
        startMs: 120,
        endMs: 900,
        phase: 'final-observed',
      },
    ]);
  });

  it('flushes capture audio before gracefully stopping the transport', async () => {
    const order: string[] = [];
    let capture: FakeCapture | undefined;
    const transport = new FakeTransport({});
    transport.sendAudio = (audio) => {
      order.push('transport:audio');
      transport.audio.push(audio);
      return true;
    };
    transport.stop = async () => {
      order.push('transport:stop');
    };
    const adapter = new DirectStreamAdapter({
      requestCapability: async () => ({ url: 'wss://fake.invalid/stream', streamEpoch: 1 }),
      createTransport: () => transport,
      createCapture: (onChunk, onStatus) => {
        capture = new FakeCapture(onChunk, onStatus);
        const originalStop = capture.stop.bind(capture);
        capture.stop = async () => {
          order.push('capture:stop');
          await originalStop();
        };
        return capture;
      },
    });
    await adapter.start('session-1', {
      onCaption: vi.fn(),
      onFailure: vi.fn(),
      onDisconnected: vi.fn(),
    });

    await adapter.stop();

    expect(order).toEqual(['capture:stop', 'transport:audio', 'transport:stop']);
    expect(transport.audio).toHaveLength(1);
  });

  it('cancels the provider stream if microphone startup fails', async () => {
    const transport = new FakeTransport({});
    const adapter = new DirectStreamAdapter({
      requestCapability: async () => ({ url: 'wss://fake.invalid/stream', streamEpoch: 1 }),
      createTransport: () => transport,
      createCapture: (onChunk, onStatus) => {
        const capture = new FakeCapture(onChunk, onStatus);
        capture.failStart = true;
        return capture;
      },
    });

    await expect(
      adapter.start('session-1', {
        onCaption: vi.fn(),
        onFailure: vi.fn(),
        onDisconnected: vi.fn(),
      }),
    ).rejects.toThrow('Microphone unavailable');
    expect(transport.cancelled).toBe(true);
  });

  it('exposes safe transport failures and only reports unexpected disconnects', async () => {
    let transport: FakeTransport | undefined;
    const onFailure = vi.fn();
    const onDisconnected = vi.fn();
    const adapter = new DirectStreamAdapter({
      requestCapability: async () => ({ url: 'wss://fake.invalid/stream', streamEpoch: 1 }),
      createTransport: (handlers) => {
        transport = new FakeTransport(handlers);
        return transport;
      },
      createCapture: (onChunk, onStatus) => new FakeCapture(onChunk, onStatus),
    });
    await adapter.start('session-1', {
      onCaption: vi.fn(),
      onFailure,
      onDisconnected,
    });

    transport?.handlers.onDisconnected?.({ streamEpoch: 1, expected: true });
    transport?.handlers.onDisconnected?.({ streamEpoch: 1, expected: false });
    transport?.handlers.onError?.({
      code: 'DISCONNECTED',
      message: 'Safe failure.',
      retryable: true,
    });
    transport?.handlers.onDisconnected?.({ streamEpoch: 1, expected: false });
    await Promise.resolve();

    expect(onFailure).toHaveBeenCalledWith('Safe failure.');
    expect(onDisconnected).toHaveBeenCalledTimes(1);
  });
});
