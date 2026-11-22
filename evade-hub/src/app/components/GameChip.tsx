// Game progress chip, centred under the experience's top bar while a game is on. Tap opens the game details
// (words, hints). Chat Time hides the total, as in the old app.
import { Gamepad2 } from 'lucide-react';
import { useApp, useController } from '../context';
import { CHAT_TIME_ID, gameWords } from '../state/game';

export function GameChip() {
  const c = useController();
  const game = useApp((s) => s.game);
  const modes = useApp((s) => s.ui.gameModes);
  const keywords = useApp((s) => s.ui.keywords);
  const mode = modes.find((m) => m.id === game.modeId && m.enabled);
  // Selfie and 3D Photo are about the picture: the chip would sit on the title art and in the photo's framing.
  const expMode = useApp((st) => st.expMode);
  const shown = !!mode && expMode !== 'face' && expMode !== 'photo';
  // (the experience's hint pill moves down under the chip: TopSlot in App.tsx measures the slot)
  if (!mode || !shown) return null;
  const words = gameWords(mode, keywords);
  const found = game.found.length;
  const showTotal = mode.id !== CHAT_TIME_ID;
  const count = showTotal ? `${found} of ${words.length} words` : `${found} word${found === 1 ? '' : 's'} found`;
  return (
    <button
      type="button"
      className={`cb-chip${game.completedAt ? ' is-done' : ''}`}
      onClick={() => c.openOverlay('hint')}
      aria-label={`${mode.name}: ${count}. Open game details and hints`}
      data-testid="game-chip"
    >
      <span className="cb-chip-icon" aria-hidden="true"><Gamepad2 size={16} strokeWidth={2.4} /></span>
      <span className="cb-chip-name">{mode.name}</span>
      <span className="cb-chip-count">{count}</span>
      {showTotal && words.length <= 12 && (
        <span className="cb-chip-dots" aria-hidden="true">
          {words.map((w) => <i key={w} className={game.found.includes(w) ? 'on' : ''} />)}
        </span>
      )}
    </button>
  );
}
