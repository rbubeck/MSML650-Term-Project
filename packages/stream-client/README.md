# Browser Stream Client

Status: npm workspace boundary only; no stream-client implementation exists.

Owners: Person 1 for browser integration; Person 3 for protocol/audio requirements

This package will hide the application WebSocket protocol from React components. Its public API will expose connection state, start/stop, audio submission, partial/final captions, warnings, errors and reconnect requests without leaking AWS provider types.

## Non-negotiable boundaries

- import audio framing/constants from `@live-transcription/contracts`;
- never contain AWS credentials, SigV4, Amazon EventStream or Transcribe SDK models;
- validate JSON network messages through shared runtime schemas;
- use bounded queues and explicit cancellation; never buffer microphone audio indefinitely;
- distinguish partial, final-observed and durably checkpointed states;
- keep logical session identity separate from reconnect/provider epochs.

## Next actions

1. Persons 1 and 3 freeze the smallest WebSocket v1 subset after ADR-001/ADR-002/ADR-003 review.
2. Define a small UI-facing interface and state transition tests before React integration.
3. Test against a local fake WebSocket service, including malformed messages, sequence gaps, close codes, backpressure and reconnect requests.
4. Integrate AudioWorklet frames only after its resampler passes the shared golden vectors.

Do not code reconnect/ticket behavior from proposed ADRs as if it were final.
