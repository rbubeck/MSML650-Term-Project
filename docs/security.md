# Phase 1 Security and Privacy

Status: required MVP controls; deployment and production policy remain pending.

## Trust boundaries

1. Browser ↔ Cognito for identity.
2. Browser ↔ API Gateway/Lambda for authenticated sessions, signing, saves, history, and deletion.
3. Browser ↔ Amazon Transcribe for direct live audio/results.
4. Lambda ↔ DynamoDB for owner-checked Phase 1 persistence.

## Required controls

- API Gateway validates the Cognito access token. Lambda derives `sub` and verifies every session operation against DynamoDB ownership/state.
- Lambda runtime credentials sign only approved Transcribe Region/language/PCM parameters. No static or derived signing secret enters the frontend or repository.
- Signed URL responses use HTTPS and `Cache-Control: no-store`. URLs are replayable bearer capabilities until expiry; never log, persist, analyze, or place them in browser history.
- Start with a proposed 60-second connection-start expiry, require a fresh URL for reconnect, and rate-limit issuance per owner/session.
- Enforce bounded language, text, segment batch, request rate, session state, and epoch values. Browser validation is UX, not authorization.
- Render transcript text as untrusted text. Never store partials or raw live audio.
- Logs use allow-listed event names, bounded error codes, timing, and counts. Never log JWTs, signed URLs, audio, transcript text, personal data, or raw provider error bodies. Never use user/session IDs as metric dimensions.
- Deletion immediately denies reads and removes Phase 1 records with safe retry behavior.

## Minimum verification

Test two-user isolation for create/list/read/rename/sign/save/complete/delete; expired/rejected signing; malformed/oversized input; duplicate/conflicting final identity; stale epoch; XSS-safe rendering; content-free logs; and denial after deletion.

Recorded-audio privacy, S3 controls, summaries/model data sharing, formal retention/backups, and regulated-data scope require later review and must not be inferred from Phase 1.
