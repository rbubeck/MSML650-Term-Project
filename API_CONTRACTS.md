# Phase 1 Application Contracts

Status: minimum integration contract for Zod implementation and owner review. API prefix: `/v1`. No HTTP handlers or structured schemas are implemented yet.

Zod schemas in `packages/contracts` are the source of truth once implemented. This file fixes the shared Phase 1 semantics so owners do not invent local variants. Amazon EventStream is a provider protocol internal to `packages/stream-client`, not an application WebSocket contract.

## Shared rules

- Every route requires a Cognito access token validated by API Gateway.
- Lambda derives owner identity from validated claims and never accepts `userId` as authorization evidence.
- IDs and cursors are opaque. Foreign resources return the same safe response as missing resources.
- `Idempotency-Key` is required on session creation and final-segment upload. Exact syntax and expiry are finalized in Zod/schema review.
- Responses containing a signed URL use `Cache-Control: no-store` and must never be logged or persisted.
- Stable errors use `{ "error": { "code": "STRING_CODE", "message": "safe message" } }`.
- Minimum error codes are `UNAUTHORIZED`, `NOT_FOUND`, `INVALID_INPUT`, `STATE_CONFLICT`, `RATE_LIMITED`, `CAPACITY_LIMIT`, `SIGNING_FAILED`, and `INTERNAL_ERROR`.

## Session model

Phase 1 durable states are:

```text
CREATED → STREAMING → COMPLETED
    └───────────────→ FAILED
any readable state → DELETING → removed
```

Transport states such as connecting, reconnecting, and disconnected are browser-local. A session has a monotonically increasing `streamEpoch`. Reconnect creates a new epoch; it does not create a new application session.

Minimum public session fields:

- `sessionId`
- `title`
- `languageCode`
- `state`
- `streamEpoch`
- `createdAt`, `updatedAt`, optional `completedAt`
- acknowledged final segments or a bounded/paginated segment page

## HTTP surface

| Route | Phase 1 behavior |
|---|---|
| `POST /v1/sessions` | Create an owned `CREATED` live session for an allowed language |
| `GET /v1/sessions` | List the caller's sessions newest first with a bounded cursor page |
| `GET /v1/sessions/{sessionId}` | Return owned session metadata and acknowledged finals |
| `PATCH /v1/sessions/{sessionId}` | Rename an owned session |
| `POST /v1/sessions/{sessionId}/stream-url` | Authorize a new stream epoch and return a short-lived direct Transcribe URL and approved PCM settings |
| `POST /v1/sessions/{sessionId}/segments` | Idempotently save one or a bounded batch of final segments and return acknowledgments |
| `POST /v1/sessions/{sessionId}/complete` | Idempotently complete after the provider stream ends and observed final uploads settle |
| `DELETE /v1/sessions/{sessionId}` | Deny reads and delete the caller's Phase 1 session/final records |

## Stream URL response

The reviewed Zod response must contain only:

- `sessionId`
- newly authorized `streamEpoch`
- sensitive `url`
- `expiresAt`
- approved `languageCode`, `mediaEncoding`, `sampleRateHz`, and `channels`

It never contains an AWS secret key or derived signing key. The initial proposed connection-start expiry is 60 seconds. Reconnect always requests a fresh response.

## Final segment upload

Each final carries:

- `streamEpoch`
- provider `resultId`
- provider-relative `startMs` and `endMs`
- non-empty bounded `text`

The request idempotency key and `(sessionId, streamEpoch, resultId)` prevent retry duplication. A repeated identical upload acknowledges the existing record; conflicting reuse returns `STATE_CONFLICT`. Provider IDs and text help ordering/deduplication but do not prove provider origin.

The response identifies every accepted or previously saved final so the UI can move it from `final-observed` to `save-acknowledged`.

## Completion and history

The browser calls completion only after sending the provider end frame and settling uploads for finals it observed. `COMPLETED` means the API has closed the application session over its acknowledged records; it does not prove the browser uploaded every provider final.

History returns only owner-checked, acknowledged finals with `client-uploaded` provenance. Partials never appear.

## Deferred contracts

There are no Phase 1 routes for recorded files, S3 exports, summaries, action items, translations, raw audio, shared sessions, or arbitrary user-profile data. Adding them requires a later ADR and contract update.

## Schema freeze checklist

Before Persons 1–4 implement handlers/consumers, their shared contract PR must choose field bounds, pagination limit, idempotency-key syntax/expiry, exact error status mapping, and Zod unknown-field policy. Compatible additions remain v1; breaking changes require versioning and migration.
