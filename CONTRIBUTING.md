# Contributing

This repository is organized around five domain owners working against shared contracts. Read `AGENTS.md` before contributing, even when working without a coding agent.

## Before starting

1. Use Node.js 24 (`nvm use` reads `.nvmrc` when nvm is installed).
2. Run `npm ci` from the repository root.
3. Pull the latest `main` after the bootstrap PR is merged.
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

Directory scaffolding and contract review are allowed. Product implementation begins only after the relevant decision is accepted and recorded. A proposed ADR is not an accepted decision.

