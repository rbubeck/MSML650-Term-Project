# Direct Transcribe Stream Client — Person 3 Phase 1

Status: workspace boundary only; no browser protocol implementation exists.

## Initial deliverable

Build a browser-compatible client that:

- accepts mono 16 kHz signed 16-bit PCM chunks from Person 1;
- opens a presigned Transcribe WebSocket URL supplied by the API;
- encodes audio and end-of-stream Amazon EventStream messages;
- validates/decodes transcript and exception EventStream messages;
- emits small partial, final, connection, and safe error events;
- bounds its queue and `WebSocket.bufferedAmount` behavior;
- supports stop, cancellation, disconnect, and a fresh-URL reconnect; and
- never logs signed URLs, audio, transcript text, or raw provider payloads.

Start with deterministic EventStream vectors and a fake WebSocket. Keep AWS provider types internal. The package receives no secret key and performs no SigV4 signing.

The implementation must be browser-native. Do not introduce a Node/server streaming adapter, custom application audio header, backend audio service, or application WebSocket.

## Phase 1 handoff

Freeze the UI-facing input/event interface with Person 1. Co-own the HTTP/stream-result identity contract with Person 2. Provide Person 5 fixtures for partial, final, provider exception, corrupt frame, slow socket, stop, and disconnect/reconnect.

## Later

Recorded-file batch transcription, seamless audio replay, multi-provider support, and production browser tuning are not initial assignments.
