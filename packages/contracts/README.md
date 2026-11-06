# Shared Contracts — Phase 1

Status: reusable PCM constants exist; Phase 1 structured Zod schemas are the first shared implementation task.

`src/audio-format.ts` defines the mono 16 kHz signed 16-bit PCM/100 ms capture target. It is not a WebSocket frame or resampler. Phase 1 defines no custom application audio header.

Persons 2 and 3 co-own the initial contract PR with Persons 1/4 review. Implement and test the smallest shared schemas from `API_CONTRACTS.md`:

- stable error envelope and codes;
- session/state/page schemas;
- create/read/list/rename session inputs and outputs;
- stream URL response and approved audio settings;
- final-segment upload and acknowledgment;
- completion and deletion responses.

Infer TypeScript types from Zod and validate unknown input at boundaries. Generate OpenAPI only after the subset is accepted; never hand-maintain competing snapshots. Provider EventStream models stay inside `packages/stream-client`.

Recorded upload, summaries, exports, raw audio, and provider wire schemas are not Phase 1 contracts.
