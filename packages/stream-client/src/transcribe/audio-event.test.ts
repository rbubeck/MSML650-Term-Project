import { describe, expect, it } from 'vitest';
import { decodeEventStreamMessage } from '../eventstream/codec.js';
import { encodeAudioEvent, encodeEndAudioEvent } from './audio-event.js';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('Amazon Transcribe WebSocket audio events', () => {
  it('encodes raw PCM with exactly the three provider headers', () => {
    const pcm = Uint8Array.of(0, 0, 255, 127, 0, 128);
    const encoded = encodeAudioEvent(pcm);
    const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);

    expect(view.getUint32(0, false)).toBe(encoded.byteLength);
    expect(view.getUint32(4, false)).toBe(88);
    expect(encoded.byteLength).toBe(104 + pcm.byteLength);

    const decoded = decodeEventStreamMessage(encoded);
    expect(decoded.headers).toEqual({
      ':content-type': { type: 'string', value: 'application/octet-stream' },
      ':event-type': { type: 'string', value: 'AudioEvent' },
      ':message-type': { type: 'string', value: 'event' },
    });
    expect(decoded.payload).toEqual(pcm);
  });

  it('encodes the provider end signal as an empty AudioEvent', () => {
    const encoded = encodeEndAudioEvent();
    const decoded = decodeEventStreamMessage(encoded);
    expect(decoded.payload).toHaveLength(0);
    expect(decoded.headers[':event-type']).toEqual({ type: 'string', value: 'AudioEvent' });
    expect(toHex(encoded)).toBe(
      '0000006800000058a9d03a230d3a636f6e74656e742d747970650700186170706c69636174696f6e2f6f637465742d73747265616d0b3a6576656e742d7479706507000a417564696f4576656e740d3a6d6573736167652d747970650700056576656e745cc64095',
    );
  });
});
