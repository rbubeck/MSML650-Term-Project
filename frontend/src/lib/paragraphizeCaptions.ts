import type { CaptionPhase, CaptionView } from './viewModels';

/** Presentation-only grouping; provider IDs, text, and persistence state remain untouched. */
export interface TranscriptParagraph {
  key: string;
  speaker: string;
  startMs: number;
  finals: CaptionView[];
  partial: CaptionView | undefined;
  finalPhase: Exclude<CaptionPhase, 'partial'> | undefined;
}

// Short, readable turns rather than a single growing block of text.
const NEW_PARAGRAPH_GAP_MS = 8_000;
const MAX_PARAGRAPH_CHARACTERS = 240;
const MAX_PARAGRAPH_FINAL_RESULTS = 3;
const MAX_PARAGRAPH_DURATION_MS = 15_000;

export function joinTranscriptText(texts: string[]): string {
  return texts
    .map((text) => text.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+([,.;!?])/g, '$1');
}

function finalPhase(finals: CaptionView[]): TranscriptParagraph['finalPhase'] {
  if (finals.length === 0) return undefined;
  if (finals.some((segment) => segment.phase === 'save-failed')) return 'save-failed';
  if (finals.some((segment) => segment.phase === 'saving')) return 'saving';
  if (finals.every((segment) => segment.phase === 'save-acknowledged')) return 'save-acknowledged';
  return 'final-observed';
}

export function paragraphizeCaptions(captions: readonly CaptionView[]): TranscriptParagraph[] {
  // A partial result is a revision, not a new utterance. Never replace a final
  // with a stale late-arriving partial.
  const byId = new Map<string, { caption: CaptionView; index: number }>();
  captions.forEach((caption, index) => {
    const prior = byId.get(caption.id)?.caption;
    if (prior && prior.phase !== 'partial' && caption.phase === 'partial') return;
    byId.set(caption.id, { caption, index });
  });

  const ordered = [...byId.values()].sort(
    (a, b) => a.caption.timestampMs - b.caption.timestampMs || a.index - b.index,
  );
  const result: TranscriptParagraph[] = [];
  let current: TranscriptParagraph | undefined;
  let lastStartMs = 0;
  let currentLength = 0;

  for (const { caption } of ordered) {
    if (!caption.text.trim()) continue;
    const gap = caption.timestampMs - lastStartMs;
    if (
      !current ||
      caption.speaker !== current.speaker ||
      gap >= NEW_PARAGRAPH_GAP_MS ||
      caption.timestampMs - current.startMs >= MAX_PARAGRAPH_DURATION_MS ||
      (current.finals.length > 0 &&
        (currentLength >= MAX_PARAGRAPH_CHARACTERS ||
          current.finals.length >= MAX_PARAGRAPH_FINAL_RESULTS))
    ) {
      current = {
        key: caption.id,
        speaker: caption.speaker,
        startMs: caption.timestampMs,
        finals: [],
        partial: undefined,
        finalPhase: undefined,
      };
      result.push(current);
      currentLength = 0;
    }
    if (caption.phase === 'partial') {
      current.partial = caption;
    } else {
      current.finals.push(caption);
      current.finalPhase = finalPhase(current.finals);
      currentLength += caption.text.trim().length + 1;
    }
    lastStartMs = Math.max(lastStartMs, caption.timestampMs);
  }
  return result;
}
