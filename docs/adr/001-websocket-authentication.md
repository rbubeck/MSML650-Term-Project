# ADR-001: WebSocket Authentication and One-Time Tickets

Status: Proposed  
Owners: Persons 2 and 3  
Decision deadline: Before Milestone 1 streaming integration

## Context

The browser cannot set an arbitrary `Authorization` header on a WebSocket upgrade. Long-lived Cognito tokens in URLs risk leakage through browser history and access logs. ALB does not automatically authorize application sessions.

## Proposed decision

The authenticated control API issues a cryptographically random, short-lived, one-time, session-bound opaque ticket. Only a keyed hash is stored. ECS atomically consumes it before accepting `start` or audio and verifies user, session, audience/environment, protocol version, expiry, connection attempt, and current session state.

Preferred transport is either a narrowly scoped Secure/HttpOnly/SameSite cookie or `Sec-WebSocket-Protocol`, selected after a browser, Amplify-domain, ALB-log, and CSRF/origin proof. Query-string transport is rejected unless logging exposure is conclusively controlled.

Reconnect requires a new ticket. DynamoDB TTL is cleanup only; ECS checks expiry itself.

## Alternatives

- Cognito token in query string: simple but excessive credential exposure.
- Presigned Transcribe URL: violates Option B and bypasses backend lifecycle control.
- Long-lived application ticket: increases replay window.
- API Gateway WebSocket authorization: would put the continuous data plane in a component explicitly excluded by the architecture.

## Consequences

The control API and ECS share ticket schema/atomic consumption. Multi-domain cookie behavior or subprotocol handling needs an integration test. Access logs must be reviewed for secret exposure. Ticket issuance becomes a capacity- and state-sensitive operation.

## Acceptance evidence

Tests cover expiry, replay, concurrent consumption, wrong owner/session/audience, disallowed origin, reconnect renewal, and log redaction. The team records ticket lifetime and chosen transport before acceptance.

