# Person 1 — Frontend Application

## Objective

Deliver the authenticated browser journey: sign in, create a session, select audio sources, see partial/final/save states, stop and complete, reopen history, rename, and delete.

## Owned paths

- `frontend/`
- Review, but do not independently redefine, `packages/contracts/` or `packages/stream-client/` public interfaces.

## Current implementation

React/Vite UI, Cognito operations, mock sessions, caption paragraphs, local PCM preparation, and microphone/meeting capture exist. The current branch does not connect PCM to `@live-transcription/stream-client`; its pending adapter fails closed and AWS session/history actions remain placeholders.

## Required MVP deliverables

1. Replace source radio choices with independent **Microphone** and **System/meeting audio** selections.
2. Disable start when neither source is selected; derive mic-only, system-only, or mixed capture in the browser without a third “Both” option.
3. Restore the reviewed direct-stream frontend adapter and package dependency with Person 3.
4. Use shared Zod schemas to parse API responses; never place the signed URL in React state, storage, logs, analytics, or navigation.
5. Create sessions through the API instead of a fixed environment session ID.
6. Keep partial, final-observed, saving, save-acknowledged and save-failed states distinct.
7. Upload finals idempotently, complete after stop/uploads settle, load history, rename, and delete.
8. Render transcript content as untrusted text and provide accessible errors/connection state.

## Dependencies and handoffs

- Receives the stream client/UI event contract from Person 3.
- Receives authenticated handlers and parsed API contracts from Person 2.
- Uses Person 4's persistence only through Person 2's API.
- Gives Person 5 a deterministic fake-backed browser journey and test hooks.

Coordinate with Person 3 before changing PCM chunk ownership, stream start/stop ordering, disconnect or reconnect behavior.

## AWS access

Normal work requires a Cognito application test user, public frontend configuration, and the deployed API URL—not AWS administrator access. Optional `CloudScribe-Observer` access may be assigned for privacy-safe CloudWatch troubleshooting. Follow `docs/runbooks/aws-team-access.md`.

## Local testing

- Use mock identity/API/provider fixtures for normal tests.
- Cover source selection, permission cancellation, missing shared audio, capture cleanup, captions and save-state transitions.
- Run `npm run check` before handoff.

## Approved AWS testing

Use only the approved development environment. Verify Cognito sign-in, browser permissions, CORS, direct streaming and API behavior. Never create resources, expose secrets, log signed URLs, or record real participant audio without consent and approval.

## Definition of done

- One browser completes create-to-delete against fakes.
- Mic-only, system-only and mixed source cases are tested; neither-selected cannot start.
- Saved state appears only after API acknowledgment.
- History survives reload through the API, and deletion removes/denies the session.
- Person 3 reviews streaming integration; Person 2 reviews API consumption; Person 5 can run the journey.

## Out of scope

Recorded uploads, exports, summaries, shared rooms, raw-audio storage, provider protocol implementation in React, and production-scale hosting.
