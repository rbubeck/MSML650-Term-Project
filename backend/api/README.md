# Control API

Status: package boundary only; no Lambda handlers or deployed API exist.

Owner: Person 2

This workspace will own TypeScript application services and Lambda handlers for profiles, session lifecycle, ticket issuance, history, rename, download and deletion. API Gateway will validate Cognito JWTs; application code derives the owner from validated claims and never trusts a client-supplied user ID.

## Existing inputs

- Proposed HTTP semantics and examples: [`API_CONTRACTS.md`](../../API_CONTRACTS.md)
- Proposed OpenAPI snapshot: [`packages/contracts/openapi.yaml`](../../packages/contracts/openapi.yaml)
- Proposed lifecycle/data model: [`docs/data-model.md`](../../docs/data-model.md)
- Security requirements: [`docs/security.md`](../../docs/security.md)
- Shared toolchain: [`docs/engineering-standards.md`](../../docs/engineering-standards.md)

The OpenAPI file is a review snapshot, not deployed behavior or the canonical Zod implementation.

## Person 2 next actions

1. Review and help accept ADR-001 (one-time streaming tickets) and ADR-002 (session-state authority).
2. Implement canonical Zod schemas in `packages/contracts` with cross-owner review before creating handler-local request types.
3. Define injectable `IdentityContext`, profile/session repositories, ticket issuer and clock/idempotency boundaries.
4. Implement handler/application logic against fake repositories, beginning with owner-isolation and invalid-input tests.
5. Coordinate Cognito authorizer claims and API Gateway requirements with Person 4; do not provision infrastructure from this workspace.

## Required first tests

- missing/invalid identity is rejected;
- user A cannot read or mutate user B’s known session ID;
- client-supplied `userId` is ignored/rejected;
- session creation and completion are idempotent;
- expired/replayed/wrong-session ticket operations fail according to accepted ADR-001;
- errors conform to the shared stable error envelope.

Do not implement Cognito, API Gateway or DynamoDB details directly in domain services. No deployed endpoint may claim to exist until CDK and integration evidence are merged.
