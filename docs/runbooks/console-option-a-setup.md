# Phase 1 AWS Console Setup and Handoff

Status: development checklist. A bounded single-user subset was executed manually in an approved `us-east-2` account on 2026-11-07; the full persistence/MVP checklist remains proposed. Do not repeat, expand, or productionize resources without named account, Region, deployer, cost bound, and cleanup owner approval.

## Executed smoke subset — 2026-11-07

The team manually configured a Cognito User Pool/public SPA client, an API Gateway HTTP API route with JWT authorization and local-origin CORS, a Node.js 24 Lambda signer using runtime-role credentials, and the Transcribe WebSocket IAM action. A local Vite browser authenticated, obtained a capability, streamed resampled mono PCM directly to Transcribe, and displayed real captions.

This record intentionally omits all resource IDs, account/user identifiers, tokens, URLs and transcript content. DynamoDB, final-save/history APIs, multi-user isolation, reconnect and the one-hour run were not part of the smoke. Generated deployment artifacts and local environment values remain outside Git.

## 1. Preflight

1. Confirm account and Region privately; inventory existing Cognito, API Gateway, Lambda, DynamoDB, IAM, CloudWatch, and Budget resources.
2. Reuse only resources explicitly assigned to this project.
3. Confirm Transcribe streaming availability, current account quota, expected one-hour test cost, and budget alerts.
4. Record resource owner, purpose, expected cost, and cleanup step privately.

## 2. Minimum identity and API

1. Configure a Cognito User Pool and public browser app client with approved local callback/logout origins; no client secret.
2. Configure API Gateway HTTP API JWT authorization for every `/v1` route.
3. Create Lambda execution roles with only required DynamoDB permissions and `transcribe:StartStreamTranscriptionWebSocket` for the signer.
4. Use runtime credentials only. Configure safe non-secret Region/language/PCM settings.
5. Verify signed responses are non-cacheable and no URL/query string is logged.

## 3. Minimum persistence

Create DynamoDB resources only after Person 2/4 approve the Phase 1 keys and conditional-write behavior. Enable encryption and select conservative capacity for the integration environment. Do not add S3, backend audio-proxy, container-service, load-balancer, or recorded-audio resources.

## 4. Verification

1. Reject missing/invalid JWTs and foreign-owner access.
2. Verify create/sign/save/complete/history/delete with two test identities.
3. Verify duplicate final idempotency and stale-epoch rejection.
4. Verify no JWT, signed URL, audio, or transcript text in logs.
5. Run the approved short browser smoke, then the separately approved one-hour acceptance.

## 5. Handoff and cleanup

Record non-secret frontend configuration, role/resource names, quota findings, alarms, actual checks, estimated cost, and rollback privately. Remove temporary identities and unneeded resources after testing, verify cleanup, and review residual charges.

Recorded-file, S3 export, summaries, production environments, advanced alarms, and load-test setup are later runbooks.
