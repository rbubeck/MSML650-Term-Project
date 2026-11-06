# AWS Infrastructure — Console-First Guide (Person 4)

Status: planning/runbook only. No application AWS resources are defined or deployed by this repository. The historical paid account/budget report must be reverified before use.

Use [Console setup runbook](../docs/runbooks/console-option-a-setup.md) to inventory, create (only after approval), verify, and clean up Cognito, API Gateway/Lambda, DynamoDB, S3, IAM, CloudWatch, and Budgets. There is no CDK deployment path in this Option A structure. Record resource names/IDs in private team inventory, not this repository. Keep signing permissions on the Lambda execution role; browsers receive only short-lived presigned URLs.

Region/data residency, consent, retention, account layout, quota, budget, deployers, and cleanup policy are `TBD`. Do not create resources or run paid tests without explicit orchestrator authorization.

First tasks: inventory existing resources and costs read-only; agree the pending account/Region, IAM, retention, and quota decisions with the team; review Person 2's Lambda permission needs and Person 5's alarms; then prepare a named Console change checklist for approval. Person 2 owns Lambda handler behavior, while Person 4 owns the approved AWS resource configuration and handoff.
