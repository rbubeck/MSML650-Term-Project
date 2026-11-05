# Multi-User Live Speech-to-Text Platform

Status: shared foundation and Amazon Transcribe provider slice implemented; browser application, control API, persistence, and cloud infrastructure are not yet implemented or deployed.

This repository is the canonical team workspace for a secure browser-based transcription product on AWS. The active architecture is Option B: browsers send application-framed audio to our Node.js WebSocket service on ECS/Fargate, and that service owns Amazon Transcribe Streaming connections. The browser never receives AWS credentials or connects directly to Transcribe.

The active charter is [direction_option_b.md](direction_option_b.md). The superseded direct-browser Option A brief was removed to prevent agents from implementing the wrong trust boundary; its history remains available in Git.

## Current verified state

| Area | State | Evidence |
|---|---|---|
| Repository/toolchain | Implemented | Node.js 24, npm 11 workspaces, TypeScript 6 strict mode, ESM, Vitest 5, ESLint 10, Prettier 3 |
| Runtime schema decision | Accepted | Zod 4 is canonical for structured network contracts; structured Zod schemas remain to be implemented |
| Binary audio contract | Implemented and unit tested | Mono PCM signed 16-bit little-endian, 16 kHz, exact 100 ms/3,200-byte payloads plus a 16-byte application header |
| Amazon Transcribe adapter | Implemented and unit tested | Official AWS SDK v3 behind `TranscriptionProvider`; provider payloads stay inside the adapter |
| AWS speech smoke test | Manually verified 2026-11-02 | Synthetic 4.016-second voice file produced partial and final `en-US` results in `us-east-1` |
| AWS development guardrail | Configured manually | Paid development account and a $20 monthly AWS Budget alert; the budget is not a hard spending cap |
| Frontend/stream client | Not implemented | Ownership and accepted audio requirements documented |
| Control API/auth | Not implemented | Proposed OpenAPI snapshot only; authentication and lifecycle ADRs remain open |
| Persistence | Not implemented | Proposed data model only; no DynamoDB/S3 resources exist |
| Deployment | Not implemented | No CDK stacks, containers, ECS service, ALB, Cognito pool, API Gateway, Lambda, DynamoDB table, S3 bucket, or Amplify app exist |
| Evaluation/e2e | Prototype/planning only | Existing Python WER utilities are not yet a reproducible release gate |

Do not interpret a successful local Transcribe smoke test as proof of browser capture, WebSockets, authentication, persistence, deployment, scalability, latency, or production readiness.

## Architecture

```text
Audio_Transcription_Testing/
├── README.md
├── .gitignore
├── requirements.txt
├── Scripts/
│   ├── prepare_ami_transcript.py
│   ├── normalize_ami_reference.py
│   ├── prepare_librispeech.py
│   ├── evaluate_wer.py
│   ├── evaluate_wer_batch.py
│   └── evaluate_librispeech.py
├── tests/
│   ├── __init__.py
│   ├── test_evaluate_wer.py
│   ├── test_evaluate_wer_batch.py
│   └── test_evaluate_librispeech.py
├── Datasets/
│   ├── AMI/
│   │   ├── Audio/
│   │   ├── Annotations/
│   │   └── Metadata/
│   └── Librispeech/
│       ├── audio/
│       ├── metadata/
│       ├── transcripts/
│       └── test_clean/
├── Results/
│   ├── ES2004a_reference_words.csv
│   ├── ES2004a_reference_transcript.txt
│   ├── ES2004a_reference_normalized.txt
│   └── Librispeech/
│       ├── wer_individual.csv
│       └── wer_summary.csv
└── .venv/
```

**Note:** This tree illustrates the local project layout. Large source datasets, audio files, generated results, and the Python virtual environment may be excluded from Git and are not necessarily present in the GitHub repository. Directory capitalization and generated output locations may differ depending on the local setup. The `requirements.txt` file should be included if maintained in the repository.

## 3. Requirements

- Python 3
- Git
- Access to the required AMI and LibriSpeech datasets
- An AWS account and appropriate permissions for AWS-based testing
- AWS CLI, if uploading files or interacting with AWS from the terminal

The Python virtual environment is local to each developer's machine and should not be committed to Git.

## 4. Environment Setup

From the project root, create and activate a virtual environment if one does not already exist.

### Linux or WSL

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
```

Install the dependencies required by the preparation scripts:

```bash
pip install pandas pyarrow soundfile
```

Additional packages may be needed depending on the specific script implementation and dataset format.

React ──HTTPS/JWT──> API Gateway ──> Lambda ──> DynamoDB + S3
         Cognito          control plane          metadata, segments, exports
```

Continuous audio does not pass through Lambda or API Gateway WebSocket routes. Final transcript segments, not raw microphone audio, are persisted by default. See [ARCHITECTURE.md](ARCHITECTURE.md).

## Start here

Every contributor and coding agent must:

1. Read [AGENTS.md](AGENTS.md), this README, and the README for the owned directory.
2. Read [API_CONTRACTS.md](API_CONTRACTS.md), [ARCHITECTURE.md](ARCHITECTURE.md), and relevant accepted ADRs.
3. Check the [decision queue](docs/orchestrator/decision-queue.md); do not implement a proposal as if it were accepted.
4. Branch from the team-approved integration base and keep the PR within one owner area where possible.
5. Import shared contracts rather than recreating wire types or audio constants.
6. Run `npm run check` before handoff and report only tests actually run.
7. Never deploy, create AWS resources, or run paid/load tests without the orchestrator’s explicit approval.

The current foundation work is on `nandan/dev`. Prefer merging its reviewed foundation PR into protected `main` before teammates create long-lived feature branches. If the team temporarily branches from `nandan/dev`, rebase those branches onto `main` immediately after the foundation merge.

## Ownership and immediate work

| Owner | Paths | Next approved preparation | Decision gate before coupled implementation |
|---|---|---|---|
| Person 1 — frontend/UX | `frontend/`, `packages/stream-client/` | Scaffold React locally, build accessible mocked screens, design/test AudioWorklet resampling against shared PCM vectors | Coordinate WebSocket v1 state machine with Person 3; do not invent messages |
| Person 2 — identity/control API | `backend/api/` | Implement Zod schemas and handler/application interfaces against fake identity/repositories | ADR-001 ticket semantics and ADR-002 lifecycle authority |
| Person 3 — streaming/orchestration | `backend/streaming/`, streaming contracts | Maintain provider adapter; next build fake-backed WebSocket slice after contract decisions | ADR-001, ADR-002, ADR-003 and smallest WebSocket v1 freeze |
| Person 4 — persistence/platform | `backend/persistence/`, `infrastructure/` | Refine repository interfaces and CDK design/tests without deployment | ADR-002, ADR-003 and ADR-007 acceptance; explicit deployment approval |
| Person 5 — evaluation/quality | `evaluation/`, `tests/` | Migrate WER tools, define fixtures/telemetry/test methodology, add local integration tests | Dataset provenance, metric names, load budget and environment approval |

See [INTEGRATION_PLAN.md](INTEGRATION_PLAN.md) for handoffs and merge order.

## Repository map

```text
.
├── frontend/                 # Person 1: React UX and browser capture
├── backend/
│   ├── api/                  # Person 2: identity-aware HTTP control plane
│   ├── streaming/            # Person 3: WebSocket and Transcribe integration
│   └── persistence/          # Person 4: application storage adapters
├── packages/
│   ├── contracts/            # canonical schemas, types, binary codec/constants
│   └── stream-client/        # browser-facing WebSocket abstraction
├── infrastructure/           # Person 4: future AWS CDK
├── evaluation/               # Person 5: reproducible quality methodology
├── tests/
│   ├── integration/          # cross-component local contract tests
│   └── e2e/                  # authorized browser/staging journeys
├── Scripts/                  # legacy evaluation prototype; migration pending
├── Datasets/                 # reference metadata; large audio excluded
├── Results/                  # existing reference artifacts; not product evidence
└── docs/                     # ADRs, security, protocol, data model, runbooks
```

## Local development

The current AMI preparation includes the `ES2004a` meeting sample, with approximately 2,614 words in its normalized reference transcript.

### 5.2 LibriSpeech

- Node.js 24 and npm 11;
- Python 3 only for the existing evaluation prototype;
- AWS CLI only for the optional, paid Transcribe smoke test;
- Docker and AWS CDK later, when their implementation begins.

From the repository root:

```bash
npm ci
npm run check
python3 -m compileall -q Scripts
```

The script requires the source dataset to be available locally. Consult the script for its expected input path and output behavior.

The initial prepared subset contains five audio clips. This is useful for validating the workflow, but a larger and more varied sample is recommended for meaningful performance comparisons.

## 6. Transcription Evaluation

The evaluation pipeline compares transcripts generated by Amazon Transcribe against prepared reference transcripts.

A typical evaluation workflow is:

1. Select an audio sample and its reference transcript.
2. Upload the audio to Amazon S3.
3. Submit a transcription job to Amazon Transcribe.
4. Retrieve the resulting transcript.
5. Normalize the reference and hypothesis using consistent rules.
6. Calculate transcription accuracy metrics.
7. Record runtime, failures, and other relevant performance measurements.
8. Store evaluation results for comparison and reporting.

### 6.1 Word Error Rate

The primary accuracy metric is **Word Error Rate (WER)**:

\[
WER = \frac{S + D + I}{N}
\]

Where:

- \(S\) = number of substitutions
- \(D\) = number of deletions
- \(I\) = number of insertions
- \(N\) = number of words in the reference transcript

Lower WER generally indicates better transcription accuracy. WER can exceed 1.0 (100%) when the number of errors exceeds the number of reference words.

Reference and hypothesis transcripts should use consistent normalization rules for casing, punctuation, numbers, and other text conventions. Any excluded fillers, partial words, or overlapping speech should be documented because those decisions can affect the score.

For meeting audio, speaker diarization and overlapping speech may require separate evaluation from ordinary word-level WER.

### 6.2 Individual WER Evaluation

The script `Scripts/evaluate_wer.py` calculates word-level transcription errors for an individual reference and hypothesis transcript.

It performs text normalization, word alignment, and calculation of:

- Substitutions
- Deletions
- Insertions
- Total edit distance
- Word Error Rate

Example:

```bash
python Scripts/evaluate_wer.py \
    --reference path/to/reference.txt \
    --hypothesis path/to/hypothesis.txt
```

The script generates a CSV results file containing the evaluation metrics.

### 6.3 Batch WER Evaluation

The script `Scripts/evaluate_wer_batch.py` evaluates multiple reference and hypothesis transcript pairs using a manifest CSV.

The manifest must contain:

- `reference_file`
- `hypothesis_file`

Example:

```bash
python Scripts/evaluate_wer_batch.py \
    --manifest path/to/manifest.csv
```

The script calculates individual WER results and aggregate WER across all evaluated transcript pairs.

Aggregate WER is calculated using total edits divided by total reference words:

\[
WER_{\text{aggregate}} =
\frac{\sum(S+D+I)}{\sum N}
\]

This approach weights each transcript according to its reference word count rather than calculating a simple average of individual WER percentages.

### 6.4 LibriSpeech Evaluation

The script `Scripts/evaluate_librispeech.py` evaluates LibriSpeech hypothesis transcripts against the prepared reference CSV.

It expects a hypothesis text file named after each sample ID, such as:

```text
Results/Librispeech_hypotheses/
├── 6930-75918-0000.txt
├── 6930-75918-0001.txt
└── ...
```

Run the evaluator:

```bash
python Scripts/evaluate_librispeech.py
```

The script generates:

| Output | Description |
|---|---|
| `wer_individual.csv` | Individual evaluation metrics for successfully evaluated samples |
| `wer_summary.csv` | Aggregate evaluation metrics, including evaluated samples, missing samples, reference word count, edit counts, and aggregate WER |

The evaluator accounts for missing hypothesis files and empty reference transcripts according to its validation rules.

The default input and output paths can be overridden using the script's command-line arguments.

## 7. Automated Unit Testing

An automated unit testing framework was developed to validate the three WER evaluation scripts independently of AWS.

The tests use Python's built-in `unittest` framework and cover text normalization, word alignment, WER calculations, CSV generation, and error handling.

### 7.1 Test Organization

The `tests/` directory contains:

| Test file | Purpose |
|---|---|
| `test_evaluate_wer.py` | Tests text normalization, word alignment, and individual WER evaluation |
| `test_evaluate_wer_batch.py` | Tests batch processing, individual results, and aggregate WER calculations |
| `test_evaluate_librispeech.py` | Tests LibriSpeech evaluation, missing hypotheses, empty references, and output generation |

### 7.2 Running the Tests

Activate the project's virtual environment and navigate to the repository root.

Run the individual test files:

```bash
python -m unittest tests.test_evaluate_wer -v
python -m unittest tests.test_evaluate_wer_batch -v
python -m unittest tests.test_evaluate_librispeech -v
```

To execute the entire test suite:

```bash
python -m unittest discover -s tests -v
```

### 7.3 Test Coverage and Results

The completed automated test suite contains **31 unit tests**:

| Test suite | Number of tests |
|---|---:|
| Individual WER evaluation | 17 |
| Batch WER evaluation | 6 |
| LibriSpeech evaluation | 8 |
| **Total** | **31
