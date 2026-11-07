import {
  AUDIO_CHANNELS,
  AUDIO_SAMPLE_RATE_HZ,
  requestStreamUrlRequestSchema,
  sessionIdSchema,
  streamUrlResponseSchema,
  type ErrorCode,
} from '@live-transcription/contracts';
import type { StreamUrlConfig } from './config.js';
import type { ApiGatewayEvent, ApiGatewayResult } from './events.js';
import { identityFromEvent } from './identity.js';
import type {
  Clock,
  Identity,
  Logger,
  RateLimiter,
  SessionRepository,
  TranscribeUrlSigner,
} from './ports.js';
import { errorResponse, jsonResponse } from './responses.js';

/** The request body is empty by contract, so anything large is invalid. */
const MAX_BODY_CHARACTERS = 1024;

export interface StreamUrlHandlerDependencies {
  readonly config: StreamUrlConfig;
  readonly repository: SessionRepository;
  readonly signer: TranscribeUrlSigner;
  readonly clock: Clock;
  /** Defaults to allowing every request: real limits are undecided. */
  readonly rateLimiter?: RateLimiter;
  /** Defaults to a logger that records nothing. */
  readonly logger?: Logger;
  /** Defaults to reading the validated JWT claims from the API Gateway event. */
  readonly resolveIdentity?: (event: ApiGatewayEvent) => Identity | null;
}

export type StreamUrlHandler = (event: ApiGatewayEvent) => Promise<ApiGatewayResult>;

const allowAll: RateLimiter = { check: () => Promise.resolve('ALLOW') };
const silentLogger: Logger = { log: () => undefined };

type ParsedBody = { readonly ok: true } | { readonly ok: false };

/** The body is optional. If present it must be JSON that matches the (empty) request schema. */
function parseBody(event: ApiGatewayEvent): ParsedBody {
  const raw = event.body;
  if (raw === undefined || raw === null) return { ok: true };

  const text = event.isBase64Encoded ? Buffer.from(raw, 'base64').toString('utf8') : raw;
  if (text.length > MAX_BODY_CHARACTERS) return { ok: false };
  if (text.trim() === '') return { ok: true };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false };
  }
  return requestStreamUrlRequestSchema.safeParse(parsed).success ? { ok: true } : { ok: false };
}

/** Formats an instant as ISO 8601 UTC with whole seconds, e.g. `2026-11-06T16:01:00Z`. */
function toIsoSeconds(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Create the handler for `POST /v1/sessions/{sessionId}/stream-url`.
 *
 * Order of checks: authenticate, validate input, admit, then one atomic
 * repository call that verifies ownership and state and allocates the epoch,
 * then sign, then validate our own response before returning it.
 *
 * Nothing sensitive reaches an error body or the logger. The signed URL appears
 * only in the success response.
 */
export function createStreamUrlHandler(deps: StreamUrlHandlerDependencies): StreamUrlHandler {
  const { config, repository, signer, clock } = deps;
  const rateLimiter = deps.rateLimiter ?? allowAll;
  const logger = deps.logger ?? silentLogger;
  const resolveIdentity = deps.resolveIdentity ?? identityFromEvent;

  function reject(code: ErrorCode, message?: string): ApiGatewayResult {
    logger.log('stream_url_rejected', { code });
    return errorResponse(code, message);
  }

  return async (event) => {
    try {
      const identity = resolveIdentity(event);
      if (identity === null) return reject('UNAUTHORIZED');

      const sessionId = sessionIdSchema.safeParse(event.pathParameters?.['sessionId']);
      if (!sessionId.success) return reject('INVALID_INPUT');
      if (!parseBody(event).ok) return reject('INVALID_INPUT');

      const admission = await rateLimiter.check(identity.ownerId);
      if (admission !== 'ALLOW') return reject(admission);

      // One atomic call: missing and foreign sessions both come back as NOT_FOUND.
      const allocation = await repository.allocateStreamEpoch(identity.ownerId, sessionId.data);
      if (allocation.status === 'NOT_FOUND') return reject('NOT_FOUND');
      if (allocation.status === 'STATE_CONFLICT') return reject('STATE_CONFLICT');

      // The epoch is already allocated here. If anything below fails the epoch is
      // skipped: epochs only ever increase, they are not guaranteed contiguous.
      if (!config.allowedLanguageCodes.has(allocation.languageCode)) {
        return reject('INVALID_INPUT', 'The session language is not supported.');
      }

      const signingDate = clock.now();
      let url: string;
      try {
        url = await signer.sign({
          region: config.region,
          languageCode: allocation.languageCode,
          expiresInSeconds: config.expirySeconds,
          signingDate,
        });
      } catch {
        // The signer's error is deliberately dropped: it could contain the URL,
        // credentials or provider details.
        return reject('SIGNING_FAILED');
      }

      const response = streamUrlResponseSchema.safeParse({
        sessionId: sessionId.data,
        streamEpoch: allocation.streamEpoch,
        url,
        expiresAt: toIsoSeconds(new Date(signingDate.getTime() + config.expirySeconds * 1000)),
        languageCode: allocation.languageCode,
        mediaEncoding: 'pcm',
        sampleRateHz: AUDIO_SAMPLE_RATE_HZ,
        channels: AUDIO_CHANNELS,
      });
      if (!response.success) {
        // Never log or return the validation issues: they can echo the URL.
        return reject('SIGNING_FAILED');
      }

      logger.log('stream_url_issued');
      return jsonResponse(200, response.data);
    } catch {
      return reject('INTERNAL_ERROR');
    }
  };
}
