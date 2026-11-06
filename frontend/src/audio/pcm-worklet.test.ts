import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { AUDIO_PCM_BYTES_PER_CHUNK, AUDIO_SAMPLES_PER_CHUNK } from '@live-transcription/contracts';

type Output = {
  type: 'chunk';
  pcm: ArrayBuffer;
  sequence: number;
  startSample: number;
  validSamples: number;
  final: boolean;
};

type Processor = {
  port: { onmessage: (message: { data: { type: string } }) => void };
  process: (inputs: Float32Array[][]) => boolean;
};

function makeProcessor(rate: number) {
  const chunks: Output[] = [];
  let processorConstructor: unknown;
  class FakeBase {
    port = {
      onmessage: () => {},
      postMessage: (payload: Output) => {
        if (payload.type === 'chunk') chunks.push(payload);
      },
    };
  }
  const code = readFileSync(
    resolve(process.cwd(), 'frontend/public/worklets/pcm-processor.js'),
    'utf8',
  );
  runInNewContext(code, {
    AudioWorkletProcessor: FakeBase,
    sampleRate: rate,
    registerProcessor: (_name: string, ctor: unknown) => {
      processorConstructor = ctor;
    },
    ArrayBuffer,
    DataView,
    Math,
  });
  if (typeof processorConstructor !== 'function')
    throw new Error('AudioWorklet failed to register');
  const Constructor = processorConstructor as new (o: { processorOptions: object }) => Processor;
  const processor = new Constructor({
    processorOptions: { targetRate: 16_000, chunkSamples: AUDIO_SAMPLES_PER_CHUNK },
  });
  return {
    chunks,
    feed: (signal: Float32Array, second?: Float32Array) => {
      for (let i = 0; i < signal.length; i += 128) {
        const frames = [signal.slice(i, i + 128)];
        if (second) frames.push(second.slice(i, i + 128));
        processor.process([frames]);
      }
    },
    end: () => processor.port.onmessage({ data: { type: 'flush' } }),
  };
}

describe('AudioWorklet 16 kHz PCM output', () => {
  for (const sourceRate of [44_100, 48_000]) {
    it(`resamples ${sourceRate} Hz to exactly ten 100 ms frames per second`, () => {
      const processor = makeProcessor(sourceRate);
      processor.feed(
        Float32Array.from(
          { length: sourceRate },
          (_value, n) => Math.sin((2 * Math.PI * 440 * n) / sourceRate) * 0.5,
        ),
      );
      processor.end();
      expect(processor.chunks).toHaveLength(10);
      processor.chunks.forEach((chunk, index) => {
        expect(chunk.pcm.byteLength).toBe(AUDIO_PCM_BYTES_PER_CHUNK);
        expect(chunk.sequence).toBe(index);
        expect(chunk.startSample).toBe(index * AUDIO_SAMPLES_PER_CHUNK);
        expect(chunk.validSamples).toBe(AUDIO_SAMPLES_PER_CHUNK);
      });
    });
  }

  it('downmixes opposite stereo channels to silence and preserves little-endian layout', () => {
    const processor = makeProcessor(48_000);
    processor.feed(new Float32Array(4_800).fill(0.6), new Float32Array(4_800).fill(-0.6));
    processor.end();
    expect(processor.chunks).toHaveLength(1);
    const view = new DataView(processor.chunks[0]!.pcm);
    expect(view.getInt16(0, true)).toBe(0);
    expect(view.getInt16(16, true)).toBe(0);
  });

  it('clamps out-of-range samples and only zero-pads the final short packet', () => {
    const processor = makeProcessor(48_000);
    processor.feed(new Float32Array(480).fill(3)); // 10 ms input -> 160 valid target samples
    processor.end();
    expect(processor.chunks).toHaveLength(1);
    const packet = processor.chunks[0]!;
    expect(packet.validSamples).toBe(160);
    expect(packet.final).toBe(true);
    const view = new DataView(packet.pcm);
    expect(view.getInt16(0, true)).toBe(32767);
    expect(view.getInt16(318, true)).toBe(32767);
    expect(view.getInt16(320, true)).toBe(0);
  });
});
