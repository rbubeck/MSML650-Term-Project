import { describe, expect, it } from 'vitest';
import { completeSessionRequestSchema, completeSessionResponseSchema } from './completion.js';

const completedSession = {
  sessionId: 'sess_abc123',
  title: 'Team standup',
  languageCode: 'en-US',
  state: 'COMPLETED',
  streamEpoch: 2,
  createdAt: '2026-11-06T16:00:00Z',
  updatedAt: '2026-11-06T17:00:00Z',
  completedAt: '2026-11-06T17:00:00Z',
};

describe('completeSessionRequestSchema', () => {
  it('accepts an empty body', () => {
    expect(completeSessionRequestSchema.safeParse({}).success).toBe(true);
  });

  it('rejects client-supplied fields such as state or owner', () => {
    expect(completeSessionRequestSchema.safeParse({ state: 'COMPLETED' }).success).toBe(false);
    expect(completeSessionRequestSchema.safeParse({ userId: 'x' }).success).toBe(false);
  });
});

describe('completeSessionResponseSchema', () => {
  it('accepts a completed session with a completion time', () => {
    expect(completeSessionResponseSchema.safeParse(completedSession).success).toBe(true);
  });

  it('rejects a session that is not in the COMPLETED state', () => {
    for (const state of ['CREATED', 'STREAMING', 'DELETING', 'FAILED']) {
      expect(completeSessionResponseSchema.safeParse({ ...completedSession, state }).success).toBe(
        false,
      );
    }
  });

  it('rejects a completed session that has no completion time', () => {
    const withoutCompletedAt: Record<string, unknown> = { ...completedSession };
    delete withoutCompletedAt['completedAt'];
    expect(completeSessionResponseSchema.safeParse(withoutCompletedAt).success).toBe(false);
  });

  it('still rejects fields that expose the owner', () => {
    expect(
      completeSessionResponseSchema.safeParse({ ...completedSession, owner: 'user-sub' }).success,
    ).toBe(false);
  });
});
