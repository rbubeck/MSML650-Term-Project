# ADR-006: Browser Audio Format and Application Framing

Status: Proposed  
Owners: Persons 1 and 3

## Context

Browsers commonly capture at 44.1 or 48 kHz floating point. Amazon Transcribe streaming supports signed 16-bit little-endian PCM and recommends uniform real-time chunks, commonly 50–200 ms, with 16 kHz a good speech/data compromise. A WAV file/header is not streaming PCM.

## Proposed decision

The browser uses `getUserMedia` plus AudioWorklet, converts to mono, resamples to 16,000 Hz, clamps/quantizes to signed 16-bit little-endian PCM, and sends uniform 100 ms chunks. A versioned 16-byte application header carries sequence and session-relative capture position; ECS removes it and uses the AWS SDK for provider framing.

Accepted v1 is exactly one encoding/rate/channel configuration unless compatibility tests justify alternatives. Silence remains zero PCM. No raw audio is stored by default.

## Alternatives

- MediaRecorder WebM/Opus: browser output/container variability and extra streaming compatibility risk.
- Native 48 kHz PCM: avoids resampling but increases bandwidth/cost and changes limits.
- Server-side resampling: larger network payload and greater shared CPU cost.
- JSON/base64 audio: bandwidth and allocation overhead.

## Consequences

Frontend needs tested resampling off the UI thread. Frame byte order must be unambiguous. Sequence/timestamp semantics and quality need golden vectors. Initial 100 ms framing balances overhead and latency but remains measurable, not promised.

## Acceptance evidence

Golden PCM vectors, sample count/duration checks, 44.1/48-to-16 kHz quality tests, Safari/Chrome/Firefox compatibility, silence/clipping behavior, CPU usage, chunk timing, and WER comparison against known audio.

