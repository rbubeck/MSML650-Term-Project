# Team Start Here — Option A Phase 1

Status: active coordination entry point. Last updated: 2026-11-15.

## Objective

Deliver the authenticated ADR-011 live-transcription MVP:

```text
sign in
→ create an owned session
→ obtain a short-lived Transcribe URL
→ stream browser PCM directly to Amazon Transcribe
→ display partial and final captions
→ upload and acknowledge final segments
→ complete and reopen history
→ delete and deny subsequent reads
```

The repository contains enough architecture, contracts, implementation, tests, and AWS guidance for each owner and their coding agent to proceed. This hub tells each contributor what to read, own, request, and hand off.

## Current checkpoint

The 2026-11-07 development smoke proved Cognito sign-in, JWT-authorized API Gateway, Lambda signing, direct browser PCM/EventStream streaming, and real captions for one configured user/session in `us-east-2`.

That smoke was not the complete MVP. DynamoDB-backed sessions/finals, the remaining API routes, current-branch frontend streaming integration, history/deletion, two-user isolation, reconnect evidence, and the one-hour run remain open. See [CURRENT_STATUS.md](CURRENT_STATUS.md).

## Required reading order

1. `AGENTS.md`
2. This file and your role brief below
3. `direction_option_a.md`
4. `ARCHITECTURE.md`
5. `API_CONTRACTS.md`
6. `INTEGRATION_PLAN.md`
7. Your area README
8. Accepted ADRs in `docs/adr/`
9. [DEPENDENCIES.md](DEPENDENCIES.md) before changing a shared interface

## Role briefs

| Owner | Brief | Primary paths |
|---|---|---|
| Person 1 | [Frontend](person-1-frontend.md) | `frontend/` |
| Person 2 | [Backend API](person-2-backend.md) | `backend/api/` |
| Person 3 | [Streaming integration](person-3-streaming.md) | `packages/stream-client/`, reviewed frontend adapter changes |
| Person 4 | [Persistence and infrastructure](person-4-infrastructure.md) | `backend/persistence/`, `infrastructure/` |
| Person 5 | [Evaluation and acceptance](person-5-evaluation.md) | `evaluation/`, `tests/` |

`packages/contracts/` is cross-owner. Persons 2 and 3 co-own the initial freeze; Persons 1 and 4 review changes that affect them.

## Rules for every contributor and agent

- Work only toward the ADR-011 Phase 1 journey. Deferred features require a reviewed ADR.
- Use shared Zod schemas for application JSON and keep Amazon EventStream models in `packages/stream-client`.
- Build against deterministic fakes first. Normal tests must not call AWS.
- Never proxy continuous audio through API Gateway or Lambda.
- Never commit account/resource identifiers, Cognito `sub` values, `.env` values, tokens, signed URLs, transcripts, audio, generated bundles, or ZIP files.
- Never log transcript text, audio, JWTs, signed URLs, personal data, or unbounded identifiers.
- Use IAM Identity Center for AWS workforce access and Cognito for CloudScribe application users. Never share IAM logins or create long-lived access keys for ordinary development.
- AWS resource creation, paid tests, and the one-hour run require explicit approval, a named account/Region, a cost bound, and a cleanup owner.
- Run `npm run check` before TypeScript handoff. Person 5 also runs the Python suite relevant to evaluation changes.

## How to start an agent task

Use a prompt shaped like this:

```text
Read AGENTS.md, docs/team/START_HERE.md, docs/team/person-X-*.md,
the required architecture/contracts documents, and the area README.

Implement only the listed Phase 1 deliverable. Preserve mandatory trust
boundaries, use injectable fakes for normal tests, and do not create or modify
AWS resources without the approval gate. Before handoff, run the required
checks and report interfaces changed, actual evidence, assumptions, and owners
who must review.
```

## Handoff requirement

Every handoff or PR must state:

- deliverable and owned paths changed;
- public contracts/interfaces changed, or explicitly `none`;
- assumptions and unresolved decisions;
- tests actually run and their results;
- AWS actions actually performed, or explicitly `none`;
- affected owners who reviewed or still need to review;
- next consumer and the artifact they should use.

Documentation, mocks, and unit tests are preparation. Claim deployed behavior only from recorded integrated evidence.
