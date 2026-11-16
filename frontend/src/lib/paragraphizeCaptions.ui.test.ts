import { describe, expect, it } from 'vitest';
import { paragraphizeCaptions } from './paragraphizeCaptions';
import type { CaptionView } from './viewModels';

const caption = (
  n: number,
  phase: CaptionView['phase'] = 'final-observed',
  speaker = 'Mic',
): CaptionView => ({
  id: `epoch-1:${n}`,
  speaker,
  timestampMs: n * 1000,
  text: `A distinct caption ${n} for a live transcript.`,
  phase,
});

describe('conversation timeline grouping', () => {
  it('keeps a long sequence of results in short, readable turns', () => {
    const result = paragraphizeCaptions(Array.from({ length: 15 }, (_, i) => caption(i)));
    expect(result.length).toBeGreaterThan(1);
    expect(result.every((item) => item.finals.length <= 3)).toBe(true);
    expect(result.flatMap((item) => item.finals).map((c) => c.id)).toEqual(
      Array.from({ length: 15 }, (_, i) => `epoch-1:${i}`),
    );
  });

  it('shows the interim result only once and replaces it with the final revision', () => {
    const result = paragraphizeCaptions([
      { ...caption(0, 'partial'), text: 'Thi' },
      { ...caption(0, 'partial'), text: 'This is' },
      caption(0),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.partial).toBeUndefined();
    expect(result[0]?.finals).toHaveLength(1);
  });
});
