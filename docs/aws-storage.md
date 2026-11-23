# CloudScribe development AWS storage

This handoff records the standalone `us-east-2` segment-save Lambda and its reported smoke tests. Use the private team inventory for account and resource identifiers. The Phase 1 application uses `POST /v1/sessions/{sessionId}/segments` with shared Zod request and acknowledgment schemas. See [API_CONTRACTS.md](../API_CONTRACTS.md) and [the data model](data-model.md) for that integration.

## Storage and access

| DynamoDB table | Partition key | Sort key | Role |
| --- | --- | --- | --- |
| Users | `userId` (String) | None | User records. The segment Lambda does not use this table. |
| Sessions | `userId` (String) | `sessionKey` (String) | Ownership lookup by Cognito `sub`, with the request's `sessionId` used as the `sessionKey` value. |
| Segments | `sessionId` (String) | `segmentKey` (String) | Stores client-supplied final segments with `segmentKey = streamId + '#' + resultId`. |

The tables were reportedly created with Console defaults. Verify billing mode, provisioned capacity if applicable, encryption, point-in-time recovery, TTL, and deletion protection in DynamoDB. Use `describe-table` for the key schema and table settings. [DynamoDB table inspection](https://docs.aws.amazon.com/cli/latest/reference/dynamodb/describe-table.html)

ADR-011 defers S3 transcript exports beyond Phase 1. The existing bucket was intended to be private, general purpose, and in `us-east-2`, with all Block Public Access settings enabled, Bucket owner enforced (ACLs disabled), versioning disabled, and SSE-S3 default encryption. Verify these settings in S3 Properties and Permissions, including the bucket policy and public access status. The segment Lambda only uses DynamoDB. [S3 configuration checks](https://docs.aws.amazon.com/AmazonS3/latest/userguide/GettingStartedS3CLI.html)

## Save endpoint

On the dev HTTP API, `POST /segments` at the `$default` stage uses a Cognito JWT authorizer and Lambda payload format 2.0. Look up the invoke URL, issuer, app client ID, function, and role in the private team inventory. The role needs `dynamodb:GetItem` on Sessions, `dynamodb:PutItem` on Segments, and CloudWatch Logs permissions. Configure `SEGMENTS_TABLE`, `SESSIONS_TABLE`, and `SESSIONS_SORT_KEY` on the Node.js 24.x function.

The [Console-format handler](../backend/api/src/save-segment/index.mjs) matches the behavior of the verified AWS Console source supplied in the handoff. The entry point is `index.handler`, and the source uses AWS SDK v3's DynamoDB Document Client. See the [environment example](../backend/api/src/save-segment/.env.example) for the required settings. [AWS Lambda Node.js handler guide](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html)

Send the Cognito access token in the `Authorization: Bearer …` header. Send JSON with the following fields using a session owned by the caller. Use a distinct `sessionId` for each session across users because Segments is keyed by session ID alone.

```json
{
  "sessionId": "example-session",
  "streamId": "example-stream",
  "resultId": "example-result",
  "text": "Example final segment.",
  "startTime": 0,
  "endTime": 1.5
}
```

The Lambda validates the payload first, then derives the owner from `requestContext.authorizer.jwt.claims.sub`. For direct invocation tests, supply the segment fields at the event root and the simulated `sub` at that same claims path. A strongly consistent read must find that owner's session before the segment write.

| Status | JSON `message` |
| --- | --- |
| `400` | `Request body must be valid JSON` or `Invalid transcript segment` |
| `401` | `Authentication required` |
| `403` | `Session access denied` |
| `200` | `Segment saved successfully` |

DynamoDB errors fail the Lambda invocation. The handler uses an unconditional `PutItem`, so a repeat with the same key writes to the same row and a changed payload can replace it. Use identical payloads for retry tests. Treat uploads as client-supplied text and keep partials in the browser.

## Evidence and next checks

- **Reported AWS tests.** A direct Lambda write succeeded and the DynamoDB row was checked. Simulated matching and different owners returned `200` and `403`. Deployed requests with missing or invalid tokens returned `401`. A terminal test signed in to Cognito, sent the access token to `POST /segments`, received `200`, and verified the DynamoDB row. The test session was inserted manually under the test user's Cognito `sub`.
- **Local checks.** Run `npm test -- backend/api/src/save-segment/index.test.ts` from the root to exercise the handler with a DynamoDB fake. These checks cover direct and base64 HTTP API v2 invocations, validation and ownership, retries, and DynamoDB failures. No AWS credentials are needed.
- **Pending for this save path.** Browser-to-save integration, CORS, app-driven session creation, and the Phase 1 final-upload acknowledgment flow. The earlier live-caption smoke is recorded in the [project README](../README.md). Persons 2 and 4 own the API/storage handoff, with Persons 1 and 3 reviewing final uploads and Person 5 reviewing test evidence.
