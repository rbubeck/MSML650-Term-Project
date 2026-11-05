# Option A Integration Plan

Status: team preparation; no Option A application slice or AWS deployment exists.

## Sequence and owners

1. **Decision freeze — orchestrator and all owners:** accept the Option A migration, resolve signing capability/lifetime, client-upload provenance, session states, final identity, retention/consent, Region and budget. Freeze the smallest Zod HTTP subset before multiple owners build against it.
2. **Contracts — Persons 2 and 3 with Persons 1/4 review:** define shared session/error/final-upload schemas and browser client interface. Generate OpenAPI only from accepted schemas; keep provider EventStream types inside the stream client.
3. **Local slice — Persons 1–4:** Person 1 builds capture/UI; Person 3 builds direct Transcribe protocol client with fake WebSocket and EventStream fixtures; Person 2 builds fake-backed auth/signing/session handlers; Person 4 builds fake-backed repositories/export behavior. No local test requires AWS.
4. **Quality — Person 5:** validate PCM conversion, protocol framing/decoding, upload idempotency, ownership isolation, privacy-safe logs, partial/final display, interruption, and persistence failures.
5. **Authorized AWS slice — Person 4 coordinates:** use the Console-first runbook after explicit approval, record resource inventory and costs, then demonstrate one signed browser stream, saved finals, export, and deletion in the approved Region/account.

## Handoffs

| Producer | Consumer | Reviewed artifact |
|---|---|---|
| Person 2 signing/API | Persons 1 and 3 | Signed URL response, expiry/error contract, JWT expectations |
| Person 3 direct client | Person 1 | Capture input, captions, save callbacks, connection/failure state |
| Person 2 session API | Person 4 | Repository interfaces, conditional update and owner lookup needs |
| Person 4 persistence | Persons 2 and 5 | Save/export/delete behavior and deterministic test fakes |
| Person 5 quality | All owners | Fixtures, metric definitions, acceptance evidence |

With four contributors, one person may cover Persons 1 and 3. Cross-owner review remains required.

## Acceptance checkpoints

- **Repository:** all active guides and CI point to Option A; root `npm run check` passes.
- **Local contracts:** sample PCM produces decoded fake partial/final events; an authenticated fake API durably acknowledges only final uploads and rejects cross-user access. This is a future implementation checkpoint, not a current claim.
- **AWS speech:** approved browser capture connects using a Lambda-presigned URL and receives real Transcribe partial/final events. Record browser, Region, parameters, time, and cost.
- **Saved transcript:** final upload → DynamoDB history → durable private S3 export → authorized download → deletion. Evidence must state that saved content was client supplied.
- **Failure/isolation:** two identities, reconnect/interruption, rejected signing, upload retry/duplicate, export failure, and privacy-safe logs.

No paid test or resource mutation is part of repository restructuring. Bounded load tests need an approved scope and budget.
