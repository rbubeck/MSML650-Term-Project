# Streaming Service

Status: Amazon Transcribe provider boundary and manual smoke runner implemented; WebSocket service and ECS deployment not implemented.

Owner: Person 3

This workspace will become the persistent Node.js/TypeScript WebSocket service on ECS/Fargate. It will validate tickets, parse the application protocol, enforce audio continuity/backpressure, operate provider streams, map partial/final results, checkpoint final segments and drain safely.

## Implemented now

- `TranscriptionProvider` application boundary;
- official AWS SDK v3 Amazon Transcribe adapter;
- fixed 16 kHz PCM/100 ms chunk validation using shared contract constants;
- partial/final result mapping with provider-specific models kept inside the adapter;
- abort propagation and explicit missing-result-stream failure;
- `.wav` and raw PCM smoke input, final-frame silence padding and real-time pacing;
- hard 30-second smoke-test duration ceiling;
- deterministic unit tests with an injected fake SDK call (no network/AWS in `npm test`).

On 2026-11-02, the manual smoke runner streamed a 4.016-second synthetic voice file to Amazon Transcribe in `us-east-1` and received partial and final `en-US` results. This verifies only the local file-to-provider boundary.

## Not implemented

- HTTP health/readiness server or WebSocket listener;
- ticket/session/lease/checkpoint adapters;
- application protocol state machine and JSON message schemas;
- bounded socket/audio queues, message-rate limits and backpressure closure;
- deterministic application segment IDs/checkpoint coordination;
- reconnect, provider rotation, graceful SIGTERM draining or telemetry;
- container image, ECR, ALB, ECS/Fargate or any deployed endpoint.

## Required service boundaries

```text
TicketVerifier
SessionLeaseRepository
SegmentCheckpointRepository
TranscriptionProvider  # implemented provider boundary; AWS adapter exists
```

The full local slice uses fakes for all boundaries. AWS SDK types must not cross `TranscriptionProvider` or enter the public WebSocket contract.

## Local verification

From the repository root:

```bash
npm run check
```

Optional paid/manual provider smoke test:

```bash
AWS_PROFILE=live-transcription-dev \
AWS_REGION=us-east-1 \
npm run transcribe:smoke --workspace @live-transcription/streaming -- \
/absolute/path/to/mono-16khz-int16.wav
```

Read [`docs/runbooks/amazon-transcribe-smoke-test.md`](../../docs/runbooks/amazon-transcribe-smoke-test.md) first. Never use real customer audio or record transcript text in shared logs.

## Next implementation gate

Before building the browser-facing WebSocket service, accept ADR-001, ADR-002 and ADR-003 and freeze the smallest WebSocket v1 message subset. ADR-006 audio framing is already accepted and implemented.

After that gate, build in this order:

1. protocol/state machine with a fake provider;
2. fake ticket/lease/checkpoint adapters and failure tests;
3. bounded backpressure and lifecycle cancellation;
4. local stream-client integration harness;
5. container/health/drain behavior;
6. approved dev deployment and real provider integration.
