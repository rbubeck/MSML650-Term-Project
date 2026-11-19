import { AUDIO_SAMPLE_RATE_HZ, AUDIO_SAMPLES_PER_CHUNK } from '@live-transcription/contracts';
import type { PcmChunk } from './microphone';
import type { SourceCaptureStatus } from './sourceCapture';

/** One browser audio clock; left = microphone, right = shared tab/screen. */
export class StereoSourceCapture {
  private display: MediaStream | undefined;
  private microphone: MediaStream | undefined;
  private context: AudioContext | undefined;
  private processor: AudioWorkletNode | undefined;
  private readonly nodes: AudioNode[] = [];
  private micAnalyser: AnalyserNode | undefined;
  private tabAnalyser: AnalyserNode | undefined;
  private flushResolve: (() => void) | undefined;
  private closed = false;
  private acquired = false;
  private running = false;
  private receivedChunks = 0;

  constructor(
    private readonly onChunk: (chunk: PcmChunk) => void,
    private readonly onStatus: (status: SourceCaptureStatus) => void,
    private readonly onEnded: () => void,
  ) {}

  async acquire(): Promise<void> {
    if (this.closed || this.acquired) throw new Error('Stereo capture cannot be reused.');
    if (
      !navigator.mediaDevices?.getDisplayMedia ||
      !navigator.mediaDevices.getUserMedia ||
      !('AudioWorkletNode' in window)
    ) {
      throw new Error('This browser cannot capture both audio sources. Use recent Chrome or Edge.');
    }
    try {
      // The share picker MUST be opened before the first await from Start click.
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
        systemAudio: 'include',
      } as DisplayMediaStreamOptions);
      if (this.closed) {
        display.getTracks().forEach((track) => track.stop());
        return;
      }
      this.display = display;
      if (!display.getAudioTracks().some((track) => track.readyState === 'live')) {
        throw new Error('No tab audio was shared. Enable Share tab audio in the picker.');
      }
      // Audio sharing comes first; microphone permission follows.
      const microphone = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      if (this.closed) {
        microphone.getTracks().forEach((track) => track.stop());
        return;
      }
      this.microphone = microphone;
      for (const track of display.getTracks()) track.addEventListener('ended', this.handleEnded);
      for (const track of microphone.getAudioTracks())
        track.addEventListener('ended', this.handleEnded);
      this.acquired = true;
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async startProcessing(): Promise<void> {
    if (!this.acquired || this.closed || !this.display || !this.microphone) {
      throw new Error('Both audio inputs must be acquired before starting.');
    }
    if (this.running) throw new Error('Stereo capture has already started.');
    try {
      const context = new AudioContext();
      this.context = context;
      await context.audioWorklet.addModule('/worklets/stereo-pcm-processor.js');
      if (this.closed) throw new Error('Stereo capture was canceled.');
      const merger = context.createChannelMerger(2);
      this.nodes.push(merger);
      this.micAnalyser = this.attach(context, this.microphone, merger, 0);
      this.tabAnalyser = this.attach(context, this.display, merger, 1);
      const processor = new AudioWorkletNode(context, 'cloudscribe-stereo-pcm', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
        processorOptions: {
          targetRate: AUDIO_SAMPLE_RATE_HZ,
          chunkFrames: AUDIO_SAMPLES_PER_CHUNK,
        },
      });
      this.processor = processor;
      processor.port.onmessage = (event: MessageEvent) => {
        const value: unknown = event.data;
        if (typeof value !== 'object' || value === null || !('type' in value)) return;
        if (value.type === 'flushed') {
          this.flushResolve?.();
          this.flushResolve = undefined;
        } else if (
          value.type === 'chunk' &&
          'pcm' in value &&
          value.pcm instanceof ArrayBuffer &&
          'sequence' in value &&
          typeof value.sequence === 'number' &&
          'startSample' in value &&
          typeof value.startSample === 'number' &&
          'validSamples' in value &&
          typeof value.validSamples === 'number' &&
          'final' in value &&
          typeof value.final === 'boolean'
        ) {
          this.receivedChunks++;
          this.onStatus({
            receivedChunks: this.receivedChunks,
            sampleRate: context.sampleRate,
            micLevel: this.level(this.micAnalyser),
            systemLevel: this.level(this.tabAnalyser),
          });
          this.onChunk({
            pcm: value.pcm,
            sequence: value.sequence,
            startSample: value.startSample,
            validSamples: value.validSamples,
            final: value.final,
          });
        }
      };
      const silentOutput = context.createGain();
      silentOutput.gain.value = 0;
      this.nodes.push(silentOutput);
      merger.connect(processor).connect(silentOutput).connect(context.destination);
      await context.resume();
      if (this.closed) throw new Error('Stereo capture was canceled.');
      this.running = true;
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  /** Suspend PCM production while retaining the selected tab and microphone tracks. */
  async pauseProcessing(): Promise<void> {
    if (!this.running) return;
    if (this.processor) {
      await Promise.race([
        new Promise<void>((resolve) => {
          this.flushResolve = resolve;
          this.processor?.port.postMessage({ type: 'flush' });
        }),
        new Promise<void>((resolve) => setTimeout(resolve, 500)),
      ]);
    }
    this.flushResolve = undefined;
    for (const node of this.nodes) node.disconnect();
    this.nodes.length = 0;
    this.processor?.disconnect();
    await this.context?.close().catch(() => undefined);
    this.context = undefined;
    this.processor = undefined;
    this.micAnalyser = undefined;
    this.tabAnalyser = undefined;
    this.running = false;
  }

  private attach(
    context: AudioContext,
    media: MediaStream,
    merger: ChannelMergerNode,
    channel: number,
  ): AnalyserNode {
    const source = context.createMediaStreamSource(media);
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    const gain = context.createGain();
    gain.gain.value = 1;
    source.connect(analyser).connect(gain).connect(merger, 0, channel);
    this.nodes.push(source, analyser, gain);
    return analyser;
  }

  private level(analyser: AnalyserNode | undefined): number {
    if (!analyser) return 0;
    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const value of samples) {
      const bounded = Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
      sum += bounded * bounded;
    }
    return Math.min(1, Math.sqrt(sum / samples.length));
  }

  private readonly handleEnded = (): void => {
    if (this.closed) return;
    void this.stop().finally(() => this.onEnded());
  };

  async stop(): Promise<void> {
    if (this.closed) return;
    await this.pauseProcessing();
    this.closed = true;
    for (const track of this.display?.getTracks() ?? [])
      track.removeEventListener('ended', this.handleEnded);
    for (const track of this.microphone?.getTracks() ?? [])
      track.removeEventListener('ended', this.handleEnded);
    this.display?.getTracks().forEach((track) => track.stop());
    this.microphone?.getTracks().forEach((track) => track.stop());
    this.display = undefined;
    this.microphone = undefined;
    this.acquired = false;
  }
}
