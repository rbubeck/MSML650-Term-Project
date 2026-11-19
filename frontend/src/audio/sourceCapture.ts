import {
  AUDIO_CHANNELS,
  AUDIO_CHUNK_DURATION_MS,
  AUDIO_PCM_BYTES_PER_CHUNK,
  AUDIO_SAMPLE_RATE_HZ,
  AUDIO_SAMPLES_PER_CHUNK,
} from '@live-transcription/contracts';
import type { PcmChunk } from './microphone';

/** Only two public source selectors. Both true means a mixed stream. */
export interface AudioSourceSelection {
  microphone: boolean;
  system: boolean;
}

export interface SourceCaptureStatus {
  receivedChunks: number;
  sampleRate: number;
  micLevel: number;
  systemLevel: number;
}

export function sourceGains(sources: AudioSourceSelection): { mic: number; system: number } {
  if (!sources.microphone && !sources.system) throw new Error('Select at least one audio source.');
  return {
    mic: sources.microphone ? (sources.system ? 0.5 : 1) : 0,
    system: sources.system ? (sources.microphone ? 0.5 : 1) : 0,
  };
}

function rms(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (const sample of samples) {
    if (!Number.isFinite(sample)) continue;
    const bounded = Math.max(-1, Math.min(1, sample));
    sum += bounded * bounded;
  }
  return Math.min(1, Math.sqrt(sum / samples.length));
}

export function visualLevel(level: number): number {
  return Math.min(1, Math.sqrt(Math.max(0, level)) * 1.9);
}

/**
 * Two-phase capture: acquire() must be called synchronously from the Start click,
 * because getDisplayMedia requires transient user activation. startProcessing()
 * is invoked only after the provider WebSocket has opened, so no PCM is lost.
 */
export class SourceCapture {
  private display: MediaStream | undefined;
  private mic: MediaStream | undefined;
  private context: AudioContext | undefined;
  private processor: AudioWorkletNode | undefined;
  private sink: GainNode | undefined;
  private readonly nodes: AudioNode[] = [];
  private micAnalyser: AnalyserNode | undefined;
  private systemAnalyser: AnalyserNode | undefined;
  private flushResolver: (() => void) | undefined;
  private started = false;
  private closed = false;
  private acquired = false;
  private chunkCount = 0;

  constructor(
    private readonly selection: AudioSourceSelection,
    private readonly onChunk: (chunk: PcmChunk) => void,
    private readonly onStatus: (status: SourceCaptureStatus) => void,
    private readonly onSourceEnded: () => void,
  ) {}

  async acquire(): Promise<void> {
    sourceGains(this.selection);
    if (this.closed || this.acquired) throw new Error('This capture cannot be reused.');
    if (!navigator.mediaDevices || !('AudioWorkletNode' in window)) {
      throw new Error('Your browser does not support the required audio capture features.');
    }
    try {
      if (this.selection.system) {
        if (!navigator.mediaDevices.getDisplayMedia) {
          throw new Error('System audio sharing is not supported by this browser.');
        }
        // Must be the first permission API invoked, before ANY await.
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
        const display = await navigator.mediaDevices.getDisplayMedia(options);
        if (this.closed) {
          display.getTracks().forEach((track) => track.stop());
          throw new Error('Audio sharing was canceled.');
        }
        this.display = display;
        const sharedAudio = display.getAudioTracks().find((track) => track.readyState === 'live');
        if (!sharedAudio) {
          throw new Error(
            'No system audio was shared. Select a tab, window, or screen that supports audio and enable Share audio.',
          );
        }
        display
          .getVideoTracks()
          .forEach((track) => track.addEventListener('ended', this.handleEnded));
        sharedAudio.addEventListener('ended', this.handleEnded);
      }
      if (this.selection.microphone) {
        if (!navigator.mediaDevices.getUserMedia) {
          throw new Error('Microphone access is unavailable in this browser.');
        }
        const mic = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: AUDIO_CHANNELS, echoCancellation: true, noiseSuppression: true },
        });
        if (this.closed) {
          mic.getTracks().forEach((track) => track.stop());
          throw new Error('Audio capture was canceled.');
        }
        this.mic = mic;
        mic.getAudioTracks().forEach((track) => track.addEventListener('ended', this.handleEnded));
      }
      this.acquired = true;
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async startProcessing(): Promise<void> {
    if (this.closed || !this.acquired) throw new Error('Audio sources were not acquired.');
    if (this.started) throw new Error('Audio processing is already active.');
    try {
      const context = new AudioContext();
      this.context = context;
      await context.audioWorklet.addModule('/worklets/pcm-processor.js');
      if (this.closed) throw new Error('Audio capture ended during initialization.');
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
          this.chunkCount += 1;
          // Calculate levels before handing off a buffer that may be transferred.
          this.onStatus({
            receivedChunks: this.chunkCount,
            sampleRate: context.sampleRate,
            micLevel: this.readLevel(this.micAnalyser),
            systemLevel: this.readLevel(this.systemAnalyser),
          });
          this.onChunk({
            pcm: data.pcm,
            sequence: data.sequence,
            startSample: data.startSample,
            validSamples: data.validSamples,
            final: data.final,
          });
        } else if (data.type === 'flushed') {
          this.flushResolver?.();
          this.flushResolver = undefined;
        }
      };

      const mixer = context.createGain();
      this.nodes.push(mixer);
      const gains = sourceGains(this.selection);
      if (this.display)
        this.systemAnalyser = this.connectSource(context, this.display, mixer, gains.system);
      if (this.mic) this.micAnalyser = this.connectSource(context, this.mic, mixer, gains.mic);
      const sink = context.createGain();
      sink.gain.value = 0; // Never play the shared audio a second time.
      this.sink = sink;
      mixer.connect(processor).connect(sink).connect(context.destination);
      await context.resume();
      if (this.closed) throw new Error('Audio sharing ended during setup.');
      this.started = true;
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  /**
   * End the current provider epoch without releasing browser-granted media.
   * A later startProcessing() reuses the same live tracks and therefore does not
   * reopen Chrome's microphone or display-sharing permission UI.
   */
  async pauseProcessing(): Promise<void> {
    if (!this.started) return;
    if (this.processor) {
      await Promise.race([
        new Promise<void>((resolve) => {
          this.flushResolver = resolve;
          this.processor?.port.postMessage({ type: 'flush' });
        }),
        new Promise<void>((resolve) => setTimeout(resolve, 500)),
      ]);
    }
    this.flushResolver = undefined;
    for (const node of this.nodes) node.disconnect();
    this.nodes.length = 0;
    this.processor?.disconnect();
    this.sink?.disconnect();
    await this.context?.close().catch(() => undefined);
    this.context = undefined;
    this.processor = undefined;
    this.sink = undefined;
    this.micAnalyser = undefined;
    this.systemAnalyser = undefined;
    this.started = false;
  }

  private connectSource(
    context: AudioContext,
    media: MediaStream,
    mixer: GainNode,
    volume: number,
  ): AnalyserNode {
    const source = context.createMediaStreamSource(media);
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    const gain = context.createGain();
    gain.gain.value = volume;
    source.connect(analyser).connect(gain).connect(mixer);
    this.nodes.push(source, analyser, gain);
    return analyser;
  }

  private readLevel(analyser: AnalyserNode | undefined): number {
    if (!analyser) return 0;
    const values = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(values);
    return rms(values);
  }

  private readonly handleEnded = (): void => {
    if (this.closed) return;
    void this.stop().finally(() => this.onSourceEnded());
  };

  async stop(): Promise<void> {
    if (this.closed) return;
    await this.pauseProcessing();
    this.closed = true;
    await this.release();
  }

  private async release(): Promise<void> {
    for (const track of this.display?.getTracks() ?? [])
      track.removeEventListener('ended', this.handleEnded);
    for (const track of this.mic?.getTracks() ?? [])
      track.removeEventListener('ended', this.handleEnded);
    this.display?.getTracks().forEach((track) => track.stop());
    this.mic?.getTracks().forEach((track) => track.stop());
    this.display = undefined;
    this.mic = undefined;
    this.acquired = false;
  }
}
