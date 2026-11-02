export interface TranscriptionRequest {
  readonly audio: AsyncIterable<Uint8Array>;
  readonly languageCode: string;
  readonly abortSignal?: AbortSignal;
}

export interface TranscriptResult {
  readonly type: 'partial' | 'final';
  readonly providerResultId: string;
  readonly transcript: string;
  readonly startTimeSeconds?: number;
  readonly endTimeSeconds?: number;
}

export interface TranscriptionProvider {
  transcribe(request: TranscriptionRequest): AsyncIterable<TranscriptResult>;
}
