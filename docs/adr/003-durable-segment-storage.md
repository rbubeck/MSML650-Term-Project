# ADR-003: Durable Final-Segment Storage

Status: Proposed  
Owners: Persons 3 and 4

## Context

Partial results change and must not be transcript truth. Final events can be duplicated, tasks can fail, exports can fail, and provider result IDs may repeat after rotation.

## Proposed decision

Persist each final segment in DynamoDB with deterministic identity derived from `(sessionId, streamEpoch, providerResultId)`. Use a conditional uniqueness record/transaction to assign one canonical segment and ordinal. Store provider-relative and normalized session-relative timing separately. Build immutable JSON/TXT S3 exports from checkpointed segments during finalization.

Prefer checkpoint-before-`CHECKPOINTED` delivery. The server may display a final result earlier only if the event says `PENDING`; it must later acknowledge durability or surface persistence failure. A session cannot become `COMPLETED` until all observed finals are reconciled and exports are durable.

## Alternatives

- S3 append/journal per event: awkward atomic deduplication and ordering.
- Keep segments only in task memory then write one object: loses finals on task failure.
- Persist partials: high write cost and ambiguous history.
- Stream every event through SQS/Kinesis: potentially useful later but unnecessary before measured need.

## Consequences

DynamoDB write cost grows with final segments. Long transcripts need pagination/export paths. Transactions and deterministic identities simplify retry. Text is sensitive and must not appear in logs or indexes. Single-table versus multiple-table layout remains a review item.

## Acceptance evidence

Tests prove duplicate idempotency, ordering, checkpoint failure behavior, task loss with rehydration, epoch ID reuse, export retry, and no completed status before durability.

