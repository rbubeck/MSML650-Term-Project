/**
 * Measure the RMS amplitude of signed 16-bit little-endian mono PCM.
 * The returned level is between 0 (silence) and 1 (full-scale RMS).
 * No audio is saved, logged, or transmitted by this helper.
 */
export function pcmRmsLevel(pcm: ArrayBuffer, validSamples: number): number {
  const availableSamples = pcm.byteLength / 2;
  if (!Number.isInteger(validSamples) || validSamples < 0 || validSamples > availableSamples) {
    throw new RangeError('Invalid PCM sample count');
  }
  if (validSamples === 0) return 0;

  const view = new DataView(pcm);
  let squaredSum = 0;
  for (let i = 0; i < validSamples; i++) {
    const sample = view.getInt16(i * 2, true) / 32768;
    squaredSum += sample * sample;
  }
  return Math.min(1, Math.sqrt(squaredSum / validSamples));
}
