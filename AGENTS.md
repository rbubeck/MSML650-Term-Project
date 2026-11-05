# Engineering Agent Instructions — Option A

Read `direction_option_a.md`, `README.md`, `ARCHITECTURE.md`, `API_CONTRACTS.md`, your area README, and accepted ADRs before editing. The active architecture is direct browser-to-Amazon Transcribe WebSocket streaming. Do not restore a backend streaming proxy or a second session/wire model.

## Current phase

This repository is an Option A structure and implementation guide. The shared TypeScript toolchain and Zod source decision are accepted; browser app, direct stream client, API, persistence, and application AWS resources are not implemented or deployed. A historical Option B server-side provider smoke test does not verify Option A. Proposed contracts and Console steps are not runtime evidence.

## Ownership

| Owner | Paths and responsibilities |
|---|---|
| Person 1 | `frontend/`: UI, Cognito experience, browser capture, accessibility |
| Person 2 | `backend/api/`: authenticated HTTP control and signing API |
| Person 3 | `packages/stream-client/`: direct Transcribe EventStream/WebSocket protocol; streaming contracts with Person 1 |
| Person 4 | `backend/persistence/`, `infrastructure/`: DynamoDB, S3, Lambda integration, Console-first resource guide |
| Person 5 | `evaluation/`, `tests/`: quality, observability, e2e and release evidence |
| Cross-owner | `packages/contracts/`, public API, lifecycle and trust-boundary decisions |

Four people may combine Persons 1 and 3. Owners do not bypass affected-owner review. Architecture, security, storage, public contract, or cost decisions require an ADR before implementation.

## Mandatory boundaries

- The browser streams PCM directly to Amazon Transcribe using its presigned WebSocket/EventStream protocol. API Gateway/Lambda carry control traffic and saved finals only. No application-specific PCM header or proxy WebSocket contract crosses this path.
- Lambda signs with its runtime IAM role. The browser receives a short-lived presigned URL, never permanent AWS keys or signing credentials. A presigned URL is sensitive and replayable until expiry; it is not a one-time ticket.
- Transcribe results reach the browser. Uploaded final text is **client supplied** and cannot be described as server-verified provider output. Partials stay ephemeral; only acknowledged finals are durable.
- The API authenticates every operation, derives owner from validated claims, checks session ownership in authoritative storage, validates runtime inputs, and makes writes/lifecycle operations idempotent. Never trust client `userId`.
- Zod schemas in `packages/contracts` are the planned source for structured application contracts. Provider-specific EventStream models stay inside `packages/stream-client`. Compatible additions remain v1; breaking changes need versioning and migration.
- Raw audio, transcript text, JWTs, signed URLs, and personal data never enter logs or metrics. Metric dimensions have bounded cardinality.

## Working rules

- Keep short-lived branches and small PRs; preserve existing evaluation artifacts unless a reviewed migration replaces them.
- Use Node.js 24, npm 11 workspaces, TypeScript 6 strict, ESM, Zod 4, Vitest 5, ESLint 10, and Prettier 3 as in `docs/engineering-standards.md`. Run `npm run check` before TypeScript handoff.
- Test success and meaningful failure paths with contract-compliant fakes; normal tests do not call AWS. Add ownership isolation, duplicate upload, signing rejection, protocol failure, and privacy tests as relevant.
- Do not claim deployed behavior from docs or mocks. Do not create/change shared AWS resources or run paid/load tests without explicit approval and a bounded plan.
- Ask the team when consent, retention, Region, data residency, security requirements, breaking compatibility, ownership, or AWS spend is unresolved. Mark unresolved decisions `PROPOSED` or `TBD`.
- Update docs/contracts in the same PR as behavior. State interfaces, assumptions, migration, actual checks, and affected owners.
