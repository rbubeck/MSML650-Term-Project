# Authenticated Control API — Person 2 Phase 1

Status: `POST /v1/sessions/{sessionId}/stream-url`, the Transcribe signer, and an explicitly guarded single-session smoke-test Lambda entry point are implemented and fake-tested. A manual `us-east-2` development deployment issued a capability that Amazon Transcribe accepted during a real browser stream on 2026-11-07. No other application route exists. See [Implementation status](#implementation-status).

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

---

## Implementation status

| Deliverable | State |
|---|---|
| Owner/state-checked Transcribe URL issuance | **Implemented, fake-tested, development-smoke-verified.** Real Cognito access-token claims reached Lambda through API Gateway and the returned URL opened Transcribe. |
| Guarded first-stream Lambda entry point | **Implemented, fake-tested, manually deployed for development smoke.** Uses non-durable single-session state and is not an MVP repository. |
| Create, list, read, rename sessions | Not started. |
| Final-segment saves and acknowledgments | Not started. |
| Session completion | Not started. |
| Deletion | Not started. |
| DynamoDB repository adapter | Not started (Person 4). |
| Production Lambda entry point, rate limiter and logger | Not started. The smoke-test entry point is intentionally temporary. |

"Fake-tested" means the normal automated tests use fake identity, repository, clock, signer, limiter and logger, plus the real signer with synthetic credentials; they make no AWS or network calls. Separately, the dated manual smoke established runtime compatibility for one development configuration. Repository commands still do not create or modify AWS resources.

## How the stream-URL handler works

```text
API Gateway (JWT verified) → handler
  1. identity     owner = `sub` claim; ID tokens rejected              → UNAUTHORIZED
  2. validate     session ID from the path, empty or `{}` body        → INVALID_INPUT
  3. admit        injected rate limiter                               → RATE_LIMITED / CAPACITY_LIMIT
  4. allocate     ONE atomic repository call: owner + state check,
                  next stream epoch                                   → NOT_FOUND / STATE_CONFLICT
  5. language     session language must be on the allowed list        → INVALID_INPUT
  6. sign         presigned wss URL via the injected signer           → SIGNING_FAILED
  7. validate     our own response with streamUrlResponseSchema       → SIGNING_FAILED
  8. respond      200 + Cache-Control: no-store                       (any throw → INTERNAL_ERROR)
```

Every response, success or error, carries `Cache-Control: no-store`. Errors use the shared envelope with fixed safe messages. The signed URL appears only in the 200 body. It never appears in an error body, a log, or a validation message. A foreign session and a missing session produce identical responses.

## Layout

```text
src/
├── index.ts          public exports
├── config.ts         validateStreamUrlConfig: Region, expiry (default 60, at most 300), allowed languages
├── ports.ts          injectable interfaces: Clock, SessionRepository, TranscribeUrlSigner, RateLimiter, Logger
├── http/             shared by every route
│   ├── events.ts     minimal API Gateway HTTP API event and result shapes
│   ├── identity.ts   owner from validated JWT claims
│   └── responses.ts  response helpers, placeholder status mapping, fixed safe messages
├── routes/           one file per route
│   └── stream-url.ts createStreamUrlHandler(deps): POST /v1/sessions/{sessionId}/stream-url
├── aws/              code that talks to AWS (focus of real-AWS verification and IAM review)
│   └── transcribe-signer.ts  createTranscribeUrlSigner(credentials), lambdaRuntimeCredentials()
├── integration/
│   └── single-session-repository.ts  guarded, non-durable first-stream test adapter
├── smoke-test-lambda.ts  API Gateway entry point for the first real stream test only
└── testing/          test fakes; excluded from the build, never import from production code
    └── fakes.ts
```

Tests sit beside the code they test as `*.test.ts`. Where new code goes:

- **A new route:** a file in `routes/` with its test beside it. Reuse `http/` for identity, parsing and responses.
- **A new interface:** add it to `ports.ts`, and add its fake to `testing/fakes.ts`.
- **Code that calls an AWS service:** `aws/`. Person 4's DynamoDB adapter may live here or in `backend/persistence/`; agree with Person 4.
- **Avoid** splitting `ports.ts` into one file per interface, or adding a service layer between routes and ports, until the code is large enough to need it.

## Interfaces and who supplies them

| Interface | Production implementation | Owner |
|---|---|---|
| `SessionRepository` | DynamoDB adapter | Person 4 |
| `TranscribeUrlSigner` | `createTranscribeUrlSigner(lambdaRuntimeCredentials())` | Person 2 (exists) |
| `RateLimiter` | Real per-user limits | Undecided (decision queue blocker 3) |
| `Logger` | Allow-listed structured logger | Person 2 / Person 5, not written |
| `Clock` | `{ now: () => new Date() }` | Trivial |

The deliverable above also lists ID generation. The stream-URL route creates no IDs, so that interface comes with the create-session handler.

### Contract for the repository adapter (Person 4)

`allocateStreamEpoch(ownerId, sessionId)` must be **one atomic conditional write**, not a read followed by a write:

- Condition: the session exists, `ownerId` owns it, and its state is `CREATED` or `STREAMING`.
- On success: increment the stream epoch, set the state to `STREAMING`, and return `{ status: 'ALLOCATED', streamEpoch, languageCode }`.
- A missing session and a session owned by someone else must both return `NOT_FOUND`. If the conditional write fails, decide the result without revealing a foreign session: missing or not owned is `NOT_FOUND`; owned but in another state is `STATE_CONFLICT`.
- Two concurrent calls must never return the same epoch.

`FakeSessionRepository` in `src/testing/fakes.ts` implements this behavior and can serve as the shared deterministic fake.

## First live-stream smoke-test runtime

`src/smoke-test-lambda.ts` composes the existing handler and real signer with one configured, in-memory session. Build its self-contained Lambda file with:

```bash
npm run bundle:smoke --workspace @live-transcription/api
```

The generated file is `backend/api/dist/smoke/index.mjs`. Put that file at the root of the Lambda upload ZIP and configure the Lambda handler as:

```text
index.handler
```

The bundle contains the runtime dependencies but no credentials or environment values. ZIP creation and AWS deployment remain explicit, approval-gated operations; generated `dist/` and `*.zip` files are ignored by Git.

Required Lambda environment:

```dotenv
ENABLE_SMOKE_TEST_SESSION_REPOSITORY=true
SMOKE_TEST_SESSION_ID=an-opaque-test-session-id
SMOKE_TEST_OWNER_ID=the-cognito-access-token-sub
SMOKE_TEST_LANGUAGE_CODE=en-US
STREAM_URL_EXPIRY_SECONDS=60
```

Lambda supplies `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_SESSION_TOKEN` from the execution role. Do not define, copy, or expose those values yourself. The role needs `transcribe:StartStreamTranscriptionWebSocket`; API Gateway must attach validated Cognito access-token claims.

This runtime is deliberately narrow:

- it accepts exactly one session and owner;
- it implements only the stream-URL route;
- its epoch counter exists only inside one warm Lambda process;
- cold starts or parallel Lambda environments can reset or duplicate epochs; and
- it must be replaced by Person 4's authoritative repository before durable MVP or reconnect claims.

The explicit feature flag prevents accidental startup without acknowledging those limitations. It is sufficient only for a controlled, single-user, short live-caption test.

## What Person 3 can consume

The response shape is `streamUrlResponseSchema` in `@live-transcription/contracts`: `sessionId`, `streamEpoch`, `url`, `expiresAt`, `languageCode`, `mediaEncoding` (`pcm`), `sampleRateHz` (16000), `channels` (1). Expected behavior:

- A new epoch and a freshly signed URL on every request, including reconnects. Epochs only increase, and they may skip numbers (deviation 3).
- `expiresAt` is a connection-start expiry (60 seconds by default), not a stream-duration limit. Request a fresh URL on every reconnect.
- Errors use `{ error: { code, message } }`. The HTTP statuses are placeholders (deviation 5), so branch on `code`, not on the status.
- A development smoke endpoint exists outside the repository. Its base URL and resource identifiers are environment-specific and must not be committed; consumers build against the schema and configure the URL locally.

## Commands

From the repository root:

```bash
npm ci
npm run build --workspace @live-transcription/contracts   # required before the tests; see deviation 11
npm run typecheck --workspace @live-transcription/api
npm run test --workspace @live-transcription/api          # or: npx vitest run backend/api
npm run build --workspace @live-transcription/api         # also rebuilds contracts first
```

Root `npm run check` stops at `format:check` in a Windows checkout with CRLF line endings; see deviation 18.

## AWS smoke evidence and remaining gaps

The 2026-11-07 `us-east-2` development smoke verified, for one invocation and browser stream, that API Gateway passed real Cognito access-token claims (including `token_use`), Lambda runtime-role credentials produced a usable URL, the host-only signed-header choice and observed session-token encoding were accepted, the IAM action authorized connection, and Transcribe accepted `media-encoding=pcm` at 16 kHz mono. No URL, token, owner ID, account ID, API ID, or transcript is recorded here.

Still unverified: URL connection attempts near/after the 60-second expiry; URL construction across a wider sample of temporary session-token characters; cold starts and parallel Lambda environments; deliberate reconnect/fresh-epoch behavior; rate/capacity enforcement; multi-user isolation; the one-hour run; and production monitoring/cleanup. The automated tests remain fake-backed and cannot replace those checks.

## Deviations and assumptions

Each item departs from, or fills a gap in, an existing rule or document. The reason is given so a future agent can decide whether to keep it.

1. **Epoch allocation lives inside `SessionRepository`, not in a separate interface.** The task description listed "stream-epoch allocation" as its own interface. As two calls, "check the state" and "allocate the epoch" can race, letting two requests both pass the check. One atomic call avoids that. A separate allocator would still have to run in the same transaction.
2. **Issuing a URL moves `CREATED` to `STREAMING`.** `API_CONTRACTS.md` only says "authorize a new stream epoch". The move happens in the same atomic step as the allocation, so a session shows `STREAMING` after its first URL even if the browser never connects. An alternative is to move on the first accepted segment upload. Undecided.
3. **Epochs can be skipped.** The epoch is allocated before the language check and before signing, because the session language is only known after the repository call. A signer failure or unsupported language therefore consumes an epoch. Epochs are monotonic, not contiguous; consumers (stale-epoch rules, UI) must not assume no gaps.
4. **`token_use` must be exactly `access`.** Missing values and ID tokens are rejected. The development smoke observed the expected real Cognito/API Gateway access-token claim shape; keep the backend check.
5. **HTTP status mapping is a placeholder** in `src/http/responses.ts`: 401, 404, 400, 409, 429, 503 for `CAPACITY_LIMIT`, 502 for `SIGNING_FAILED`, 500. The contract leaves the mapping undecided. It is a single table.
6. **An unsupported session language returns `INVALID_INPUT` (400).** It is arguably a server configuration problem rather than a client one; alternatives are `STATE_CONFLICT` or `INTERNAL_ERROR`. The approved language list is undecided (`allowedLanguageCodes` is configuration).
7. **The rate limiter and logger have silent defaults.** The default limiter allows everything and the default logger records nothing. `RATE_LIMITED` and `CAPACITY_LIMIT` come only from an injected limiter, and no real limiter exists because the limits are undecided (decision queue blocker 3). A production logger still has to be written and must accept only allow-listed event names and error codes, as `Logger` enforces.
8. **`expiresAt` is rounded down to whole seconds,** so it is never later than the real expiry. The response carries `expiresAt` only, as the spec lists, so a client with a skewed clock can misjudge it; clients should treat a rejected connection as "request a new URL".
9. **New dependencies in this workspace:** `@smithy/signature-v4`, `@smithy/protocol-http` and `@aws-crypto/sha256-js`, installed with `--ignore-scripts`. They are AWS-maintained and are what the AWS SDK itself uses. Signing by hand is easy to get subtly wrong, and AWS's guide recommends SDKs over hand-rolling. No ADR was written: the standards require one for overlapping libraries, and none overlap. `npm audit` for this workspace reports 0 vulnerabilities; the repository's 10 existing moderate findings are in the lint tooling, untouched here.
10. **Hand-written API Gateway event types** instead of `@types/aws-lambda`, to avoid another dependency. They cover only the fields the handler reads.
11. **Contracts resolve differently in typecheck and tests.** Typecheck maps `@live-transcription/contracts` to its source with `paths`, as the frontend does. Vitest resolves it through `node_modules` to the built `dist/`, so contracts must be built before testing (as the frontend's `pcm-worklet` test already requires). A stale `dist/` can make the two disagree. The `build` script rebuilds contracts first because the root workspace order builds `backend/api` before `packages/contracts`. Two cleaner fixes would edit shared files and were not made: a Vitest alias to the contracts source in the root config, or TypeScript project references.
12. **Test fakes live in `src/testing/`.** They are not named `*.test.ts`, so `tsconfig.build.json` excludes the folder explicitly.
13. **Only a smoke-test entry point exists.** `smoke-test-lambda.ts` is deployable for the first controlled stream but intentionally uses non-durable single-process state. The production entry point still needs Person 4's adapter and accepted Region/language configuration.
14. **Automated-test Region and language are synthetic.** Unit tests use `us-east-1` and `en-US`; the manual development smoke used `us-east-2` and `en-US`. That does not establish the final Region/language policy.
15. **IAM scope.** The AWS example grants `transcribe:StartStreamTranscriptionWebSocket` on `Resource: "*"`. Compensating controls are the owner check, short expiry, rate limits and monitoring; see `docs/security.md`.
16. **The `test` script runs the root Vitest config** filtered to this workspace (`vitest run --root ../.. backend/api`), because Vitest is configured once at the root.
17. **The signing time is read once per request** and also used for `expiresAt`, so the signature and the reported expiry agree.
18. **`npm run check` fails at its first step in this Windows checkout.** `format:check` flags files with CRLF line endings (`core.autocrlf=true`, while `.editorconfig` asks for LF). Run the steps separately: `npx prettier --check . --end-of-line auto`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. A `.gitattributes` with `* text=auto eol=lf` would fix it for everyone but changes every checkout, so it was not added.

## Next tasks

The first stream has succeeded. Next, preserve the smoke deployment only as a bounded development aid, replace the single-session repository with Person 4's authoritative adapter, and implement the remaining routes with fake-backed owner-isolation and failure tests before another AWS acceptance run.
