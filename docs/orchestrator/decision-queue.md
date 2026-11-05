# Option A Decision Queue

Only the direct browser-to-Transcribe topology is decided by [ADR-010](../adr/010-option-a-migration.md). The following decisions need team review before corresponding implementation:

1. **Privacy and account:** approved Region/data residency, user consent, transcript retention/deletion including backups, regulated-data scope, AWS account and spend authorization.
2. **Signing and capacity:** Lambda signer role, URL expiry below AWS's five-minute maximum, signing rate limits, active-stream target, verified Transcribe quota/start rate, replay/cost monitoring.
3. **Session and upload:** canonical states and transition owners, epoch/reconnect policy, final segment identity/ordering, idempotency key and retry window, upload bounds and failure response.
4. **Storage and export:** DynamoDB keys/indexes/conditional writes, S3 export publishing, deletion reconciliation, backup/restore and migration strategy.
5. **Quality and release:** supported browsers, PCM/resampler evidence, test audio provenance, telemetry schema, bounded AWS tests, manual Console resource inventory and cleanup.

Record decisions in accepted ADRs and shared contracts. A `PROPOSED` design is guidance, not permission to deploy or a runtime guarantee.
