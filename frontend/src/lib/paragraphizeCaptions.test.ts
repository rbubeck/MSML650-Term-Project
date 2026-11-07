import { describe, expect, it } from 'vitest';
import { joinTranscriptText, paragraphizeCaptions } from './paragraphizeCaptions';
import type { CaptionView } from './viewModels';

const item = (
  id: string,
  text: string,
  timestampMs: number,
  phase: CaptionView['phase'] = 'final-observed',
  speaker = 'Speaker 1',
): CaptionView => ({
  id,
  text,
  timestampMs,
  phase,
  speaker,
});

describe('readable transcript paragraphs', () => {
  it('joins consecutive final results into one readable paragraph', () => {
    const paragraphs = paragraphizeCaptions([
      item('1', 'Hi there.', 0),
      item('2', 'How are you?', 1800),
      item('3', 'Can you record me?', 4300),
    ]);
    expect(paragraphs).toHaveLength(1);
    expect(joinTranscriptText(paragraphs[0]!.finals.map((s) => s.text))).toBe(
      'Hi there. How are you? Can you record me?',
    );
    expect(paragraphs[0]!.finalPhase).toBe('final-observed');
  });

  it('keeps the latest partial separate from final results', () => {
    const paragraphs = paragraphizeCaptions([
      item('a', 'Hello.', 0),
      item('b', 'How ar', 1100, 'partial'),
    ]);
    expect(paragraphs[0]!.finals.map((s) => s.id)).toEqual(['a']);
    expect(paragraphs[0]!.partial?.text).toBe('How ar');
  });

  it('replaces partial updates by result ID and ignores stale partials after a final', () => {
    const paragraphs = paragraphizeCaptions([
      item('x', 'Hel', 0, 'partial'),
      item('x', 'Hello', 0, 'partial'),
      item('x', 'Hello.', 0),
      item('x', 'Hel', 0, 'partial'),
    ]);
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]!.finals.map((s) => s.text)).toEqual(['Hello.']);
    expect(paragraphs[0]!.partial).toBeUndefined();
  });

  it('never marks a paragraph saved if any final is not acknowledged', () => {
    const p = paragraphizeCaptions([
      item('a', 'One.', 0, 'save-acknowledged'),
      item('b', 'Two.', 500, 'final-observed'),
    ]);
    expect(p[0]!.finalPhase).toBe('final-observed');
  });

  it('shows save failures ahead of less severe states', () => {
    const p = paragraphizeCaptions([
      item('a', 'One.', 0, 'save-acknowledged'),
      item('b', 'Two.', 500, 'save-failed'),
    ]);
    expect(p[0]!.finalPhase).toBe('save-failed');
  });

  it('marks saved only when every final is acknowledged', () => {
    const p = paragraphizeCaptions([
      item('a', 'One.', 0, 'save-acknowledged'),
      item('b', 'Two.', 500, 'save-acknowledged'),
    ]);
    expect(p[0]!.finalPhase).toBe('save-acknowledged');
  });

  it('starts a new paragraph for another speaker or a long pause', () => {
    const p = paragraphizeCaptions([
      item('a', 'One.', 0),
      item('b', 'Two.', 2000, 'final-observed', 'Speaker 2'),
      item('c', 'Three.', 23000, 'final-observed', 'Speaker 2'),
    ]);
    expect(p).toHaveLength(3);
  });

  it('normalizes punctuation without losing wording', () => {
    expect(joinTranscriptText(['Hello ', ' , world!', ' How are you?'])).toBe(
      'Hello, world! How are you?',
    );
  });
});
