# ADR-009: Shared TypeScript Engineering Toolchain

Status: Accepted  
Accepted: 2026-11-02  
Owner: Technical orchestrator

## Context

Five contributors and their coding agents need identical local and CI behavior. Uncoordinated formatters, module systems, test runners, and TypeScript versions would create noisy changes and component incompatibility.

TypeScript 7.0 is stable, but the current official typescript-eslint supported TypeScript range is `>=4.8.4 <6.1.0`. The repository prioritizes an officially compatible complete toolchain over adopting the newest compiler immediately.

## Decision

Use:

- Node.js 24 LTS;
- npm 11 workspaces and one root lockfile;
- TypeScript 6.0.x with shared strict mode;
- ECMAScript modules;
- Zod 4 for runtime schemas;
- Vitest 5 for TypeScript unit and contract tests;
- ESLint 10 flat configuration with typescript-eslint;
- Prettier 3 and EditorConfig;
- colocated `*.test.ts`/`*.test.tsx` unit tests;
- `tests/integration` for cross-package tests and `tests/e2e` for deployed journeys.

Root scripts provide `format`, `format:check`, `lint`, `typecheck`, `test`, and `check`. The intended CI gate runs the non-mutating `check` command.

Implementation note, 2026-11-05: the root `check` command exists, but the GitHub workflow was removed on the current branch. Automated CI enforcement is pending restoration; local checks remain required.

## Alternatives

- TypeScript 7 immediately: rejected until official typescript-eslint compatibility is available.
- Jest: capable, but Vitest gives direct modern TypeScript/ESM support with less configuration and fits the future Vite frontend.
- Node's built-in test runner: fewer dependencies, but less shared browser/frontend testing integration.
- Per-package toolchains: rejected because they increase drift and onboarding cost.
- CommonJS: rejected for new product code; dependencies and browser tooling are ESM-oriented.

## Consequences

- All product packages share one quality baseline and lockfile.
- Frontend packages may extend Vitest with a DOM/browser environment later without changing the common runner.
- TypeScript 7 is a recorded future upgrade, not an accidental dependency update.
- Python evaluation tooling remains separate and will be defined by Person 5.

## Upgrade policy

Dependency upgrades use a focused PR, run `npm run check`, review migration notes, and preserve Node/AWS compatibility. Major versions are never introduced by unrelated feature work.

