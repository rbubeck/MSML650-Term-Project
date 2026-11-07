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

### Open items to revisit

Tick an item off, and note the decision here, once the team has settled it. Until then, every value below is a proposal.

- [ ] **Idempotency-Key header** (`src/segments.ts`; also create-session): header name, which routes require it, retention window, and the conflict response (proposed: same key with a different body returns 409). Not described by the body schemas. Decision queue blocker 4.
- [ ] **Stale-epoch rule** (handler logic, not schema): proposed to accept any issued epoch at or below the current one while the session is open, reject a higher one (`EPOCH_NOT_ISSUED`), and reject uploads to completed or deleting sessions. Needs team agreement and handler tests (Person 2).
- [ ] **Segment bounds** (`src/segments.ts`): 25 finals per batch, 2000 characters of text, 128-character result ID, 24-hour cap on relative times.
- [ ] **Segment rejection reasons** (`src/segments.ts`): only `EPOCH_NOT_ISSUED` and `IDENTITY_CONFLICT` exist; confirm the final set.
- [ ] **Stream URL expiry** (`src/stream-url.ts`): 60 seconds is proposed and needs to be verified against real Transcribe behavior (clock skew, slow connections). AWS maximum is 300.
- [ ] **Stream URL length cap** (`src/stream-url.ts`): 4096 characters is a guess; measure a real presigned URL that includes a session token.
- [ ] **Stream URL host** (`src/stream-url.ts`): any AWS Region is accepted today; tighten to the approved Region once decided (decision queue blocker 1).
- [ ] **`expiresAt` versus `expiresInSeconds`**: both are returned; decide whether to keep both.
- [ ] **Session bounds** (`src/session.ts`): title 120 characters, ID 128, page size default 20 and max 50, cursor 512.
- [ ] **Language list** (`src/session.ts`): validated by shape only; the approved languages are TBD and must be enforced in the handler.
- [ ] **Session response details**: default title when none is given; `completedAt` omitted versus `null`; whether to expose a version counter (review with Person 4).
- [ ] **Error message cap and HTTP statuses** (`src/errors.ts`): 200 characters is a placeholder; the code-to-status mapping is undecided.
- [ ] **Strict schemas versus additive changes**: `z.strictObject` rejects unknown response fields, which conflicts with "additive changes stay in v1" in `API_CONTRACTS.md`.
- [ ] **Rename in Phase 1**: not in the ADR-011 journey; add a schema only if it is in scope.
- [ ] **Schemas still to write**: completion and deletion responses.
- [ ] **Handler duties the schemas cannot enforce**: `Cache-Control: no-store` on the stream-URL response, ownership and state checks, epoch rules, parsing responses before returning them, and never logging URLs, tokens or transcript text.

### Change history

| Date | Change |
|---|---|
| 2026-11-06 | Added draft error envelope schema and tests. |
| 2026-11-06 | Added draft session, create-request, list-query and page schemas and tests. |
| 2026-11-06 | Added draft stream-URL request and response schemas and tests. |
| 2026-11-06 | Added draft final-segment upload request and per-item response schemas and tests. |
| 2026-11-06 | Added the "Open items to revisit" checklist covering every placeholder and undecided value. |
