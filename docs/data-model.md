# Option A Data Model

Status: `PROPOSED`; no table, bucket, adapter, or migration exists.

## Invariants and access

- Cognito `sub` is the application owner identity; Lambda derives it from verified claims.
- DynamoDB is authoritative for session ownership, state, and acknowledged final segments. Provider events observed only in a browser are not durable.
- Save input is client supplied. Record provenance as `client-uploaded`; provider result IDs, timings, and text are untrusted metadata.
- Partials are never stored. Each final upload uses an idempotency key and conditional uniqueness rule. Repeated requests acknowledge the original saved record; conflicting reuse is rejected.
- Sessions are read/listed by owner. A known foreign session ID must not reveal content or existence.
- S3 contains private completed JSON/TXT exports assembled from acknowledged finals. The export readiness marker is set only after publication succeeds.
- Deletion first makes the session unreadable, then removes DynamoDB segments and S3 exports with retry/reconciliation. TTL alone is never an authorization or deletion guarantee.

## Proposed records

| Record | Required purpose |
|---|---|
| Session | Opaque ID, owner, language/configuration, state/version, stream epoch, created/updated/completed times, export state |
| Final segment | Session ID, epoch, client idempotency key, provider result ID, bounded text, relative timing, ordinal, saved timestamp, provenance |
| Export manifest | Session ID, format, immutable S3 key/version or checksum, publish status |
| Deletion marker | Deny reads while physical deletion retries; no transcript text |

Exact table count, keys/indexes, consistency and transaction boundaries, size limits, state transitions, retention, backups/PITR, S3 versioning, and repair policy are `TBD` and require Persons 2/4 plus privacy review. Do not treat this sketch as a deployed schema.
