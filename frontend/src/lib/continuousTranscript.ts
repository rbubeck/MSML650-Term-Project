import type { CaptionPhase, CaptionView } from './viewModels';

export interface TranscriptBlock {
  key: string;
  streamEpoch: number;
  startMs: number;
  finalText: string;
  partialText: string;
  phase: Exclude<CaptionPhase, 'partial'> | 'partial';
}

export function joinTranscriptText(texts: readonly string[]): string {
  const joined = texts
    .map((text) => text.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return joined ? joined[0]!.toLocaleUpperCase() + joined.slice(1) : '';
}

function blockPhase(finals: readonly CaptionView[]): TranscriptBlock['phase'] {
  if (finals.length === 0) return 'partial';
  if (finals.some((caption) => caption.phase === 'save-failed')) return 'save-failed';
  if (finals.some((caption) => caption.phase === 'saving')) return 'saving';
  if (finals.every((caption) => caption.phase === 'save-acknowledged')) {
    return 'save-acknowledged';
  }
  return 'final-observed';
}

/**
 * Produces one document paragraph per capture period. Provider revisions are
 * deduplicated by result ID, and interim text remains inline at the document end.
 */
export function composeTranscriptBlocks(captions: readonly CaptionView[]): TranscriptBlock[] {
  const byId = new Map<string, { caption: CaptionView; index: number }>();
  captions.forEach((caption, index) => {
    const prior = byId.get(caption.id)?.caption;
    if (prior && prior.phase !== 'partial' && caption.phase === 'partial') return;
    byId.set(caption.id, { caption, index });
  });

  const ordered = [...byId.values()].sort(
    (left, right) =>
      (left.caption.streamEpoch ?? 0) - (right.caption.streamEpoch ?? 0) ||
      left.caption.timestampMs - right.caption.timestampMs ||
      left.index - right.index,
  );
  const grouped = new Map<number, CaptionView[]>();
  for (const { caption } of ordered) {
    const epoch = caption.streamEpoch ?? 0;
    const group = grouped.get(epoch) ?? [];
    group.push(caption);
    grouped.set(epoch, group);
  }

  return [...grouped.entries()].map(([streamEpoch, group], index) => {
    const finals = group.filter((caption) => caption.phase !== 'partial');
    const partials = group.filter((caption) => caption.phase === 'partial');
    return {
      key: `capture-${streamEpoch}-${index}`,
      streamEpoch,
      startMs: group[0]?.timestampMs ?? 0,
      finalText: joinTranscriptText(finals.map((caption) => caption.text)),
      partialText: joinTranscriptText(partials.map((caption) => caption.text)),
      phase: blockPhase(finals),
    };
  });
}
