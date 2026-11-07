import { z } from 'zod';
import { sessionSchema } from './session.js';

/**
 * POST /v1/sessions/{sessionId}/complete body. The browser calls this after the
 * provider stream has ended and every final it observed has been acknowledged by
 * the API. Everything else comes from the path and the validated token.
 *
 * The transition is idempotent: repeating the request returns the same completed
 * session. Completion covers acknowledged uploads only; it cannot prove the browser
 * uploaded every provider final.
 */
export const completeSessionRequestSchema = z.strictObject({});
export type CompleteSessionRequest = z.infer<typeof completeSessionRequestSchema>;

/**
 * Response to a completion request: the updated session. A completed session must
 * be in the `COMPLETED` state and carry a completion time.
 */
export const completeSessionResponseSchema = sessionSchema.refine(
  (session) => session.state === 'COMPLETED' && session.completedAt !== undefined,
  { message: 'A completed session must have state COMPLETED and a completedAt time.' },
);
export type CompleteSessionResponse = z.infer<typeof completeSessionResponseSchema>;

/*
 * DELETE /v1/sessions/{sessionId} has no request or response body schema.
 * Success is `204 No Content`: reads are denied immediately and physical removal
 * is retried afterward. See the contracts README for the open question about
 * deleting an already-deleted session.
 */
