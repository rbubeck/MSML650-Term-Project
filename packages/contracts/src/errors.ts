import { z } from 'zod';

/**
 * Stable application error codes (API_CONTRACTS.md, "Shared rules").
 * HTTP status mapping is intentionally NOT defined here: it is still TBD and
 * belongs to contract review, not to this schema.
 */
export const ERROR_CODES = [
  'UNAUTHORIZED',
  'NOT_FOUND',
  'INVALID_INPUT',
  'STATE_CONFLICT',
  'RATE_LIMITED',
  'CAPACITY_LIMIT',
  'SIGNING_FAILED',
  'EXPORT_NOT_READY',
  'INTERNAL_ERROR',
] as const;

export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/**
 * Upper bound for the human-readable message. Messages must be safe to show
 * and to log: never include tokens, signed URLs, transcript text, or raw
 * provider/internal errors. The length cap is a guard, not proof of safety.
 */
export const ERROR_MESSAGE_MAX_LENGTH = 200;

export const errorBodySchema = z.strictObject({
  code: errorCodeSchema,
  message: z.string().min(1).max(ERROR_MESSAGE_MAX_LENGTH),
});
export type ErrorBody = z.infer<typeof errorBodySchema>;

/** Wire shape: `{ "error": { "code": "STRING_CODE", "message": "safe message" } }`. */
export const errorEnvelopeSchema = z.strictObject({
  error: errorBodySchema,
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

/** Build a validated error response body so handlers construct errors one way. */
export function createErrorEnvelope(code: ErrorCode, message: string): ErrorEnvelope {
  return errorEnvelopeSchema.parse({ error: { code, message } });
}
