# ADR-010: Direct Browser-to-Transcribe Architecture

Status: Accepted for repository direction by project request, 2026-11-05. Detailed session, security, storage, consent, and deployment choices remain `PROPOSED`/`TBD`.

Owners: technical orchestrator and Persons 1–5.

## Context

The repository described Option B: a browser-to-ECS audio proxy. The team selected Option A and requested an architecture/agent-guidance restructure, without product implementation or resource deployment.

## Decision

The browser connects directly to Amazon Transcribe Streaming over a Lambda-presigned WebSocket URL. The browser implements Amazon EventStream framing/decoding and receives provider results. An authenticated API manages sessions and accepts final text uploads; DynamoDB stores acknowledged finals and S3 holds exports. Stored transcript content is **client supplied**, not independently provider verified. The infrastructure guide is Console-first.

Phase clarification: ADR-011 limits the first integrated MVP to DynamoDB-backed live transcript history and deletion. S3 exports remain compatible with this architecture but are deferred until after Phase 1.

The previous accepted ADR-006 PCM *capture target* remains useful: mono 16 kHz signed 16-bit little-endian PCM, initially 100 ms/3,200 bytes per chunk. Its 16-byte **application header** is superseded and removed. ADR-008 (Zod contracts) and ADR-009 (toolchain) remain active. The Option B ADR-001 through ADR-007 proposals and B-specific code/snapshots are removed; Git history preserves them.

## Alternatives and consequences

The former ECS proxy could observe provider finals and enforce central audio/admission policy but adds infrastructure and cost. Option A removes that service and shifts protocol handling, buffering, reconnect, and upload delivery to the browser. Signed URLs are replayable until expiry, and API-side stored text has client-supplied provenance. Short expiry, rate limits, quotas, monitoring, strict ownership checks, and explicit UI save acknowledgment are needed; exact policies require later review.

## Migration impact

Remove the server streaming workspace, proxy codec, tickets/leases, ECS/ALB/ECR/CDK instructions, and B-specific CI checks. Retain the shared toolchain, reusable PCM constants, evaluation code and artifacts. New Option A functionality is not claimed until independently built and tested.
