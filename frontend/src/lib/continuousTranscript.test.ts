import { describe, expect, it } from 'vitest';
import type { CaptionView } from './viewModels';
import { composeTranscriptBlocks, joinTranscriptText } from './continuousTranscript';

function caption(
  id: string,
  text: string,
  timestampMs: number,
  streamEpoch: number,
  phase: CaptionView['phase'] = 'final-observed',
): CaptionView {
  return { id, text, timestampMs, streamEpoch, phase, speaker: 'System audio' };
}

describe('continuous transcript formatting', () => {
  it('keeps every final in one writing block until capture is paused', () => {
    const blocks = composeTranscriptBlocks([
      caption('1', 'first sentence.', 0, 1),
      caption('2', 'second sentence.', 2_000, 1),
      caption('3', 'third sentence.', 30_000, 1),
    ]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.finalText).toBe('First sentence. second sentence. third sentence.');
  });

  it('starts a new block only for a new capture period after pause or reconnect', () => {
    const blocks = composeTranscriptBlocks([
      caption('1', 'before pause.', 0, 1),
      caption('2', 'after resume.', 0, 2),
    ]);

    expect(blocks.map((block) => block.finalText)).toEqual(['Before pause.', 'After resume.']);
  });

  it('replaces interim revisions and keeps partial text inline after finals', () => {
    const blocks = composeTranscriptBlocks([
      caption('1', 'completed sentence.', 0, 1),
      caption('2', 'work', 1_000, 1, 'partial'),
      caption('2', 'working phrase', 1_000, 1, 'partial'),
    ]);

    expect(blocks[0]?.finalText).toBe('Completed sentence.');
    expect(blocks[0]?.partialText).toBe('Working phrase');
  });

  it('formats spacing lightly without rewriting recognized wording', () => {
    expect(joinTranscriptText(['hello ', ' , world!', ' next sentence.'])).toBe(
      'Hello, world! next sentence.',
    );
  });
});
