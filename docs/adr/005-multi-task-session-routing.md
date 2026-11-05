# ADR-005: Multi-Task Session Routing and Leases

Status: Proposed  
Owners: Persons 3 and 4

## Context

ALB pins an upgraded WebSocket to the selected ECS target. It cannot move the live connection after task failure. In-memory registries and counters are task-local, while reconnects may reach any healthy task.

## Proposed decision

Allow ALB to select any healthy task for a new connection. Store authoritative session state, connection attempt, epoch, capacity reservation, and a time-bound worker lease in DynamoDB. A task conditionally acquires the current epoch/lease after consuming the ticket and renews it while healthy. All durable writes compare current epoch/lease as appropriate.

No session affinity is required for existing upgraded connections. A reconnect may land anywhere and rehydrates from durable checkpoints. In-memory maps optimize only the current task and are never cross-task truth.

## Alternatives

- ALB stickiness: does not fail over an active socket and stale task affinity is undesirable.
- Redis/ElastiCache registry: useful for future pub/sub but adds cost/operations before MVP need.
- Single ECS task: violates multi-user reliability and deployment goals.
- API Gateway WebSocket registry: moves the data plane to an excluded architecture.

## Consequences

DynamoDB conditional/lease traffic increases. Lease timing and clock-skew tolerance require care. Task loss interrupts audio but another task can resume the logical session. Collaborative multi-viewer fan-out remains out of scope.

## Acceptance evidence

Tests cover two tasks, reconnect to a different task, stale lease writes, task SIGTERM/crash, capacity release/reconciliation, and isolation between simultaneous users.

