# Person 4 — Persistence and AWS Infrastructure

## Objective

Deliver contract-compliant session/final persistence and the minimum approved AWS development environment for ADR-011.

## Owned paths

- `backend/persistence/`
- `infrastructure/`
- `docs/runbooks/` for approved setup, testing and cleanup updates
- Review of repository-related `packages/contracts/` changes

## Current implementation

The persistence workspace is a boundary only; no repository fake or DynamoDB adapter exists. A manually configured Cognito/API Gateway/Lambda signer stack passed a narrow smoke, but the durable MVP infrastructure is not deployed. IAM Identity Center workforce groups and scoped permission sets have been prepared separately from application Cognito users.

## Required MVP deliverables

1. Agree the repository port and atomic outcomes with Person 2.
2. Implement a deterministic in-memory repository for API and integration tests.
3. Propose the smallest DynamoDB key/index design supporting owned newest-first history, atomic epoch allocation, conditional final writes, idempotency, completion and deletion.
4. Obtain explicit approval before creating or changing paid/shared resources.
5. Implement the DynamoDB adapter with semantics identical to the fake.
6. Configure the minimum development DynamoDB, Lambda execution role, API routes/JWT authorizer/CORS and privacy-safe CloudWatch behavior.
7. Record private resource inventory, cost bound, retention and cleanup ownership without committing identifiers.

## Dependencies and handoffs

- Receives accepted schemas and repository behavior from Persons 2 and 3.
- Produces the fake and DynamoDB adapter for Person 2.
- Produces an approved environment and cleanup record for Person 5.
- Person 2 reviews repository semantics; Person 5 reviews evidence/privacy requirements.

## AWS access

Use `InfrastructureOperators` / `CloudScribe-InfrastructureOperator`. Access is limited to approved CloudScribe development resources, the existing Cognito configuration, approved Lambda roles through narrowly scoped `iam:PassRole`, DynamoDB, API Gateway and project logs.

Permission to perform an action is not approval to perform it. Resource creation, deletion, paid tests and IAM changes still require the project approval gate in `docs/runbooks/aws-development-testing.md`.

## Local testing

Use deterministic clocks/IDs and fake storage. Cover owner isolation, concurrent epoch allocation, identical retry, conflict, ordering, pagination, state transitions, deletion and adapter error mapping. Normal tests use no AWS.

## Approved AWS testing

Create only named, approved development resources in `us-east-2`, apply finite retention/tags where supported, verify Lambda uses runtime credentials, and record cleanup. Never expose execution-role credentials or give DynamoDB/Transcribe runtime permissions to the browser.

## Definition of done

- Fake and DynamoDB adapters implement the same reviewed port.
- Conditional behavior prevents cross-owner access and duplicate/conflicting writes.
- Development stack supports every Phase 1 route and contains no audio proxy/S3 requirement.
- Logs are content-free; budget/retention/cleanup are documented privately.
- Person 2 integrates the adapter and Person 5 can run the approved environment.

## Out of scope

S3 exports, raw-audio storage, batch jobs, summaries, production environments/SLOs, load infrastructure and advanced backups.
