# ADR-004: Reconnect and Provider Stream Rotation

Status: Proposed  
Owners: Persons 1, 2, and 3

## Context

WebSockets end on network loss, deployments, or task failure. Amazon Transcribe also enforces a hard maximum stream duration. The browser is the only source of live audio, so disconnected audio cannot be guaranteed recoverable.

## Proposed decision

Separate logical `sessionId` from transport connection and monotonically increasing `streamEpoch`. Reconnect obtains a new ticket and starts a new epoch only after a conditional lease/state check. Rehydrate durable finals; discard partials; do not accept client transcript truth or promise audio recovery.

For planned provider rotation, experiment with a small bounded PCM overlap buffer and dual streams, epoch offsets, and boundary reconciliation. Do not make a no-gap guarantee until WER/duplicate/gap and cost tests validate it. If overlap is unsafe, expose a measured interruption.

## Alternatives

- End logical session at every disconnect: simpler but poor user experience.
- Replay arbitrary client audio: complex provenance, ordering, and duplication risk.
- Assume provider streams never need rotation: conflicts with hard duration limits.
- Store raw audio server-side: violates default privacy scope and adds cost/compliance.

## Consequences

Reconnect state and tickets cross three owners. Each overlap temporarily uses extra Transcribe capacity. Epoch-aware segment IDs/timestamps are mandatory. UI must communicate interrupted/reconnecting states honestly.

## Acceptance evidence

Measure disconnect recovery, competing reconnects, checkpoint rehydration, deployment drain, rotation boundary WER, missing/duplicate text, latency, memory, and temporary capacity. Record grace periods and rotation threshold before acceptance.

