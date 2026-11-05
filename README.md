# Live Speech-to-Text Platform — Option A

Status: architecture and team structure only. No browser application, control API, persistence adapter, or AWS application resource is implemented or deployed by this repository. The active project charter is [direction_option_a.md](direction_option_a.md).

**Active architecture:** an authenticated browser captures microphone audio and opens a **direct WebSocket to Amazon Transcribe Streaming**. API Gateway and Lambda provide a separate HTTPS control plane for session management, short-lived Transcribe URL signing, final-result uploads, history, exports, and deletion. DynamoDB stores session metadata and uploaded final segments; private S3 stores completed exports. See [ARCHITECTURE.md](ARCHITECTURE.md), [API_CONTRACTS.md](API_CONTRACTS.md), and [ADR-010](docs/adr/010-option-a-migration.md).

Transcribe returns partial and final results to the **browser**. The browser displays them and submits final text to the API. Saved text is **client supplied**; the API cannot prove from that upload alone that Transcribe produced it. Never describe stored text as server-verified provider output.

## Current verified state

- The Node.js 24/npm 11/TypeScript 6 strict/ESM/Zod 4/Vitest 5/ESLint 10/Prettier 3 workspace baseline exists.
- Python word-error-rate scripts, reference metadata, and existing evaluation artifacts remain in place.
- A historical local server-side Transcribe experiment succeeded in `us-east-1` on 2026-11-02. It is **not** evidence of Option A browser streaming, signing, persistence, or deployment. The Option B code has been removed; its history remains in Git.
- A paid development account and $20 monthly AWS Budget alert were reported for that experiment. Reverify account, Region, budget, quotas, and permissions before any new AWS work. A budget alert is not a hard cost cap.

## Repository map and owners

| Area | Owner | Responsibility |
|---|---|---|
| `frontend/` | Person 1 | React UI, authentication experience, microphone capture, accessible captions |
| `packages/stream-client/` | Person 3, with Person 1 review | Browser Transcribe WebSocket client, EventStream framing/decoding, stream lifecycle, final-result handoff |
| `backend/api/` | Person 2 | Cognito-backed HTTP API, presigned URL issuance, session ownership and lifecycle |
| `backend/persistence/` | Person 4, with Person 2 review | DynamoDB/S3 repository boundaries, idempotency, exports, deletion |
| `infrastructure/` | Person 4 | Console-first AWS setup, IAM, verification, cost and cleanup runbooks |
| `packages/contracts/` | Cross-owner | Canonical Zod application schemas and reusable PCM format constants |
| `evaluation/`, `tests/` | Person 5 | WER methodology, contract/e2e plans, privacy and observability checks |
| `Scripts/`, `Datasets/`, `Results/` | Person 5 migration review | Existing evaluation work and provenance; do not delete or relabel as Option A evidence |

Four people may combine Persons 1 and 3, but both responsibilities and cross-owner review still apply. See [INTEGRATION_PLAN.md](INTEGRATION_PLAN.md) for handoffs.

## Start here

1. Read [AGENTS.md](AGENTS.md), your area README, [ARCHITECTURE.md](ARCHITECTURE.md), [API_CONTRACTS.md](API_CONTRACTS.md), and applicable accepted ADRs.
2. Check the [decision queue](docs/orchestrator/decision-queue.md). `PROPOSED` and `TBD` are not implementation authorization.
3. Use one shared contract and one session model. Do not put permanent AWS keys or secret signing material in the browser.
4. From the root, run `npm ci` and `npm run check` for TypeScript changes. Normal checks need no AWS account.
5. Use the [Console-first infrastructure guide](infrastructure/README.md) for planning. Creating or changing shared AWS resources and paid tests still require explicit team authorization.

No infrastructure action, product end-to-end flow, security property, latency target, or WER result is claimed by this restructure.
