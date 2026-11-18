# MVP Development Deployment

Status: ordered path to a testable development MVP, not a production deployment claim.

## Entry requirements

- Critical shared contracts and repository outcomes are accepted.
- Current frontend stream integration works locally with fake provider/API boundaries.
- All Phase 1 handlers work with the deterministic repository fake.
- DynamoDB adapter tests match fake semantics.
- Person 5's local create-to-delete journey and failure suite pass.
- `npm run check` passes; relevant Python tests pass.
- Account, `us-east-2`, budget, deployer, test data and cleanup are explicitly approved.
- Tracked example/configuration files contain placeholders only.

## Deployment order

1. **Inventory existing development resources.** Reuse the approved Cognito User Pool/public client, HTTP API and signer resources only after verifying their configuration. Record identifiers privately.
2. **Deploy persistence.** Create the approved DynamoDB design with the agreed naming/tags/billing/cleanup settings. Do not add S3 or raw-audio storage.
3. **Prepare the Lambda runtime role.** Grant only project logging, approved DynamoDB access and `transcribe:StartStreamTranscriptionWebSocket`. Never expose credentials to the browser.
4. **Build and deploy the production API composition.** Replace the guarded single-session smoke repository with the DynamoDB adapter and approved configuration.
5. **Configure every HTTP route.** Attach Lambda integrations and the Cognito JWT authorizer to create/list/read/rename/stream-url/segments/complete/delete routes.
6. **Configure CORS and throttling.** Allow only approved local/deployed frontend origins and required methods/headers. Set reviewed development throttles.
7. **Configure privacy-safe operations.** Apply finite log retention, allow-listed logging/metrics, budget monitoring and cleanup ownership.
8. **Build the frontend.** Supply public development configuration at build/runtime without committing identifiers. Remove the fixed smoke session; sessions come from `POST /v1/sessions`.
9. **Deploy static frontend hosting.** Use the separately reviewed hosting choice and HTTPS origin; update Cognito/CORS only for that approved origin.
10. **Run acceptance in order.** Short single-user smoke, two-user isolation, duplicate/conflict, forced reconnect/new epoch, expired/rejected signing, history/deletion and privacy review.
11. **Run the one-hour test.** Only after explicit final approval and earlier acceptance success.

## Release gate for user testing

Users may begin the controlled pilot only when:

- two separate Cognito users complete the required isolation checks;
- one user completes sign-in through deletion against durable storage;
- mic-only, system-only and mixed capture are verified in supported browsers;
- forced reconnect retains one logical session and acknowledged finals;
- logs contain no prohibited data;
- known limitations, browser support, consent text, support contact, budget and cleanup are documented;
- Person 5 publishes the acceptance result and all affected owners approve it.

IAM Identity Center accounts are for teammates operating AWS. Pilot application users receive Cognito accounts only.

## Rollback and cleanup

If a deployment fails a security, ownership, privacy or durability check, stop the pilot, disable the affected API route or frontend entry point, stop active streams, and return to the last verified configuration. Preserve only privacy-safe evidence. The infrastructure owner performs the approved cleanup and records remaining shared resources, retention and estimated cost privately.

## Not included

Production SLOs, multiple environments, load testing, recorded upload, S3 exports, summaries, shared rooms, raw-audio storage and production-scale infrastructure remain deferred.
