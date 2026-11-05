# Project Direction — Option A

Status: active architecture charter; feature contracts and deployment settings remain `PROPOSED` or `TBD`.

## Mission

Build one deployable, measurable multi-user live speech-to-text application in which authenticated browsers connect **directly** to Amazon Transcribe Streaming. Users see live captions and can manage their own saved transcripts. API Gateway/Lambda provide session management, short-lived presigned WebSocket URLs, authenticated final-result uploads, history, exports, and deletion. DynamoDB stores session metadata and acknowledged finals; private S3 stores export artifacts.

This repo currently defines the team structure and boundaries. It does not implement the application or claim a deployed resource.

## User journey

1. Sign in through Cognito and create an owned session through the HTTPS API.
2. Request a session-scoped signing decision from the API; Lambda returns an approved short-lived Transcribe WebSocket URL without exposing IAM credentials.
3. Capture audio in the browser, convert to mono 16 kHz PCM, send Amazon EventStream audio frames directly to Transcribe, and render partial/final results.
4. Upload final results through the authenticated API; show saved status only after durable acknowledgment. Saved text has **client-supplied provenance** because the server cannot see the provider-to-browser result path.
5. Stop, complete/export acknowledged finals to private S3, list/read/download only owned content, and delete according to approved retention policy.

## Boundaries

- Continuous audio does not traverse Lambda, API Gateway, DynamoDB, or S3. Raw microphone audio is not stored by default.
- The browser owns provider protocol handling and connection recovery. The API owns authorization and application persistence. DynamoDB is canonical for session state and acknowledged saves.
- Partials are transient. Client-uploaded finals may be lost until the API acknowledges them; no stronger durability claim is permitted.
- Presigned URLs are bearer capabilities, not one-time tickets. Their replay/cost exposure must be managed through expiry, rate/admission controls, quotas, and monitoring.
- No speaker identity, shared rooms, raw-audio archive, server-verified transcript provenance, or production SLO is part of the initial architecture.

## Team and release evidence

Person 1 owns UI/audio capture; Person 2 owns Cognito and control/signing API; Person 3 owns the browser direct-stream client; Person 4 owns DynamoDB, S3, Lambda integration, and Console-first AWS setup; Person 5 owns evaluation, observability, and release quality. A four-person team may combine Persons 1 and 3.

Release claims require an integrated authenticated browser-to-Transcribe demonstration, final upload/history/export/delete, two-user ownership isolation, privacy-safe logs, failure behavior, and named Region/browser/dataset/cost evidence. Mocks and historical server-side Transcribe experiments are preparation, not release evidence.

## Open decisions

The team must accept consent, retention/deletion, Region/data residency, session lifecycle, idempotency and final identity, signed URL policy, account quotas/admission, browser support, budget, environment layout, and deployment authorization before implementing coupled behavior or creating AWS resources. Track them in [the decision queue](docs/orchestrator/decision-queue.md).
