# Frontend — Person 1 Phase 1

Status: workspace boundary only; no React application or browser capture implementation exists.

## Initial deliverable

Scaffold the minimal React/Vite browser application and build the browser side of the integrated live MVP:

- Cognito sign-in/sign-out and authenticated API client.
- Start/stop live session controls and microphone consent/error UI.
- AudioWorklet capture, mono conversion, and 44.1/48 kHz to 16 kHz resampling.
- Feed signed 16-bit little-endian PCM to `@live-transcription/stream-client`.
- Accessible partial, final-observed, saving, saved, interrupted, and failed states.
- Session history list/detail, rename, and delete using shared contracts.
- Reconnect messaging that keeps acknowledged finals under the same logical session.

First integrate with fake identity, API, and stream events. Then replace one fake boundary at a time. Keep provider EventStream and signed-URL parsing out of React components.

The UI must not claim an observed final is durable until the API acknowledges it. Never store raw audio or signed URLs, and never render transcript text as HTML.

## Phase 1 handoff

Agree the PCM callback and stream-client event interface with Person 3. Consume only Zod-derived HTTP types agreed with Person 2. Provide Person 5 stable selectors/test seams for start, stop, save state, history, reconnect, and delete.

## Later

Recorded-file upload, summaries, S3 downloads, advanced editing, and broad browser support are not initial assignments.
