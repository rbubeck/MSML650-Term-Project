import type { CaptionPhase } from '../lib/viewModels';

/** UI-facing adapter contract only; NOT a socket protocol or application network schema.
 * Person 3 owns the provider transport behind this boundary.
 */
export interface LiveCaptionEvent {
  streamEpoch: number;
  resultId: string;
  text: string;
  startMs: number;
  endMs: number;
  phase: Extract<CaptionPhase, 'partial' | 'final-observed'>;
}

export interface StreamUIHandlers {
  onCaption: (event: LiveCaptionEvent) => void;
  onFailure: (message: string) => void;
  onDisconnected: () => void;
}

export interface StreamUIAdapter {
  start(sessionId: string, handlers: StreamUIHandlers): Promise<void>;
  stop(): Promise<void>;
}

/** Optional fail-closed fallback when no real or local adapter is configured. */
export class PendingStreamAdapter implements StreamUIAdapter {
  async start(): Promise<void> {
    throw new Error('Live streaming is not configured.');
  }
  async stop(): Promise<void> {
    return;
  }
}
