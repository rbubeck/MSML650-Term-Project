import { describe, expect, it, vi } from 'vitest';
import { SeparateStreamAdapter } from './separateStreamAdapter';

/** No browser or AWS needed: verifies that two labeled results use ONE transport. */
describe('single-WebSocket stereo source separation', () => {
  it('keeps left mic and right meeting results separate on one stream', async () => {
    const observed = vi.fn();
    const monoCapability = vi.fn();
    let stereoCapabilityCalls = 0;
    const stereoCapability = async () => {
      stereoCapabilityCalls++;
      return { url: 'wss://local-test.invalid', streamEpoch: 17 };
    };
    const sent: Uint8Array[] = [];
    const transportStarts = vi.fn();
    const stereoPcm = new Uint8Array([11, 0, 22, 0, 11, 0, 22, 0]);
    const adapter = new SeparateStreamAdapter({
      selection: { microphone: true, system: true },
      stereo: true,
      requestCapability: async () => {
        monoCapability();
        throw new Error('Mono capability MUST NOT be requested for two channels.');
      },
      requestStereoCapability: stereoCapability,
      createStereoCapture: (onChunk) => ({
        acquire: async () => undefined,
        startProcessing: async () => {
          onChunk({
            pcm: stereoPcm.slice().buffer as ArrayBuffer,
            sequence: 0,
            startSample: 0,
            validSamples: 2,
            final: false,
          });
        },
        stop: async () => undefined,
      }),
      createTransport: (handlers) => ({
        start: async (capability) => {
          transportStarts(capability);
          for (const channelId of ['ch_0', 'ch_1'] as const) {
            handlers.onFinal?.({
              streamEpoch: capability.streamEpoch,
              resultId: channelId,
              channelId,
              isPartial: false,
              text: channelId === 'ch_0' ? 'microphone sentence' : 'meeting sentence',
              startMs: 0,
              endMs: 1000,
            });
          }
        },
        sendAudio: (bytes) => {
          sent.push(new Uint8Array(bytes).slice());
          return true;
        },
        stop: async () => undefined,
        cancel: () => undefined,
      }),
    });
    await adapter.start('smoke-session', {
      onCaption: observed,
      onFailure: (message) => {
        throw new Error(message);
      },
      onDisconnected: () => {
        throw new Error('Unexpected disconnect');
      },
    });
    expect(monoCapability).not.toHaveBeenCalled();
    expect(stereoCapabilityCalls).toBe(1);
    expect(transportStarts).toHaveBeenCalledOnce();
    expect(observed).toHaveBeenCalledTimes(2);
    expect(observed).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'microphone', text: 'microphone sentence' }),
    );
    expect(observed).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'system', text: 'meeting sentence' }),
    );
    expect(sent).toHaveLength(1);
    expect([...sent[0]!]).toEqual([...stereoPcm]);
    await adapter.stop();
  });
});
