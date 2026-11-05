# End-to-End Acceptance — Person 5

Status: plan only; no browser or deployed Option A journey has run.

First authorized path: Cognito sign-in → create session → API-signed URL → direct browser WebSocket to Transcribe → live partial/final captions → authenticated final upload and save acknowledgment → DynamoDB history → private S3 export/download → deletion. Record that saved text is client supplied. A second path proves two-user isolation. Exercise disconnect, expired URL, duplicate upload, failed export, and privacy-safe logs. Use approved audio, account, Region, cost bound, and cleanup. Local mocks do not prove AWS behavior.
