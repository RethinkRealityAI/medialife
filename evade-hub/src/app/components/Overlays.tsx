// The app's modals: welcome, game details + hints, completion, keyboard shortcuts. All native <dialog>s.
import { useState } from 'react';
import {
  Check, Clock, Gamepad2, Heart, House, Info, Lightbulb, MessageSquare, Phone, RotateCcw, Sparkles, Trophy, X,
  type LucideIcon,
} from 'lucide-react';
import { useApp, useController } from '../context';
import { CHAT_TIME_ID, formatDuration, gameWords } from '../state/game';
import { actionLabel } from '../actions';
import { Dialog } from './Dialog';

const WELCOME_ICONS: Record<string, LucideIcon> = {
  Phone, MessageSquare, Home: House, House, Gamepad2, Heart, Sparkles, Info,
};

function CloseX({ onClick, label = 'Close' }: { onClick(): void; label?: string }) {
  return (
    <button type="button" className="cb-dialog-x" onClick={onClick} aria-label={label}>
      <X aria-hidden="true" size={22} />
    </button>
  );
}

export function Overlays() {
  const overlay = useApp((s) => s.overlay);
  const c = useController();
  const close = () => c.closeOverlay();
  return (
    <>
      <Dialog open={overlay === 'welcome'} onClose={close} labelledBy="cb-welcome-title" className="is-welcome">
        <WelcomeBody />
      </Dialog>
      <Dialog open={overlay === 'hint'} onClose={close} labelledBy="cb-hint-title" className="is-hint">
        <HintBody />
      </Dialog>
      <Dialog open={overlay === 'completion'} onClose={close} labelledBy="cb-done-title" className="is-done" lightDismiss={false}>
        <CompletionBody />
      </Dialog>
      <Dialog open={overlay === 'keys'} onClose={close} labelledBy="cb-keys-title" className="is-keys">
        <KeysBody />
      </Dialog>
    </>
  );
}

function WelcomeBody() {
  const c = useController();
  const wm = useApp((s) => s.ui.welcome);
  return (
    <div className="cb-dialog-body">
      <CloseX onClick={() => c.closeOverlay()} />
      <div className="cb-dialog-badge" aria-hidden="true"><Heart size={28} strokeWidth={2.4} /></div>
      <h2 id="cb-welcome-title">{wm.title}</h2>
      {wm.description && <p className="cb-dialog-lead">{wm.description}</p>}
      {wm.heroImageUrl && <img className="cb-welcome-hero" src={wm.heroImageUrl} alt="" />}
      {wm.items.length > 0 && (
        <ul className="cb-welcome-items">
          {wm.items.map((it) => {
            const Icon = WELCOME_ICONS[it.icon] ?? Sparkles;
            return (
              <li key={it.id}>
                <span className="cb-welcome-icon" aria-hidden="true"><Icon size={22} /></span>
                <span>
                  <strong>{it.title}</strong>
                  {it.description && <span>{it.description}</span>}
                </span>
                {it.imageUrl && <img src={it.imageUrl} alt="" />}
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" className="cb-btn is-primary is-wide is-big" data-autofocus onClick={() => c.closeOverlay()}>
        Let’s go!
      </button>
    </div>
  );
}

function HintBody() {
  const c = useController();
  const game = useApp((s) => s.game);
  const modes = useApp((s) => s.ui.gameModes);
  const keywords = useApp((s) => s.ui.keywords);
  const [open, setOpen] = useState<string | null>(null);
  const mode = modes.find((m) => m.id === game.modeId);
  if (!mode) {
    return (
      <div className="cb-dialog-body">
        <CloseX onClick={() => c.closeOverlay()} />
        <h2 id="cb-hint-title">No game on</h2>
        <p className="cb-dialog-lead">Pick a game in the Games tab to get hints.</p>
      </div>
    );
  }
  const words = gameWords(mode, keywords);
  const specific = (w: string) => mode.hints.specific[w.toLowerCase()] ?? mode.hints.specific[w] ?? [];
  const isChatTime = mode.id === CHAT_TIME_ID;
  return (
    <div className="cb-dialog-body">
      <CloseX onClick={() => c.closeOverlay()} />
      <p className="cb-dialog-kicker"><Gamepad2 aria-hidden="true" size={16} /> Game</p>
      <h2 id="cb-hint-title">{mode.name}</h2>
      <p className="cb-dialog-lead">{mode.instructions || mode.objective || mode.description}</p>

      <h3 className="cb-dialog-h3">
        Words to find{isChatTime ? '' : `: ${game.found.length} of ${words.length}`}
      </h3>
      <ul className="cb-hint-words">
        {words.map((w) => {
          const found = game.found.includes(w);
          const n = specific(w).length;
          return (
            <li key={w}>
              <button
                type="button"
                className={`cb-hint-word${found ? ' is-found' : ''}`}
                aria-expanded={open === w}
                aria-controls={n ? `cb-hint-${w}` : undefined}
                onClick={() => setOpen(open === w ? null : w)}
              >
                {found ? <Check aria-hidden="true" size={16} /> : null}
                {actionLabel(w)}
                <span className="cb-sr-only">{found ? ' (found)' : ''}{n ? `, ${n} hints` : ''}</span>
                {n > 0 && !found && <span className="cb-hint-n" aria-hidden="true">{n}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {open && (
        <div className="cb-hint-box" id={`cb-hint-${open}`}>
          <h4><Lightbulb aria-hidden="true" size={18} /> Ask about “{actionLabel(open)}”</h4>
          {specific(open).length ? (
            <ul>{specific(open).map((h, i) => <li key={i}>“{h}”</li>)}</ul>
          ) : <p>No special hints for this one. Try the questions below!</p>}
        </div>
      )}

      <p className="cb-hint-note"><Info aria-hidden="true" size={18} /><span>It only counts when <strong>Happi</strong> says the word. You can’t just ask her to say it, so be clever!</span></p>

      {mode.hints.general.length > 0 && (
        <>
          <h3 className="cb-dialog-h3">Questions to try</h3>
          <ul className="cb-hint-list">{mode.hints.general.map((h, i) => <li key={i}>“{h}”</li>)}</ul>
        </>
      )}
      <button type="button" className="cb-btn is-primary is-wide" data-autofocus onClick={() => c.closeOverlay()}>Got it!</button>
    </div>
  );
}

const CONFETTI = ['--cb-rainbow-1', '--cb-rainbow-2', '--cb-rainbow-3', '--cb-rainbow-4', '--cb-rainbow-5', '--cb-rainbow-6'];

function CompletionBody() {
  const c = useController();
  const game = useApp((s) => s.game);
  const modes = useApp((s) => s.ui.gameModes);
  const mode = modes.find((m) => m.id === game.modeId);
  const time = game.completedAt ? game.completedAt - game.startedAt : null;
  const message = mode?.id === CHAT_TIME_ID
    ? 'What a chat! Happi said every magic word. Want to talk more and see them again?'
    : 'Great job getting Happi to say all the words!';
  return (
    <div className="cb-dialog-body">
      <div className="cb-confetti" aria-hidden="true">
        {Array.from({ length: 24 }, (_, i) => (
          <i key={i} style={{ left: `${(i * 37) % 100}%`, background: `var(${CONFETTI[i % 6]})`, animationDelay: `${(i % 8) * 0.09}s` }} />
        ))}
      </div>
      <div className="cb-trophy" aria-hidden="true"><Trophy size={52} strokeWidth={2} /></div>
      <h2 id="cb-done-title">You did it!</h2>
      <p className="cb-dialog-lead">You finished <strong>{mode?.name ?? 'the game'}</strong>.</p>
      {game.found.length > 0 && (
        <ul className="cb-wordchips is-center" aria-label="Words found">
          {game.found.map((w) => <li key={w} className="is-found"><Check aria-hidden="true" size={14} />{actionLabel(w)}</li>)}
        </ul>
      )}
      {time !== null && (
        <p className="cb-done-time"><Clock aria-hidden="true" size={18} /> Done in <strong>{formatDuration(time)}</strong></p>
      )}
      <p className="cb-done-msg">{message}</p>
      <div className="cb-row is-stack">
        <button type="button" className="cb-btn is-primary is-wide is-big" data-autofocus onClick={() => c.playAgain()}>
          <RotateCcw aria-hidden="true" size={20} /> Play again
        </button>
        <button type="button" className="cb-btn is-ghost is-wide" onClick={() => c.closeOverlay()}>Close</button>
      </div>
    </div>
  );
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD = isMac ? '⌘' : 'Ctrl';

export const SHORTCUTS: Array<{ keys: string[]; what: string }> = [
  { keys: ['W', 'A', 'S', 'D'], what: 'Walk Happi round the square (or the arrow keys)' },
  { keys: ['Space'], what: 'Throw a blossom' },
  { keys: [MOD, 'Shift', '?'], what: 'Show these shortcuts' },
  { keys: ['Esc'], what: 'Close a window' },
];

function KeysBody() {
  const c = useController();
  return (
    <div className="cb-dialog-body">
      <CloseX onClick={() => c.closeOverlay()} />
      <h2 id="cb-keys-title">Keyboard shortcuts</h2>
      <dl className="cb-keys">
        {SHORTCUTS.map((s) => (
          <div key={s.what} className="cb-dl-row">
            <dt>{s.keys.map((k, i) => <span key={i}>{i > 0 && ' + '}<kbd>{k}</kbd></span>)}</dt>
            <dd>{s.what}</dd>
          </div>
        ))}
      </dl>
      <button type="button" className="cb-btn is-primary is-wide" data-autofocus onClick={() => c.closeOverlay()}>Got it</button>
    </div>
  );
}
