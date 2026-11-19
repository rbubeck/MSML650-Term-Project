import type { CaptionPhase } from '../lib/viewModels';

export interface LiveCaptionEvent {
  streamEpoch: number;
  resultId: string;
  text: string;
  startMs: number;
  endMs: number;
  /** Present for stereo AWS streams; not inferred from speech or loudness. */
  channelId?: 'ch_0' | 'ch_1';
  phase: Extract<CaptionPhase, 'partial' | 'final-observed'>;
}

export interface StreamUIHandlers {
  onCaption: (event: LiveCaptionEvent) => void;
  onFailure: (message: string) => void;
  onDisconnected: () => void;
}

export interface StreamUIAdapter {
  start(sessionId: string, handlers: StreamUIHandlers): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
}
