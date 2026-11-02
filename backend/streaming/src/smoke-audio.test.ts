import { describe, expect, it } from 'vitest';
import { AUDIO_PCM_BYTES_PER_FRAME } from '@live-transcription/contracts';
import {
  extractPcmFromWave,
  loadSmokePcm,
  padFinalPcmFrame,
  UnsupportedSmokeAudioError,
} from './smoke-audio.js';

function waveFile(pcm: Uint8Array, sampleRate = 16_000): Uint8Array {
  const bytes = new Uint8Array(44 + pcm.byteLength);
  const view = new DataView(bytes.buffer);
  const writeText = (offset: number, value: string): void => {
    bytes.set(Buffer.from(value, 'ascii'), offset);
  };
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, pcm.byteLength, true);
  bytes.set(pcm, 44);
  return bytes;
}

describe('smoke audio input', () => {
  it('extracts PCM data from a contract-compatible WAVE file', () => {
    const pcm = Uint8Array.from([1, 2, 3, 4]);
    expect(extractPcmFromWave(waveFile(pcm))).toEqual(pcm);
  });

  it('rejects WAVE audio with the wrong sample rate', () => {
    expect(() => extractPcmFromWave(waveFile(new Uint8Array(4), 48_000))).toThrow(
      'WAVE input must be mono 16-bit PCM at 16,000 Hz.',
    );
  });

  it('passes raw PCM through and rejects unknown containers', () => {
    const pcm = Uint8Array.from([1, 2]);
    expect(loadSmokePcm('sample.pcm', pcm)).toBe(pcm);
    expect(() => loadSmokePcm('sample.mp3', pcm)).toThrow(UnsupportedSmokeAudioError);
  });

  it('zero-pads only the final short contract frame', () => {
    const short = Uint8Array.from([1, 2]);
    const padded = padFinalPcmFrame(short);
    expect(padded).toHaveLength(AUDIO_PCM_BYTES_PER_FRAME);
    expect(padded.slice(0, 2)).toEqual(short);
    expect(padded.slice(2).every((byte) => byte === 0)).toBe(true);

    const complete = new Uint8Array(AUDIO_PCM_BYTES_PER_FRAME);
    expect(padFinalPcmFrame(complete)).toBe(complete);
  });
});
