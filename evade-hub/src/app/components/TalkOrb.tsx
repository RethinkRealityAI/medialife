// The call orb: bottom right, 72px, always within thumb reach. Never covers the experience's shutter / joystick
// (bottom centre) or Move (bottom left).
//   idle        a slow breathing ring; tap -> (first time: one-line microphone explainer) -> call
//   connecting  rings ripple out and the phone wiggles (no spinner); tap opens the conversation
//   in call     green; while Happi speaks two rings follow her voice level; tap opens the conversation;
//               press and hold OR the red button above it ends the call
//   error       a short shake, a red ring; tap tries again
//   voice       (voice-3, no call live and voiceMode on) a mic: HOLD to talk, let go when done (walkie-talkie).
//               While held: the live words in a bubble above it, its ring follows your mic level, a light tick on
//               press. A quick tap says "Hold me while you talk!". Keyboard: hold Space / Enter. Settings has "Tap to
//               talk" for people who cannot hold. No speech recognition here / mic blocked: it opens the magic words.
//               Calling lives in the Talk tab ("Call Happi"); during a call this button is the call button as above.
//               The first-time "Hold to talk" nudge points straight at it: the panel button above it waits until the
//               nudge goes (first words, or after NUDGE_MS) so nothing sits between the two.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { LayoutGrid, MessageCircle, Mic, MicOff, Phone, PhoneOff, RotateCcw, Sparkles } from 'lucide-react';
import { useApp, useController } from '../context';
import type { VoiceBubble } from '../state/appState';
import { VoiceDiagHost } from './VoiceDiagHost';

const HOLD_MS = 700;
const NUDGE_MS = 12000;

export function TalkOrb() {
  const c = useController();
  const call = useApp((s) => s.call);
  const speaking = useApp((s) => s.speaking);
  const muted = useApp((s) => s.muted);
  const micAsk = useApp((s) => s.micAsk);
  const nudge = useApp((s) => !s.prefs.orbNudgeDone);
  const sheetOpen = useApp((s) => s.sheetOpen);
  const overlay = useApp((s) => s.overlay);
  const text = useApp((s) => s.ui.text);
  const canCall = useApp((s) => s.ui.show.call);
  // the first-time nudge only in the 3D view: in camera modes the bottom centre holds Place / shutter pills
  const quietCorner = useApp((s) => s.expMode !== 'showcase' || s.expBusy || s.captionOn);
  const isDesktop = useApp((s) => s.isDesktop);
  const voiceEnabled = useApp((s) => s.ui.voiceMode.enabled);
  const voice = useApp((s) => s.voice);
  const voiceBubble = useApp((s) => s.voiceBubble);
  const voiceNudge = useApp((s) => !s.prefs.voiceNudgeDone);
  const tapToTalk = useApp((s) => s.prefs.tapToTalk ?? !s.ui.voiceMode.holdToTalk);
  const keyHeld = useRef(false);
  const [nudgeExpired, setNudgeExpired] = useState(false);
  const [holding, setHolding] = useState(false);
  const holdTimer = useRef<number | null>(null);
  const held = useRef(false);
  const orbRef = useRef<HTMLButtonElement>(null);

  const inCall = call === 'in-call';
  const busy = call === 'connecting' || call === 'ringing' || call === 'ending';
  const voiceOn = voiceEnabled && (call === 'idle' || call === 'error');
  const listening = voiceOn && (voice === 'starting' || voice === 'listening' || voice === 'finishing');
  const voiceOff = voiceOn && (voice === 'unsupported' || voice === 'denied');

  useEffect(() => () => { if (holdTimer.current) clearTimeout(holdTimer.current); }, []);
  // the first-time nudge hides the panel button: give it back after a while even if nobody talks
  useEffect(() => {
    if (!voiceNudge || nudgeExpired) return;
    const t = window.setTimeout(() => setNudgeExpired(true), NUDGE_MS);
    return () => clearTimeout(t);
  }, [voiceNudge, nudgeExpired]);

  // her voice level drives the rings directly (style writes from a rAF loop, no React renders)
  useEffect(() => {
    const orb = orbRef.current;
    if (!inCall || !orb) return;
    const [a, b] = orb.querySelectorAll<HTMLElement>('.cb-orb-wave');
    const core = orb.querySelector<HTMLElement>('.cb-orb-core');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let wasLive = false;
    const off = c.level.subscribe((l, live) => {
      if (live !== wasLive) {
        orb.classList.toggle('has-level', live);
        wasLive = live;
        if (!live) for (const e of [a, b, core]) if (e) { e.style.transform = ''; e.style.opacity = ''; }
      }
      if (!live) return;
      const k = reduced ? 0.35 : 1;
      a.style.transform = `scale(${1 + l * 0.36 * k})`;
      a.style.opacity = String(Math.min(0.75, 0.2 + l));
      b.style.transform = `scale(${1.05 + l * 0.8 * k})`;
      b.style.opacity = String(Math.min(0.9, l * 1.4));
      if (core) core.style.transform = `scale(${1 + l * 0.08 * k})`;
    });
    return () => {
      off();
      orb.classList.remove('has-level');
      for (const e of [a, b, core]) if (e) { e.style.transform = ''; e.style.opacity = ''; }
    };
  }, [inCall, c, sheetOpen]);

  // your mic level drives the rings while you hold (style writes, no React renders)
  useEffect(() => {
    const orb = orbRef.current;
    if (!listening || !orb) return;
    const [a, b] = orb.querySelectorAll<HTMLElement>('.cb-orb-wave');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    orb.classList.add('has-level');
    const off = c.voiceUi.onLevel((l) => {
      const k = reduced ? 0.35 : 1;
      if (a) { a.style.transform = `scale(${1.02 + l * 0.42 * k})`; a.style.opacity = String(Math.min(0.8, 0.25 + l)); }
      if (b) { b.style.transform = `scale(${1.08 + l * 0.85 * k})`; b.style.opacity = String(Math.min(0.9, 0.15 + l * 1.3)); }
    });
    return () => {
      off();
      orb.classList.remove('has-level');
      for (const e of [a, b]) if (e) { e.style.transform = ''; e.style.opacity = ''; }
    };
  }, [listening, c]);

  // phones: the sheet covers the corner. Desktop: the sidebar sits beside it, so voice mode stays in reach.
  if (sheetOpen && !(isDesktop && voiceOn)) return <VoiceDiagHost />;

  const state = inCall ? 'live' : busy ? 'busy' : voiceOn ? 'voice' : !canCall ? 'chat' : call === 'error' ? 'error' : 'idle';
  const label = {
    chat: text.openChat,
    idle: text.call,
    busy: 'Calling Happi. Open the conversation',
    live: `On a call with Happi. Open the conversation. Press and hold to ${text.hangUp.toLowerCase()}`,
    error: 'Call did not connect. Tap to try again',
    voice: voiceOff ? 'Open the magic words'
      : listening ? (tapToTalk ? 'Listening. Tap again when you are done' : 'Listening. Let go when you are done')
        : tapToTalk ? 'Tap to talk to Happi' : 'Hold to talk to Happi',
  }[state];

  const startHold = () => {
    if (!inCall) return;
    held.current = false;
    setHolding(true);
    holdTimer.current = window.setTimeout(() => {
      held.current = true;
      setHolding(false);
      navigator.vibrate?.(20);
      c.hangUp();
    }, HOLD_MS);
  };
  const endHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setHolding(false);
  };

  const Icon = state === 'voice' ? (voiceOff ? Sparkles : Mic)
    : state === 'chat' ? MessageCircle : state === 'live' ? (muted ? MicOff : Mic) : state === 'error' ? RotateCcw : Phone;
  const bubble = state === 'busy' ? (call === 'ringing' ? 'Ringing…' : call === 'ending' ? 'Hanging up…' : 'Calling…')
    : state === 'idle' && nudge && !micAsk && !quietCorner ? 'Tap to call Happi'
      : state === 'error' ? 'Tap to try again' : null;
  // the first-time voice nudge: right above the mic, its tail pointing at it (the panel button waits)
  const voiceNudgeOn = state === 'voice' && !micAsk && !voiceBubble && voiceNudge && !nudgeExpired && !voiceOff && !quietCorner && !listening;
  const showMore = (state === 'idle' || state === 'error' || (state === 'voice' && !listening && !voiceBubble && !voiceNudgeOn)) && !micAsk && !(isDesktop && sheetOpen);
  const above = showMore ? 1 : 0;
  // voice mode's bubble: live words, hints, "try saying" chips, the camera chip; else the first-time nudge
  const vBubble: VoiceBubble | null = state !== 'voice' || micAsk ? null
    : voiceBubble ?? (voiceNudgeOn ? { id: 0, kind: 'nudge', text: tapToTalk ? 'Tap to talk' : 'Hold to talk' } : null);


  // ---- voice mode input (pointer hold, keyboard hold, click)
  const vPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not supported */ }
    c.voiceUi.press('pointer');
  };
  const vKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (e.repeat || keyHeld.current) return;
    keyHeld.current = true;
    if (tapToTalk || voiceOff) c.voiceUi.click(); else c.voiceUi.press('key');
  };
  const vKeyUp = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    keyHeld.current = false;
    c.voiceUi.release();
  };
  const voiceHandlers = state === 'voice' ? {
    onPointerDown: vPointerDown,
    onPointerUp: () => c.voiceUi.release(),
    onPointerCancel: () => c.voiceUi.abort(),
    onLostPointerCapture: () => c.voiceUi.abort(),
    onKeyDown: vKeyDown,
    onKeyUp: vKeyUp,
    onBlur: () => { if (keyHeld.current) { keyHeld.current = false; c.voiceUi.release(); } },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onClick: () => c.voiceUi.click(),
  } : null;

  return (
    <div className="cb-orb-dock">
      <VoiceDiagHost />
      {micAsk && !overlay && <MicExplainer />}
      {bubble && !micAsk && state !== 'voice' && (
        <div key={bubble} className={`cb-orb-bubble${state === 'error' ? ' is-error' : ''}${showMore ? ' is-above-more' : ''}`} aria-hidden="true">{bubble}</div>
      )}
      {vBubble && <VoiceBubbleView b={vBubble} above={above} listening={listening} />}
      {inCall ? (
        <button type="button" className="cb-hangup" onClick={() => c.hangUp()} aria-label={text.hangUp}>
          <PhoneOff aria-hidden="true" size={22} strokeWidth={2.4} />
        </button>
      ) : showMore && (
        // without a call, the talk button calls (or listens): this opens chat, actions, games and settings instead
        <button type="button" className="cb-more" onClick={() => c.openSheet()} aria-label="Open chat, games and settings">
          <LayoutGrid aria-hidden="true" size={22} strokeWidth={2.4} />
        </button>
      )}
      <button
        ref={orbRef}
        type="button"
        className={`cb-orb is-${state}${call === 'ringing' ? ' is-ringing' : ''}${speaking && inCall ? ' is-speaking' : ''}${holding ? ' is-holding' : ''}${listening ? ' is-listening' : ''}${voiceOff ? ' is-voice-off' : ''}`}
        aria-label={label}
        aria-haspopup={state === 'idle' || state === 'voice' ? undefined : 'dialog'}
        aria-pressed={state === 'voice' && tapToTalk && !voiceOff ? listening : undefined}
        data-testid="talk-orb"
        {...(voiceHandlers ?? {})}
        {...(voiceHandlers ? {} : { onPointerDown: startHold })}
        {...(voiceHandlers ? {} : {
          onPointerUp: endHold,
          onPointerLeave: endHold,
          onPointerCancel: endHold,
          onContextMenu: (e: React.MouseEvent) => e.preventDefault(), // iOS / Android long press: no menu
          onClick: () => {
            if (held.current) { held.current = false; return; }
            navigator.vibrate?.(8);
            c.tapOrb();
          },
        })}
      >
        <span className="cb-orb-ring" aria-hidden="true" />
        <span className="cb-orb-ring is-2" aria-hidden="true" />
        {(inCall || listening) && <><span className="cb-orb-wave" aria-hidden="true" /><span className="cb-orb-wave is-2" aria-hidden="true" /></>}
        <span className="cb-orb-face" aria-hidden="true" />
        <span className="cb-orb-core" aria-hidden="true"><Icon size={30} strokeWidth={2.4} /></span>
        {inCall && <span className="cb-orb-hold" aria-hidden="true" />}
      </button>
      <span className="cb-sr-only" role="status" aria-live="polite">
        {call === 'connecting' ? 'Calling Happi' : call === 'in-call' ? 'Connected to Happi' : listening ? 'Listening' : call === 'error' ? 'Call did not connect' : ''}
      </span>
    </div>
  );
}

/** The experience's bottom controls the bubble must never cover: Place, Move, the shutter, the joystick, tools. */
const AVOID = '.cbx-bottom button, .cbx-stick, .cbx-shutter, [data-cmd], .cbx-above button';

/**
 * Lifts the bubble above whatever bottom control sits under it (horizontally): CSS gives the floor (146 px above
 * the dock), this measures the experience's controls and raises it further when they reach higher (AR placing on a
 * small phone: Place + a stack of Move / Games tools). Re-checked while shown, since controls come and go.
 */
function useClearOfControls(ref: React.RefObject<HTMLDivElement | null>, key: unknown) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.bottom = '';
    const floor = parseFloat(getComputedStyle(el).bottom) || 0;
    let last = floor;
    const fit = () => {
      const dock = el.offsetParent as HTMLElement | null;
      if (!dock) return;
      const d = dock.getBoundingClientRect();
      const left = d.right - el.offsetWidth - 8; // right-aligned in the dock; offsetWidth ignores the pop-in scale
      const right = d.right + 8;
      let need = floor;
      for (const n of document.querySelectorAll<HTMLElement>(AVOID)) {
        const r = n.getBoundingClientRect();
        if (!r.width || !r.height || r.right <= left || r.left >= right) continue;
        const cs = getComputedStyle(n);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        need = Math.max(need, Math.ceil(d.bottom - r.top + 12));
      }
      if (need !== last) { last = need; el.style.bottom = need > floor ? `${need}px` : ''; }
    };
    fit();
    const t = window.setInterval(fit, 400);
    window.addEventListener('resize', fit);
    return () => { clearInterval(t); window.removeEventListener('resize', fit); };
  }, [ref, key]);
}

/** Voice mode's bubble above the talk button: live words, a hint, "Try saying" chips, or the camera chip. */
function VoiceBubbleView({ b, above, listening }: { b: VoiceBubble; above: number; listening: boolean }) {
  const c = useController();
  const ref = useRef<HTMLDivElement>(null);
  const interactive = b.kind === 'unknown' || b.kind === 'camera' || (b.kind === 'problem' && !!b.examples?.length);
  useClearOfControls(ref, `${b.id}-${b.kind}-${above}`);
  return (
    <div
      ref={ref}
      key={b.kind === 'caption' ? `cap-${b.id}` : b.id}
      className={`cb-vbubble is-${b.kind}${listening ? ' is-live' : ''}${b.examples?.length ? ' has-chips' : ''} above-${above}`}
      role={interactive ? 'group' : undefined}
      aria-label={interactive ? b.text : undefined}
      aria-hidden={interactive ? undefined : 'true'}
      data-testid="voice-bubble"
    >
      {b.kind === 'caption' && listening && !/^Getting ready/.test(b.text) && <span className="cb-vbubble-rec" aria-hidden="true" />}
      <span className="cb-vbubble-text">{b.text}</span>
      {b.kind === 'problem' && b.help && <span className="cb-vbubble-help">{b.help}</span>}
      {(b.kind === 'unknown' || b.kind === 'problem') && b.examples && (
        <span className="cb-vbubble-chips">
          {b.examples.map((ex) => (
            <button key={ex.say} type="button" className="cb-vchip" onClick={() => c.voiceUi.runExample(ex.say)}>{ex.label}</button>
          ))}
        </span>
      )}
      {b.kind === 'camera' && b.mode && (
        <button type="button" className="cb-vchip is-primary" onClick={() => c.voiceUi.openCamera(b.mode!)}>Tap to open the camera</button>
      )}
    </div>
  );
}

/** One line on why we need the microphone, before the browser asks. Inline in the call card when the panel is open. */
export function MicExplainer({ inline = false }: { inline?: boolean }) {
  const c = useController();
  const callText = useApp((s) => s.ui.text.call);
  const primary = useRef<HTMLButtonElement>(null);
  // the explainer unmounts on either choice: hand focus to the talk button (or the call card in the panel)
  const refocus = () => requestAnimationFrame(() =>
    document.querySelector<HTMLElement>('.cb-orb, .cb-callcard button')?.focus({ preventScroll: true }));
  useEffect(() => {
    primary.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); c.dismissMic(); refocus(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [c]);
  return (
    <div className={`cb-mic${inline ? ' is-inline' : ''}`} role="dialog" aria-labelledby="cb-mic-text">
      <p id="cb-mic-text"><Mic aria-hidden="true" size={18} /> Happi needs your microphone to hear you.</p>
      <div className="cb-mic-actions">
        <button type="button" className="cb-btn is-ghost" onClick={() => { c.dismissMic(); refocus(); }}>Not now</button>
        <button ref={primary} type="button" className="cb-btn is-primary" onClick={() => { c.confirmMic(); refocus(); }}>
          <Phone aria-hidden="true" size={18} /> {callText}
        </button>
      </div>
    </div>
  );
}
