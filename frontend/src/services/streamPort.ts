import type { CaptionPhase } from '../lib/viewModels';

/** UI-facing adapter contract only; NOT a socket protocol or approved network schema.
 * Person 3 owns @live-transcription/stream-client. Connect it here after interface review.
 */
export interface LiveCaptionEvent {
  resultId: string;
  text: string;
  relativeStartMs: number;
  phase: Extract<CaptionPhase, 'partial' | 'final-observed'>;
}

export interface StreamUIAdapter {
  start(
    sessionId: string,
    handlers: {
      onCaption: (event: LiveCaptionEvent) => void;
      onFailure: (message: string) => void;
      onDisconnected: () => void;
    },
  ): Promise<void>;
  stop(): Promise<void>;
}

/** Fails closed until Person 3's reviewed package API and Zod contracts exist. */
export class PendingStreamAdapter implements StreamUIAdapter {
  async start(): Promise<void> {
    throw new Error(
      'Live AWS streaming is not connected. Awaiting the team-reviewed stream-client API.',
    );
  }
  async stop(): Promise<void> {
    return;
  }
}
