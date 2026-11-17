
# CloudScribe Stereo QA Test Patches

## Overview

These patches contain additional automated tests developed during
the November 17, 2026 stereo integration review.

- Source branch: `feature/cloudscribe-stereo-v5-complete`
- Source commit: `9f2d868`
- Original baseline: 204 passing tests across 27 suites
- Expanded baseline: 243 passing tests across 29 suites
- Additional passing tests: 39
- Additional defect reproductions: 2

The patches contain test code only. No production implementation
changes are included.

## Patch Inventory

| Patch | Additional passing tests | Purpose |
| --- | ---: | --- |
| `QA-004-stereo-signer-tests.patch` | 3 | Stereo URL signing and signature verification |
| `stereo-pcm-worklet-tests.patch` | 10 | Stereo PCM encoding and resampling |
| `stereo-channel-attribution-tests.patch` | 6 | Transcript channel attribution and failure handling |
| `stereo-source-capture-tests.patch` | 20 | Audio acquisition, processing, and resource cleanup |
| `stereo-source-capture-with-diagnostics.patch` | 20 | Alternative capture patch containing two additional failing diagnostic tests |

The first four patches constitute the validated regression suite.

The fifth patch is an alternative to
`stereo-source-capture-tests.patch`, not an additional patch
to apply on top of it.

## Applying the Validated Tests

Apply these patches only to a compatible stereo implementation.

The original validation was performed against commit `9f2d868`.
Use a clean working tree and verify patch compatibility before
applying any changes.

From the repository root:

```bash
PATCH_DIR=evaluation/patches/stereo

git apply --check "$PATCH_DIR/QA-004-stereo-signer-tests.patch"
git apply --check "$PATCH_DIR/stereo-pcm-worklet-tests.patch"
git apply --check "$PATCH_DIR/stereo-channel-attribution-tests.patch"
git apply --check "$PATCH_DIR/stereo-source-capture-tests.patch"
```

If all compatibility checks succeed:

```bash
git apply "$PATCH_DIR/QA-004-stereo-signer-tests.patch"
git apply "$PATCH_DIR/stereo-pcm-worklet-tests.patch"
git apply "$PATCH_DIR/stereo-channel-attribution-tests.patch"
git apply "$PATCH_DIR/stereo-source-capture-tests.patch"
```

If the patches are not present in the target checkout, copy them
from the evaluation repository or use their absolute paths.

## Running Validation

Install dependencies:

```bash
npm ci
```

Build the shared packages before running the complete validation
pipeline:

```bash
npm run build --workspace=@live-transcription/contracts --workspace=@live-transcription/stream-client
```

Run:

```bash
npm run check
```

Expected results against the original reviewed implementation:

- Formatting: PASS
- Linting: PASS
- TypeScript: PASS
- Test suites: 29/29 PASS
- Automated tests: 243/243 PASS
- Workspace builds: PASS

Test counts may differ after subsequent implementation changes.

## Reproducing Known Defects

The alternative diagnostic patch contains two additional tests
that intentionally assert behavior not satisfied by the reviewed
implementation.

Use a separate clean review worktree for defect reproduction.
Do not apply both stereo source capture patches.

Apply the diagnostic version instead of the validated capture
patch:

```bash
git apply --check "$PATCH_DIR/stereo-source-capture-with-diagnostics.patch"
git apply "$PATCH_DIR/stereo-source-capture-with-diagnostics.patch"
```

### BUG-002: Concurrent Stop Requests

```bash
npx vitest run frontend/src/audio/stereoSourceCapture.test.ts -t "waits for resource cleanup across concurrent stop requests"
```

Expected result against the original implementation: FAIL.

The second stop request resolves before the original cleanup
operation completes.

### BUG-003: Display Termination During Microphone Acquisition

```bash
npx vitest run frontend/src/audio/stereoSourceCapture.test.ts -t "rejects startup when display audio ends during microphone acquisition"
```

Expected result against the original implementation: FAIL.

Stereo processing starts despite the display audio track having
already ended.

Both defects remain open. Once remediation is implemented,
these diagnostic tests should pass and can be incorporated into
the regular regression suite.

## Integration Guidelines

- Do not apply stereo-specific tests to an incompatible mono
  implementation.
- Coordinate test integration with the stereo implementation owner.
- Keep intentionally failing diagnostic tests outside the regular
  regression suite until the associated defects are resolved.
- Rerun the complete validation pipeline after integration.
- Review patch contents before applying them to newer commits.

## Limitations

These tests use synthetic credentials, simulated transport
components, and mocked browser audio APIs.

They do not establish live AWS connectivity, real browser stereo
capture reliability, durable transcript persistence, or integrated
application performance.

See `evaluation/INTEGRATION_TEST_REPORT.md`, Section 13, for
detailed results, defect descriptions, and outstanding validation.
