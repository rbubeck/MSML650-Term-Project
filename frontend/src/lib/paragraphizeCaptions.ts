import type { CaptionPhase, CaptionView } from './viewModels';

/** Presentation-only grouping; transcript result IDs and save states remain untouched. */
export interface TranscriptParagraph {
  key: string;
  speaker: string;
  startMs: number;
  finals: CaptionView[];
  partial: CaptionView | undefined;
  finalPhase: Exclude<CaptionPhase, 'partial'> | undefined;
}

const NEW_PARAGRAPH_GAP_MS = 18_000;
const MAX_PARAGRAPH_CHARACTERS = 900;

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
  // Even one unacknowledged final prevents a misleading "Saved" label.
  return 'final-observed';
}

export function paragraphizeCaptions(captions: readonly CaptionView[]): TranscriptParagraph[] {
  // Keep only the newest state per provider result ID. An older partial must not
  // replace a final result if events are received out of order.
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
  let lastEndMs = 0;
  let currentLength = 0;

  for (const { caption } of ordered) {
    if (!caption.text.trim()) continue;
    const gap = caption.timestampMs - lastEndMs;
    if (
      !current ||
      caption.speaker !== current.speaker ||
      gap >= NEW_PARAGRAPH_GAP_MS ||
      (currentLength >= MAX_PARAGRAPH_CHARACTERS && current.finals.length > 0)
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
      // A single result ID gets revised during streaming. Keep interim words
      // distinct from finals, and never treat them as durable.
      current.partial = caption;
    } else {
      current.finals.push(caption);
      current.finalPhase = finalPhase(current.finals);
      currentLength += caption.text.trim().length + 1;
    }
    lastEndMs = Math.max(lastEndMs, caption.timestampMs);
  }
  return result;
}
