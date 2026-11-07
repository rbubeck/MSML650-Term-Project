import { z } from 'zod';
import { CURSOR_MAX_LENGTH } from './session.js';

// Bounds below are PROPOSED placeholders for contract review, not accepted values.
export const SEGMENT_BATCH_MAX = 25;
export const SEGMENT_TEXT_MAX_LENGTH = 2000;
export const RESULT_ID_MAX_LENGTH = 128;
/** Sanity bound on provider-relative times (24 hours in milliseconds). */
export const SEGMENT_TIME_MAX_MS = 86_400_000;
export const SEGMENT_PAGE_DEFAULT_LIMIT = 100;
export const SEGMENT_PAGE_MAX_LIMIT = 200;

const relativeMsSchema = z.number().int().min(0).max(SEGMENT_TIME_MAX_MS);

/** Fields shared by an uploaded final and a saved final. `resultId` is the provider's result ID. */
const segmentFields = {
  /** Epoch issued by the API with the stream URL this result came from. */
  streamEpoch: z.number().int().min(1),
  resultId: z.string().min(1).max(RESULT_ID_MAX_LENGTH),
  startMs: relativeMsSchema,
  endMs: relativeMsSchema,
  text: z
    .string()
    .min(1)
    .max(SEGMENT_TEXT_MAX_LENGTH)
    .refine((value) => value.trim().length > 0, { message: 'Text must not be blank.' }),
};

const endNotBeforeStart = {
  check: (segment: { startMs: number; endMs: number }): boolean => segment.endMs >= segment.startMs,
  options: { message: 'endMs must not be before startMs.', path: ['endMs'] },
};

/**
 * One final result observed by the browser. Every field is client supplied and
 * untrusted: none proves the text came from Amazon Transcribe. Partial results
 * are never uploaded.
 *
 * Identity is (`streamEpoch`, `resultId`) within the session in the path. Provider
 * times are relative to the start of that stream, so they restart on each epoch.
 */
export const finalSegmentSchema = z
  .strictObject(segmentFields)
  .refine(endNotBeforeStart.check, endNotBeforeStart.options);
export type FinalSegment = z.infer<typeof finalSegmentSchema>;

/**
 * POST /v1/sessions/{sessionId}/segments body. The idempotency key travels in the
 * `Idempotency-Key` header, which this body schema does not describe. Owner and
 * session come from the validated token and the path, never from the body.
 *
 * Whether an epoch is acceptable (issued, not above the current epoch) and
 * whether the session still accepts uploads need stored state, so the handler
 * enforces them, not this schema.
 */
export const uploadSegmentsRequestSchema = z
  .strictObject({
    segments: z.array(finalSegmentSchema).min(1).max(SEGMENT_BATCH_MAX),
  })
  .refine(
    (request) => {
      const seen = new Set<string>();
      for (const segment of request.segments) {
        const identity = `${segment.streamEpoch}:${segment.resultId}`;
        if (seen.has(identity)) return false;
        seen.add(identity);
      }
      return true;
    },
    { message: 'A batch must not repeat a segment identity.', path: ['segments'] },
  );
export type UploadSegmentsRequest = z.infer<typeof uploadSegmentsRequestSchema>;

/**
 * Why one segment was not saved. Whole-request problems use the error envelope.
 *
 * PROPOSED AMENDMENT to API_CONTRACTS.md, which says conflicting reuse returns
 * `STATE_CONFLICT` for the request. A per-item `IDENTITY_CONFLICT` lets the
 * browser see which of a batch conflicted. Needs team agreement.
 */
export const SEGMENT_REJECTION_REASONS = ['EPOCH_NOT_ISSUED', 'IDENTITY_CONFLICT'] as const;
export const segmentRejectionReasonSchema = z.enum(SEGMENT_REJECTION_REASONS);
export type SegmentRejectionReason = z.infer<typeof segmentRejectionReasonSchema>;

const segmentIdentityShape = {
  streamEpoch: segmentFields.streamEpoch,
  resultId: segmentFields.resultId,
};

/**
 * Result for one uploaded segment. `SAVED` and `DUPLICATE` both mean the text is
 * durably stored (a duplicate is an identical retry of an already saved segment),
 * so the UI may show "saved" for either. `REJECTED` means it was not saved.
 */
export const segmentResultSchema = z.discriminatedUnion('status', [
  z.strictObject({ ...segmentIdentityShape, status: z.literal('SAVED') }),
  z.strictObject({ ...segmentIdentityShape, status: z.literal('DUPLICATE') }),
  z.strictObject({
    ...segmentIdentityShape,
    status: z.literal('REJECTED'),
    reason: segmentRejectionReasonSchema,
  }),
]);
export type SegmentResult = z.infer<typeof segmentResultSchema>;

/** One result per uploaded segment. Acknowledge `SAVED` only after the write is durable. */
export const uploadSegmentsResponseSchema = z.strictObject({
  results: z.array(segmentResultSchema).min(1).max(SEGMENT_BATCH_MAX),
});
export type UploadSegmentsResponse = z.infer<typeof uploadSegmentsResponseSchema>;

/**
 * An acknowledged final as returned in session history. History contains only
 * owner-checked, acknowledged finals, always with `client-uploaded` provenance.
 */
export const savedSegmentSchema = z
  .strictObject({
    ...segmentFields,
    provenance: z.literal('client-uploaded'),
  })
  .refine(endNotBeforeStart.check, endNotBeforeStart.options);
export type SavedSegment = z.infer<typeof savedSegmentSchema>;

/** Bounded page of saved finals; `nextCursor` is opaque and absent on the last page. */
export const savedSegmentPageSchema = z.strictObject({
  items: z.array(savedSegmentSchema).max(SEGMENT_PAGE_MAX_LIMIT),
  nextCursor: z.string().min(1).max(CURSOR_MAX_LENGTH).optional(),
});
export type SavedSegmentPage = z.infer<typeof savedSegmentPageSchema>;
