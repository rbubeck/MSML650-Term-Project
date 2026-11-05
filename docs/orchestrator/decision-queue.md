# Orchestrator Decision Queue

This queue keeps decisions within human review capacity. Resolve one stage before opening the next stage's implementation work.

## Stage 1 — Repository toolchain

Accepted on 2026-11-02:

- Package manager/workspace: npm workspaces.
- Runtime major version: Node.js 24 LTS.
- Runtime contract source: Zod 4 in `packages/contracts`.
- TypeScript configuration: shared strict mode.
- Product modules: ECMAScript modules.
- Unit/contract tests: Vitest 5.
- Linting: ESLint 10 flat config with typescript-eslint.
- Formatting: Prettier 3 and EditorConfig.
- Compiler compatibility: TypeScript 6.0.x until TypeScript 7 is officially supported by typescript-eslint.

Stage 1 is complete. Shared details are in `docs/engineering-standards.md` and ADR-009.

Outcome: root workspace files, lockfile, shared scripts and buildable packages. Later stages have since added the audio codec and provider experiment; Stage 1 itself did not decide product behavior.

## Stage 2 — First local vertical-slice contracts

Accepted on 2026-11-02:

- Browser/server audio and binary frame format: ADR-006.

Decide:

1. ticket semantics and local verifier interface;
2. canonical session state transitions;
3. final-segment checkpoint timing and identity;
4. ~~exact browser PCM and binary frame format~~ — accepted in ADR-006.

Outcome: accept ADR-001, ADR-002, ADR-003, and ADR-006; freeze the smallest WebSocket v1 subset.

## Stage 3 — Local streaming slice

Current status: not started. The provider interface/real AWS adapter exists, but there is no WebSocket state machine, fake-backed end-to-end local slice or checkpoint.

Build:

1. WebSocket state machine;
2. fake ticket/session/checkpoint adapters;
3. fake transcription provider;
4. protocol and failure tests;
5. simple stream-client test harness.

Outcome: deterministic sample audio produces partial/final captions and a durable fake checkpoint without AWS.

## Stage 4 — AWS development integration

Current status: partially de-risked, not deployed.

Confirmed on 2026-11-02:

- development calls use `us-east-1`;
- an authorized paid AWS account is available;
- a $20 monthly AWS Budget alert is configured (not a hard cap);
- the official SDK adapter successfully streamed a bounded synthetic file and returned partial/final results.

Still required before deployment:

1. accept ADR-007 account/environment/cleanup/removal strategy;
2. verify quota and select a conservative application concurrency target;
3. authorize named deployers and a dev-stack deployment mechanism;
4. decide ECS/ALB health, drain, egress and minimum-capacity configuration;
5. estimate ALB/Fargate/log/network idle cost against existing account spend.

Outcome: replace the provider fake with Amazon Transcribe in a bounded dev deployment.

## Stage 5 — Multi-user and production hardening

Address distributed admission, reconnect/rotation measurement, autoscaling, deletion/retention, alarms/runbooks, load testing, and release gates.

These are intentionally not prerequisites for beginning the local streaming slice.

