import { z } from 'zod';

/**
 * Application lifecycle states fixed by ADR-011. Transport/connection state is
 * browser-local and must not appear here. Only the API changes state; the
 * browser requests transitions.
 *
 * `DELETING` sessions are denied on read, but the state stays in the enum so
 * the type matches what the data model stores.
 */
export const SESSION_STATES = ['CREATED', 'STREAMING', 'COMPLETED', 'DELETING', 'FAILED'] as const;
export const sessionStateSchema = z.enum(SESSION_STATES);
export type SessionState = z.infer<typeof sessionStateSchema>;

// Bounds below are PROPOSED placeholders for contract review, not accepted values.
export const SESSION_TITLE_MAX_LENGTH = 120;
export const SESSION_ID_MAX_LENGTH = 128;
export const SESSION_LIST_DEFAULT_LIMIT = 20;
export const SESSION_LIST_MAX_LIMIT = 50;
export const CURSOR_MAX_LENGTH = 512;

/** Opaque identifier: clients must not parse or construct it. */
export const sessionIdSchema = z.string().min(1).max(SESSION_ID_MAX_LENGTH);

/**
 * Language tag such as `en-US`. The approved language list is still TBD, so
 * this validates only the shape; the API must enforce the approved set.
 */
export const languageCodeSchema = z
  .string()
  .max(35)
  .regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/);

export const sessionTitleSchema = z.string().trim().min(1).max(SESSION_TITLE_MAX_LENGTH);

/** UTC wall-clock instant, ISO 8601 with `Z`. Provider-relative times are separate. */
const utcTimestampSchema = z.iso.datetime();

/**
 * POST /v1/sessions body. The owner is never accepted from the client; the API
 * derives it from validated Cognito claims.
 */
export const createSessionRequestSchema = z.strictObject({
  title: sessionTitleSchema.optional(),
  languageCode: languageCodeSchema,
});
export type CreateSessionRequest = z.infer<typeof createSessionRequestSchema>;

/**
 * PATCH /v1/sessions/{sessionId} body: rename an owned session. The response is
 * the updated session. Idempotent: repeating the same title changes nothing.
 */
export const renameSessionRequestSchema = z.strictObject({
  title: sessionTitleSchema,
});
export type RenameSessionRequest = z.infer<typeof renameSessionRequestSchema>;

/** Session as returned to its owner. Owner identity and internal version are not exposed. */
export const sessionSchema = z.strictObject({
  sessionId: sessionIdSchema,
  title: sessionTitleSchema,
  languageCode: languageCodeSchema,
  state: sessionStateSchema,
  /** Current provider stream epoch; increases monotonically on each reconnect. */
  streamEpoch: z.number().int().nonnegative(),
  createdAt: utcTimestampSchema,
  updatedAt: utcTimestampSchema,
  completedAt: utcTimestampSchema.optional(),
});
export type Session = z.infer<typeof sessionSchema>;

/** Query string for GET /v1/sessions. Query values arrive as strings, so `limit` is coerced. */
export const listSessionsQuerySchema = z.strictObject({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(SESSION_LIST_MAX_LIMIT)
    .default(SESSION_LIST_DEFAULT_LIMIT),
  cursor: z.string().min(1).max(CURSOR_MAX_LENGTH).optional(),
});
export type ListSessionsQuery = z.infer<typeof listSessionsQuerySchema>;

/** Newest-first page of the caller's own sessions. `nextCursor` is opaque and absent on the last page. */
export const sessionPageSchema = z.strictObject({
  items: z.array(sessionSchema).max(SESSION_LIST_MAX_LIMIT),
  nextCursor: z.string().min(1).max(CURSOR_MAX_LENGTH).optional(),
});
export type SessionPage = z.infer<typeof sessionPageSchema>;
