import type { AllocateStreamResult, SessionRepository } from '../ports.js';

export interface SingleSessionRepositoryInput {
  readonly sessionId: string;
  readonly ownerId: string;
  readonly languageCode: string;
}

/**
 * Smoke-test-only repository for the first real browser-to-Transcribe check.
 *
 * It recognizes exactly one configured session and keeps its epoch only in the
 * current JavaScript process. Lambda cold starts or parallel environments reset
 * or duplicate that state, so this MUST NOT be used for durable MVP behavior.
 * Person 4's authoritative repository replaces it without changing the route.
 */
export class SingleSessionRepository implements SessionRepository {
  private streamEpoch = 0;

  constructor(private readonly session: SingleSessionRepositoryInput) {}

  allocateStreamEpoch(ownerId: string, sessionId: string): Promise<AllocateStreamResult> {
    if (ownerId !== this.session.ownerId || sessionId !== this.session.sessionId) {
      return Promise.resolve({ status: 'NOT_FOUND' });
    }
    this.streamEpoch += 1;
    return Promise.resolve({
      status: 'ALLOCATED',
      streamEpoch: this.streamEpoch,
      languageCode: this.session.languageCode,
    });
  }
}
