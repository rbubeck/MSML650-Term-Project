# Shared Engineering Standards

Status: Accepted baseline  
Accepted: 2026-11-02

Every product workspace follows this baseline unless an accepted ADR records a justified exception.

## Toolchain

| Concern | Decision |
|---|---|
| Runtime | Node.js 24 LTS |
| Workspace/package manager | npm 11 workspaces with one root lockfile |
| Product language | TypeScript 6.0.x in strict mode |
| Modules | ECMAScript modules (`import`/`export`) |
| Runtime schemas | Zod 4 in `packages/contracts` |
| Unit/contract tests | Vitest 5, explicit imports, Node environment by default |
| Linting | ESLint 10 flat configuration with typescript-eslint |
| Formatting | Prettier 3 plus `.editorconfig` |
| Generated output | `dist/`; never committed |

TypeScript 6.0.x is intentional: it is inside the current official typescript-eslint support range. TypeScript 7 adoption waits until that integration is officially supported and passes this repository's checks.

## Standard commands

Run from the repository root:

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run check
```

Use `npm run format` to apply formatting. CI runs `npm run check` (format, lint, typecheck, tests, and build) and never mutates files.

## Package layout

Each TypeScript workspace uses this shape when implementation begins:

```text
<workspace>/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    └── feature.test.ts
```

Keep focused unit tests beside the source as `*.test.ts` or `*.test.tsx`. Put cross-package contract tests in `tests/integration/` and deployed user journeys in `tests/e2e/`.

## TypeScript

- Extend the root `tsconfig.base.json`; do not weaken strict flags locally without an accepted exception.
- Treat network, environment, persistence, and third-party data as `unknown` until validated.
- Prefer explicit return types on exported functions and public adapters.
- Avoid `any`; use `unknown` plus narrowing. A necessary `any` requires a local explanation.
- Use `import type` for type-only imports.
- Use ESM `import`/`export`, not `require`/`module.exports` in product code.
- Backend NodeNext source imports use runtime-correct `.js` specifiers. Frontend resolution may be set by its approved build tool.
- AWS SDK and provider payloads remain behind adapters and do not enter shared application contracts.

## Contracts and validation

- Zod definitions in `packages/contracts` are the source for structured runtime contracts.
- Infer TypeScript types from schemas rather than manually duplicating interfaces.
- Parse untrusted data at the boundary and pass validated domain values inward.
- JSON Schema/OpenAPI artifacts become generated outputs once generation is implemented.
- Breaking contracts require a version, ADR, migration, and all affected owner reviews.
- Binary PCM has a specialized parser; Zod validates JSON/control metadata, not audio samples.

## Testing

- Import `describe`, `expect`, `it`/`test`, and `vi` explicitly from `vitest`; globals stay disabled.
- Test externally observable behavior and important failure paths, not implementation trivia.
- Tests must be deterministic, isolated, and free of real AWS/network access by default.
- Wrap time, random identifiers, AWS clients, and persistence behind injectable interfaces when behavior depends on them.
- Never use real user audio, transcripts, tokens, or credentials in fixtures.
- AWS and load tests require an explicitly approved environment and budget.

## Formatting and linting

- Prettier decides formatting for supported product/config files; do not debate formatting in reviews.
- ESLint warnings fail CI (`--max-warnings 0`).
- Markdown and existing Python/evaluation artifacts are currently excluded from Prettier to avoid unrelated rewrites.
- Python quality tooling will be owned and added separately by Person 5; TypeScript tooling must not rewrite Python files.

## Dependencies

- Add dependencies to the workspace that uses them, not the root. Root dependencies are shared development tools only.
- Use `npm install <package> --workspace <workspace-name>` for runtime dependencies.
- Commit `package-lock.json` with every dependency change.
- Avoid overlapping libraries for the same concern without an ADR or owner approval.
- Never run dependency lifecycle scripts from an unreviewed package in CI or a sensitive environment.

## Definition of done

A normal TypeScript pull request passes `npm run check`, includes relevant tests, updates contracts/docs when behavior changes, reports commands actually run, and receives the domain-owner review required by `AGENTS.md`.

