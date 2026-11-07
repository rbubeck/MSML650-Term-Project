# Contributing — Option A Phase 1

Read `AGENTS.md`, `direction_option_a.md`, `ARCHITECTURE.md`, `API_CONTRACTS.md`, `INTEGRATION_PLAN.md`, your area README, and accepted ADRs before starting.

## Initial collaboration rule

The first shared PR implements the minimum Zod application contracts. After that, Persons 1–4 build their Phase 1 components in parallel against the shared schemas and deterministic fakes; Person 5 integrates them.

- Use short-lived `feat/frontend-*`, `feat/auth-*`, `feat/direct-stream-*`, `feat/storage-*`, `feat/eval-*`, or `docs/*` branches.
- Keep one owner area per PR where practical and request affected-owner review for public contracts or lifecycle changes.
- Do not invent local session states, errors, stream URL shapes, or final identities.
- Provider EventStream belongs in `packages/stream-client`; application JSON belongs in `packages/contracts`.
- Preserve evaluation artifacts and never commit credentials, signed URLs, private audio/transcripts, or environment files.
- Do not add recorded uploads, exports, summaries, or production infrastructure to Phase 1.

Run `npm run check` before TypeScript handoff and report the exact commands/results. Local tests use fakes. AWS resource creation and paid/one-hour tests require explicit approval, a named account/Region, cost bound, and cleanup plan.

The repository currently has no automated GitHub workflow or PR template. Restore those as a focused governance change before calling local checks an enforced merge gate.
