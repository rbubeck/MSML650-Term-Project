# Integration Tests

Status: directory boundary only; no cross-package integration suite exists.

Owner: affected component owners; quality review by Person 5

Integration tests run locally without real AWS credentials by default. They exercise real shared contracts across component boundaries using fakes at AWS/network persistence edges.

## Initial test sequence

1. shared HTTP examples parse with canonical Zod schemas;
2. WebSocket JSON messages and binary PCM frames remain compatible across contracts/stream-client/service;
3. fake ticket issuer/verifier proves expiry, binding and one-time replay behavior;
4. fake provider produces partial/final events through the service state machine;
5. final results are deduplicated and checkpointed once in an in-memory repository;
6. two distinct identities cannot access each other’s sessions;
7. cancellation, malformed input and bounded backpressure fail one session safely.

Fixtures must import production schemas/constants. A mock-only behavior cannot become an undocumented consumer dependency. Real AWS tests are manual/protected and live outside the default `npm test` path.
