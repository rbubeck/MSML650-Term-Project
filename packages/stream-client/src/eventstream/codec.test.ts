import { describe, expect, it } from 'vitest';
import { EventStreamDecodeError } from '../errors.js';
import { decodeEventStreamMessage, encodeEventStreamMessage } from './codec.js';
import { crc32 } from './crc32.js';

const encoder = new TextEncoder();

function expectDecodeError(code: EventStreamDecodeError['code'], operation: () => unknown): void {
  try {
    operation();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(EventStreamDecodeError);
    expect((error as EventStreamDecodeError).code).toBe(code);
    return;
  }
  throw new Error(`Expected EventStreamDecodeError ${code}.`);
}

describe('AWS EventStream codec', () => {
  it('matches the standard CRC32 check vector', () => {
    expect(crc32(encoder.encode('123456789'))).toBe(0xcbf43926);
  });

  it('round-trips every EventStream header type and payload bytes', () => {
    const uuid = Uint8Array.from({ length: 16 }, (_value, index) => index);
    const encoded = encodeEventStreamMessage({
      headers: {
        true: { type: 'boolean', value: true },
        false: { type: 'boolean', value: false },
        byte: { type: 'byte', value: -12 },
        short: { type: 'short', value: -1_024 },
        integer: { type: 'integer', value: 456_789 },
        long: { type: 'long', value: -9_007_199_254_740_991n },
        bytes: { type: 'byte-array', value: Uint8Array.of(0, 1, 255) },
        string: { type: 'string', value: 'Transcript ✓' },
        timestamp: { type: 'timestamp', value: 1_700_000_000_000n },
        uuid: { type: 'uuid', value: uuid },
      },
      payload: Uint8Array.of(8, 6, 7, 5, 3, 0, 9),
    });

    const decoded = decodeEventStreamMessage(encoded);
    expect(decoded.payload).toEqual(Uint8Array.of(8, 6, 7, 5, 3, 0, 9));
    expect(decoded.headers['true']).toEqual({ type: 'boolean', value: true });
    expect(decoded.headers['false']).toEqual({ type: 'boolean', value: false });
    expect(decoded.headers['byte']).toEqual({ type: 'byte', value: -12 });
    expect(decoded.headers['short']).toEqual({ type: 'short', value: -1_024 });
    expect(decoded.headers['integer']).toEqual({ type: 'integer', value: 456_789 });
    expect(decoded.headers['long']).toEqual({ type: 'long', value: -9_007_199_254_740_991n });
    expect(decoded.headers['bytes']).toEqual({
      type: 'byte-array',
      value: Uint8Array.of(0, 1, 255),
    });
    expect(decoded.headers['string']).toEqual({ type: 'string', value: 'Transcript ✓' });
    expect(decoded.headers['timestamp']).toEqual({
      type: 'timestamp',
      value: 1_700_000_000_000n,
    });
    expect(decoded.headers['uuid']).toEqual({ type: 'uuid', value: uuid });
  });

  it('rejects a corrupted prelude before using untrusted lengths', () => {
    const encoded = encodeEventStreamMessage({ headers: {}, payload: Uint8Array.of(1) });
    encoded[8] = encoded[8]! ^ 0xff;
    expectDecodeError('PRELUDE_CRC_MISMATCH', () => decodeEventStreamMessage(encoded));
  });

  it('rejects a corrupted message body', () => {
    const encoded = encodeEventStreamMessage({ headers: {}, payload: Uint8Array.of(1, 2, 3) });
    encoded[12] = encoded[12]! ^ 0xff;
    expectDecodeError('MESSAGE_CRC_MISMATCH', () => decodeEventStreamMessage(encoded));
  });

  it('rejects a declared length that differs from the WebSocket message', () => {
    const encoded = encodeEventStreamMessage({ headers: {}, payload: Uint8Array.of(1) });
    new DataView(encoded.buffer).setUint32(0, encoded.byteLength + 1, false);
    expectDecodeError('LENGTH_MISMATCH', () => decodeEventStreamMessage(encoded));
  });

  it('enforces a caller-selected message size bound', () => {
    const encoded = encodeEventStreamMessage({ headers: {}, payload: new Uint8Array(20) });
    expectDecodeError('MESSAGE_TOO_LARGE', () =>
      decodeEventStreamMessage(encoded, { maximumMessageBytes: 16 }),
    );
  });
});
