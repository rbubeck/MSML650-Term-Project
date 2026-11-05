# Persistence — Person 4

Status: workspace boundary and proposed model only; no DynamoDB/S3 adapter or resource exists.

Provide owner-scoped session/final-segment repositories and private S3 export/deletion boundaries to Person 2. Save only authenticated, validated **client-uploaded final text**. Conditional/idempotent writes deduplicate retries; export readiness follows durable publication; deletion denies reads before physical cleanup. Keep partials and raw audio out of storage.

First tasks: review [data model](../../docs/data-model.md) and lifecycle with Person 2; define narrow interfaces and deterministic fakes; test duplicate/conflicting upload, ownership isolation, export retry, and deletion. Finalize keys, limits, retention, and backups only after team decision. Person 4 owns Console setup in [infrastructure](../../infrastructure/README.md).
