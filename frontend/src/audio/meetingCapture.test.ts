import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MeetingSessionCapture,
  captureGains,
  rmsOfFloatSamples,
  visualLevel,
} from './meetingCapture';

describe('meeting + microphone source levels', () => {
  it('is silent with no or silent samples', () => {
    expect(rmsOfFloatSamples(new Float32Array())).toBe(0);
    expect(rmsOfFloatSamples(new Float32Array(1024))).toBe(0);
    expect(visualLevel(0)).toBe(0);
  });

  it('measures both positive and negative samples without storing them', () => {
    const signal = new Float32Array([0.5, -0.5, 0.5, -0.5]);
    expect(rmsOfFloatSamples(signal)).toBeCloseTo(0.5);
    expect(signal[0]).toBe(0.5);
  });

  it('clips out-of-range samples and ignores nonfinite data', () => {
    expect(rmsOfFloatSamples(new Float32Array([2, -2]))).toBe(1);
    expect(rmsOfFloatSamples(new Float32Array([Number.NaN, 0]))).toBe(0);
    expect(visualLevel(2)).toBe(1);
  });

  it('sets gains correctly for the two team-approved modes', () => {
    expect(captureGains('both')).toEqual({ mic: 0.5, meeting: 0.5 });
    expect(captureGains('meeting')).toEqual({ mic: 0, meeting: 1 });
  });
});

describe('meeting share permission handling', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not fall back to silent capture when no shared audio track is returned', async () => {
    const stopVideo = vi.fn();
    const videoTrack = {
      stop: stopVideo,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const displayStream = {
      getAudioTracks: () => [],
      getVideoTracks: () => [videoTrack],
      getTracks: () => [videoTrack],
    };
    const getDisplayMedia = vi.fn().mockResolvedValue(displayStream);
    const getUserMedia = vi.fn();
    vi.stubGlobal('window', { AudioWorkletNode: class {} });
    vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia, getUserMedia } });

    const capture = new MeetingSessionCapture('both', vi.fn(), vi.fn(), vi.fn());
    await expect(capture.start()).rejects.toThrow(/No meeting audio was shared/);
    expect(getDisplayMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(stopVideo).toHaveBeenCalledOnce();
  });

  it('honors a canceled browser picker without requesting the microphone', async () => {
    const getDisplayMedia = vi.fn().mockRejectedValue(new Error('User canceled share dialog'));
    const getUserMedia = vi.fn();
    vi.stubGlobal('window', { AudioWorkletNode: class {} });
    vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia, getUserMedia } });
    const capture = new MeetingSessionCapture('both', vi.fn(), vi.fn(), vi.fn());
    await expect(capture.start()).rejects.toThrow('User canceled share dialog');
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});
