import { createErrorEnvelope, type ErrorCode } from '@live-transcription/contracts';
import type { ApiGatewayResult } from './events.js';

/**
 * PLACEHOLDER mapping from error code to HTTP status. The contract leaves the
 * mapping undecided ("exact error status mapping" in the schema freeze
 * checklist). Change it in one place once the team agrees.
 */
export const ERROR_STATUS: Readonly<Record<ErrorCode, number>> = {
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  INVALID_INPUT: 400,
  STATE_CONFLICT: 409,
  RATE_LIMITED: 429,
  CAPACITY_LIMIT: 503,
  SIGNING_FAILED: 502,
  INTERNAL_ERROR: 500,
};

/** Fixed, safe messages. They never include input, URLs, tokens or internal errors. */
export const DEFAULT_ERROR_MESSAGE: Readonly<Record<ErrorCode, string>> = {
  UNAUTHORIZED: 'Authentication is required.',
  NOT_FOUND: 'Session not found.',
  INVALID_INPUT: 'The request is invalid.',
  STATE_CONFLICT: 'The session cannot start a stream in its current state.',
  RATE_LIMITED: 'Too many requests. Try again later.',
  CAPACITY_LIMIT: 'The service is at capacity. Try again later.',
  SIGNING_FAILED: 'Could not authorize a stream. Try again.',
  INTERNAL_ERROR: 'An internal error occurred.',
};

/**
 * Every response, success or error, is non-cacheable. The success body carries a
 * signed URL, which is a bearer capability, so nothing may cache it.
 */
const BASE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
} as const;

export function jsonResponse(statusCode: number, body: unknown): ApiGatewayResult {
  return { statusCode, headers: { ...BASE_HEADERS }, body: JSON.stringify(body) };
}

export function errorResponse(code: ErrorCode, message?: string): ApiGatewayResult {
  return jsonResponse(
    ERROR_STATUS[code],
    createErrorEnvelope(code, message ?? DEFAULT_ERROR_MESSAGE[code]),
  );
}
