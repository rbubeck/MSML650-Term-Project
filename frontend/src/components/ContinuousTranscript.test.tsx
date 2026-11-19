
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CaptionView } from '../lib/viewModels';
import { ContinuousTranscript } from './ContinuousTranscript';

const captions: CaptionView[] = [
  {
    id: 'one',
    speaker: 'You',
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
    text: 'Both sources remain in separate blocks.',
    phase: 'final-observed',
  },
];

describe('ContinuousTranscript', () => {
  it('renders microphone and system audio as separate labeled transcript blocks', () => {
    const markup = renderToStaticMarkup(
      <ContinuousTranscript captions={captions} active />,
    );

    expect(markup).toContain('<strong>You</strong>');
    expect(markup).toContain('<strong>System audio</strong>');
    expect(markup).toContain('One continuous document.');
    expect(markup).toContain('Both sources remain in separate blocks.');

    expect(markup).not.toContain(
      'One continuous document. Both sources remain in separate blocks.',
    );

    expect(markup).not.toContain('Resumed');
  });
});
