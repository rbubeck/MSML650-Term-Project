# Authenticated Control API — Person 2 Phase 1

Status: workspace boundary only; no Lambda handlers or deployed API exist.

## Initial deliverable

Implement injectable, Lambda-compatible handlers for:

- create/list/read/rename owned sessions;
- owner/state-checked direct Transcribe URL issuance;
- idempotent final-segment saves and acknowledgments;
- idempotent session completion; and
- owner-checked deletion.

Derive the owner from validated Cognito claims. Validate requests/responses with shared Zod schemas. Inject identity, signer, repository, clock, and ID generation so local tests use fakes.

The signer uses Lambda runtime IAM credentials and returns a short-lived WebSocket URL with `Cache-Control: no-store`. It never returns secret access keys, persists the URL, or proxies audio. The initial proposed connection-start expiry is 60 seconds pending integration verification.

Treat uploaded final text and provider metadata as untrusted `client-uploaded` content. Verify session ownership and lifecycle state before signing, saving, completing, renaming, or deleting.

## Phase 1 handoff

Co-own the Zod contract PR with Person 3 and review with Persons 1/4. Define narrow repository methods with Person 4 and use the same deterministic fake. Give Person 5 safe error cases for cross-user access, duplicate/conflicting upload, signing rejection, stale epoch, and state conflict.

## Later

Recorded-file/batch endpoints, export/download jobs, summaries, arbitrary profiles, and production-scale admission are not initial assignments.
