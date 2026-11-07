# Live Speech-to-Text Platform — Option A

Status: the narrow Option A live-caption path is implemented, locally tested, and smoke-verified against a manually configured development stack in `us-east-2`. Cognito sign-up/sign-in, API Gateway JWT authorization, Lambda URL signing, direct browser-to-Transcribe PCM streaming, and live partial/final captions worked together on 2026-11-07. Persistence and the rest of the Phase 1 application remain incomplete.

The active MVP is an authenticated **live transcription** application. The browser streams microphone PCM directly to Amazon Transcribe over its presigned WebSocket/EventStream protocol. API Gateway and Lambda form a separate HTTPS control plane for sessions, URL signing, acknowledged final uploads, history, and deletion. DynamoDB stores owned sessions and acknowledged final segments.

Transcribe returns partial and final results to the browser. The browser displays them and uploads final text to the API. Saved live text is therefore **client supplied**, not server-verified provider output.

## Phase 1 integrated journey

```text
sign in
→ create session
→ request stream URL
→ browser streams directly to Transcribe
→ display partial/final captions
→ save and acknowledge finals
→ complete session
→ reopen transcript from history
→ delete session
```

- The Node.js 24/npm 11/TypeScript 6 strict/ESM/Zod 4/Vitest 5/ESLint 10/Prettier 3 workspace baseline exists.
- Python word-error-rate scripts have been migrated to `evaluation/scripts/`; reference metadata and existing evaluation artifacts remain in place. See `evaluation/README.md` for evaluation details.
- A historical local server-side Transcribe experiment succeeded in `us-east-1` on 2026-11-02. It is **not** evidence of Option A browser streaming, signing, persistence, or deployment. The Option B code has been removed; its history remains in Git.
- A paid development account and $20 monthly AWS Budget alert were reported for that experiment. Reverify account, Region, budget, quotas, and permissions before any new AWS work. A budget alert is not a hard cost cap.

## Verified development smoke checkpoint — 2026-11-07

A controlled single-user test in `us-east-2` verified this real path:

```text
local Vite browser
→ Cognito sign-up, confirmation and access-token sign-in
→ API Gateway HTTP API with JWT authorizer and local-origin CORS
→ guarded Lambda single-session repository and runtime-role signer
→ short-lived Transcribe WebSocket capability
→ direct browser PCM/EventStream connection to Amazon Transcribe
→ real partial and final-observed captions in the UI
```

The browser reported 48 kHz microphone input resampled to the contracted 16 kHz mono PCM output. This is smoke evidence for the narrow live-caption slice, not MVP acceptance: the test did not prove durable segment saving, history, DynamoDB ownership, automatic reconnect, two-user isolation, the one-hour target, or production readiness. The temporary repository can reset its epoch across Lambda environments and must not become the MVP repository.

Resource identifiers and user identity values are intentionally absent from tracked files. Local `frontend/.env`, generated `dist/` content, the Lambda ZIP, JWTs, presigned URLs, and transcripts must remain untracked and unshared.

## Phase 1 owners

| Area | Owner | Initial integration responsibility |
|---|---|---|
| `frontend/` | Person 1 | React UI, authentication experience, microphone capture, accessible captions |
| `packages/stream-client/` | Person 3, with Person 1 review | Browser Transcribe WebSocket client, EventStream framing/decoding, stream lifecycle, final-result handoff |
| `backend/api/` | Person 2 | Cognito-backed HTTP API, presigned URL issuance, session ownership and lifecycle |
| `backend/persistence/` | Person 4, with Person 2 review | DynamoDB/S3 repository boundaries, idempotency, exports, deletion |
| `infrastructure/` | Person 4 | Console-first AWS setup, IAM, verification, cost and cleanup runbooks |
| `packages/contracts/` | Cross-owner | Canonical Zod application schemas and reusable PCM format constants |
| `evaluation/`, `Datasets/`, `Results/` | Person 5 | Migrated evaluation tools, reference metadata, and artifacts; do not relabel as Option A release evidence |

- The shared Node.js/TypeScript/Zod/Vitest/ESLint/Prettier workspace baseline exists.
- Reusable mono 16 kHz PCM format constants exist.
- Historical Python WER work and evaluation artifacts remain.

## Start here

1. Read [AGENTS.md](AGENTS.md), [direction_option_a.md](direction_option_a.md), your area README, [ARCHITECTURE.md](ARCHITECTURE.md), [API_CONTRACTS.md](API_CONTRACTS.md), and accepted ADRs.
2. Implement only the Phase 1 interfaces in [INTEGRATION_PLAN.md](INTEGRATION_PLAN.md).
3. Use shared Zod schemas; do not create component-local session or error models.
4. Run `npm run check` before TypeScript handoff. Normal tests must not call AWS.
5. Do not create shared AWS resources or run the real one-hour test without explicit approval and a bounded plan.

Documentation and mocks are not runtime evidence. The dated checkpoint above is evidence only for the explicitly listed development smoke path.
