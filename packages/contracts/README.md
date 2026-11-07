# Shared Contracts — Phase 1

Status: reusable PCM constants exist; draft Zod schemas for every Phase 1 route are written, aligned with `API_CONTRACTS.md`, and tested locally. They are proposals for review, not accepted contracts, and no handler or consumer uses them yet. See [Progress and change log](#progress-and-change-log).

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
| Error envelope and codes | `src/errors.ts` | `DRAFT` | `{ error: { code, message } }`, the eight Phase 1 codes from `API_CONTRACTS.md` (no `EXPORT_NOT_READY`; exports are deferred), `createErrorEnvelope` helper. Message capped at 200 characters (placeholder). HTTP status mapping is intentionally not defined here. |
| Session, create and rename requests, list query, page | `src/session.ts` | `DRAFT` | Field names follow the spec: `sessionId`, `languageCode`. States from ADR-011 (`CREATED`, `STREAMING`, `COMPLETED`, `DELETING`, `FAILED`). Create and rename requests never accept an owner or state; rename changes only `title`. Placeholder bounds: title 120 characters, ID 128, page size default 20 and max 50, cursor 512. Language is validated by shape only; the approved list is still TBD. |
| Session detail and saved-final page | `src/session-detail.ts`, `src/segments.ts` | `DRAFT` | `GET /v1/sessions/{id}` returns the session plus a bounded page of acknowledged finals, each with `provenance: "client-uploaded"`. Query `limit` (default 100, max 200, placeholders) and `cursor`. |
| Stream URL request and response | `src/stream-url.ts` | `DRAFT` | Empty request body. The response has exactly the spec's top-level fields: `sessionId`, `streamEpoch` (at least 1), `url`, `expiresAt`, `languageCode`, `mediaEncoding` (`pcm`), `sampleRateHz` (16000), `channels` (1). The URL must be `wss:`, an Amazon Transcribe streaming host, port 8443, path `/stream-transcription-websocket`. The 60-second connection-start expiry is a proposed handler default (decision queue blocker 3), not accepted and not a stream-duration limit. The URL is sensitive: `Cache-Control: no-store` is a handler duty the schema cannot enforce. Rejects fields that could carry a secret. |
| Final-segment upload and acknowledgment | `src/segments.ts` | `DRAFT` | Batch of finals identified by (`streamEpoch`, `resultId`) with relative times and text; per-item results `SAVED`, `DUPLICATE` or `REJECTED` (reasons `EPOCH_NOT_ISSUED`, `IDENTITY_CONFLICT`). The per-item conflict result is a proposed amendment: `API_CONTRACTS.md` says conflicting reuse returns `STATE_CONFLICT`. Placeholder bounds: 25 finals per batch, 2000 characters, 128-character result ID. The idempotency key header is outside the body schema and still needs team agreement (decision queue blocker 4). |
| Completion request and response | `src/completion.ts` | `DRAFT` | Empty request body. The response is the updated session, which must be in state `COMPLETED` and carry `completedAt`. Repeating the request should return the same session (idempotent). |
| Deletion | — | No schema | `DELETE /v1/sessions/{id}` has no body. Success is `204 No Content`; reads are denied immediately and removal is retried afterward. |

### Alignment with `API_CONTRACTS.md`

The spec is authoritative. Field names (`sessionId`, `languageCode`, `resultId`, `sampleRateHz`, `channels`) and the stream-URL response shape follow it. Known differences, each recorded in the open items below:

- Per-item segment rejection (`IDENTITY_CONFLICT`) in place of a whole-request `STATE_CONFLICT`: a proposed amendment.
- Schemas for requests the spec only names (create, rename, list and session-detail queries, completion) are additions with placeholder bounds.
- The spec leaves bounds, pagination limits, idempotency syntax, error status mapping and the unknown-field policy to the schema freeze; the values here are proposals.

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
- [ ] **Segment rejection reasons and the spec difference** (`src/segments.ts`): only `EPOCH_NOT_ISSUED` and `IDENTITY_CONFLICT` exist. `API_CONTRACTS.md` says conflicting reuse returns `STATE_CONFLICT` for the whole request; we propose a per-item `IDENTITY_CONFLICT` so a browser can tell which final of a batch conflicted. Decide which to adopt, and amend the spec if ours is chosen.
- [ ] **Stream URL expiry** (`src/stream-url.ts`): 60 seconds is proposed and needs to be verified against real Transcribe behavior (clock skew, slow connections). AWS maximum is 300. It is a connection-start expiry, not a stream-duration limit.
- [ ] **Stream URL length cap** (`src/stream-url.ts`): 4096 characters is a guess; measure a real presigned URL that includes a session token.
- [ ] **Stream URL host** (`src/stream-url.ts`): any AWS Region is accepted today; tighten to the approved Region once decided (decision queue blocker 1). Port 8443 and the `/stream-transcription-websocket` path are already enforced.
- [ ] **Expiry field**: the response carries only `expiresAt`, as the spec lists, so a skewed client clock can misjudge it. Clients must handle a rejected connection by requesting a fresh URL; reconsider adding a relative expiry if this causes problems.
- [ ] **Stream URL and lifecycle**: decide whether issuing a URL moves a session from `CREATED` to `STREAMING` in the same atomic step as the epoch allocation, which states may request a URL (`CREATED` and `STREAMING` are assumed; `COMPLETED`, `DELETING` and `FAILED` are refused), and who allocates the epoch (Person 4 repository interface).
- [ ] **Saved-segment page bounds** (`src/segments.ts`, `src/session-detail.ts`): default 100 and max 200 finals per page are placeholders.
- [ ] **Session bounds** (`src/session.ts`): title 120 characters, ID 128, page size default 20 and max 50, cursor 512.
- [ ] **Language list** (`src/session.ts`): validated by shape only; the approved languages are TBD and must be enforced in the handler.
- [ ] **Session response details**: default title when none is given; `completedAt` omitted versus `null`; whether to expose a version counter (review with Person 4).
- [ ] **Error message cap and HTTP statuses** (`src/errors.ts`): 200 characters is a placeholder; the code-to-status mapping is undecided.
- [ ] **Strict schemas versus additive changes**: `z.strictObject` rejects unknown response fields, which conflicts with "additive changes stay in v1" in `API_CONTRACTS.md`.
- [ ] **Rename behavior** (`src/session.ts`): `PATCH` is in the Phase 1 route table, so the schema exists. Decide whether renaming is allowed in every state (for example `DELETING`) and whether it returns the updated session (assumed).
- [ ] **Deleting an already-deleted session** (`DELETE`): return `204` again (idempotent) or `NOT_FOUND`? Undecided. Proposed: `NOT_FOUND`, since a deleting session is already unreadable and a foreign ID must look the same as a missing one.
- [ ] **Completion details** (`src/completion.ts`): the request body is empty for now; decide whether completion needs any input. Also decide what happens when completing a session in `CREATED` (never streamed) or `FAILED`: allowed, or `STATE_CONFLICT`?
- [ ] **Status code for success responses**: `204` for delete and the codes for create (`201` or `200`) are assumed, not agreed.
- [ ] **Handler duties the schemas cannot enforce**: `Cache-Control: no-store` on the stream-URL response, ownership and state checks, epoch rules, parsing responses before returning them, and never logging URLs, tokens or transcript text.

### Change history

| Date | Change |
|---|---|
| 2026-11-06 | Added draft error envelope schema and tests. |
| 2026-11-06 | Added draft session, create-request, list-query and page schemas and tests. |
| 2026-11-06 | Added draft stream-URL request and response schemas and tests. |
| 2026-11-06 | Added draft final-segment upload request and per-item response schemas and tests. |
| 2026-11-06 | Added the "Open items to revisit" checklist covering every placeholder and undecided value. |
| 2026-11-06 | Added draft completion request and response schemas and tests; documented delete as a bodiless `204`. |
| 2026-11-06 | Aligned every schema with the Phase 1 `API_CONTRACTS.md`: renamed `id`, `language`, `providerResultId` and `sampleRateHertz` to `sessionId`, `languageCode`, `resultId` and `sampleRateHz`; flattened the stream-URL response and added `channels`; removed `expiresInSeconds`; enforced port 8443 and the Transcribe path; removed `EXPORT_NOT_READY`; added rename, session-detail and saved-segment schemas. Breaking change for anyone coding against the earlier drafts. |
