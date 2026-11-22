// Per-device user preferences in localStorage (the old app's utils/storage.ts idea: never throw, always fall back).
import type { UiMode } from '@/shared/config';

export const NO_GAME = '__none__';

export interface Prefs {
  /** The user's chosen UI mode; null = follow the config default. */
  uiMode: UiMode | null;
  /** Conversation sheet open state the user last chose; null = follow the config default for the device. */
  sheetOpen: boolean | null;
  /** Last chosen game mode id, NO_GAME for "free play", null = follow the config's activeGameMode. */
  lastGameMode: string | null;
  /** Welcome modal version the user has dismissed (0 = never). */
  welcomeSeenVersion: number;
  /** The one-line microphone explainer has been shown and accepted. */
  micExplained: boolean;
  /** The "Tap to call" nudge next to the talk button has been retired (after the first call). */
  orbNudgeDone: boolean;
  /** Voice mode: tap once to start and once to stop instead of holding (null = the admin default). */
  tapToTalk: boolean | null;
  /** Voice mode: Happi answers out loud (null = the admin default). */
  spokenReplies: boolean | null;
  /** The "Hold to talk" nudge has been retired (after the first hold that heard something). */
  voiceNudgeDone: boolean;
}

const KEY = 'cb.app.prefs.v1';

export const DEFAULT_PREFS: Prefs = {
  uiMode: null,
  sheetOpen: null,
  lastGameMode: null,
  welcomeSeenVersion: 0,
  micExplained: false,
  orbNudgeDone: false,
  tapToTalk: null,
  spokenReplies: null,
  voiceNudgeDone: false,
};

export const storage = {
  get(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string): boolean {
    try { localStorage.setItem(key, value); return true; } catch { return false; }
  },
  remove(key: string): void {
    try { localStorage.removeItem(key); } catch { /* storage blocked: nothing to do */ }
  },
};

export function loadPrefs(): Prefs {
  const raw = storage.get(KEY);
  if (!raw) return { ...DEFAULT_PREFS };
  try {
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    const p = { ...DEFAULT_PREFS, ...parsed };
    if (p.uiMode !== null && !['calm', 'chat', 'call_debug'].includes(p.uiMode)) p.uiMode = null;
    if (typeof p.welcomeSeenVersion !== 'number') p.welcomeSeenVersion = 0;
    return p;
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(p: Prefs): void {
  storage.set(KEY, JSON.stringify(p));
}
