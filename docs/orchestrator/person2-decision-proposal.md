# Backend / Auth Decision Proposal (Person 2)

Status: `PROPOSED`. Nothing here is accepted until the team agrees and it is recorded in an ADR or the shared contracts. Aim: decide the items below so Persons 1, 3 and 4 can build against one contract. Related: [API_CONTRACTS.md](../../API_CONTRACTS.md), [decision-queue.md](decision-queue.md), [security.md](../security.md).

## A. Needed to start the first end-to-end slice

| # | Decision | Proposal | Sign-off |
|---|---|---|---|
| 1 | AWS account, Region, budget, who creates shared resources | One shared account in `us-east-1`. Budgets alert with an action (an alert alone is not a cap). One named person creates shared resources; everyone else asks first. | All, P4 leads |
| 2 | Cognito setup | One shared User Pool. Public app client, no secret. SRP and refresh-token flows on. Email verification by code, no MFA. The API accepts the **access token**. Owner key is `sub`. | P1, P2 |
| 3 | API type and CORS | API Gateway HTTP API with a Cognito JWT authorizer. Allowed origins `http://localhost:5173` and `http://127.0.0.1:5173`. Allowed headers `Authorization`, `Content-Type`, and the idempotency header. | P1, P2, P4 |
| 4 | Session states | `created`, `active`, `ended`, `completed`, `failed`, `deleted`. The API owns every transition; the browser only requests them. | P1, P2, P3, P4 |
| 5 | Idempotency and segment identity | One `Idempotency-Key` header on create and segment upload. A segment is identified by `sessionId` + `streamEpoch` + `providerResultId`. Same key and same body returns the original response. Same key and a different body returns 409. | P1, P2, P3, P4 |
| 6 | Stream-URL policy | Expiry 60 s or less (AWS maximum is 300 s). Fixed parameters only: PCM, 16 kHz, approved languages. `streamEpoch` increments on each issuance. Per-user rate limit, one active session per user. | P2, P3, P4 |
| 7 | Error codes and statuses | 401 `UNAUTHORIZED`, 404 `NOT_FOUND`, 400 `INVALID_INPUT`, 409 `STATE_CONFLICT` and `EXPORT_NOT_READY`, 429 `RATE_LIMITED` and `CAPACITY_LIMIT`, 502 `SIGNING_FAILED`, 500 `INTERNAL_ERROR`. Body shape stays `{ "error": { "code", "message" } }`. | P1, P2 |
| 8 | Zod schema freeze (smallest subset) | Freeze first: create-session, session, error, segment-upload. List, rename and export schemas follow. | P1, P2, P3, P4 |

## B. Needed soon, not blocking the first slice

| # | Decision | Proposal |
|---|---|---|
| 9 | Upload bounds | Small batch size, text length, segments per session and retry window, written into the schema and enforced in Lambda. |
| 10 | DynamoDB layout (P4 leads, P2 reviews) | Partition on owner `sub`, sort on session or segment. All writes conditional on ownership. |
| 11 | Export and download | After an owner check, the API returns a short-lived presigned S3 GET URL. Browsers get no general S3 access. |
| 12 | Deletion and retention | Deny reads immediately, remove data in the background. Pick a retention period and the consent wording. |
| 13 | Scope: file upload and analysis | Decide whether batch audio upload and a post-session analysis step (e.g. Comprehend) are in or out. The frontend currently shows upload as "Planned". |
| 14 | Deployment method | The repo is Console-first with no CDK. Agree how Lambda code is deployed and by whom. |
| 15 | Logging and monitoring | Allow-listed log events only. Never log URLs, tokens or transcript text. One alarm on signing volume. |

## Open questions for the team
- Is `us-east-1` acceptable for data residency and Transcribe availability?
- Who owns the shared AWS account and approves spend?
- Is file upload in scope for the final demo?

## What Person 2 will do next
Write a non-secret Cognito config note (Region, flows, token lifetimes, observed claims), draft the schemas for item 8, and scaffold the handler interfaces with fakes and owner-isolation tests. Shared AWS resources will not be created until item 1 is agreed.
