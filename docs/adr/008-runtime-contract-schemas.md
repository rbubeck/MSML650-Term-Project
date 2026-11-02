# ADR-008: Runtime Contract Schema Source

Status: Accepted  
Accepted: 2026-11-02  
Owner: Person 3 with all component owners as consumers

## Context

HTTP and WebSocket data crosses untrusted runtime boundaries. TypeScript types disappear at runtime and cannot validate data received from browsers, APIs, persistence, or older component versions. Manually maintaining TypeScript types, JSON Schema, OpenAPI, and documentation independently would allow them to drift.

## Decision

Use Zod 4 definitions in `packages/contracts` as the canonical source for structured application contracts. Infer TypeScript types from those schemas and use the same schemas for runtime parsing at component boundaries.

Generate JSON Schema and compatible documentation artifacts from the canonical definitions where practical. Human-readable Markdown continues to define authorization, lifecycle, binary framing, and other semantics that schemas cannot fully express.

Binary PCM frames retain a specialized parser; Zod validates their structured metadata and other JSON messages, not individual audio samples.

## Alternatives

- Hand-authored TypeScript interfaces: no runtime validation.
- Hand-authored JSON Schema with Ajv: language-neutral, but more cumbersome for an all-TypeScript application and requires separate type-generation discipline.
- Independently maintained Zod, JSON Schema, and OpenAPI: rejected because they can drift.

## Consequences

- All structured network input is treated as `unknown` until parsed.
- Consumers import inferred types and schemas from `@live-transcription/contracts`.
- Generated JSON Schema/OpenAPI artifacts are not edited independently once generation is implemented.
- Contract changes require compatibility review and consumer updates.
- Zod becomes a runtime dependency of the contracts package and its consumers' bundles where validation is performed.

## Follow-up

After the TypeScript build/test tooling is selected, implement the smallest v1 schema subset and add tests proving valid examples pass and malformed/unknown fields fail.

