# Direct Amazon Transcribe Stream Client — Person 3 Phase 1

Status: the browser EventStream protocol, bounded WebSocket lifecycle, and local frontend microphone integration are implemented and fake-tested. The control-API capability parser and first real AWS browser stream remain pending.

## Architecture boundary

This package owns the direct browser-to-Amazon Transcribe data plane:

```text
Person 1 MicrophoneCapture
  → mono 16 kHz signed 16-bit little-endian PCM
  → TranscribeStreamClient
  → Amazon EventStream audio frames
  → supplied presigned Transcribe WebSocket URL
  → partial/final provider results back to the browser
```

It does not access the microphone, request or sign a URL, call the application API, upload final text, persist transcripts, or determine whether a final result was durably saved. It never receives an AWS secret key or derived signing key. API Gateway/Lambda remain the control plane and do not proxy continuous audio.

## Current implementation

The package currently provides:

- browser-native AWS EventStream encoding and decoding;
- standard CRC32, prelude/message CRC validation, length validation, bounded incoming messages, and strict header parsing;
- Amazon Transcribe `AudioEvent` encoding for PCM and the empty end-of-stream message;
- validated `TranscriptEvent` parsing into small partial/final result objects;
- safe provider-exception mapping without exposing raw response bodies;
- `TranscribeStreamClient.start({ url, streamEpoch })` for a supplied secure WebSocket capability;
- bounded application queue and `WebSocket.bufferedAmount` behavior;
- visible overload failure instead of silent audio dropping or unbounded growth;
- graceful stop, immediate cancellation, connection/stop deadlines, unexpected-disconnect reporting, and explicit reconnect;
- epoch-scoped results and rejection of stale-socket events after reconnect; and
- deterministic protocol, corruption, provider-error, slow-socket, stop, cancel, timeout, and reconnect tests.

The initial transport defaults are:

| Setting | Default |
|---|---:|
| Maximum browser `WebSocket.bufferedAmount` before queueing | 65,536 bytes |
| Maximum queued framed messages | 65,536 bytes |
| Slow-socket drain interval | 20 ms |
| Connection deadline | 5 seconds |
| Graceful-stop deadline | 5 seconds |

These values are bounded integration defaults, not production-tuning evidence. The approved browser/AWS tests must validate them for the one-hour logical-session target.

## Frontend handoff

`frontend/src/services/directStreamAdapter.ts` is the current Person 1/3 integration boundary. It:

1. asks an injected capability provider for an already validated `{ url, streamEpoch }`;
2. opens `TranscribeStreamClient` before microphone capture begins;
3. forwards every PCM chunk from `MicrophoneCapture`;
4. maps provider partials/finals to the UI's `partial` and `final-observed` phases;
5. stops and flushes capture before sending the provider end frame; and
6. cancels capture/transport after failures so the microphone does not continue without a stream.

This intentionally does not define Person 2's HTTP response shape. The accepted Zod stream-capability schema must parse the future API response and map it into `StreamStartOptions`.

## Local browser simulation

Mock mode uses `frontend/src/services/fakeTranscribeSocket.ts` with the real stream client. The tested local flow is:

```text
real microphone
  → real AudioWorklet/resampling
  → real PCM chunks
  → real stream adapter
  → real EventStream encoder and lifecycle client
  → browser-local fake provider
  → simulated partial/final captions
```

The fixed caption `Microphone PCM reached the local stream client.` proves PCM routing and result mapping only. It does not recognize speech, contact AWS, use a presigned URL, save transcript text, or verify deployed behavior. The UI labels these results `Simulated`; finals remain `Final observed`, never `Saved`, because no persistence API acknowledged them.

## Public lifecycle

The intended integration order is:

```ts
const client = new TranscribeStreamClient(handlers);

await client.start({ url, streamEpoch });
client.sendAudio(pcmChunk);
await client.stop();
```

- `url` is a sensitive replayable bearer capability and must not enter logs, analytics, storage, navigation, or error text.
- `sendAudio` returns `false` when a chunk is rejected. Overload and protocol failures are also surfaced through safe error handlers.
- `stop` is graceful: stop microphone intake first, allow its final flush, drain the bounded accepted queue, send the empty `AudioEvent`, and wait within the terminal-result deadline.
- `cancel` closes immediately and does not claim a graceful provider stop.
- Reconnect is not automatic URL reuse. Request a fresh API-authorized URL/epoch, then call `start` again for the same logical application session.
- Emitted finals are client-observed provider results. They become durable only after Person 2's segment API acknowledges them.

## Verification

From the repository root:

```bash
npm ci
npx vitest run packages/stream-client
npm run check
```

At the current checkpoint, the focused package suite has 20 tests and the repository suite has 34 tests across 9 files. Normal tests use fake WebSockets and make no AWS or external network calls.

For the visible local test, start the frontend in mock mode:

```bash
npm run dev --workspace @live-transcription/frontend
```

Open the live-transcription page, press **Test microphone**, grant permission, and confirm that the PCM count increases and clearly simulated partial/final captions appear. Stop the microphone after the check. Raw PCM is not persisted or sent over the network in this local path.

## Remaining Phase 1 work

- accept Person 2's reviewed Zod stream-capability response and map it into `StreamStartOptions`;
- replace the local fake capability/provider with the real authenticated signing endpoint and supplied WSS URL;
- run a short approval-gated AWS browser smoke test;
- verify expired/rejected signing, provider rejection, microphone denial, network interruption, and fresh-epoch reconnect in the integrated UI;
- connect final results to the idempotent segment-upload API and show `Saved` only after acknowledgment; and
- execute accelerated local soak/cleanup checks followed by the approved bounded one-hour browser run.

Recorded-file batch transcription, raw-audio storage, seamless audio replay, multi-provider support, summaries, and production tuning remain outside this Phase 1 package assignment.
