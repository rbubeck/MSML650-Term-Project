# API and Wire Contracts

Status: Proposed for team review  
API version: `v1`  
WebSocket protocol version: `1`  
Last reviewed: 2026-11-02

This is the human-readable contract. ADR-008 selects Zod 4 definitions in `packages/contracts` as the canonical runtime source. The current OpenAPI and JSON Schema artifacts are bootstrap snapshots until Zod generation is implemented. Every API shape remains `PROPOSED` until its specific contract is approved.

Exception: the ADR-006 binary PCM frame layout is accepted and implemented in `packages/contracts/src/audio-frame.ts`. The proposed JSON start/ready/session schemas must align to that fixed format; they are not independently authoritative.

## Conventions

- JSON uses UTF-8, `camelCase`, and ISO 8601 UTC timestamps unless a field is explicitly milliseconds.
- Identifiers are opaque, URL-safe values. Examples are illustrative and must not imply sequential IDs.
- HTTP clients send `Authorization: Bearer <access-token>`; API Gateway validates it and Lambda derives `userId` from the Cognito `sub` claim.
- Clients never send `userId` to select ownership.
- Mutating HTTP operations accept `Idempotency-Key`, an opaque client-generated value of 16–128 characters, where specified.
- API timestamps use wall-clock UTC. Audio and segment positions use integer milliseconds relative to the logical session.
- Unknown JSON fields are rejected initially to expose version drift. This policy may be relaxed only through contract review.

## Common HTTP errors

```json
{
  "error": {
    "code": "SESSION_NOT_FOUND",
    "message": "The requested session was not found.",
    "requestId": "req_01J...",
    "retryable": false,
    "retryAfterSeconds": null,
    "details": {}
  }
}
```

`message` is safe for users and logs. `details` contains allow-listed validation metadata, never stack traces, tokens, transcript text, bucket keys, or provider errors.

| Code | HTTP | Meaning |
|---|---:|---|
| `UNAUTHENTICATED` | 401 | Missing, invalid, or expired access token |
| `FORBIDDEN` | 403 | Authenticated but operation is not allowed |
| `SESSION_NOT_FOUND` | 404 | Missing or not visible to this owner; prevents resource enumeration |
| `VALIDATION_FAILED` | 400 | Request does not satisfy schema |
| `STATE_CONFLICT` | 409 | Operation is invalid for current session state |
| `IDEMPOTENCY_CONFLICT` | 409 | Key was reused with a different request |
| `RATE_LIMITED` | 429 | Per-user or API request limit reached |
| `CAPACITY_EXCEEDED` | 429 | No admitted streaming capacity; retry may be possible |
| `EXPORT_NOT_READY` | 409 | Transcript export is not durable yet |
| `INTERNAL_ERROR` | 500 | Unexpected non-disclosing failure |
| `DEPENDENCY_UNAVAILABLE` | 503 | Required dependency is unavailable |

## Core types

### Session status

```text
CREATED -> CONNECTING -> STREAMING -> FINALIZING -> COMPLETED
    |           |           |             |
    |           |           +-----------> INTERRUPTED
    |           +-----------------------> INTERRUPTED
    +-----------------------------------> FAILED

CREATED|INTERRUPTED may reconnect only under the approved resume policy.
Any readable state -> DELETING -> physically removed/tombstoned.
```

`FAILED`, `INTERRUPTED`, and `COMPLETED` are terminal for a stream epoch. Whether an `INTERRUPTED` logical session can start a new epoch is resolved by ADR-004. `DELETING` denies normal reads immediately.

```json
{
  "sessionId": "sess_01J...",
  "name": "Untitled transcript",
  "status": "STREAMING",
  "languageCode": "en-US",
  "audio": {
    "encoding": "pcm_s16le",
    "sampleRateHz": 16000,
    "channels": 1,
    "chunkDurationMs": 100
  },
  "createdAt": "2026-11-01T15:00:00.000Z",
  "startedAt": "2026-11-01T15:00:02.000Z",
  "endedAt": null,
  "durationMs": 15000,
  "latestStreamEpoch": 1,
  "version": 7,
  "failure": null,
  "exports": []
}
```

`version` supports optimistic concurrency. `durationMs` may be a current estimate until terminal. Failure details use stable application codes, not raw provider messages.

## HTTP control API

### `GET /v1/users/me`

Returns the authenticated profile.

```json
{
  "userId": "derived-cognito-sub",
  "displayName": "Nandan",
  "preferences": {
    "defaultLanguageCode": "en-US",
    "captionStability": "medium"
  },
  "createdAt": "2026-11-01T14:00:00.000Z",
  "updatedAt": "2026-11-01T14:00:00.000Z"
}
```

`userId` is returned for display/debugging but is never accepted as authorization input.

### `PATCH /v1/users/me`

```json
{
  "displayName": "Nandan Prince",
  "preferences": {
    "defaultLanguageCode": "en-US",
    "captionStability": "medium"
  }
}
```

Omitted fields remain unchanged. Empty `displayName` and unsupported languages are rejected. Returns the updated profile.

### `POST /v1/sessions`

Requires `Idempotency-Key`.

```json
{
  "languageCode": "en-US",
  "audio": {
    "encoding": "pcm_s16le",
    "sampleRateHz": 16000,
    "channels": 1,
    "chunkDurationMs": 100
  },
  "client": {
    "protocolVersion": 1,
    "timeZone": "America/New_York"
  }
}
```

The server validates supported language/features and capacity policy. It derives ownership, creates `CREATED`, and returns `201`:

```json
{
  "session": {
    "sessionId": "sess_01J...",
    "name": "Untitled transcript",
    "status": "CREATED",
    "languageCode": "en-US",
    "audio": {
      "encoding": "pcm_s16le",
      "sampleRateHz": 16000,
      "channels": 1,
      "chunkDurationMs": 100
    },
    "createdAt": "2026-11-01T15:00:00.000Z",
    "startedAt": null,
    "endedAt": null,
    "durationMs": 0,
    "latestStreamEpoch": 0,
    "version": 1,
    "failure": null,
    "exports": []
  },
  "stream": {
    "url": "wss://stream.example.com/v1/stream",
    "ticket": "opaque-secret-returned-once",
    "ticketExpiresAt": "2026-11-01T15:01:00.000Z",
    "protocolVersion": 1
  }
}
```

`PROPOSED`: return the initial ticket in this response. If security review selects HttpOnly cookie or subprotocol delivery, the response changes compatibly before v1 freezes. Ticket values are never returned by later reads.

### `POST /v1/sessions/{sessionId}/tickets`

Issues a reconnect ticket after verifying ownership, state, concurrency, and resume policy. Requires `Idempotency-Key`.

```json
{
  "lastServerSequence": 42,
  "reason": "network_reconnect"
}
```

```json
{
  "url": "wss://stream.example.com/v1/stream",
  "ticket": "new-opaque-secret-returned-once",
  "ticketExpiresAt": "2026-11-01T15:06:00.000Z",
  "protocolVersion": 1,
  "resumeAllowed": true
}
```

Only one unconsumed ticket per `(sessionId, connectionAttempt)` is permitted. Issuing a new ticket may invalidate older unconsumed tickets, pending ADR-001.

### `GET /v1/sessions`

Query parameters:

- `limit`: 1–100, default 25.
- `cursor`: opaque pagination token.
- `status`: optional repeated allow-listed status.

```json
{
  "items": [
    {
      "sessionId": "sess_01J...",
      "name": "Project interview",
      "status": "COMPLETED",
      "languageCode": "en-US",
      "createdAt": "2026-11-01T15:00:00.000Z",
      "endedAt": "2026-11-01T15:30:00.000Z",
      "durationMs": 1800000
    }
  ],
  "nextCursor": null
}
```

Cursors are signed/opaque and must not expose raw DynamoDB keys.

### `GET /v1/sessions/{sessionId}`

Owner-only. Returns session metadata and durable final segments, either embedded for bounded transcripts or through a paginated `segments` link. The implementation must choose and document a maximum response size before contract freeze.

Proposed bounded response:

```json
{
  "session": {
    "sessionId": "sess_01J...",
    "name": "Project interview",
    "status": "COMPLETED",
    "languageCode": "en-US",
    "createdAt": "2026-11-01T15:00:00.000Z",
    "startedAt": "2026-11-01T15:00:02.000Z",
    "endedAt": "2026-11-01T15:30:00.000Z",
    "durationMs": 1798000,
    "latestStreamEpoch": 1,
    "version": 19,
    "failure": null,
    "exports": [
      {"format": "txt", "status": "READY"},
      {"format": "json", "status": "READY"}
    ]
  },
  "segments": {
    "items": [],
    "nextCursor": null
  }
}
```

### `PATCH /v1/sessions/{sessionId}`

Requires `Idempotency-Key` and optionally `If-Match` with the current numeric version.

```json
{"name": "Customer discovery interview"}
```

Names are trimmed, length-limited, and stored as user content. Do not emit them as metric dimensions.

### `POST /v1/sessions/{sessionId}/complete`

Requests idempotent finalization. It does not assert success. The streaming worker remains responsible for draining provider results and checkpoints. Returns `202` while finalization is underway:

```json
{
  "sessionId": "sess_01J...",
  "status": "FINALIZING",
  "version": 12
}
```

Repeated requests return the current state. Calling it for `COMPLETED` returns the completed representation. State ownership details require ADR-002 approval.

### `DELETE /v1/sessions/{sessionId}`

Requires `Idempotency-Key`. Owner-only. Returns `202`:

```json
{
  "sessionId": "sess_01J...",
  "status": "DELETING"
}
```

Reads are denied immediately. Physical deletion of segments and exports is retryable and auditable. Whether a minimal non-content tombstone is retained and for how long is a privacy/retention decision.

### `GET /v1/sessions/{sessionId}/download?format=txt|json`

Owner-only. If ready, returns either `302` to a short-lived presigned S3 GET URL or `200` with a small authenticated payload. `PROPOSED`: use a short-lived redirect and set download filename/content disposition when creating the export. Never expose bucket layout in a stable public contract.

## WebSocket authentication

The path is `wss://stream.<domain>/v1/stream`. The accepted ticket transport is unresolved by ADR-001 because browser APIs cannot set an arbitrary `Authorization` header during the WebSocket handshake.

Candidate transports:

1. `Sec-WebSocket-Protocol` value containing a non-logged token plus the application protocol.
2. Secure, `HttpOnly`, narrowly scoped same-site cookie set by the control API.
3. Query parameter only if ALB/application access logging is demonstrably redacted or disabled for that field; this is not preferred.

The server must verify expiry, intended session, intended user, environment/audience, connection attempt, and atomic single-use before accepting binary frames. Failed upgrades return a generic HTTP error. Once upgraded, policy failures use an application error followed by a documented close code.

## WebSocket envelopes

All JSON messages include:

```json
{
  "type": "message_type",
  "protocolVersion": 1,
  "sessionId": "sess_01J...",
  "correlationId": "corr_01J...",
  "streamEpoch": 1,
  "sequence": 1,
  "sentAt": "2026-11-01T15:00:02.000Z"
}
```

- Client and server maintain independent monotonically increasing sequences per connection.
- `streamEpoch` is assigned by the server and is `0` in the initial client `start` message if not yet known.
- Unknown `protocolVersion` is rejected with `UNSUPPORTED_PROTOCOL`.
- `correlationId` links a response to a client operation; it is not an authorization value.

## Client-to-server control messages

### `start`

Must be the first application message after upgrade and before audio.

```json
{
  "type": "start",
  "protocolVersion": 1,
  "sessionId": "sess_01J...",
  "correlationId": "corr_01J...",
  "streamEpoch": 0,
  "sequence": 1,
  "sentAt": "2026-11-01T15:00:02.000Z",
  "audio": {
    "encoding": "pcm_s16le",
    "sampleRateHz": 16000,
    "channels": 1,
    "chunkDurationMs": 100
  },
  "lastServerSequence": null
}
```

Audio must match the admitted session. The server replies `ready` before audio is accepted.

### `stop`

```json
{
  "type": "stop",
  "protocolVersion": 1,
  "sessionId": "sess_01J...",
  "correlationId": "corr_01J...",
  "streamEpoch": 1,
  "sequence": 205,
  "sentAt": "2026-11-01T15:30:00.000Z",
  "lastAudioSequence": 203,
  "reason": "user_requested"
}
```

After stop, further binary frames are rejected. The server sends status updates and closes only after bounded finalization or explicit failure.

### `ping`

Application heartbeat supplementing WebSocket ping/pong where browser APIs require it:

```json
{
  "type": "ping",
  "protocolVersion": 1,
  "sessionId": "sess_01J...",
  "correlationId": "corr_01J...",
  "streamEpoch": 1,
  "sequence": 206,
  "sentAt": "2026-11-01T15:30:01.000Z"
}
```

## Binary audio frames

Accepted ADR-006 fixes the v1 audio payload as headerless mono PCM signed 16-bit little-endian at 16,000 Hz. Each sample is two bytes. Every frame contains exactly 100 ms, 1,600 samples, and 3,200 PCM bytes. A final short browser buffer is zero-padded before stop.

To support sequence/gap detection without confusing provider audio with application framing, each WebSocket binary message has a compact application header:

| Offset | Size | Field |
|---:|---:|---|
| 0 | 1 | frame format version (`1`) |
| 1 | 1 | flags (reserved, `0`) |
| 2 | 2 | header length, unsigned big-endian (`16`) |
| 4 | 4 | epoch-relative audio sequence, unsigned big-endian; begins at `0` |
| 8 | 8 | logical-session sample-clock start in microseconds, unsigned big-endian |
| 16 | 3200 | PCM payload, signed 16-bit little-endian samples |

This is application framing only. The browser does not implement AWS EventStream framing. Capture time is derived from emitted audio samples, not wall-clock time. Sequence rollover is not supported within an epoch; reconnect/rotation begins a new epoch and resets the audio sequence.

Accepted v1 frame rules:

- duration: exactly 100 ms per frame;
- binary message: exactly 3,216 bytes (16-byte header plus 3,200-byte PCM payload);
- sequence: increments by exactly one;
- capture start: increments by exactly 100,000 microseconds;
- queue: at most 2 seconds of audio per session;
- sequence gap: warn and record; repeated/large gaps terminate as `AUDIO_SEQUENCE_GAP`;
- audio arriving faster than a small real-time tolerance triggers `AUDIO_RATE_EXCEEDED`.

The two-second queue and real-time tolerance remain proposals for streaming-service testing; the frame format itself is fixed by ADR-006.

## Server-to-client messages

### `ready`

```json
{
  "type": "ready",
  "protocolVersion": 1,
  "sessionId": "sess_01J...",
  "correlationId": "corr_01J...",
  "streamEpoch": 1,
  "sequence": 1,
  "sentAt": "2026-11-01T15:00:02.100Z",
  "acceptedAudio": {
    "encoding": "pcm_s16le",
    "sampleRateHz": 16000,
    "channels": 1,
    "chunkDurationMs": 100
  }
}
```

### `partial_transcript`

```json
{
  "type": "partial_transcript",
  "protocolVersion": 1,
  "sessionId": "sess_01J...",
  "correlationId": "corr_01J...",
  "streamEpoch": 1,
  "sequence": 17,
  "sentAt": "2026-11-01T15:00:07.150Z",
  "resultId": "provider-result-008",
  "startMs": 4500,
  "endMs": 7000,
  "text": "Hello every",
  "stableThroughItem": 1
}
```

Partial messages are replaceable by `resultId` within an epoch and are never written as transcript truth.

### `final_transcript`

```json
{
  "type": "final_transcript",
  "protocolVersion": 1,
  "sessionId": "sess_01J...",
  "correlationId": "corr_01J...",
  "streamEpoch": 1,
  "sequence": 18,
  "sentAt": "2026-11-01T15:00:07.400Z",
  "segmentId": "seg_derived_hash_or_opaque_id",
  "providerResultId": "provider-result-008",
  "startMs": 4500,
  "endMs": 7300,
  "text": "Hello, everyone.",
  "isFinal": true,
  "persistence": "CHECKPOINTED"
}
```

`segmentId` is deterministic from session, epoch, and provider result identity but does not need to reveal that tuple. `persistence` may be `PENDING` only if ADR-003 permits delivery before checkpoint; completion still requires checkpoint reconciliation.

### `status`

```json
{
  "type": "status",
  "protocolVersion": 1,
  "sessionId": "sess_01J...",
  "correlationId": "corr_01J...",
  "streamEpoch": 1,
  "sequence": 19,
  "sentAt": "2026-11-01T15:30:00.100Z",
  "status": "FINALIZING",
  "reason": "user_requested"
}
```

### `warning`

```json
{
  "type": "warning",
  "protocolVersion": 1,
  "sessionId": "sess_01J...",
  "correlationId": "corr_01J...",
  "streamEpoch": 1,
  "sequence": 20,
  "sentAt": "2026-11-01T15:20:00.100Z",
  "code": "BACKPRESSURE",
  "message": "Audio processing is falling behind.",
  "retryable": true
}
```

### `error`

```json
{
  "type": "error",
  "protocolVersion": 1,
  "sessionId": "sess_01J...",
  "correlationId": "corr_01J...",
  "streamEpoch": 1,
  "sequence": 21,
  "sentAt": "2026-11-01T15:20:01.100Z",
  "code": "TRANSCRIBE_UNAVAILABLE",
  "message": "Live transcription is temporarily unavailable.",
  "retryable": true,
  "retryAfterMs": 2000
}
```

## WebSocket error codes

| Application code | Meaning |
|---|---|
| `UNAUTHENTICATED` | Ticket missing, invalid, expired, or replayed |
| `SESSION_FORBIDDEN` | Ticket/session/owner mismatch |
| `UNSUPPORTED_PROTOCOL` | Protocol version not supported |
| `INVALID_STATE` | Message invalid for lifecycle state |
| `INVALID_MESSAGE` | JSON/control schema invalid |
| `INVALID_AUDIO_FORMAT` | Audio does not match admitted contract |
| `FRAME_TOO_LARGE` | Message exceeds limit |
| `AUDIO_SEQUENCE_GAP` | Missing or disordered frames exceeded policy |
| `AUDIO_RATE_EXCEEDED` | Client sends substantially faster than real time |
| `BACKPRESSURE_LIMIT` | Bounded queue exhausted |
| `CAPACITY_EXCEEDED` | No capacity at connection/start time |
| `TRANSCRIBE_LIMIT_EXCEEDED` | Provider concurrency or rate protection reached |
| `TRANSCRIBE_UNAVAILABLE` | Provider stream failed |
| `PERSISTENCE_UNAVAILABLE` | Durable checkpoint dependency failed |
| `SERVER_DRAINING` | Task is terminating; reconnect with a new ticket |
| `INTERNAL_ERROR` | Non-disclosing unexpected error |

Standard WebSocket close codes are used where semantically correct; private close codes, if needed, must be registered in `docs/streaming-protocol.md`. Authentication failure before upgrade remains HTTP. Do not place secrets in close reasons.

## Reconnect and duplicate handling

- Reconnect always requires a fresh ticket.
- The server decides whether the logical session is resumable.
- A new provider connection increments `streamEpoch` atomically.
- Final segments are unique by `(sessionId, streamEpoch, providerResultId)`.
- Duplicate writes return the existing canonical segment rather than append text twice.
- Results from a stale epoch cannot advance current session state.
- Previously checkpointed segments can be returned after `ready` using a future explicitly versioned replay event; v1 does not promise automatic caption replay.
- Client audio replay is not accepted in v1 because exact capture provenance and overlap reconciliation are unresolved.

## Persistence contracts

### User profile

`userId` equals the Cognito `sub`. Preferences are allow-listed. Email and identity-provider claims remain in Cognito unless an approved feature requires a separately protected copy.

### Session

Required attributes are described in `docs/data-model.md`. All state transitions use conditional writes with the expected state/version. Runtime worker identity/lease is time-bound and must not become permanent ownership.

### Segment

```json
{
  "sessionId": "sess_01J...",
  "segmentId": "seg_...",
  "streamEpoch": 1,
  "providerResultId": "provider-result-008",
  "ordinal": 8,
  "startMs": 4500,
  "endMs": 7300,
  "text": "Hello, everyone.",
  "confidence": null,
  "checkpointedAt": "2026-11-01T15:00:07.390Z",
  "schemaVersion": 1
}
```

Provider timestamps are session-relative after applying an epoch offset. `ordinal` is assigned by the application and orders canonical exports; collision and reconciliation behavior is resolved in ADR-003/004.

### S3 exports

Proposed private keys:

```text
exports/v1/tenants/{tenant-or-scope}/users/{userIdHash}/sessions/{sessionId}/transcript.json
exports/v1/tenants/{tenant-or-scope}/users/{userIdHash}/sessions/{sessionId}/transcript.txt
```

The physical key is internal and never used as authorization. A random or keyed hash avoids plain user IDs in storage paths. Export JSON includes schema version, session metadata, ordered final segments, and export generation time. It excludes tickets, JWT claims, infrastructure identifiers, and raw provider payload unless separately approved.

## Ticket contract

At minimum, a ticket binds:

- random ticket identity or signed `jti`;
- `userId`/subject;
- `sessionId`;
- audience and environment;
- issued and expiry times;
- connection attempt;
- protocol version;
- optional reconnect constraints.

The persistent record stores only a cryptographic hash for opaque tickets. Consumption is conditional on `usedAt` being absent and expiry being in the future. DynamoDB TTL is cleanup, not authorization: the application checks expiry itself.

## Unresolved contract decisions

The team must approve these before v1 freezes:

1. Ticket representation and browser handshake transport.
2. Ticket lifetime, renewal, and simultaneous reconnect behavior.
3. Final-segment delivery before versus after durable checkpoint.
4. Embedded versus separately paginated segment retrieval.
5. Complete/finalization state owner and deadlines.
6. Audio header timestamps and precise clock semantics.
7. Queue/gap/rate limits and close-code registry.
8. Reconnect eligibility and epoch rotation overlap.
9. S3 redirect versus API-proxied downloads.
10. Single-table versus multiple-table DynamoDB implementation.

