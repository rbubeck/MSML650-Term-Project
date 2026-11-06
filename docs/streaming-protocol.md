# Phase 1 Direct Transcribe Streaming Protocol

Status: browser-client implementation guide. EventStream framing and fake-backed WebSocket lifecycle behavior are implemented; frontend integration and a live AWS browser test do not yet exist.

The application defines no custom audio WebSocket or audio header. The browser opens the short-lived `wss://transcribestreaming.<region>.amazonaws.com:8443/stream-transcription-websocket` URL returned by the API and follows Amazon's WebSocket/EventStream protocol. Do not copy the separate HTTP/2 per-frame signing procedure.

## Input boundary

- Person 1 supplies mono 16 kHz signed 16-bit little-endian PCM.
- Initial pacing is uniform 100 ms chunks: 1,600 samples and 3,200 PCM bytes.
- Person 3 owns EventStream framing, WebSocket transport, response decoding, and provider errors.
- The client bounds queued audio and `WebSocket.bufferedAmount`; it surfaces overload rather than silently dropping frames or growing memory without limit.
- During capture silence, send correctly encoded silence at real-time pacing when the stream remains active.

## Output boundary

Expose a small UI-facing interface for connection state, partial result, final result, and safe error. Provider payloads do not enter shared application contracts.

Partials are ephemeral. A final includes the provider result identity, stream epoch, relative timing, and text needed by the HTTPS upload. The stream client emitting a final does not mean it is saved; Person 1 shows durable status only after API acknowledgment.

`TranscribeStreamClient` is the current Person 1 handoff. `start` accepts only the sensitive supplied WSS URL and API-authorized positive `streamEpoch`; `sendAudio` accepts PCM bytes; handlers receive connection state, epoch-scoped partial/final results, safe errors, and disconnect state; `stop` drains accepted bounded frames and sends the empty provider end frame; `cancel` closes immediately. Reconnect is a new `start` call with a fresh URL and epoch.

The current defaults bound both browser `WebSocket.bufferedAmount` and the package queue at 65,536 bytes, poll a slow socket every 20 ms, and bound connect/stop waits at five seconds. These are initial integration values, not production-tuning evidence.

## Stop and reconnect

- Stop ends microphone intake, drains only the bounded accepted queue, sends the provider's empty audio end message, receives available terminal results within a bounded deadline, and closes.
- Completion is requested only after final uploads observed by the browser settle.
- Disconnect clears partial UI state and surfaces interruption. Lost microphone audio is not recoverable in Phase 1.
- Reconnect requests a fresh signed URL and API-authorized epoch for the same logical session. Results from a stale epoch cannot advance current state.
- Never reuse a URL intentionally or infer active-stream duration from URL expiry.

## One-hour target

Use deterministic accelerated/soak tests locally for queue and cleanup behavior. The approved one-hour browser run verifies pacing, memory, save acknowledgments, visibility/network interruption behavior, and stop. One run is MVP evidence, not a production SLO.

Never log the URL, EventStream payload/body, audio, transcript text, or raw provider exception. Follow the official [AWS WebSocket streaming guide](https://docs.aws.amazon.com/transcribe/latest/dg/streaming-setting-up.html).
