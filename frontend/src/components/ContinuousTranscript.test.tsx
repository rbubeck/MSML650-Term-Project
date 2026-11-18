import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CaptionView } from '../lib/viewModels';
import { ContinuousTranscript } from './ContinuousTranscript';

const captions: CaptionView[] = [
  {
    id: 'one',
    speaker: 'Microphone',
    timestampMs: 0,
    streamEpoch: 1,
    text: 'One continuous document.',
    phase: 'final-observed',
  },
  {
    id: 'two',
    speaker: 'System audio',
    timestampMs: 500,
    streamEpoch: 1,
    text: 'Both sources remain in the same writing.',
    phase: 'final-observed',
  },
];

describe('ContinuousTranscript', () => {
  it('renders source results as one document instead of caption cards', () => {
    const markup = renderToStaticMarkup(<ContinuousTranscript captions={captions} active />);

    expect(markup).toContain('One continuous document. Both sources remain in the same writing.');
    expect(markup).not.toContain('Microphone</strong>');
    expect(markup).not.toContain('System audio</strong>');
  });
});
