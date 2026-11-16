/* global AudioWorkletProcessor, sampleRate, registerProcessor */
/* Two-channel 16 kHz PCM: channel 0 = microphone; channel 1 = shared tab.
 * AudioWorklet processes both channels on the SAME audio clock, so the frames
 * remain aligned and no source/speech classification is guessed.
 */
class CloudScribeStereoPcm extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.targetRate = options.processorOptions?.targetRate ?? 16000;
    this.chunkFrames = options.processorOptions?.chunkFrames ?? 1600;
    this.inputIndex = 0;
    this.nextOutputIndex = 0;
    this.previousLeft = 0;
    this.previousRight = 0;
    this.outputLeft = new Float32Array(this.chunkFrames);
    this.outputRight = new Float32Array(this.chunkFrames);
    this.pendingFrames = 0;
    this.sequence = 0;
    this.totalOutputFrames = 0;
    this.closed = false;
    this.port.onmessage = (event) => {
      if (event.data?.type !== 'flush') return;
      if (this.pendingFrames > 0) this.emitChunk(true);
      this.port.postMessage({ type: 'flushed' });
      this.closed = true;
    };
  }

  sampleToInt16(x) {
    const bounded = Math.max(-1, Math.min(1, Number.isFinite(x) ? x : 0));
    return bounded < 0 ? Math.round(bounded * 32768) : Math.round(bounded * 32767);
  }

  emitChunk(final) {
    const frames = this.pendingFrames;
    const pcm = new ArrayBuffer(frames * 4); // two signed 16-bit channels per frame
    const view = new DataView(pcm);
    for (let i = 0; i < frames; i++) {
      view.setInt16(i * 4, this.sampleToInt16(this.outputLeft[i]), true);
      view.setInt16(i * 4 + 2, this.sampleToInt16(this.outputRight[i]), true);
    }
    this.port.postMessage({
      type: 'chunk', pcm, sequence: this.sequence++, startSample: this.totalOutputFrames,
      validSamples: frames, final,
    }, [pcm]);
    this.totalOutputFrames += frames;
    this.pendingFrames = 0;
  }

  process(inputs, outputs) {
    // No audible monitoring: output is silent even though source nodes are connected.
    for (const output of outputs[0] ?? []) output.fill(0);
    if (this.closed) return true;
    const stereo = inputs[0] ?? [];
    const left = stereo[0];
    const right = stereo[1];
    const frames = left?.length ?? right?.length ?? 128;
    const step = sampleRate / this.targetRate;
    for (let i = 0; i < frames; i++) {
      const l = left?.[i] ?? 0;
      const r = right?.[i] ?? 0;
      const currentIndex = this.inputIndex++;
      while (this.nextOutputIndex <= currentIndex + 1e-7) {
        const fraction = currentIndex === 0 ? 1 : Math.max(0, Math.min(1, this.nextOutputIndex - (currentIndex - 1)));
        this.outputLeft[this.pendingFrames] = this.previousLeft + (l - this.previousLeft) * fraction;
        this.outputRight[this.pendingFrames] = this.previousRight + (r - this.previousRight) * fraction;
        this.pendingFrames++;
        if (this.pendingFrames === this.chunkFrames) this.emitChunk(false);
        this.nextOutputIndex += step;
      }
      this.previousLeft = l;
      this.previousRight = r;
    }
    return true;
  }
}
registerProcessor('cloudscribe-stereo-pcm', CloudScribeStereoPcm);
