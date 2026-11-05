import {
  StartStreamTranscriptionCommand,
  TranscribeStreamingClient,
} from '@aws-sdk/client-transcribe-streaming';
import type {
  AudioStream,
  LanguageCode,
  StartStreamTranscriptionCommandInput,
  StartStreamTranscriptionCommandOutput,
} from '@aws-sdk/client-transcribe-streaming';
import { AUDIO_PCM_BYTES_PER_FRAME, AUDIO_SAMPLE_RATE_HZ } from '@live-transcription/contracts';
import type {
  TranscriptResult,
  TranscriptionProvider,
  TranscriptionRequest,
} from './transcription-provider.js';

export type AwsStartStream = (
  input: StartStreamTranscriptionCommandInput,
  abortSignal?: AbortSignal,
) => Promise<StartStreamTranscriptionCommandOutput>;

export interface AwsTranscribeProviderConfig {
  readonly region: string;
}

export class InvalidProviderAudioError extends Error {
  constructor(readonly actualBytes: number) {
    super(`Provider audio chunks must contain exactly ${AUDIO_PCM_BYTES_PER_FRAME} bytes.`);
    this.name = 'InvalidProviderAudioError';
  }
}

export class MissingTranscriptStreamError extends Error {
  constructor() {
    super('Amazon Transcribe did not return a transcript result stream.');
    this.name = 'MissingTranscriptStreamError';
  }
}

async function* toAwsAudioStream(audio: AsyncIterable<Uint8Array>): AsyncIterable<AudioStream> {
  for await (const pcm of audio) {
    if (pcm.byteLength !== AUDIO_PCM_BYTES_PER_FRAME) {
      throw new InvalidProviderAudioError(pcm.byteLength);
    }

    yield { AudioEvent: { AudioChunk: pcm } };
  }
}

export class AwsTranscribeProvider implements TranscriptionProvider {
  constructor(private readonly startStream: AwsStartStream) {}

  async *transcribe(request: TranscriptionRequest): AsyncIterable<TranscriptResult> {
    const response = await this.startStream(
      {
        LanguageCode: request.languageCode as LanguageCode,
        MediaEncoding: 'pcm',
        MediaSampleRateHertz: AUDIO_SAMPLE_RATE_HZ,
        EnablePartialResultsStabilization: true,
        PartialResultsStability: 'medium',
        AudioStream: toAwsAudioStream(request.audio),
      },
      request.abortSignal,
    );

    if (response.TranscriptResultStream === undefined) {
      throw new MissingTranscriptStreamError();
    }

    for await (const event of response.TranscriptResultStream) {
      const results = event.TranscriptEvent?.Transcript?.Results ?? [];
      for (const result of results) {
        const transcript = result.Alternatives?.[0]?.Transcript;
        if (transcript === undefined || transcript.length === 0 || result.ResultId === undefined) {
          continue;
        }

        yield {
          type: result.IsPartial === true ? 'partial' : 'final',
          providerResultId: result.ResultId,
          transcript,
          ...(result.StartTime === undefined ? {} : { startTimeSeconds: result.StartTime }),
          ...(result.EndTime === undefined ? {} : { endTimeSeconds: result.EndTime }),
        };
      }
    }
  }
}

export function createAwsTranscribeProvider(
  config: AwsTranscribeProviderConfig,
): AwsTranscribeProvider {
  const client = new TranscribeStreamingClient({ region: config.region });

  return new AwsTranscribeProvider(async (input, abortSignal) => {
    const command = new StartStreamTranscriptionCommand(input);
    return abortSignal === undefined ? client.send(command) : client.send(command, { abortSignal });
  });
}
