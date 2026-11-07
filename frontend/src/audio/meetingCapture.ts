/**
 * Browser-only meeting audio capture. No network requests, persistence or AWS protocol.
 *
 * `getDisplayMedia` always requires a user-selected video surface, even if the app only
 * consumes its audio track. The video track is never connected, encoded or stored.
 */
import {
  AUDIO_CHANNELS,
  AUDIO_CHUNK_DURATION_MS,
  AUDIO_PCM_BYTES_PER_CHUNK,
  AUDIO_SAMPLE_RATE_HZ,
  AUDIO_SAMPLES_PER_CHUNK,
} from '@live-transcription/contracts';
import type { PcmChunk } from './microphone';

export type MeetingCaptureMode = 'both' | 'meeting';

export interface MeetingCaptureStatus {
  receivedChunks: number;
  sampleRate: number;
  micLevel: number;
  meetingLevel: number;
}

/** Relative RMS, 0..1; never retains the input samples. */
export function rmsOfFloatSamples(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let power = 0;
  for (const sample of samples) {
    if (!Number.isFinite(sample)) continue;
    const clipped = Math.max(-1, Math.min(1, sample));
    power += clipped * clipped;
  }
  return Math.min(1, Math.sqrt(power / samples.length));
}

/** Two sources share headroom; one source uses the whole output range. */
export function captureGains(mode: MeetingCaptureMode): { mic: number; meeting: number } {
  return mode === 'both' ? { mic: 0.5, meeting: 0.5 } : { mic: 0, meeting: 1 };
}

export function visualLevel(level: number): number {
  return Math.min(1, Math.sqrt(Math.max(0, level)) * 1.9);
}

export class MeetingSessionCapture {
  private displayMedia: MediaStream | undefined;
  private micMedia: MediaStream | undefined;
  private context: AudioContext | undefined;
  private processor: AudioWorkletNode | undefined;
  private silenceSink: GainNode | undefined;
  private sources: MediaStreamAudioSourceNode[] = [];
  private micAnalyser: AnalyserNode | undefined;
  private meetingAnalyser: AnalyserNode | undefined;
  private flushResolver: (() => void) | undefined;
  private receivedChunks = 0;
  private started = false;
  private stopped = false;

  constructor(
    private readonly mode: MeetingCaptureMode,
    private readonly onChunk: (chunk: PcmChunk) => void,
    private readonly onStatus: (status: MeetingCaptureStatus) => void,
    private readonly onShareEnded: () => void,
  ) {}

  /** MUST be initiated directly in a user's click handler (browser user activation). */
  async start(): Promise<void> {
    if (this.started || this.stopped) throw new Error('Create a new capture for each session.');
    if (!navigator.mediaDevices?.getDisplayMedia || !('AudioWorkletNode' in window)) {
      throw new Error('This browser does not support meeting audio sharing and AudioWorklet.');
    }

    try {
      // This must be the FIRST permission request. No await before this call:
      // getDisplayMedia requires transient user activation from the click.
      const options: DisplayMediaStreamOptions & {
        systemAudio?: 'include' | 'exclude';
        windowAudio?: 'window' | 'system' | 'exclude';
        selfBrowserSurface?: 'include' | 'exclude';
      } = {
        video: true,
        audio: true,
        systemAudio: 'include',
        windowAudio: 'system',
        selfBrowserSurface: 'exclude',
      };
      this.displayMedia = await navigator.mediaDevices.getDisplayMedia(options);
      if (this.stopped) throw new Error('Meeting sharing ended before capture started.');

      const meetingAudio = this.displayMedia
        .getAudioTracks()
        .find((track) => track.readyState === 'live');
      if (!meetingAudio) {
        throw new Error(
          'No meeting audio was shared. Choose a tab/window/screen with audio and enable Share audio in the browser picker.',
        );
      }
      const displayVideo = this.displayMedia.getVideoTracks()[0];
      if (displayVideo) displayVideo.addEventListener('ended', this.handleShareEnded);
      meetingAudio.addEventListener('ended', this.handleShareEnded);

      if (this.mode === 'both') {
        if (!navigator.mediaDevices.getUserMedia)
          throw new Error('Microphone capture is unavailable.');
        this.micMedia = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: AUDIO_CHANNELS, echoCancellation: true, noiseSuppression: true },
        });
        if (this.stopped)
          throw new Error('Meeting sharing ended before microphone access completed.');
      }

      const context = new AudioContext();
      this.context = context;
      await context.audioWorklet.addModule('/worklets/pcm-processor.js');
      if (this.stopped) throw new Error('Meeting sharing ended during audio preparation.');
      const processor = new AudioWorkletNode(context, 'cloudscribe-pcm', {
        processorOptions: {
          targetRate: AUDIO_SAMPLE_RATE_HZ,
          chunkSamples: AUDIO_SAMPLES_PER_CHUNK,
          bytesPerChunk: AUDIO_PCM_BYTES_PER_CHUNK,
          chunkMs: AUDIO_CHUNK_DURATION_MS,
        },
      });
      this.processor = processor;
      processor.port.onmessage = (event: MessageEvent) => {
        const data: unknown = event.data;
        if (typeof data !== 'object' || data === null || !('type' in data)) return;
        if (
          data.type === 'chunk' &&
          'pcm' in data &&
          data.pcm instanceof ArrayBuffer &&
          'sequence' in data &&
          typeof data.sequence === 'number' &&
          'startSample' in data &&
          typeof data.startSample === 'number' &&
          'validSamples' in data &&
          typeof data.validSamples === 'number' &&
          'final' in data &&
          typeof data.final === 'boolean'
        ) {
          this.receivedChunks += 1;
          const chunk: PcmChunk = {
            pcm: data.pcm,
            sequence: data.sequence,
            startSample: data.startSample,
            validSamples: data.validSamples,
            final: data.final,
          };
          // Read levels before handing PCM to a future adapter that may transfer its buffer.
          this.onStatus({
            receivedChunks: this.receivedChunks,
            sampleRate: context.sampleRate,
            micLevel: this.micAnalyser ? this.readLevel(this.micAnalyser) : 0,
            meetingLevel: this.meetingAnalyser ? this.readLevel(this.meetingAnalyser) : 0,
          });
          this.onChunk(chunk);
        } else if (data.type === 'flushed') {
          this.flushResolver?.();
          this.flushResolver = undefined;
        }
      };

      const mixer = context.createGain();
      const gains = captureGains(this.mode);
      this.meetingAnalyser = this.connectSource(context, this.displayMedia, mixer, gains.meeting);
      if (this.micMedia) {
        this.micAnalyser = this.connectSource(context, this.micMedia, mixer, gains.mic);
      }
      // Sink is muted: captured meeting sound must NOT be played a second time.
      const sink = context.createGain();
      sink.gain.value = 0;
      this.silenceSink = sink;
      mixer.connect(processor).connect(sink).connect(context.destination);
      await context.resume();
      if (this.stopped) throw new Error('Meeting sharing ended before capture started.');
      this.started = true;
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    if (this.processor && this.started) {
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

  private connectSource(
    context: AudioContext,
    stream: MediaStream,
    mixer: GainNode,
    volume: number,
  ): AnalyserNode {
    const source = context.createMediaStreamSource(stream);
    this.sources.push(source);
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    const gain = context.createGain();
    gain.gain.value = volume;
    source.connect(analyser).connect(gain).connect(mixer);
    return analyser;
  }

  private readLevel(analyser: AnalyserNode): number {
    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    return rmsOfFloatSamples(samples);
  }

  private readonly handleShareEnded = (): void => {
    if (this.stopped) return;
    void this.stop().finally(() => this.onShareEnded());
  };

  private async release(): Promise<void> {
    const video = this.displayMedia?.getVideoTracks()[0];
    video?.removeEventListener('ended', this.handleShareEnded);
    for (const track of this.displayMedia?.getAudioTracks() ?? []) {
      track.removeEventListener('ended', this.handleShareEnded);
    }
    for (const source of this.sources) source.disconnect();
    this.processor?.disconnect();
    this.silenceSink?.disconnect();
    this.displayMedia?.getTracks().forEach((track) => track.stop());
    this.micMedia?.getTracks().forEach((track) => track.stop());
    await this.context?.close().catch(() => undefined);
    this.sources = [];
    this.micAnalyser = undefined;
    this.meetingAnalyser = undefined;
    this.displayMedia = undefined;
    this.micMedia = undefined;
    this.context = undefined;
    this.processor = undefined;
    this.silenceSink = undefined;
    this.flushResolver = undefined;
    this.started = false;
  }
}
