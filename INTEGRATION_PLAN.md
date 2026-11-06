# Option A Phase 1 Integration Plan

Status: minimum team implementation plan; no integrated Phase 1 slice or AWS deployment exists.

## Build order

1. **Shared contract PR — Persons 2 and 3, Persons 1/4 review:** implement the Zod session/error/stream-url/final-upload schemas described in `API_CONTRACTS.md`, examples, and contract tests.
2. **Parallel fake-backed components — Persons 1–4:** each owner builds only the interface below using deterministic fakes. No AWS is required.
3. **Local integration — Person 5 coordinates:** connect the frontend, fake stream client, fake API, and fake persistence; prove save acknowledgment, history, reconnect epoch, ownership, and deletion.
4. **Approved AWS integration — Person 4 coordinates:** configure the minimum resources, replace fakes one boundary at a time, and run a short smoke path.
5. **MVP acceptance — Person 5 reports:** execute the bounded one-hour live test plus failure/isolation checks and record actual browser, Region, cost, and limitations.

## Initial assignments

### Person 1 — browser application

Deliver sign-in, session start/stop, microphone permission, PCM capture/resampling, partial/final/saving/saved captions, history list/detail, and delete UI. Integrate only through shared API schemas and Person 3's interface. First demonstrate with fake identity/API/stream events.

### Person 2 — authenticated control API

Deliver fake-backed and then Lambda-compatible handlers for create/list/read/rename session, stream URL issuance, segment save, completion, and deletion. Derive identity, verify ownership/state, validate Zod inputs, and inject signer/repository/clock/ID dependencies.

### Person 3 — direct browser stream client

Deliver a browser-compatible client that accepts PCM, opens a supplied presigned URL, encodes/decodes Amazon EventStream, emits partial/final/error events, bounds buffering, sends the end frame, and supports cancellation/reconnect. Start with fake WebSocket fixtures; do not reuse the Node server adapter as runtime code.

### Person 4 — persistence and minimum AWS resources

Deliver deterministic repository fakes, then DynamoDB adapters for owned sessions and idempotent finals. Prepare an approval-gated setup for Cognito, API Gateway, Lambda IAM, DynamoDB, and privacy-safe CloudWatch. S3 is not required in Phase 1.

### Person 5 — integration and release evidence

Deliver cross-package contract tests, the local vertical journey, two-user isolation, duplicate upload, reconnect, signing rejection, deletion, and privacy tests. Define the approved short and one-hour AWS runs and report evidence without relabeling mocks as deployment proof.

## Required handoffs

| Producer | Consumer | Frozen Phase 1 artifact |
|---|---|---|
| Persons 2/3 | Persons 1/4 | Zod session, error, stream URL, and final upload schemas |
| Person 3 | Person 1 | `start`, PCM input, partial/final/error events, `stop`, reconnect behavior |
| Person 2 | Person 4 | owner-scoped repository methods and conditional-write outcomes |
| Person 4 | Person 2 | deterministic fake and DynamoDB adapter with identical semantics |
| Person 5 | All | fixtures, integration suite, acceptance report template |

## Minimum acceptance

- One authenticated user completes the entire live/history/delete journey.
- A second user cannot list, read, sign, save to, complete, rename, or delete the first user's session.
- Duplicate final upload does not duplicate text.
- One forced disconnect obtains a fresh URL/epoch and keeps acknowledged finals in the same logical session.
- Saved indicators appear only after durable acknowledgment.
- The authorized one-hour run has bounded memory/queue behavior and records disconnects, final-save failures, Region, browser, and estimated cost.
- Logs and metrics contain no signed URL, JWT, audio, transcript text, or user/session identifiers as metric dimensions.

## Later backlog

Recorded-file batch transcription, S3 exports, summaries/derived features, production retention/backups, multi-environment automation, load tests, and broad browser support begin only after this vertical slice works.
