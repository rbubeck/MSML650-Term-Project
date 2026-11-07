import { ProviderMessageError } from '../errors.js';
import { getStringHeader, type EventStreamMessage } from '../eventstream/codec.js';

const jsonDecoder = new TextDecoder('utf-8', { fatal: true });

export interface ProviderTranscriptResult {
  readonly resultId: string;
  readonly text: string;
  readonly isPartial: boolean;
  readonly startMs: number;
  readonly endMs: number;
}

export interface ProviderTranscriptEvent {
  readonly type: 'transcript';
  readonly results: readonly ProviderTranscriptResult[];
}

export type ProviderExceptionCode =
  | 'BAD_REQUEST'
  | 'INTERNAL_FAILURE'
  | 'LIMIT_EXCEEDED'
  | 'UNRECOGNIZED_CLIENT'
  | 'PROVIDER_EXCEPTION';

export interface ProviderException {
  readonly type: 'exception';
  readonly code: ProviderExceptionCode;
  readonly retryable: boolean;
  readonly message: string;
}

export type TranscribeProviderMessage = ProviderTranscriptEvent | ProviderException;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(payload: Uint8Array): unknown {
  try {
    return JSON.parse(jsonDecoder.decode(payload)) as unknown;
  } catch {
    throw new ProviderMessageError('INVALID_JSON');
  }
}

function parseTimeMs(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return Math.round(value * 1_000);
}

function parseResult(value: unknown): ProviderTranscriptResult | undefined {
  if (!isRecord(value)) throw new ProviderMessageError('INVALID_TRANSCRIPT_EVENT');
  const resultId = value['ResultId'];
  const isPartial = value['IsPartial'];
  const startMs = parseTimeMs(value['StartTime']);
  const endMs = parseTimeMs(value['EndTime']);
  const alternatives = value['Alternatives'];
  if (
    typeof resultId !== 'string' ||
    resultId.length === 0 ||
    typeof isPartial !== 'boolean' ||
    startMs === undefined ||
    endMs === undefined ||
    endMs < startMs ||
    !Array.isArray(alternatives)
  ) {
    throw new ProviderMessageError('INVALID_TRANSCRIPT_EVENT');
  }
  if (alternatives.length === 0) return undefined;
  const firstAlternative = alternatives[0];
  if (!isRecord(firstAlternative) || typeof firstAlternative['Transcript'] !== 'string') {
    throw new ProviderMessageError('INVALID_TRANSCRIPT_EVENT');
  }
  const text = firstAlternative['Transcript'];
  if (text.length === 0) return undefined;
  return { resultId, text, isPartial, startMs, endMs };
}

function parseTranscriptEvent(payload: Uint8Array): ProviderTranscriptEvent {
  const body = parseJson(payload);
  if (!isRecord(body) || !isRecord(body['Transcript'])) {
    throw new ProviderMessageError('INVALID_TRANSCRIPT_EVENT');
  }
  const results = body['Transcript']['Results'];
  if (!Array.isArray(results)) throw new ProviderMessageError('INVALID_TRANSCRIPT_EVENT');
  return {
    type: 'transcript',
    results: results.map(parseResult).filter((result) => result !== undefined),
  };
}

function toSafeException(exceptionType: string): ProviderException {
  switch (exceptionType) {
    case 'BadRequestException':
      return {
        type: 'exception',
        code: 'BAD_REQUEST',
        retryable: false,
        message: 'The transcription request was rejected.',
      };
    case 'InternalFailureException':
      return {
        type: 'exception',
        code: 'INTERNAL_FAILURE',
        retryable: true,
        message: 'The transcription service encountered a temporary failure.',
      };
    case 'LimitExceededException':
      return {
        type: 'exception',
        code: 'LIMIT_EXCEEDED',
        retryable: true,
        message: 'The transcription service capacity limit was reached.',
      };
    case 'UnrecognizedClientException':
      return {
        type: 'exception',
        code: 'UNRECOGNIZED_CLIENT',
        retryable: false,
        message: 'The transcription authorization was rejected.',
      };
    default:
      return {
        type: 'exception',
        code: 'PROVIDER_EXCEPTION',
        retryable: false,
        message: 'The transcription service returned an error.',
      };
  }
}

/** Converts provider-specific EventStream data into the package's small, safe model. */
export function parseTranscribeMessage(message: EventStreamMessage): TranscribeProviderMessage {
  const messageType = getStringHeader(message.headers, ':message-type');
  if (messageType === 'exception') {
    const exceptionType =
      getStringHeader(message.headers, ':exception-type') ??
      getStringHeader(message.headers, ':event-type');
    return toSafeException(exceptionType ?? 'UnknownException');
  }
  if (messageType !== 'event') throw new ProviderMessageError('UNEXPECTED_MESSAGE_TYPE');
  if (getStringHeader(message.headers, ':event-type') !== 'TranscriptEvent') {
    throw new ProviderMessageError('UNEXPECTED_EVENT_TYPE');
  }
  if (getStringHeader(message.headers, ':content-type') !== 'application/json') {
    throw new ProviderMessageError('INVALID_TRANSCRIPT_EVENT');
  }
  return parseTranscriptEvent(message.payload);
}
