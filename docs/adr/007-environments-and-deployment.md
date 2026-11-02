# ADR-007: Environments and Deployment Strategy

Status: Proposed  
Owners: Person 4 with all owners consulted

## Context

The team needs reproducible infrastructure, safe collaboration, spending control, and separation between experiments and user data. The AWS Region/account layout, CI identity, and removal policies are not yet approved.

## Proposed decision

Use AWS CDK in TypeScript under `infrastructure/`. Provide environment-specific configuration for `dev`, `staging`, and `prod`; prefer separate AWS accounts when the team's organization supports them, otherwise use strongly separated stacks, roles, domains, and data stores. CI uses GitHub OIDC and short-lived, environment-scoped deployment roles. Production requires protected approval.

Amplify Hosting serves the React app. API Gateway/Lambda serve control APIs. ALB/ECS Fargate/ECR serve streaming. Every resource is tagged for application, environment, owner, and cost allocation. Dev/staging have budgets, bounded retention, and documented cleanup. Stateful production removal policies are conservative.

No agent deploys or changes a shared environment without human authorization.

## Alternatives

- Click-ops: fast initially but not reproducible or reviewable.
- Terraform: viable, but CDK TypeScript is the charter preference and aligns shared language.
- One shared environment: cheap but unsafe for integration and data isolation.
- Local-only until completion: delays discovery of IAM, ALB, quota, and network issues.

## Consequences

CDK constructs and config need tests and review. Account bootstrap and domains/certificates require coordination. NAT and minimum Fargate tasks can create nontrivial idle cost. Region choice affects feature availability, latency, data residency, and quotas.

## Acceptance evidence

Team records Region, account layout, target peak concurrency, current service quotas, domain/certificate plan, CI OIDC trust, budget values, retention/removal policies, rollback procedure, and an approved staging deployment demonstration.

