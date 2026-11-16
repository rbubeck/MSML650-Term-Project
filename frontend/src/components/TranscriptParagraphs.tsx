import { useState } from 'react';
import type { CaptionView } from '../lib/viewModels';
import { formatClock } from '../lib/viewModels';
import { joinTranscriptText, paragraphizeCaptions } from '../lib/paragraphizeCaptions';
import './transcriptParagraphs.css';

interface Props {
  captions: readonly CaptionView[];
  simulated?: boolean;
}

type ParagraphPhase = ReturnType<typeof paragraphizeCaptions>[number]['finalPhase'];

function statusLabel(phase: ParagraphPhase, simulated: boolean): string {
  switch (phase) {
    case 'save-acknowledged':
      return simulated ? 'Saved in demo' : 'Saved';
    case 'saving':
      return 'Saving...';
    case 'save-failed':
      return 'Save failed';
    case 'final-observed':
      return simulated ? 'Sample caption' : 'Final · not saved';
    default:
      return 'Listening...';
  }
}

function sourceAppearance(source: string): { initials: string; kind: string } {
  if (source === 'You' || source === 'Mic') return { initials: 'Y', kind: 'mic' };
  if (source === 'Meeting audio') return { initials: 'S', kind: 'meeting' };
  if (source === 'Mic + Meeting audio') return { initials: 'M+S', kind: 'mixed' };
  return { initials: '●', kind: 'other' };
}

/** Readable, timestamped transcript turns. Provider result IDs and phases stay unchanged. */
export function TranscriptParagraphs({ captions, simulated = false }: Props) {
  const [sourceFilter, setSourceFilter] = useState<'all' | 'you' | 'meeting'>('all');
  const hasYou = captions.some((item) => item.speaker === 'You');
  const hasMeeting = captions.some((item) => item.speaker === 'Meeting audio');
  const filteredCaptions = captions.filter(
    (item) =>
      sourceFilter === 'all' ||
      (sourceFilter === 'you' && item.speaker === 'You') ||
      (sourceFilter === 'meeting' && item.speaker === 'Meeting audio'),
  );
  const paragraphs = paragraphizeCaptions(filteredCaptions);
  return (
    <div className="transcript-feed">
      <div className="transcript-feed-intro">
        <span className="transcript-feed-heading">Conversation timeline</span>
        <span className="transcript-feed-mode">
          {simulated ? 'SIMULATED · NOT SPEECH RECOGNITION' : 'LIVE TRANSCRIPTION'}
        </span>
      </div>
      {(hasYou || hasMeeting) && (
        <div
          className="transcript-source-filters"
          role="group"
          aria-label="Filter transcript by audio source"
        >
          <button
            type="button"
            aria-pressed={sourceFilter === 'all'}
            onClick={() => setSourceFilter('all')}
          >
            All sources
          </button>
          {hasYou && (
            <button
              type="button"
              aria-pressed={sourceFilter === 'you'}
              onClick={() => setSourceFilter('you')}
            >
              You
            </button>
          )}
          {hasMeeting && (
            <button
              type="button"
              aria-pressed={sourceFilter === 'meeting'}
              onClick={() => setSourceFilter('meeting')}
            >
              Meeting audio
            </button>
          )}
        </div>
      )}
      {simulated && (
        <p className="transcript-demo-note">
          These captions are predefined examples triggered by incoming audio frames. They are not
          the words spoken into your microphone or by meeting participants.
        </p>
      )}
      <div className="transcript-paragraph-list">
        {paragraphs.map((paragraph) => {
          const source = sourceAppearance(paragraph.speaker);
          const phase = paragraph.finalPhase;
          return (
            <div
              className={`transcript-paragraph transcript-source-${source.kind}`}
              key={paragraph.key}
              role="group"
              aria-label={`${paragraph.speaker} at ${formatClock(paragraph.startMs)}`}
            >
              <div className="transcript-source-avatar" aria-hidden="true">
                {source.initials}
              </div>
              <div className="transcript-paragraph-content">
                <div className="transcript-paragraph-meta">
                  <strong>{paragraph.speaker}</strong>
                  <time>{formatClock(paragraph.startMs)}</time>
                  <span className={`transcript-paragraph-state state-${phase ?? 'partial'}`}>
                    {statusLabel(phase, simulated)}
                  </span>
                </div>
                {paragraph.finals.length > 0 && (
                  <p className="transcript-final-text">
                    {joinTranscriptText(paragraph.finals.map((segment) => segment.text))}
                  </p>
                )}
                {paragraph.partial && (
                  <p className="transcript-pending" aria-label="Live interim transcription">
                    {paragraph.partial.text.trim()}
                    <span className="transcript-typing-indicator" aria-hidden="true" />
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
