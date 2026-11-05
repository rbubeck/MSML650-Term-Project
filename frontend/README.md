# Frontend

Status: npm workspace boundary only; React application and browser capture are not implemented.

Owner: Person 1

This workspace will contain the React/TypeScript application: authentication UX, dashboard, microphone controls, live captions, transcript history, accessibility and user-facing failure states.

The frontend consumes `@live-transcription/contracts` and the future `@live-transcription/stream-client`. It must never implement AWS signing/EventStream framing, receive AWS credentials, call Amazon Transcribe directly or invent a separate session state model.

## Accepted audio requirements

ADR-006 is accepted. AudioWorklet code must produce:

- mono signed 16-bit little-endian PCM;
- 16,000 samples per second;
- exactly 1,600 samples/3,200 PCM bytes per 100 ms payload;
- the shared 16-byte application header via `@live-transcription/contracts`;
- sequence `0` at each stream epoch and a continuous logical-session sample clock;
- zero-padding only for the final short buffer.

Native 44.1/48 kHz browser audio must actually be resampled; changing metadata is not resampling.

## Person 1 next actions

1. Propose/scaffold the React build tool within the accepted Node/npm/TypeScript baseline.
2. Build accessible mocked signup/login, dashboard, session and caption states without depending on deployed AWS.
3. Implement AudioWorklet capture/resampling off the UI thread with golden-vector tests shared with Person 3.
4. Validate silence, clipping, final padding and 44.1/48-to-16 kHz behavior in the supported browser matrix.
5. Integrate only through the reviewed stream-client API after the WebSocket v1 subset is frozen.

Person 1 may work on application shell and audio preparation now. Connection/reconnect behavior must be coordinated with Person 3 and must not assume proposed ADR-001/ADR-004 semantics are accepted.
