import { describe, expect, it, vi } from 'vitest';
import type { PcmChunk } from '../audio/microphone';
import type { SourceCaptureStatus } from '../audio/sourceCapture';
import {
  DirectStreamAdapter,
  type CaptureFactory,
  type StreamTransport,
} from './directStreamAdapter';
import { createFakeTranscribeTransport } from './fakeTranscribeSocket';

const audioPacket = (): PcmChunk => ({
  pcm: new Uint8Array(3200).fill(1).buffer,
  sequence: 0,
  startSample: 0,
  validSamples: 1600,
  final: false,
});

function fakeCaptureFactory(steps: string[]): CaptureFactory {
  return (onChunk, onStatus) => ({
    acquire: async () => {
      steps.push('acquire');
    },
    startProcessing: async () => {
      steps.push('processing');
      for (let i = 0; i < 10; i++) onChunk(audioPacket());
      onStatus({ receivedChunks: 10, sampleRate: 48000, micLevel: 0.2, systemLevel: 0 });
    },
    pauseProcessing: async () => {
      steps.push('capture-pause');
    },
    stop: async () => {
      steps.push('capture-stop');
    },
  });
}

describe('capture to EventStream pipeline', () => {
  it('routes PCM through the real stream client and returns simulated partial/final captions', async () => {
    const steps: string[] = [];
    const onCaption = vi.fn();
    const onStatus = vi.fn<(status: SourceCaptureStatus) => void>();
    const adapter = new DirectStreamAdapter({
      createCapture: fakeCaptureFactory(steps),
      requestCapability: async () => {
        steps.push('capability');
        return { url: 'wss://local-fake.invalid', streamEpoch: 7 };
      },
      createTransport: createFakeTranscribeTransport,
      onCaptureStatus: onStatus,
    });
    await adapter.start('local-test', { onCaption, onFailure: vi.fn(), onDisconnected: vi.fn() });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(steps.slice(0, 3)).toEqual(['acquire', 'capability', 'processing']);
    expect(onStatus).toHaveBeenCalled();
    expect(onCaption).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'partial', resultId: 'local-1' }),
    );
    expect(onCaption).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'final-observed', resultId: 'local-1', streamEpoch: 7 }),
    );
    await adapter.stop();
    expect(steps).toContain('capture-stop');
  });

  it('flushes capture before stopping provider', async () => {
    const steps: string[] = [];
    const transport: StreamTransport = {
      start: async () => {
        steps.push('transport-start');
      },
      sendAudio: () => true,
      stop: async () => {
        steps.push('provider-stop');
      },
      cancel: () => {
        steps.push('provider-cancel');
      },
    };
    const adapter = new DirectStreamAdapter({
      createCapture: fakeCaptureFactory(steps),
      requestCapability: async () => ({ url: 'wss://local-fake.invalid', streamEpoch: 1 }),
      createTransport: () => transport,
    });
    await adapter.start('session', {
      onCaption: vi.fn(),
      onFailure: vi.fn(),
      onDisconnected: vi.fn(),
    });
    await adapter.stop();
    expect(steps.indexOf('capture-pause')).toBeLessThan(steps.indexOf('provider-stop'));
    expect(steps.indexOf('provider-stop')).toBeLessThan(steps.indexOf('capture-stop'));
  });

  it('keeps one capture and provider epoch while pause sends silence and resume restores PCM', async () => {
    const steps: string[] = [];
    const sent: number[][] = [];
    let emit: ((chunk: PcmChunk) => void) | undefined;
    const adapter = new DirectStreamAdapter({
      createCapture: (onChunk) => {
        emit = onChunk;
        return {
          acquire: async () => {
            steps.push('acquire');
          },
          startProcessing: async () => {
            steps.push('processing');
          },
          pauseProcessing: async () => {
            steps.push('capture-flush');
          },
          stop: async () => {
            steps.push('capture-stop');
          },
        };
      },
      requestCapability: async () => {
        steps.push('capability');
        return { url: 'wss://local-fake.invalid', streamEpoch: 1 };
      },
      createTransport: () => ({
        start: async ({ streamEpoch }) => {
          steps.push(`provider-start-${streamEpoch}`);
        },
        sendAudio: (bytes) => {
          sent.push([...new Uint8Array(bytes)]);
          return true;
        },
        stop: async () => {
          steps.push('provider-stop');
        },
        cancel: () => undefined,
      }),
    });
    const handlers = { onCaption: vi.fn(), onFailure: vi.fn(), onDisconnected: vi.fn() };
    await adapter.start('session', handlers);
    emit?.({ ...audioPacket(), pcm: new Uint8Array([7, 0, 9, 0]).buffer });
    await adapter.pause();
    emit?.({ ...audioPacket(), pcm: new Uint8Array([7, 0, 9, 0]).buffer });
    await adapter.resume();
    emit?.({ ...audioPacket(), pcm: new Uint8Array([7, 0, 9, 0]).buffer });
    expect(steps.filter((step) => step === 'acquire')).toHaveLength(1);
    expect(steps).toContain('provider-start-1');
    expect(steps.filter((step) => step === 'capability')).toHaveLength(1);
    expect(steps.filter((step) => step === 'processing')).toHaveLength(1);
    expect(steps).not.toContain('provider-stop');
    expect(steps).not.toContain('capture-flush');
    expect(steps).not.toContain('capture-stop');
    expect(sent).toEqual([
      [7, 0, 9, 0],
      [0, 0, 0, 0],
      [7, 0, 9, 0],
    ]);
    await adapter.stop();
    expect(steps).toContain('capture-stop');
  });

  it('cleans up capture if transport authorization fails', async () => {
    const steps: string[] = [];
    const transport: StreamTransport = {
      start: async () => {},
      sendAudio: () => true,
      stop: async () => {},
      cancel: () => {
        steps.push('provider-cancel');
      },
    };
    const adapter = new DirectStreamAdapter({
      createCapture: fakeCaptureFactory(steps),
      requestCapability: async () => {
        throw new Error('API request failed (403).');
      },
      createTransport: () => transport,
    });
    await expect(
      adapter.start('session', { onCaption: vi.fn(), onFailure: vi.fn(), onDisconnected: vi.fn() }),
    ).rejects.toThrow('403');
    expect(steps).toContain('provider-cancel');
    expect(steps).toContain('capture-stop');
  });
});
