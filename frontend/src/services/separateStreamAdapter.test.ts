import { describe, expect, it, vi } from 'vitest';
import type { PcmChunk } from '../audio/microphone';
import type { SourceCaptureStatus } from '../audio/sourceCapture';
import { SeparateStreamAdapter, type AudioSource } from './separateStreamAdapter';
import type { StreamTransport } from './directStreamAdapter';

const PCM = (value: number): PcmChunk => ({
  pcm: new Uint8Array([value, 0, value, 0]).buffer as ArrayBuffer,
  sequence: 0,
  startSample: 0,
  validSamples: 2,
  final: false,
});

const status = (source: AudioSource): SourceCaptureStatus => ({
  receivedChunks: 1,
  sampleRate: 48000,
  micLevel: source === 'microphone' ? 0.3 : 0,
  meetingLevel: source === 'system' ? 0.7 : 0,
});

function setup(selection: { microphone: boolean; system: boolean }) {
  const steps: string[] = [];
  const sent: number[][] = [];
  const caption = vi.fn();
  const onFailure = vi.fn();
  const onDisconnected = vi.fn();
  let nextId = 0;
  const adapter = new SeparateStreamAdapter({
    selection,
    requestCapability: async () => {
      steps.push('capability');
      return { url: 'wss://local-test.invalid', streamEpoch: ++nextId };
    },
    createCapture: (source, onChunk, onStatus) => ({
      acquire: async () => {
        steps.push(`acquire-${source}`);
      },
      startProcessing: async () => {
        onChunk(PCM(source === 'microphone' ? 11 : 22));
        onStatus(status(source));
      },
      stop: async () => {
        steps.push(`stop-${source}`);
      },
    }),
    createTransport: (handlers) => {
      const thisTransport = sent.length;
      sent.push([]);
      const transport: StreamTransport = {
        start: async (options) => {
          handlers.onFinal?.({
            isPartial: false,
            streamEpoch: options.streamEpoch,
            resultId: 'same-result-id',
            text: `stream ${thisTransport}`,
            startMs: 0,
            endMs: 1000,
          });
        },
        sendAudio: (bytes) => {
          sent[thisTransport]!.push(new Uint8Array(bytes)[0]!);
          return true;
        },
        stop: async () => {},
        cancel: () => {},
      };
      return transport;
    },
  });
  return { adapter, steps, sent, caption, onFailure, onDisconnected };
}

describe('independent microphone and meeting transcription paths', () => {
  it('acquires both sources before awaiting stream capabilities and never mixes PCM', async () => {
    const t = setup({ microphone: true, system: true });
    await t.adapter.start('owned-test-session', {
      onCaption: t.caption,
      onFailure: t.onFailure,
      onDisconnected: t.onDisconnected,
    });
    expect(t.steps.slice(0, 2)).toEqual(['acquire-system', 'acquire-microphone']);
    expect(t.sent).toHaveLength(2);
    expect(t.sent[0]).toEqual([22]);
    expect(t.sent[1]).toEqual([11]);
    expect(t.caption).toHaveBeenCalledWith(expect.objectContaining({ source: 'system' }));
    expect(t.caption).toHaveBeenCalledWith(expect.objectContaining({ source: 'microphone' }));
    expect(t.onFailure).not.toHaveBeenCalled();
    await t.adapter.stop();
    expect(t.steps).toContain('stop-system');
    expect(t.steps).toContain('stop-microphone');
  });

  it('keeps microphone-only working without acquiring display audio', async () => {
    const t = setup({ microphone: true, system: false });
    await t.adapter.start('test-session', {
      onCaption: t.caption,
      onFailure: t.onFailure,
      onDisconnected: t.onDisconnected,
    });
    expect(t.steps).toContain('acquire-microphone');
    expect(t.steps).not.toContain('acquire-system');
    expect(t.sent).toEqual([[11]]);
    await t.adapter.stop();
  });

  it('keeps meeting-only working without requesting a microphone', async () => {
    const t = setup({ microphone: false, system: true });
    await t.adapter.start('test-session', {
      onCaption: t.caption,
      onFailure: t.onFailure,
      onDisconnected: t.onDisconnected,
    });
    expect(t.steps).toContain('acquire-system');
    expect(t.steps).not.toContain('acquire-microphone');
    expect(t.sent).toEqual([[22]]);
    await t.adapter.stop();
  });
});
