# Frontend — Person 1 Phase 1

Status: React UI, AudioWorklet capture, direct-stream adapter, and a clearly labeled local provider simulation exist. AWS signing, final uploads, persistence, and deployed integration remain pending.

## Initial deliverable

First tasks: select/scaffold the approved frontend tool, build a fake-backed session UI, implement AudioWorklet mono conversion and 44.1/48-to-16 kHz resampling, then integrate Person 3's client interface. Show partial/final-observed/save-acknowledged states separately. Never persist raw audio or put signed URLs in history, logs, or analytics. Review browser support and consent text before real microphone integration.




> **For the MSML 650 team | Person 1 (frontend) | Option A architecture**  
> **Purpose:** Connect the existing React frontend to the team-owned AWS services with minimal UI changes. This is an integration *runbook*, not evidence of a deployed system.  
> **Keep `frontend/README.md` unchanged.** It is the team's original ownership/requirements document; this guide is supplementary.

## 1. Read this first: the agreed architecture

The active design in the repository is **Option A (ADR-010)**:

```text
                           Amazon Cognito
                                 |
                          user signs in
                                 |
                  CloudScribe React frontend
                    /                    \
        authenticated HTTPS         browser audio: 16 kHz mono PCM
                  |                       |
           API Gateway / Lambda     @live-transcription/stream-client
                  |                       |
        session APIs + URL signer    AWS Transcribe Streaming
                  |               (direct presigned WebSocket)
             DynamoDB                   |
       owned sessions/saved finals  partial + final text returns
                  |                       |
          private S3 exports   final text POSTed to the session API
```

- **React never creates AWS signatures, encodes Amazon EventStream frames, or manages AWS credentials.** The shared `@live-transcription/stream-client` package owns the provider WebSocket and protocol. The Lambda signer owns creating the presigned URL.
- **The former 16-byte application-specific audio header is obsolete.** ADR-010 supersedes that portion of the older ADR-006. Retain the shared PCM target (mono, 16 kHz, signed 16-bit little-endian, 1,600 samples / 3,200 bytes per 100 ms). **Do not add the custom header** to Transcribe audio.
- DynamoDB holds authenticated, user-owned session metadata and **acknowledged final segments**; S3 holds **private completed transcript exports**. Raw microphone audio and partial captions are **not stored by default**.
- The API receives **client-uploaded text**. It cannot independently certify that each text segment came from Amazon Transcribe.
- **Audio-file batch upload is not part of the initial approved Option A API.** Its UI is a planned extension, not a connected AWS feature. Agree on an additional design before implementing it.

**Authoritative team references:** [`direction_option_a.md`](../direction_option_a.md), [`ARCHITECTURE.md`](../ARCHITECTURE.md), [`API_CONTRACTS.md`](../API_CONTRACTS.md), [`INTEGRATION_PLAN.md`](../INTEGRATION_PLAN.md), [`docs/adr/010-option-a-migration.md`](../docs/adr/010-option-a-migration.md), [`docs/orchestrator/decision-queue.md`](../docs/orchestrator/decision-queue.md), and [`frontend/README.md`](README.md). If any contract in this guide differs from an **accepted** shared schema or ADR, the accepted repository contract wins.

## 2. What exists today, and what does not

| Area | Frontend starting point | Still required for live AWS |
|---|---|---|
| Application | React/TypeScript/Vite dashboard, login screens, captions, mock history | Connect live data and verify accessible browser behavior |
| Authentication | `src/auth/cognito.ts`: AWS Amplify sign-up, confirmation, sign-in, sign-out, access-token retrieval | Cognito configuration; team-approved auth flow and API JWT authorizer |
| HTTP API | `src/services/teamApi.ts`: proposed `/v1` routes, bearer auth, HTTPS enforcement | Approved Zod schemas; deployed Lambda handlers; response parsing and UI wiring |
| Recording | `src/audio/microphone.ts` + `public/worklets/pcm-processor.js` | Approved-browser testing and consent review |
| Streaming | `DirectStreamAdapter` routes microphone PCM through Person 3's real client; mock mode uses a clearly labeled local fake provider | Accepted Zod stream-capability parser and real signed-URL browser test |
| Captions | `src/lib/viewModels.ts`: `partial`, `final-observed`, `saving`, `save-acknowledged`, `save-failed` | Map shared contract results into display states; real save acknowledgments |
| History/export | Mock-only UI and TXT sample download | Backend list/detail/rename/delete and authorized S3 export downloads |
| Uploaded audio files | Planned/disabled UI feature | Separate team-approved batch-upload architecture and endpoints |

**Important reality check:** Setting `VITE_APP_MODE=aws` **does not** turn all buttons into live AWS functions. At present it activates the Cognito path and a `GET /v1/sessions` connectivity check; real session, streaming, history and export handlers still need to be connected after the shared contracts are agreed. The API client deliberately uses `unknown` rather than inventing request/response schemas.

## 3. Prepare the repository and run the frontend

Run these commands **from the repository root**, on the dedicated `frontend` branch (not `main`). The team baseline is Node.js **24**, npm **11**, TypeScript **6**, and a single root npm workspace lockfile.

```powershell
cd "/cloned_directory"
git branch --show-current   # expect: frontend
git status
node -v
npm -v
npm install
npm run build --workspace @live-transcription/contracts
npm run dev --workspace @live-transcription/frontend
```

Open the local URL shown by Vite (typically `http://127.0.0.1:5173/`). The default configuration is **mock mode**, which does not use AWS. The worklet requires an allowed browser origin such as `localhost`, `127.0.0.1`, or HTTPS when deployed.

For validation from a **second terminal**:

```powershell
npx prettier --check frontend
npm run lint
npm run typecheck
npm test
npm run build
```

On a clean clone, run the contracts package build **before** `npm test` until the team finalizes monorepo build/test ordering; the package currently exports generated `dist/` files. The repository-wide `npm run check` also checks formatting of legacy team files: avoid unrelated formatting rewrites without agreement.

## 4. Integration owners and information needed at the meeting

| Owner | Provide to Person 1 | Confirm together |
|---|---|---|
| **Person 2 — Cognito / API** | Approved AWS Region; Cognito User Pool ID and **public app client ID**; HTTPS API Gateway base URL; JWT expectation; CORS origins | Which token is accepted; user signup/confirmation flow; stable errors; ownership/auth tests |
| **Person 3 — streaming client** | Reviewed package exports/API; fake stream test fixture; event type for partial, final, errors, disconnect and save callbacks | How PCM chunks are passed; when to request a signed URL; backpressure, cancellation, reconnect and epoch semantics |
| **Person 4 — persistence/infrastructure** | DynamoDB/S3-backed API behavior through Person 2, export readiness and download approach, deletion guarantees | Per-user authorization, idempotent saves, retention/consent, encryption, Region, budget |
| **Person 5 — evaluation** | Approved browser matrix and sample fixture expectations | 44.1/48 kHz resampling, silence/clipping, permissions, interruptions, WER and two-user test evidence |
| **Cross-owner contracts** | Accepted Zod 4 schemas in `@live-transcription/contracts` | Session state/IDs, list pagination, request shapes, final segment identity, errors, upload idempotency |

**Do not create AWS resources or run paid tests without the team's account/Region/spend approval.** Any proposed contract is subject to review; the `API_CONTRACTS.md` document explicitly labels request and response shapes `TBD`.

## 5. Step-by-step AWS hookup

### Step A — Configure Cognito (Person 2 + frontend)

1. Person 2 provides a suitable **Cognito User Pool**, Region, and **public app client without a client secret**. Agree on the email verification and sign-in challenge flow; the current UI handles basic email/password login, signup and confirmation, **not every possible MFA/challenge flow**.
2. Confirm that the API Gateway authorizer accepts the intended Cognito **access token** and validates issuer, audience/client, expiration and scopes as appropriate. Authorization and ownership must be enforced on the **backend**, not only in React.
3. From the repo root, create your untracked `frontend/.env` using `frontend/.env.example`:

   ```powershell
   Copy-Item frontend/.env.example frontend/.env
   ```

   Example *public configuration* (replace placeholders only after teammates supply values):

   ```dotenv
   VITE_APP_MODE=aws
   VITE_COGNITO_REGION=us-east-1
   VITE_COGNITO_USER_POOL_ID=REGION_POOL_ID_FROM_PERSON_2
   VITE_COGNITO_CLIENT_ID=PUBLIC_APP_CLIENT_ID_FROM_PERSON_2
   VITE_API_BASE_URL=https://YOUR_API_ID.execute-api.YOUR_REGION.amazonaws.com
   ```

   The URL is the **API root without `/v1`**; `TeamApi` adds `/v1` itself. The Region above is an **example**, not a team decision. If API Gateway uses a stage in the base URL, retain it, but do not append `/v1` twice. Restart Vite after editing `.env`.
4. `src/config.ts` reads these `VITE_` values, and `src/auth/cognito.ts` calls Amplify Auth. Test **sign up → confirm email → sign in → page refresh → sign out** with an approved test account. If Cognito requires an additional sign-in step, implement the reviewed challenge UI rather than marking the login successful.
5. **Never add secrets to `VITE_` variables**: they are bundled into browser JavaScript. Do not commit `.env`, IAM keys, client secrets, JWTs, or signing keys.

### Step B — Connect the control API (Person 2 + frontend)

1. Person 2 deploys a protected HTTPS API Gateway + Lambda implementation and configures CORS for the actual frontend origin (for development, typically `http://127.0.0.1:5173`; include `http://localhost:5173` only if used). Allow the methods and headers required by the reviewed API, including `Authorization` and `Content-Type`.
2. In AWS mode, sign in and open **Integration overview → Test control API**. That currently calls `GET /v1/sessions` through `src/services/teamApi.ts`, using `cognitoAuth.getAccessToken()` and `Authorization: Bearer <access-token>`.
3. Inspect the browser **Network** tab for request status and safe error metadata. A successful connectivity check means only that the request succeeded; **it does not prove schema compatibility, session isolation or streaming**. Do not copy tokens, signed URLs or transcript content into GitHub issues or chat.
4. Once the team accepts Zod schemas in `packages/contracts`, replace `unknown` transport boundaries with schema-validated request/response adapters. Agree on pagination, errors, idempotency and session transitions; do not invent frontend-only network DTOs or a duplicate state machine.
5. Wire the application events in `src/App.tsx` to typed methods in `TeamApi`: create sessions, list/detail, rename, delete, complete and downloads. Show loading, empty, 401/403, 404, 409/conflict, 429 and 5xx/retryable failure states. **Never announce a save or deletion before an acknowledged backend response.**

Current proposed routes (check `API_CONTRACTS.md` before implementing):

| Action | API route | Existing `TeamApi` method |
|---|---|---|
| Create a session | `POST /v1/sessions` | `createSession(...)` |
| List owned sessions | `GET /v1/sessions` | `listSessions()` |
| Read one owned session | `GET /v1/sessions/{id}` | `getSession(id)` |
| Rename a session | `PATCH /v1/sessions/{id}` | `renameSession(id, ...)` |
| Ask backend for a stream capability | `POST /v1/sessions/{id}/stream-url` | `requestStreamCapability(id, ...)` — **service layer only** |
| Upload final text | `POST /v1/sessions/{id}/segments` | `uploadFinalSegments(id, ...)` |
| Finish session/export | `POST /v1/sessions/{id}/complete` | `completeSession(id, ...)` |
| Download TXT/JSON export | `GET /v1/sessions/{id}/download?format=txt\|json` | **Not implemented yet** — add after contract approval |
| Delete a session | `DELETE /v1/sessions/{id}` | `deleteSession(id)` |

The exact payload schemas, idempotency placement and download response type are **not approved yet**. Do not pass arbitrary request objects in production just because the prototype signature says `unknown`.

### Step C — Wire real microphone PCM to the stream client (Person 3 + frontend)

1. Verify browser microphone permission and the product consent wording. Use HTTPS in any non-local deployment; raw microphone audio is **not** to be stored by default.
2. `MicrophoneCapture` in `src/audio/microphone.ts` already produces `PcmChunk` values:

   ```ts
   interface PcmChunk {
     pcm: ArrayBuffer;   // raw signed 16-bit little-endian PCM, no app header
     sequence: number;
     startSample: number;
     validSamples: number;
     final: boolean;
   }
   ```

   The AudioWorklet resamples native 44.1/48 kHz input to **16 kHz mono**, and its chunks target **1,600 samples / 3,200 PCM bytes per 100 ms**. Test silence, clipping, fractional-rate boundaries, and final zero-padding in the agreed browsers.
3. Person 3 defines and publishes the accepted `@live-transcription/stream-client` API. Implement an adapter in `src/services/streamPort.ts` satisfying the UI's `StreamUIAdapter` boundary. The current `PendingStreamAdapter` intentionally throws; **it is not a WebSocket client**.
4. The service layer requests the session-scoped short-lived WSS URL from Person 2's authenticated API and passes it **directly to the shared stream client**, not to a React component, analytics, logs, local storage or browser navigation. Lambda signs using its execution role; React **must not** calculate SigV4 signatures or possess permanent AWS credentials.
5. Stream client handles Amazon EventStream frames, audio backpressure, provider decoding, safe cancellation, interruptions and reviewed reconnection behavior. Do not write provider protocol code in `App.tsx` or send the obsolete custom 16-byte header.
6. Map stream events to `src/lib/viewModels.ts`: **partial** replaces the transient caption; **final-observed** is displayed, then queued for API saving; **save-acknowledged** appears only on durable API acknowledgement; **save-failed** provides a retry path. Do not present a preview/demo result as a real cloud result.

### Step D — Persist final results correctly (Persons 2/4 + frontend)

1. Only browser-observed **final** results are eligible for upload; **partials are ephemeral**.
2. Agree on an idempotency key and provider result identity, timestamps, stream epoch, batching limits and retry window in shared Zod schemas. Use stable ids for retries; do not create a different final on every retry.
3. Send validated finals through the authenticated `POST /v1/sessions/{id}/segments` API. The backend obtains ownership from validated Cognito claims; **never trust a `userId` supplied by the browser**.
4. Show **saving** while awaiting the server, **saved** only when DynamoDB persistence is acknowledged, and **save failed** otherwise. On disconnect/stop, handle queued finals according to the agreed retry/recovery policy.
5. `POST /v1/sessions/{id}/complete` should occur after the stream ends and all *observed* finals have been acknowledged. It does **not** prove that the browser delivered every provider final. S3 export readiness is separate from final-upload acknowledgement.

### Step E — History, S3 export, rename and deletion (Persons 2/4 + frontend)

1. Replace the mock `MockSessionStore` usage in `src/App.tsx` with typed `TeamApi.listSessions()` and `getSession(id)` results (after schema approval); update loading, error, empty and pagination UI.
2. Route rename to `PATCH /v1/sessions/{id}`, and deletion to `DELETE /v1/sessions/{id}`; verify results before updating the interface. Always verify ownership on the server.
3. Person 4 stores session metadata/finals in DynamoDB and publishes **private** completed TXT/JSON exports to S3. A shared private bucket with user/session-scoped object keys is one possible design; **one S3 bucket per user is not a current requirement**. Person 4 must approve physical storage layout, retention and deletion.
4. Add a typed download method to `teamApi.ts` once the team freezes its response format. The backend must authorize the requesting user and provide a secure download mechanism (e.g. a short-lived authorized URL or returned bytes), without logging URLs or exposing bucket permissions broadly.
5. Verify a second signed-in test user cannot list, retrieve, rename, delete or download another user's sessions, even if the other session ID is known. Test deletion denial *before* background cleanup is finished.

### Step F — Audio-file upload (optional, **not initial Option A scope**)

The original project proposal included uploading recordings, but the current Option A API does **not** define `POST upload`, presigned S3 upload, batch Transcribe jobs or job status routes. Keep the existing upload UI disabled or visibly labeled **Planned**. If the team approves this feature, write and review an additional API/schema/ADR first (file limits, ownership, S3 quarantine/retention, transcription-job lifecycle, costs and deletion) and then connect that interface. **Do not pretend upload is live** or make public S3 buckets to bypass the missing API.

## 6. First end-to-end AWS test (run only in the approved environment)

The first real milestone is **one account, one live stream, one durably saved transcript**:

1. Sign in with a Cognito test user; verify a valid protected `GET /v1/sessions` response.
2. Create a session; verify an opaque ID and correct authenticated ownership.
3. Start the microphone; confirm browser permission and valid 16 kHz/3,200-byte PCM output.
4. Obtain the short-lived Transcribe WSS capability in the **service layer**, establish the direct connection through Person 3's package and show **real partial captions**.
5. Speak a test phrase; receive a **real final result** and submit it to `/segments` with the reviewed idempotency key.
6. Verify the UI changes **final observed → saving → saved** only when the API acknowledges durability.
7. Stop/complete; verify export is marked ready only after successful S3 publication.
8. Reload, sign in again, list history, open the same owned session, download TXT/JSON, then delete it.
9. Sign in as a different user and verify unauthorized access to the first user's session, export and deletion returns a safe denial.
10. Exercise microphone denial, stale/invalid token, expired signed URL, reconnect/final-upload retry and API failure. Observe costs and clean up approved AWS resources when done.

Record the **AWS Region, browser/version, time, test dataset provenance, observed results, errors, and approved spend**. Never attach tokens, signed URLs, raw audio or personal transcripts to logs or issue comments.

## 7. Troubleshooting and common integration mistakes

| Symptom | First things to check |
|---|---|
| Blank React screen | Browser DevTools Console; incompatible icon export; Vite/plugin dependency versions |
| `npm` workspace symlink error on external drive | Use an NTFS filesystem; npm workspaces need filesystem links |
| Cognito login fails | Correct User Pool/client/Region, email-confirmation state, sign-in challenge, app client **without secret** |
| API gives 401/403 | Access token vs ID token, configured authorizer, issuer/audience, scopes, owner checks |
| Browser shows CORS error | Actual origin (`127.0.0.1` vs `localhost`), OPTIONS preflight, `Authorization`/`Content-Type`, stage and method configuration |
| 404 / wrong API route | `VITE_API_BASE_URL` must be the root/stage URL; `TeamApi` already appends `/v1` |
| Mic permission denied | HTTPS/loopback origin, OS privacy settings, browser permissions, user consent |
| No local simulated captions | Allow microphone permission, remain in mock mode, and verify the AudioWorklet loaded from the loopback origin |
| No real AWS captions | Person 2's accepted stream-capability schema and signer response are not integrated yet |
| Captions appear but history is empty | Browser-only finals are not durable; inspect `/segments` response and DynamoDB acknowledgment |
| Transcript download unavailable | Check completion status and private S3 export readiness; do not assume final segment save equals export ready |
| Tests cannot import `@live-transcription/contracts` | `npm run build --workspace @live-transcription/contracts` before `npm test` on a clean clone |
| Full repository `npm run check` reports old style warnings | Format **frontend** only for this PR; coordinate unrelated repository-wide Prettier changes |

## 8. Pull-request and meeting sign-off

Before submitting or merging the frontend PR:

- [ ] Original `frontend/README.md` preserved; this file added separately.
- [ ] Frontend builds with Node 24 / npm 11 and lint, TypeScript, unit tests, and production build pass.
- [ ] `frontend/package.json` and root `package-lock.json` are committed together; no `node_modules/`, `dist/`, `.env` or secrets committed.
- [ ] UI visibly identifies mock vs AWS mode; no mock result is portrayed as a persisted AWS result.
- [ ] Person 2 signs off on Cognito token/HTTPS API schemas, CORS, error rules and ownership.
- [ ] Person 3 signs off on PCM chunk handoff, shared-stream interface, reconnect and provider event mapping.
- [ ] Person 4 signs off on durable acknowledgment, owner isolation, S3 export readiness and deletion.
- [ ] Person 5 signs off on audio golden vectors, real-browser checks, two-user tests and failure paths.
- [ ] Team agrees on Region, consent, retention, signed-URL policy, quotas, budget and approved cloud test scope.

**Branch workflow:** work in `frontend`; commit only intended frontend and lockfile changes; `git fetch origin && git merge origin/main` while on `frontend`; push `frontend`; open a **Draft PR from `frontend` into `main`** for review. Merging `origin/main` *into* `frontend` does **not** change `main`. Do not merge the PR into `main` before team review.

**End state:** The frontend is ready to be connected through the team's **accepted** Cognito, API, shared streaming client and persistence contracts. This guide is a checklist for that integration; it is not a claim that AWS services are already connected.

