/** UI-only display models for fake-backed development.
 * These are NOT network DTOs, persisted session states, or approved team contracts.
 * Replace boundary mapping with Zod-inferred types when contracts are accepted.
 */
export type CaptionPhase =
  'partial' | 'final-observed' | 'saving' | 'save-acknowledged' | 'save-failed';

export interface CaptionView {
  id: string;
  speaker: string;
  timestampMs: number;
  text: string;
  phase: CaptionPhase;
}

export interface SessionView {
  id: string;
  title: string;
  createdAt: string;
  durationSeconds: number;
  language: string;
  captions: CaptionView[];
}

export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1_000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
