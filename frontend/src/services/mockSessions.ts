import type { CaptionView, SessionView } from '../lib/viewModels';

/** Deliberately memory-only, fake-backed. No browser storage of raw audio or transcript text. */
const sampleText: Array<[string, string]> = [
  ['Speaker 1', 'Welcome, everyone. Today we are reviewing our cloud transcription project.'],
  ['Speaker 2', 'We should connect the React frontend to Cognito and the session API first.'],
  ['Speaker 1', 'The browser will capture audio and a shared client will handle streaming.'],
  ['Speaker 2', 'Then we can measure latency and ensure final captions are actually saved.'],
];

function makeCaption(text: string, speaker: string, index: number): CaptionView {
  return {
    id: `demo-segment-${index}`,
    speaker,
    text,
    timestampMs: index * 4_800,
    phase: 'save-acknowledged',
  };
}

const initial: SessionView[] = [
  {
    id: 'demo-architecture',
    title: 'AWS Architecture Review',
    createdAt: '2026-11-05T14:35:00.000Z',
    durationSeconds: 250,
    language: 'English (US)',
    captions: sampleText.map(([speaker, text], index) => makeCaption(text, speaker, index)),
  },
  {
    id: 'demo-standup',
    title: 'Weekly Project Standup',
    createdAt: '2026-11-04T16:00:00.000Z',
    durationSeconds: 480,
    language: 'English (US)',
    captions: [
      makeCaption(
        'We finished the first UI prototype and discussed the AWS contracts.',
        'Speaker 1',
        0,
      ),
      makeCaption(
        'Our next step is to test the streaming client with controlled audio.',
        'Speaker 2',
        1,
      ),
    ],
  },
  {
    id: 'demo-captions',
    title: 'Caption Quality Discussion',
    createdAt: '2026-11-03T12:15:00.000Z',
    durationSeconds: 165,
    language: 'English (US)',
    captions: [
      makeCaption('Partial captions are not the same as final saved results.', 'Speaker 1', 0),
    ],
  },
];

export class MockSessionStore {
  private sessions: SessionView[] = initial.map((session) => ({
    ...session,
    captions: session.captions.map((caption) => ({ ...caption })),
  }));

  list(): SessionView[] {
    return [...this.sessions];
  }

  get(id: string): SessionView | undefined {
    return this.sessions.find((session) => session.id === id);
  }

  create(): SessionView {
    const session: SessionView = {
      id: `demo-${crypto.randomUUID()}`,
      title: 'Untitled live session',
      createdAt: new Date().toISOString(),
      durationSeconds: 0,
      language: 'English (US)',
      captions: [],
    };
    this.sessions.unshift(session);
    return session;
  }

  rename(id: string, name: string): void {
    const session = this.get(id);
    if (session) session.title = name.trim().slice(0, 80) || session.title;
  }

  saveCaption(id: string, caption: CaptionView): void {
    const session = this.get(id);
    if (!session) return;
    const previous = session.captions.findIndex((segment) => segment.id === caption.id);
    if (previous >= 0) session.captions[previous] = caption;
    else session.captions.push(caption);
  }

  delete(id: string): void {
    this.sessions = this.sessions.filter((session) => session.id !== id);
  }
}

export function exportDemoTranscript(session: SessionView): void {
  const content = [
    session.title,
    `Language: ${session.language}`,
    '',
    ...session.captions
      .filter((segment) => segment.phase === 'save-acknowledged')
      .map(
        (segment) =>
          `${segment.speaker} [${Math.floor(segment.timestampMs / 1_000)}s] ${segment.text}`,
      ),
  ].join('\n');
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${session.title.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}
