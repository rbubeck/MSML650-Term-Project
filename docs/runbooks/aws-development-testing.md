# AWS Development Testing

Status: approval-gated procedure for real AWS tests. Local fake-backed work is the default.

## Test order

1. Unit and contract tests with no network.
2. Cross-package local integration with fake identity, signer, repository and WebSocket/provider.
3. Approved short AWS smoke.
4. Two-user/failure/reconnect acceptance.
5. Approved one-hour run only after all earlier gates pass.

## Approval record required before AWS mutation or paid testing

Record privately or in a reviewed, nonsensitive project decision:

- exact purpose and expected outcome;
- approved AWS account and `us-east-2` Region;
- responsible operator and participating owners;
- resources that may be created/changed/deleted;
- estimated duration and cost bound;
- test data/audio source and participant consent;
- CloudWatch retention and privacy expectations;
- cleanup owner, deadline and rollback plan.

Having an Identity Center permission set does not replace this approval.

## Role-specific testing

### Frontend / Person 1

Use a Cognito test user to verify authentication, browser permission flows, CORS, source selection, captions, save acknowledgments, history and deletion. Optional Observer access is read-only.

### Backend / Person 2

Use BackendDeveloper for approved function/API updates and log inspection. Invoke behavior through Cognito-authenticated API requests. Runtime DynamoDB/Transcribe access remains on the Lambda role.

### Streaming / Person 3

Use Cognito plus the deployed signer API. Do not use personal AWS credentials in the browser or sign locally for the application. Inspect safe logs with Observer and update only approved backend integration resources with BackendDeveloper.

### Persistence/infrastructure / Person 4

Use InfrastructureOperator only after approval. Verify exact resource targets before creation, deletion, policy, role-pass, table or API changes. Record cleanup and finite retention.

### Evaluation / Person 5

Use Cognito test users plus Observer logs/metrics. Do not modify deployed resources to make a test pass; report the failing boundary to its owner.

## Short smoke checklist

- Confirm account, Region, role, budget and cleanup owner.
- Confirm frontend uses a public Cognito client without a secret.
- Confirm API Gateway validates access tokens on every route.
- Confirm Lambda signs with its runtime role and the response is non-cacheable.
- Confirm browser PCM connects directly to Transcribe; no audio traverses Lambda/API Gateway.
- Confirm final text is marked saved only after API acknowledgment.
- Complete, reopen, delete, then verify reread denial.
- Review CloudWatch for allow-listed content-free events only.
- Stop capture/streams and record actual resources/cost privately.

## Evidence rules

Evidence may include timestamps, browser/version, Region, bounded error/event names, counts, durations, test-case IDs and estimated cost. It must not include audio, transcript text, JWTs, signed URLs, Cognito `sub`, email, session IDs as metric dimensions, credentials or raw provider bodies.

Clearly label evidence as unit, local integration, short AWS smoke, or one-hour acceptance. Do not promote one category as another.

## Failure and cleanup

On unexpected signing/Transcribe usage, stop capture and active streams, preserve only privacy-safe diagnostics, notify the infrastructure owner, and inspect usage/cost. On final-save/DynamoDB failure, keep the UI state unsaved and do not claim durability. After testing, delete temporary approved resources, retain shared development resources only when their owner/retention plan says so, and record cleanup completion privately.
