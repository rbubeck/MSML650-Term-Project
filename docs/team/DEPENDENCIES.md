# Cross-Owner Dependencies and Handoffs

## Dependency map

| Producer | Required artifact | Consumer | Consumer may proceed when |
|---|---|---|---|
| Persons 2 and 3 | Accepted Zod request/response/error schemas | Persons 1 and 4 | Critical fields, bounds, idempotency, epoch and status behavior are reviewed |
| Person 1 | PCM callback, source-selection and capture-stop behavior | Person 3 | Mono 16 kHz PCM chunks and source lifecycle are stable |
| Person 3 | `TranscribeStreamClient` plus UI adapter events | Person 1 | Start/send/stop/error/final handoff is reviewed and tested |
| Person 2 | Repository port and state/ownership outcomes | Person 4 | Methods and atomic/conditional behavior are agreed |
| Person 4 | Deterministic repository fake | Persons 2 and 5 | It implements the agreed port without AWS |
| Person 4 | DynamoDB adapter with identical semantics | Person 2 | Adapter tests cover ownership, epoch, duplicate/conflict and deletion |
| Person 2 | Complete authenticated handlers | Persons 1 and 5 | Handlers validate contracts and pass fake-backed isolation/failure tests |
| Person 1 | Complete browser journey | Person 5 | Create, captions, save state, completion, history and delete are reachable |
| Person 5 | Integration fixtures and acceptance report | Persons 1–4 | Failures identify the responsible boundary without sensitive evidence |

## Required collaboration pairs

### Persons 1 and 3 — capture and live streaming

Agree on two independent audio-source controls, PCM ownership/transfer, connection-before-capture ordering, overload behavior, stop ordering, disconnect UI, and reconnect. Person 3 may change the frontend adapter only with Person 1 review.

### Persons 2 and 4 — API and persistence

Agree on repository method names, ownership-safe `NOT_FOUND`, atomic stream-epoch allocation, lifecycle transitions, idempotency fingerprints, duplicate/conflict outcomes, ordering/pagination, and deletion semantics before the DynamoDB adapter is finalized.

### Persons 2 and 3 — public contracts

Resolve the contract checklist in `packages/contracts/README.md`. Notify Persons 1 and 4 before changing a consumed field or behavior.

### Person 5 and every owner — evidence

Person 5 requests deterministic fakes and stable interfaces early. Person 5 must not infer deployed behavior from documentation or unit tests; each owner supplies actual evidence and limitations.

## Communication triggers

Notify affected owners before merging when work changes:

- a Zod schema, route, error or status code;
- the repository port or state transition;
- PCM format, stream event or stop/reconnect behavior;
- AWS role, resource, Region, cost or cleanup plan;
- privacy/logging behavior;
- an acceptance criterion or test fixture consumed by another owner.

## Handoff message template

```text
Producer:
Consumer:
Deliverable/PR:
Interfaces changed:
Assumptions/open decisions:
Checks run:
AWS actions performed: none | exact approved actions
Sensitive artifacts created: none | stored privately, never committed
Consumer action required:
Affected-owner review:
```

If a required artifact is missing, consumers should use a contract-compliant fake rather than inventing a competing public shape.
