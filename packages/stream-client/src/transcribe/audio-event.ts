import { encodeEventStreamMessage, type EventStreamHeaderValue } from '../eventstream/codec.js';

export type AudioBytes = ArrayBuffer | Uint8Array;

const AUDIO_EVENT_HEADERS: Readonly<Record<string, EventStreamHeaderValue>> = Object.freeze({
  ':content-type': { type: 'string', value: 'application/octet-stream' },
  ':event-type': { type: 'string', value: 'AudioEvent' },
  ':message-type': { type: 'string', value: 'event' },
});

function toUint8Array(audio: AudioBytes): Uint8Array {
  return audio instanceof Uint8Array ? audio : new Uint8Array(audio);
}

/** Encodes raw PCM as an Amazon Transcribe WebSocket AudioEvent. */
export function encodeAudioEvent(audio: AudioBytes): Uint8Array {
  return encodeEventStreamMessage({
    headers: AUDIO_EVENT_HEADERS,
    payload: toUint8Array(audio),
  });
}

/** Amazon Transcribe ends a WebSocket input stream with an empty AudioEvent. */
export function encodeEndAudioEvent(): Uint8Array {
  return encodeAudioEvent(new Uint8Array());
}
