# ADR-006: Browser Audio Format and Application Framing

Status: Accepted

Accepted: 2026-11-02

Owners: Persons 1 and 3

## Context

Browsers commonly capture at 44.1 or 48 kHz floating point. Amazon Transcribe streaming supports signed 16-bit little-endian PCM and recommends uniform real-time chunks, commonly 50–200 ms, with 16 kHz a good speech/data compromise. A WAV file/header is not streaming PCM.

## Decision

The browser uses `getUserMedia` plus AudioWorklet, converts to mono, resamples to 16,000 Hz, clamps/quantizes to signed 16-bit little-endian PCM, and sends uniform 100 ms chunks. A versioned 16-byte application header carries sequence and session-relative capture position; ECS removes it and uses the AWS SDK for provider framing.

Accepted v1 is exactly one encoding/rate/channel configuration:

- headerless mono signed 16-bit little-endian PCM;
- 16,000 samples per second;
- exactly 1,600 samples or 3,200 PCM bytes per 100 ms frame;
- exactly 16 application-header bytes and 3,216 total WebSocket binary-message bytes;
- sequence is unsigned 32-bit big-endian, begins at `0` for each stream epoch, and increments by one without rollover;
- capture start is unsigned 64-bit big-endian microseconds on the logical-session sample clock;
- capture start advances exactly 100,000 microseconds between consecutive frames;
- reserved flags are `0`;
- a final short browser buffer is zero-padded to a complete frame before stop;
- silence remains zero-valued PCM samples.

No WAV/container header is sent and raw audio is not stored by default. A later format requires a new protocol version or an explicitly compatible extension.

## Alternatives

- MediaRecorder WebM/Opus: browser output/container variability and extra streaming compatibility risk.
- Native 48 kHz PCM: avoids resampling but increases bandwidth/cost and changes limits.
- Server-side resampling: larger network payload and greater shared CPU cost.
- JSON/base64 audio: bandwidth and allocation overhead.

## Consequences

Frontend needs tested resampling off the UI thread. The fixed 100 ms frame simplifies validation, continuity, and backpressure accounting. Padding can add at most one frame of trailing silence when stopping. Initial 100 ms framing balances overhead and latency but remains measurable, not an end-to-end caption-latency promise.

## Acceptance evidence

The shared contracts package contains codec and continuity tests. Remaining frontend evidence includes 44.1/48-to-16 kHz resampling quality, Safari/Chrome/Firefox compatibility, silence/clipping behavior, AudioWorklet CPU/chunk timing, and WER comparison against known audio.

