import { AUDIO_PCM_BYTES_PER_FRAME } from '@live-transcription/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  AwsTranscribeProvider,
  InvalidProviderAudioError,
  MissingTranscriptStreamError,
} from './aws-transcribe-provider.js';
import type { AwsStartStream } from './aws-transcribe-provider.js';

async function* audioChunks(...sizes: number[]): AsyncIterable<Uint8Array> {
  for (const size of sizes) {
    yield new Uint8Array(size);
  }
}

describe('AwsTranscribeProvider', () => {
  it('sends contract PCM and maps partial and final results', async () => {
    const startStream = vi.fn<AwsStartStream>(async (input) => {
      const chunks: Uint8Array[] = [];
      for await (const event of input.AudioStream ?? []) {
        if (event.AudioEvent?.AudioChunk !== undefined) {
          chunks.push(event.AudioEvent.AudioChunk);
        }
      }

      expect(chunks).toHaveLength(2);
      expect(chunks.every((chunk) => chunk.byteLength === AUDIO_PCM_BYTES_PER_FRAME)).toBe(true);

      return {
        $metadata: {},
        TranscriptResultStream: (async function* () {
          yield {
            TranscriptEvent: {
              Transcript: {
                Results: [
                  {
                    ResultId: 'result-1',
                    IsPartial: true,
                    StartTime: 0,
                    EndTime: 0.4,
                    Alternatives: [{ Transcript: 'hello' }],
                  },
                ],
              },
            },
          };
          yield {
            TranscriptEvent: {
              Transcript: {
                Results: [
                  {
                    ResultId: 'result-1',
                    IsPartial: false,
                    StartTime: 0,
                    EndTime: 0.8,
                    Alternatives: [{ Transcript: 'hello world' }],
                  },
                ],
              },
            },
          };
        })(),
      };
    });
    const provider = new AwsTranscribeProvider(startStream);

    const results = [];
    for await (const result of provider.transcribe({
      audio: audioChunks(AUDIO_PCM_BYTES_PER_FRAME, AUDIO_PCM_BYTES_PER_FRAME),
      languageCode: 'en-US',
    })) {
      results.push(result);
    }

    expect(startStream).toHaveBeenCalledOnce();
    expect(startStream.mock.calls[0]?.[0]).toMatchObject({
      LanguageCode: 'en-US',
      MediaEncoding: 'pcm',
      MediaSampleRateHertz: 16_000,
      EnablePartialResultsStabilization: true,
      PartialResultsStability: 'medium',
    });
    expect(results).toEqual([
      {
        type: 'partial',
        providerResultId: 'result-1',
        transcript: 'hello',
        startTimeSeconds: 0,
        endTimeSeconds: 0.4,
      },
      {
        type: 'final',
        providerResultId: 'result-1',
        transcript: 'hello world',
        startTimeSeconds: 0,
        endTimeSeconds: 0.8,
      },
    ]);
  });

  it('rejects a chunk that violates the fixed audio contract', async () => {
    const startStream = vi.fn<AwsStartStream>(async (input) => {
      for await (const event of input.AudioStream ?? []) {
        // Consuming the SDK request stream triggers boundary validation.
        void event;
      }
      return { $metadata: {} };
    });
    const provider = new AwsTranscribeProvider(startStream);

    await expect(async () => {
      for await (const result of provider.transcribe({
        audio: audioChunks(12),
        languageCode: 'en-US',
      })) {
        // The provider produces no result for invalid input.
        void result;
      }
    }).rejects.toEqual(new InvalidProviderAudioError(12));
  });

  it('fails explicitly when AWS omits the result stream', async () => {
    const provider = new AwsTranscribeProvider(async () => ({ $metadata: {} }));

    await expect(async () => {
      for await (const result of provider.transcribe({
        audio: audioChunks(),
        languageCode: 'en-US',
      })) {
        // The missing response stream fails before yielding.
        void result;
      }
    }).rejects.toBeInstanceOf(MissingTranscriptStreamError);
  });
});
