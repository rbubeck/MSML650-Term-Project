
# Phase 1 Local Integration Tests

## Status

Implemented: 13 fake-backed Option A cross-package integration tests.

All 13 integration tests passed on November 18, 2026. The full repository
validation also passed, with 190 automated TypeScript tests across 22 test
files.

The suite validates the currently available streaming path without AWS.
Full durable session lifecycle integration remains pending.

## Test Architecture

The integration suite connects the following real implementation components:

- Frontend `TeamApi` HTTP client.
- Backend stream-URL authorization and signing handler.
- Shared Zod request and response contracts.
- Frontend `DirectStreamAdapter`.
- `TranscribeStreamClient`.
- EventStream encoding, decoding, and provider message parsing.

External dependencies are replaced with deterministic test boundaries:

- In-process HTTP-to-API-Gateway bridge.
- Synthetic authenticated identity claims.
- In-memory session repository.
- Fake URL signer.
- Fixed clock.
- Fake admission control.
- Recording logger.
- Controlled provider WebSocket.
- Synthetic PCM audio capture.

No real AWS credentials, network requests, microphone recordings, or user
transcripts are required.

## Implemented Streaming Journey

```text
Seed owned session
  -> request authorized streaming capability
  -> allocate stream epoch
  -> sign fake provider URL
  -> open fake provider WebSocket
  -> send synthetic PCM
  -> receive partial and final transcript events
  -> stop or recover the streaming connection
```

The original Phase 1 target remains:

```text
create -> sign -> fake partial/final -> save acknowledgment
       -> complete -> history -> delete
```

Session creation, durable final-result persistence, completion, history,
and deletion are not yet covered by this cross-package suite.

## Test Coverage

| ID | Scenario | Expected behavior |
| --- | --- | --- |
| INT-001 | Authorized capability issuance | Valid capability returned through the frontend and backend |
| INT-002 | Two-user ownership isolation | Foreign and missing sessions are indistinguishable |
| INT-003 | Missing authentication | Request rejected before signing |
| INT-004 | Signing failure | Safe error returned; retry allocates a newer epoch |
| INT-005 | Repeated capability requests | Strictly increasing epochs and distinct fake URLs |
| INT-006 | Local streaming journey | Synthetic PCM produces partial and final captions |
| INT-007 | Provider exception | Safe failure notification and capture cleanup |
| INT-008 | Unexpected disconnect and reconnect | Explicit restart obtains a fresh capability and epoch |
| INT-009 | Sensitive-data protection | Selected diagnostic channels exclude sensitive values |
| INT-010 | Corrupted EventStream frame | Safe protocol error and stream cleanup |
| INT-011 | Repository failure and recovery | Failed fake allocation does not consume an epoch; retry succeeds |
| INT-012 | Authorization rejection | No provider connection or audio capture begins |
| INT-013 | Stale provider messages | Messages from the previous connection are ignored |

## Running the Tests

Run all commands from the repository root.

Install dependencies if needed:

```bash
npm ci
```

Build the shared packages if their compiled exports are not available:

```bash
npm run build --workspace @live-transcription/contracts
npm run build --workspace @live-transcription/stream-client
```

Run the cross-package integration suite:

```bash
npx vitest run tests/integration/streaming-journey.test.ts
```

Expected result:

```text
Test Files  1 passed (1)
Tests       13 passed (13)
```

Run dedicated integration test type checking:

```bash
npx tsc --project tests/integration/tsconfig.json
```

Run the complete repository validation:

```bash
npm run check
```

The root typecheck command includes the integration test TypeScript
configuration. The standard Vitest configuration discovers the integration
test file automatically.

## Test Artifacts

| File | Purpose |
| --- | --- |
| `streaming-journey.test.ts` | Cross-package streaming, authorization, failure, and recovery tests |
| `tsconfig.json` | Strict TypeScript checking for integration tests |
| `README.md` | Execution instructions, coverage, and limitations |
| `../../evaluation/INTEGRATION_TEST_REPORT.md` | Evaluation results and outstanding acceptance work |

## Limitations

- Identity claims are simulated; Cognito token validation is not exercised.
- The repository is in-memory; DynamoDB behavior is not exercised.
- The signer returns synthetic URLs; AWS authorization is not exercised.
- Provider transcript events are deterministic fixtures, not speech
  recognition results.
- Capture cleanup verifies calls to the simulated capture interface, not
  physical browser media-resource release.
- Reconnection is explicitly initiated by the test, not automatically
  performed by the application.
- Privacy assertions cover selected backend logs, frontend failure
  notifications, and console logging methods.
- Repository failure injection occurs before the fake allocation changes
  state. Ambiguous real database write outcomes are not covered.
- The suite targets the current mono streaming implementation, not the
  separate integrated stereo implementation.
- Final-observed captions do not constitute durable persistence
  acknowledgments.

## Remaining Phase 1 Coverage

The following scenarios require additional implementation or integration:

- Session creation and durable repository initialization.
- Malformed lifecycle and persistence requests.
- Duplicate final-result idempotency.
- Conflicting final-result rejection.
- Rejection of stale or unissued epochs during persistence.
- Persistence failure and acknowledgment recovery.
- Session completion and pending-final handling.
- Durable session history and transcript retrieval.
- Deletion and subsequent access denial.
- Ownership isolation across all lifecycle operations.
- Integrated stereo streaming regression testing.
- Authorized AWS smoke and extended-duration acceptance testing.

Provider fixtures belong in the stream client. Application JSON examples
belong in shared contracts.

Recorded upload, summary, export, and load-test paths remain outside
Phase 1.
