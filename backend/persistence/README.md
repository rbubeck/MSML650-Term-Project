# Persistence

Owner: Person 4

This directory will contain application-facing adapters for profiles, sessions, tickets, worker leases, final-segment checkpoints, exports, and deletion.

Domain services depend on repository interfaces, not direct DynamoDB/S3 calls scattered throughout handlers or streaming code. Data-model proposals are in `docs/data-model.md` and ADR-003.

## First contribution boundary

After the toolchain and storage decision, Person 4 may define repository interfaces and in-memory contract-test implementations before adding DynamoDB/S3 adapters.

No persistence implementation exists yet.

