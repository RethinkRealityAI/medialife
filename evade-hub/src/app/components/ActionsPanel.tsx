import { useApp, useController } from '../context';
import { actionLook } from '../actions';

/** Quick actions: one big button per trigger word -> voice.fireTrigger(keyword, 'quick-action'). */
export function ActionsPanel() {
  const c = useController();
  const keywords = useApp((s) => s.ui.keywords);
  const inGame = useApp((s) => !!s.game.modeId);
  return (
    <div className="cb-actions">
      <p className="cb-panel-lead">Tap one and Happi does it.{inGame ? ' These don’t count in the game: she has to say the words!' : ''}</p>
      <div className="cb-action-grid">
        {keywords.map((k) => {
          const look = actionLook(k);
          return (
            <button key={k} type="button" className="cb-action" onClick={() => c.quickAction(k)}>
              <span className="cb-action-icon" style={{ background: look.color }} aria-hidden="true">
                <look.icon size={18} strokeWidth={2.4} />
              </span>
              <span>{look.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
