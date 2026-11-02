# Infrastructure

Owner: Person 4

This directory will contain AWS CDK in TypeScript after ADR-007 is accepted. Expected boundaries include frontend hosting, identity/control API, data, streaming network/service, and observability.

CDK code must synthesize and test without deploying. Deployment requires an approved account, Region, budget, and human authorization. Agents must not deploy shared infrastructure automatically.

No infrastructure code or AWS resources exist yet.

