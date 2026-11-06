import {
  AUDIO_CHANNELS,
  AUDIO_CHUNK_DURATION_MS,
  AUDIO_PCM_BYTES_PER_CHUNK,
  AUDIO_SAMPLE_RATE_HZ,
  AUDIO_SAMPLES_PER_CHUNK,
} from '@live-transcription/contracts';

export interface PcmChunk {
  pcm: ArrayBuffer;
  sequence: number;
  startSample: number;
  validSamples: number;
  final: boolean;
}

export interface CaptureStatus {
  receivedChunks: number;
  sampleRate: number;
  level: number;
}

export class MicrophoneCapture {
  private context: AudioContext | undefined;
  private media: MediaStream | undefined;
  private processor: AudioWorkletNode | undefined;
  private source: MediaStreamAudioSourceNode | undefined;
  private sink: GainNode | undefined;
  private started = false;
  private chunkCount = 0;
  private flushResolver: (() => void) | undefined;

  constructor(
    private readonly onChunk: (chunk: PcmChunk) => void,
    private readonly onStatus: (status: CaptureStatus) => void,
  ) {}

  async start(): Promise<void> {
    if (this.started) return;
    if (!navigator.mediaDevices?.getUserMedia || !('AudioWorkletNode' in window)) {
      throw new Error('This browser does not support the required microphone AudioWorklet.');
    }
    try {
      this.media = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: AUDIO_CHANNELS, echoCancellation: true, noiseSuppression: true },
      });
      this.context = new AudioContext();
      await this.context.audioWorklet.addModule('/worklets/pcm-processor.js');
      this.processor = new AudioWorkletNode(this.context, 'cloudscribe-pcm', {
        processorOptions: {
          targetRate: AUDIO_SAMPLE_RATE_HZ,
          chunkSamples: AUDIO_SAMPLES_PER_CHUNK,
          bytesPerChunk: AUDIO_PCM_BYTES_PER_CHUNK,
          chunkMs: AUDIO_CHUNK_DURATION_MS,
        },
      });
      this.processor.port.onmessage = (event: MessageEvent) => {
        const data: unknown = event.data;
        if (typeof data !== 'object' || data === null || !('type' in data)) return;
        if (
          data.type === 'chunk' &&
          'pcm' in data &&
          data.pcm instanceof ArrayBuffer &&
          'sequence' in data &&
          'startSample' in data &&
          'validSamples' in data &&
          'final' in data &&
          typeof data.sequence === 'number' &&
          typeof data.startSample === 'number' &&
          typeof data.validSamples === 'number' &&
          typeof data.final === 'boolean'
        ) {
          this.chunkCount += 1;
          this.onChunk({
            pcm: data.pcm,
            sequence: data.sequence,
            startSample: data.startSample,
            validSamples: data.validSamples,
            final: data.final,
          });
          this.onStatus({
            receivedChunks: this.chunkCount,
            sampleRate: this.context?.sampleRate ?? 0,
            level: 0,
          });
        } else if (data.type === 'flushed') {
          this.flushResolver?.();
          this.flushResolver = undefined;
        }
      };
      this.source = this.context.createMediaStreamSource(this.media);
      this.sink = this.context.createGain();
      this.sink.gain.value = 0;
      this.source.connect(this.processor).connect(this.sink).connect(this.context.destination);
      await this.context.resume();
      this.started = true;
    } catch (error) {
      await this.release();
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    if (this.processor) {
      await Promise.race([
        new Promise<void>((resolve) => {
          this.flushResolver = resolve;
          this.processor?.port.postMessage({ type: 'flush' });
        }),
        new Promise<void>((resolve) => setTimeout(resolve, 500)),
      ]);
    }
    await this.release();
  }

  private async release(): Promise<void> {
    this.source?.disconnect();
    this.processor?.disconnect();
    this.sink?.disconnect();
    this.media?.getTracks().forEach((track) => track.stop());
    await this.context?.close().catch(() => undefined);
    this.context = undefined;
    this.media = undefined;
    this.processor = undefined;
    this.source = undefined;
    this.sink = undefined;
    this.flushResolver = undefined;
  }
}
