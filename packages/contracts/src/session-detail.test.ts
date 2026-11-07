import { describe, expect, it } from 'vitest';
import { SEGMENT_PAGE_DEFAULT_LIMIT, SEGMENT_PAGE_MAX_LIMIT } from './segments.js';
import { getSessionQuerySchema, sessionDetailSchema } from './session-detail.js';

const session = {
  sessionId: 'sess_abc123',
  title: 'Team standup',
  languageCode: 'en-US',
  state: 'COMPLETED',
  streamEpoch: 2,
  createdAt: '2026-11-06T16:00:00Z',
  updatedAt: '2026-11-06T17:00:00Z',
  completedAt: '2026-11-06T17:00:00Z',
};

const saved = {
  streamEpoch: 1,
  resultId: 'r-1',
  startMs: 0,
  endMs: 1500,
  text: 'hello everyone',
  provenance: 'client-uploaded',
};

describe('sessionDetailSchema', () => {
  it('accepts a session with a page of acknowledged finals', () => {
    expect(
      sessionDetailSchema.safeParse({ ...session, segments: { items: [saved] } }).success,
    ).toBe(true);
    expect(sessionDetailSchema.safeParse({ ...session, segments: { items: [] } }).success).toBe(
      true,
    );
  });

  it('requires the segments page', () => {
    expect(sessionDetailSchema.safeParse(session).success).toBe(false);
  });

  it('inherits the session rules and the saved-final rules', () => {
    expect(
      sessionDetailSchema.safeParse({ ...session, state: 'PAUSED', segments: { items: [] } })
        .success,
    ).toBe(false);
    expect(
      sessionDetailSchema.safeParse({
        ...session,
        segments: { items: [{ ...saved, provenance: 'server' }] },
      }).success,
    ).toBe(false);
  });

  it('rejects fields that expose the owner', () => {
    expect(
      sessionDetailSchema.safeParse({ ...session, owner: 'user-sub', segments: { items: [] } })
        .success,
    ).toBe(false);
  });
});

describe('getSessionQuerySchema', () => {
  it('applies the default segment page size and coerces a string limit', () => {
    expect(getSessionQuerySchema.parse({}).limit).toBe(SEGMENT_PAGE_DEFAULT_LIMIT);
    expect(getSessionQuerySchema.parse({ limit: '25' }).limit).toBe(25);
  });

  it('rejects limits that are zero or too large, and unknown parameters', () => {
    expect(getSessionQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(
      getSessionQuerySchema.safeParse({ limit: String(SEGMENT_PAGE_MAX_LIMIT + 1) }).success,
    ).toBe(false);
    expect(getSessionQuerySchema.safeParse({ userId: 'x' }).success).toBe(false);
  });
});
