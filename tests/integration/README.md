# Phase 1 Local Integration Tests

Status: planned; no Option A cross-package tests exist.

Use shared Zod schemas plus fake identity, signer, WebSocket/EventStream, clock, and repository boundaries. Prove the local vertical path without AWS:

```text
create → sign → fake partial/final → save acknowledgment → complete → history → delete
```

Required failures are cross-user access, malformed input, duplicate/conflicting final, stale epoch, rejected signing, corrupt/provider error frame, disconnect/reconnect, persistence failure, and content-free logs.

Provider fixtures belong in the stream client. Application JSON examples belong in shared contracts. Recorded upload, summary, export, and load-test paths are out of Phase 1.
