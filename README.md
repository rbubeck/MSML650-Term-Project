# Multi-User Live Speech-to-Text Platform

Status: architecture/bootstrap phase; product services are not implemented or deployed.

This project is building a secure browser-based live transcription product on AWS. Multiple authenticated users will independently stream microphone audio through an application-owned WebSocket backend running on Amazon ECS/Fargate. The backend controls Amazon Transcribe Streaming connections, durable final-segment checkpoints, session lifecycle, and private transcript history.

The source charter is [direction_option_b.md](direction_option_b.md). Proposed architecture and contracts require team approval before product feature work begins.

The untracked legacy brief `speech_to_text_direction.md` describes the conflicting direct-browser Option A. It has been preserved for review but is not the active charter for this Option B bootstrap; the team should archive or clearly supersede it after confirming repository history.

## MVP

The MVP is intended to support:

- Cognito signup, login, recovery, and profile preferences;
- live microphone capture and captions in a React application;
- authenticated WSS audio through ALB to a Node.js/TypeScript Fargate service;
- backend-managed Amazon Transcribe Streaming;
- durable final transcript checkpoints and completed JSON/TXT exports;
- owner-only history, view, rename, download, and deletion;
- concurrent independent users with admission control and explicit failure states.

Shared rooms, multiple microphones in one meeting, live speaker identity, video calling, summaries, translations, sentiment, raw-audio storage, and seamless active-socket failover are not MVP features.

## Architecture summary

```text
React + AudioWorklet ──WSS──> ALB ──> ECS/Fargate streaming service
                                              │
                                              └──> Amazon Transcribe Streaming

React ──HTTPS/JWT──> API Gateway ──> Lambda ──> DynamoDB + S3
         Cognito          control plane          metadata, segments, exports
```

The browser never connects directly to Transcribe and never receives permanent AWS credentials. Continuous audio does not flow through Lambda or API Gateway WebSocket routes. See [ARCHITECTURE.md](ARCHITECTURE.md).

## Documentation and decisions

- [Architecture](ARCHITECTURE.md)
- [API and WebSocket contracts](API_CONTRACTS.md)
- [Machine-readable contract proposals](packages/contracts/README.md)
- [Integration plan](INTEGRATION_PLAN.md)
- [Contribution guide](CONTRIBUTING.md)
- [Shared engineering standards](docs/engineering-standards.md)
- [Incremental orchestrator decision queue](docs/orchestrator/decision-queue.md)
- [Agent and ownership rules](AGENTS.md)
- [Security specification](docs/security.md)
- [Data model](docs/data-model.md)
- [Streaming protocol](docs/streaming-protocol.md)
- [ADR register](docs/adr/README.md)
- [Evaluation methodology](evaluation/README.md)

ADRs have individual proposed or accepted statuses in the ADR register. An accepted tooling ADR is not a claim that product features or AWS infrastructure exist.

## Intended repository layout

```text
.
├── frontend/                 # Person 1: React UX and browser audio
├── backend/
│   ├── api/                  # Person 2: HTTP control plane
│   ├── streaming/            # Person 3: WSS and Transcribe integration
│   └── persistence/          # Person 4: storage adapters
├── packages/
│   ├── contracts/            # shared runtime schemas and types
│   └── stream-client/        # browser streaming integration
├── infrastructure/           # Person 4: AWS CDK
├── evaluation/               # Person 5: quality methodology/tooling
├── tests/
│   ├── integration/
│   └── e2e/
├── Scripts/                  # existing evaluation prototype; migration pending
├── Datasets/                 # local/reference metadata; large audio excluded
├── Results/                  # existing reference artifacts
└── docs/
    ├── adr/
    └── runbooks/
```

Product directories now contain ownership and boundary READMEs so team members can prepare focused issues and mocks. Build tooling and product code will be scaffolded only after the relevant incremental decisions are approved. Do not create independent component repositories or duplicate shared types.

## Existing evaluation prototype

The repository currently contains Python tools that prepare AMI/LibriSpeech references and calculate word error rate:

- `Scripts/prepare_ami_transcript.py`
- `Scripts/normalize_ami_reference.py`
- `Scripts/prepare_librispeech.py`
- `Scripts/evaluate_wer.py`
- `Scripts/evaluate_wer_batch.py`
- `Scripts/evaluate_librispeech.py`

These scripts are useful input for Person 5 but are not production services. Current results are reference/synthetic evaluation artifacts, not verified Amazon Transcribe accuracy measurements. Known migration work is documented in [evaluation/README.md](evaluation/README.md).

## Prerequisites

Repository development requires:

- Node.js 24 LTS; npm workspaces are the accepted package/workspace tool;
- TypeScript 6.0.x strict mode, Zod 4, Vitest 5, ESLint 10, and Prettier 3 (installed by `npm ci`);
- Python 3 for evaluation tooling;
- an approved AWS account/Region and AWS CLI/SSO access;
- AWS CDK after infrastructure scaffolding;
- Docker for the streaming service image;
- access to licensed/approved evaluation audio.

Do not create long-lived AWS access keys for this project. Never commit credentials, `.env` secrets, user audio, or private transcripts.

## Current safe checks

From the repository root:

```bash
npm ci
npm run check
python3 -m compileall -q Scripts
git status --short
```

The npm checks validate formatting, lint, TypeScript, and currently available tests without contacting AWS. Python compilation checks syntax only; it does not run WER tests or validate datasets.

## Not-yet-implemented commands

The following infrastructure commands are planned and are not currently valid:

```bash
# Planned only — infrastructure does not exist
npx cdk synth
npx cdk deploy <approved-dev-stack>
```

No documentation should imply these work until their configuration is merged and CI proves it.

## Collaboration workflow

1. Read `AGENTS.md`, relevant contracts, and accepted ADRs.
2. Work in a short-lived feature branch.
3. Change shared contracts before producers/consumers when necessary.
4. Use shared schemas instead of component-local copies.
5. Open a small PR using the checklist and request the domain owner.
6. Report tests actually executed, interface changes, assumptions, and operational/security impact.
7. Demonstrate against the merged integration path or a contract-compliant mock.

`main` should be protected. GitHub identities for CODEOWNERS still require team input.

## Delivery milestones

1. Milestone 0: approve architecture, contracts, ADRs, Region/budget, and toolchain.
2. Milestone 1: one authenticated end-to-end vertical slice.
3. Milestone 2: concurrent-user isolation, admission, reconnect, scaling, and bounded load evidence.
4. Milestone 3: security/retention hardening, alarms/runbooks, rollback, and release quality.
5. Milestone 4: separately approved optional extensions.

## Before implementation begins

The team must resolve at least:

- canonical Git repository root and GitHub ownership;
- AWS Region, account/environment layout, expected peak streams, and verified quota;
- browser audio contract;
- WebSocket ticket transport and lifetime;
- state-transition and finalization ownership;
- DynamoDB/S3 schema direction;
- reconnect/rotation behavior;
- sensitive-data, consent, retention, and deletion policy;
- TypeScript/package/schema/test toolchain;
- load-test budget and baseline measurement targets.

See [INTEGRATION_PLAN.md](INTEGRATION_PLAN.md) for the review agenda and owner handoffs.

## AWS references

- [Amazon Transcribe streaming](https://docs.aws.amazon.com/transcribe/latest/dg/streaming.html)
- [Amazon Transcribe streaming setup](https://docs.aws.amazon.com/transcribe/latest/dg/streaming-setting-up.html)
- [StartStreamTranscription API](https://docs.aws.amazon.com/transcribe/latest/APIReference/API_streaming_StartStreamTranscription.html)
- [Transcribe endpoints and quotas](https://docs.aws.amazon.com/general/latest/gr/transcribe.html)
- [ALB target group behavior](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-target-group-attributes.html)
- [ECS connection draining](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/load-balancer-connection-draining.html)

