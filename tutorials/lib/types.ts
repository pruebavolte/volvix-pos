// =========================================================================
// tutorials/lib/types.ts
// Tipos compartidos para el pipeline de generacion de tutoriales en video.
// =========================================================================

export type TutorialStep =
  | { kind: 'navigate'; url: string; narrate?: string }
  | { kind: 'click'; selector: string; narrate?: string; zoom?: boolean; postWaitMs?: number }
  | { kind: 'type'; selector: string; text: string; narrate?: string; humanDelay?: number }
  | { kind: 'wait'; ms: number }
  | { kind: 'highlight'; selector: string; ms: number; narrate?: string }
  | { kind: 'narrate'; text: string; ms?: number }
  | { kind: 'screen'; title: string; subtitle?: string; ms: number };

export type TutorialConfig = {
  id: string;
  title: string;
  outputName: string;
  viewport: { width: number; height: number };
  steps: TutorialStep[];
};

export type RecorderOptions = {
  baseUrl: string;
  email: string;
  password: string;
  videoDir: string;
  viewport: { width: number; height: number };
  /** Si true, abre Chromium en modo visible (debug). Default false (headless). */
  headed?: boolean;
};

export type ComposerOptions = {
  videoWebmPath: string;
  audioMp3Path: string | null;
  outputMp4Path: string;
  fadeMs?: number;
};
