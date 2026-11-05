import { describe, expect, it } from 'vitest';

import {
  AUDIO_BINARY_MESSAGE_BYTES,
  AUDIO_CHANNELS,
  AUDIO_FRAME_DURATION_MS,
  AUDIO_FRAME_DURATION_US,
  AUDIO_FRAME_HEADER_BYTES,
  AUDIO_FRAME_VERSION,
  AUDIO_PCM_BYTES_PER_FRAME,
  AUDIO_SAMPLE_RATE_HZ,
  AUDIO_SAMPLES_PER_FRAME,
  AudioFrameValidationError,
  assertAudioFrameContinuity,
  decodeAudioFrame,
  encodeAudioFrame,
} from './audio-frame.js';

function makePcm(): Uint8Array {
  const pcm = new Uint8Array(AUDIO_PCM_BYTES_PER_FRAME);
  const view = new DataView(pcm.buffer);
  view.setInt16(0, -32_768, true);
  view.setInt16(2, 32_767, true);
  view.setInt16(4, -1234, true);
  return pcm;
}

function expectFrameError(action: () => unknown, code: string): void {
  try {
    action();
    throw new Error('Expected audio-frame validation to fail.');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(AudioFrameValidationError);
    expect((error as AudioFrameValidationError).code).toBe(code);
  }
}

describe('binary audio-frame contract', () => {
  it('fixes the v1 PCM and frame sizes', () => {
    expect(AUDIO_FRAME_VERSION).toBe(1);
    expect(AUDIO_SAMPLE_RATE_HZ).toBe(16_000);
    expect(AUDIO_CHANNELS).toBe(1);
    expect(AUDIO_FRAME_DURATION_MS).toBe(100);
    expect(AUDIO_SAMPLES_PER_FRAME).toBe(1_600);
    expect(AUDIO_PCM_BYTES_PER_FRAME).toBe(3_200);
    expect(AUDIO_FRAME_HEADER_BYTES).toBe(16);
    expect(AUDIO_BINARY_MESSAGE_BYTES).toBe(3_216);
  });

  it('encodes the header in network byte order and preserves little-endian PCM bytes', () => {
    const pcm = makePcm();
    const encoded = encodeAudioFrame({
      sequence: 0x0102_0304,
      captureStartUs: 0x0102_0304_0506_0708n,
      pcm,
    });

    expect(Array.from(encoded.slice(0, 16))).toEqual([
      1, 0, 0, 16, 1, 2, 3, 4, 1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(encoded.slice(AUDIO_FRAME_HEADER_BYTES)).toEqual(pcm);
  });

  it('round-trips an audio frame without sharing the input message buffer', () => {
    const encoded = encodeAudioFrame({ sequence: 0, captureStartUs: 0n, pcm: makePcm() });
    const decoded = decodeAudioFrame(encoded);

    expect(decoded).toEqual({ sequence: 0, captureStartUs: 0n, pcm: makePcm() });
    encoded[AUDIO_FRAME_HEADER_BYTES] = 99;
    expect(decoded.pcm[0]).not.toBe(99);
  });

  it('accepts ArrayBuffer input used by browser WebSockets', () => {
    const encoded = encodeAudioFrame({ sequence: 7, captureStartUs: 700_000n, pcm: makePcm() });
    const browserBuffer = new ArrayBuffer(encoded.byteLength);
    new Uint8Array(browserBuffer).set(encoded);
    const decoded = decodeAudioFrame(browserBuffer);

    expect(decoded.sequence).toBe(7);
    expect(decoded.captureStartUs).toBe(700_000n);
  });

  it('decodes a Uint8Array view with a non-zero offset as received by Node servers', () => {
    const encoded = encodeAudioFrame({ sequence: 8, captureStartUs: 800_000n, pcm: makePcm() });
    const transportBuffer = new Uint8Array(encoded.byteLength + 20);
    transportBuffer.set(encoded, 10);

    const decoded = decodeAudioFrame(transportBuffer.subarray(10, 10 + encoded.byteLength));

    expect(decoded.sequence).toBe(8);
    expect(decoded.captureStartUs).toBe(800_000n);
    expect(decoded.pcm).toEqual(makePcm());
  });

  it.each([0, 3_215, 3_217])('rejects a %i-byte message', (size) => {
    expectFrameError(() => decodeAudioFrame(new Uint8Array(size)), 'FRAME_SIZE_INVALID');
  });

  it('rejects an unsupported frame version', () => {
    const encoded = encodeAudioFrame({ sequence: 0, captureStartUs: 0n, pcm: makePcm() });
    encoded[0] = 2;
    expectFrameError(() => decodeAudioFrame(encoded), 'UNSUPPORTED_FRAME_VERSION');
  });

  it('rejects non-zero reserved flags', () => {
    const encoded = encodeAudioFrame({ sequence: 0, captureStartUs: 0n, pcm: makePcm() });
    encoded[1] = 1;
    expectFrameError(() => decodeAudioFrame(encoded), 'INVALID_FRAME_FLAGS');
  });

  it('rejects an incorrect header length', () => {
    const encoded = encodeAudioFrame({ sequence: 0, captureStartUs: 0n, pcm: makePcm() });
    encoded[3] = 15;
    expectFrameError(() => decodeAudioFrame(encoded), 'INVALID_HEADER_LENGTH');
  });

  it.each([-1, 1.5, 0x1_0000_0000])('rejects invalid sequence %s', (sequence) => {
    expectFrameError(
      () => encodeAudioFrame({ sequence, captureStartUs: 0n, pcm: makePcm() }),
      'INVALID_AUDIO_SEQUENCE',
    );
  });

  it('rejects timestamps outside unsigned 64-bit range', () => {
    expectFrameError(
      () => encodeAudioFrame({ sequence: 0, captureStartUs: -1n, pcm: makePcm() }),
      'INVALID_CAPTURE_TIMESTAMP',
    );
    expectFrameError(
      () =>
        encodeAudioFrame({
          sequence: 0,
          captureStartUs: 0x1_0000_0000_0000_0000n,
          pcm: makePcm(),
        }),
      'INVALID_CAPTURE_TIMESTAMP',
    );
  });

  it('rejects PCM payloads that are not exactly 100 ms', () => {
    expectFrameError(
      () => encodeAudioFrame({ sequence: 0, captureStartUs: 0n, pcm: new Uint8Array(3_198) }),
      'INVALID_PCM_LENGTH',
    );
  });

  it('accepts consecutive sequence and sample-clock positions', () => {
    expect(() =>
      assertAudioFrameContinuity(
        { sequence: 4, captureStartUs: 900_000n },
        { sequence: 5, captureStartUs: 900_000n + AUDIO_FRAME_DURATION_US },
      ),
    ).not.toThrow();
  });

  it('requires the first frame of an epoch to use sequence zero', () => {
    expect(() =>
      assertAudioFrameContinuity(null, { sequence: 0, captureStartUs: 5_000_000n }),
    ).not.toThrow();
    expectFrameError(
      () => assertAudioFrameContinuity(null, { sequence: 1, captureStartUs: 5_000_000n }),
      'AUDIO_SEQUENCE_GAP',
    );
  });

  it('rejects duplicate, missing, and reordered sequences', () => {
    for (const sequence of [4, 6, 3]) {
      expectFrameError(
        () =>
          assertAudioFrameContinuity(
            { sequence: 4, captureStartUs: 900_000n },
            { sequence, captureStartUs: 1_000_000n },
          ),
        'AUDIO_SEQUENCE_GAP',
      );
    }
  });

  it('rejects a capture timestamp that is not one frame after the previous frame', () => {
    expectFrameError(
      () =>
        assertAudioFrameContinuity(
          { sequence: 4, captureStartUs: 900_000n },
          { sequence: 5, captureStartUs: 1_000_001n },
        ),
      'AUDIO_TIMESTAMP_GAP',
    );
  });

  it('represents 100 ms of silence as exactly 3,200 zero bytes', () => {
    const silence = new Uint8Array(AUDIO_PCM_BYTES_PER_FRAME);
    const decoded = decodeAudioFrame(
      encodeAudioFrame({ sequence: 0, captureStartUs: 0n, pcm: silence }),
    );

    expect(decoded.pcm).toHaveLength(3_200);
    expect(decoded.pcm.every((sampleByte) => sampleByte === 0)).toBe(true);
  });
});
