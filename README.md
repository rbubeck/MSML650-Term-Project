# Multi-User Live Speech-to-Text Platform

Status: shared foundation and Amazon Transcribe provider slice implemented; browser application, control API, persistence, and cloud infrastructure are not yet implemented or deployed.

This repository is the canonical team workspace for a secure browser-based transcription product on AWS. The active architecture is Option B: browsers send application-framed audio to our Node.js WebSocket service on ECS/Fargate, and that service owns Amazon Transcribe Streaming connections. The browser never receives AWS credentials or connects directly to Transcribe.

The active charter is [direction_option_b.md](direction_option_b.md). The superseded direct-browser Option A brief was removed to prevent agents from implementing the wrong trust boundary; its history remains available in Git.

## Current verified state

| Area | State | Evidence |
|---|---|---|
| Repository/toolchain | Implemented | Node.js 24, npm 11 workspaces, TypeScript 6 strict mode, ESM, Vitest 5, ESLint 10, Prettier 3 |
| Runtime schema decision | Accepted | Zod 4 is canonical for structured network contracts; structured Zod schemas remain to be implemented |
| Binary audio contract | Implemented and unit tested | Mono PCM signed 16-bit little-endian, 16 kHz, exact 100 ms/3,200-byte payloads plus a 16-byte application header |
| Amazon Transcribe adapter | Implemented and unit tested | Official AWS SDK v3 behind `TranscriptionProvider`; provider payloads stay inside the adapter |
| AWS speech smoke test | Manually verified 2026-11-02 | Synthetic 4.016-second voice file produced partial and final `en-US` results in `us-east-1` |
| AWS development guardrail | Configured manually | Paid development account and a $20 monthly AWS Budget alert; the budget is not a hard spending cap |
| Frontend/stream client | Not implemented | Ownership and accepted audio requirements documented |
| Control API/auth | Not implemented | Proposed OpenAPI snapshot only; authentication and lifecycle ADRs remain open |
| Persistence | Not implemented | Proposed data model only; no DynamoDB/S3 resources exist |
| Deployment | Not implemented | No CDK stacks, containers, ECS service, ALB, Cognito pool, API Gateway, Lambda, DynamoDB table, S3 bucket, or Amplify app exist |
| Evaluation/e2e | Prototype/planning only | Existing Python WER utilities are not yet a reproducible release gate |

Do not interpret a successful local Transcribe smoke test as proof of browser capture, WebSockets, authentication, persistence, deployment, scalability, latency, or production readiness.

## Architecture

```text
React + AudioWorklet ──WSS──> ALB ──> ECS/Fargate streaming service
                                              │
                                              └──> Amazon Transcribe Streaming

React ──HTTPS/JWT──> API Gateway ──> Lambda ──> DynamoDB + S3
         Cognito          control plane          metadata, segments, exports
```

Continuous audio does not pass through Lambda or API Gateway WebSocket routes. Final transcript segments, not raw microphone audio, are persisted by default. See [ARCHITECTURE.md](ARCHITECTURE.md).

## Start here

Every contributor and coding agent must:

1. Read [AGENTS.md](AGENTS.md), this README, and the README for the owned directory.
2. Read [API_CONTRACTS.md](API_CONTRACTS.md), [ARCHITECTURE.md](ARCHITECTURE.md), and relevant accepted ADRs.
3. Check the [decision queue](docs/orchestrator/decision-queue.md); do not implement a proposal as if it were accepted.
4. Branch from the team-approved integration base and keep the PR within one owner area where possible.
5. Import shared contracts rather than recreating wire types or audio constants.
6. Run `npm run check` before handoff and report only tests actually run.
7. Never deploy, create AWS resources, or run paid/load tests without the orchestrator’s explicit approval.

The current foundation work is on `nandan/dev`. Prefer merging its reviewed foundation PR into protected `main` before teammates create long-lived feature branches. If the team temporarily branches from `nandan/dev`, rebase those branches onto `main` immediately after the foundation merge.

## Ownership and immediate work

| Owner | Paths | Next approved preparation | Decision gate before coupled implementation |
|---|---|---|---|
| Person 1 — frontend/UX | `frontend/`, `packages/stream-client/` | Scaffold React locally, build accessible mocked screens, design/test AudioWorklet resampling against shared PCM vectors | Coordinate WebSocket v1 state machine with Person 3; do not invent messages |
| Person 2 — identity/control API | `backend/api/` | Implement Zod schemas and handler/application interfaces against fake identity/repositories | ADR-001 ticket semantics and ADR-002 lifecycle authority |
| Person 3 — streaming/orchestration | `backend/streaming/`, streaming contracts | Maintain provider adapter; next build fake-backed WebSocket slice after contract decisions | ADR-001, ADR-002, ADR-003 and smallest WebSocket v1 freeze |
| Person 4 — persistence/platform | `backend/persistence/`, `infrastructure/` | Refine repository interfaces and CDK design/tests without deployment | ADR-002, ADR-003 and ADR-007 acceptance; explicit deployment approval |
| Person 5 — evaluation/quality | `evaluation/`, `tests/` | Migrate WER tools, define fixtures/telemetry/test methodology, add local integration tests | Dataset provenance, metric names, load budget and environment approval |

See [INTEGRATION_PLAN.md](INTEGRATION_PLAN.md) for handoffs and merge order.

## Repository map

```text
.
├── frontend/                 # Person 1: React UX and browser capture
├── backend/
│   ├── api/                  # Person 2: identity-aware HTTP control plane
│   ├── streaming/            # Person 3: WebSocket and Transcribe integration
│   └── persistence/          # Person 4: application storage adapters
├── packages/
│   ├── contracts/            # canonical schemas, types, binary codec/constants
│   └── stream-client/        # browser-facing WebSocket abstraction
├── infrastructure/           # Person 4: future AWS CDK
├── evaluation/               # Person 5: reproducible quality methodology
├── tests/
│   ├── integration/          # cross-component local contract tests
│   └── e2e/                  # authorized browser/staging journeys
├── Scripts/                  # legacy evaluation prototype; migration pending
├── Datasets/                 # reference metadata; large audio excluded
├── Results/                  # existing reference artifacts; not product evidence
└── docs/                     # ADRs, security, protocol, data model, runbooks
```

## Local development

Requirements:

- Node.js 24 and npm 11;
- Python 3 only for the existing evaluation prototype;
- AWS CLI only for the optional, paid Transcribe smoke test;
- Docker and AWS CDK later, when their implementation begins.

From the repository root:

```bash
npm ci
npm run check
python3 -m compileall -q Scripts
```

`npm run check` formats-checks, lints, type-checks, runs deterministic tests without AWS, and builds implemented workspaces. The Python command checks syntax only.

## Optional Amazon Transcribe smoke test

This is manual, paid, bounded to 30 seconds, and must use synthetic or explicitly approved audio. It requires an authorized profile with `transcribe:StartStreamTranscription` in the approved Region.

```bash
AWS_PROFILE=live-transcription-dev \
AWS_REGION=us-east-1 \
npm run transcribe:smoke --workspace @live-transcription/streaming -- \
/absolute/path/to/mono-16khz-int16.wav
```

Read [the smoke-test runbook](docs/runbooks/amazon-transcribe-smoke-test.md) first. Never commit the audio or transcript output.

## Open decisions blocking the first integrated slice

Resolve these incrementally rather than in one large design pass:

1. ADR-001: one-time WebSocket ticket transport, lifetime, consumption and reconnect renewal.
2. ADR-002: canonical session state-transition/finalization authority.
3. ADR-003: final-segment identity, checkpoint ordering and durable storage boundary.
4. Freeze the smallest WebSocket v1 JSON message subset around the accepted binary audio contract.
5. ADR-007: development stack/account layout, deployment authority, cleanup, retention and idle-cost controls.
6. Consent, transcript retention/deletion, supported languages and regulated-data policy.

## Documentation index

- [Architecture](ARCHITECTURE.md)
- [API and WebSocket contracts](API_CONTRACTS.md)
- [Integration plan](INTEGRATION_PLAN.md)
- [Contribution workflow](CONTRIBUTING.md)
- [Engineering standards](docs/engineering-standards.md)
- [Decision queue](docs/orchestrator/decision-queue.md)
- [ADR register](docs/adr/README.md)
- [Security and privacy](docs/security.md)
- [Proposed data model](docs/data-model.md)
- [Streaming protocol](docs/streaming-protocol.md)
- [Shared contracts](packages/contracts/README.md)
- [Evaluation methodology](evaluation/README.md)
- [Operational runbooks](docs/runbooks/README.md)

## Non-goals for the first MVP

Shared meeting rooms, multiple microphones per session, speaker identity, video calling, summaries, translation, sentiment, custom model training, raw-audio storage, and seamless migration of an active WebSocket between ECS tasks are not part of the first MVP.
