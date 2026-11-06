# Direct Transcribe Stream Client — Person 3 Phase 1

Status: protocol foundation and fake-tested WebSocket lifecycle implemented; frontend and real AWS integration remain pending.

## Implemented in PR 1

- browser-native AWS EventStream encoding and decoding with CRC and length validation;
- all EventStream header value types, kept internal to this provider package;
- Amazon Transcribe PCM `AudioEvent` and empty end-of-stream message encoding;
- validated `TranscriptEvent` parsing into a small partial/final result model;
- bounded, content-free provider and protocol errors; and
- deterministic success, corrupt-frame, malformed-payload, and provider-exception tests.

Checkpoint 1 made no AWS call and did not include transport behavior. Documentation and mocks are not runtime evidence of a deployed Transcribe stream.

## Implemented in checkpoint 2

- `TranscribeStreamClient.start({ url, streamEpoch })` opens only a supplied secure WebSocket URL;
- `sendAudio` frames PCM and either sends or places it in a bounded queue;
- slow-socket overflow is surfaced and terminated instead of silently dropping audio;
- partial/final callbacks include the authorized stream epoch;
- corrupt messages, provider exceptions, connection failures, and unexpected disconnects become safe errors;
- `stop` drains accepted frames, sends the empty end event, and uses a bounded terminal-result deadline;
- `cancel` closes immediately without claiming a graceful provider stop; and
- a later reconnect uses a new `start` call, URL, and epoch while stale-socket events are ignored.

Defaults are a 65,536-byte `WebSocket.bufferedAmount` threshold, a 65,536-byte framed-message queue, 20 ms drain polling, a five-second connection deadline, and a five-second stop deadline. These values are bounded initial integration defaults and need browser/AWS evidence before production tuning.

The package still does not request a URL, access the microphone, upload final text, or log stream content. Person 1 stops and flushes capture before calling stream `stop`; Person 2 supplies the URL and epoch; Person 1 uploads emitted finals and shows saved status only after API acknowledgment.

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
