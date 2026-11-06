# AWS Infrastructure — Person 4 Phase 1

Status: approval-gated setup guide only; no application AWS resources are defined or deployed by this repository.

The minimum integrated environment contains:

- Cognito User Pool and public browser app client;
- API Gateway HTTP API with JWT authorization;
- Lambda control/signing functions using runtime IAM credentials;
- DynamoDB sessions/finals storage;
- privacy-safe CloudWatch logs/alarms; and
- an AWS Budget/usage check for the approved account.

Use [the Console setup runbook](../docs/runbooks/console-option-a-setup.md). Record resource identifiers privately. Do not create or modify resources until account, Region, deployer, cost bound, and cleanup owner are approved.

Person 2 owns handler/signing behavior. Person 4 owns IAM/resource configuration and the DynamoDB adapter handoff. The browser receives only a short-lived presigned URL, never AWS secret keys.

S3, a backend audio proxy, recorded-audio storage, batch jobs, summaries, multiple environments, and production scaling are not Phase 1 infrastructure.
