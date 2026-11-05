# Architecture Decision Register

ADRs begin as `Proposed`. Only the team can change them to `Accepted`. An implemented experiment does not silently accept a related architecture proposal.

| ADR | Decision | Status | Implementation note |
|---|---|---|---|
| [001](001-websocket-authentication.md) | WebSocket authentication and one-time tickets | Proposed | Blocks authenticated WebSocket slice |
| [002](002-session-state-ownership.md) | Session state ownership | Proposed | Blocks coupled API/stream/persistence lifecycle |
| [003](003-durable-segment-storage.md) | Durable final-segment storage | Proposed | Blocks checkpoint adapter and completion semantics |
| [004](004-reconnect-and-stream-rotation.md) | Reconnect and provider stream rotation | Proposed | Not needed for first fake local slice; required before recovery claims |
| [005](005-multi-task-session-routing.md) | Multi-task routing and leases | Proposed | Required before horizontal/distributed claims |
| [006](006-browser-audio-format.md) | Browser audio format and framing | Accepted | Codec/constants/tests implemented in `packages/contracts` |
| [007](007-environments-and-deployment.md) | Environments and deployment strategy | Proposed | AWS account/Region/budget exist, but no deployment is authorized or implemented |
| [008](008-runtime-contract-schemas.md) | Zod as the runtime contract source | Accepted | Audio uses a specialized codec; structured Zod schemas remain to implement |
| [009](009-shared-typescript-toolchain.md) | Shared TypeScript engineering toolchain | Accepted | Root/workspace tooling and CI checks implemented |

## Next review sequence

Review one decision at a time in this order:

1. ADR-001 ticket semantics;
2. ADR-002 state ownership;
3. ADR-003 checkpoint identity/durability;
4. freeze the smallest WebSocket v1 subset;
5. ADR-007 before any CDK deployment;
6. ADR-004/ADR-005 before reconnect/scale implementation claims.

An accepted ADR records its acceptance date and approvers. A superseded ADR links its replacement and migration impact. Update code, contracts and documentation in the same PR.
