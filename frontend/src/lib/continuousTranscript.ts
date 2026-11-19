
import type { CaptionPhase, CaptionView } from './viewModels';

export interface TranscriptBlock {
  key: string;
  speaker: string;
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

  if (finals.some((caption) => caption.phase === 'save-failed')) {
    return 'save-failed';
  }

  if (finals.some((caption) => caption.phase === 'saving')) {
    return 'saving';
  }

  if (finals.every((caption) => caption.phase === 'save-acknowledged')) {
    return 'save-acknowledged';
  }

  return 'final-observed';
}

/**
 * Produces transcript blocks grouped by audio source and capture period.
 *
 * Microphone speech is displayed under "You".
 * Shared audio is displayed under "System audio".
 *
 * Provider revisions are deduplicated by result ID.
 * Interim text remains inline with the current speaker's block.
 */
export function composeTranscriptBlocks(
  captions: readonly CaptionView[],
): TranscriptBlock[] {
  const byId = new Map<
    string,
    { caption: CaptionView; index: number }
  >();

  captions.forEach((caption, index) => {
    const prior = byId.get(caption.id)?.caption;

    if (
      prior &&
      prior.phase !== 'partial' &&
      caption.phase === 'partial'
    ) {
      return;
    }

    byId.set(caption.id, { caption, index });
  });

  const ordered = [...byId.values()].sort(
    (left, right) =>
      (left.caption.streamEpoch ?? 0) -
        (right.caption.streamEpoch ?? 0) ||
      left.caption.timestampMs - right.caption.timestampMs ||
      left.index - right.index,
  );

  const groups: CaptionView[][] = [];

  for (const { caption } of ordered) {
    const previous = groups[groups.length - 1];
    const previousCaption = previous?.[0];

    if (
      previous &&
      previousCaption &&
      (previousCaption.streamEpoch ?? 0) ===
        (caption.streamEpoch ?? 0) &&
      previousCaption.speaker === caption.speaker
    ) {
      previous.push(caption);
    } else {
      groups.push([caption]);
    }
  }

  return groups.map((group, index) => {
    const finals = group.filter(
      (caption) => caption.phase !== 'partial',
    );

    const partials = group.filter(
      (caption) => caption.phase === 'partial',
    );

    const first = group[0]!;

    return {
      key: `speaker-${first.streamEpoch ?? 0}-${index}`,
      speaker: first.speaker,
      streamEpoch: first.streamEpoch ?? 0,
      startMs: first.timestampMs,
      finalText: joinTranscriptText(
        finals.map((caption) => caption.text),
      ),
      partialText: joinTranscriptText(
        partials.map((caption) => caption.text),
      ),
      phase: blockPhase(finals),
    };
  });
}
