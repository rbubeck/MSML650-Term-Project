# Shared Contracts

Status: reusable PCM constants and Zod source-of-truth decision only. Structured Option A schemas are not implemented.

`src/audio-format.ts` holds the retained mono 16 kHz PCM/100 ms target. It is **not** a WebSocket frame or a complete capture/resampler implementation. The former 16-byte proxy header/codec was removed by ADR-010.

Persons 2/3/4 and consumers must agree on Zod 4 schemas for HTTP requests/responses, session state, errors, and client-uploaded finals before coding independently. Generate OpenAPI/JSON Schema from accepted Zod definitions; do not hand-maintain competing snapshots. Amazon EventStream models belong inside `packages/stream-client`.
