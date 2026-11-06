# Persistence — Person 4 Phase 1

Status: workspace boundary only; no DynamoDB adapter or resource exists.

## Initial deliverable

Provide one repository contract and two implementations: a deterministic in-memory fake for integration tests and a DynamoDB adapter for the approved AWS slice.

The minimum repository supports:

- create an owner-scoped session idempotently;
- get/list/rename only by owner;
- authorize and increment a stream epoch conditionally;
- save identical final retries without duplication and reject conflicts;
- complete a session idempotently; and
- deny reads and delete Phase 1 session/final records.

DynamoDB is authoritative for owner, lifecycle/version, current epoch, and acknowledged final segments. Partials, raw audio, presigned URLs, JWTs, and transcript text in logs are prohibited.

## Phase 1 handoff

Agree repository results and conditional-write behavior with Person 2. Supply the fake early so API and Person 5 integration tests do not wait for AWS. Document the minimum table/index proposal before creating it, then obtain explicit approval for resource changes.

## Later

S3 exports, recorded-audio buckets, batch-job records, derived artifacts, advanced retention/backups, and repair workflows are not initial assignments.
