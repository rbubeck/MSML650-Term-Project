export type EventStreamDecodeErrorCode =
  | 'MESSAGE_TOO_SMALL'
  | 'MESSAGE_TOO_LARGE'
  | 'LENGTH_MISMATCH'
  | 'INVALID_HEADERS_LENGTH'
  | 'PRELUDE_CRC_MISMATCH'
  | 'MESSAGE_CRC_MISMATCH'
  | 'MALFORMED_HEADER'
  | 'DUPLICATE_HEADER'
  | 'INVALID_UTF8'
  | 'UNSUPPORTED_HEADER_TYPE';

/** Safe structural error. It never includes payload, transcript, or URL content. */
export class EventStreamDecodeError extends Error {
  override readonly name = 'EventStreamDecodeError';

  constructor(readonly code: EventStreamDecodeErrorCode) {
    super(`Invalid provider EventStream message (${code}).`);
  }
}

export type ProviderMessageErrorCode =
  'INVALID_JSON' | 'INVALID_TRANSCRIPT_EVENT' | 'UNEXPECTED_MESSAGE_TYPE' | 'UNEXPECTED_EVENT_TYPE';

/** Safe provider-model error. It never includes the provider response body. */
export class ProviderMessageError extends Error {
  override readonly name = 'ProviderMessageError';

  constructor(readonly code: ProviderMessageErrorCode) {
    super(`Invalid provider response (${code}).`);
  }
}
