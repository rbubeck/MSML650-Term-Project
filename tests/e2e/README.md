# End-to-End Tests

Status: acceptance plan only; no browser or deployed-environment e2e suite exists.

Owner: Person 5

The first deployed target is one authenticated user who creates a session, connects with a one-time ticket, streams approved microphone/sample audio, sees partial/final captions, stops, and retrieves a durable transcript. The second target is two concurrent users with strict isolation.

## Preconditions

- accepted auth/state/persistence/deployment ADRs;
- approved dev/staging environment and cost bound;
- synthetic or licensed/consented audio;
- explicit cleanup and retention behavior;
- privacy-safe logs and stable test identities;
- Person 4 authorizes infrastructure use and Person 5 defines acceptance evidence.

Local PR checks must not require AWS. Deployed tests record Region, build/contract versions, duration, requested concurrency, outcomes and estimated cost without recording audio, transcript text, credentials or tokens.

Do not claim an end-to-end path exists until the browser, control API, WebSocket service, Transcribe, durable checkpoint/export and history retrieval all pass in one authorized environment.
