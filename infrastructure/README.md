# AWS Infrastructure — Person 4 Phase 1

Status: the repository remains an approval-gated guide and does not provision resources automatically. A minimal Cognito/API Gateway/Lambda/Transcribe development stack was configured manually in `us-east-2` and passed a single-user live-caption smoke on 2026-11-07; DynamoDB and the MVP infrastructure are not deployed.

The minimum integrated environment contains:

- Cognito User Pool and public browser app client;
- API Gateway HTTP API with JWT authorization;
- Lambda control/signing functions using runtime IAM credentials;
- DynamoDB sessions/finals storage;
- privacy-safe CloudWatch logs/alarms; and
- an AWS Budget/usage check for the approved account.

Use [the Console setup runbook](../docs/runbooks/console-option-a-setup.md). Record resource identifiers privately. Do not create or modify resources until account, Region, deployer, cost bound, and cleanup owner are approved.

Person 2 owns handler/signing behavior. Person 4 owns IAM/resource configuration and the DynamoDB adapter handoff. The browser receives only a short-lived presigned URL, never AWS secret keys.

For the controlled first live-caption smoke test, `backend/api/src/smoke-test-lambda.ts` can run without DynamoDB by recognizing one configured Cognito owner/session. This does not replace Person 4's work: its epoch state is process-local and invalid for durable MVP, concurrency, reconnect evidence, or persistence. The smoke test still requires an approved Region/account, Cognito, API Gateway, a Lambda execution role, CORS, cost awareness, and cleanup ownership.

The observed smoke configuration used a public Cognito SPA client without a secret, an HTTP API JWT authorizer, local-origin CORS, a Node.js 24 Lambda bundle, and an execution role limited to basic logging plus `transcribe:StartStreamTranscriptionWebSocket`. Identifiers, the configured owner/session, local `.env`, generated bundle/ZIP, tokens, signed URLs, and transcripts are deliberately excluded from Git. Set finite CloudWatch log retention, review Cognito self-registration and API throttling, keep a budget alert, stop active streams after tests, and remove temporary resources when no longer needed.

S3, a backend audio proxy, recorded-audio storage, batch jobs, summaries, multiple environments, and production scaling are not Phase 1 infrastructure.
