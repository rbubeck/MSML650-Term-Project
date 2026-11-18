# Person 2 — Authenticated Control API

## Objective

Deliver Lambda-compatible, authenticated handlers for the complete owned-session control plane while continuous audio remains browser-to-Transcribe.

## Owned paths

- `backend/api/`
- Co-ownership of `packages/contracts/` with Person 3
- Review of the repository port implemented by Person 4

## Current implementation

The stream-URL handler, Cognito claim extraction, runtime-role Transcribe signer, guarded single-session smoke Lambda, and extensive fake tests exist. Create/list/read/rename, final save, completion, deletion, durable composition, real rate limiting, and the production logger are not implemented.

## Required MVP deliverables

1. Freeze critical request/response/error decisions with Person 3 and affected-owner review.
2. Define the narrow repository port and conditional outcomes with Person 4.
3. Implement create, list, read, rename, stream URL, segment save, completion and deletion handlers.
4. Parse every untrusted input/output with shared Zod schemas.
5. Derive owner only from validated access-token claims; never accept a client `userId`.
6. Make foreign and missing session access indistinguishable.
7. Enforce lifecycle, issued epoch, idempotency, bounds, language and signing policy.
8. Compose a production Lambda entry point with Person 4's repository adapter.
9. Emit only allow-listed, content-free events and stable safe errors.

## Dependencies and handoffs

- Co-produces public contracts with Person 3 for Persons 1 and 4.
- Produces the repository port for Person 4 and consumes both its fake and DynamoDB implementations.
- Produces handlers for Person 1 and failure fixtures for Person 5.

Do not invent an in-handler DynamoDB shape. Agree atomic behavior with Person 4 first.

## AWS access

Use the `BackendDevelopers` group and `CloudScribe-BackendDeveloper` permission set. It is intended for approved project Lambda functions, the approved HTTP API, and project logs/metrics. It does not grant IAM administration, Cognito user administration, unrestricted DynamoDB access, or account-wide access.

Runtime DynamoDB and Transcribe permissions belong to the Lambda execution role, not the developer identity. Follow `docs/runbooks/aws-team-access.md`.

## Local testing

Use fake identity, repository, signer, clock, limiter and logger. Cover ownership, malformed input, duplicate/conflicting uploads, stale/unissued epoch, state conflict, signing failure, completion and deletion. Normal tests make no AWS calls.

## Approved AWS testing

Deploy/update only approved `cloudscribe-dev-*` functions and approved API resources. Use Cognito application users to invoke routes. Never copy tokens, signed URLs, transcript content or Lambda environment values into Git or logs.

## Definition of done

- Every Phase 1 route exists and passes contract/failure tests.
- All operations enforce owner and state through the repository.
- Duplicate identical operations are idempotent; conflicts are explicit.
- Lambda production composition uses Person 4's adapter and runtime role.
- Persons 1, 4 and 5 have stable handoffs and review affected interfaces.

## Out of scope

Audio proxying, recorded/batch endpoints, S3 exports, summaries, arbitrary profiles and production-scale admission.
