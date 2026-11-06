# Contributing

This is the Option A team workspace. Read `AGENTS.md`, `ARCHITECTURE.md`, `API_CONTRACTS.md`, your area README, and accepted ADRs before starting. Use Node.js 24/npm 11 from the root; `npm ci` installs the shared lockfile.

## Work and review

- Start from the approved integration branch; use short-lived `feat/frontend-*`, `feat/auth-*`, `feat/direct-stream-*`, `feat/storage-*`, `feat/eval-*`, or `docs/*` branches.
- Keep one owner area per PR where possible. Shared contracts, session lifecycle, trust boundary, infrastructure, or multiple-area changes need affected-owner and orchestrator review.
- Use Zod in `packages/contracts` for application shapes. Do not invent independent browser/API types or treat provider EventStream as an application wire contract.
- Person 1 builds UI/capture; Person 2 owns authenticated API and signing; Person 3 owns the direct browser stream client; Person 4 owns DynamoDB/S3 and Console-first AWS resource guidance; Person 5 owns evaluation and quality. Four contributors may combine Persons 1 and 3.
- Preserve existing evaluation scripts/artifacts unless a reviewed migration replaces them. Do not commit credentials, signed URLs, audio, private transcripts, or environment files.

Before TypeScript handoff run `npm run check`. Report exact commands and results in the pull request description; this branch has no PR template or automated GitHub workflow. Local tests use fakes; AWS resource creation, deployment, and paid/load tests require explicit approval. Mark unresolved security, consent, retention, Region, quota, and cost decisions `PROPOSED` or `TBD`.
