# Current MVP Status

Snapshot date: 2026-11-15. Update this table after an accepted merge or verified deployment; do not use unmerged local work as team-wide completion evidence.

## Evidence summary

- A narrow real AWS live-caption smoke succeeded on 2026-11-07 in `us-east-2`.
- The repository currently passes the shared TypeScript check and its unit/contract suite in the assessed checkout.
- Python evaluation tests pass in the assessed checkout.
- No complete durable ADR-011 end-to-end journey has been demonstrated.

## Owner status

| Deliverable | Owner | State | Evidence | Next gate |
|---|---|---|---|---|
| Cognito UX and frontend shell | Person 1 | In progress | React UI, Cognito adapter, mock sessions and capture code exist | Connect reviewed live/API adapters |
| Microphone/system capture | Persons 1 and 3 | In progress | PCM preparation and meeting capture tests exist | Two independent source controls and live PCM handoff |
| Browser Transcribe protocol client | Person 3 | Implemented, integration pending | EventStream/lifecycle tests and prior real smoke | Restore current frontend adapter and prove reconnect |
| Stream-URL API/signing | Person 2 | Implemented for smoke | Fake-tested handler and prior real smoke | Replace temporary repository in production composition |
| Create/list/read/rename APIs | Person 2 | Not implemented | Contracts are draft only | Contract freeze plus repository fake |
| Final save/completion/delete APIs | Person 2 | Not implemented | Contracts are draft only | Repository semantics and handlers |
| Repository fake | Person 4 with Person 2 review | Not implemented | Workspace boundary only | Agree the repository port |
| DynamoDB adapter/table | Person 4 | Not implemented | No durable MVP resource | Approved design and local adapter tests |
| Local vertical integration | Person 5 | Planned | `tests/integration` contains a plan only | All fake-backed handoffs available |
| Deployed E2E acceptance | Person 5 | Planned | Narrow smoke only | Durable development deployment |
| One-hour/reconnect/isolation evidence | Person 5 with all owners | Not run | None | Short smoke passes first |

## Immediate integration blockers

1. Freeze the minimum contracts and repository outcomes.
2. Reconcile the frontend merge: restore the direct stream adapter/package dependency and feed it the current PCM capture.
3. Represent microphone and system audio as two independent selections; both selected derives the mixed behavior without a third UI option.
4. Deliver Person 4's fake repository, followed by the DynamoDB adapter.
5. Implement Person 2's remaining handlers.
6. Connect Person 1's save acknowledgment, completion, history, and deletion UX.
7. Add Person 5's local vertical and failure/isolation suite before another AWS acceptance run.

## Milestone gates

| Gate | Exit requirement |
|---|---|
| Contract ready | Critical schema/lifecycle/idempotency decisions accepted by affected owners |
| Component ready | Owner unit tests pass and handoff interface is documented |
| Local MVP ready | Fake-backed create-to-delete journey plus meaningful failure tests pass |
| AWS development ready | Approved resources, roles, routes, configuration, logs, budget, and cleanup are recorded privately |
| Pilot ready | Short smoke, two-user isolation, reconnect, persistence, deletion, and privacy review pass |
| MVP accepted | Approved one-hour logical session completes with bounded behavior and recorded limitations |

## Repository hygiene before release branches

- Keep real AWS configuration only in ignored local files or an approved private channel.
- Keep `.env.example` placeholder-only and safe by default.
- Regenerate and commit the root lockfile with dependency changes.
- Do not commit `dist/`, Lambda bundles/ZIPs, tokens, signed URLs, transcripts, or audio.
- Update stale area status text when the associated implementation is accepted.
