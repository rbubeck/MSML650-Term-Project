# Local Integration Tests

Status: planned; no Option A cross-package tests exist.

Use contract-compliant Cognito identity, signer, DynamoDB/S3, WebSocket and EventStream fakes to test browser-client/API/persistence handoffs without AWS. Prioritize final upload idempotency, ownership isolation, save acknowledgment, export readiness, reconnect epoch behavior, and secret-safe errors/logs. Provider wire fixtures remain inside the direct stream client; Zod application shapes remain in shared contracts.
