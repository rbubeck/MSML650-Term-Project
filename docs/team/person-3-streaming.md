# Person 3 — Direct Browser Streaming

## Objective

Deliver the browser WebSocket/Amazon EventStream data plane and its reviewed frontend integration, including bounded buffering, stop and reconnect behavior.

## Owned paths

- `packages/stream-client/`
- Reviewed integration changes in `frontend/src/services/` and capture handoff code with Person 1
- Co-ownership of `packages/contracts/` with Person 2

## Current implementation

EventStream framing/decoding, CRC validation, provider parsing, bounded queues, slow-socket handling, stop/cancel, safe errors, epoch-scoped results and reconnect-capable lifecycle are implemented and fake-tested. A prior real browser stream succeeded. The current frontend merge removed the direct adapter/dependency, so captured PCM is not reaching this package.

## Required MVP deliverables

1. Restore the frontend package dependency and direct-stream adapter with Person 1 review.
2. Accept PCM from microphone-only, system-only or browser-mixed capture; do not create a third “Both” UI option.
3. Open the supplied signed URL before starting capture and send every accepted PCM chunk as EventStream audio.
4. Preserve `streamEpoch`, provider `resultId`, timing and text in final handoff.
5. Stop intake, drain the bounded queue, send the empty provider end frame, and surface timeouts/errors.
6. On unexpected disconnect, surface interruption and request a fresh API URL/epoch for the same application session.
7. Reject stale-socket events and never intentionally reuse a signed URL.
8. Add integration tests for the current multi-source capture adapter and reconnect orchestration.

## Dependencies and handoffs

- Receives mono 16 kHz signed 16-bit PCM and capture lifecycle from Person 1.
- Receives an authenticated, validated `{ url, streamEpoch }` capability from Person 2's API boundary.
- Gives Person 1 partial/final/error/disconnect events.
- Gives Person 5 deterministic provider/socket fixtures and failure cases.

Person 3 and Person 1 must jointly review the adapter; Person 2 reviews any stream-capability contract change.

## AWS access

Use `BackendDevelopers` / `CloudScribe-BackendDeveloper` when inspecting or updating the approved signer/API integration, and `Observers` / `CloudScribe-Observer` for logs and metrics. The human identity does not need direct Transcribe credentials. Lambda signs with its execution role and the browser receives only the short-lived URL.

## Local testing

Test protocol corruption, provider exceptions, overload, slow sockets, connection/stop deadlines, cancel, graceful end, stale events and reconnect with fake WebSockets. Run `npm run check` before handoff.

## Approved AWS testing

Use an approved Cognito test user and development API. Do not log or persist the URL, audio, transcript, token or raw provider body. A short smoke precedes any approved long run.

## Definition of done

- Current frontend PCM reaches the real stream client in local integration.
- Partial/final events contain stable epoch/result identity.
- Forced disconnect obtains a fresh URL/epoch without creating a new logical session.
- Queue/memory behavior is bounded and visible under failure.
- Person 1 and Person 5 can consume the reviewed interface and fixtures.

## Out of scope

Microphone UX ownership, API signing, persistence, transcript save acknowledgment, backend audio streaming, recorded uploads and raw-audio storage.
