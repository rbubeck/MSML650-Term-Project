# Live Speech-to-Text Platform — Option A

Status: Phase 1 architecture and team structure. No browser application, control API, persistence adapter, direct stream client, or application AWS deployment is currently implemented by this repository.

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

The product target is at least one hour of live transcription. Reconnects may create new provider stream epochs inside the same logical application session.

## Phase 1 owners

| Area | Owner | Initial integration responsibility |
|---|---|---|
| `frontend/` | Person 1 | Cognito UX, microphone capture/resampling, captions, save state, history UI |
| `packages/stream-client/` | Person 3 with Person 1 review | Browser WebSocket/EventStream client, stop/reconnect, bounded audio queue |
| `backend/api/` | Person 2 | Authenticated sessions, presigned URL issuance, final saves, history, completion, deletion |
| `backend/persistence/` | Person 4 with Person 2 review | Owner-scoped DynamoDB session/final repositories and deterministic fakes |
| `infrastructure/` | Person 4 | Minimum approved Cognito/API Gateway/Lambda/DynamoDB/IAM/CloudWatch setup |
| `packages/contracts/` | Cross-owner | Canonical Zod schemas and shared PCM constants |
| `evaluation/`, `tests/` | Person 5 | Integration/e2e path, privacy checks, reconnect and one-hour evidence |

With four contributors, one person may combine Persons 1 and 3. Shared contracts and lifecycle behavior still require affected-owner review.

## Not in Phase 1

Recorded-file upload/batch transcription, S3 transcript exports, summarization, action items, translations, shared rooms, raw-audio storage, and production-scale hardening are later phases. They are product direction, not current implementation assignments.

## Current verified state

- The shared Node.js/TypeScript/Zod/Vitest/ESLint/Prettier workspace baseline exists.
- Reusable mono 16 kHz PCM format constants exist.
- Historical Python WER work and evaluation artifacts remain.

## Start here

1. Read [AGENTS.md](AGENTS.md), [direction_option_a.md](direction_option_a.md), your area README, [ARCHITECTURE.md](ARCHITECTURE.md), [API_CONTRACTS.md](API_CONTRACTS.md), and accepted ADRs.
2. Implement only the Phase 1 interfaces in [INTEGRATION_PLAN.md](INTEGRATION_PLAN.md).
3. Use shared Zod schemas; do not create component-local session or error models.
4. Run `npm run check` before TypeScript handoff. Normal tests must not call AWS.
5. Do not create shared AWS resources or run the real one-hour test without explicit approval and a bounded plan.

Documentation, mocks, and historical smoke tests are not evidence of an integrated product.
