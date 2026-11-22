// Talk tab: call controls, then what the chosen UI mode shows.
//   Calm ("Just talk"): audio only, no text.
//   Chat: typed messages (and call transcripts when the admin's visibility policy allows them in chat).
//   Call debug ("Staff view"): live transcripts with partials, transcription state, trigger details.
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Heart, Lightbulb, Mic, MicOff, Phone, PhoneOff, Send, Sparkles } from 'lucide-react';
import type { UiMode } from '@/shared/config';
import { useApp, useController } from '../context';
import type { ChatMessage } from '../state/appState';
import { settingOn, transcriptsVisible } from '../state/uiConfig';
import { actionLook } from '../actions';
import { formatClock } from './callText';
import { MicExplainer } from './TalkOrb';
import { VoiceCard } from './VoiceCard';

const MODE_LABELS: Record<UiMode, string> = { calm: 'Just talk', chat: 'Chat', call_debug: 'Staff' };

export function TalkPanel() {
  const uiMode = useApp((s) => s.uiMode);
  const canPickMode = useApp((s) => settingOn(s.ui, 'experience_mode'));
  // voice mode (no call live): hold to talk first, the call as a smaller second choice (voice-3)
  const voiceCard = useApp((s) => s.ui.voiceMode.enabled && (s.call === 'idle' || s.call === 'error') && !s.micAsk);
  return (
    <div className={`cb-talk mode-${uiMode}`}>
      {voiceCard ? <VoiceCard /> : <CallCard />}
      {canPickMode && <ModeSwitch />}
      {uiMode === 'calm' ? <CalmTips /> : <><MessageList /><Composer /></>}
    </div>
  );
}

function CallTimer({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="cb-timer">{formatClock(now - since)}</span>;
}

function CallCard() {
  const c = useController();
  const call = useApp((s) => s.call);
  const startedAt = useApp((s) => s.callStartedAt);
  const muted = useApp((s) => s.muted);
  const speaking = useApp((s) => s.speaking);
  const text = useApp((s) => s.ui.text);
  const canCall = useApp((s) => s.ui.show.call);
  const message = useApp((s) => s.callMessage);
  const micAsk = useApp((s) => s.micAsk);
  if (!canCall) return null;
  const inCall = call === 'in-call';
  const busy = call === 'connecting' || call === 'ringing' || call === 'ending';
  const line = inCall ? (speaking ? 'Happi is talking' : muted ? 'You are muted' : 'Listening…')
    : busy ? (call === 'ringing' ? 'Ringing…' : call === 'ending' ? 'Hanging up…' : 'Calling…')
      : call === 'error' ? 'That call did not connect.' : 'Call Happi and say hello!';
  return (
    <div className={`cb-callcard${inCall ? ' is-live' : ''}${speaking && inCall ? ' is-speaking' : ''}`}>
      <div className="cb-callcard-who">
        <span className="cb-avatar" aria-hidden="true"><Heart size={22} strokeWidth={2.4} /></span>
        <div>
          <p className="cb-callcard-name">Happi {inCall && startedAt && <CallTimer since={startedAt} />}</p>
          <p className="cb-callcard-line">{line}</p>
          {call === 'error' && message && <p className="cb-callcard-detail">{friendlyDetail(message)}</p>}
        </div>
      </div>
      {inCall ? (
        <div className="cb-callcard-actions">
          <button
            type="button"
            className={`cb-round ${muted ? 'is-warn' : 'is-soft'}`}
            aria-pressed={muted}
            aria-label={muted ? 'Unmute your microphone' : 'Mute your microphone'}
            onClick={() => c.toggleMute()}
          >
            {muted ? <MicOff aria-hidden="true" size={22} /> : <Mic aria-hidden="true" size={22} />}
          </button>
          <button type="button" className="cb-round is-danger" aria-label={text.hangUp} onClick={() => c.hangUp()}>
            <PhoneOff aria-hidden="true" size={22} />
          </button>
        </div>
      ) : busy ? (
        <button type="button" className="cb-btn is-soft" onClick={() => c.hangUp()} disabled={call === 'ending'}>
          <PhoneOff aria-hidden="true" size={20} /> Cancel
        </button>
      ) : micAsk ? (
        <MicExplainer inline />
      ) : (
        <button type="button" className="cb-btn is-primary is-wide is-big" onClick={() => c.requestCall()}>
          <Phone aria-hidden="true" size={22} /> {call === 'error' ? 'Try again' : text.call}
        </button>
      )}
    </div>
  );
}

function friendlyDetail(message: string): string | null {
  return /permission|denied|microphone/i.test(message)
    ? 'Tip: tap the lock or settings icon next to the web address and allow the microphone.'
    : null;
}

function ModeSwitch() {
  const c = useController();
  const uiMode = useApp((s) => s.uiMode);
  const options: UiMode[] = uiMode === 'call_debug' ? ['calm', 'chat', 'call_debug'] : ['calm', 'chat'];
  return (
    <div
      className="cb-seg"
      role="radiogroup"
      aria-label="How do you want to talk?"
      style={{ '--n': options.length, '--i': Math.max(0, options.indexOf(uiMode)) } as React.CSSProperties}
    >
      <span className="cb-seg-pill" aria-hidden="true" />
      {options.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={uiMode === m}
          className="cb-seg-opt"
          onClick={() => c.setUiMode(m)}
        >{MODE_LABELS[m]}</button>
      ))}
    </div>
  );
}

function CalmTips() {
  const c = useController();
  const hasGame = useApp((s) => !!s.game.modeId);
  const inCall = useApp((s) => s.call === 'in-call');
  const voice = useApp((s) => s.ui.voiceMode.enabled && !inCall);
  const tap = useApp((s) => s.prefs.tapToTalk ?? !s.ui.voiceMode.holdToTalk);
  return (
    <div className="cb-calm">
      <p className="cb-calm-big">{inCall ? 'Talk out loud. Happi can hear you!' : voice ? (tap ? 'Tap the mic and say a magic word.' : 'Hold the mic, say a magic word, let go.') : 'Just talk, like a phone call.'}</p>
      <p>{voice ? 'Something magic happens in the scene!' : 'When Happi says a magic word, something happens in the scene.'}</p>
      {hasGame && (
        <button type="button" className="cb-btn is-soft" onClick={() => c.openOverlay('hint')}>
          <Lightbulb aria-hidden="true" size={20} /> Need ideas? Get a hint
        </button>
      )}
    </div>
  );
}

function isVisible(m: ChatMessage, mode: UiMode, callVisible: boolean): boolean {
  if (m.source === 'typed' || m.kind === 'system') return true;
  if (m.kind === 'action') return mode === 'call_debug' || !!m.trigger?.played;
  // call transcripts
  if (!callVisible) return false;
  return m.final || mode === 'call_debug';
}

const REPLY_WAIT_MS = 12000;

/**
 * Happi is "typing": her words are streaming in (a partial transcript), or you just said or wrote something
 * during a call and she has not answered yet (up to 12 s).
 */
function useThinking(visible: ChatMessage[], all: ChatMessage[], staff: boolean, callVisible: boolean): boolean {
  const inCall = useApp((s) => s.call === 'in-call');
  const [, setTick] = useState(0);
  const lastTalk = [...visible].reverse().find((m) => m.kind === 'user' || m.kind === 'bear');
  // (only when her answer will show up in the chat: typed messages get chat replies; spoken ones need transcripts)
  const answerShows = lastTalk?.kind === 'user' && (lastTalk.source === 'typed' || callVisible);
  const waitingFor = inCall && answerShows ? REPLY_WAIT_MS - (Date.now() - lastTalk!.at) : 0;
  useEffect(() => {
    if (waitingFor <= 0) return;
    const t = window.setTimeout(() => setTick((n) => n + 1), waitingFor + 50);
    return () => clearTimeout(t);
  }, [waitingFor]);
  if (!inCall) return false;
  const streaming = callVisible && !staff && all.some((m) => m.kind === 'bear' && !m.final && m.source === 'call');
  return streaming || waitingFor > 0;
}

function MessageList() {
  const uiMode = useApp((s) => s.uiMode);
  const callVisible = useApp((s) => transcriptsVisible(s.ui.transcriptVisibility, s.uiMode, s.staffTranscripts));
  const messages = useApp((s) => s.messages);
  const transcription = useApp((s) => s.transcription);
  const listRef = useRef<HTMLOListElement>(null);
  const stick = useRef(true);
  const mountedAt = useRef(Date.now());
  const visible = messages.filter((m) => isVisible(m, uiMode, callVisible));
  const staff = uiMode === 'call_debug';
  const thinking = useThinking(visible, messages, staff, callVisible);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [visible.length, visible[visible.length - 1]?.text, thinking]);

  return (
    <>
      {staff && (
        <p className="cb-staffbar">
          <span className={`cb-dot is-${transcription.cheer_bear.state}`} /> Happi: {transcription.cheer_bear.state}
          <span className={`cb-dot is-${transcription.user.state}`} /> You: {transcription.user.state}
          {!callVisible && <em> · transcripts hidden by policy</em>}
        </p>
      )}
      <ol
        ref={listRef}
        className="cb-msgs"
        role="log"
        aria-label="Messages"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {visible.length === 0 && (
          <li className="cb-msgs-empty">
            {staff ? 'Live transcripts and actions will show here during a call.'
              : 'Write a message and Happi will read it during your call.'}
          </li>
        )}
        {visible.map((m, i) => {
          // messenger grouping: consecutive lines from the same side join up; her avatar sits on the last one
          const side = (x?: ChatMessage) => (x && (x.kind === 'user' || x.kind === 'bear') ? x.kind : null);
          const k = side(m);
          const first = !k || side(visible[i - 1]) !== k;
          const last = !k || (side(visible[i + 1]) !== k && !(k === 'bear' && thinking && i === visible.length - 1));
          return <Message key={m.id} m={m} staff={staff} first={first} last={last} fresh={m.at > mountedAt.current} />;
        })}
        {thinking && (
          <li className="cb-msg is-bear is-typing is-last" aria-hidden="true">
            <span className="cb-msg-avatar"><Heart size={14} strokeWidth={2.6} /></span>
            <span className="cb-typing"><i /><i /><i /></span>
          </li>
        )}
      </ol>
    </>
  );
}

function Message({ m, staff, first, last, fresh }: { m: ChatMessage; staff: boolean; first: boolean; last: boolean; fresh: boolean }) {
  const anim = fresh ? ' is-new' : '';
  if (m.kind === 'action') {
    const look = actionLook(m.text);
    const t = m.trigger;
    return (
      <li className={`cb-msg is-action${t && !t.played ? ' is-muted' : ''}${t?.counted ? ' is-found' : ''}${anim}`}>
        <span className="cb-msg-action-icon" style={{ background: look.color }} aria-hidden="true"><look.icon size={14} /></span>
        <span>{look.label}{t?.counted ? ' · found!' : ''}</span>
        {staff && t && <small>{t.speaker} · {t.via} · {t.played ? 'played' : m.note ?? 'not played'}</small>}
      </li>
    );
  }
  if (m.kind === 'system') {
    return <li className={`cb-msg is-system${anim}`}>{m.text}{staff && m.note ? <small> ({m.note})</small> : null}</li>;
  }
  const who = m.kind === 'bear' ? 'Happi' : 'You';
  return (
    <li className={`cb-msg is-${m.kind}${m.final ? '' : ' is-partial'}${first ? ' is-first' : ''}${last ? ' is-last' : ''}${anim}`}>
      {m.kind === 'bear' && last && <span className="cb-msg-avatar" aria-hidden="true"><Heart size={14} strokeWidth={2.6} /></span>}
      <span className="cb-sr-only">{who}: </span>
      <span className="cb-msg-text">{m.text}{m.final ? '' : '…'}</span>
      {(m.note || (staff && m.source === 'call')) && (
        <small>{staff && m.source === 'call' ? `${m.final ? 'final' : 'partial'} transcript` : m.note}</small>
      )}
    </li>
  );
}

function Composer() {
  const c = useController();
  const commandMode = useApp((s) => s.commandMode);
  const text = useApp((s) => s.ui.text);
  const [value, setValue] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    setValue('');
    void c.sendText(v);
  };
  return (
    <form className="cb-composer" onSubmit={submit}>
      <label htmlFor="cb-input" className="cb-sr-only">{commandMode ? 'Action word' : 'Message to Happi'}</label>
      {commandMode && <Sparkles className="cb-composer-cmd" aria-hidden="true" size={18} />}
      <input
        id="cb-input"
        onFocus={() => { if (!c.store.get().isDesktop) c.setSnap('full'); }}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={commandMode ? text.commandPlaceholder : text.chatPlaceholder}
        autoComplete="off"
        enterKeyHint="send"
        maxLength={1000}
      />
      <button type="submit" className="cb-send" aria-label={commandMode ? 'Play action' : 'Send'} disabled={!value.trim()}>
        <Send aria-hidden="true" size={20} />
      </button>
    </form>
  );
}
