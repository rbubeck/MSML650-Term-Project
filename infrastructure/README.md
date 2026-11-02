# Infrastructure

Status: npm workspace boundary and proposed ADR only; no CDK application or AWS resource is defined by this repository.

Owner: Person 4

This workspace will own AWS CDK in TypeScript for identity/control, data, streaming network/service, frontend hosting and observability. CDK must synthesize and test locally without deploying by default.

## Confirmed development facts

- The manually tested Region is `us-east-1`.
- An authorized development AWS account is available.
- A $20 monthly AWS Budget alert exists; it is not a hard cap and billing data is delayed.
- Amazon Transcribe Streaming was manually verified from the local adapter.

These facts do not accept ADR-007 or authorize resource creation. Account separation, stack naming, deletion/retention, domain/certificates, network egress, CI deploy roles and ongoing idle-cost limits remain open.

## Person 4 next actions

1. Lead ADR-007 review and record dev/staging/prod layout, Region, authorized deployers, removal policies and cleanup.
2. Estimate unavoidable idle costs before choosing ALB/Fargate/NAT topology; identify existing account spend before adding resources.
3. Scaffold CDK with synth/unit assertions only after ADR-007 acceptance.
4. Separate ECS execution and task roles; grant the task role only required runtime actions.
5. Define ECR, VPC/egress, ALB/WSS, ECS health/drain, log retention and scaling boundaries with Persons 3 and 5.
6. Add Cognito/API Gateway/Lambda/DynamoDB/S3/Amplify constructs only against accepted application/data contracts.
7. Use GitHub OIDC for CI; never create static deployment keys.

No agent or contributor may run `cdk deploy`, create stacks or mutate a shared AWS environment without explicit orchestrator approval. Documentation must not publish account IDs, credentials or real resource ARNs.
