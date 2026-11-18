# ADR-012: Continuous Transcript Presentation and Pause Semantics

Status: Proposed for affected-owner review  
Proposed: 2026-11-18  
Owners: Persons 1–4

## Context

The current frontend renders provider results as a timeline of short caption cards. That display is difficult to read during a session and incorrectly makes implementation details—result boundaries, source labels, timestamps, and save phases—the dominant user experience.

The product needs a focused live workflow:

1. Select **Microphone**, **System audio**, or both.
2. Start transcription.
3. Read one continuously formatted transcript document.
4. Pause and resume without creating a second application session.
5. Finish the session and reopen the same acknowledged text from history.

Amazon Transcribe results and DynamoDB records must remain independently addressable for idempotency and acknowledgment even though the UI presents them as one document.

## Proposed decision

### Durable backend representation

The backend stores validated final segments, not a mutable preformatted transcript blob. Each segment remains identified by:

- `sessionId` from the authenticated route;
- `streamEpoch` authorized by the API;
- provider `resultId`;
- `startMs` and `endMs`;
- bounded non-empty `text`;
- `client-uploaded` provenance.

The conditional key `(sessionId, streamEpoch, resultId)` provides idempotency. Repeating an identical upload acknowledges the existing segment. Reusing the key with different content returns `STATE_CONFLICT`.

History returns acknowledged segments ordered by `streamEpoch`, `startMs`, and a stable tie-breaker. The browser performs light presentation formatting: whitespace cleanup, punctuation spacing, and paragraph boundaries. The formatter must not summarize, paraphrase, or silently change recognized wording.

### Continuous document presentation

All partial and final results observed during one active capture period appear in a single writing block. Provider result boundaries and audio-source boundaries do not create visible cards or paragraphs.

Partials are inline, visually distinct, and replace earlier revisions with the same result ID. Final text replaces its partial revision and remains in document order. Saved state is displayed at document level without claiming durability until the API acknowledges every relevant final.

### Pause and resume

Pause is browser-local transport state, not a new durable application-session state and not a new API route.

On pause, the browser:

1. retains the live browser-authorized media tracks and AudioWorklet clock;
2. keeps the current provider connection open and replaces captured PCM chunks with equal-duration PCM silence;
3. waits for observed final uploads to settle;
4. keeps the application session in `STREAMING`;
5. retains the displayed document.

On resume, the browser removes the silence gate and continues real PCM on the same provider connection and `streamEpoch`. It does not call `getDisplayMedia`, request another signed URL, open another WebSocket, or insert a provider-epoch boundary. A fresh URL and monotonically increasing `streamEpoch` are reserved for recovery after an unexpected provider disconnect.

Finish is distinct from pause. Finish settles observed finals, calls `POST /v1/sessions/{sessionId}/complete`, and releases all retained media tracks. A completed session cannot resume without a reviewed lifecycle change.

### Audio-source terminology

User-facing source names are **Microphone** and **System audio**. “Meeting audio,” “computer audio,” and inferred speaker identity are not separate product sources.

When both sources are enabled, the browser may use an approved two-channel Transcribe stream, but the transcript remains one ordered document. Channel information is transport metadata and must not fragment the default reading experience.

## Backend responsibilities

- `POST /v1/sessions` creates the owned logical session.
- `POST /v1/sessions/{id}/stream-url` verifies ownership/state and allocates a fresh epoch for start or resume.
- `POST /v1/sessions/{id}/segments` validates, conditionally stores, and acknowledges final segments.
- `POST /v1/sessions/{id}/complete` closes the session only after the client settles observed uploads.
- `GET /v1/sessions/{id}` returns acknowledged finals in deterministic document order.
- `DELETE /v1/sessions/{id}` removes the owned session and its segments and denies later reads.

The API never receives continuous audio and never logs transcript text, signed URLs, JWTs, or personal data.

## Required tests

- Multiple finals in one epoch render as one writing block.
- Partial revisions replace each other and never overwrite a final.
- Pause sends correctly sized silence without stopping capture or transport.
- Resume restores real PCM on the existing epoch without another capability request.
- Duplicate final upload is acknowledged once; conflicting reuse is rejected.
- Completion waits for observed uploads and prevents another stream allocation.
- History contains only acknowledged finals in deterministic order.
- A second user cannot sign, save, read, complete, or delete the session.

## Consequences

- The readable document and durable storage model are separated cleanly.
- Formatting can evolve without rewriting DynamoDB records.
- User pause remains within one epoch; unexpected reconnect uses the existing epoch model rather than introducing parallel session or `PAUSED` database states.
- The frontend needs an explicit Finish action once completion and segment-save handlers are integrated.
- Backend implementation must wait for affected-owner approval of this ADR and the shared Zod segment/session contract.

