# Option A Security and Privacy

Status: target controls; implementation, deployment, retention, and consent decisions are pending.

## Trust boundaries

1. Browser ↔ Cognito: identity and tokens.
2. Browser ↔ API Gateway/Lambda: authenticated session, signing, upload, history, export, deletion requests.
3. Browser ↔ Amazon Transcribe: direct WSS; the presigned URL grants a limited capability until expiry. The application API does not observe provider results on this path.
4. Lambda ↔ DynamoDB/S3: owner-checked persistence and export. Client-uploaded text is untrusted content.

## Required controls

- API Gateway validates the Cognito access token. Lambda derives `sub` from validated claims and checks every session operation against DynamoDB ownership. Never use client `userId` for authorization.
- Lambda's execution role alone signs direct Transcribe URLs with the minimum required `transcribe:StartStreamTranscriptionWebSocket` permission. If AWS requires `Resource: *`, document and constrain what is feasible through role trust, API authorization, limits, and monitoring. No static AWS keys in frontend or repo.
- Return signed URLs over HTTPS with `Cache-Control: no-store`; never log URLs, query strings, tokens, raw audio, or transcript text. Expiry is at most AWS's 300-second presigning maximum and should be shorter if approved. Treat URL replay and uncontrolled provider connection attempts as explicit cost risks.
- Bound signing requests and final uploads per user/session; enforce allowed language/format/Region, session state, text size, segment count, and concurrency where feasible. Browser-side checks improve UX but do not enforce security.
- Keep S3 private with Block Public Access and TLS-only access; encrypt DynamoDB/S3 at rest. Use short-lived owner-authorized downloads. Do not expose direct DynamoDB credentials or general S3 write permission to browsers.
- A saved transcript is client supplied. Sanitize/render it as untrusted text and do not use it as proof of what was spoken. Partials remain in memory only.
- Deletion must deny application reads immediately, then retry physical removal. Retention, backups/PITR, logs, age/consent, jurisdiction, and regulated-data scope are `TBD` for human review.
- Logs contain allow-listed event names, bounded error codes, timing and counts. Never put `sessionId`, `userId`, URL, transcript, or raw error messages in metric dimensions.

## Security verification

Test two-user isolation across list, read, URL signing, uploads, rename, complete, download, and delete. Test expired/misused URL handling where the provider permits, duplicate/conflicting uploads, oversized input, XSS-safe rendering, no secret/content logging, S3 public-access controls, and deletion denial. Real AWS behavior requires an authorized environment; mocks are not evidence of IAM or provider behavior.
