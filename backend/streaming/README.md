# Streaming Service

Owner: Person 3

This directory will contain the persistent Node.js/TypeScript WebSocket service that runs on ECS/Fargate and mediates browser audio to Amazon Transcribe Streaming.

Its responsibilities are ticket validation, protocol parsing, audio validation, bounded backpressure, provider lifecycle, partial/final event mapping, deterministic segment identities, checkpoint coordination, reconnect epochs, graceful shutdown, and privacy-safe telemetry.

## Required interfaces

The service depends on four boundaries rather than concrete AWS implementations:

```text
TicketVerifier
SessionLeaseRepository
SegmentCheckpointRepository
TranscriptionProvider
```

The first local vertical slice uses fakes for all four. The official Transcribe SDK, DynamoDB, and deployed ECS/ALB integration come later.

## Start gate

Streaming implementation begins after:

- repository toolchain is accepted;
- ADR-001 ticket semantics are accepted;
- ADR-002 state ownership is accepted;
- ADR-003 segment durability is accepted;
- ADR-006 audio format is accepted;
- WebSocket v1 messages are frozen for the first slice.

No streaming implementation exists yet.

