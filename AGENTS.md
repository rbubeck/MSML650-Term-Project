# Engineering Agent Instructions — Option A Phase 1

Read `direction_option_a.md`, `README.md`, `ARCHITECTURE.md`, `API_CONTRACTS.md`, `INTEGRATION_PLAN.md`, your area README, and accepted ADRs before editing.

## Active objective

Build only the integrated authenticated live-transcription MVP defined by ADR-011: sign in, create a session, connect the browser directly to Amazon Transcribe, display captions, durably acknowledge final uploads, reopen history, and delete the session. Target at least one hour per logical session, including reconnect epochs.

Do not add recorded-file upload, batch transcription, S3 exports, summarization, other derived features, shared rooms, raw-audio storage, or production-scale infrastructure in Phase 1.

## Ownership

| Owner | Phase 1 paths and deliverable |
|---|---|
| Person 1 | `frontend/`: Cognito UX, capture/resampling, caption/save state, history/delete UI |
| Person 2 | `backend/api/`: authenticated session/signing/final-save/history/completion/delete handlers |
| Person 3 | `packages/stream-client/`: browser WebSocket/EventStream, buffering, stop/reconnect |
| Person 4 | `backend/persistence/`, `infrastructure/`: repositories, DynamoDB, minimum approved AWS setup |
| Person 5 | `evaluation/`, `tests/`: local integration, isolation/failure/privacy tests, one-hour evidence |
| Cross-owner | `packages/contracts/`, public API, lifecycle and trust-boundary decisions |

With four people, Persons 1 and 3 may be combined. Affected-owner review remains required.

## Mandatory boundaries

- Browser PCM goes directly to Amazon Transcribe. Never build an application audio proxy or backend streaming workspace.
- Lambda signs with its runtime IAM role and returns a sensitive, short-lived URL. Never expose secret access keys or derived signing keys.
- Amazon EventStream models stay inside `packages/stream-client`; application JSON schemas stay in `packages/contracts`.
- Transcribe results reach the browser. Saved live text is untrusted `client-uploaded` content; only API-acknowledged finals are durable.
- The API validates every operation, derives owner from validated claims, verifies DynamoDB ownership/state, and applies idempotency. Never trust client `userId`.
- One application session can contain multiple stream epochs. Do not create parallel session models for reconnect.
- Raw audio, transcript text, JWTs, signed URLs, personal data, and unbounded identifiers never enter logs or metric dimensions.

## Working rules

- The shared Zod contract PR comes before independent handler/consumer shapes.
- Build against injectable, contract-compliant fakes; normal checks do not call AWS.
- Cover success plus meaningful failure: ownership, duplicate/conflicting upload, expired/rejected signing, protocol failure, reconnect, deletion, and privacy.
- Use Node.js 24, npm 11 workspaces, TypeScript 6 strict, ESM, Zod 4, Vitest 5, ESLint 10, and Prettier 3. Run `npm run check` before TypeScript handoff.
- Preserve evaluation artifacts and unrelated work. Keep PRs small and state interfaces, assumptions, actual checks, and affected owners.
- AWS resource creation and paid/one-hour tests require explicit approval, named Region/account, cost bound, and cleanup.
- Do not claim deployed behavior from docs, fakes, or unrelated provider experiments.

Architecture, security, storage, public-contract, cost, or deferred-feature decisions require an ADR before implementation.
