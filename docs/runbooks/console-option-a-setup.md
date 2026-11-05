# Option A AWS Console Setup and Handoff

Status: `PROPOSED` guide. **Do not perform these steps until the orchestrator approves the named account, Region, budget, retention, and deployer.** The guide records what Person 4 must do and verify; it is not evidence of deployed resources.

## 1. Preflight and inventory

1. In the AWS Console, confirm the active account alias/ID and Region with the team. Record the account ID only in a private resource inventory.
2. Review existing Cognito pools, API Gateway APIs, Lambda functions, DynamoDB tables, S3 buckets, IAM roles, CloudWatch log groups/alarms, and AWS Budgets. Reuse only resources explicitly assigned to this project; do not modify unrelated resources.
3. Record owner, environment, resource name/ARN privately, Region, creation date, expected idle/variable cost, retention, and cleanup owner. Check current spend and configure alerts; a Budget alert does not prevent charges.
4. Check account/Region Transcribe streaming concurrency and start-rate quotas and service availability. Choose a conservative approved app admission target before a browser test.

## 2. Identity and signing

1. Configure a project Cognito User Pool/app client and approved callback/logout origins. Do not create a client secret for a public browser app. Record issuer, client ID and allowed origins as non-secret environment configuration.
2. Configure API Gateway HTTP API with a JWT authorizer tied to the approved Cognito issuer/audience. Protect every session/sign/upload/history/export/delete route.
3. Create a narrowly scoped Lambda execution role for signing/control. Grant `transcribe:StartStreamTranscriptionWebSocket` only to the signer role; AWS's WebSocket policy example uses `Resource: *`, so document the IAM limitation and compensate with API ownership, URL expiry, rate limits, quotas, and monitoring. Grant DynamoDB/S3 permissions only to the functions that need them.
4. Configure Lambda settings and environment references without static AWS keys. Verify the signer generates only approved Region/language/PCM parameters, a bounded expiry no greater than 300 seconds, and `Cache-Control: no-store`. Never expose the URL in logs or diagnostics.

## 3. Data and exports

1. Create DynamoDB table(s) only after the data model and retention decision are accepted. Configure encryption, capacity, backups/PITR, TTL if used, and deletion policy explicitly. TTL is cleanup, not authorization.
2. Create a private S3 export bucket with Block Public Access, TLS-only access policy, encryption, versioning/retention per approved policy, and narrowly scoped Lambda permissions. Do not use a public bucket or browser general-write credentials.
3. Configure owner-authorized download behavior and deletion reconciliation. Record how backups and old object versions affect deletion promises.

## 4. Observability and verification

1. Set CloudWatch log retention and privacy-safe structured fields. Configure alarms for signing failures, API errors, upload/export failures, abnormal Transcribe usage, and budget thresholds; assign an owner for each.
2. Verify API JWT rejection, user A/B isolation, private S3 access, no signed URL or transcript text in logs, duplicate upload idempotency, export readiness, and immediate read denial on deletion.
3. With approved synthetic/licensed audio and bounded duration, verify a browser obtains a signed URL, opens direct WSS to Transcribe, receives partial/final events, uploads finals, downloads an export, and deletes the session. Record actual date, Region, browser, configuration, cost estimate, and failures. Do not claim success from this checklist alone.

## 5. Cleanup and handoff

Record exact resource inventory, endpoints, non-secret frontend config, IAM role names, quota findings, alarms, budgets, retention, test evidence, and rollback steps privately. After approval, remove temporary test identities, exports, functions, API routes, tables/buckets, log groups, and alarms in dependency order according to retention policy. Verify charges and residual resources afterward.
