# Evaluation and Release Evidence — Person 5 Phase 1

**Status:** Python evaluation scripts migrated into the shared project structure, with synthetic normalization and alignment edge-case coverage added. Reproducible Option A quality-gate work remains in progress.

**Owner:** Person 5

This directory contains the migrated Python evaluation tools and preserves the existing evaluation methodology. Original datasets and result artifacts remain under `Datasets/` and `Results/`. The migration does not delete source data or claim new benchmark results.

## Current evidence and limitations

- The six original Python scripts have been migrated from `Scripts/` into `evaluation/scripts/`.
- Python dependencies are pinned separately in the repository-root `requirements-evaluation.txt`.
- Python unit tests use package imports and module execution.
- The Python test suite now passes all **40 unit tests**, including additional synthetic tests for normalization, word alignment, repeated words, mixed edit types, and batch evaluation with an empty hypothesis.
- Four small synthetic text fixtures are maintained under `tests/fixtures/transcripts/`. They cover normalization behavior and alignment edge cases without adding licensed transcripts or raw audio.
- All six evaluation modules import successfully.
- The full `npm run check` previously passed: formatting, lint, root and workspace TypeScript typechecks, 177 Vitest tests, and frontend/API/contracts/stream-client builds.
- Existing `Datasets/` metadata and `Results/` artifacts are preserved; raw datasets and audio are not part of this migration.
- The shared TypeScript suite does not yet invoke the Python WER tools.
- One 4.016-second synthetic macOS voice file was manually streamed through Amazon Transcribe on 2026-11-02, proving SDK connectivity and partial/final delivery only. This is historical server-side connectivity evidence, not an Option A browser result.
- No committed result is currently a controlled Amazon Transcribe WER, browser latency, concurrency, recovery, persistence, or deployed-service benchmark.
- Under Option A, the browser receives provider results directly. The backend cannot independently verify the provider-to-browser transcript path; uploaded final text has client-supplied provenance. Evaluation must distinguish provider delivery from API acknowledgment and durable persistence.

## WER methodology and dataset provenance

### Word Error Rate calculation

The evaluation scripts compare a reference transcript against a hypothesis transcript using word-level Levenshtein alignment.

Before alignment, `normalize_text()` applies Unicode NFKC normalization, converts text to lowercase, replaces punctuation with spaces, and collapses repeated whitespace. The resulting text is split into word tokens.

The scripts calculate:

\[
WER = \frac{S + D + I}{N} \times 100
\]

Where:
- **S:** substitutions
- **D:** deletions
- **I:** insertions
- **N:** number of words in the reference transcript

Individual WER is calculated for each transcript pair. Aggregate WER is calculated from the total substitutions, deletions, and insertions divided by the total reference-word count across evaluated samples. It is not the arithmetic mean of individual sample WER percentages.

The implementation uses dynamic-programming minimum edit-distance alignment. Insertions can cause WER to exceed 100%.

### Dataset provenance and evaluation subsets

**AMI Meeting Corpus**
- Meeting evaluated: `ES2004a`.
- Reference source: AMI word-level XML annotations for speakers A, B, C, and D.
- The preparation script merges speaker annotations by start time and records timestamps, speaker labels, word text, and truncated-word flags.
- Punctuation-only annotation elements and empty word entries are skipped during preparation.
- Generated word-level reference: `Results/ES2004a_reference_words.csv`.
- Generated preliminary transcript: `Results/ES2004a_reference_transcript.txt`.
- Normalized reference: `Results/ES2004a_reference_normalized.txt`.
- The generated reference contains 2,614 word entries. Truncated words are retained and flagged rather than automatically excluded.
- The AMI download manifest identifies the `ES2004a` meeting and its Mix-Headset audio. The manifest documents Creative Commons Attribution 4.0 licensing for the released material.

**LibriSpeech**
- Dataset subset: `test-clean`.
- Source: `Datasets/Librispeech/test_clean` Parquet file.
- Recorded source size: 2,620 rows, according to `Datasets/Librispeech/metadata/dataset_info.txt`.
- Prepared evaluation subset: the first five rows of the source Parquet file.
- Exported audio: five 16-bit PCM WAV files at 16 kHz.
- Reference transcripts: `Datasets/Librispeech/transcripts/references.csv`.
- The reference CSV includes sample IDs, audio paths, transcript text, speaker IDs, chapter IDs, and sample rates.
- This five-sample subset is intended for initial evaluation and pipeline testing; it is not a full LibriSpeech test-clean benchmark.

The repository does not currently record an exact upstream release identifier or source checksum for either dataset. The AMI build manifest and LibriSpeech metadata file are retained as available provenance records. Do not describe either dataset as a newly downloaded or independently version-verified release without additional evidence.

### Exclusions and interpretation

- AMI punctuation-only elements and empty word entries are excluded during reference preparation.
- AMI truncated words are retained; their flags are available in the word-level CSV.
- The AMI normalized transcript omits speaker labels and timestamps. The current WER calculation therefore evaluates the merged word sequence, not speaker-attributed transcription accuracy or diarization.
- The LibriSpeech preparation script selects only five source rows. Results from this subset must not be generalized to the full dataset.
- The LibriSpeech evaluator skips reference samples whose hypothesis files are missing and reports the missing count. Empty reference transcripts are skipped with a warning.
- The batch evaluator requires both transcript files to exist and rejects empty reference transcripts.
- The single-pair and batch WER scripts use the same normalization and alignment implementation. Before general WER normalization, the AMI reference pipeline applies dataset-specific normalization: it lowercases words, removes punctuation other than internal apostrophes, and strips leading/trailing underscores and apostrophes. This differs from `normalize_text()`, which replaces punctuation with spaces. This difference is a reproducibility consideration when comparing AMI results with other datasets.
### Reproducibility and limitations

For each reported WER result, record the dataset and subset, sample IDs, reference source, hypothesis-generation method, script version or Git commit, normalization procedure, number of evaluated samples, missing or excluded samples, total reference words, and substitution/deletion/insertion counts.

The repository's synthetic fixtures validate normalization and alignment behavior. They do not represent real speech-recognition performance.

The existing AMI and LibriSpeech reference artifacts provide material for local evaluation when corresponding hypothesis transcripts are available. They do not, by themselves, establish an Amazon Transcribe WER result. No controlled provider benchmark or integrated Option A browser-to-Transcribe benchmark is claimed by this methodology.

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

The Python evaluation tools have been migrated into the shared project structure, synthetic edge-case tests have been added, and the WER methodology and dataset provenance are documented. The remaining work focuses on validating real transcription quality and supporting Option A release readiness.

1. **Run reference-based transcription evaluations.** Generate hypothesis transcripts for the prepared AMI `ES2004a` and five-sample LibriSpeech subsets, then calculate WER and substitution, deletion, and insertion counts. Clearly identify the dataset, evaluated samples, and any missing hypotheses or exclusions.

2. **Establish reproducible Amazon Transcribe benchmarks.** Evaluate actual Transcribe output against the prepared references where applicable. Record provider configuration, Region, sample counts, normalization methodology, and results. Keep historical SDK connectivity evidence separate from controlled benchmark results.

3. **Validate the integrated Option A workflow.** Coordinate with the team to test browser audio capture, streaming transcription, partial and final result delivery, session management, and final-result persistence through the API.

4. **Measure performance and reliability.** Capture audio-to-first-partial and audio-to-final latency, final-result-to-save-acknowledgment latency, save success rate, and session completion behavior. Test interruption, reconnect, retry, duplicate submission, and missing-final scenarios.

5. **Verify security and multi-user isolation.** Test session ownership, authorization failures, access boundaries, and privacy-safe telemetry. Confirm that logs do not expose audio, transcript text, credentials, JWTs, or signed URLs.

6. **Prepare release-quality evidence.** Document test configurations, procedures, sample counts, results, limitations, and unresolved issues. Distinguish synthetic unit tests, local evaluation, historical experiments, and integrated Option A results.

7. **Track cost and operational constraints.** Establish bounded test scopes and document expected or measured costs before any paid or load-testing activity. Obtain explicit approval before creating AWS resources or running paid tests.
