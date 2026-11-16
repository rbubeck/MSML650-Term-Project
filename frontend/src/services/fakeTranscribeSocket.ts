import {
  decodeEventStreamMessage,
  encodeEventStreamMessage,
  TranscribeStreamClient,
  type StreamClientHandlers,
  type StreamWebSocket,
} from '@live-transcription/stream-client';

/**
 * Prewritten mock captions for pipeline testing only. This intentionally does
 * not recognize speech, and it NEVER sends audio over a real network socket.
 * Emit a small, finite set so a long recording cannot flood the UI with copies
 * of the same test sentence.
 */
const SAMPLE_CAPTIONS = [
  'This is a sample of how a live meeting transcript will look.',
  'CloudScribe is receiving audio frames through the streaming client.',
  'Each completed caption is displayed with its time and audio source.',
  'This is a simulated preview, not recognition of the words being spoken.',
  'Real speech recognition will become available after AWS is configured.',
] as const;

export class FakeTranscribeSocket implements StreamWebSocket {
  binaryType: BinaryType = 'arraybuffer';
  bufferedAmount = 0;
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  private frames = 0;

  constructor() {
    queueMicrotask(() => {
      if (this.readyState !== 0) return;
      this.readyState = 1;
      this.onopen?.(new Event('open'));
    });
  }

  send(data: string | BufferSource | Blob): void {
    if (this.readyState !== 1 || !(data instanceof ArrayBuffer)) return;
    const packet = decodeEventStreamMessage(new Uint8Array(data));
    if (packet.payload.byteLength === 0) {
      queueMicrotask(() => this.close());
      return;
    }
    this.frames += 1;
    const group = Math.ceil(this.frames / 10);
    if (group > SAMPLE_CAPTIONS.length) return; // No repeating demo captions.
    if (this.frames % 10 === 5) this.emitTranscript(group, true);
    if (this.frames % 10 === 0) this.emitTranscript(group, false);
  }

  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.(new Event('close') as CloseEvent);
  }

  private emitTranscript(group: number, partial: boolean): void {
    const fullText = SAMPLE_CAPTIONS[group - 1];
    if (!fullText) return;
    // Same provider result ID for the interim and finalized version.
    const preview = fullText.slice(0, Math.max(8, Math.floor(fullText.length * 0.6))).trim();
    const frame = encodeEventStreamMessage({
      headers: {
        ':content-type': { type: 'string', value: 'application/json' },
        ':event-type': { type: 'string', value: 'TranscriptEvent' },
        ':message-type': { type: 'string', value: 'event' },
      },
      payload: new TextEncoder().encode(
        JSON.stringify({
          Transcript: {
            Results: [
              {
                ResultId: `local-${group}`,
                IsPartial: partial,
                StartTime: group - 1,
                EndTime: group,
                Alternatives: [{ Transcript: partial ? preview : fullText }],
              },
            ],
          },
        }),
      ),
    });
    queueMicrotask(() => {
      if (this.readyState === 1) {
        this.onmessage?.(new MessageEvent('message', { data: frame.slice().buffer }));
      }
    });
  }
}

export function createFakeTranscribeTransport(
  handlers: StreamClientHandlers,
): TranscribeStreamClient {
  return new TranscribeStreamClient(handlers, {
    webSocketFactory: () => new FakeTranscribeSocket(),
  });
}
