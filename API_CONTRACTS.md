# Option A Application Contracts

Status: `PROPOSED` review reference; no HTTP API or structured Zod schemas are implemented. API prefix: `/v1`. Last reviewed: 2026-11-05.

Zod 4 definitions in `packages/contracts` will be the source of truth for structured application inputs and outputs under [ADR-008](docs/adr/008-runtime-contract-schemas.md). This document describes semantics. The browser-to-Transcribe WebSocket uses **Amazon's protocol**, not an application WebSocket envelope; see [docs/streaming-protocol.md](docs/streaming-protocol.md). Existing OpenAPI/JSON snapshots from Option B are removed until generated from accepted Zod schemas.

## Shared rules

- Every application route except authentication is HTTPS and requires a Cognito access token validated by API Gateway. Lambda derives the owner from validated claims, never a body/path `userId`.
- IDs and cursors are opaque. Owner mismatch should not expose another user's resource. Inputs, persisted records, and output are validated at boundaries.
- UTC timestamps describe wall-clock events; provider-relative segment times and a logical session/stream epoch are separate.
- Stable errors use `{ "error": { "code": "STRING_CODE", "message": "safe message" } }`. Initial codes: `UNAUTHORIZED`, `NOT_FOUND`, `INVALID_INPUT`, `STATE_CONFLICT`, `RATE_LIMITED`, `CAPACITY_LIMIT`, `SIGNING_FAILED`, `EXPORT_NOT_READY`, `INTERNAL_ERROR`. Exact status mapping is `TBD` before schema freeze.
- A presigned URL is secret-equivalent until expiry: return it only in a non-cacheable response; never log, persist, or put it in analytics. It can contain an IAM credential identifier and temporary session token, but must never expose the secret access key or derived signing key. It authorizes a Transcribe connection but is not a one-time application ticket.
- An idempotency key is required for creation and final uploads. The exact header/field, expiry, and conflict response are `TBD` for contract review.

## Proposed HTTP surface

| Route | Intent | Key behavior |
|---|---|---|
| `POST /v1/sessions` | Create an owned session | Select approved language/configuration; return opaque ID and initial state |
| `GET /v1/sessions` | List own sessions | Newest first, bounded page, opaque cursor |
| `GET /v1/sessions/{sessionId}` | Read own session | Metadata, save/export state, paginated saved finals |
| `PATCH /v1/sessions/{sessionId}` | Rename | Conditional/idempotent update |
| `POST /v1/sessions/{sessionId}/stream-url` | Request direct Transcribe URL | Verify owner/state/admission; return short-lived `wss://` URL, expiry, approved stream parameters and epoch; `Cache-Control: no-store` |
| `POST /v1/sessions/{sessionId}/segments` | Save final result(s) | Authenticated browser upload; validate bounds, epoch, result identity, timing and text; deduplicate; acknowledge durable save |
| `POST /v1/sessions/{sessionId}/complete` | Request completion/export | Browser calls after provider stream ends and observed finals are save-acknowledged; idempotent transition; do not report completed export until durable |
| `GET /v1/sessions/{sessionId}/download?format=txt\|json` | Download own export | Owner check; only when ready; short-lived authorized download |
| `DELETE /v1/sessions/{sessionId}` | Delete own session | Immediately deny reads, retry physical removal |

The shapes, pagination limits, state names/transitions, batch size, timing rules, and upload retry window are `TBD` and require Persons 1–4 review before implementation. Do not independently invent handler-local and browser-local variants.

## Final upload trust rule

A final segment may include `sessionId`, `streamEpoch`, `providerResultId`, provider-relative start/end, text, and a client-generated idempotency key. Those fields help deduplication and ordering; **none proves provider origin**. Partial results are not persisted. The UI distinguishes final observed from save acknowledged. A tab crash can lose unacknowledged finals. Export contains only acknowledged saved finals, with provenance `client-uploaded`; completion cannot prove the browser submitted every provider final.

## Compatibility

Additive compatible changes stay in v1. Breaking changes require a new version and migration plan. Public contract, persistence, and browser changes need affected-owner review and an ADR when they change trust or lifecycle semantics.
