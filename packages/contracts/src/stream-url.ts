import { z } from 'zod';
import { AUDIO_SAMPLE_RATE_HZ } from './audio-format.js';
import { languageCodeSchema, sessionIdSchema } from './session.js';

/** AWS's presigning maximum for the WebSocket URL. */
export const STREAM_URL_MAX_EXPIRY_SECONDS = 300;

/**
 * PROPOSED default connection-start expiry (decision queue blocker 3: "start
 * with 60 seconds and verify it"). Not an accepted value. It limits how long
 * the URL may be used to open the socket, not how long a stream may run.
 */
export const STREAM_URL_PROPOSED_EXPIRY_SECONDS = 60;

/** Presigned URLs carry a session token, so they are long. This is a sanity bound. */
export const STREAM_URL_MAX_LENGTH = 4096;

const TRANSCRIBE_STREAMING_HOST = /^transcribestreaming\.[a-z0-9-]+\.amazonaws\.com$/;

function isTranscribeWebSocketUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'wss:' && TRANSCRIBE_STREAMING_HOST.test(url.hostname);
  } catch {
    return false;
  }
}

/**
 * POST /v1/sessions/{sessionId}/stream-url body. Language and audio settings are
 * fixed when the session is created, so the client sends nothing here.
 */
export const requestStreamUrlRequestSchema = z.strictObject({});
export type RequestStreamUrlRequest = z.infer<typeof requestStreamUrlRequestSchema>;

/** Approved stream parameters the signer applied. Phase 1 allows only PCM at 16 kHz. */
export const streamParametersSchema = z.strictObject({
  languageCode: languageCodeSchema,
  mediaEncoding: z.literal('pcm'),
  sampleRateHertz: z.literal(AUDIO_SAMPLE_RATE_HZ),
});
export type StreamParameters = z.infer<typeof streamParametersSchema>;

/**
 * Response to a stream-url request.
 *
 * SENSITIVE: `url` is a bearer capability until it expires. Handlers must send
 * it with `Cache-Control: no-store` (an HTTP header, not enforced by this
 * schema) and nothing may log, persist, or put it in analytics, including parse
 * errors that echo the payload. It never contains a secret access key or derived
 * signing key, and this schema rejects fields that would carry one.
 */
export const streamUrlResponseSchema = z.strictObject({
  sessionId: sessionIdSchema,
  url: z.string().max(STREAM_URL_MAX_LENGTH).refine(isTranscribeWebSocketUrl, {
    message: 'Must be a wss:// Amazon Transcribe streaming URL.',
  }),
  /** Absolute UTC expiry. Can be skewed by the client clock, so prefer `expiresInSeconds`. */
  expiresAt: z.iso.datetime(),
  /** Seconds until the URL stops being usable to open a connection. */
  expiresInSeconds: z.number().int().min(1).max(STREAM_URL_MAX_EXPIRY_SECONDS),
  /** Epoch for this stream; increases on every issuance. Sessions start at 0, so the first is 1. */
  streamEpoch: z.number().int().min(1),
  parameters: streamParametersSchema,
});
export type StreamUrlResponse = z.infer<typeof streamUrlResponseSchema>;
