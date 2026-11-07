import { describe, expect, it } from 'vitest';
import {
  ERROR_CODES,
  ERROR_MESSAGE_MAX_LENGTH,
  createErrorEnvelope,
  errorEnvelopeSchema,
} from './errors.js';

describe('errorEnvelopeSchema', () => {
  it('has exactly the eight Phase 1 codes and no deferred-export code', () => {
    expect(ERROR_CODES).toHaveLength(8);
    const result = errorEnvelopeSchema.safeParse({
      error: { code: 'EXPORT_NOT_READY', message: 'x' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts every documented error code', () => {
    for (const code of ERROR_CODES) {
      const result = errorEnvelopeSchema.safeParse({ error: { code, message: 'safe message' } });
      expect(result.success).toBe(true);
    }
  });

  it('rejects an unknown error code', () => {
    const result = errorEnvelopeSchema.safeParse({
      error: { code: 'SOMETHING_ELSE', message: 'x' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing or empty message', () => {
    expect(errorEnvelopeSchema.safeParse({ error: { code: 'NOT_FOUND' } }).success).toBe(false);
    expect(
      errorEnvelopeSchema.safeParse({ error: { code: 'NOT_FOUND', message: '' } }).success,
    ).toBe(false);
  });

  it('rejects a message over the length bound', () => {
    const message = 'a'.repeat(ERROR_MESSAGE_MAX_LENGTH + 1);
    expect(
      errorEnvelopeSchema.safeParse({ error: { code: 'INTERNAL_ERROR', message } }).success,
    ).toBe(false);
  });

  it('accepts a message exactly at the length bound', () => {
    const message = 'a'.repeat(ERROR_MESSAGE_MAX_LENGTH);
    expect(
      errorEnvelopeSchema.safeParse({ error: { code: 'INTERNAL_ERROR', message } }).success,
    ).toBe(true);
  });

  it('rejects unknown fields in the envelope and in the error body', () => {
    expect(
      errorEnvelopeSchema.safeParse({
        error: { code: 'NOT_FOUND', message: 'x' },
        extra: true,
      }).success,
    ).toBe(false);
    expect(
      errorEnvelopeSchema.safeParse({
        error: { code: 'NOT_FOUND', message: 'x', stack: 'leaky trace' },
      }).success,
    ).toBe(false);
  });

  it('rejects a body that is not wrapped in an error object', () => {
    expect(errorEnvelopeSchema.safeParse({ code: 'NOT_FOUND', message: 'x' }).success).toBe(false);
    expect(errorEnvelopeSchema.safeParse(null).success).toBe(false);
  });
});

describe('createErrorEnvelope', () => {
  it('builds the documented wire shape', () => {
    expect(createErrorEnvelope('NOT_FOUND', 'Session not found.')).toEqual({
      error: { code: 'NOT_FOUND', message: 'Session not found.' },
    });
  });

  it('refuses to build an invalid envelope', () => {
    expect(() => createErrorEnvelope('INTERNAL_ERROR', '')).toThrow();
  });
});
