import { z } from 'zod';
import {
  SEGMENT_PAGE_DEFAULT_LIMIT,
  SEGMENT_PAGE_MAX_LIMIT,
  savedSegmentPageSchema,
} from './segments.js';
import { CURSOR_MAX_LENGTH, sessionSchema } from './session.js';

/**
 * Query string for GET /v1/sessions/{sessionId}. It pages through the saved
 * finals. Query values arrive as strings, so `limit` is coerced.
 */
export const getSessionQuerySchema = z.strictObject({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(SEGMENT_PAGE_MAX_LIMIT)
    .default(SEGMENT_PAGE_DEFAULT_LIMIT),
  cursor: z.string().min(1).max(CURSOR_MAX_LENGTH).optional(),
});
export type GetSessionQuery = z.infer<typeof getSessionQuerySchema>;

/**
 * Owned session metadata plus a bounded page of acknowledged finals, as returned
 * by GET /v1/sessions/{sessionId}. Partials never appear, and every final has
 * `client-uploaded` provenance.
 */
export const sessionDetailSchema = z.strictObject({
  ...sessionSchema.shape,
  segments: savedSegmentPageSchema,
});
export type SessionDetail = z.infer<typeof sessionDetailSchema>;
