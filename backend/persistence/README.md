# Persistence

Status: package boundary and proposed data model only; no DynamoDB/S3 adapter or AWS resource exists.

Owner: Person 4

This workspace will provide application-facing repositories for profiles, sessions, tickets, worker leases, final-segment checkpoints, transcript exports and deletion. Consumers depend on interfaces rather than scattered AWS SDK calls.

## Existing inputs

- Proposed entities/access patterns: [`docs/data-model.md`](../../docs/data-model.md)
- Proposed durable-segment decision: [`docs/adr/003-durable-segment-storage.md`](../../docs/adr/003-durable-segment-storage.md)
- Security/deletion requirements: [`docs/security.md`](../../docs/security.md)
- API/streaming semantics: [`API_CONTRACTS.md`](../../API_CONTRACTS.md)

All storage schemas remain proposed until ADR-002/ADR-003 are accepted. Do not treat the current single-table sketch as deployed or final.

## Person 4 next actions

1. Review ADR-002 and ADR-003 with Persons 2 and 3; make transition authority and final-checkpoint identity explicit.
2. Define narrow repository interfaces and deterministic in-memory implementations for contract tests.
3. Prove conditional/idempotent behavior for ticket consumption, state transitions, leases and segment uniqueness.
4. Finalize DynamoDB access patterns, indexes, transaction boundaries, schema versions and repair/migration behavior.
5. Define private S3 export keys, encryption, publish/idempotency, retention and deletion behavior.
6. Implement AWS adapters only after the interface tests are stable; CDK remains in `infrastructure/`.

## Required first tests

- atomic one-time ticket consumption under competing calls;
- stale state version/stream epoch cannot overwrite current state;
- duplicate provider result produces one durable segment;
- owner-scoped lookup cannot cross users;
- deletion immediately denies reads and retryably removes all artifacts;
- export completion is not reported before durable publication.

Raw microphone audio is not stored by default. Do not create tables, buckets or migrations without the orchestrator’s explicit deployment authorization.
