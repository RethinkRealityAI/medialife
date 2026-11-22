// Word game rules (PROJECT_GUIDE section 10), as pure functions so they are easy to read and test.
//
//  - A game has trigger words. Chat Time ('chat-time') uses every keyword (auto-synced), others their own list.
//  - A word counts when CHEER BEAR says it. Typed messages, quick actions and the user's own speech still play
//    the scene reaction but never count.
//  - While a game is on, a word Happi says that is not in the game is ignored (old app behaviour).
//  - One-and-done: once a word is found it does not fire again until the game is reset.
//  - Reset paths: Play again, changing game mode, closing the completion modal.
import type { GameMode } from '@/shared/config';
import type { TriggerEvent } from '@/shared/contracts';

export const CHAT_TIME_ID = 'chat-time';

export interface GameState {
  modeId: string | null;
  /** Words found, in the casing of the game's word list. */
  found: string[];
  startedAt: number;
  completedAt: number | null;
}

export const newGame = (modeId: string | null, now = Date.now()): GameState => ({
  modeId, found: [], startedAt: now, completedAt: null,
});

export function gameWords(mode: GameMode | null, keywords: string[]): string[] {
  if (!mode) return [];
  const words = mode.id === CHAT_TIME_ID || mode.triggerWords.length === 0 ? keywords : mode.triggerWords;
  const seen = new Set<string>();
  return words.filter((w) => {
    const k = w.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export interface TriggerDecision {
  /** Play the reaction in the scene. */
  fire: boolean;
  /** The game word this newly found (null when nothing counts). */
  found: string | null;
  /** True when this find completes the game. */
  completes: boolean;
  /** Why the scene did not play it (staff view). */
  reason?: 'not in this game' | 'already found' | 'game finished';
}

export function decideTrigger(
  state: GameState,
  mode: GameMode | null,
  words: string[],
  keyword: string,
  speaker: TriggerEvent['speaker'],
): TriggerDecision {
  const none = { found: null, completes: false };
  // manual and user-side triggers never count and are not gated by the game
  if (speaker !== 'cheer_bear' || !mode) return { fire: true, ...none };
  if (state.completedAt) return { fire: false, ...none, reason: 'game finished' };
  const match = words.find((w) => w.toLowerCase() === keyword.toLowerCase());
  if (!match) return { fire: false, ...none, reason: 'not in this game' };
  if (state.found.includes(match)) return { fire: false, ...none, reason: 'already found' };
  const completes = words.length > 0 && state.found.length + 1 === words.length;
  return { fire: true, found: match, completes };
}

export function applyFound(state: GameState, word: string, completes: boolean, now = Date.now()): GameState {
  return { ...state, found: [...state.found, word], completedAt: completes ? now : null };
}

/** Pick which game is on: the user's last choice if still enabled, else the config default. */
export function resolveGameMode(
  modes: GameMode[],
  userChoice: string | null,
  configDefault: string | null,
  noGameSentinel: string,
): string | null {
  const enabled = modes.filter((m) => m.enabled);
  if (userChoice === noGameSentinel) return null;
  if (userChoice && enabled.some((m) => m.id === userChoice)) return userChoice;
  if (configDefault && enabled.some((m) => m.id === configDefault)) return configDefault;
  return null;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s} second${s === 1 ? '' : 's'}`;
  return `${m} min ${s} s`;
}
