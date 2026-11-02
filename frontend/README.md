# Frontend

Owner: Person 1

This directory will contain the React/TypeScript web application: authentication UX, dashboard, microphone controls, live captions, transcript history, accessibility, and user-facing failure states.

The frontend must consume shared contracts from `packages/contracts` and the browser streaming API from `packages/stream-client`. It must not implement Amazon Transcribe framing or receive AWS credentials.

## First contribution boundary

After the toolchain decision, Person 1 may scaffold the application shell and use contract-compliant mocks. Microphone capture begins only after the audio contract in ADR-006 is accepted with Person 3.

No frontend framework or build files have been generated yet.

