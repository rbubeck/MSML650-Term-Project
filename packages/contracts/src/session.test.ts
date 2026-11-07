import { describe, expect, it } from 'vitest';
import {
  SESSION_LIST_DEFAULT_LIMIT,
  SESSION_LIST_MAX_LIMIT,
  SESSION_STATES,
  SESSION_TITLE_MAX_LENGTH,
  createSessionRequestSchema,
  listSessionsQuerySchema,
  renameSessionRequestSchema,
  sessionPageSchema,
  sessionSchema,
  sessionStateSchema,
} from './session.js';

const validSession = {
  sessionId: 'sess_abc123',
  title: 'Team standup',
  languageCode: 'en-US',
  state: 'CREATED',
  streamEpoch: 0,
  createdAt: '2026-11-06T16:00:00Z',
  updatedAt: '2026-11-06T16:00:00Z',
};

describe('sessionStateSchema', () => {
  it('accepts every ADR-011 state', () => {
    for (const state of SESSION_STATES) {
      expect(sessionStateSchema.safeParse(state).success).toBe(true);
    }
  });

  it('rejects other state names, including transport-style states', () => {
    expect(sessionStateSchema.safeParse('CONNECTED').success).toBe(false);
    expect(sessionStateSchema.safeParse('streaming').success).toBe(false);
  });
});

describe('createSessionRequestSchema', () => {
  it('accepts a language code with and without a title', () => {
    expect(createSessionRequestSchema.safeParse({ languageCode: 'en-US' }).success).toBe(true);
    expect(
      createSessionRequestSchema.safeParse({ languageCode: 'en-US', title: 'Demo' }).success,
    ).toBe(true);
  });

  it('requires a language code', () => {
    expect(createSessionRequestSchema.safeParse({ title: 'Demo' }).success).toBe(false);
  });

  it('rejects the old field name and a malformed language code', () => {
    expect(createSessionRequestSchema.safeParse({ language: 'en-US' }).success).toBe(false);
    expect(createSessionRequestSchema.safeParse({ languageCode: 'English please' }).success).toBe(
      false,
    );
    expect(createSessionRequestSchema.safeParse({ languageCode: '' }).success).toBe(false);
  });

  it('rejects a blank or oversized title', () => {
    expect(
      createSessionRequestSchema.safeParse({ languageCode: 'en-US', title: '   ' }).success,
    ).toBe(false);
    expect(
      createSessionRequestSchema.safeParse({
        languageCode: 'en-US',
        title: 'a'.repeat(SESSION_TITLE_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it('never accepts an owner or state from the client', () => {
    for (const extra of [{ userId: 'someone-else' }, { owner: 'x' }, { state: 'COMPLETED' }]) {
      expect(
        createSessionRequestSchema.safeParse({ languageCode: 'en-US', ...extra }).success,
      ).toBe(false);
    }
  });
});

describe('renameSessionRequestSchema', () => {
  it('accepts a title', () => {
    expect(renameSessionRequestSchema.safeParse({ title: 'New name' }).success).toBe(true);
  });

  it('requires a non-blank title within the length bound', () => {
    expect(renameSessionRequestSchema.safeParse({}).success).toBe(false);
    expect(renameSessionRequestSchema.safeParse({ title: '  ' }).success).toBe(false);
    expect(
      renameSessionRequestSchema.safeParse({ title: 'a'.repeat(SESSION_TITLE_MAX_LENGTH + 1) })
        .success,
    ).toBe(false);
  });

  it('cannot change anything but the title', () => {
    for (const extra of [{ state: 'COMPLETED' }, { languageCode: 'fr-FR' }, { userId: 'x' }]) {
      expect(renameSessionRequestSchema.safeParse({ title: 'New', ...extra }).success).toBe(false);
    }
  });
});

describe('sessionSchema', () => {
  it('accepts a valid session, with or without completedAt', () => {
    expect(sessionSchema.safeParse(validSession).success).toBe(true);
    expect(
      sessionSchema.safeParse({
        ...validSession,
        state: 'COMPLETED',
        completedAt: '2026-11-06T17:00:00Z',
      }).success,
    ).toBe(true);
  });

  it('uses the spec field names, not the old ones', () => {
    const renamed: Record<string, unknown> = { ...validSession, id: 'sess_abc123' };
    delete renamed['sessionId'];
    expect(sessionSchema.safeParse(renamed).success).toBe(false);
    expect(sessionSchema.safeParse({ ...validSession, language: 'en-US' }).success).toBe(false);
  });

  it('rejects a non-UTC or non-ISO timestamp', () => {
    expect(sessionSchema.safeParse({ ...validSession, createdAt: 'yesterday' }).success).toBe(
      false,
    );
    expect(
      sessionSchema.safeParse({ ...validSession, createdAt: '2026-11-06T16:00:00+05:00' }).success,
    ).toBe(false);
  });

  it('rejects a negative or fractional stream epoch', () => {
    expect(sessionSchema.safeParse({ ...validSession, streamEpoch: -1 }).success).toBe(false);
    expect(sessionSchema.safeParse({ ...validSession, streamEpoch: 1.5 }).success).toBe(false);
  });

  it('rejects an unknown state and fields that expose the owner', () => {
    expect(sessionSchema.safeParse({ ...validSession, state: 'PAUSED' }).success).toBe(false);
    expect(sessionSchema.safeParse({ ...validSession, owner: 'user-sub' }).success).toBe(false);
  });
});

describe('listSessionsQuerySchema', () => {
  it('applies the default limit', () => {
    const parsed = listSessionsQuerySchema.parse({});
    expect(parsed.limit).toBe(SESSION_LIST_DEFAULT_LIMIT);
  });

  it('coerces a string limit from the query string', () => {
    expect(listSessionsQuerySchema.parse({ limit: '10' }).limit).toBe(10);
  });

  it('rejects limits that are zero, too large, or not whole numbers', () => {
    expect(listSessionsQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(
      listSessionsQuerySchema.safeParse({ limit: String(SESSION_LIST_MAX_LIMIT + 1) }).success,
    ).toBe(false);
    expect(listSessionsQuerySchema.safeParse({ limit: '2.5' }).success).toBe(false);
  });

  it('rejects an empty cursor and unknown parameters', () => {
    expect(listSessionsQuerySchema.safeParse({ cursor: '' }).success).toBe(false);
    expect(listSessionsQuerySchema.safeParse({ userId: 'x' }).success).toBe(false);
  });
});

describe('sessionPageSchema', () => {
  it('accepts a page with and without a next cursor', () => {
    expect(sessionPageSchema.safeParse({ items: [validSession] }).success).toBe(true);
    expect(
      sessionPageSchema.safeParse({ items: [validSession], nextCursor: 'opaque' }).success,
    ).toBe(true);
    expect(sessionPageSchema.safeParse({ items: [] }).success).toBe(true);
  });

  it('rejects a page containing an invalid session', () => {
    expect(
      sessionPageSchema.safeParse({ items: [{ ...validSession, state: 'NOPE' }] }).success,
    ).toBe(false);
  });
});
