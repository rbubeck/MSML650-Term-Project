# Security and Privacy Specification

Status: Proposed for team review  
Last reviewed: 2026-11-01

## Assets and actors

Protected assets include identity tokens, connection tickets, microphone audio in transit, transcript content, profile data, session metadata, exports, encryption keys, infrastructure credentials, and operational data.

Actors include authenticated users, anonymous internet clients, team operators, application workloads, AWS managed services, and a compromised browser or dependency. Authentication does not imply authorization to another user's session.

## Trust boundaries

1. Browser to Cognito/API Gateway/ALB over public TLS.
2. API Gateway to Lambda.
3. ALB to ECS tasks inside the VPC.
4. Lambda/ECS to DynamoDB, S3, Transcribe, ECR, and CloudWatch.
5. CI/CD to AWS deployment roles.

Each boundary has explicit identity, least privilege, input validation, timeout, and privacy-safe telemetry requirements.

## Threats and controls

| Threat | Required control |
|---|---|
| IDOR across sessions | Derive owner from verified identity; owner-scoped keys and conditional checks |
| Ticket theft/replay | Short expiry, secure transport, hashed storage, session/audience binding, atomic single use |
| Token leakage through URLs/logs | Do not use long-lived tokens in query strings; redact headers/URLs; prohibit credential logging |
| Cross-site WebSocket hijacking | Exact origin allow-list plus ticket validation and single-use semantics |
| Oversized/flooded socket | Pre-auth rejection, maximum frame/message rate, idle timeout, per-user concurrency, bounded queues |
| Malformed audio destabilizes worker | Validate framing/format; isolate state per connection; fail one session only |
| Stale worker mutates session | Conditional version/epoch/lease writes |
| Unauthorized S3 access | Block public access, IAM least privilege, owner-authorized short-lived downloads |
| Transcript/audio in logs | Structural redaction; allow-listed fields; tests scanning captured logs |
| Dependency or image compromise | Lockfiles, review, vulnerability scanning, minimal non-root image, immutable image tags/digests |
| CI credential abuse | OIDC short-lived roles, protected environments, scoped deployment roles, no static AWS keys |
| Incomplete deletion | `DELETING` tombstone denies reads; retry physical removal; audit outcome |
| Resource exhaustion/cost attack | Admission control, budgets, WAF/rate limits where justified, quota alarms |

## Authentication and authorization

- Cognito User Pool is the identity provider.
- API Gateway JWT authorizer validates issuer, audience/client, signature, and expiry for HTTP APIs.
- Lambda uses validated claims and never trusts a body/path `userId`.
- WebSocket authentication uses the approved one-time ticket design in ADR-001.
- ECS consumes a ticket before accepting `start` or audio and verifies current session ownership/state.
- Owner mismatch is returned as not found where resource enumeration is a concern.
- Administrative access is outside MVP and must not be inferred from ordinary user tokens.

## IAM

- ECS execution role: pull ECR image and write bootstrap/runtime logs only.
- ECS task role: minimum Transcribe stream action plus exact DynamoDB/S3/CloudWatch operations required by its adapter.
- Lambda roles are per function or narrowly grouped, not a shared wildcard role.
- Deployment role is separate from runtime roles and activated through approved CI/environment controls.
- Avoid `Resource: *` except for actions whose AWS API does not support resource scoping; constrain with conditions where possible and document exceptions.

## Network and transport

- HTTPS/WSS only, modern TLS policy, certificate managed through ACM.
- ALB security group accepts public TLS; task security group accepts only the target port from the ALB security group.
- Tasks have only required egress. VPC endpoint/NAT choices are an infrastructure/cost decision.
- `/health` reveals only readiness, never dependency secrets, session counts, or build internals.
- ALB access logs, if enabled, must not record ticket-bearing query strings. Ticket transport must be selected with logging behavior in mind.

## Data protection

- S3 Block Public Access is enabled and bucket policies deny non-TLS requests.
- DynamoDB and S3 encryption at rest are enabled. Customer-managed KMS keys are used only if an approved threat/compliance requirement justifies their operational overhead.
- Raw microphone audio is not persisted by default.
- Transcript exports and segments follow an approved retention period; no default period is invented during bootstrap.
- Downloads expire quickly and are issued only after owner authorization.
- Backups, PITR, versions, replicas, and logs are included in deletion/retention decisions.

## Privacy and consent

Before microphone capture, the UI explains that speech is sent to AWS for transcription. Product/legal owners must decide recording-consent language, age restrictions, supported jurisdictions, retention, export, deletion, and regulated-data scope.

Amazon Transcribe output is probabilistic. Any future PII redaction is defense-in-depth, not guaranteed removal and not automatic legal de-identification.

## Secrets

No permanent AWS keys exist in frontend code, repository files, container images, or ordinary environment files. Runtime access uses IAM roles. Secrets Manager is introduced only for actual non-IAM secrets. Tickets, JWTs, signed URLs, and encryption context are treated as sensitive even if short-lived.

## Logging and telemetry

Allowed fields include stable event name, service, environment, request/correlation ID, opaque session ID where operationally necessary, epoch, outcome, bounded error code, duration, and counts.

Prohibited content includes raw audio, transcript text, JWTs, tickets or hashes usable for authentication, signed URLs, authorization headers, email, display name, full provider payload, and stack traces returned to clients. Metric dimensions must be low-cardinality and exclude user/session identifiers.

## Security tests and release gates

- User A cannot list, retrieve, rename, complete, download, reconnect to, or delete User B's session.
- Expired, replayed, wrong-session, wrong-audience, and concurrently consumed tickets fail.
- Disallowed origins, oversized frames, rate floods, malformed JSON/header, and audio before `ready` fail safely.
- Logs generated by test flows contain none of the seeded token/audio/transcript marker values.
- S3 public-access and non-TLS denial controls are asserted in infrastructure tests.
- Runtime roles pass least-privilege review and CI contains no static AWS credentials.
- Deletion immediately denies reads and eventually removes all content in the tested environment.

## Incident response starter

Runbooks must cover suspected token/ticket exposure, cross-user access, public-object exposure, abnormal Transcribe usage/cost, compromised container image, and deletion failure. An incident owner preserves privacy-safe evidence, revokes affected credentials/sessions, contains access, communicates through approved channels, and records corrective actions.

## Open decisions

- Regulated or sensitive data permitted in MVP.
- Region/data residency.
- Retention and deletion timelines, including backups/logs.
- Ticket transport and expiry.
- KMS ownership and key rotation requirements.
- WAF requirement and rate thresholds.
- Security-contact and incident-notification process.

