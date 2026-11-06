# Phase 1 End-to-End Acceptance

Status: plan only; no deployed Option A journey has run.

After explicit environment and cost approval, verify:

```text
Cognito sign-in
→ create session
→ API-signed URL
→ direct browser WebSocket to Transcribe
→ partial/final captions
→ acknowledged final saves
→ complete
→ DynamoDB-backed history
→ delete and deny reread
```

Run a short smoke first. The MVP acceptance then includes one bounded one-hour live session, at least one forced reconnect/new epoch, two-user isolation, duplicate upload, rejected/expired signing, and privacy-safe logs. Record saved live text as client supplied.

Recorded files, S3 exports, summaries, load tests, and production readiness are not Phase 1 acceptance criteria.
