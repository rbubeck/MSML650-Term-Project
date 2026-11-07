import { describe, expect, it } from 'vitest';
import {
  SEGMENT_BATCH_MAX,
  SEGMENT_TEXT_MAX_LENGTH,
  finalSegmentSchema,
  uploadSegmentsRequestSchema,
  uploadSegmentsResponseSchema,
} from './segments.js';

const segment = {
  streamEpoch: 1,
  providerResultId: 'r-1',
  startMs: 0,
  endMs: 1500,
  text: 'hello everyone',
};

describe('finalSegmentSchema', () => {
  it('accepts a valid final', () => {
    expect(finalSegmentSchema.safeParse(segment).success).toBe(true);
  });

  it('rejects an epoch below 1, a missing result id, and non-integer values', () => {
    expect(finalSegmentSchema.safeParse({ ...segment, streamEpoch: 0 }).success).toBe(false);
    expect(finalSegmentSchema.safeParse({ ...segment, providerResultId: '' }).success).toBe(false);
    expect(finalSegmentSchema.safeParse({ ...segment, startMs: 1.5 }).success).toBe(false);
    expect(finalSegmentSchema.safeParse({ ...segment, startMs: -1 }).success).toBe(false);
  });

  it('rejects an end time before the start time and accepts equal times', () => {
    expect(finalSegmentSchema.safeParse({ ...segment, startMs: 2000, endMs: 1000 }).success).toBe(
      false,
    );
    expect(finalSegmentSchema.safeParse({ ...segment, startMs: 500, endMs: 500 }).success).toBe(
      true,
    );
  });

  it('rejects empty, blank and oversized text', () => {
    expect(finalSegmentSchema.safeParse({ ...segment, text: '' }).success).toBe(false);
    expect(finalSegmentSchema.safeParse({ ...segment, text: '   \n ' }).success).toBe(false);
    expect(
      finalSegmentSchema.safeParse({ ...segment, text: 'a'.repeat(SEGMENT_TEXT_MAX_LENGTH + 1) })
        .success,
    ).toBe(false);
    expect(
      finalSegmentSchema.safeParse({ ...segment, text: 'a'.repeat(SEGMENT_TEXT_MAX_LENGTH) })
        .success,
    ).toBe(true);
  });

  it('rejects fields the client must not set, such as owner or session', () => {
    expect(finalSegmentSchema.safeParse({ ...segment, userId: 'x' }).success).toBe(false);
    expect(finalSegmentSchema.safeParse({ ...segment, sessionId: 'sess_1' }).success).toBe(false);
  });
});

describe('uploadSegmentsRequestSchema', () => {
  it('accepts a batch of distinct finals, including the same result id in different epochs', () => {
    const batch = {
      segments: [segment, { ...segment, streamEpoch: 2 }, { ...segment, providerResultId: 'r-2' }],
    };
    expect(uploadSegmentsRequestSchema.safeParse(batch).success).toBe(true);
  });

  it('rejects an empty batch and a batch over the size limit', () => {
    expect(uploadSegmentsRequestSchema.safeParse({ segments: [] }).success).toBe(false);
    const tooMany = Array.from({ length: SEGMENT_BATCH_MAX + 1 }, (_, i) => ({
      ...segment,
      providerResultId: `r-${i}`,
    }));
    expect(uploadSegmentsRequestSchema.safeParse({ segments: tooMany }).success).toBe(false);
  });

  it('rejects a batch that repeats a segment identity', () => {
    const result = uploadSegmentsRequestSchema.safeParse({
      segments: [segment, { ...segment, text: 'different text' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects extra top-level fields', () => {
    expect(
      uploadSegmentsRequestSchema.safeParse({ segments: [segment], userId: 'x' }).success,
    ).toBe(false);
  });
});

describe('uploadSegmentsResponseSchema', () => {
  const identity = { streamEpoch: 1, providerResultId: 'r-1' };

  it('accepts saved, duplicate and rejected results together', () => {
    const response = {
      results: [
        { ...identity, status: 'SAVED' },
        { ...identity, providerResultId: 'r-2', status: 'DUPLICATE' },
        { ...identity, providerResultId: 'r-3', status: 'REJECTED', reason: 'EPOCH_NOT_ISSUED' },
      ],
    };
    expect(uploadSegmentsResponseSchema.safeParse(response).success).toBe(true);
  });

  it('requires a reason for a rejection and forbids one on a save', () => {
    expect(
      uploadSegmentsResponseSchema.safeParse({
        results: [{ ...identity, status: 'REJECTED' }],
      }).success,
    ).toBe(false);
    expect(
      uploadSegmentsResponseSchema.safeParse({
        results: [{ ...identity, status: 'SAVED', reason: 'IDENTITY_CONFLICT' }],
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown status or reason and an empty result list', () => {
    expect(
      uploadSegmentsResponseSchema.safeParse({ results: [{ ...identity, status: 'PENDING' }] })
        .success,
    ).toBe(false);
    expect(
      uploadSegmentsResponseSchema.safeParse({
        results: [{ ...identity, status: 'REJECTED', reason: 'BECAUSE' }],
      }).success,
    ).toBe(false);
    expect(uploadSegmentsResponseSchema.safeParse({ results: [] }).success).toBe(false);
  });
});
