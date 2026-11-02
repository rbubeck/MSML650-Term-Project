# Evaluation, Observability, and Release Quality

Status: Proposed methodology  
Owner: Person 5

This directory will preserve and evolve the existing WER work from `Scripts/` and `Results/`. Moving files requires a reviewed migration; bootstrap does not delete or claim new benchmark results.

## Goals

Measure transcription quality, latency, reliability, isolation, capacity, and cost reproducibly. Results describe a named dataset, product/provider configuration, code version, AWS Region/environment, and measurement date. They are not universal promises.

## Reproducibility manifest

Every run records:

- run ID, timestamp, commit SHA, environment, Region;
- evaluator and normalization version;
- dataset name/version/license/provenance and sample IDs;
- language, accent/noise/domain annotations where lawfully available;
- audio codec/rate/channels/duration and preprocessing;
- Transcribe configuration, vocabulary/model, partial stabilization, and feature flags;
- application protocol/service versions;
- requested and admitted concurrency;
- raw metric artifact locations and checksum;
- exclusions/failures with reasons;
- cost-estimation source and assumptions.

Reference audio and transcripts must be versioned or fetched reproducibly without committing restricted/large data. Never place real user recordings in the benchmark corpus without explicit consent and governance.

## Accuracy methodology

Primary metric is corpus aggregate word error rate:

```text
WER = (substitutions + deletions + insertions) / reference words
```

Report aggregate counts and WER, per-sample distribution, missing/failed samples, and stratification by relevant audio conditions. Do not average per-sample WER as the only corpus score. Normalization rules for case, punctuation, Unicode, numbers, contractions, fillers, and partial words are versioned and applied symmetrically.

AMI overlap requires separate handling: a time-merged reference can unfairly penalize a single transcript stream. Report overlap policy and consider speaker-attributed or time-constrained metrics later. LibriSpeech clean speech is a smoke baseline, not representative production evidence.

Future diarization metrics are out of MVP unless speaker labeling is approved.

## Test matrix

| Dimension | Initial coverage |
|---|---|
| Input | Versioned sample playback; live microphone smoke |
| Language | Approved MVP language(s); do not infer unsupported features |
| Acoustic condition | Clean, moderate noise, far-field, interruption/overlap |
| Browser | Current supported Chrome, Firefox, Safari/Edge as approved |
| Native capture rate | 44.1 kHz and 48 kHz resampled to canonical PCM |
| Duration | Short, typical, and rotation-boundary synthetic run |
| Network | Normal, latency/jitter, disconnect/reconnect, slow consumer |
| Concurrency | 1, 2 isolated users, then bounded approved N ramp |
| Failure | Invalid ticket, quota/admission, provider error, task drain, persistence/export failure |
| Privacy | Cross-user access and seeded-secret log scan |

## Latency definitions

Measure and report separately:

- `capture_to_server_receive_ms`: audio sample capture position to ECS receipt, with documented clock alignment.
- `capture_to_partial_ms`: relevant audio position to first partial containing it.
- `capture_to_final_ms`: relevant audio position to final provider/application result.
- `final_to_checkpoint_ms`: final observed to durable checkpoint confirmation.
- `stop_to_export_ms`: accepted stop to durable completed export.
- `session_start_ms`: API creation to WebSocket `ready`.
- `reconnect_ready_ms`: detected disconnect to new `ready`.

Report count, p50, p95, p99 where sample size supports it, maximum, and failures/exclusions. Define percentile algorithm. Never subtract unsynchronized clocks without an offset methodology; prefer audio sample positions and same-process monotonic spans.

## Reliability and integrity

Track:

- API/WebSocket/Transcribe/checkpoint/export attempts and bounded error rates;
- admitted, rejected, active, completed, interrupted, and failed sessions;
- reconnect attempts/outcomes and interrupted duration;
- audio sequence gaps, queue high-water, backpressure closures;
- observed final provider results versus unique checkpoints;
- missing and duplicate segment count;
- completion/export/history correctness;
- task drain and rotation outcomes;
- percentage of session audio duration with active transcription, with precise definition.

## Capacity and load

Load tests ramp gradually because Transcribe can reject a rapid concurrency increase independently of the adjustable concurrent-stream quota. A test plan states maximum sessions, duration, estimated Transcribe/Fargate/ALB/log cost, Region/account, owner, abort thresholds, and cleanup.

Measure active streams per task, CPU, memory, event-loop/audio lag, queue depth, connection start rate, admission outcomes, Transcribe limits, and cost estimate. Never run uncontrolled production load tests.

## Security isolation acceptance

For two distinct Cognito subjects, prove user A cannot:

- list B's session;
- read B's metadata or segments;
- rename/complete/delete B's session;
- request a ticket for B's session;
- connect/reconnect to B's stream;
- download B's export.

Test both known opaque IDs and enumeration-like inputs. Responses must not leak existence or storage keys.

## Telemetry schema

Structured events use:

```text
timestamp, level, service, environment, event, outcome
requestId/correlationId, sessionId (logs only when necessary), streamEpoch
protocolVersion, durationMs, errorCode, retryable
buildVersion, schemaVersion
```

Never include audio/transcript text, tokens, tickets, signed URLs, email/display name, authorization headers, or unbounded provider errors.

Initial event families:

```text
api.request.completed
ticket.issued | ticket.consumed | ticket.rejected
stream.connection.opened | ready | closed
stream.audio.gap | backpressure | rotation
transcribe.started | result.final | failed
segment.checkpointed | duplicate | failed
session.state.changed
export.completed | failed
admission.accepted | rejected
```

Metric names and dimensions are finalized once. Dimensions are low-cardinality: `environment`, `service`, `outcome`, bounded `errorCode`, and perhaps `languageCode`. Never dimension by user/session/request ID.

## Dashboard proposal

1. Service overview: request/session rates, errors, active streams, admission rejects.
2. Streaming health: ready latency, audio lag, queue pressure, provider failures, reconnect/rotation.
3. Persistence: checkpoint lag/errors, duplicates, finalization/export latency/failure.
4. Capacity/cost: streams per task, CPU/memory, task count, Transcribe minutes estimate, ALB and log volume.
5. Quality runs: versioned WER/latency report links, not raw transcript text.

## Alarm requirements

Thresholds require baselines and team approval. Staging must demonstrate alarms for sustained:

- API or streaming error ratio;
- no healthy ECS targets;
- capacity/admission saturation;
- Transcribe limit/dependency failures;
- checkpoint/export failures or lag;
- task crash/restart anomaly;
- budget forecast/actual threshold;
- dead-letter/reconciliation backlog if later introduced.

Every alarm links to an owner and runbook, avoids sensitive payloads, and is tested without paging real production contacts during bootstrap.

## Release report

A release candidate report includes exact versions, contract/schema migrations, tests executed, WER dataset/result, latency sample size/percentiles, two-user isolation result, bounded load outcome, failure tests, known gaps, cost estimate, alarm/runbook demonstration, and signatures from domain owners. Person 5 independently reports gaps but does not self-certify the full release.

## Existing code migration notes

Before treating current scripts as a gate:

- resolve `Datasets`/`Results` versus lowercase paths;
- add dependency locking and test fixtures;
- move top-level execution behind functions/main guards;
- establish one versioned normalization implementation;
- replace quadratic-memory alignment for long transcripts or document limits;
- add tests for empty, Unicode, punctuation, tie alignment, and corpus aggregation;
- distinguish synthetic validation from real Transcribe results;
- document AMI overlap policy and expand beyond five LibriSpeech examples.

