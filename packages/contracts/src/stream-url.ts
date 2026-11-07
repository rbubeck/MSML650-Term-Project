import { z } from 'zod';
import { AUDIO_CHANNELS, AUDIO_SAMPLE_RATE_HZ } from './audio-format.js';
import { languageCodeSchema, sessionIdSchema } from './session.js';

/** AWS's presigning maximum for the WebSocket URL. Handler configuration must stay at or below it. */
export const STREAM_URL_MAX_EXPIRY_SECONDS = 300;

/**
 * PROPOSED default connection-start expiry (decision queue blocker 3: "start
 * with 60 seconds and verify it"). Not an accepted value. It limits how long
 * the URL may be used to open the socket, not how long a stream may run.
 */
export const STREAM_URL_PROPOSED_EXPIRY_SECONDS = 60;

/** Presigned URLs carry a session token, so they are long. This is a sanity bound. */
export const STREAM_URL_MAX_LENGTH = 4096;

/** Amazon Transcribe streaming WebSocket endpoint (docs/streaming-protocol.md). */
export const TRANSCRIBE_STREAM_URL_PORT = '8443';
export const TRANSCRIBE_STREAM_URL_PATH = '/stream-transcription-websocket';

const TRANSCRIBE_STREAMING_HOST = /^transcribestreaming\.[a-z0-9-]+\.amazonaws\.com$/;

function isTranscribeWebSocketUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'wss:' &&
      TRANSCRIBE_STREAMING_HOST.test(url.hostname) &&
      url.port === TRANSCRIBE_STREAM_URL_PORT &&
      url.pathname === TRANSCRIBE_STREAM_URL_PATH
    );
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

/**
 * Response to a stream-url request. The top-level fields are exactly those listed
 * in API_CONTRACTS.md, "Stream URL response".
 *
 * SENSITIVE: `url` is a bearer capability until it expires. Handlers must send
 * it with `Cache-Control: no-store` (an HTTP header, not enforced by this
 * schema) and nothing may log, persist, or put it in analytics, including parse
 * errors that echo the payload. It never contains a secret access key or derived
 * signing key, and this schema rejects fields that would carry one.
 */
export const streamUrlResponseSchema = z.strictObject({
  sessionId: sessionIdSchema,
  /** Epoch for this stream; increases on every issuance. Sessions start at 0, so the first is 1. */
  streamEpoch: z.number().int().min(1),
  url: z.string().max(STREAM_URL_MAX_LENGTH).refine(isTranscribeWebSocketUrl, {
    message: 'Must be a wss:// Amazon Transcribe streaming WebSocket URL.',
  }),
  /**
   * Absolute UTC time after which the URL can no longer open a connection. A client
   * clock that is skewed can misjudge this, so clients should still handle a rejected
   * connection by requesting a fresh URL.
   */
  expiresAt: z.iso.datetime(),
  languageCode: languageCodeSchema,
  mediaEncoding: z.literal('pcm'),
  sampleRateHz: z.literal(AUDIO_SAMPLE_RATE_HZ),
  channels: z.literal(AUDIO_CHANNELS),
});
export type StreamUrlResponse = z.infer<typeof streamUrlResponseSchema>;
