# Shared Contract Proposals

Status: Proposed; not yet published as a package.

This directory is the future single source for runtime schemas and generated TypeScript/OpenAPI types. During bootstrap it contains tool-neutral machine-readable proposals:

- `openapi.yaml`: HTTP control API surface.
- `session.schema.json`: public session representation.
- `websocket.schema.json`: JSON WebSocket control/event messages.

`API_CONTRACTS.md` defines semantics not expressible in schema, including authorization, ticket consumption, lifecycle ownership, binary PCM framing, idempotency, and recovery.

The team must select the TypeScript workspace, runtime validation library, OpenAPI generation direction, and compatibility tooling before implementation. Generated files must never become a second independently edited source.

