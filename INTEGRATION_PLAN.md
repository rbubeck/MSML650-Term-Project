# Integration and Delivery Plan

Status: Proposed for team review  
Last reviewed: 2026-11-01

## Objective

Deliver one contract-driven Option B system in thin, continuously integrated vertical slices. Component owners may work concurrently only after shared interfaces are approved. Mocks reproduce shared contracts and are replaced at defined checkpoints.

## Dependency graph

```mermaid
flowchart LR
  D[Milestone 0: architecture, contracts, ADR decisions] --> C[packages/contracts]
  C --> F[Person 1: frontend + stream client]
  C --> A[Person 2: auth + control API]
  C --> S[Person 3: streaming service]
  C --> P[Person 4: persistence + CDK]
  C --> Q[Person 5: tests + observability]

  A --> T[Ticket/session integration]
  S --> T
  F --> W[Browser/WebSocket integration]
  S --> W
  S --> R[Checkpoint integration]
  P --> R
  Q --> I[Integrated quality gates]
  T --> I
  W --> I
  R --> I
  P --> E[Shared dev/staging environment]
  I --> E
```

## Milestone 0: contract freeze

Required approvals:

- Option B boundaries and non-goals.
- Cognito subject and owner-only authorization model.
- Session states and transition owners.
- HTTP v1 shapes and standard errors.
- Ticket representation, transport, lifetime, consumption, and reconnect renewal.
- WebSocket v1 envelopes, binary header, audio format, and initial limits.
- Segment identity/checkpoint ordering and export completion semantics.
- DynamoDB/S3 model direction.
- Telemetry field/metric names.
- Region, environment/account strategy, budget, and authorized deployers.

The decision register records approvers/dates. Contract changes after freeze are additive or versioned.

## First implementation tasks by owner

These begin only after Milestone 0 approval.

### Person 1 — frontend

1. Scaffold the approved React/TypeScript workspace and authentication shell.
2. Implement a contract-generated HTTP client and a mocked session dashboard.
3. Build AudioWorklet capture/resampling with PCM golden-vector tests.
4. Implement `stream-client` state machine against the mock WebSocket server.
5. Add recording permission, connecting/reconnecting/finalizing, and accessible error UX.

Handoff: PCM vectors and browser events to Person 3; contract failures and UI needs to Person 2/3.

### Person 2 — identity and control API

1. Define Cognito/CDK requirements with Person 4 and API authorizer claims.
2. Implement profile and session create/read/list/rename/complete/delete handlers behind repositories.
3. Implement idempotency and owner-scoped authorization tests.
4. Implement ticket issuer/refresh adapter and contract fixtures.
5. Provide local/mock identity injection that cannot be enabled in deployed production.

Handoff: ticket fixtures/verification contract to Person 3; data access interfaces to Person 4.

### Person 3 — streaming and orchestration

1. Scaffold the Node/TypeScript service with health/readiness and graceful shutdown.
2. Implement protocol parser/state machine and binary-frame validation without AWS first.
3. Implement ticket verifier and session lease interfaces using Person 2/4 mocks.
4. Implement Transcribe adapter behind a fake provider producing partial/final events.
5. Add bounded queues, deduplication, checkpoint adapter, metrics hooks, and fault tests.
6. Replace fake provider with the official SDK in approved dev/staging.

Handoff: `stream-client` contract to Person 1; ticket requirements to Person 2; checkpoint/lease calls to Person 4; instrumentation points to Person 5.

### Person 4 — data and platform

1. Finalize table/index/object schemas with migration/version strategy.
2. Implement persistence adapters and DynamoDB/S3 contract tests using emulators/mocks where appropriate.
3. Create CDK stacks for identity/control, data, network/streaming, hosting, and observability boundaries.
4. Provision ECR, Fargate service, ALB, health checks, roles, log groups, and approved environment configuration.
5. Implement safe deployment/rollback and secrets-free GitHub OIDC plumbing.

Handoff: typed repository/lease/checkpoint interfaces to Persons 2/3; environment endpoints and rollback guide to team.

### Person 5 — evaluation and release quality

1. Migrate existing WER scripts without losing provenance; make them import-safe, tested, and pinned.
2. Define telemetry schema/metrics with low-cardinality labels and measurement clocks.
3. Build protocol/API fixtures, integration harness, two-user isolation test, and bounded load plan.
4. Specify dashboards/alarms/runbooks; Person 4 provisions, Persons 2/3 instrument.
5. Publish baseline WER/latency/recovery/capacity report with environment and dataset versions.

Handoff: metric names and instrumentation acceptance to Persons 2–4; release report to all owners.

## Shared contracts package

After tooling approval, `packages/contracts` contains:

- runtime schemas and inferred TypeScript types;
- OpenAPI source/generated artifact for HTTP v1;
- WebSocket envelope/control/event schemas;
- session states and transition metadata;
- standard application error codes;
- binary-frame encode/decode golden vectors;
- telemetry event names/fields.

Publication is workspace-local initially. Contract tests verify examples in `API_CONTRACTS.md` or generate examples from schemas to avoid drift.

## Contract-compliant mocks

| Mock | Provider | Consumers | Exit condition |
|---|---|---|---|
| HTTP API fixture/server | Person 2 | Person 1, e2e | Real dev API passes same contract suite |
| WebSocket streaming simulator | Person 3 | Person 1, e2e | ECS service with fake then real Transcribe passes suite |
| Ticket verifier/issuer fixture | Persons 2/3 | API + streaming | Atomic real store integration passes replay/race tests |
| Fake Transcribe adapter | Person 3 | streaming tests | Approved dev integration passes partial/final/error tests |
| Persistence repository | Person 4 | Persons 2/3 | DynamoDB/S3 adapter passes repository contract suite |
| Telemetry sink | Person 5 | Persons 2–4 | Staging metrics/log assertions pass |

Mocks must validate the same schemas and error codes. A mock-only behavior cannot become an undocumented dependency.

## Integration checkpoints

Hold a short checkpoint at least twice weekly while active integration is underway. Demonstrate from merged `main`, not an owner's private branch.

1. Contract smoke: generated types build; HTTP and WebSocket examples validate.
2. Local vertical slice: sample PCM → fake stream → captions → fake checkpoint → history.
3. AWS speech slice: sample PCM → ECS/dev worker → Transcribe → checkpoint/export.
4. Authenticated slice: Cognito sign-in → ticket → live microphone → history.
5. Isolation slice: two users stream concurrently and cannot access each other.
6. Failure slice: disconnect/task drain/provider/persistence failure has truthful state and retained finals.
7. Bounded scale slice: approved N streams with admission rejects, metrics, cost record, and cleanup.

At every checkpoint ask: can current merged `main` sign in, stream one versioned sample, save a transcript, and retrieve it?

## Test environment strategy

### Local

- No required AWS credentials for unit/contract tests.
- Contract fixtures, fake Transcribe, repository fakes, and a local WebSocket server.
- Optional emulators must not define behavior that differs silently from AWS.

### Dev

- Developer integration with bounded resources and synthetic/non-sensitive audio.
- Manual or branch deployments only through approved mechanism.
- Short retention and explicit cleanup.

### Staging

- Production-shaped trust boundaries at small capacity.
- Shared acceptance, failure injection, dashboards, alarms, and bounded load tests.
- Versioned reference audio with documented rights/consent.

### Production

- No agent-initiated deployment.
- Protected approval, immutable artifact promotion, migration/rollback plan, security and release sign-off.

## CI expectations

As implementation arrives, required checks evolve in reviewed PRs:

1. secret and dependency review/scanning;
2. formatting and lint;
3. TypeScript typecheck/build;
4. Python evaluation lint/tests;
5. unit tests and coverage trend;
6. contract/example compatibility;
7. CDK synth and infrastructure assertions without deployment;
8. integration smoke with local mocks;
9. container build and vulnerability scan;
10. e2e staging test only in an authorized protected workflow.

The bootstrap CI deliberately runs only repository checks that currently exist. It uses no AWS secrets and does not deploy.

## Branch, review, and release

- Protected `main`; short-lived branches and small PRs.
- Domain owner reviews owned paths; orchestrator reviews public/cross-component interfaces.
- Contract or architecture change links an ADR and lists all consumers.
- Merge order: contract → producer implementation → consumer implementation/migration → removal of old contract.
- Release uses immutable application/container versions and records contract/schema versions.
- Rollback checks schema compatibility and cannot simply restore code that cannot read newly written data.

## Quality gates

Milestone 1 requires one complete authenticated path, checkpoint durability, export/history, basic failure behavior, privacy-safe telemetry, and documented actual tests.

Milestone 2 additionally requires two-user isolation, distributed admission behavior, task draining/reconnect, bounded load evidence, and baseline WER/latency/cost.

Milestone 3 additionally requires security review, retention/deletion approval, alarms/runbooks demonstrated, backup/rollback decisions, vulnerability remediation, and team release sign-off.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Five divergent models | Contract-first shared package and owner reviews |
| Browser audio incompatibility | Golden vectors and early browser matrix |
| Ticket leakage/replay | ADR-001 proof and security tests before microphone integration |
| AWS quota/cost surprise | Account/Region verification, conservative admission, budgets, bounded tests |
| WebSocket loss during deploy | SIGTERM/draining/reconnect tests and truthful interruption |
| Final transcript loss/duplicates | Conditional checkpoints and deterministic identities |
| False performance claims | Versioned methodology and baseline evidence |
| Sensitive content exposure | No raw audio persistence; log redaction tests; retention approval |
| Nested/unclear repository root | Team chooses canonical Git root before workspace migration |

## Immediate team review agenda

1. Confirm canonical Git repository root and GitHub handles/branch protection.
2. Review ADRs 001–007 and resolve their evidence questions.
3. Select Region, target peak concurrent streams, and approved AWS budget.
4. Select TypeScript workspace/toolchain and schema/OpenAPI approach.
5. Freeze v1 HTTP/WebSocket/audio/state contracts.
6. Assign owners and create the Milestone 1 integration board.

