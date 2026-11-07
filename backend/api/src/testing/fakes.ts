import type { ErrorCode } from '@live-transcription/contracts';
import type {
  AdmissionDecision,
  AllocateStreamResult,
  Clock,
  LogEvent,
  Logger,
  RateLimiter,
  SessionRepository,
  SignTranscribeUrlInput,
  TranscribeUrlSigner,
} from '../ports.js';

/**
 * Deterministic fakes for tests. This file is test support only: it is excluded
 * from the build output and must never be imported by production code.
 * Fixtures use synthetic values only, never real credentials or user data.
 */

export class FixedClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return new Date(this.current.getTime());
  }
  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

export interface FakeSession {
  readonly ownerId: string;
  readonly languageCode: string;
  state: 'CREATED' | 'STREAMING' | 'COMPLETED' | 'DELETING' | 'FAILED';
  streamEpoch: number;
}

/**
 * In-memory repository that behaves like the contract in `SessionRepository`:
 * missing and foreign sessions are indistinguishable, only CREATED and STREAMING
 * sessions may stream, and allocation increments the epoch and moves the session
 * to STREAMING in one step.
 */
export class FakeSessionRepository implements SessionRepository {
  readonly sessions = new Map<string, FakeSession>();
  failWith: Error | null = null;

  add(sessionId: string, session: FakeSession): void {
    this.sessions.set(sessionId, session);
  }

  allocateStreamEpoch(ownerId: string, sessionId: string): Promise<AllocateStreamResult> {
    if (this.failWith) return Promise.reject(this.failWith);
    const session = this.sessions.get(sessionId);
    if (session === undefined || session.ownerId !== ownerId) {
      return Promise.resolve({ status: 'NOT_FOUND' });
    }
    if (session.state !== 'CREATED' && session.state !== 'STREAMING') {
      return Promise.resolve({ status: 'STATE_CONFLICT' });
    }
    session.streamEpoch += 1;
    session.state = 'STREAMING';
    return Promise.resolve({
      status: 'ALLOCATED',
      streamEpoch: session.streamEpoch,
      languageCode: session.languageCode,
    });
  }
}

export const FAKE_TRANSCRIBE_HOST = 'transcribestreaming.us-east-1.amazonaws.com:8443';

/** Signer that records its inputs and returns a distinct, schema-valid URL per call. */
export class FakeSigner implements TranscribeUrlSigner {
  readonly calls: SignTranscribeUrlInput[] = [];
  nextResult: string | Error | null = null;

  sign(input: SignTranscribeUrlInput): Promise<string> {
    this.calls.push(input);
    if (this.nextResult instanceof Error) return Promise.reject(this.nextResult);
    if (typeof this.nextResult === 'string') return Promise.resolve(this.nextResult);
    return Promise.resolve(
      `wss://${FAKE_TRANSCRIBE_HOST}/stream-transcription-websocket?X-Amz-Signature=fake-signature-${this.calls.length}`,
    );
  }
}

export class FakeRateLimiter implements RateLimiter {
  readonly checked: string[] = [];
  decision: AdmissionDecision = 'ALLOW';

  check(ownerId: string): Promise<AdmissionDecision> {
    this.checked.push(ownerId);
    return Promise.resolve(this.decision);
  }
}

export interface LoggedEvent {
  readonly event: LogEvent;
  readonly code?: ErrorCode;
}

export class RecordingLogger implements Logger {
  readonly events: LoggedEvent[] = [];

  log(event: LogEvent, fields?: { readonly code?: ErrorCode }): void {
    this.events.push(fields?.code === undefined ? { event } : { event, code: fields.code });
  }
}
