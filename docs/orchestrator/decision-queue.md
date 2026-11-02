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

Outcome: root workspace files, lockfile, shared scripts, and empty buildable packages. No application behavior.

## Stage 2 — First local vertical-slice contracts

Decide:

1. ticket semantics and local verifier interface;
2. canonical session state transitions;
3. final-segment checkpoint timing and identity;
4. exact browser PCM and binary frame format.

Outcome: accept ADR-001, ADR-002, ADR-003, and ADR-006; freeze the smallest WebSocket v1 subset.

## Stage 3 — Local streaming slice

Build:

1. WebSocket state machine;
2. fake ticket/session/checkpoint adapters;
3. fake transcription provider;
4. protocol and failure tests;
5. simple stream-client test harness.

Outcome: deterministic sample audio produces partial/final captions and a durable fake checkpoint without AWS.

## Stage 4 — AWS development integration

Decide:

1. account and Region;
2. quota/concurrency target and budget;
3. dev environment and deployment authorization;
4. ECS/ALB health, drain, and minimum capacity configuration.

Outcome: replace the provider fake with Amazon Transcribe in a bounded dev deployment.

## Stage 5 — Multi-user and production hardening

Address distributed admission, reconnect/rotation measurement, autoscaling, deletion/retention, alarms/runbooks, load testing, and release gates.

These are intentionally not prerequisites for beginning the local streaming slice.

