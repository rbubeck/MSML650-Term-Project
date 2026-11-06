# Direct Amazon Transcribe Streaming Protocol

Status: implementation guide; no browser protocol client or live browser test exists.

The application does not define its own WebSocket protocol. The browser opens the short-lived presigned `wss://transcribestreaming.<region>.amazonaws.com:8443/stream-transcription-websocket` URL returned by the authenticated API. Audio is sent as Amazon EventStream-encoded audio messages, and transcript/exception responses are EventStream-encoded. End the stream with the protocol's empty audio message. Follow the **WebSocket section** of the [AWS streaming protocol guide](https://docs.aws.amazon.com/transcribe/latest/dg/streaming-setting-up.html) for headers, CRC/framing, and responses; its separate HTTP/2 per-frame signing procedure must not be copied into the browser. Lambda signs the connection URL; do not transmit the old application PCM header.

## Browser client boundary

- Accept mono 16 kHz signed 16-bit little-endian PCM chunks from the capture pipeline. The current shared format target is 1,600 samples/100 ms; browser resampling and pacing need tests.
- Frame outgoing EventStream messages and parse/decode incoming provider messages. Keep provider-specific models internal; expose small UI-facing partial, final, error, and connection events. The presigned URL may include a credential identifier and temporary session token; never pass the secret access key or derived signing key to the browser.
- Bound queued audio and `WebSocket.bufferedAmount`; abort or surface backpressure instead of unbounded buffering or silent frame loss.
- Clear partials on disconnect; request a new URL for reconnect and move to a new epoch after server authorization. Do not promise recovery of disconnected audio or unacknowledged final text.
- Submit only final results to the HTTPS API, retry idempotently within the reviewed policy, and distinguish provider-final-observed from API-save-acknowledged in the UI. Request completion only after the provider stream ends and observed finals are acknowledged; the API cannot verify that none were omitted.
- Never log the signed URL, EventStream payload, raw audio, transcript text, or provider exception body.

The URL expiration controls initial connection authorization; do not infer the maximum active stream length from it. Region support, provider stream-duration limit, accepted language options, browser compatibility, and reconnect policy are `TBD` for verification.
