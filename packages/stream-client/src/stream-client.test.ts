import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeEventStreamMessage, encodeEventStreamMessage } from './eventstream/codec.js';
import {
  TranscribeStreamClient,
  type StreamClientError,
  type StreamConnectionState,
  type StreamResult,
  type StreamWebSocket,
} from './stream-client.js';

const encoder = new TextEncoder();

class FakeWebSocket implements StreamWebSocket {
  binaryType: BinaryType = 'blob';
  bufferedAmount = 0;
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  readonly sent: Uint8Array[] = [];
  readonly closeCodes: number[] = [];

  open(): void {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  send(data: string | BufferSource | Blob): void {
    if (!(data instanceof ArrayBuffer)) throw new Error('Expected browser ArrayBuffer data.');
    this.sent.push(new Uint8Array(data).slice());
  }

  close(code = 1000): void {
    if (this.readyState === 3) return;
    this.closeCodes.push(code);
    this.readyState = 3;
    this.onclose?.(new Event('close') as CloseEvent);
  }

  serverClose(): void {
    this.readyState = 3;
    this.onclose?.(new Event('close') as CloseEvent);
  }

  receive(frame: Uint8Array): void {
    this.onmessage?.(new MessageEvent('message', { data: frame.slice().buffer }));
  }
}

interface Harness {
  readonly client: TranscribeStreamClient;
  readonly sockets: FakeWebSocket[];
  readonly states: StreamConnectionState[];
  readonly partials: StreamResult[];
  readonly finals: StreamResult[];
  readonly errors: StreamClientError[];
  readonly disconnects: Array<{ readonly streamEpoch: number; readonly expected: boolean }>;
}

function createHarness(
  options: {
    readonly maximumBufferedAmount?: number;
    readonly maximumQueuedBytes?: number;
    readonly drainIntervalMs?: number;
    readonly connectTimeoutMs?: number;
    readonly stopTimeoutMs?: number;
  } = {},
): Harness {
  const sockets: FakeWebSocket[] = [];
  const states: StreamConnectionState[] = [];
  const partials: StreamResult[] = [];
  const finals: StreamResult[] = [];
  const errors: StreamClientError[] = [];
  const disconnects: Array<{ readonly streamEpoch: number; readonly expected: boolean }> = [];
  const client = new TranscribeStreamClient(
    {
      onStateChange: (state) => states.push(state),
      onPartial: (result) => partials.push(result),
      onFinal: (result) => finals.push(result),
      onError: (error) => errors.push(error),
      onDisconnected: (event) => disconnects.push(event),
    },
    {
      ...options,
      webSocketFactory: () => {
        const socket = new FakeWebSocket();
        sockets.push(socket);
        return socket;
      },
    },
  );
  return { client, sockets, states, partials, finals, errors, disconnects };
}

async function open(harness: Harness, streamEpoch = 1): Promise<FakeWebSocket> {
  const opening = harness.client.start({
    url: 'wss://transcribestreaming.us-east-1.amazonaws.com:8443/stream-transcription-websocket?safe=fake',
    streamEpoch,
  });
  const socket = harness.sockets.at(-1);
  if (!socket) throw new Error('Expected a fake socket.');
  expect(socket.binaryType).toBe('arraybuffer');
  socket.open();
  await opening;
  return socket;
}

function transcriptFrame(isPartial: boolean, resultId = 'result-1'): Uint8Array {
  return encodeEventStreamMessage({
    headers: {
      ':content-type': { type: 'string', value: 'application/json' },
      ':event-type': { type: 'string', value: 'TranscriptEvent' },
      ':message-type': { type: 'string', value: 'event' },
    },
    payload: encoder.encode(
      JSON.stringify({
        Transcript: {
          Results: [
            {
              ResultId: resultId,
              IsPartial: isPartial,
              StartTime: 0.1,
              EndTime: 0.8,
              Alternatives: [{ Transcript: isPartial ? 'hello wor' : 'hello world' }],
            },
          ],
        },
      }),
    ),
  });
}

function exceptionFrame(): Uint8Array {
  return encodeEventStreamMessage({
    headers: {
      ':content-type': { type: 'string', value: 'application/json' },
      ':exception-type': { type: 'string', value: 'LimitExceededException' },
      ':message-type': { type: 'string', value: 'exception' },
    },
    payload: encoder.encode(JSON.stringify({ Message: 'sensitive provider diagnostics' })),
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('TranscribeStreamClient', () => {
  it('opens a supplied URL, sends framed PCM, and emits epoch-scoped results', async () => {
    const harness = createHarness();
    const socket = await open(harness, 7);

    expect(harness.client.sendAudio(new Uint8Array(3_200))).toBe(true);
    const audioMessage = decodeEventStreamMessage(socket.sent[0]!);
    expect(audioMessage.headers[':event-type']).toEqual({ type: 'string', value: 'AudioEvent' });
    expect(audioMessage.payload).toHaveLength(3_200);

    socket.receive(transcriptFrame(true));
    socket.receive(transcriptFrame(false));
    expect(harness.partials).toEqual([
      {
        streamEpoch: 7,
        resultId: 'result-1',
        text: 'hello wor',
        isPartial: true,
        startMs: 100,
        endMs: 800,
      },
    ]);
    expect(harness.finals[0]).toMatchObject({ streamEpoch: 7, text: 'hello world' });
    expect(harness.states).toEqual(['connecting', 'open']);
  });

  it('queues behind a slow socket, drains accepted audio, and sends the empty end frame', async () => {
    vi.useFakeTimers();
    const harness = createHarness({ maximumBufferedAmount: 100, drainIntervalMs: 10 });
    const socket = await open(harness);
    socket.bufferedAmount = 101;

    expect(harness.client.sendAudio(new Uint8Array(3_200))).toBe(true);
    expect(harness.client.queuedAudioBytes).toBeGreaterThan(3_200);
    const stopping = harness.client.stop();
    expect(harness.client.state).toBe('stopping');

    socket.bufferedAmount = 0;
    await vi.advanceTimersByTimeAsync(10);
    expect(socket.sent).toHaveLength(2);
    expect(decodeEventStreamMessage(socket.sent[0]!).payload).toHaveLength(3_200);
    expect(decodeEventStreamMessage(socket.sent[1]!).payload).toHaveLength(0);

    socket.serverClose();
    await stopping;
    expect(harness.disconnects).toEqual([{ streamEpoch: 1, expected: true }]);
  });

  it('fails visibly instead of dropping audio or growing the queue without bound', async () => {
    const harness = createHarness({ maximumBufferedAmount: 0, maximumQueuedBytes: 3_500 });
    const socket = await open(harness);
    socket.bufferedAmount = 1;

    expect(harness.client.sendAudio(new Uint8Array(3_200))).toBe(true);
    expect(harness.client.sendAudio(new Uint8Array(3_200))).toBe(false);
    expect(harness.errors).toContainEqual({
      code: 'BUFFER_OVERFLOW',
      message: 'The connection is too slow to accept more audio.',
      retryable: true,
    });
    expect(harness.client.state).toBe('closed');
    expect(harness.disconnects).toEqual([{ streamEpoch: 1, expected: false }]);
  });

  it('uses a bounded stop deadline when the provider does not close', async () => {
    vi.useFakeTimers();
    const harness = createHarness({ stopTimeoutMs: 50 });
    const socket = await open(harness);

    const stopping = harness.client.stop();
    expect(decodeEventStreamMessage(socket.sent[0]!).payload).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(50);
    await stopping;

    expect(harness.errors.at(-1)?.code).toBe('STOP_TIMEOUT');
    expect(socket.closeCodes).toEqual([1000]);
    expect(harness.client.state).toBe('closed');
  });

  it('rejects a connection attempt that never opens within its deadline', async () => {
    vi.useFakeTimers();
    const harness = createHarness({ connectTimeoutMs: 50 });
    const opening = harness.client.start({
      url: 'wss://transcribestreaming.us-east-1.amazonaws.com:8443/stream-transcription-websocket?safe=fake',
      streamEpoch: 1,
    });
    const rejected = expect(opening).rejects.toThrow('could not be opened');

    await vi.advanceTimersByTimeAsync(50);
    await rejected;
    expect(harness.errors.map((error) => error.code)).toEqual(['CONNECTION_FAILED']);
    expect(harness.disconnects).toEqual([{ streamEpoch: 1, expected: false }]);
  });

  it('cancels a connecting stream without sending an end frame', async () => {
    const harness = createHarness();
    const opening = harness.client.start({
      url: 'wss://transcribestreaming.us-east-1.amazonaws.com:8443/stream-transcription-websocket?safe=fake',
      streamEpoch: 4,
    });
    const rejected = expect(opening).rejects.toThrow('cancelled');
    const socket = harness.sockets[0]!;

    harness.client.cancel();
    await rejected;

    expect(socket.sent).toHaveLength(0);
    expect(socket.closeCodes).toEqual([1000]);
    expect(harness.disconnects).toEqual([{ streamEpoch: 4, expected: true }]);
  });

  it('surfaces an unexpected disconnect and ignores stale-epoch messages after reconnect', async () => {
    const harness = createHarness();
    const firstSocket = await open(harness, 2);
    firstSocket.serverClose();
    expect(harness.errors.at(-1)?.code).toBe('DISCONNECTED');
    expect(harness.disconnects.at(-1)).toEqual({ streamEpoch: 2, expected: false });

    const secondSocket = await open(harness, 3);
    firstSocket.receive(transcriptFrame(false, 'stale'));
    secondSocket.receive(transcriptFrame(false, 'current'));

    expect(harness.finals.map((result) => result.resultId)).toEqual(['current']);
    expect(harness.finals[0]?.streamEpoch).toBe(3);
  });

  it('closes with a content-free error for corrupt provider frames', async () => {
    const harness = createHarness();
    const socket = await open(harness);
    const corrupt = transcriptFrame(false);
    corrupt[8] = corrupt[8]! ^ 0xff;

    socket.receive(corrupt);

    expect(harness.errors).toContainEqual({
      code: 'PROTOCOL_ERROR',
      message: 'The transcription service returned an invalid message.',
      retryable: true,
    });
    expect(harness.client.state).toBe('closed');
  });

  it('maps provider exceptions without exposing their response body', async () => {
    const harness = createHarness();
    const socket = await open(harness);

    socket.receive(exceptionFrame());

    expect(harness.errors).toEqual([
      {
        code: 'PROVIDER_REJECTED',
        message: 'The transcription service capacity limit was reached.',
        retryable: true,
      },
    ]);
    expect(JSON.stringify(harness.errors)).not.toContain('sensitive provider diagnostics');
    expect(harness.disconnects).toEqual([{ streamEpoch: 1, expected: false }]);
  });
});
