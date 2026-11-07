import type { CaptionView } from '../lib/viewModels';
import { formatClock } from '../lib/viewModels';
import { joinTranscriptText, paragraphizeCaptions } from '../lib/paragraphizeCaptions';
import './transcriptParagraphs.css';

interface Props {
  captions: readonly CaptionView[];
}

function finalStatus(phase: ReturnType<typeof paragraphizeCaptions>[number]['finalPhase']): string {
  switch (phase) {
    case 'save-acknowledged':
      return 'Final text saved';
    case 'saving':
      return 'Saving final text…';
    case 'save-failed':
      return 'Save failed — retry required';
    case 'final-observed':
      return 'Final observed — not yet saved';
    default:
      return 'Live · partial';
  }
}

/** Reader-friendly paragraphs, while retaining provider segment IDs in state. */
export function TranscriptParagraphs({ captions }: Props) {
  const paragraphs = paragraphizeCaptions(captions);
  return (
    <div className="transcript-paragraph-list">
      {paragraphs.map((paragraph) => (
        <div
          className="transcript-paragraph"
          key={paragraph.key}
          role="group"
          aria-label={paragraph.speaker}
        >
          <div className="transcript-paragraph-meta">
            <strong>{paragraph.speaker}</strong>
            <time>{formatClock(paragraph.startMs)}</time>
            <span
              className={`transcript-paragraph-state state-${paragraph.finalPhase ?? 'partial'}`}
            >
              {finalStatus(paragraph.finalPhase)}
            </span>
          </div>
          <p>
            {paragraph.finals.length > 0 && (
              <span>{joinTranscriptText(paragraph.finals.map((segment) => segment.text))}</span>
            )}
            {paragraph.partial && (
              <>
                {paragraph.finals.length > 0 ? ' ' : ''}
                <em className="transcript-pending" aria-label="Live interim transcription">
                  {paragraph.partial.text.trim()}
                </em>
              </>
            )}
          </p>
        </div>
      ))}
    </div>
  );
}
