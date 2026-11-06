/* global AudioWorkletProcessor, sampleRate, registerProcessor */
/** Browser AudioWorklet. Audio remains memory-only and is never sent anywhere in this scaffold.
 * The main thread supplies PCM targets from @live-transcription/contracts via processorOptions.
 * Emits raw PCM only; Person 3's stream-client owns all AWS protocol framing.
 */
class CloudScribePcmProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const cfg = options.processorOptions || {};
    this.targetRate = cfg.targetRate;
    this.chunkSamples = cfg.chunkSamples;
    if (!(this.targetRate > 0) || !(this.chunkSamples > 0)) {
      throw new Error('Missing reviewed PCM capture settings');
    }
    this.step = sampleRate / this.targetRate;
    this.pending = [];
    this.cursor = 0;
    this.totalInputFrames = 0;
    this.emittedSamples = 0;
    this.sequence = 0;
    this.chunk = [];
    this.closed = false;
    this.port.onmessage = (event) => {
      if (event.data && event.data.type === 'flush') {
        this.flush();
        this.port.postMessage({ type: 'flushed' });
      }
    };
  }

  process(inputs) {
    if (this.closed) return true;
    const input = inputs[0];
    if (!input || input.length === 0 || !input[0]) return true;
    const length = input[0].length;
    for (let i = 0; i < length; i++) {
      let mixed = 0;
      for (let channel = 0; channel < input.length; channel++) {
        mixed += input[channel][i] || 0;
      }
      this.pending.push(mixed / input.length);
    }
    this.totalInputFrames += length;
    this.produce();
    return true;
  }

  toPcm(sample) {
    const clamped = Math.max(-1, Math.min(1, sample));
    return Math.round(clamped < 0 ? clamped * 32768 : clamped * 32767);
  }

  push(sample) {
    this.chunk.push(this.toPcm(sample));
    this.emittedSamples += 1;
    if (this.chunk.length === this.chunkSamples) this.emit(false);
  }

  produce() {
    while (Math.floor(this.cursor) + 1 < this.pending.length) {
      const left = Math.floor(this.cursor);
      const fraction = this.cursor - left;
      const sample = this.pending[left] * (1 - fraction) + this.pending[left + 1] * fraction;
      this.push(sample);
      this.cursor += this.step;
    }
    // Retain the sample needed for interpolation across 128-frame process() blocks.
    const consumed = Math.min(Math.floor(this.cursor), Math.max(0, this.pending.length - 1));
    if (consumed > 0) {
      this.pending.splice(0, consumed);
      this.cursor -= consumed;
    }
  }

  emit(final) {
    const validSamples = this.chunk.length;
    if (validSamples === 0) return;
    const bytes = new ArrayBuffer(this.chunkSamples * 2);
    const view = new DataView(bytes);
    for (let i = 0; i < this.chunkSamples; i++) {
      view.setInt16(i * 2, this.chunk[i] || 0, true);
    }
    this.port.postMessage(
      {
        type: 'chunk',
        pcm: bytes,
        sequence: this.sequence,
        startSample: this.sequence * this.chunkSamples,
        validSamples,
        final,
      },
      [bytes],
    );
    this.sequence += 1;
    this.chunk = [];
  }

  flush() {
    if (this.closed) return;
    this.produce();
    // At end-of-stream, finalize the resampled count using a held final source sample.
    // Zero padding is used only to fill the last 100 ms output packet.
    const expectedSamples = Math.floor((this.totalInputFrames * this.targetRate) / sampleRate);
    const last = this.pending.length ? this.pending[this.pending.length - 1] : 0;
    while (this.emittedSamples < expectedSamples) this.push(last);
    this.emit(true);
    this.closed = true;
  }
}

registerProcessor('cloudscribe-pcm', CloudScribePcmProcessor);
