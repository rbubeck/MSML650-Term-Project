# DIRECTION.md — Multi-User Live Speech-to-Text Platform (Option B)

**Status:** Initial project charter and bootstrap instructions for Codex  
**Architecture:** Backend-mediated, real-time streaming with Amazon ECS on AWS Fargate  
**Team:** Five engineers, each potentially using a separate coding agent  
**Technical orchestrator:** Person 3 (Transcribe and streaming integration lead)  
**Initial priority:** Agree on architecture and interfaces before implementing product features

> **To Codex:** Read this entire file before making changes. You are helping build a single coherent product owned by five engineers, not five disconnected demos. Your first assignment is to inspect the repository and generate the shared architecture, development conventions, contracts, decisions, and integration plan described below. Do **not** implement product features during bootstrap. Do not fabricate deployed infrastructure, verified limits, tests, or benchmarks. Propose uncertain decisions as ADRs for human review.

## 1. Mission and product vision

Build a secure, browser-based, real-time speech-to-text platform on AWS that supports **many authenticated users recording/transcribing simultaneously**. A user can sign up, log in, start a live microphone session, see captions as speech is recognized, stop safely, and later view/download/delete their own saved transcripts from any device.

Unlike a direct browser-to-Amazon-Transcribe design (Option A), **Option B routes live audio through our own persistent backend**. The backend controls Amazon Transcribe SDK connections, stream lifecycle, final transcript persistence, reconnection handling, and future fan-out to permitted viewers.

**Clarify what “multi-user” means:** The initial MVP supports *multiple independent users with their own simultaneous sessions*. A *shared meeting with multiple speakers*, one room with multiple microphones, or many viewers watching the same stream is a separate feature, not something to assume works automatically. Design extension points for collaborative viewing, but do not implement rooms, mixing, speaker association, or broadcast at MVP bootstrap time.

### MVP user journeys
1. A user creates an account, confirms identity, logs in, and edits basic profile/preferences.
2. A user starts a session in a supported language and grants microphone permission.
3. The browser opens an authenticated application WebSocket to our ECS streaming backend; it **does not connect to Transcribe directly**.
4. The backend validates authorization, receives appropriately formatted audio, starts/operates an AWS SDK Transcribe streaming connection, and returns partial/final text to the browser.
5. Final segments are durably checkpointed by the backend as transcription progresses. At stop, the backend finalizes and stores a completed transcript.
6. On a later login, that user can list, view, rename, download, and delete their own previous transcripts.
7. Different users can perform these journeys concurrently without seeing or affecting one another's private data.

### Non-goals for first implementation
- Custom model training or a SageMaker model.
- AI summaries, translations, sentiment, meeting-room speaker mixing, live speaker diarization, or video calling.
- Guaranteed zero-loss capture during a client-side network outage; the browser is the only source of live microphone audio.
- Automatic seamless failover of an in-progress WebSocket to a different ECS task. Reconnection and rehydration are explicit application behaviors.
- An unbounded number of concurrent users regardless of AWS quotas/cost.

## 2. Architecture baseline — Option B

```text
                    ┌───────────────────────────────┐
                    │ Users' browsers               │
                    │ React + TypeScript            │
                    │ microphone + live captions    │
                    └──────────┬────────────┬───────┘
                               │            │
                    frontend/REST│          │ secure audio WebSocket (WSS)
                               │            │
                  ┌────────────▼─┐      ┌───▼─────────────────────────┐
                  │ Amplify       │      │ Application Load Balancer │
                  │ Hosting       │      │ TLS + WebSocket upgrade   │
                  └───────────────┘      └────────────┬───────────────┘
                                                     │
          Cognito User Pool                           ▼
          auth + JWT                    ┌─────────────────────────────┐
               │                        │ ECS Service on Fargate       │
               │                        │ Node.js/TypeScript server    │
               └── validation ─────────▶│ authenticated WS sessions   │
                                        │ audio/stream handling       │
                                        │ segment checkpointing       │
                                        └─────────────┬───────────────┘
                                                      │ AWS SDK / IAM task role
                                                      ▼
                                        ┌─────────────────────────────┐
                                        │ Amazon Transcribe Streaming │
                                        │ partial + final transcripts │
                                        └─────────────────────────────┘

   React ── HTTPS/JWT ──▶ API Gateway ──▶ Lambda ──▶ DynamoDB
                                                    │ profiles, session
                                                    │ metadata, ownership
                                         Lambda ───▶ S3
                                                     final text/JSON

   ECS and Lambda ──▶ CloudWatch logs/metrics/alarms
   CDK ──▶ managed AWS deployment and IAM policies
```

The diagram is conceptual: Cognito does not automatically validate WebSocket upgrade requests at the ALB. The **application WebSocket server must validate the identity and authorize the session**, using a specifically designed token/ticket handshake. API Gateway is for short-lived HTTP business APIs; do not put continuous binary audio through Lambda or API Gateway WebSocket routes.

### Infrastructure/service choices
- **Frontend:** React + TypeScript hosted using AWS Amplify Hosting. Browser microphone via `getUserMedia` + `AudioWorklet` and explicit PCM preparation.
- **Identity:** Amazon Cognito User Pool (authentication, user ID `sub`, password recovery). Protect HTTP APIs with API Gateway JWT authorizer; validate WebSocket tickets/session ownership inside ECS.
- **Control plane:** Amazon API Gateway HTTP API + Lambda for profile/history, creating/authorizing sessions, stopping/finalizing metadata, transcript export/download APIs. Avoid multiple services independently defining the session state machine.
- **Streaming data plane:** ECS service on AWS Fargate running a persistent **Node.js/TypeScript** WebSocket server (initial stack preference). Application Load Balancer with HTTPS/WSS termination and target health checks. Container images stored in ECR.
- **Speech:** Amazon Transcribe Streaming through an officially supported AWS SDK, with IAM task role credentials; **no Transcribe presigned WebSocket URLs delivered to browsers**.
- **Persistence:** DynamoDB for users, session lifecycle/ownership, indexes and durable finalized segment checkpoints; Amazon S3 for completed transcript JSON and TXT exports. Raw audio recording is **off by default**.
- **Infrastructure:** AWS CDK (TypeScript) in `infrastructure/`, environment-specific configuration and least-privilege roles. Use separate dev/staging/prod environments when feasible.
- **Monitoring/security:** CloudWatch logs, metrics, alarms; IAM; encryption; AWS Budgets. Optional WAF/KMS/Secrets Manager as requirements justify them.
- **Optional after MVP:** EventBridge, Step Functions, SQS and Bedrock for asynchronous post-processing. Never introduce them solely to increase AWS service count.

## 3. A single session, end to end

### Control-plane handshake
1. User authenticates through Cognito and obtains valid tokens.
2. React calls `POST /v1/sessions` via API Gateway with user access token and requested language/audio parameters.
3. Lambda derives user identity from the **validated token**; never trusts a client-provided userId. It checks quotas/permissions, allocates an opaque `sessionId`, and creates a session metadata record in DynamoDB.
4. For browser WebSocket authentication, prefer a **short-lived, one-time session-bound connection ticket** issued through the HTTPS API, stored/validated server-side or cryptographically verified with replay protection. Do not place long-lived Cognito access tokens or secrets in URL query strings or application logs. Define ticket expiry, single-use semantics, and reconnect behavior in an ADR.
5. React connects to `wss://stream.<domain>/v1/stream` through ALB with the ticket in the approved handshake mechanism. ECS validates the ticket and session ownership *before accepting audio*.

### Audio stream
6. AudioWorklet captures mono microphone samples. Document exact target encoding (initially signed 16-bit little-endian PCM at a supported sample rate such as 16 kHz) and correct resampling from native browser capture rates.
7. The application WebSocket protocol uses binary messages for audio frames and JSON messages for control/event envelopes; define message sizes, sample timestamps, sequence numbers, ping/pong, rate limits, backpressure, and malformed-frame behavior. The browser is **not** responsible for AWS EventStream framing.
8. ECS makes the Amazon Transcribe Streaming SDK call, sends sequential audio chunks, receives streaming transcription events, maps them to stable application event types, and pushes results to the correct browser socket.
9. Partial results are ephemeral UI updates, while final transcript segments are deduplicated and persisted by the backend. Generate a deterministic segment identity using a session/stream epoch plus provider result identifier; account for result ID reuse across rotated streams.
10. On Stop, flush the end-of-audio signal, await available final results within a bounded deadline, reconcile checkpoints, mark the session completed or interrupted, and produce S3 exports. Never promise a successful final transcript before persistence completes.

### Back to history
11. `GET /v1/sessions` lists only sessions belonging to the authenticated user. `GET /v1/sessions/{id}` verifies ownership. Download uses a short-lived authorized S3 GET URL or an authenticated API response.
12. Delete must remove data consistently (or coordinate retries/tombstones), including optional future backups/retention requirements; do not leak other users' metadata or S3 keys.

## 4. Concurrency and scaling are first-class requirements

Each active capture session generally requires its own Transcribe Streaming connection. **Multiple browsers cannot simply share a single Transcribe session** unless intentionally supplying a common mixed audio input with a separate design. The AWS per-account/per-Region concurrent-stream quota and hard maximum individual stream duration still apply under Option B. Do not write “unlimited scalability” into the architecture.

Design and test:
- A configurable **admission controller** and per-user concurrency limits, plus explicit `CAPACITY_EXCEEDED`, `RATE_LIMITED`, and retry-after responses. Account for races across ECS tasks; in-memory counters alone are insufficient.
- Horizontal ECS task scaling based on meaningful utilization metrics (active streams/task, CPU/memory, audio processing lag); avoid treating task count as equivalent to available Transcribe quota.
- **ALB WebSockets are bound to the target ECS task for the lifetime of that connection.** Plan reconnects when tasks deploy, fail, or terminate. Configure ALB idle timeout, keepalives, target draining and ECS graceful shutdown with explicit tests.
- Stream rotation when Amazon Transcribe's maximum session duration is reached; maintain app-level `sessionId` independent from provider stream epochs. Rotation must consider potential gaps, duplicated text, audio buffering/overlap, timestamp offsets, and reconciliation; do not claim flawless continuity without measurements.
- Backpressure: do not buffer unlimited audio. Establish finite queues, policies for slow clients and network failures, and safe shutdown semantics.
- Define exact behavior for client disconnect, server crash, server restart, concurrent logins, reconnect with ticket renewal, and partially finalized transcripts.
- Track capacity and cost: concurrently active sessions, Transcribe minutes, Fargate task-hours, ALB utilization, and storage. Set budgets and load-test bounds.

**Scope clarification:** Simultaneous independent users are MVP. Multi-viewer shared rooms may later use a distributed pub/sub layer (e.g. Redis/ElastiCache or managed messaging). Do not assume an in-memory connection registry on one Fargate task is cross-task broadcasting.

## 5. Security, privacy, and reliability requirements

- TLS for all public HTTP/WSS endpoints; no permanent AWS credentials in React or source code.
- Least-privilege IAM task roles for ECS and Lambda; IAM execution role distinct from runtime role.
- All APIs and streaming routes must enforce user/session ownership; use opaque identifiers and do not allow IDOR.
- Strong validation on WebSocket handshake and messages; enforce origin policy, authentication, max frame size, rate limits, idle timeouts, and resource quotas.
- Keep PII/audio out of routine application logs; redact token and signed URL fields.
- S3 buckets private, public access blocked, encryption enabled, authorized downloads short-lived; define retention and deletion policies.
- Define policies for personally identifiable information in recordings/transcripts, user consent, export and deletion. No audio recording by default.
- Handle Transcribe throttling, service failures, SDK errors, AWS quota exhaustion, ECS task termination and DynamoDB/S3 partial failures.
- One user's faulty socket or audio payload must not disrupt other sessions.
- Use idempotent APIs, unique segment keys, consistent session states, bounded retries and structured operational errors.

## 6. Explicit division of ownership (five people)

### Person 1 — Frontend and UX
**Owns:** `frontend/` and web UX.
- Login/signup/profile views, dashboard, previous-transcript UI, recording controls, display of partial and final captions.
- Microphone permissions, browser audio capture and UI-safe integration with the shared `stream-client` interface agreed with Person 3. Person 3 defines audio framing requirements and can pair on implementation.
- API client integration and frontend deployment with Person 4.
- Accessibility, error states, user feedback, frontend tests.

### Person 2 — Identity, authorization, and control-plane APIs
**Owns:** `backend/api/`, Cognito configuration requirements, auth middleware and session API contracts.
- JWT-authenticated HTTPS endpoints for profile/session lifecycle.
- Session admission/ticket issuance contract, ownership validation and authorization policy shared with ECS.
- Defines canonical session lifecycle with Person 3/4; never creates a competing one.
- Tests access isolation, auth failures, token expiry and API validation.

### Person 3 — Streaming backend and technical orchestration (**project lead / you**)
**Owns:** `backend/streaming/`, SDK integration, stream protocol and interface coordination.
- Node.js/TypeScript WebSocket service for ECS, Transcribe Streaming SDK client, audio handling, partial/final event processing.
- Stream rotation, backpressure, disconnect recovery, deterministic segment IDs.
- Contract for Person 1 browser client, ticket validation handshake with Person 2, persistence event/write contract with Person 4, telemetry contract with Person 5.
- Reviews cross-component ADRs and ensures integration milestones are executed. Project lead does **not** bypass review or single-owner file boundaries.

### Person 4 — Data, storage, deployment, and platform infrastructure
**Owns:** `backend/persistence/`, `infrastructure/`, DynamoDB/S3 schemas and CDK deployment.
- Durable final-segment checkpoints and final transcript exports; metadata queries and authorized download integration.
- Fargate service, ECR, ALB, VPC networking, task roles, logging delivery, dev/staging stacks, secrets and CI/CD deployment plumbing.
- Coordinate shared APIs with Person 2 and persistence adapters with Person 3.
- Implement the monitoring infrastructure specified by Person 5 (dashboards, alarms, instrumentation plumbing) without independently inventing metric names.

### Person 5 — Evaluation, SRE observability, QA, and release quality
**Owns:** `evaluation/`, `tests/e2e/`, load-test specifications, quality criteria and observability definitions.
- Define and implement word error rate (WER) evaluation with versioned reference audio/transcripts and reproducible scripts.
- Measure p50/p95 caption latency, end-to-end transcript finalization, disconnect recovery, error rate and concurrent-session capacity.
- Specify telemetry event schema, dashboards, alarms, alert thresholds and runbooks. Coordinate provisioning with Person 4 and instrumentation with Person 3.
- Automate integration tests, failure injection, scalability tests and CI release gates; avoid costly uncontrolled production load tests.
- Independently validate acceptance criteria and report quality gaps; cannot self-certify the entire release without team sign-off.

### File ownership rule
Each person can contribute suggestions anywhere, but routine implementation changes must be reviewed by the domain owner. A single pull request should not silently rewrite other teammates' interfaces. Cross-cutting changes require an ADR and contract update before implementation.

## 7. Shared repository layout (proposal)

```text
/
├── direction_option_b.md        # this source of truth for bootstrap
├── README.md
├── ARCHITECTURE.md
├── AGENTS.md
├── API_CONTRACTS.md
├── INTEGRATION_PLAN.md
├── docs/
│   ├── adr/
│   ├── security.md
│   ├── data-model.md
│   ├── streaming-protocol.md
│   └── runbooks/
├── frontend/
├── backend/
│   ├── api/
│   ├── streaming/
│   └── persistence/
├── packages/
│   ├── contracts/              # shared schemas/types generated from contracts
│   └── stream-client/          # optional browser-facing integration module
├── infrastructure/
├── evaluation/
├── tests/
│   ├── integration/
│   └── e2e/
└── .github/workflows/
```

Use a TypeScript monorepo/package-workspace approach if appropriate, but verify existing repo constraints before choosing package tools. Avoid generating five isolated repositories by default. Shared data types and wire contracts must come from one source, not independently recreated by separate agents.

## 8. Contract-first collaboration: Codex must define these

Create `API_CONTRACTS.md` (with example request/response and error shapes) and preferably machine-checkable OpenAPI/JSON Schema/Zod definitions. All examples are proposals until team-reviewed.

### HTTP control APIs (proposed)
- `GET /v1/users/me`, `PATCH /v1/users/me`
- `POST /v1/sessions` — request language/audio configuration; returns `sessionId`, status, WSS endpoint and a short-lived one-time stream ticket (or ticket retrieval mechanism)
- `GET /v1/sessions` — paginated per-user history
- `GET /v1/sessions/{sessionId}` — owner-only session details/transcript metadata
- `POST /v1/sessions/{sessionId}/complete` — idempotent finalization where appropriate; streaming worker and API must share lifecycle ownership rules
- `PATCH /v1/sessions/{sessionId}` — rename
- `DELETE /v1/sessions/{sessionId}` — owner-only delete
- `GET /v1/sessions/{sessionId}/download` — authorized, short-lived file download
- An explicit ticket issuance/refresh operation if required by the handshake design

### WebSocket wire protocol (proposed)
Document:
- URL/path, handshake/ticket method, authentication/authorization failure semantics.
- JSON control messages (`start`, `ready`, `stop`, `ping`, `error`, `session_state`) and **binary audio** frames.
- Server-to-client messages (`partial_transcript`, `final_transcript`, `status`, `warning`, `error`).
- Common envelope: protocol version, session ID, correlation ID, stream epoch, timestamps, sequence number.
- Binary frame audio format, chunk duration, max size, gap detection and backpressure policy.
- Replay/duplicate handling and idempotent final-segment persistence.
- Reconnect protocol, ticket renewal and when a logical session is no longer resumable.

Example final transcript message (illustrative, NOT yet authoritative):

```json
{
  "type": "final_transcript",
  "protocolVersion": 1,
  "sessionId": "sess_123",
  "streamEpoch": 1,
  "segmentId": "sess_123:1:result_008",
  "sequence": 42,
  "startMs": 4500,
  "endMs": 7300,
  "text": "Hello, everyone.",
  "isFinal": true
}
```

### DynamoDB and S3 contracts
- Canonical user profile schema (`userId` == Cognito `sub`, preferences, timestamps).
- Sessions table PK/SK design, user-scoped recent-session queries, statuses (`CREATED`, `CONNECTING`, `STREAMING`, `FINALIZING`, `COMPLETED`, `INTERRUPTED`, `FAILED`, `DELETING`), TTL semantics for ephemeral tickets, and conditional writes.
- Durable segment schema and ordering/uniqueness; distinguish provider timestamps from application wall-clock timestamps.
- S3 object naming, export formats, versioning/retention/deletion and encryption policies.
- No direct frontend access to private DynamoDB tables or arbitrary S3 objects.

## 9. Multi-agent engineering workflow

All five developers and their coding agents must work against the **same merged architecture and contracts**.

1. The orchestrator creates/reviews `ARCHITECTURE.md`, `AGENTS.md`, `API_CONTRACTS.md`, ADRs and `INTEGRATION_PLAN.md` before feature implementation.
2. Use one shared GitHub repository; `main` is protected. Each developer uses short-lived feature branches/worktrees and opens small PRs.
3. Every agent reads `AGENTS.md` and relevant contracts before editing code. The agent must report changed interfaces, assumptions and tests executed.
4. Use shared schema/types in `packages/contracts`; never write independent, contradictory session or event models.
5. Mock unavailable components with contract-compliant fixtures so people can work independently. Replace mocks through integration tests, not last-minute manual wiring.
6. CI checks formatting, lint, TypeScript builds, unit tests, contract compatibility, security scanning and at least a smoke integration test. Never merge broken `main`.
7. Require owner review for domain changes; technical orchestrator reviews changes affecting architecture or public interfaces.
8. Deploy a shared dev/staging stack with environment isolation; do not let agents alter shared production infrastructure or spend money without authorization.
9. Hold short integration checkpoints: **Can the current merged main branch sign in, stream one test audio sample, save a transcript, and retrieve it?** Expand to two users, then N simultaneous users.
10. Record architecture changes in an ADR with rationale, alternatives, security impacts and migration plan. Contract changes require versioning and consumer updates.

### Suggested branch conventions
`feat/frontend-*`, `feat/auth-*`, `feat/stream-*`, `feat/storage-*`, `feat/eval-*`, `docs/architecture-*`.

### Definition of done for any feature
- Tests and documentation are updated; contracts remain compatible or are explicitly versioned.
- Basic failure path is covered, not just happy path.
- Logs/metrics are present where operationally relevant and do not expose private audio/transcripts/tokens.
- CI passes and domain owner reviewed it.
- Integrated feature is demonstrated against the current shared environment or a documented contract-based mock.

## 10. Evaluation and acceptance criteria

Person 5 owns the methodology, but the whole team must make the system measurable. Establish baselines rather than inventing promises about latency/accuracy.

**Required measurements:**
- Word error rate (WER) on a reproducible labeled test set; include accents/noise/language and versioned sample details.
- Caption latency p50 and p95 with a defined clock/measurement method (separately measure capture→partial, capture→final and stop→export).
- Active concurrent streams and admission rejects; throughput/session-start rate; capacity under target load.
- WebSocket and Transcribe error rates; stream restart outcomes; percentage of uninterrupted meeting time.
- Checkpoint persistence lag, missing/duplicate segments, completion/export success and history retrieval accuracy.
- Security isolation test: user A cannot list/view/download/delete user B's transcript.
- Per-tenant/user fair usage and cost estimates.

**Initial end-to-end acceptance:**
1. Two or more authenticated users simultaneously transcribe independent microphone/audio sources.
2. Both see partial/final captions, with strict session separation.
3. Both can later retrieve their own completed transcripts and cannot access each other's.
4. An interrupted session has explicit status and retains previously durable final segments.
5. Staging alerts for material API, streaming, persistence and capacity failures are demonstrated.
6. A bounded, repeatable load test plus a baseline WER/latency report exists.

Do not assign arbitrary production SLOs until the team has measured performance and agreed on product requirements.

## 11. Initial delivery milestones

**Milestone 0 — Docs and contract freeze (before feature code)**
- Codex outputs the documentation set listed below and an ADR register.
- Team approves identity/session lifecycle, audio format, WSS ticket model, storage schema, observability keys and ownership.

**Milestone 1 — Vertical slice**
- One authenticated user; React microphone/sample audio → ALB → local or deployed ECS worker → Transcribe SDK → captions → durable segment checkpoint → S3 export → history view.
- Use dev/staging and keep AWS spending capped.

**Milestone 2 — Multi-user isolation and scale**
- Concurrent independent users, quotas/admission control, session separation, graceful failure/reconnect, task autoscaling and load test.

**Milestone 3 — Production hardening**
- Security review, backup/retention decisions, deletion policies, runbooks, alerts, dashboards, deployment rollback, cost monitoring, polished UX.

**Milestone 4 — Optional extension**
- Collaborative viewing, AI summaries, exports, advanced search; separate ADRs, not part of MVP unless approved.

## 12. Exact bootstrap assignment for Codex

Inspect the existing repository first; preserve useful existing material. Then generate or revise the following, consistent with this file:

1. **`ARCHITECTURE.md`** — C4-style context/container diagrams in Mermaid, control/data paths, trust boundaries, AWS resources, ALB/ECS/WebSocket topology, concurrency/stream rotation, scaling, failures, security, cost trade-offs, explicit Option B vs A distinction.
2. **`AGENTS.md`** — mandatory instructions for all five agents, per-directory ownership, shared contracts, coding/testing standards, PR process, prohibited assumptions, documentation change protocol, escalation/ADR rules.
3. **`API_CONTRACTS.md`** — versioned HTTP and WebSocket contracts, sample payloads, standard errors, ticket/auth semantics, idempotency, data schemas and ownership rules; identify any unresolved proposed items.
4. **`INTEGRATION_PLAN.md`** — team dependency graph, milestone order, exact handoff interfaces, mocks, CI expectations, release plan, test environment strategy and integration checkpoint cadence.
5. **`README.md`** — product overview, architecture summary, repo map, safe local setup, prerequisites, run/test/deploy outline (clearly mark not-yet-implemented commands).
6. **`docs/adr/`** — ADR proposals for WebSocket authentication/tickets, session state ownership, durable segment storage, reconnect/rotation strategy, multi-task session routing, audio format, and environment/deployment strategy.
7. **`docs/security.md`, `docs/data-model.md`, `docs/streaming-protocol.md`** — concrete starter specifications with assumptions marked.
8. **`evaluation/README.md`** — evaluation methodology, test matrix, telemetry schema, monitoring/alert requirements and reproducibility expectations for Person 5.
9. **`.github/` guidance** — propose PR checklist, CODEOWNERS and CI checks; create safe starter workflows only if compatible with existing repo. Do not require unconfigured AWS secrets to pass locally.

**Stop after the documentation/bootstrap phase.** Summarize created/changed files, unresolved architectural decisions, recommended first vertical-slice tasks for each person, test commands you actually ran, and risks. Ask the team to approve the decisions before starting implementation. If existing repo code conflicts with this charter, report the conflict rather than blindly deleting it.

## 13. Decisions requiring explicit team review

- Initial deployment AWS Region and expected peak concurrent users, with actual Transcribe quotas checked for that account/Region.
- Browser audio capture configuration, accepted input sample rates and codec/PCM contract.
- Browser→ECS WebSocket authentication/ticket mechanism, replay prevention and renewal.
- Whether recording can contain sensitive data, retention/deletion policy and consent UX.
- DynamoDB segment persistence schema vs temporary streaming journal + final S3 exports.
- Cross-task reconnect semantics and whether collaborative session viewing is in scope.
- Long-session rotation strategy, acceptable transcript gaps and recovery objective.
- ECS target scaling policy, health checks, shutdown deadlines and load-testing budget.
- Quantified latency, accuracy and availability targets after baseline measurement.

## 14. Relevant AWS documentation (verify again during implementation)

- Transcribe Streaming overview: https://docs.aws.amazon.com/transcribe/latest/dg/streaming.html
- SDK and streaming setup: https://docs.aws.amazon.com/transcribe/latest/dg/streaming-setting-up.html
- Transcribe streaming API: https://docs.aws.amazon.com/transcribe/latest/APIReference/API_streaming_StartStreamTranscription.html
- Transcribe endpoints and concurrency quotas: https://docs.aws.amazon.com/general/latest/gr/transcribe.html
- ALB WebSocket target behavior: https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-target-group-attributes.html
- ECS load balancer draining: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/load-balancer-connection-draining.html

**Final instruction:** Build toward a **single deployable, testable, measurable multi-user system**. Favor explicit contracts, security boundaries, reproducible integration, and realistic failure handling over an impressive list of AWS services.
