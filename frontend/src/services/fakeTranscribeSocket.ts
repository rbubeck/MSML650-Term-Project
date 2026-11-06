import {
  decodeEventStreamMessage,
  encodeEventStreamMessage,
  TranscribeStreamClient,
  type StreamClientHandlers,
  type StreamWebSocket,
} from '@live-transcription/stream-client';
import { DirectStreamAdapter } from './directStreamAdapter';
import type { CaptureStatus } from '../audio/microphone';

const encoder = new TextEncoder();

/** Local-only provider simulation. It proves PCM routing, not speech recognition or AWS access. */
export class FakeTranscribeSocket implements StreamWebSocket {
  binaryType: BinaryType = 'arraybuffer';
  bufferedAmount = 0;
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  private audioFrameCount = 0;

  constructor() {
    queueMicrotask(() => {
      if (this.readyState !== 0) return;
      this.readyState = 1;
      this.onopen?.(new Event('open'));
    });
  }

  send(data: string | BufferSource | Blob): void {
    if (this.readyState !== 1 || !(data instanceof ArrayBuffer)) return;
    const message = decodeEventStreamMessage(new Uint8Array(data));
    if (message.payload.byteLength === 0) {
      queueMicrotask(() => this.close());
      return;
    }
    this.audioFrameCount += 1;
    const position = this.audioFrameCount % 10;
    if (position === 5) this.emitTranscript(true);
    if (position === 0) this.emitTranscript(false);
  }

  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.(new Event('close') as CloseEvent);
  }

  private emitTranscript(isPartial: boolean): void {
    const resultNumber = Math.ceil(this.audioFrameCount / 10);
    const frame = encodeEventStreamMessage({
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
                ResultId: `local-fake-${resultNumber}`,
                IsPartial: isPartial,
                StartTime: (resultNumber - 1) * 1,
                EndTime: resultNumber * 1,
                Alternatives: [
                  {
                    Transcript: isPartial
                      ? 'Microphone PCM reached the local stream…'
                      : 'Microphone PCM reached the local stream client.',
                  },
                ],
              },
            ],
          },
        }),
      ),
    });
    queueMicrotask(() => {
      if (this.readyState !== 1) return;
      this.onmessage?.(new MessageEvent('message', { data: frame.slice().buffer }));
    });
  }
}

function createFakeTransport(handlers: StreamClientHandlers): TranscribeStreamClient {
  return new TranscribeStreamClient(handlers, {
    webSocketFactory: () => new FakeTranscribeSocket(),
  });
}

export function createLocalStreamingAdapter(
  onCaptureStatus: (status: CaptureStatus) => void,
): DirectStreamAdapter {
  return new DirectStreamAdapter({
    requestCapability: async () => ({
      url: 'wss://local-fake.invalid/stream-transcription-websocket',
      streamEpoch: 1,
    }),
    createTransport: createFakeTransport,
    onCaptureStatus,
  });
}
