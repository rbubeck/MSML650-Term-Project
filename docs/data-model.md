# Data Model

Status: Proposed for team review  
Schema version: `1`

## Principles

- Cognito `sub` is the canonical user ID.
- Ownership is part of access patterns, not a post-query filter.
- State and epoch changes use conditional writes.
- Final segments are immutable checkpoints; user edits, if later supported, are separate revisions.
- Provider identifiers are namespaced by logical session and stream epoch.
- DynamoDB TTL performs cleanup only; authorization always validates expiry/state.
- Physical keys are internal and never confer access.

## Access patterns

1. Read/update the authenticated profile.
2. Create a session for a user idempotently.
3. List one user's sessions newest first with pagination/status filter.
4. Read/rename/request completion/delete an owned session.
5. Atomically issue and consume a short-lived ticket.
6. Acquire/renew/release a stream epoch or worker lease.
7. Idempotently insert and order final segments.
8. Rehydrate a session's durable finals after reconnect/failure.
9. Record export readiness/failure.
10. Reserve/release per-user and regional admission capacity without race-prone process-only counters.

## Proposed DynamoDB design

`PROPOSED`: use one application table initially so transactions can coordinate session/ticket/capacity records. The team may select multiple tables through ADR-003 if isolation, scaling, or operational clarity outweighs transactional convenience.

| Entity | PK | SK | Important attributes |
|---|---|---|---|
| Profile | `USER#<sub>` | `PROFILE` | preferences, createdAt, updatedAt, schemaVersion |
| Session | `USER#<sub>` | `SESSION#<createdAt>#<sessionId>` | sessionId, status, version, language/audio, epochs, timestamps, failure, export states |
| Session lookup | `SESSION#<sessionId>` | `META` | userId, status, version, currentEpoch, worker lease, timestamps |
| Segment | `SESSION#<sessionId>` | `SEGMENT#<ordinal-padded>#<segmentId>` | epoch, providerResultId, positions, text, checkpointedAt |
| Segment uniqueness | `SESSION#<sessionId>` | `RESULT#<epoch>#<providerResultId>` | canonical segmentId/ordinal |
| Ticket | `TICKET#<ticketHash>` | `TICKET` | userId, sessionId, attempt, expiresAt, usedAt, protocolVersion |
| Idempotency | `IDEMPOTENCY#<userId>` | `<operation>#<key>` | requestHash, response reference, expiresAt |
| Capacity shard | `CAPACITY#<environment>#<shard>` | `RESERVATION` | count, limit/version |

Duplicating the session summary under user and direct-lookup keys requires a transaction or a clearly defined repair path. An alternative GSI on a single session item should be evaluated before implementation.

### Proposed indexes

- `GSI1PK = USER#<sub>`, `GSI1SK = SESSION#<createdAt>#<sessionId>` if sessions use a direct primary key rather than the duplicated layout.
- Optional status index only if measured query needs justify its write/storage cost. Status filtering can initially occur over a bounded user's page if acceptable.

Do not create broad cross-user indexes containing transcript content.

## Session attributes

```text
sessionId, userId, name, status, version
languageCode
audio.encoding, audio.sampleRateHz, audio.channels, audio.chunkDurationMs
createdAt, startedAt, lastConnectedAt, endedAt, durationMs
currentEpoch, lastCompletedEpoch
workerLeaseId, workerLeaseExpiresAt
lastClientAudioSequence, lastServerSequence
failure.code, failure.retryable
exports.json.status/key/version, exports.txt.status/key/version
schemaVersion
```

`workerLeaseId` is not exposed publicly. Lease expiry permits recovery but does not automatically prove the old process stopped; all writes also compare epoch/version.

## State transitions

| From | To | Initiator |
|---|---|---|
| none | `CREATED` | Control API |
| `CREATED` | `CONNECTING` | Streaming worker after ticket consumption |
| `CONNECTING` | `STREAMING` | Worker after provider stream is ready |
| `STREAMING` | `FINALIZING` | Worker or API completion request under shared rule |
| `FINALIZING` | `COMPLETED` | Persistence/finalizer after reconciliation and export |
| active | `INTERRUPTED` | Worker/reconciler after disconnect/failure policy |
| non-deleting | `FAILED` | Owning component for unrecoverable failure |
| readable | `DELETING` | Control API after owner authorization |

Every transition specifies allowed source states and expected version. Stale epochs cannot transition a newer session. ADR-002 makes the final authority explicit.

## Segment identity and ordering

`segmentId = deterministicId(sessionId, streamEpoch, providerResultId)` using a stable hash/UUID namespace. The provider result ID alone is insufficient because it may be reused after stream rotation.

Segment persistence uses a transaction or conditional uniqueness record so duplicate events cannot allocate multiple ordinals. Ordering uses session-relative `startMs`, then epoch, then application ordinal, with reconciliation rules for overlap. Text is immutable after checkpoint in MVP.

Provider time and application time are distinct:

- `providerStartMs`/`providerEndMs`: relative to one provider stream.
- `epochOffsetMs`: application mapping for the epoch.
- `startMs`/`endMs`: normalized logical-session positions.
- `checkpointedAt`: wall-clock UTC.

## Tickets

Opaque ticket bytes are returned once; DynamoDB stores a keyed cryptographic hash. Fields include `userId`, `sessionId`, environment/audience, attempt, protocol version, issued/expiry times, and optional reconnect constraints.

Consumption is a conditional update requiring `usedAt` absent and `expiresAt > applicationNow`. TTL eventually removes expired rows but is not relied upon for timely expiry.

## Admission

Admission must atomically enforce per-user concurrent sessions and a conservative regional application limit. Capacity records may be sharded to avoid a hot key. Reservations have expiry/lease semantics so crashed workers do not permanently consume capacity. Reconciliation compares active session leases with counters.

The exact algorithm requires design/load testing; a single global counter is not assumed scalable.

## S3 exports

Private versioned schema:

```text
exports/v1/scope/<scope-id>/users/<user-id-hash>/sessions/<session-id>/transcript.json
exports/v1/scope/<scope-id>/users/<user-id-hash>/sessions/<session-id>/transcript.txt
```

JSON contains schema version, public session metadata, ordered final segments, and generated time. TXT contains normalized display text only. Objects include content type and integrity metadata. S3 keys are never accepted from clients.

Export generation is idempotent: generate a versioned temporary object, verify, then conditionally publish/update the session's export pointer. The exact copy/publish mechanism is an implementation decision.

## Deletion and retention

Deletion first conditionally moves the session to `DELETING`, which blocks reads and new tickets. A retryable worker removes segment/lookup records and all known export versions, then retains or removes a minimal tombstone according to the approved policy.

PITR, replicas, log retention, object versions, and legal holds must be included in the policy. No retention duration is approved yet.

## Migration

Every entity and export includes `schemaVersion`. Readers tolerate supported historical versions; writers emit only current. Migrations are resumable, idempotent, measured, and never rewrite user data without backup/rollback consideration.

## Open decisions

- Single-table versus separated profile/session/segment/ticket tables.
- GSI layout and status-filter needs.
- DynamoDB on-demand versus provisioned capacity.
- Segment checkpoint delivery ordering.
- Admission reservation algorithm.
- PITR, S3 versioning, retention, and tombstone policy.
- Tenant model: individual-only scope now versus future organization ID.

