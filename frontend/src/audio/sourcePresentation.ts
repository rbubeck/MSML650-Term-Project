import type { AppMode } from '../config';
import type { AudioSourceSelection } from './sourceCapture';

export function audioFormatLabel(mode: AppMode, selection: AudioSourceSelection): string {
  if (selection.microphone && selection.system) {
    return mode === 'aws' ? '16 kHz • Stereo • PCM 16-bit' : '16 kHz • Dual mono • PCM 16-bit';
  }
  return '16 kHz • Mono • PCM 16-bit';
}

export function audioSourceExplanation(mode: AppMode, selection: AudioSourceSelection): string {
  if (selection.microphone && selection.system) {
    return mode === 'aws'
      ? 'System audio uses the browser sharing picker. Enable Share audio. Microphone and system audio use separate stereo channels and appear together in one ordered transcript.'
      : 'System audio uses the browser sharing picker. Enable Share audio. Mock mode combines results from two simulated audio streams into one transcript.';
  }
  if (selection.system) {
    return 'System audio uses the browser sharing picker. Enable Share audio and choose a tab, window, or screen that exposes audio.';
  }
  if (selection.microphone) {
    return 'Microphone-only capture does not open the browser sharing picker. Your microphone is sent as a mono stream.';
  }
  return 'Select Microphone, System audio, or both before starting transcription.';
}
