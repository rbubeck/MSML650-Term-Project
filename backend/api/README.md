# Authenticated Control API — Person 2

Status: workspace boundary only; no Lambda handlers or deployed API exist.

Own Cognito/API Gateway integration, sessions, direct-stream URL signing, final uploads, history, rename, completion, download, and deletion. Derive owner from validated Cognito claims. The signer uses Lambda runtime IAM credentials and returns a short-lived Transcribe WebSocket URL with `Cache-Control: no-store`; it never returns credentials or persists the URL. Verify session ownership and state before signing or storing client-supplied final text.

First tasks: agree Zod HTTP/session/error/upload schemas with Persons 1/3/4; define injectable identity, signer, repository, clock and idempotency boundaries; implement fake-backed owner-isolation and duplicate/failure tests. Do not treat uploaded text as provider verified or build an audio proxy.
