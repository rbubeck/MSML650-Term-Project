import { describe, expect, it } from 'vitest';
import { SingleSessionRepository } from './single-session-repository.js';

describe('SingleSessionRepository', () => {
  it('allocates increasing epochs for its one configured owner and session', async () => {
    const repository = new SingleSessionRepository({
      sessionId: 'session-1',
      ownerId: 'owner-1',
      languageCode: 'en-US',
    });

    await expect(repository.allocateStreamEpoch('owner-1', 'session-1')).resolves.toEqual({
      status: 'ALLOCATED',
      streamEpoch: 1,
      languageCode: 'en-US',
    });
    await expect(repository.allocateStreamEpoch('owner-1', 'session-1')).resolves.toEqual({
      status: 'ALLOCATED',
      streamEpoch: 2,
      languageCode: 'en-US',
    });
  });

  it('does not reveal whether the owner or session was wrong', async () => {
    const repository = new SingleSessionRepository({
      sessionId: 'session-1',
      ownerId: 'owner-1',
      languageCode: 'en-US',
    });

    await expect(repository.allocateStreamEpoch('another-owner', 'session-1')).resolves.toEqual({
      status: 'NOT_FOUND',
    });
    await expect(repository.allocateStreamEpoch('owner-1', 'another-session')).resolves.toEqual({
      status: 'NOT_FOUND',
    });
  });
});
