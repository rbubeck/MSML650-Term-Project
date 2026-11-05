import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { AUDIO_FRAME_DURATION_MS, AUDIO_PCM_BYTES_PER_FRAME } from '@live-transcription/contracts';
import { createAwsTranscribeProvider } from './aws-transcribe-provider.js';
import { loadSmokePcm, padFinalPcmFrame } from './smoke-audio.js';

const MAX_SMOKE_SECONDS = 30;
const MAX_SMOKE_BYTES = (MAX_SMOKE_SECONDS * 1_000 * AUDIO_PCM_BYTES_PER_FRAME) / 100;

function usage(): never {
  throw new Error(
    'Usage: AWS_PROFILE=<profile> AWS_REGION=<region> npm run transcribe:smoke --workspace @live-transcription/streaming -- <audio.wav|audio.pcm>',
  );
}

async function* pacedFrames(pcm: Uint8Array, signal: AbortSignal): AsyncIterable<Uint8Array> {
  for (let offset = 0; offset < pcm.byteLength; offset += AUDIO_PCM_BYTES_PER_FRAME) {
    signal.throwIfAborted();
    yield pcm.slice(offset, offset + AUDIO_PCM_BYTES_PER_FRAME);
    if (offset + AUDIO_PCM_BYTES_PER_FRAME < pcm.byteLength) {
      await delay(AUDIO_FRAME_DURATION_MS, undefined, { signal });
    }
  }
}

async function main(): Promise<void> {
  const path = process.argv[2] ?? usage();
  const region = process.env['AWS_REGION'] ?? process.env['AWS_DEFAULT_REGION'];
  if (region === undefined || region.length === 0) {
    throw new Error('Set AWS_REGION to the approved development Region.');
  }

  const languageCode = process.env['TRANSCRIBE_LANGUAGE_CODE'] ?? 'en-US';
  const inputPcm = loadSmokePcm(path, await readFile(path));
  if (inputPcm.byteLength === 0) {
    throw new Error('Audio input must not be empty.');
  }
  const pcm = padFinalPcmFrame(inputPcm);
  if (pcm.byteLength > MAX_SMOKE_BYTES) {
    throw new Error(`Smoke-test audio is limited to ${MAX_SMOKE_SECONDS} seconds.`);
  }

  const abortController = new AbortController();
  process.once('SIGINT', () => abortController.abort(new Error('Interrupted by the operator.')));

  const provider = createAwsTranscribeProvider({ region });
  for await (const result of provider.transcribe({
    audio: pacedFrames(pcm, abortController.signal),
    languageCode,
    abortSignal: abortController.signal,
  })) {
    process.stdout.write(`[${result.type}] ${result.transcript}\n`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown smoke-test failure.';
  process.stderr.write(`Amazon Transcribe smoke test failed: ${message}\n`);
  process.exitCode = 1;
});
