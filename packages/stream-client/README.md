# Browser Stream Client

Owners: Person 1 for browser integration; Person 3 for protocol/audio requirements

This package will hide the application WebSocket protocol from React components. Its public interface will cover connection state, start/stop, audio frames, partial/final captions, warnings, errors, and reconnect requests.

It will not contain AWS credentials, Amazon Transcribe signing, or provider-specific event types.

Implementation begins only after the shared workspace toolchain and ADR-006 are accepted.

