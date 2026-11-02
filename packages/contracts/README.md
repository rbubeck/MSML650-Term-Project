# Shared Contract Proposals

Status: Zod 4 source-of-truth decision accepted; implementation pending TypeScript tooling.

This workspace owns the canonical Zod runtime schemas and their inferred TypeScript types. During bootstrap it also contains tool-neutral machine-readable proposals:

- `openapi.yaml`: HTTP control API surface.
- `session.schema.json`: public session representation.
- `websocket.schema.json`: JSON WebSocket control/event messages.

`API_CONTRACTS.md` defines semantics not expressible in schema, including authorization, ticket consumption, lifecycle ownership, binary PCM framing, idempotency, and recovery.

ADR-008 selects Zod 4 as the source of truth. The current OpenAPI and JSON Schema files are reviewed bootstrap snapshots, not generated artifacts yet. After generation is implemented, generated files must never become a second independently edited source.

