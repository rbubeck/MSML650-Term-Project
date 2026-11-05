# Frontend — Person 1

Status: workspace boundary only; no React app or browser capture implementation exists.

Build authentication UX, microphone permission/capture, accessible live captions, session/history/export UI, and explicit save states. Use `@live-transcription/stream-client` for the direct Transcribe connection and `@live-transcription/contracts` for shared application schemas and PCM targets. Keep provider EventStream and signed-URL handling out of React components.

First tasks: select/scaffold the approved frontend tool, build a fake-backed session UI, implement AudioWorklet mono conversion and 44.1/48-to-16 kHz resampling, then integrate Person 3's client interface. Show partial/final-observed/save-acknowledged states separately. Never persist raw audio or put signed URLs in history, logs, or analytics. Review browser support and consent text before real microphone integration.
