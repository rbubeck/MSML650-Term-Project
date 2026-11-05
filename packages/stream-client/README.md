# Direct Transcribe Stream Client — Person 3

Status: workspace boundary only; no direct browser protocol implementation exists.

Own the browser-facing client for a direct Amazon Transcribe WebSocket. Accept PCM from Person 1, consume a signed URL from Person 2's API, encode/sign Amazon EventStream audio messages, decode transcript/exception messages, manage stop/reconnect/cancellation, and hand final results to the authenticated upload client. Expose a small UI-facing interface for connection, partial, final, save acknowledgment, and errors. Keep AWS provider wire types inside this package.

First tasks: define the reviewed interface and fake WebSocket fixtures; prove EventStream signing/framing and response decoding against official protocol vectors; add bounded queue/backpressure and cancellation tests; then integrate a real browser session only in an authorized environment. The old 16-byte application header is invalid on this path. Signed URLs are sensitive and must not be logged or cached.

Protocol reference: [AWS WebSocket streaming guide](https://docs.aws.amazon.com/transcribe/latest/dg/streaming-setting-up.html).
