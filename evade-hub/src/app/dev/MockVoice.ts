// Stand-ins for `src/voice` while it is being built (or when it fails to load).
//
// MockVoice: a simulated call with scripted Happi lines (streaming partials, then a final), triggers for the
// action words in each line, a fake remote stream and mute. URL flags: ?mockFast (short gaps between lines),
// ?mockMicDenied (the call fails like a blocked microphone), ?mockNoScript (Happi stays quiet; drive it from
// tests with window.__cbMock.voice.say(...)).
//
// UnavailableVoice: what production gets when the real voice module cannot load. Calling reports a friendly
// error; quick actions still reach the scene.
import type {
  CallStatus, ConfigClient, Speaker, TriggerEvent, VoiceEvents, VoiceSession,
} from '@/shared/contracts';
import { DEFAULT_CONFIG, type AppConfig } from '@/shared/config';
import { Emitter, params } from './emitter';

const SCRIPT: Array<{ text: string; triggers: string[] }> = [
  { text: "Hello, friend! I'm so happy you called. Here's a big wave for you!", triggers: ['Wave'] },
  { text: 'Do you like rainbows? I love every colour of the rainbow!', triggers: ['Rainbow'] },
  { text: 'Everything feels better with a little sparkle.', triggers: ['Sparkle'] },
  { text: 'Want to see some magic? Here it comes!', triggers: ['Magic'] },
  { text: "Let's have a party for all our friends!", triggers: ['Party'] },
  { text: 'Should we dance? I just love to dance!', triggers: ['Dance'] },
  { text: 'Come and see my house up in New York.', triggers: ['House'] },
  { text: 'I love running across the clouds.', triggers: ['Running'] },
  { text: "Brr, it's getting cold up here!", triggers: ['Cold'] },
  { text: "I'm getting a bit sleepy. Time for a little sleep.", triggers: ['Sleep'] },
  { text: 'Good morning! Time to wake up!', triggers: ['WakeUp'] },
];

let seq = 0;
const nextId = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function createMockVoice(opts: { getConfig(): AppConfig }): VoiceSession {
  const em = new Emitter<VoiceEvents>();
  const p = params();
  const gap = p.has('mockFast') ? 1400 : 4200;
  let status: CallStatus = 'idle';
  let muted = false;
  let line = 0;
  let paused = p.has('mockNoScript');
  const timers = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
  };
  const clearTimers = () => { timers.forEach((t) => clearTimeout(t)); timers.clear(); };
  const setStatus = (s: CallStatus, message?: string) => { status = s; em.emit('status', { status: s, message }); };
  const lastFire = new Map<string, number>();

  const trigger = (keyword: string, speaker: TriggerEvent['speaker'], via: TriggerEvent['via'], transcriptId?: string) => {
    const now = Date.now();
    const cd = opts.getConfig().triggerPolicy?.triggerCooldownMs ?? 0;
    const key = keyword.toLowerCase();
    if ((lastFire.get(key) ?? 0) + Math.min(cd, 1500) > now) return;
    lastFire.set(key, now);
    em.emit('trigger', { keyword, speaker, via, transcriptId, at: now });
  };

  /** Fake loudness while Happi "talks" (syllable-like bumps), as viseme frames. */
  const talk = (ms: number) => {
    const t0 = performance.now();
    const step = () => {
      const t = performance.now() - t0;
      if (status !== 'in-call' || t > ms) { em.emit('visemes', { weights: {}, amplitude: 0, speaking: false }); return; }
      const a = Math.max(0, Math.sin(t / 95) * 0.5 + Math.sin(t / 37) * 0.25 + 0.25);
      em.emit('visemes', { weights: { aa: a * 0.8 }, amplitude: a, speaking: true });
      later(step, 33);
    };
    step();
  };

  /** Stream a line: a few partials, then the final, then its triggers. */
  const say = (speaker: Speaker, text: string, triggers: string[] = []) => {
    const id = nextId(speaker);
    const words = text.split(' ');
    if (speaker === 'cheer_bear') later(() => talk(600 + words.length * 260), 200);
    const steps = Math.min(3, words.length);
    for (let i = 1; i <= steps; i++) {
      later(() => {
        if (status !== 'in-call') return;
        em.emit('transcript', {
          id, speaker, text: words.slice(0, Math.ceil((words.length * i) / (steps + 1))).join(' '), final: false, at: Date.now(),
        });
      }, i * 220);
    }
    later(() => {
      if (status !== 'in-call') return;
      em.emit('transcript', { id, speaker, text, final: true, at: Date.now() });
      triggers.forEach((t, i) => later(() => trigger(t, speaker, 'local', id), i * 300));
    }, (steps + 1) * 220);
  };

  const tick = () => {
    if (status !== 'in-call') return;
    if (!paused) {
      const l = SCRIPT[line % SCRIPT.length];
      line++;
      say('cheer_bear', l.text, l.triggers);
    }
    later(tick, gap);
  };

  const w = window as unknown as { __cbMock?: Record<string, unknown> };
  w.__cbMock = {
    ...(w.__cbMock ?? {}),
    voice: {
      say: (text: string, triggers: string[] = [], speaker: Speaker = 'cheer_bear') => say(speaker, text, triggers),
      trigger: (keyword: string, speaker: TriggerEvent['speaker'] = 'cheer_bear') => trigger(keyword, speaker, 'local'),
      pause: (v = true) => { paused = v; },
      fail: (message = 'Something went wrong') => { clearTimers(); setStatus('error', message); },
      get status() { return status; },
    },
  };

  return {
    get status() { return status; },
    get muted() { return muted; },
    async startCall() {
      if (status === 'connecting' || status === 'ringing' || status === 'in-call') return;
      clearTimers();
      setStatus('connecting');
      em.emit('transcription', { speaker: 'cheer_bear', state: 'connecting' });
      await new Promise((r) => later(() => r(null), 700));
      if (p.has('mockMicDenied')) {
        setStatus('error', 'Permission denied: microphone');
        em.emit('transcription', { speaker: 'cheer_bear', state: 'off' });
        throw new Error('Permission denied: microphone');
      }
      setStatus('ringing');
      await new Promise((r) => later(() => r(null), 700));
      setStatus('in-call');
      // no fake audio track (lip sync would try to analyse it): the mock drives the mouth and the UI with visemes
      em.emit('remoteStream', null);
      em.emit('transcription', { speaker: 'cheer_bear', state: 'live' });
      em.emit('transcription', { speaker: 'user', state: opts.getConfig().allowUserAudioToOpenAI ? 'live' : 'off' });
      line = 0;
      later(tick, 600);
    },
    async endCall() {
      if (status === 'idle') return;
      clearTimers();
      setStatus('ending');
      await new Promise((r) => later(() => r(null), 250));
      em.emit('remoteStream', null);
      em.emit('transcription', { speaker: 'cheer_bear', state: 'off' });
      em.emit('transcription', { speaker: 'user', state: 'off' });
      if (muted) { muted = false; em.emit('muted', false); }
      setStatus('idle');
    },
    setMuted(m) {
      muted = m;
      em.emit('muted', m);
    },
    async sendText(text) {
      const cfg = opts.getConfig();
      const found = (cfg.localClassifier?.keywords ?? []).filter((k) =>
        new RegExp(`\\b${k.replace(/[^a-z0-9]/gi, '')}\\b`, 'i').test(text.replace(/wake up/gi, 'wakeup')));
      const triggers = cfg.allowUserTriggers ? found : [];
      triggers.forEach((t, i) => later(() => trigger(t, 'typed', 'local'), i * 300));
      const smsSent = status === 'in-call' && !!cfg.smsPolicy?.sendTypedChatToSms;
      if (smsSent) later(() => say('cheer_bear', 'Ooh, I got your message! That makes me smile.'), 1500);
      return { triggers, smsSent };
    },
    fireTrigger(keyword, speaker = 'quick-action') {
      trigger(keyword, speaker, 'manual');
    },
    on: (event, cb) => em.on(event, cb),
    dispose() { clearTimers(); em.clear(); },
  };
}

export function createUnavailableVoice(reason: string): VoiceSession {
  const em = new Emitter<VoiceEvents>();
  let status: CallStatus = 'idle';
  return {
    get status() { return status; },
    muted: false,
    async startCall() {
      status = 'error';
      em.emit('status', { status, message: `unavailable: ${reason}` });
    },
    async endCall() { status = 'idle'; em.emit('status', { status }); },
    setMuted() { /* no call */ },
    async sendText() { return { triggers: [], smsSent: false }; },
    fireTrigger(keyword, speaker = 'quick-action') {
      em.emit('trigger', { keyword, speaker, via: 'manual', at: Date.now() });
    },
    on: (event, cb) => em.on(event, cb),
    dispose() { em.clear(); },
  };
}

export function createLocalConfigClient(config: AppConfig = DEFAULT_CONFIG): ConfigClient {
  return {
    current: config,
    load: async () => config,
    subscribe(cb) { cb(config); return () => {}; },
  };
}
