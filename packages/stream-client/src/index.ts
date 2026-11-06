export {
  decodeEventStreamMessage,
  encodeEventStreamMessage,
  type DecodeEventStreamOptions,
  type EventStreamHeaderValue,
  type EventStreamMessage,
} from './eventstream/codec.js';
export { crc32 } from './eventstream/crc32.js';
export {
  encodeAudioEvent,
  encodeEndAudioEvent,
  type AudioBytes,
} from './transcribe/audio-event.js';
export {
  parseTranscribeMessage,
  type ProviderException,
  type ProviderExceptionCode,
  type ProviderTranscriptEvent,
  type ProviderTranscriptResult,
  type TranscribeProviderMessage,
} from './transcribe/provider-message.js';
export {
  EventStreamDecodeError,
  ProviderMessageError,
  type EventStreamDecodeErrorCode,
  type ProviderMessageErrorCode,
} from './errors.js';
export {
  TranscribeStreamClient,
  type StreamClientError,
  type StreamClientErrorCode,
  type StreamClientHandlers,
  type StreamClientOptions,
  type StreamConnectionState,
  type StreamResult,
  type StreamStartOptions,
  type StreamWebSocket,
  type WebSocketFactory,
} from './stream-client.js';
