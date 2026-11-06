import { describe, expect, it } from 'vitest';
import { MockSessionStore } from './mockSessions';

describe('fake-backed session UI store', () => {
  it('creates, renames, and removes an in-memory session', () => {
    const store = new MockSessionStore();
    const created = store.create();
    expect(store.get(created.id)?.title).toBe('Untitled live session');
    store.rename(created.id, ' AWS review ');
    expect(store.get(created.id)?.title).toBe('AWS review');
    store.delete(created.id);
    expect(store.get(created.id)).toBeUndefined();
  });

  it('keeps a final-observed segment distinct from acknowledged saved state', () => {
    const store = new MockSessionStore();
    const session = store.create();
    store.saveCaption(session.id, {
      id: 'r1',
      speaker: 'Speaker 1',
      timestampMs: 0,
      text: 'A final result was observed.',
      phase: 'final-observed',
    });
    expect(store.get(session.id)?.captions[0]?.phase).toBe('final-observed');
    store.saveCaption(session.id, {
      id: 'r1',
      speaker: 'Speaker 1',
      timestampMs: 0,
      text: 'A final result was observed.',
      phase: 'save-acknowledged',
    });
    expect(store.get(session.id)?.captions).toHaveLength(1);
    expect(store.get(session.id)?.captions[0]?.phase).toBe('save-acknowledged');
  });
});
