# Project Direction — Option A Phase 1

Status: active architecture and MVP charter. Detailed production, retention, recorded-upload, and derived-feature decisions remain `PROPOSED` or `TBD`.

## Phase 1 mission

Build one integrated authenticated live speech-to-text MVP. The browser captures microphone audio and connects directly to Amazon Transcribe Streaming. Users see live captions, acknowledged final text is saved to their account, and they can list, reopen, and delete saved transcripts.

The first integrated release must demonstrate this path:

1. Sign in with Cognito.
2. Create an owned application session through the HTTPS API.
3. Request a short-lived, session-authorized Transcribe WebSocket URL.
4. Capture and convert browser audio to mono 16 kHz signed 16-bit PCM.
5. Stream Amazon EventStream audio directly from the browser to Transcribe and render partial/final results.
6. Upload final results through the authenticated API and show saved status only after acknowledgment.
7. Stop and complete the session, then reopen the acknowledged transcript from history.
8. Delete the owned session and deny subsequent reads.

The target user journey is at least one hour of live transcription. A logical application session may contain multiple provider stream epochs after reconnects; acknowledged final segments remain attached to the same application session.

## Phase 1 boundaries

- API Gateway/Lambda carry control traffic and saved final text only. Continuous audio never traverses the application backend.
- The browser owns capture, resampling, Amazon EventStream framing/decoding, bounded buffering, stop, and reconnect behavior.
- Lambda signs with its runtime IAM role. The browser receives a short-lived presigned URL, never a secret access key or derived signing key.
- Partial results are ephemeral. Final text becomes durable only after the API acknowledges it.
- Saved live text has `client-uploaded` provenance because the server cannot observe the provider-to-browser result path.
- Cognito establishes identity. Every API operation derives the owner from validated claims and verifies session ownership in DynamoDB.
- DynamoDB is the Phase 1 durable store for sessions and final segments.
- Normal development and tests use fakes. Real AWS integration and the one-hour run require an approved account, Region, and cost bound.

## Deferred until after the integrated MVP

- Recorded-file upload and batch transcription.
- S3 transcript exports and download artifacts.
- Summaries, action items, translations, keywords, or other derived features.
- Shared rooms, speaker identity, raw-audio archives, server-verified live transcript provenance, and production SLOs.
- Production-scale admission, multi-environment deployment, advanced retention/backups, and load testing.

Deferred features must not create placeholder runtime paths or competing contracts in Phase 1. They require a reviewed ADR when scheduled.

## Team outcome

Person 1 owns the browser application and audio capture. Person 2 owns authenticated session/signing/save APIs. Person 3 owns the direct browser Transcribe client. Person 4 owns DynamoDB integration and the minimum approved AWS setup. Person 5 owns contract integration, end-to-end verification, privacy checks, and release evidence. With four contributors, Persons 1 and 3 may be combined.

The Phase 1 handoffs and minimum acceptance checks are defined in [INTEGRATION_PLAN.md](INTEGRATION_PLAN.md).
