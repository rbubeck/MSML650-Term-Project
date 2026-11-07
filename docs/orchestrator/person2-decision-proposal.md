# Backend / Auth Decision Proposal (Person 2)

Status: `PROPOSED`, aligned with [ADR-011](../adr/011-phase-1-live-mvp.md) and the Phase 1 blockers in [decision-queue.md](decision-queue.md). Nothing here is accepted until the team agrees and it is recorded in an ADR or the shared contracts. Related: [API_CONTRACTS.md](../../API_CONTRACTS.md), [data-model.md](../data-model.md), [security.md](../security.md).

Already decided by ADR-011, so not reopened here: session states `CREATED`, `STREAMING`, `COMPLETED`, `DELETING` (plus optional `FAILED`); reconnect creates a new stream epoch inside the same session; DynamoDB only (no S3 in Phase 1); `client-uploaded` provenance; recorded upload, S3 export, derived features and load testing are deferred.

## Proposals for the six Phase 1 blockers

| # | Queue blocker | Proposal | Sign-off |
|---|---|---|---|
| 1 | Integration environment | One shared account in `us-east-1` (the earlier experiment used it; verify Transcribe streaming and quota). A small Budgets alert with an action, since an alert alone is not a cap. One named deployer and one cleanup owner. | All, P4 leads |
| 2 | Cognito / API configuration | One shared User Pool with a public app client (no secret), SRP and refresh-token flows enabled, email code verification, no MFA. API Gateway HTTP API with a JWT authorizer on every `/v1` route. The API accepts the **access token**; owner is `sub`. CORS origins `http://localhost:5173` and `http://127.0.0.1:5173`; headers `Authorization`, `Content-Type`, and the idempotency header. The authorizer's client/audience setting must be verified against real access-token claims. | P1, P2, P4 |
| 3 | Stream URL policy | Start with the proposed 60 s connection-start expiry and verify it. Fixed parameters only: approved language, PCM, 16 kHz, one Region. Per-user issuance limit. Each issuance increments the session's `streamEpoch`. | P2, P3, P4 |
| 4 | Minimum contract freeze | `Idempotency-Key` header on create and segment upload. A final is identified by session, epoch and provider result ID. An identical retry returns the original result; reuse of a key with a different body returns 409; an upload with a stale epoch is rejected. Error body `{ "error": { "code", "message" } }`. Proposed statuses: 401 `UNAUTHORIZED`, 404 `NOT_FOUND`, 400 `INVALID_INPUT`, 409 `STATE_CONFLICT`, 429 `RATE_LIMITED` / `CAPACITY_LIMIT`, 502 `SIGNING_FAILED`, 500 `INTERNAL_ERROR`. Freeze first: create-session, session, error, segment-upload. Text and batch bounds are set in the schema and enforced in Lambda. | P1, P2, P3, P4 |
| 5 | DynamoDB minimum (P4 leads, P2 reviews) | Records per [data-model.md](../data-model.md): session, final segment, idempotency result. Owner-scoped newest-first history query. Every write conditional on ownership and, for finals, on uniqueness. Foreign session IDs return `NOT_FOUND`. | P2, P4 |
| 6 | Test data and the one-hour run | Approved synthetic or licensed audio. A bounded, separately authorized one-hour acceptance run with a stated cost cap. | All, P5 leads |

## Backend risks specific to a one-hour session
- Cognito access tokens commonly expire after about an hour. Confirm the frontend refreshes the token before signing and upload calls, and test an upload after expiry.
- Each reconnect needs a fresh signed URL and a new epoch. Signing limits must allow normal reconnects without allowing abuse.
- Signed URLs are replayable until expiry, so cost exposure is managed by short expiry, limits and monitoring, not guaranteed by the design.

## Open questions for the team
- Is `us-east-1` acceptable for data residency and Transcribe availability?
- Who owns the shared AWS account and approves spend?
- Is rename in Phase 1? It is in the proposed routes but not in the ADR-011 journey.
- What does "stale epoch" mean for uploads? Proposed: accept uploads for any epoch the API has issued (at or below the current one) while the session is open, so finals the browser received before a reconnect are not discarded; reject a higher epoch and uploads to completed or deleting sessions.
- Which `Idempotency-Key` details do we adopt: header name, routes, retention window, and the response to a reused key with a different body?
- Are the draft bounds acceptable (25 finals per batch, 2000 characters of text, 128-character IDs, page size 20 up to 50) and are `EPOCH_NOT_ISSUED` and `IDENTITY_CONFLICT` the right rejection reasons?
- Full list of placeholder values and handler duties: see "Open items to revisit" in [packages/contracts/README.md](../../packages/contracts/README.md).

## What Person 2 will do next
Write a non-secret Cognito config note (Region, flows, token lifetimes, observed claims), draft the schemas for blocker 4, and scaffold the handler interfaces with fakes and owner-isolation, duplicate-upload and stale-epoch tests. Shared AWS resources will not be created until blocker 1 is agreed.
