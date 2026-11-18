# Person 5 — Integration, Evaluation and Release Evidence

## Objective

Prove the complete MVP locally and in the approved development environment, including ownership isolation, failure behavior, privacy and the bounded one-hour logical session.

## Owned paths

- `evaluation/`
- `tests/integration/`
- `tests/e2e/`
- Existing datasets/results provenance and acceptance evidence documentation

## Current implementation

Python evaluation tools and tests have been migrated and existing artifacts preserved. No Option A cross-package integration suite, complete deployed E2E run, two-user isolation report, reconnect evidence or one-hour acceptance report exists.

## Required MVP deliverables

1. Build the fake-backed local journey: create → sign → final → acknowledge → complete → history → delete.
2. Test every operation with two owners and require foreign resources to look missing.
3. Test duplicate/conflicting final identity, stale/unissued epoch, rejected signing, corrupt/provider error, disconnect/reconnect, persistence failure and deletion denial.
4. Verify captions are rendered as text and routine logs contain no sensitive content.
5. Define the short AWS smoke procedure and evidence template.
6. After approval and short-smoke success, run the one-hour logical session with a forced reconnect and bounded observations.
7. Report browser, Region, provider settings, dataset/audio authorization, timing, save failures, disconnects, estimated cost and limitations.

## Dependencies and handoffs

- Receives shared contracts/fakes from Persons 2–4 and a runnable browser journey from Person 1.
- Requests deterministic provider/socket fixtures from Person 3.
- Reports failures to the owner of the failing boundary; does not silently patch another owner's public interface.
- Produces the final acceptance report for all owners.

## AWS access

Use `Observers` / `CloudScribe-Observer` for privacy-safe CloudWatch logs and metrics. Use Cognito test users for application behavior. Person 5 should not deploy or modify resources unless separately approved and assigned a scoped operator role.

## Local testing

Run `npm run check` and `python3 -m pytest -q` when relevant. Keep fixtures synthetic or properly licensed and free of real tokens, identifiers, transcripts or participant audio.

## Approved AWS testing

Follow `docs/runbooks/aws-development-testing.md`. Obtain explicit approval for the account, `us-east-2`, duration, cost bound, audio/consent, participants, expected resources and cleanup owner. Store evidence without sensitive payloads.

## Definition of done

- Local success and required failure suite pass.
- Short deployed smoke completes the durable create-to-delete journey.
- Two-user isolation and privacy review pass.
- Forced reconnect preserves one logical session and acknowledged finals.
- Approved one-hour run is documented honestly with limitations and estimated cost.

## Out of scope

Relabeling historical WER results as MVP evidence, production SLO claims, load testing, recorded uploads, exports and summaries.
