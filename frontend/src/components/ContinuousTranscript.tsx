import { composeTranscriptBlocks } from '../lib/continuousTranscript';
import { useEffect, useRef, useState } from 'react';
import type { CaptionView } from '../lib/viewModels';
import { formatClock } from '../lib/viewModels';
import './continuousTranscript.css';

interface Props {
  captions: readonly CaptionView[];
  active?: boolean;
  context?: 'live' | 'history';
  simulated?: boolean;
}

function stateLabel(phase: ReturnType<typeof composeTranscriptBlocks>[number]['phase']): string {
  switch (phase) {
    case 'save-acknowledged':
      return 'Saved';
    case 'saving':
      return 'Saving…';
    case 'save-failed':
      return 'Save failed';
    case 'final-observed':
      return 'Final text awaiting save';
    default:
      return 'Listening…';
  }
}

export function ContinuousTranscript({
  captions,
  active = false,
  context = 'live',
  simulated = false,
}: Props) {
  const blocks = composeTranscriptBlocks(captions);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [followLatest, setFollowLatest] = useState(true);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !followLatest) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, [captions, active, followLatest]);

  const updateFollowState = (): void => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const distanceFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    setFollowLatest(distanceFromBottom < 48);
  };

  const jumpToLatest = (): void => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
    setFollowLatest(true);
  };

  if (blocks.length === 0) {
    return (
      <div className="transcript-scroll-shell">
        <div className="transcript-scroll-region" ref={scrollRef}>
          <div className="transcript-document-empty">
            <strong>{active ? 'Listening for speech…' : 'Your transcript will appear here'}</strong>
            <span>Final text stays together as one readable document until you pause.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="transcript-scroll-shell">
      <div className="transcript-scroll-region" ref={scrollRef} onScroll={updateFollowState}>
        <article className="transcript-document" aria-label="Formatted transcript document">
          <header className="transcript-document-meta">
            <span>{context === 'history' ? 'Saved transcript' : 'Live transcript'}</span>
            <span>{simulated ? 'Simulated' : stateLabel(blocks.at(-1)!.phase)}</span>
          </header>
          <div className="transcript-document-body">
            {blocks.map((block, index) => (
              <div className="transcript-document-block" key={block.key}>
                {index > 0 && (
                  <div className="transcript-resume-divider">
                    <span>Resumed {formatClock(block.startMs)}</span>
                  </div>
                )}
                <p>
                  {block.finalText && <span>{block.finalText}</span>}
                  {block.partialText && (
                    <span className="transcript-inline-partial">
                      {block.finalText ? ' ' : ''}
                      {block.partialText}
                      <span className="transcript-caret" aria-hidden="true" />
                    </span>
                  )}
                </p>
              </div>
            ))}
          </div>
        </article>
      </div>
      {!followLatest && (
        <button className="transcript-latest-button" type="button" onClick={jumpToLatest}>
          Jump to latest
        </button>
      )}
    </div>
  );
}
