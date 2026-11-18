# Integrated Stereo Regression and Diagnostic Tests

## Overview

This directory preserves the expanded automated tests developed during the November 18, 2026, integration review of the CloudScribe stereo audio capture and continuous transcript implementation.

- Reviewed branch: `nandan/integrate-stereo-v5`
- Base commit: `4a80e09`
- Patch: `integrated-stereo-tests.patch`
- Test framework: Vitest 5.0.5
- Evaluation owner: Person 5 (Evaluation and Quality)

The patch contains test additions only. No production implementation files are modified.

## Patch Contents

The patch adds 1,576 lines across seven test files.

| Test file | Lines added |
| --- | ---: |
| `backend/api/src/aws/transcribe-signer.test.ts` | 46 |
| `frontend/src/audio/stereo-pcm-worklet.test.ts` | 268 |
| `frontend/src/audio/stereoSourceCapture.test.ts` | 721 |
| `frontend/src/components/ContinuousTranscript.test.tsx` | 73 |
| `frontend/src/lib/continuousTranscript.test.ts` | 78 |
| `frontend/src/services/directStreamAdapter.test.ts` | 95 |
| `frontend/src/services/separateStreamAdapter.stereo.test.ts` | 295 |
| **Total** | **1,576** |

The patch includes coverage for stereo URL signing, PCM encoding and resampling, channel attribution, audio acquisition, resource cleanup, stream shutdown, continuous transcript rendering, and document-level persistence status.

## Reproduction Instructions

Run the following commands from the primary project repository:

```bash
git fetch origin

PATCH_PATH="$(pwd)/evaluation/patches/integrated-stereo/integrated-stereo-tests.patch"

git worktree add --detach ~/cloudscribe-integrated-reproduction 4a80e09

cd ~/cloudscribe-integrated-reproduction

git apply --check "$PATCH_PATH"
git apply "$PATCH_PATH"

npm ci

npm run build --workspace @live-transcription/contracts
npm run build --workspace @live-transcription/stream-client

npm test
```

The shared workspace packages are built before running Vitest to ensure their compiled exports are available.

This patch is a standalone artifact targeting commit `4a80e09`. Do not apply it cumulatively with the earlier patches in `evaluation/patches/stereo/`, which target a different source revision.

## Expected Automated Results

The original integrated implementation passed 198 tests across 27 test files.

Applying this patch adds 54 tests, resulting in the following expanded test suite:

| Metric | Result |
| --- | ---: |
| Total test files | 29 |
| Passing test files | 26 |
| Failing test files | 3 |
| Total tests | 252 |
| Passing tests | 244 |
| Failing tests | 8 |
| Additional passing tests | 46 |
| Additional failing tests | 8 |
| Overall pass rate | 96.83% |

The eight failing tests are expected on the reviewed source revision. They reproduce known defects and must not be removed or weakened solely to obtain a passing test suite.

## Known Diagnostic Failures

| Defect | Description | Failing tests |
| --- | --- | ---: |
| BUG-002 | Concurrent stop requests initiate duplicate worklet flush operations. | 1 |
| BUG-003 | Stereo startup succeeds after display audio ends during microphone acquisition. | 1 |
| BUG-004 | AudioContext cleanup is skipped after worklet initialization or context resume failure. | 2 |
| BUG-005 | Stream shutdown errors prevent capture or transport cleanup. | 2 |
| BUG-006 | The transcript document incorrectly reports Saved when an earlier capture block contains failed or unacknowledged results. | 2 |
| **Total** | | **8** |

BUG-001, involving a stale system audio meter after external sharing termination, was reproduced separately through manual browser testing.

The automated diagnostics establish failures under controlled simulated conditions. They do not independently establish deployed AWS resource leaks, continued recording, or actual transcript data loss.

## Targeted Diagnostic Commands

Run the stereo capture tests:

```bash
npx vitest run frontend/src/audio/stereoSourceCapture.test.ts
```

Expected: 18 passed, 4 failed.

Run the direct stream adapter tests:

```bash
npx vitest run frontend/src/services/directStreamAdapter.test.ts
```

Expected: 4 passed, 2 failed.

Run the continuous transcript component tests:

```bash
npx vitest run frontend/src/components/ContinuousTranscript.test.tsx
```

Expected: 2 passed, 2 failed.

## Independent Quality Checks

The following checks passed with the complete patch applied:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run build
```

The production build retained the existing Vite warning concerning a JavaScript bundle larger than 500 kB.

The combined `npm run check` command is expected to fail at the test stage on the reviewed revision because of the eight known diagnostic failures.

## Verification and Limitations

The patch was verified using `git apply --check` against a clean detached worktree at commit `4a80e09`. The command completed successfully with exit code 0.

The expanded automated suite was executed in the original integrated review worktree. The separate clean worktree was used to verify patch applicability.

Browser integration testing was performed locally in mock mode. Successful mock transcription does not establish successful Amazon Transcribe stereo streaming, durable AWS persistence, or production readiness.

No AWS resources were deployed or modified during this review.

For detailed findings, browser test results, defect descriptions, and merge recommendations, refer to [the integration testing report](../../INTEGRATION_TEST_REPORT.md).