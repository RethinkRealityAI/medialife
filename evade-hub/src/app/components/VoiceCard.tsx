// Voice mode in the Talk tab (voice-3): a big "Hold to talk" button (the same hold as the talk button, for when the
// panel covers it), what to say, and the call as a smaller second choice: the only call entry while voice mode is on
// (the floating button is the mic; during a call it is the call button again). Shown when voice mode is on and no call is
// live; during a call the Talk tab shows the call card as before.
import { useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Mic, Phone, Sparkles } from 'lucide-react';
import { useApp, useController } from '../context';

export function VoiceCard() {
  const c = useController();
  const voice = useApp((s) => s.voice);
  const text = useApp((s) => s.voiceText);
  const tapToTalk = useApp((s) => s.prefs.tapToTalk ?? !s.ui.voiceMode.holdToTalk);
  const canCall = useApp((s) => s.ui.show.call);
  const callLabel = useApp((s) => s.ui.text.call);
  const call = useApp((s) => s.call);
  const keyHeld = useRef(false);
  const listening = voice === 'starting' || voice === 'listening' || voice === 'finishing';
  const off = voice === 'unsupported' || voice === 'denied';
  const ex = c.voiceUi.examples();

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    c.voiceUi.press('pointer');
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (e.repeat || keyHeld.current) return;
    keyHeld.current = true;
    if (tapToTalk || off) c.voiceUi.click(); else c.voiceUi.press('key');
  };
  const onKeyUp = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    keyHeld.current = false;
    c.voiceUi.release();
  };

  return (
    <div className={`cb-voicecard${listening ? ' is-live' : ''}`}>
      {off ? (
        <>
          {(() => {
            // voice-4: the specific reason (Siri & Dictation off, mic refused, no recognition) and what a grown-up can change
            const why = c.voiceUi.blockedText;
            return (
              <>
                <p className="cb-voicecard-line">{why?.text ?? (voice === 'denied' ? 'Your microphone is off.' : 'This browser can’t hear you.')}{why && /magic word/i.test(why.text) ? '' : ' Tap a magic word instead!'}</p>
                {why?.help && <p className="cb-voicecard-help">{why.help}</p>}
              </>
            );
          })()}
          <button type="button" className="cb-btn is-primary is-wide is-big" onClick={() => c.setTab('actions')}>
            <Sparkles aria-hidden="true" size={22} /> Magic words
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className={`cb-holdbtn${listening ? ' is-live' : ''}`}
            aria-pressed={tapToTalk ? listening : undefined}
            onPointerDown={tapToTalk ? undefined : onPointerDown}
            onPointerUp={tapToTalk ? undefined : () => c.voiceUi.release()}
            onPointerCancel={tapToTalk ? undefined : () => c.voiceUi.abort()}
            onLostPointerCapture={tapToTalk ? undefined : () => c.voiceUi.abort()}
            onKeyDown={onKeyDown}
            onKeyUp={onKeyUp}
            onContextMenu={(e) => e.preventDefault()}
            onClick={() => c.voiceUi.click()}
          >
            <span className="cb-holdbtn-icon" aria-hidden="true"><Mic size={26} strokeWidth={2.4} /></span>
            <span>{listening ? (text || 'Listening…') : tapToTalk ? 'Tap to talk' : 'Hold to talk'}</span>
          </button>
          <p className="cb-voicecard-line">
            Say <b>“{ex[0]?.label ?? 'Rainbow'}”</b>, <b>“{ex[1]?.label ?? 'Dance'}”</b> or <b>“{ex[2]?.label ?? 'Go to AR'}”</b>
          </p>
        </>
      )}
      {canCall && (call === 'idle' || call === 'error') && (
        <button type="button" className="cb-btn is-soft is-wide cb-voicecard-call" onClick={() => c.requestCall()}>
          <Phone aria-hidden="true" size={18} /> {call === 'error' ? 'Try calling again' : callLabel}
        </button>
      )}
    </div>
  );
}
