# Shared Contracts — Phase 1

Status: reusable PCM constants exist; the first Phase 1 Zod schemas (error envelope, session) are drafted for review and not yet accepted by the team. The remaining schemas are still to do. See [Progress and change log](#progress-and-change-log).

`src/audio-format.ts` defines the mono 16 kHz signed 16-bit PCM/100 ms capture target. It is not a WebSocket frame or resampler. Phase 1 defines no custom application audio header.

Persons 2 and 3 co-own the initial contract PR with Persons 1/4 review. Implement and test the smallest shared schemas from `API_CONTRACTS.md`:

- stable error envelope and codes;
- session/state/page schemas;
- create/read/list/rename session inputs and outputs;
- stream URL response and approved audio settings;
- final-segment upload and acknowledgment;
- completion and deletion responses.

Infer TypeScript types from Zod and validate unknown input at boundaries. Generate OpenAPI only after the subset is accepted; never hand-maintain competing snapshots. Provider EventStream models stay inside `packages/stream-client`.

Recorded upload, summaries, exports, raw audio, and provider wire schemas are not Phase 1 contracts.

## Progress and change log

Update this section whenever a schema is added, changed, or accepted. Schemas marked `DRAFT` are proposals for contract review, not accepted contracts. Bounds marked as placeholders are not agreed values.

| Schema | File | Status | Notes |
|---|---|---|---|
| PCM audio constants | `src/audio-format.ts` | Existing | Unchanged. |
| Error envelope and codes | `src/errors.ts` | `DRAFT` | `{ error: { code, message } }`, the nine documented codes, `createErrorEnvelope` helper. Message capped at 200 characters (placeholder). HTTP status mapping is intentionally not defined here. |
| Session, create request, list query, page | `src/session.ts` | `DRAFT` | States from ADR-011 (`CREATED`, `STREAMING`, `COMPLETED`, `DELETING`, `FAILED`). Create request never accepts an owner or state. Placeholder bounds: title 120 characters, ID 128, page size default 20 and max 50, cursor 512. Language is validated by shape only; the approved list is still TBD. |
| Stream URL request, response and audio settings | `src/stream-url.ts` | `DRAFT` | Empty request body. Response carries the `wss://` URL (host must be Amazon Transcribe streaming), `expiresAt` and `expiresInSeconds` (1–300, AWS maximum), `streamEpoch` (at least 1), and PCM 16 kHz parameters. Proposed default expiry 60 seconds (decision queue blocker 3), not accepted. The URL is sensitive: `Cache-Control: no-store` is a handler duty the schema cannot enforce. Rejects fields that could carry a secret. |
| Final-segment upload and acknowledgment | `src/segments.ts` | `DRAFT` | Batch of finals identified by (`streamEpoch`, `providerResultId`) with relative times and text; per-item results `SAVED`, `DUPLICATE` or `REJECTED` (reasons `EPOCH_NOT_ISSUED`, `IDENTITY_CONFLICT`). Placeholder bounds: 25 finals per batch, 2000 characters, 128-character result ID. The idempotency key header is outside the body schema and still needs team agreement (decision queue blocker 4). |
| Completion and deletion responses | — | To do | |
| Rename session | — | Open | Not in the ADR-011 journey; confirm whether it is in Phase 1 before adding. |

### Design notes

- Object schemas use `z.strictObject`, so unknown fields are rejected. This keeps client-supplied `userId`, `owner` or `state` out of requests. It also means an older client would reject a response that gains a new field; review this against the "additive changes stay in v1" rule in `API_CONTRACTS.md`.
- The public session shape omits the owner identity and the internal version counter. The owner comes from validated Cognito claims, and the version is a persistence concern for review with Person 4.
- `completedAt` is omitted, not `null`, until a session completes. Reconsider if consumers prefer `null`.
- Open team decision: what "stale epoch" means for uploads. ADR-011 requires stale-epoch rejection but does not define it. Rejecting every upload below the current epoch would discard finals the browser already received and retried after a reconnect. Proposed: accept uploads for any epoch the API has issued (at or below the current one) while the session is open, deduplicated by identity; reject an epoch above the current one (`EPOCH_NOT_ISSUED`) and uploads to a completed or deleting session. This is handler logic, not enforced by the schema.
- Segment results are per item so the browser knows exactly which finals to retry. `SAVED` and `DUPLICATE` both mean durably stored; the UI may show "saved" for either.

### Change history

| Date | Change |
|---|---|
| 2026-11-06 | Added draft error envelope schema and tests. |
| 2026-11-06 | Added draft session, create-request, list-query and page schemas and tests. |
| 2026-11-06 | Added draft stream-URL request and response schemas and tests. |
| 2026-11-06 | Added draft final-segment upload request and per-item response schemas and tests. |
