import { useEffect, useRef, useState } from 'react';
import { Check, Gamepad2, Lightbulb, MessageCircleHeart, Play, RotateCcw, Sparkles } from 'lucide-react';
import type { PlayGameId, PlayGameInfo, PlayStatus } from '@/shared/contracts';
import type { AppController } from '../controller';
import { useApp, useController } from '../context';
import { CHAT_TIME_ID, gameWords } from '../state/game';
import { actionLabel } from '../actions';
import './games.css';

// ------------------------------------------------------------------ mini games (games-3): Heart Run, Heart Hoops
/** Same key the experience writes (src/experience/play/game.ts). */
const bestOf = (id: PlayGameId): number => {
  try { return Math.max(0, Number(localStorage.getItem(`cbx.play.best.${id}`)) || 0); } catch { return 0; }
};

/** Close the sheet and start a mini game (Selfie / Photo switch to 3D first). Must run inside the tap. */
export async function startMiniGame(c: AppController, id: PlayGameId): Promise<boolean> {
  const exp = c.experience;
  if (!exp?.startPlay) return false;
  c.closeSheet();
  if (exp.mode === 'face' || exp.mode === 'photo') await exp.setMode('showcase');
  const ok = await exp.startPlay(id);
  if (!ok) c.showToast('info', 'Games play in 3D or AR. Try the 3D view!', 2800);
  return ok;
}

/**
 * Always mounted (App.tsx): the round waits while the conversation sheet is open, and carries on (3, 2, 1) when it
 * closes. Uses the experience's `command('pause' | 'resume')`.
 */
export function PlayBridge() {
  const c = useController();
  const started = useApp((s) => s.started);
  const sheetOpen = useApp((s) => s.sheetOpen);
  const state = useRef<PlayStatus['state']>('idle');
  const heldBySheet = useRef(false);
  useEffect(() => {
    const exp = c.experience;
    if (!exp || !started) return;
    return exp.on('play', (s) => {
      state.current = s.state;
      if (s.state === 'idle' || s.state === 'won' || s.state === 'over') heldBySheet.current = false;
    });
  }, [c, started]);
  useEffect(() => {
    // holdPlay holds the round without a pause card (the sheet is on top); older builds fall back to pause / resume
    const exp = c.experience as (NonNullable<typeof c.experience> & { holdPlay?: (on: boolean) => boolean }) | null;
    if (!exp) return;
    const hold = (on: boolean) => exp.holdPlay ? exp.holdPlay(on) : !!exp.command?.(on ? 'pause' : 'resume');
    if (sheetOpen && (state.current === 'playing' || state.current === 'countdown')) {
      heldBySheet.current = hold(true);
    } else if (!sheetOpen && heldBySheet.current) {
      heldBySheet.current = false;
      hold(false);
    }
  }, [c, sheetOpen]);
  return null;
}

const PLAY_FALLBACK: readonly PlayGameInfo[] = [];

function PlayCards() {
  const c = useController();
  const games = c.experience?.playGames ?? PLAY_FALLBACK;
  const [, bump] = useState(0);
  useEffect(() => c.experience?.on('play', (s) => { if (s.state === 'idle' || s.state === 'won' || s.state === 'over') bump((n) => n + 1); }), [c]);
  if (!games.length) return null;
  return (
    <section className="cb-play" aria-labelledby="cb-play-h">
      <h3 id="cb-play-h" className="cb-play-h">Play</h3>
      <div className="cb-play-cards">
        {games.map((g) => {
          const best = bestOf(g.id);
          return (
            <button key={g.id} type="button" className={`cb-play-card is-${g.id}`} onClick={() => void startMiniGame(c, g.id)} aria-label={`${g.label}. ${g.lead}${best ? ` Best ${best}.` : ''}`}>
              <span className="cb-play-art" aria-hidden="true">{g.id === 'heart-run' ? <RunArt /> : <HoopsArt />}</span>
              <span className="cb-play-name">{g.label}</span>
              <span className="cb-play-lead">{g.lead}</span>
              <span className="cb-play-foot">
                <span className="cb-play-go"><Play size={14} strokeWidth={3} fill="currentColor" aria-hidden="true" /> Play</span>
                {best > 0 && <span className="cb-play-best">Best {best}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Flat card art (no gradients): hearts and a rainbow over a beacon / a rainbow ring and a heart. */
function RunArt() {
  return (
    <svg viewBox="0 0 120 72">
      <ellipse cx="60" cy="62" rx="30" ry="6" fill="#fff" opacity=".35" />
      <ellipse cx="60" cy="62" rx="16" ry="3.4" fill="#fff" opacity=".7" />
      <path d="M60 52 47.4 39.8a8.6 8.6 0 0 1 12.6-11.6 8.6 8.6 0 0 1 12.6 11.6Z" fill="#fff" />
      <path d="M26 40 20 34.2a4.1 4.1 0 0 1 6-5.5 4.1 4.1 0 0 1 6 5.5Z" fill="#ffd6ea" />
      <path d="M96 30 90.4 24.6a3.9 3.9 0 0 1 5.6-5.2 3.9 3.9 0 0 1 5.6 5.2Z" fill="#ffd84a" />
      <g fill="none" strokeWidth="4"><path d="M84 56a14 14 0 0 1 28 0" stroke="#ff5a5f" /><path d="M88 56a10 10 0 0 1 20 0" stroke="#ffd84a" /><path d="M92 56a6 6 0 0 1 12 0" stroke="#439bdd" /></g>
      <g stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".8"><path d="M8 20h10M4 28h8M10 48h8" /></g>
    </svg>
  );
}
function HoopsArt() {
  const c = ['#ff5a5f', '#ff9a3d', '#ffd84a', '#5fcf86', '#439bdd', '#9a6bff'];
  return (
    <svg viewBox="0 0 120 72">
      {c.map((col, i) => <circle key={col} cx="74" cy="32" r={24 - i * 2.4} fill="none" stroke={col} strokeWidth="2.6" />)}
      <ellipse cx="74" cy="60" rx="14" ry="6" fill="#fff" />
      <ellipse cx="64" cy="61" rx="8" ry="4.5" fill="#fff" />
      <ellipse cx="84" cy="61" rx="8" ry="4.5" fill="#fff" />
      <path d="M30 50 22 42.3a5.4 5.4 0 0 1 8-7.3 5.4 5.4 0 0 1 8 7.3Z" fill="#fff" />
      <g fill="#fff" opacity=".8"><circle cx="40" cy="30" r="2" /><circle cx="48" cy="24" r="2" /><circle cx="57" cy="22" r="2" /></g>
    </svg>
  );
}

/** Game selector. Choosing a game (or Free play) starts it fresh. */
export function GamesPanel() {
  const c = useController();
  const modes = useApp((s) => s.ui.gameModes.filter((g) => g.enabled));
  const keywords = useApp((s) => s.ui.keywords);
  const game = useApp((s) => s.game);
  const current = modes.find((m) => m.id === game.modeId) ?? null;
  const words = gameWords(current, keywords);

  return (
    <div className="cb-games">
      <PlayCards />
      <h3 className="cb-play-h">Word games</h3>
      <p className="cb-panel-lead">Get Happi to say the magic words. Ask her questions; you can’t just tell her the word!</p>
      <div className="cb-game-list" role="radiogroup" aria-label="Choose a game">
        {modes.map((m) => {
          const n = gameWords(m, keywords).length;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={game.modeId === m.id}
              className="cb-game"
              onClick={() => c.selectGame(m.id)}
            >
              <span className="cb-game-icon" aria-hidden="true">
                {m.id === CHAT_TIME_ID ? <MessageCircleHeart size={22} strokeWidth={2.2} /> : <Gamepad2 size={22} strokeWidth={2.2} />}
              </span>
              <span className="cb-game-body">
                <span className="cb-game-name">{m.name}</span>
                {m.description && <span className="cb-game-desc">{m.description}</span>}
                <span className="cb-game-meta">{m.id === CHAT_TIME_ID ? 'All the magic words' : `${n} word${n === 1 ? '' : 's'} to find`}</span>
              </span>
              <span className="cb-game-check" aria-hidden="true"><Check size={16} strokeWidth={3} /></span>
            </button>
          );
        })}
        <button type="button" role="radio" aria-checked={game.modeId === null} className="cb-game" onClick={() => c.selectGame(null)}>
          <span className="cb-game-icon is-free" aria-hidden="true"><Sparkles size={22} strokeWidth={2.2} /></span>
          <span className="cb-game-body">
            <span className="cb-game-name">Free play</span>
            <span className="cb-game-desc">No game, just chat and have fun.</span>
          </span>
          <span className="cb-game-check" aria-hidden="true"><Check size={16} strokeWidth={3} /></span>
        </button>
      </div>
      {current && (
        <div className="cb-game-progress">
          <h3>{current.name}: {game.found.length} of {words.length} found</h3>
          <ul className="cb-wordchips" aria-label="Words">
            {words.map((w) => {
              const found = game.found.includes(w);
              return (
                <li key={w} className={found ? 'is-found' : ''}>
                  {found && <Check aria-hidden="true" size={14} />}
                  {actionLabel(w)}
                  <span className="cb-sr-only">{found ? ' (found)' : ' (not found yet)'}</span>
                </li>
              );
            })}
          </ul>
          <div className="cb-row">
            <button type="button" className="cb-btn is-soft" onClick={() => c.openOverlay('hint')}>
              <Lightbulb aria-hidden="true" size={20} /> Hints
            </button>
            <button type="button" className="cb-btn is-ghost" onClick={() => c.resetGame()} disabled={game.found.length === 0}>
              <RotateCcw aria-hidden="true" size={20} /> Start over
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
