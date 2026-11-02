# Engineering Agent Instructions

These instructions apply to every human and coding agent working in this repository. Read `direction_option_b.md`, `ARCHITECTURE.md`, `API_CONTRACTS.md`, and the relevant accepted ADRs before editing code.

## Mission

Build one deployable, testable, measurable Option B platform. Do not create disconnected demos, parallel session models, or component-local wire contracts.

## Current phase

The shared toolchain, Zod source-of-truth decision and ADR-006 binary audio format are accepted. The audio codec and Amazon Transcribe provider adapter are implemented and tested; a bounded manual file-to-Transcribe smoke test has succeeded in `us-east-1`. Frontend, control API, persistence, WebSocket service and AWS infrastructure are not implemented or deployed.

Contributors may implement isolated local work behind accepted boundaries and contract-compliant fakes. Coupled session/auth/persistence behavior waits for ADR-001, ADR-002 and ADR-003 acceptance. AWS deployment waits for ADR-007 and explicit orchestrator authorization. Proposed documentation and a provider smoke test are not proof of end-to-end behavior, capacity, latency, accuracy, persistence, security or production readiness.

## Ownership

| Area | Primary owner | Paths |
|---|---|---|
| Frontend and browser audio UX | Person 1 | `frontend/`, `packages/stream-client/` with Person 3 review |
| Identity and control API | Person 2 | `backend/api/` |
| Streaming and Transcribe integration | Person 3 | `backend/streaming/`, streaming portions of contracts |
| Persistence and infrastructure | Person 4 | `backend/persistence/`, `infrastructure/` |
| Evaluation, observability, release quality | Person 5 | `evaluation/`, `tests/e2e/`, telemetry and runbooks |
| Shared public contracts | Cross-owner review | `packages/contracts/`, `API_CONTRACTS.md` |

Owners do not bypass review. Changes to another area require its owner. Cross-cutting changes require the affected owners and, when architectural or externally visible, an ADR or contract revision first.

## Mandatory contract rules

- Session states, errors, HTTP shapes, WebSocket envelopes, and telemetry keys have one canonical definition.
- Implemented machine-checkable schemas/codecs in `packages/contracts` are authoritative for their scope; proposed OpenAPI/JSON snapshots are not yet runtime sources. Markdown explains semantics.
- Consumers import shared types or generated clients. Do not copy/paste and independently evolve types.
- Additive compatible changes remain in protocol/API v1. Breaking changes require a new version and a migration plan.
- Provider-specific Amazon Transcribe payloads do not cross the application protocol boundary.
- Never accept a client-supplied `userId` as authorization evidence.
- Partial transcripts are ephemeral. Only final segments are durable.

## Directory and change discipline

- Use one shared repository and short-lived branches such as `feat/frontend-*`, `feat/auth-*`, `feat/stream-*`, `feat/storage-*`, `feat/eval-*`, and `docs/architecture-*`.
- Preserve unrelated work. Do not delete existing evaluation artifacts without an approved migration.
- Keep PRs small. State changed interfaces, assumptions, migrations, and tests actually run.
- A PR must not silently change another component's interface.
- Secrets, credentials, tokens, audio, private transcripts, and environment files must never be committed.
- Generated datasets, recordings, build outputs, and virtual environments remain untracked.

## Coding baseline

The accepted shared baseline is defined in `docs/engineering-standards.md` and ADR-009: Node.js 24, npm workspaces, TypeScript 6.0.x strict mode, ESM, Zod 4, Vitest 5, ESLint 10 flat config, and Prettier 3. All agents must use the root lockfile and scripts.

For implementation:

- enable TypeScript strict mode;
- validate all network and persistence inputs at runtime;
- use structured, stable error codes;
- use dependency injection around AWS clients for contract-based tests;
- keep AWS SDK models behind adapters;
- make writes and lifecycle operations idempotent;
- use bounded queues, timeouts, retries, and cancellation;
- handle SIGTERM and connection draining explicitly;
- keep audio/transcript/token contents out of logs and metrics;
- add unit tests for success and meaningful failure paths.

Before handing off a normal TypeScript change, run `npm run check`. Tests use explicit Vitest imports and are colocated as `*.test.ts`/`*.test.tsx`; cross-package tests belong in `tests/integration/`.

Existing Python evaluation code should become import-safe, reproducible, tested, and dependency-pinned when Person 5 migrates it into `evaluation/`.

## Security requirements

- Authenticate and authorize every HTTP and streaming operation.
- Verify session ownership in the authoritative data store.
- Consume one-time tickets atomically before accepting audio.
- Enforce allowed origins, protocol version, frame size, message rate, idle timeout, concurrency, and capacity.
- Use least-privilege runtime roles; distinguish ECS execution from task permissions.
- Use opaque identifiers and prevent IDOR.
- Never log JWTs, tickets, signed URLs, raw audio, transcript text, or sensitive profile data.
- Deny reads as soon as deletion begins, even if physical deletion is retrying.

Report a suspected vulnerability privately to the team; do not place exploit details or real sensitive data in public issues.

## Testing requirements

Every feature must include appropriate layers:

- unit tests for logic and failure handling;
- schema/contract compatibility tests;
- integration tests using contract-compliant mocks when AWS is unavailable;
- ownership-isolation tests for protected data;
- an end-to-end path when the integrated environment exists;
- bounded load/failure tests only with an approved budget and scope.

Do not claim a test was run if it was not. Do not claim AWS behavior was verified from documentation alone.

## Observability

Use the shared telemetry schema. New metric or event names require Person 5 review. Provisioning requires Person 4 review. Instrumentation in the streaming service requires Person 3 review.

Logs are structured and privacy-safe. Metrics must have bounded cardinality: never use `sessionId`, `userId`, transcript text, ticket values, or raw error messages as metric dimensions.

## Pull requests and definition of done

A change is done only when:

- code, tests, contracts, and documentation agree;
- the basic failure path is covered;
- compatibility is maintained or explicitly versioned;
- relevant privacy-safe logs/metrics exist;
- local checks and CI pass;
- domain owners review it;
- it is demonstrated against the current integration environment or documented mock.

The technical orchestrator reviews changes affecting architecture, public contracts, session lifecycle, or more than one owned component.

## ADR and escalation rules

Create or update an ADR before implementing a decision that changes a trust boundary, public contract, persistence model, lifecycle owner, AWS service, cost profile, deployment topology, or failure/recovery guarantee.

An ADR records context, decision/status, alternatives, security/cost/operational consequences, and migration impact. Proposed ADRs are not implementation authorization.

Stop and request human direction when:

- requirements conflict;
- a change would spend money or mutate shared AWS infrastructure without approval;
- data retention, consent, compliance, Region, or security requirements are unclear;
- a breaking contract change lacks consumer and migration agreement;
- repository ownership or overlapping edits cannot be safely resolved.

## Prohibited assumptions

Do not assume:

- unlimited or documented-default AWS quota is available in the target account;
- an ALB can move an active WebSocket to another task;
- in-memory admission or connection state is globally authoritative;
- speaker labels identify real people;
- browser audio is already 16 kHz PCM;
- retries are safe without idempotency;
- `COMPLETED` is valid before checkpoints and exports are durable;
- PII redaction is complete;
- any not-yet-implemented command, benchmark, deployment, or SLO exists.

## Documentation protocol

Update documents in the same PR as the behavior they describe. Keep unresolved items visibly marked `PROPOSED`, `TBD`, or ADR status. Remove those labels only after the recorded review decision. Link contracts to accepted ADRs and include migration notes for changed behavior.

