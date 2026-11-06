# Phase 1 Data Model

Status: minimum model for contract/repository review; no table or adapter exists.

## Invariants

- Cognito `sub` is the owner identity and is derived from validated claims.
- DynamoDB is authoritative for session ownership, lifecycle/version, stream epoch, and acknowledged final segments.
- A logical session may contain multiple stream epochs.
- Live final text and provider metadata are untrusted `client-uploaded` content.
- Partials and raw audio are never stored.
- Identical retries acknowledge the existing final; conflicting identity reuse is rejected.
- Foreign session IDs do not reveal resource existence.
- Deletion denies reads before or while record removal is retried.

## Minimum records

| Record | Phase 1 fields/purpose |
|---|---|
| Session | opaque ID, owner, title, language, state/version, current epoch, created/updated/completed timestamps |
| Final segment | session ID, epoch, provider result ID, bounded text, relative start/end, saved timestamp, `client-uploaded` provenance |
| Idempotency result | owner/operation key, request fingerprint, canonical result, expiry policy selected in contract review |

Person 4 proposes the smallest table/key/index design that supports owner-scoped newest-first history and conditional final writes. Person 2 reviews transaction/state needs before creation.

Exact bounds, page size, key layout, consistency choice, and cleanup behavior are finalized in the first shared contract/persistence PR. S3 exports, recorded-audio/job records, derived artifacts, retention/backups, and migrations are later designs.
