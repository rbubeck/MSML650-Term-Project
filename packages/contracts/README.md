# Shared Contracts

Status: binary audio contract implemented; structured HTTP/WebSocket/session Zod schemas remain proposed snapshots.

Owner: cross-owner review

This workspace is the canonical home for runtime schemas, inferred TypeScript types, stable constants and specialized binary codecs shared across components.

## Implemented and authoritative

`src/audio-frame.ts` defines and validates the accepted ADR-006 binary audio contract:

- fixed audio/header/message sizes and format constants;
- binary encode/decode for browser `ArrayBuffer` and Node `Uint8Array` views;
- sequence and logical capture-time validation;
- consecutive-frame continuity checks;
- stable typed validation error codes.

Its colocated tests cover golden bytes, buffer offsets, malformed headers, invalid fields, exact payload sizes, continuity and silence. Consumers import these constants/functions rather than copying offsets or values.

## Proposed review snapshots

- `openapi.yaml`: proposed HTTP control API;
- `session.schema.json`: proposed public session representation;
- `websocket.schema.json`: proposed JSON WebSocket control/event messages.

These three files are not deployed, generated or canonical runtime validators yet. They may change when ADR-001 through ADR-003 are accepted. `API_CONTRACTS.md` documents semantics that schemas alone cannot express.

## Next shared-contract work

1. Person 2 leads Zod HTTP/error/session schemas with Persons 1/4 reviewing consumers/storage.
2. Person 3 leads Zod WebSocket control/event schemas with Person 1 reviewing the client API.
3. Generate OpenAPI/JSON Schema artifacts from Zod after generation tooling is agreed; never maintain two editable sources.
4. Add example compatibility tests and version breaking changes with an ADR/migration plan.

Provider-specific AWS SDK types do not belong in this package.
