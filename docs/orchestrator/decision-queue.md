# Option A Decision Queue

ADR-010 fixes the direct browser topology and ADR-011 fixes the minimum Phase 1 integration slice. Resolve only decisions that block that slice before implementation.

## Phase 1 blockers

1. **Integration environment:** approved AWS account, Region, deployer, small cost bound, and cleanup owner.
2. **Cognito/API configuration:** issuer, public browser app client, local callback origin, and API authorization claims.
3. **Stream URL policy:** initial expiry, issuance limit, allowed language, Region, and PCM parameters. Start with a proposed 60-second connection-start expiry and verify it.
4. **Minimum contract freeze:** exact Zod request/response fields, idempotency-key transport, text/batch bounds, and error status mapping.
5. **DynamoDB minimum:** session/final keys, conditional duplicate behavior, and owner-scoped history query.
6. **Test data:** approved synthetic/licensed audio and authorization for the bounded one-hour acceptance run.

## Deliberately later

- Recorded-file upload and batch transcription.
- Audio retention and upload buckets.
- S3 transcript exports.
- Summarization and other derived transcript artifacts.
- Advanced retention/backups, production environments/SLOs, load testing, and broad browser support.

Later decisions must not be silently implemented as part of the Phase 1 slice. Record accepted decisions in ADRs and shared contracts.
