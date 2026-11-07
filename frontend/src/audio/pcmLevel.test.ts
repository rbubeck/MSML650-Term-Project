import { describe, expect, it } from 'vitest';
import { pcmRmsLevel } from './pcmLevel';

function makePcm(samples: number[]): ArrayBuffer {
  const bytes = new ArrayBuffer(samples.length * 2);
  const view = new DataView(bytes);
  for (const [index, sample] of samples.entries()) {
    view.setInt16(index * 2, sample, true);
  }
  return bytes;
}

describe('PCM microphone level meter', () => {
  it('reports zero for silence and an empty final buffer', () => {
    expect(pcmRmsLevel(makePcm([0, 0, 0]), 3)).toBe(0);
    expect(pcmRmsLevel(makePcm([0, 0]), 0)).toBe(0);
  });

  it('handles positive and negative signed little-endian audio', () => {
    expect(pcmRmsLevel(makePcm([16384, -16384]), 2)).toBeCloseTo(0.5, 5);
    expect(pcmRmsLevel(makePcm([-32768, -32768]), 2)).toBe(1);
  });

  it('ignores padding in a short final 100 ms PCM packet', () => {
    expect(pcmRmsLevel(makePcm([16384, 16384, 0, 0, 0, 0]), 2)).toBeCloseTo(0.5, 5);
  });

  it('rejects invalid validSamples before inspecting the packet', () => {
    const bytes = makePcm([1, 2]);
    expect(() => pcmRmsLevel(bytes, -1)).toThrow(RangeError);
    expect(() => pcmRmsLevel(bytes, 3)).toThrow(RangeError);
    expect(() => pcmRmsLevel(bytes, 1.5)).toThrow(RangeError);
  });
});
