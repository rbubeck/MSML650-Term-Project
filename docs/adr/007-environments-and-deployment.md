# ADR-007: Environments and Deployment Strategy

Status: Proposed  
Owners: Person 4 with all owners consulted

## Context

The team needs reproducible infrastructure, safe collaboration, spending control, and separation between experiments and user data. The AWS Region/account layout, CI identity, and removal policies are not yet approved.

As of 2026-11-02, an authorized paid development account is available, the local provider smoke test succeeded in `us-east-1`, and a $20 monthly AWS Budget alert is configured. The alert is not a hard cap and does not approve infrastructure deployment. Staging/production account layout, data residency, existing-resource isolation and ongoing idle-cost controls remain unresolved.

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

Current partial evidence: development SDK access and Transcribe connectivity in `us-east-1`. No CDK synthesis, stack deployment, quota verification, container, endpoint, cleanup or rollback demonstration exists yet.

