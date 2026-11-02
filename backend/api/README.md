# Control API

Owner: Person 2

This directory will contain the TypeScript Lambda handlers and application services for profiles, session lifecycle, ticket issuance, history, rename, download, and deletion.

The API derives identity from validated Cognito claims. It never trusts a client-provided user ID. Public shapes are defined in `API_CONTRACTS.md` and `packages/contracts/openapi.yaml`.

## First contribution boundary

After the toolchain and ADR-001/ADR-002 decisions, Person 2 may implement handler interfaces against mocked identity and persistence adapters. Cognito and deployed API Gateway integration are separate infrastructure tasks coordinated with Person 4.

No Lambda implementation exists yet.

