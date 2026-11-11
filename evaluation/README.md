# Evaluation and Observability — Person 5

Status: Python evaluation scripts migrated into the shared project structure; reproducible Option A quality-gate work remains in progress.

Owner: Person 5

This directory contains the migrated Python evaluation tools and preserves the existing evaluation methodology. Original datasets and result artifacts remain under `Datasets/` and `Results/`. The migration does not delete source data or claim new benchmark results.

## Current evidence and limitations

- The six original Python scripts have been migrated from `Scripts/` into `evaluation/scripts/`.
- Python dependencies are pinned separately in the repository-root `requirements-evaluation.txt`.
- Python unit tests have been updated to use package imports and module execution.
- Post-merge verification on the current shared-project checkout passed all 31 Python unit tests, and all six evaluation modules imported successfully. The full `npm run check` also passed: formatting, lint, root and workspace TypeScript typechecks, 177 Vitest tests, and frontend/API/contracts/stream-client builds.
- Existing `Datasets/` metadata and `Results/` artifacts are preserved; raw datasets and audio are not part of this migration.
- The shared TypeScript suite does not yet invoke the Python WER tools.
- One 4.016-second synthetic macOS voice file was manually streamed through Amazon Transcribe on 2026-11-02, proving SDK connectivity and partial/final delivery only. This is historical server-side connectivity evidence, not an Option A browser result.
- No committed result is currently a controlled Amazon Transcribe WER, browser latency, concurrency, recovery, persistence, or deployed-service benchmark.
- Under Option A, the browser receives provider results directly. The backend cannot independently verify the provider-to-browser transcript path; uploaded final text has client-supplied provenance. Evaluation must distinguish provider delivery from API acknowledgment and durable persistence.

## Option A evaluation responsibilities

Person 5 owns evaluation, observability, and release quality. Coordinate with Persons 1–4 to define and measure:

1. Browser audio-capture-to-first-partial latency.
2. Browser audio-capture-to-final-result latency.
3. Final-result-to-API-save-acknowledgment latency and save success rate.
4. Session completion and export behavior for acknowledged uploads.
5. Interruption, reconnect, retry, duplicate, and missing-final behavior.
6. Multi-user ownership isolation and authorization failure behavior.
7. Privacy-safe telemetry, operational reliability, and bounded cost measurements.

Report dataset and version, browser, Region, provider settings, sample counts, exclusions, and the exact tests performed. Clearly distinguish mock results, local evaluation, historical experiments, and integrated release evidence.

## Data, privacy, and cost safeguards

- Preserve `Scripts/`, `Datasets/`, and `Results/` provenance. Do not delete or overwrite original artifacts as part of this migration.
- Never log audio, transcript text, JWTs, credentials, or signed URLs.
- No raw microphone audio is stored by default under the Option A architecture.
- Do not claim server-verified transcript provenance: the browser submits final text after receiving it directly from Transcribe.
- Paid or load-testing runs require an explicitly approved bounded budget and scope.
- Do not create AWS resources or run paid tests without authorization.

## Remaining work

1. Add small licensed or synthetic fixtures and tests for normalization and alignment edge cases.
2. Document the WER methodology, dataset versions, exclusions, and limitations.
3. Define browser capture, partial/final delivery, save acknowledgment, export, interruption, and cost measurement procedures.
4. Coordinate privacy-safe telemetry and integration evidence with Persons 1–4.
5. Keep release claims tied to the integrated authenticated browser-to-Transcribe demonstration, final upload/history/export/delete, two-user ownership isolation, privacy-safe logs, and tested failure behavior.

Mocks and historical server-side Transcribe experiments are preparation, not Option A release evidence.
