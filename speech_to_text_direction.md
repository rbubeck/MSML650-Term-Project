# direction.md — AWS Live Speech-to-Text Project

> **Purpose:** This is the bootstrap brief for Codex and every collaborating engineering agent. Read this document before generating files or changing code. The immediate task is to establish a shared architecture, contracts, collaboration protocol, and repository skeleton—not to independently ship disconnected features.

## 1. Product mission

Build a secure, browser-based, real-time speech-to-text application on AWS. An authenticated user can start microphone transcription, see low-latency partial captions and finalized segments, stop a session, and return later to view, rename, download, or delete their own transcripts. Support access from multiple devices. The initial application is single-user/single-microphone per transcription session, **not** a collaborative conferencing platform.

### MVP acceptance criteria

- Users can sign up, sign in, sign out, and recover accounts through Amazon Cognito.
- A user can start/stop a browser microphone stream and see partial/final text from Amazon Transcribe Streaming.
- The application checkpoints finalized segments during a session, finalizes a transcript, and stores it persistently.
- A returning user can list and read only their own transcripts, and download and delete them.
- Failure modes (permission denial, invalid audio configuration, network loss, expired signing URL, service errors, failed persistence) are surfaced and tested.
- A reproducible AWS deployment exists, plus automated checks and a basic observability/evaluation dashboard.

### Not part of MVP

Speaker diarization, translation, live multi-viewer broadcast, real-time summarization, native mobile apps, custom model training, billing, and indefinite uninterrupted recording. Propose these as future extensions, not silently as required dependencies.

## 2. Fundamental architecture decision — Option A

Use **direct browser-to-Amazon Transcribe Streaming over a signed WebSocket**. Do not route continuous audio through API Gateway or Lambda.

**Control plane:** React frontend hosted on Amplify Hosting → Cognito for authentication → API Gateway (HTTP API + JWT authorizer) → Lambda for session authorization, signing, profiles, transcript CRUD → DynamoDB and S3.

**Audio plane:** Browser microphone → Web Audio API/AudioWorklet → correctly formatted PCM audio and AWS EventStream-framed messages → directly to Amazon Transcribe Streaming WebSocket → transcript events back to browser.

**Persistence plane:** Browser checkpoints finalized segments through authenticated HTTPS API → Lambda checks ownership and saves records; completed transcripts exported to S3. Streaming Transcribe does **not** automatically persist results to our DynamoDB/S3 resources.

**Monitoring:** CloudWatch logs/metrics/alarms; client-side metrics transmitted via a deliberate telemetry endpoint; CI and reproducible evaluation tests.

Important constraints:
- Presigned URL is created server-side using scoped AWS credentials. Do not put long-lived AWS secrets in browser code. Signed URL expiry for opening a connection is distinct from connection/session duration.
- AWS Transcribe WebSocket integration requires the correct AWS signing/EventStream protocol; raw PCM sent as arbitrary WebSocket messages is insufficient.
- Partial results are provisional and can be revised; final segments are canonical. Deduplicate with result/segment IDs.
- Browser sample rates may be 44.1/48 kHz; do not relabel samples as 16 kHz without actually resampling.
- Plan for service streaming limits and session rotation; do not assume Option B would eliminate limits. Verify current quotas/settings against official AWS docs during implementation.
- If the browser closes or the network is unavailable, microphone capture stops. Checkpointed transcript content remains recoverable, but never promise lossless continuity without a buffering strategy.
- No transcript/audio should be publicly accessible. Enforce ownership on *every* resource operation.

## 3. Team — five owners

All five developers use coding agents, but one coherent repository and approved contracts. Ownership means responsibility for design, implementation, tests, documentation, and review in the assigned area.

### Person 1 — Frontend / UX
Owns `frontend/`: React + TypeScript app, Cognito-facing UX, dashboard, microphone UI, partial vs final display, session history, downloads/deletion controls, accessibility and responsive states. Integrates the streaming client module built by Person 3; does not independently invent its API.

### Person 2 — Authentication and core backend APIs
Owns `backend/auth/`, `backend/sessions/` (control-plane endpoint logic): Cognito integration, API Gateway JWT authorization design, identity-to-profile handling, per-user authorization, session creation, signed URL endpoint coordination with Person 3, profile APIs, common request/response validation. Uses authenticated `sub` claims, not user-supplied IDs, for ownership.

### Person 3 — Transcribe integration + technical orchestration (project lead)
Owns `transcribe/` or `frontend/src/transcribe/` shared browser module, plus server-side signing implementation in an agreed backend boundary. Implements microphone pipeline, sample conversion, AWS WebSocket/EventStream handling, partial/final results, streaming lifecycle, retries and stream rotation. Leads contract review, coordinates milestones, resolves cross-team decisions, and reviews cross-boundary pull requests. **The streaming client runs in the browser even though Person 3 owns its code.**

### Person 4 — Persistence and infrastructure
Owns `backend/storage/`, `infrastructure/`: DynamoDB profile/session/segment design, S3 transcript objects, transcript CRUD persistence, IAM policies, AWS CDK stacks, Amplify deployment integration, encryption, retention, safe configuration and environment management. Collaborates with Person 2 on HTTP route implementation; do not duplicate route ownership.

### Person 5 — Evaluation, monitoring, testing and quality engineering
Owns `evaluation/`, `tests/e2e/`, monitoring *definitions* and quality gates: WER test corpus and scoring, latency metrics (e.g. time to first partial, finalization delay), reliability testing, reconnection/failure simulations, load test plan, CloudWatch dashboard/alarms specifications, log field conventions, privacy-conscious telemetry, CI test coverage and release readiness reports. Person 4 provisions monitoring resources in CDK based on Person 5's specifications; Person 5 verifies them. Do not have two agents independently edit the same CDK resources.

## 4. Single repository and coordinated agent workflow

Proposed tree (adapt to the existing repo rather than overwrite it):

```text
/
  direction.md
  README.md
  ARCHITECTURE.md
  AGENTS.md
  API_CONTRACTS.md
  INTEGRATION_PLAN.md
  docs/adr/
  frontend/
  backend/auth/
  backend/sessions/
  backend/storage/
  transcribe/
  infrastructure/
  evaluation/
  tests/e2e/
  .github/workflows/
```

Rules:
1. **One repository, branch per feature, PR to protected `main`.** Never let independent agents directly push conflicting changes to main.
2. Each agent reads `direction.md`, `ARCHITECTURE.md`, `AGENTS.md`, `API_CONTRACTS.md`, relevant ADRs, and the affected code before coding.
3. Shared API/data contracts are reviewed and approved by the project lead and affected owners **before** implementing coupled features.
4. New integrations start with mocked consumers/providers based on contracts; merge thin vertical slices frequently rather than building all five workstreams in isolation.
5. Changes to contracts require an explicit PR updating documentation, consumers, validation and tests together. No silent breaking changes.
6. Every PR contains scope, affected boundaries, screenshots or examples where relevant, tests run, security implications, deployment impact, and rollback considerations.
7. CI must run type checking, linting, unit tests, contract tests, CDK synth and appropriate integration tests. Secrets never enter code, PR logs or test fixtures.
8. Define a shared staging environment. Person 4 coordinates deployments; other agents must not manually mutate staging infrastructure out-of-band.
9. Schedule brief integration checkpoints: demo combined `main`, report broken contracts, review failing tests, decide next slice. Progress is measured by a runnable integrated system.
10. Technical lead resolves ambiguity by recording an Architecture Decision Record (ADR), not by letting agents assume different answers.

## 5. Initial API contract proposal (must be formalized)

Use Cognito access token as `Authorization: Bearer <token>` for protected endpoints, API Gateway JWT authorizer, JSON request/response schemas, consistent machine-readable error objects. Derive user identity from validated token claims.

- `GET /users/me` — current profile.
- `PATCH /users/me` — update approved profile preferences.
- `POST /sessions` — create authorized session; returns `sessionId`, configuration and a short-lived presigned Transcribe WebSocket URL. Clearly document whether URL may be refreshed by another endpoint.
- `POST /sessions/{id}/segments` — checkpoint **final** transcript segments; idempotent by `(sessionId, resultId)` or agreed key; protected by ownership checks.
- `POST /sessions/{id}/complete` — mark finalizing/completed and export transcript to S3; idempotent.
- `GET /sessions` — paginated list of owned sessions, newest first.
- `GET /sessions/{id}` — metadata and/or transcript access method.
- `PATCH /sessions/{id}` — rename session.
- `GET /sessions/{id}/download` — signed short-lived S3 download URL after ownership check.
- `DELETE /sessions/{id}` — delete owned session, metadata and objects with explicit failure/retry behavior.

Streaming module (to be designed as a typed browser-side interface; names are illustrative): `start(config)`, `stop()`, `onPartial`, `onFinal`, `onStatus`, `onError`, `dispose()`. Define ordering, event IDs, cancellation, backpressure, error categories, and restart semantics.

Example final segment: `{ "resultId":"r-001", "startTime":0.2, "endTime":2.4, "text":"Hello everyone." }`. Treat timestamps as relative to each Transcribe stream, and define a durable session-level timeline when rotating streams.

## 6. Data model and access control direction

Use Cognito `sub` as immutable owner identifier. DynamoDB should support efficient `userId`-scoped, newest-first listing with pagination; avoid full-table scans. Keep user profiles distinct from session metadata and final-segment records. Large transcript artifacts go to private S3, referenced by object key in DynamoDB. Design idempotent writes, consistent session status transitions (`CREATED`, `STREAMING`, `FINALIZING`, `COMPLETED`, `FAILED`, `INTERRUPTED`), deletion and retention.

Never accept client-provided S3 keys, user IDs, or session ownership as authority. Derive object locations server-side and enforce least-privilege IAM policies. Consider PII, retention, exports and auditability from the start.

## 7. Evaluation and observability requirements

Person 5 defines a small, consented reference audio dataset spanning accents, noise conditions and speaking styles with reference transcripts. Measure WER on final transcripts; do not use partial captions for accuracy scoring. Track percentiles for UI display latency and finalized segment delay, stream connection failure, reconnect count, checkpoint failure, completion success and frontend exceptions. Document metric definitions and measurement instrumentation so metrics are reproducible. Use synthetic/non-sensitive data in CI. Establish baseline and proposed thresholds, marking proposed thresholds as assumptions until measured.

Person 4 implements required CloudWatch metrics, alarms and dashboards through CDK after a reviewed specification. Person 5 validates them and publishes release-readiness findings. Collect no raw microphone audio or transcript contents in operational logs by default.

## 8. Milestones and integration order

**M0 — Architecture freeze:** Agree scope, region, AWS account strategy, deployment ownership, contracts, folder ownership, code standards, and baseline data schemas. Produce docs and ADRs.

**M1 — End-to-end thin slice:** One user signs in, gets a signed stream URL, speaks a phrase, sees final text, checkpoints one segment, finds it after reload. All five owners contribute to this vertical slice.

**M2 — Core MVP:** Robust live UI, profile/history, start/stop, recoverable checkpointing, download/delete, basic testing and CloudWatch visibility.

**M3 — Hardening:** Security tests, browser/network errors, long-session behavior, performance benchmarking, staging CI/CD, release checklist and documentation.

Do not postpone the first full integration until every subsystem is 'finished'.

## 9. Your immediate instructions to Codex

1. Inspect the existing repository and summarize what already exists. Preserve working code and avoid destructive refactors.
2. Treat this file as project intent, **not** permission to assume ambiguous requirements. Identify open architectural choices explicitly with recommended defaults.
3. Create/update these foundational documents, aligned to this direction:
   - `ARCHITECTURE.md`: context, goals/non-goals, AWS components, control/audio/persistence flows, sequence diagrams, security/trust boundaries, failure paths, deployment architecture and ADR links.
   - `AGENTS.md`: instructions each developer's Codex agent must follow; ownership rules, coding standards, branch/PR workflow, definition of done, tests and change controls.
   - `API_CONTRACTS.md`: detailed HTTP request/response schemas, status codes, error schemas, pagination, authentication, idempotency, client Transcribe module interface, segment shape and lifecycle.
   - `INTEGRATION_PLAN.md`: five-person ownership matrix, dependency graph, mock/stub strategy, vertical-slice milestones, CI gates, staging rules and integration schedule.
   - `README.md`: concise overview, local development prerequisites, directory map and how to run/test once scaffolding exists.
4. Propose a minimal repository skeleton and automated checks. Do not invent credentials, deployed resource ARNs, actual AWS quotas or measured performance.
5. Before implementing major features, present unresolved decisions in a prioritized list (for example, preferred Region, exact supported languages, transcript/audio retention, stream reconnect requirements, and whether frontend transcript saving is accepted for MVP).
6. Do **not** implement the full product in the first bootstrap pass. Finish with a summary of created files, key decisions, assumptions, owners and next recommended PRs.

## 10. Definition of project success

A user can authenticate, transcribe speech with low-latency captions, return later to find their own saved transcripts, and securely download/delete them. A new contributor or AI agent can understand how components fit together and implement changes without inventing incompatible contracts. Every deployment is reproducible, every major boundary has tests, and the team can quantitatively explain the system's accuracy, latency, reliability, security and cost.
