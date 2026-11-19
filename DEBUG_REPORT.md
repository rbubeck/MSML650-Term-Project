# Frontend Audio Capture and Live Transcription Debug Report

Date: 2026-11-10  
Affected owners: Person 1 (frontend), Person 3 (stream client), with Person 2 review for the stream-URL handoff  
Current branch: `nandan/live-transcription-integration` at merge commit `9b9ee24`

## Executive summary

The current frontend can prepare local PCM from shared system/meeting audio and, optionally, the microphone, but it cannot generate live transcription. The audio callback in `frontend/src/App.tsx` deliberately discards every PCM chunk, and the merge removed the frontend adapter that connected those chunks to `@live-transcription/stream-client`. The stream-client package itself is still present and tested; the regression is in the frontend wiring.

The current UI also removed microphone-only capture. Its capture mode type contains only `both` and `meeting`, and both modes require `getDisplayMedia`. The intended product behavior is to treat microphone and system/shared audio as two independent sources with exactly two user-facing selectors:

1. A **Microphone** checkbox or toggle.
2. A **System/shared audio** checkbox or toggle.

There must not be a third **Both** option. When both selectors are enabled, the browser derives the combined state and mixes both sources automatically.

The frontend owner does not need AWS credentials or access to the configured Cognito account to repair and test this integration. Mock mode must use a local fake stream capability and fake Transcribe WebSocket while exercising the real capture-to-EventStream path. A teammate with the configured account should perform the final AWS smoke check only after the AWS-free checks pass.

## Expected Option A data flow

Continuous audio must remain in the browser-to-Transcribe data plane:

```text
selected browser audio source(s)
  -> one mixed mono PCM stream
  -> 16 kHz signed 16-bit little-endian, 100 ms chunks
  -> TranscribeStreamClient.sendAudio(...)
  -> Amazon EventStream frames
  -> direct presigned WebSocket to Amazon Transcribe
  -> partial/final results
  -> frontend captions
```

The application API is only the control plane. It authenticates the user and returns the short-lived presigned WebSocket URL and `streamEpoch`. Audio must not be sent through API Gateway, Lambda, or another application audio proxy.

## What changed

The relevant commit sequence is:

- `8d64a2e`: connected microphone PCM to a local fake provider through the real stream client.
- `4c01404`: connected the authenticated frontend to the stream-URL API and verified real direct browser-to-Transcribe captions in `us-east-2` on 2026-11-07.
- `ff80591`: added microphone-plus-meeting and meeting-only capture on a frontend branch that did not yet contain the latest streaming integration.
- `9b9ee24`: merged current `main` into that feature branch while “preserving feature frontend.” The result retained the new meeting-audio UI but not the already implemented frontend streaming connection from `main`.

Relative to the integrated `main` parent (`ed859a0`), the merge removed or changed the following important pieces:

- Deleted `frontend/src/services/directStreamAdapter.ts` and its tests.
- Deleted `frontend/src/services/fakeTranscribeSocket.ts` and its tests.
- Removed the `@live-transcription/stream-client` frontend dependency and TypeScript path mapping.
- Removed `VITE_LIVE_SESSION_ID`, which was the temporary owned-session input for the narrow AWS smoke path.
- Replaced validated `TeamApi.requestStreamCapability(sessionId)` behavior with a method that accepts an unapproved request shape and returns `unknown`.
- Replaced the live stream start/stop flow in `App.tsx` with local-only `MeetingSessionCapture`.
- Restored stale UI text claiming the shared streaming client is not implemented.
- Replaced the accurate frontend README with a seven-line placeholder that incorrectly says no React or browser-capture implementation exists.

Do not revert the whole frontend or discard the new system-audio and paragraph-display work. Restore the missing integration selectively, using the `ed859a0` or `4c01404` versions as references and adapting them to the new capture-source design.

## Confirmed root causes

### 1. PCM is generated and then discarded

`MeetingSessionCapture` calls its `onChunk` callback with valid PCM. However, the callback supplied in `App.tsx` is empty except for comments saying that PCM is intentionally discarded. No call to `TranscribeStreamClient.sendAudio` can occur, so no provider transcript event can return.

This is the immediate reason live transcription is not generated.

### 2. The frontend transport adapter was removed

The previous `DirectStreamAdapter` performed the missing bridge:

- requested a validated `{ url, streamEpoch }` capability;
- opened `TranscribeStreamClient`;
- forwarded every accepted PCM chunk;
- mapped provider partial/final events into UI caption phases;
- stopped capture before sending the provider end frame; and
- cancelled capture and transport together on failures.

The `packages/stream-client` implementation was not removed. Only its frontend consumer disappeared.

### 3. Microphone-only capture is no longer reachable

`MeetingCaptureMode` is currently:

```ts
type MeetingCaptureMode = 'both' | 'meeting';
```

`MeetingSessionCapture.start()` always requests `getDisplayMedia` and requires a live shared-audio track. It requests `getUserMedia` only when the mode is `both`. Therefore:

- `meeting` means shared system/tab/window audio only;
- `both` means shared audio plus microphone; and
- there is no microphone-only path, even though `MicrophoneCapture` still exists.

### 4. Mock mode no longer tests the real transcription boundary

The removed fake provider accepted real EventStream audio frames and emitted deterministic fake `TranscriptEvent` messages. That proved PCM routing, EventStream encoding/decoding, and caption mapping without AWS. The current sample-caption timer does not prove any of those boundaries.

### 5. The stream-URL response is no longer validated

The working integration parsed the response with the shared `streamUrlResponseSchema`, checked that the returned `sessionId` matched the requested session, and returned only the validated capability to the adapter. The current method returns `unknown` and asks the caller for an unapproved request body. This breaks the agreed Zod boundary and cannot safely feed the stream client.

## Required repair design

### A. Model two independent source selectors

The UI must expose only two booleans, using checkboxes or toggle controls. For example:

```ts
interface AudioSourceSelection {
  microphone: boolean;
  system: boolean;
}
```

Expected source acquisition is derived from those two values:

| Microphone | System/shared audio | `getUserMedia` | `getDisplayMedia` | Output |
|---:|---:|---:|---:|---|
| On | Off | Yes | No | Microphone PCM |
| Off | On | No | Yes | Selected tab/window/screen audio PCM |
| On | On | Yes | Yes | Mixed microphone and shared-audio PCM |
| Off | Off | No | No | Invalid; disable Start and ask the user to select a source |

Do not add a third **Both** radio button, checkbox, card, or other user-facing option. The combined behavior is simply the `microphone: true, system: true` state. The implementation may derive an internal value for mixer logic, but that value must not become a third UI choice.

The browser picker controls which system/shared audio is actually available. If it returns no audio track, fail with a clear message instructing the user to choose a shareable source and enable **Share audio**. Do not silently fall back to a different source.

Keep every valid selection identical at the stream boundary: mono, 16 kHz, signed 16-bit little-endian PCM in the existing bounded 100 ms chunks.

### B. Preserve browser user activation for system audio

`getDisplayMedia` must be initiated directly from the Start button interaction. The old adapter opened the transport before starting microphone capture; copying that ordering unchanged may cause the system-audio picker to fail because awaiting the capability request or WebSocket connection can consume the browser's transient user activation.

Refactor capture into two phases:

1. `acquire()` starts the required permission/picker request immediately from the click handler and obtains the selected media tracks. It must not yet emit PCM.
2. Request and validate the stream capability, then open `TranscribeStreamClient`.
3. `startProcessing(onChunk)` connects the acquired tracks to the mixer/AudioWorklet only after the transport is open.
4. On any capability or transport failure, stop every acquired track and close the audio context.

Equivalent naming is acceptable, but the properties are required: invoke the picker under user activation, do not lose early audio, and do not continue capture without a working transport.

When only the microphone selector is enabled, acquisition must not open the display-sharing picker.

### C. Restore a capture-agnostic stream adapter

Restore `DirectStreamAdapter`, but do not hard-code `MicrophoneCapture`. Inject a capture implementation or factory conforming to a small interface. The adapter should not need to know whether PCM came from the microphone, shared audio, or a mix.

The adapter must:

- accept the two-source selection or a capture factory built from it;
- acquire the requested browser source(s);
- obtain a fresh validated stream capability;
- start `TranscribeStreamClient` with `{ url, streamEpoch }`;
- forward PCM to `sendAudio` and surface a rejected chunk/overload as an error;
- retain `streamEpoch`, `resultId`, `startMs`, `endMs`, and text on emitted captions;
- map partials to `partial` and finals to `final-observed`;
- stop source intake, flush the AudioWorklet, drain accepted transport data, and then send the empty provider end frame;
- cancel the transport and release all media tracks on startup/runtime failure; and
- report unexpected disconnects without claiming that transcription continued.

Do not log the presigned URL, JWT, transcript text, raw PCM, or user identifiers.

### D. Restore the typed API capability handoff

Restore the `@live-transcription/stream-client` frontend dependency and TypeScript path mapping. Restore `TeamApi.requestStreamCapability(sessionId)` so that it:

- sends `POST /v1/sessions/{sessionId}/stream-url` with no client-selected PCM or signing parameters;
- obtains the Cognito access token through the existing auth provider;
- parses the response with `streamUrlResponseSchema`;
- rejects a mismatched `sessionId`;
- never includes the sensitive URL or Zod input dump in an error; and
- returns the validated response directly to the adapter without putting the URL in React state, storage, navigation, analytics, or logs.

The temporary `VITE_LIVE_SESSION_ID` path can be restored only for the already documented narrow development smoke until create-session is connected. It must remain in untracked local configuration and must not contain an identity, token, URL, or secret.

### E. Restore real caption event handling

Replace the no-op PCM callback with the repaired stream adapter. Provider events must update the current caption by stable identity rather than append every partial revision as a new caption.

Use an identity containing at least:

```text
streamEpoch + resultId
```

Preserve timing metadata for the later segment-save API. A final received from Transcribe is only `final-observed`; it is not `save-acknowledged` until the backend persistence endpoint confirms it.

Update the stale banners and status text so they distinguish:

- local fake streaming;
- connecting/acquiring sources;
- live AWS transcription;
- interrupted/failed transport; and
- final observed versus durably saved.

Do not claim that persistence, automatic reconnect, or the full MVP is complete.

## AWS-free implementation and test plan

The frontend owner does not need the shared AWS account, Cognito login, or a real presigned URL for the following work.

### Unit tests for source selection

Stub `navigator.mediaDevices` and verify:

- microphone enabled and system disabled calls `getUserMedia` and never calls `getDisplayMedia`;
- system enabled and microphone disabled calls `getDisplayMedia` and never calls `getUserMedia`;
- both selectors enabled calls both APIs and mixes both sources;
- both selectors disabled prevents startup without requesting either permission;
- no shared audio track produces a clear failure and releases the selected video track;
- permission rejection releases any already acquired tracks;
- ending the shared track stops capture and reports interruption;
- stop is idempotent and releases microphone, audio, and display tracks;
- output status reports the correct source levels; and
- every valid source selection emits the same PCM format and preserves flush behavior.

### Integration tests with the real stream client and fake provider

Restore/adapt `FakeTranscribeSocket` and test this complete local path:

```text
fake or browser capture PCM
  -> repaired DirectStreamAdapter
  -> real TranscribeStreamClient
  -> real EventStream AudioEvent encoding
  -> FakeTranscribeSocket
  -> fake TranscriptEvent EventStream frame
  -> real provider-message decoder
  -> UI partial/final caption event
```

At minimum, test:

- PCM arrival produces one partial and one final simulated caption;
- microphone-only, system-only, and the derived combined state use the same transport boundary;
- a rejected/overloaded PCM chunk becomes a visible safe failure;
- startup failure stops acquired media tracks;
- graceful stop flushes capture before the provider end frame;
- unexpected disconnect stops capture and is surfaced once;
- stale events from an earlier stream epoch are ignored; and
- signed capability URLs never appear in thrown messages or captured logs.

The fake provider may emit fixed text after receiving a known number of valid audio frames. It does not need speech recognition. The UI must label this output as simulated and must not label it saved.

### Local manual checks

In mock mode, the frontend owner can verify without AWS:

1. Enable only **Microphone**, grant microphone permission, and confirm PCM counts/levels and simulated captions.
2. Enable only **System/shared audio**, choose a tab/window/screen with audio enabled, play sound, and confirm shared-audio levels, PCM counts, and simulated captions.
3. Enable both existing selectors—without adding a third option—grant both permissions, and confirm both level meters contribute to the mixed PCM stream.
4. Stop each selection and confirm browser capture indicators and tracks end.
5. Deny each permission in turn and confirm a safe, actionable error with no continuing capture.
6. End sharing from the browser control and confirm the UI reports interruption and releases the transport.

Run the repository checks before handoff:

```bash
npx vitest run frontend packages/stream-client
npm run check
```

Normal tests must not call AWS or any external network.

## AWS validation handoff

After the AWS-free suite passes, provide the commit to the teammate who has the configured development account. That teammate should use the existing untracked environment values and approved `us-east-2` development stack to perform a short, bounded smoke check.

Check each supported source selection separately where the chosen browser/OS exposes that audio source:

1. Sign in with the approved test Cognito account.
2. Use the deliberately configured owned session.
3. Start capture and verify a fresh stream URL/epoch is requested.
4. Speak or play known audio and observe real partial and final captions.
5. Stop and verify the stream closes cleanly.
6. Confirm the console/network diagnostics do not expose a JWT or presigned URL.

Record the browser, OS, Region, selected source type, and observed result. Browser/OS support for shared system audio must be reported as evidence, not assumed from microphone-only success.

This smoke check does not prove durable segment saving, history, deletion, reconnect recovery, two-user isolation, or the one-hour target.

## Acceptance criteria for this repair

- The UI contains exactly two independent source selectors: microphone and system/shared audio.
- Microphone-only does not open a screen-sharing picker.
- System/shared-audio-only does not request microphone permission.
- Enabling both selectors mixes both inputs into one bounded PCM stream in the browser.
- Mock mode routes PCM through the real stream client and displays clearly simulated partial/final captions without AWS.
- AWS mode routes PCM through the same adapter using a validated short-lived capability.
- The frontend no longer discards PCM during an active transcription session.
- Start, stop, permission failure, provider failure, and unexpected disconnect release all media resources.
- Caption events retain epoch, result identity, timing, text, and partial/final-observed state.
- No audio proxy, raw-audio persistence, secret key exposure, URL logging, or unsupported durability claim is introduced.
- `npm run check` passes.

## Scope and review note

The accepted Phase 1 documents explicitly require microphone capture. System/shared-audio capture is now also a stated product requirement, but its browser support and participant-consent implications need affected-owner review. This repair must preserve the accepted Option A trust boundary and must not delay or remove microphone-only support. If the team treats system audio as a formal Phase 1 requirement rather than an optional capture-source extension, record that scope/consent decision in an ADR update before claiming Phase 1 acceptance.
