# ADR-011: Phase 1 Integrated Live MVP

Status: Accepted by project direction, 2026-11-06.

Owners: technical orchestrator and Persons 1–5.

## Context

ADR-010 selected direct browser-to-Transcribe streaming but left a broad proposed product surface. The team needs a small first phase that all owners can implement independently and integrate before recorded uploads, transcript-derived features, exports, or production hardening.

## Decision

Phase 1 implements one authenticated live transcription journey:

1. Cognito sign-in.
2. Owned session creation.
3. Owner-checked, short-lived direct Transcribe URL issuance.
4. Browser microphone capture and direct Amazon EventStream/WebSocket streaming.
5. Live partial/final display.
6. Idempotent final-segment upload and durable acknowledgment.
7. Completion and transcript history backed by DynamoDB.
8. Owner-checked deletion.

The target is at least one hour per logical application session. Reconnect creates a new monotonically increasing stream epoch without creating a second application session. Only API-acknowledged finals are durable. Stored live text has `client-uploaded` provenance.

The minimum application lifecycle is `CREATED`, `STREAMING`, `COMPLETED`, and `DELETING`. `FAILED` may describe a terminal application failure. Transport connection state is browser-local and must not create competing durable session states.

## Deferred

Recorded-file upload/batch transcription, raw-audio storage, S3 transcript exports, summaries and other derived artifacts, shared rooms, production SLOs, production-scale admission, and advanced retention/backups are not Phase 1 implementation assignments. Adding one requires a reviewed ADR and contract update.

## Consequences

- Persons 1–4 can build against a small shared HTTP/session contract and deterministic fakes.
- Person 3 replaces the historical server-side streaming adapter with a browser-specific WebSocket/EventStream client.
- DynamoDB is sufficient for the first history integration; S3 is not required for the Phase 1 vertical slice.
- The first real AWS acceptance includes a bounded one-hour run, but local integration remains AWS-free.
- Detailed production policies remain open and must not block the initial local slice unless they change its trust boundary or public contract.
