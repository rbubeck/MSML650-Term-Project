import { afterEach, describe, expect, it, vi } from 'vitest';
import { SourceCapture, sourceGains } from './sourceCapture';

function fakeTrack() {
  return {
    readyState: 'live',
    stop: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}
function fakeStream(audioCount = 1, videoCount = 0) {
  const audio = Array.from({ length: audioCount }, fakeTrack);
  const video = Array.from({ length: videoCount }, fakeTrack);
  return {
    getAudioTracks: () => audio,
    getVideoTracks: () => video,
    getTracks: () => [...audio, ...video],
    audio,
    video,
  };
}

describe('independent audio source acquisition', () => {
  afterEach(() => vi.unstubAllGlobals());
  function setup(display = fakeStream(1, 1), mic = fakeStream()) {
    const getDisplayMedia = vi.fn().mockResolvedValue(display);
    const getUserMedia = vi.fn().mockResolvedValue(mic);
    vi.stubGlobal('window', { AudioWorkletNode: class {} });
    vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia, getUserMedia } });
    return { display, mic, getDisplayMedia, getUserMedia };
  }

  it('microphone only never opens screen picker', async () => {
    const api = setup();
    const capture = new SourceCapture(
      { microphone: true, system: false },
      vi.fn(),
      vi.fn(),
      vi.fn(),
    );
    await capture.acquire();
    expect(api.getUserMedia).toHaveBeenCalledTimes(1);
    expect(api.getDisplayMedia).not.toHaveBeenCalled();
    expect(sourceGains({ microphone: true, system: false })).toEqual({ mic: 1, system: 0 });
    await capture.stop();
    expect(api.mic.audio[0]?.stop).toHaveBeenCalledOnce();
  });

  it('system only never requests microphone', async () => {
    const api = setup();
    const capture = new SourceCapture(
      { microphone: false, system: true },
      vi.fn(),
      vi.fn(),
      vi.fn(),
    );
    await capture.acquire();
    expect(api.getDisplayMedia).toHaveBeenCalledTimes(1);
    expect(api.getUserMedia).not.toHaveBeenCalled();
    expect(sourceGains({ microphone: false, system: true })).toEqual({ mic: 0, system: 1 });
    await capture.stop();
    expect(api.display.audio[0]?.stop).toHaveBeenCalledOnce();
  });

  it('both selections acquire both and share mixer headroom', async () => {
    const api = setup();
    const capture = new SourceCapture(
      { microphone: true, system: true },
      vi.fn(),
      vi.fn(),
      vi.fn(),
    );
    await capture.acquire();
    expect(api.getDisplayMedia).toHaveBeenCalledTimes(1);
    expect(api.getUserMedia).toHaveBeenCalledTimes(1);
    expect(sourceGains({ microphone: true, system: true })).toEqual({ mic: 0.5, system: 0.5 });
    await capture.stop();
    expect(api.display.video[0]?.stop).toHaveBeenCalledOnce();
    expect(api.mic.audio[0]?.stop).toHaveBeenCalledOnce();
  });

  it('rejects empty selection without permission prompts', async () => {
    const api = setup();
    const capture = new SourceCapture(
      { microphone: false, system: false },
      vi.fn(),
      vi.fn(),
      vi.fn(),
    );
    await expect(capture.acquire()).rejects.toThrow(/Select at least one/);
    expect(api.getDisplayMedia).not.toHaveBeenCalled();
    expect(api.getUserMedia).not.toHaveBeenCalled();
  });

  it('fails safely if display sharing contains no audio', async () => {
    const api = setup(fakeStream(0, 1));
    const capture = new SourceCapture(
      { microphone: true, system: true },
      vi.fn(),
      vi.fn(),
      vi.fn(),
    );
    await expect(capture.acquire()).rejects.toThrow(/No system audio was shared/);
    expect(api.getUserMedia).not.toHaveBeenCalled();
    expect(api.display.video[0]?.stop).toHaveBeenCalledOnce();
  });

  it('stops existing display tracks if microphone permission is denied', async () => {
    const api = setup();
    api.getUserMedia.mockRejectedValueOnce(new Error('NotAllowedError'));
    const capture = new SourceCapture(
      { microphone: true, system: true },
      vi.fn(),
      vi.fn(),
      vi.fn(),
    );
    await expect(capture.acquire()).rejects.toThrow(/NotAllowedError/);
    expect(api.display.video[0]?.stop).toHaveBeenCalledOnce();
  });

  it('stop is idempotent', async () => {
    const api = setup();
    const capture = new SourceCapture(
      { microphone: true, system: false },
      vi.fn(),
      vi.fn(),
      vi.fn(),
    );
    await capture.acquire();
    await capture.stop();
    await capture.stop();
    expect(api.mic.audio[0]?.stop).toHaveBeenCalledTimes(1);
  });
});
