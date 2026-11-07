import type { ErrorCode } from '@live-transcription/contracts';

/**
 * Narrow interfaces the stream-URL handler depends on. Each one is a seam so the
 * handler never couples to DynamoDB, AWS clients or the system clock, and so
 * Person 4 can supply the real repository adapter without touching the handler.
 */

/** Wall-clock source. Injected so tests control time. */
export interface Clock {
  now(): Date;
}

/** The authenticated caller, derived only from validated token claims. */
export interface Identity {
  readonly ownerId: string;
}

/** Outcome of the atomic "authorize and allocate the next stream epoch" operation. */
export type AllocateStreamResult =
  | {
      readonly status: 'ALLOCATED';
      /** The newly allocated epoch, strictly greater than any epoch issued before. */
      readonly streamEpoch: number;
      /** Language fixed when the session was created. */
      readonly languageCode: string;
    }
  /** The session does not exist OR belongs to someone else. Callers must not be able to tell which. */
  | { readonly status: 'NOT_FOUND' }
  /** The session exists and is owned, but its lifecycle does not permit streaming. */
  | { readonly status: 'STATE_CONFLICT' };

/**
 * Session storage as seen by the stream-URL handler.
 *
 * `allocateStreamEpoch` MUST be one atomic conditional write, not a read followed
 * by a write. Conditions: the session exists, `ownerId` owns it, and its state is
 * `CREATED` or `STREAMING`. On success it increments the stream epoch, moves the
 * session to `STREAMING` (assumption; see backend/api/README.md) and returns the
 * new epoch and the session language. A missing session and a session owned by
 * someone else must both produce `NOT_FOUND`.
 */
export interface SessionRepository {
  allocateStreamEpoch(ownerId: string, sessionId: string): Promise<AllocateStreamResult>;
}

export interface SignTranscribeUrlInput {
  readonly region: string;
  readonly languageCode: string;
  readonly expiresInSeconds: number;
  /** Signing time. The URL expires `expiresInSeconds` after this instant. */
  readonly signingDate: Date;
}

/**
 * Produces a presigned Amazon Transcribe streaming WebSocket URL. The result is
 * SENSITIVE: a bearer capability until it expires. Implementations must never
 * return or expose a secret access key or derived signing key.
 */
export interface TranscribeUrlSigner {
  sign(input: SignTranscribeUrlInput): Promise<string>;
}

export type AdmissionDecision = 'ALLOW' | 'RATE_LIMITED' | 'CAPACITY_LIMIT';

/** Per-caller admission control. The real limits are undecided; the default allows everything. */
export interface RateLimiter {
  check(ownerId: string): Promise<AdmissionDecision>;
}

/** Fixed event names only, so nothing sensitive can be logged by accident. */
export type LogEvent = 'stream_url_issued' | 'stream_url_rejected';

/**
 * Allow-listed logging. There is no free-text field and no way to pass a URL,
 * token, session ID, user ID or transcript text. Only a bounded error code.
 */
export interface Logger {
  log(event: LogEvent, fields?: { readonly code?: ErrorCode }): void;
}
