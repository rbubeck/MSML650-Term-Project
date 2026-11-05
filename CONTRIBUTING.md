# Contributing

This repository is organized around five domain owners working against shared contracts. Read `AGENTS.md` before contributing, even when working without a coding agent.

## Before starting

1. Use Node.js 24 (`nvm use` reads `.nvmrc` when nvm is installed).
2. Run `npm ci` from the repository root.
3. Pull the approved integration base. Merge the current foundation PR from `nandan/dev` into protected `main` before creating long-lived team branches when possible.
4. Read the README in the directory you will change.
5. Read `API_CONTRACTS.md` and any relevant accepted ADR.
6. Confirm the issue has one owner and a small, demonstrable outcome.
7. Create a short-lived branch from `main`.

All TypeScript workspace configurations extend `tsconfig.base.json`. Do not weaken strictness in an individual workspace without an approved, documented reason.

Before opening a TypeScript pull request, run:

```bash
npm run check
```

Use `npm run format` to apply repository formatting. See `docs/engineering-standards.md` for file layout, ESM, testing, contracts, and dependency rules.

Suggested branch names:

```text
feat/frontend-<topic>
feat/auth-<topic>
feat/stream-<topic>
feat/storage-<topic>
feat/eval-<topic>
docs/<topic>
```

## Scope rules

- Keep each pull request within one owner area where possible.
- Change shared contracts before changing multiple consumers.
- Do not create local copies of session states, error codes, or wire messages.
- Do not deploy shared AWS resources without explicit approval.
- Do not commit credentials, private audio, transcripts, datasets, or `.env` files.
- Existing evaluation scripts remain in place until Person 5 performs a reviewed migration.

## Pull requests

Use `.github/PULL_REQUEST_TEMPLATE.md`. Include:

- the outcome;
- interfaces changed;
- assumptions and unresolved decisions;
- commands and tests actually run;
- security, reliability, cost, and migration impact;
- the appropriate domain owner as reviewer.

The technical orchestrator reviews changes to architecture, public contracts, session lifecycle, or multiple owner areas.

## Current bootstrap rule

Local implementation is allowed only behind accepted boundaries or contract-compliant fakes. A proposed ADR is not an accepted decision. Specifically:

- Person 1 may scaffold UI/audio preparation but must not invent WebSocket semantics.
- Person 2 may build schemas/interfaces and fake-backed handler logic but must not finalize ticket/state semantics before ADR-001/ADR-002.
- Person 3 may maintain the implemented Transcribe adapter and build a fake-backed protocol slice after the v1 subset is frozen.
- Person 4 may design interfaces/CDK tests but must not deploy before ADR-007 and explicit approval.
- Person 5 may migrate evaluation tools and build local tests but must not run paid/load tests without an approved bound.

The current repository has one manually verified paid Transcribe smoke path. Normal CI/tests remain deterministic and AWS-free.

