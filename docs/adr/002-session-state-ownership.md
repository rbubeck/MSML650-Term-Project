# ADR-002: Canonical Session State Ownership

Status: Proposed  
Owners: Persons 2, 3, and 4

## Context

Control API requests, streaming runtime events, persistence completion, disconnects, and deletion can race. Multiple independent state machines would create false completion, lost checkpoints, or stale-worker writes.

## Proposed decision

Store one canonical versioned state in DynamoDB and define allowed transitions in shared contracts. The control API owns creation, user completion intent, rename, and deletion intent. The streaming worker owns connection/provider runtime transitions and epoch observations. The persistence/finalization adapter alone marks `COMPLETED` after checkpoint reconciliation and durable exports.

Every transition is a conditional write on expected state/version/current epoch. User `complete` is an idempotent request for finalization, not proof that it completed. A stale worker cannot mutate a later epoch. `DELETING` takes precedence for access and prevents new tickets.

## Alternatives

- API owns every transition: forces runtime events through an extra control hop and risks stale observations.
- Streaming worker owns everything: couples user APIs and deletion to ephemeral tasks.
- Eventual independent state copies: ambiguous source of truth and difficult recovery.

## Consequences

Transition tables and error semantics are shared. Services need conditional-write conflict handling and a reconciler for abandoned states. Completion may take longer but is truthful. State version is exposed for optimistic concurrency while leases remain private.

## Acceptance evidence

Race tests cover duplicate complete, stop plus disconnect, delete during finalizing, two reconnect workers, stale epoch results, export failure, and retry/reconciliation.

