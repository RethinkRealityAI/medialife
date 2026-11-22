// The wiring between voice, experience, config and the app's state. Event handlers live here (not in components)
// so they always see current state and React re-renders never re-subscribe anything.
//
//   voice 'trigger'      -> game rules -> experience.trigger(keyword)
//   voice 'remoteStream' -> experience.setSpeechStream(stream)
//   voice 'transcript'   -> chat list; Happi's finals -> experience.setSpeechText() when visibility allows
//   voice 'status'       -> talk button state, toasts
//   experience 'started' -> app UI appears, welcome modal, game timer starts
//   experience 'userGesture' -> unlock audio
import type {
  ConfigClient, ExperienceApi, TranscriptEvent, TriggerEvent, VoiceSession,
} from '@/shared/contracts';
import type { AppConfig, UiMode } from '@/shared/config';
import { DEFAULT_CONFIG } from '@/shared/config';
import type { AppState, AppStore, ChatMessage, Overlay, SheetSnap, TabId, Toast } from './state/appState';
import { applyFound, decideTrigger, gameWords, newGame, resolveGameMode } from './state/game';
import { NO_GAME, savePrefs, type Prefs } from './state/prefs';
import { normaliseConfig, settingOn, transcriptsVisible } from './state/uiConfig';
import { loadExperience, loadVoice, preloadAudioUnlock, unlockAudio } from './loaders';
import { actionLabel } from './actions';
import { VoiceLevel } from './state/voiceLevel';
import { VoiceModeUi } from './voiceMode';

const MAX_MESSAGES = 200;
let msgSeq = 0;
const mid = () => `m${Date.now().toString(36)}${(msgSeq++).toString(36)}`;

/** Kid-friendly copy for a failed call. `code` is the voice module's machine-readable reason when it sends one. */
export function friendlyCallError(message: string | null | undefined, code?: string): string {
  if (code === 'mic_denied') return 'Your microphone is blocked. Allow it for this page, then try again.';
  if (code === 'not_configured') return "Calling isn't working right now. You can still play!";
  if (code === 'token_failed') return "We couldn't reach Happi. Check your internet and try again.";
  if (code === 'call_failed') return "The call didn't connect. Tap to try again.";
  const m = (message ?? '').toLowerCase();
  if (/permission|denied|notallowed|not allowed|microphone/.test(m)) {
    return 'Your microphone is blocked. Allow it for this page, then try again.';
  }
  if (/unavailable|missing|not configured/.test(m)) return "Calling isn't working right now. You can still play!";
  if (/busy|no answer|declined|rejected/.test(m)) return "Happi didn't pick up. Try again in a moment.";
  if (/offline|network/.test(m)) return 'No internet connection. Check it and try again.';
  return "We couldn't reach Happi. Tap to try again.";
}

export class AppController {
  experience: ExperienceApi | null = null;
  voice: VoiceSession | null = null;
  /** Happi's voice level for the talk button (subscribe; no React state). */
  readonly level = new VoiceLevel();
  /** Voice mode (hold the talk button and say what should happen; no call). src/app/voiceMode.ts */
  readonly voiceUi: VoiceModeUi;
  private configClient: ConfigClient | null = null;
  private config: AppConfig = DEFAULT_CONFIG;
  private configLoaded = false;
  private readyDone = false;
  private welcomeShownThisSession = false;
  private offs: Array<() => void> = [];
  private timers = new Map<string, number>();
  private bootToken = 0;

  constructor(readonly store: AppStore) {
    const app = this; // eslint-disable-line @typescript-eslint/no-this-alias
    this.voiceUi = new VoiceModeUi({
      store: this.store,
      get experience() { return app.experience; },
      get voice() { return app.voice; },
      showToast: (kind, text, ms) => this.showToast(kind, text, ms),
      openSheet: (tab) => this.openSheet(tab),
      updatePrefs: (patch) => this.updatePrefs(patch),
      logSaid: (text) => { this.addMessage({ kind: 'user', text, final: true, source: 'typed', note: 'Said out loud' }); },
    });
  }

  // ------------------------------------------------------------------ helpers
  private get s(): AppState { return this.store.get(); }
  private set(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) { this.store.set(patch); }

  private timer(key: string, ms: number, fn: () => void) {
    const prev = this.timers.get(key);
    if (prev) clearTimeout(prev);
    this.timers.set(key, window.setTimeout(() => { this.timers.delete(key); fn(); }, ms));
  }

  private cancel(key: string) {
    const t = this.timers.get(key);
    if (t) { clearTimeout(t); this.timers.delete(key); }
  }

  private updatePrefs(patch: Partial<Prefs>) {
    const prefs = { ...this.s.prefs, ...patch };
    savePrefs(prefs);
    this.set({ prefs });
  }

  private addMessage(m: Omit<ChatMessage, 'id' | 'at'> & { id?: string }) {
    const msg: ChatMessage = { id: m.id ?? mid(), at: Date.now(), ...m };
    this.set((s) => ({ messages: [...s.messages, msg].slice(-MAX_MESSAGES) }));
    return msg.id;
  }

  private patchMessage(id: string, patch: Partial<ChatMessage>) {
    this.set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
  }

  showToast(kind: Toast['kind'], text: string, ms = 2800) {
    this.set({ toast: { id: Date.now(), kind, text } });
    this.timer('toast', ms, () => this.set({ toast: null }));
  }

  /** Config the voice module sees: the live config with the user's local overrides on top. */
  private getVoiceConfig = (): AppConfig => {
    const base = this.configClient?.current ?? this.config;
    return { ...base, allowUserTriggers: this.s.allowUserTriggers };
  };

  // ------------------------------------------------------------------ boot
  async boot(container: HTMLElement) {
    // StrictMode mounts, disposes and mounts again: only the latest boot may finish
    const token = ++this.bootToken;
    this.readyDone = false;
    this.watchViewport();
    this.checkMicPermission();

    const [{ experience, source: expSource }, { voice, configClient, source: voiceSource }] = await Promise.all([
      loadExperience({ title: this.s.ui.name }),
      loadVoice(this.getVoiceConfig),
    ]);
    if (token !== this.bootToken) { experience.dispose(); voice.dispose(); return; }
    this.experience = experience;
    this.voice = voice;
    this.configClient = configClient;
    this.set({ sources: { experience: expSource, voice: voiceSource } });
    void preloadAudioUnlock();

    this.wireConfig(configClient);
    this.wireExperience(experience);
    this.wireVoice(voice);
    this.voiceUi.attach(voice, experience);

    experience.setReservedCorner(0);
    try {
      await experience.mount(container);
    } catch (err) {
      console.error('[app] experience.mount failed', err);
      this.showToast('error', 'The 3D view had trouble starting. Try reloading the page.', 8000);
      this.set({ started: true });
      this.maybeReady();
    }
    if (experience.started && !this.s.started) { this.set({ started: true }); this.maybeReady(); }
  }

  private wireConfig(client: ConfigClient) {
    this.applyConfig(client.current);
    // the small phone button shows only where a call can connect (Twilio set up, or the demo call)
    const calls = () => {
      const services = (client as ConfigClient & { services?: { calls?: boolean } }).services;
      const demo = typeof location !== 'undefined' && new URLSearchParams(location.search).has('mockVoice');
      this.set({ callsAvailable: !!services?.calls || demo || this.s.sources.voice === 'mock' });
    };
    calls();
    this.offs.push(client.subscribe(calls));
    this.offs.push(client.subscribe((c) => { this.configLoaded = true; this.applyConfig(c); this.maybeReady(); }));
    client.load()
      .then((c) => { this.configLoaded = true; this.applyConfig(c); this.maybeReady(); })
      .catch((err) => { console.warn('[app] config load failed, using defaults', err); this.configLoaded = true; this.maybeReady(); });
    // never wait for config forever
    this.timer('configWait', 4000, () => { this.configLoaded = true; this.maybeReady(); });
  }

  /** The config currently applied (tests and staff tools). */
  currentConfig(): AppConfig { return this.config; }

  applyConfig(c: AppConfig) {
    if (!c) return;
    this.config = c;
    if (c.lipSync) this.experience?.setLipSync?.({ intensity: c.lipSync.intensity, attackMs: c.lipSync.attackMs, releaseMs: c.lipSync.releaseMs });
    const s = this.s;
    const prev = s.ui;
    const ui = normaliseConfig(c);
    const patch: Partial<AppState> = { ui };
    if (!settingOn(ui, 'experience_mode') || !s.prefs.uiMode) patch.uiMode = ui.modeDefault;
    if (ui.commandModeDefault !== prev.commandModeDefault || !settingOn(ui, 'input_mode')) patch.commandMode = ui.commandModeDefault;
    if (ui.allowUserTriggers !== prev.allowUserTriggers || !settingOn(ui, 'user_triggers')) patch.allowUserTriggers = ui.allowUserTriggers;
    const modeId = resolveGameMode(ui.gameModes, s.prefs.lastGameMode, ui.activeGameMode, NO_GAME);
    if (modeId !== s.game.modeId) patch.game = newGame(modeId);
    this.set(patch);
  }

  private wireExperience(exp: ExperienceApi) {
    this.offs.push(
      exp.on('started', ({ mode }) => {
        this.set({ started: true, expMode: mode });
        this.maybeReady();
      }),
      exp.on('mode', ({ mode, busy }) => this.set({ expMode: mode, expBusy: busy })),
      exp.on('userGesture', () => unlockAudio()),
      exp.on('unavailable', (e) => console.info('[app] experience mode unavailable', e)),
    );
  }

  /** Runs once, when the splash is gone and config is known. */
  private maybeReady() {
    if (this.readyDone || !this.s.started || !this.configLoaded) return;
    this.readyDone = true;
    const s = this.s;
    const open = s.prefs.sheetOpen ?? (s.isDesktop ? s.ui.defaultSheetOpen.desktop : s.ui.defaultSheetOpen.mobile);
    void open;
    // Happi has no voice games or talk (Dapo, 2026-11-19): no game chip, no voice welcome card
    this.set({ sheetOpen: false, game: newGame(null) });
    const wm = s.ui.welcome;
    const seen = wm.showOnce && s.prefs.welcomeSeenVersion >= wm.version;
    if (false && wm.enabled && !seen && !this.welcomeShownThisSession) {
      this.timer('welcome', wm.delayMs, () => {
        if (!this.s.overlay) { this.welcomeShownThisSession = true; this.set({ overlay: 'welcome' }); }
      });
    }
  }

  private wireVoice(voice: VoiceSession) {
    this.offs.push(
      voice.on('status', (e) => {
        // the real voice module adds `code` and `mock` to the contract's payload
        const extra = e as typeof e & { code?: string; mock?: boolean };
        this.set({ callDemo: !!extra.mock });
        this.onStatus(e.status, e.message, extra.code);
      }),
      voice.on('muted', (muted) => this.set({ muted })),
      voice.on('remoteStream', (stream) => {
        this.experience?.setSpeechStream(stream);
        this.level.setStream(stream);
        if (!stream) this.set({ speaking: false });
      }),
      voice.on('visemes', (frame) => {
        this.experience?.setVisemes?.(frame);
        this.level.setAmplitude(frame?.amplitude ?? 0);
        if (this.s.speaking !== !!frame?.speaking) this.set({ speaking: !!frame?.speaking });
      }),
      voice.on('transcript', (t) => this.onTranscript(t)),
      voice.on('trigger', (t) => this.onTrigger(t)),
      voice.on('transcription', ({ speaker, state, message }) =>
        this.set((s) => ({ transcription: { ...s.transcription, [speaker]: { state, message } } }))),
    );
  }

  // ------------------------------------------------------------------ voice events
  private onStatus(status: AppState['call'], message?: string, code?: string) {
    const prev = this.s.call;
    this.set({ call: status, callMessage: message ?? null });
    if (status === 'in-call' && prev !== 'in-call') {
      this.set({ callStartedAt: Date.now() });
      this.addMessage({ kind: 'system', text: 'You are on a call with Happi.', final: true, source: 'system' });
      this.showToast('info', 'Connected! Say hi to Happi.', 2400);
      this.experience?.trigger('WakeUp');
    }
    // demo call: e.g. "This browser can't listen here, so type to Happi instead."
    if (status === 'in-call' && prev === 'in-call' && code === 'demo' && message) this.showToast('info', message, 5000);
    if (status !== 'in-call' && status !== 'ending') this.set({ callStartedAt: null });
    if (status === 'idle' && (prev === 'in-call' || prev === 'ending')) {
      this.addMessage({ kind: 'system', text: 'Call ended.', final: true, source: 'system' });
      this.showToast('info', 'Call ended. Talk again soon!', 2200);
      this.endSpeech();
      this.experience?.trigger('Sleep');
    }
    if (status === 'error') {
      const text = friendlyCallError(message, code);
      this.addMessage({ kind: 'system', text, final: true, source: 'system', note: message });
      this.showToast('error', text, 5000);
      this.endSpeech();
    }
  }

  private endSpeech() {
    this.cancel('caption');
    this.cancel('speaking');
    this.experience?.setSpeechText(null);
    this.set({ speaking: false, captionOn: false });
  }

  private onTranscript(t: TranscriptEvent) {
    const kind = t.speaker === 'cheer_bear' ? 'bear' : 'user';
    const exists = this.s.messages.some((m) => m.id === t.id);
    if (exists) this.patchMessage(t.id, { text: t.text, final: t.final });
    // `chat`: the demo Happi answering a typed message: shown like a chat reply (not a call transcript)
    else this.addMessage({ id: t.id, kind, text: t.text, final: t.final, source: t.chat ? 'typed' : 'call' });

    if (t.speaker !== 'cheer_bear') return;
    this.set({ speaking: true });
    this.timer('speaking', t.final ? 900 : 1600, () => this.set({ speaking: false }));
    const s = this.s;
    if (t.final && (t.chat || transcriptsVisible(s.ui.transcriptVisibility, s.uiMode, s.staffTranscripts))) {
      this.experience?.setSpeechText(t.text);
      this.set({ captionOn: true });
      this.timer('caption', Math.min(9000, 2500 + t.text.length * 50), () => { this.experience?.setSpeechText(null); this.set({ captionOn: false }); });
    }
  }

  private onTrigger(t: TriggerEvent) {
    const s = this.s;
    const mode = s.ui.gameModes.find((g) => g.id === s.game.modeId && g.enabled) ?? null;
    const words = gameWords(mode, s.ui.keywords);
    const d = decideTrigger(s.game, mode, words, t.keyword, t.speaker);
    let played = false;
    if (d.fire) played = this.experience?.trigger(t.keyword) ?? false;
    this.addMessage({
      kind: 'action', text: actionLabel(t.keyword), final: true, source: 'system',
      trigger: { speaker: t.speaker, via: t.via, played, counted: !!d.found },
      note: d.fire ? (played ? undefined : 'scene busy or unknown') : `skipped: ${d.reason}`,
    });
    if (d.found) {
      this.set({ game: applyFound(s.game, d.found, d.completes) });
      this.showToast('found', `You found “${actionLabel(d.found)}”!`, 2600);
      if (d.completes) this.timer('complete', 1600, () => this.openOverlay('completion'));
    } else if (!played && t.speaker === 'quick-action' && d.fire) {
      this.showToast('info', 'One moment… Happi is still busy!', 1800);
    }
  }

  // ------------------------------------------------------------------ call
  private async checkMicPermission() {
    try {
      const st = await navigator.permissions?.query({ name: 'microphone' as PermissionName });
      if (!st) return;
      const apply = () => this.set({ micGranted: st.state === 'granted' });
      apply();
      st.addEventListener?.('change', apply);
    } catch { /* not supported (Safari < 16, Firefox): we just explain first */ }
  }

  /** The talk button. */
  tapOrb() {
    const { call, ui } = this.s;
    if (!ui.show.call || call === 'connecting' || call === 'ringing' || call === 'in-call' || call === 'ending') {
      this.openSheet('talk');
      return;
    }
    this.requestCall();
  }

  /** Start a call, explaining the microphone first if we have never asked. Must run inside a tap. */
  requestCall() {
    const s = this.s;
    if (!s.prefs.micExplained && !s.micGranted) {
      this.set({ micAsk: true });
      return;
    }
    this.startCall();
  }

  confirmMic() {
    this.set({ micAsk: false });
    this.updatePrefs({ micExplained: true });
    this.startCall();
  }

  dismissMic() { this.set({ micAsk: false }); }

  startCall() {
    const v = this.voice;
    if (!v) return;
    this.voiceUi.cancel();
    unlockAudio();
    if (!this.s.prefs.orbNudgeDone) this.updatePrefs({ orbNudgeDone: true });
    this.set({ call: 'connecting', callMessage: null });
    v.startCall().catch((err: unknown) => {
      console.warn('[app] startCall failed', err);
      if (this.s.call !== 'error') this.onStatus('error', err instanceof Error ? err.message : String(err));
    });
  }

  hangUp() {
    this.voice?.endCall().catch((err) => console.warn('[app] endCall failed', err));
  }

  toggleMute() {
    const v = this.voice;
    if (!v) return;
    v.setMuted(!this.s.muted);
  }

  // ------------------------------------------------------------------ chat + actions
  async sendText(raw: string) {
    const text = raw.trim().slice(0, 1000);
    if (!text || !this.voice) return;
    if (this.s.commandMode) {
      this.addMessage({ kind: 'user', text, final: true, source: 'typed', note: 'Action' });
      this.voice.fireTrigger(text, 'typed');
      return;
    }
    const id = this.addMessage({ kind: 'user', text, final: true, source: 'typed', note: 'Sending…' });
    try {
      const res = await this.voice.sendText(text) as { smsSent: boolean; replied?: boolean };
      const inCall = this.s.call === 'in-call';
      // `replied`: the demo Happi answers out loud (voice module extra)
      this.patchMessage(id, { note: res.smsSent ? 'Sent' : inCall || res.replied ? undefined : 'Call Happi to send this' });
    } catch (err) {
      console.warn('[app] sendText failed', err);
      this.patchMessage(id, { note: 'Not sent. Try again.' });
    }
  }

  quickAction(keyword: string) {
    this.voice?.fireTrigger(keyword, 'quick-action');
  }

  setUiMode(uiMode: UiMode) {
    // typing needs room: on phones, chat and the staff view open the panel to full height
    this.set((s) => ({ uiMode, sheetSnap: !s.isDesktop && uiMode !== 'calm' ? 'full' : s.sheetSnap }));
    this.updatePrefs({ uiMode });
  }

  setStaffTranscripts(v: boolean) { this.set({ staffTranscripts: v }); }
  setCommandMode(v: boolean) { this.set({ commandMode: v }); }
  setAllowUserTriggers(v: boolean) { this.set({ allowUserTriggers: v }); }

  // ------------------------------------------------------------------ sheet + overlays
  openSheet(tab?: TabId) {
    this.set((s) => ({ sheetOpen: true, tab: tab ?? s.tab }));
    this.updatePrefs({ sheetOpen: true });
  }

  closeSheet() {
    this.set({ sheetOpen: false, sheetSnap: 'half' });
    this.updatePrefs({ sheetOpen: false });
  }

  toggleSheet(tab?: TabId) {
    const s = this.s;
    if (s.sheetOpen && (!tab || s.tab === tab)) this.closeSheet();
    else this.openSheet(tab);
  }

  setSnap(sheetSnap: SheetSnap) { this.set({ sheetSnap }); }
  setTab(tab: TabId) { this.set({ tab }); }

  openOverlay(overlay: Exclude<Overlay, null>) { this.set({ overlay, micAsk: false }); }

  closeOverlay() {
    const o = this.s.overlay;
    this.set({ overlay: null });
    if (o === 'welcome') {
      const wm = this.s.ui.welcome;
      if (wm.showOnce) this.updatePrefs({ welcomeSeenVersion: wm.version });
    }
    if (o === 'completion') this.resetGame();
  }

  showWelcomeAgain() {
    this.welcomeShownThisSession = true;
    this.set({ overlay: 'welcome' });
  }

  // ------------------------------------------------------------------ games
  selectGame(id: string | null) {
    this.updatePrefs({ lastGameMode: id ?? NO_GAME });
    this.set({ game: newGame(id) });
  }

  resetGame() { this.set((s) => ({ game: newGame(s.game.modeId) })); }

  playAgain() {
    this.set({ overlay: null });
    this.resetGame();
  }

  // ------------------------------------------------------------------ viewport
  private watchViewport() {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(min-width: 901px)');
    const on = () => this.set({ isDesktop: mq.matches });
    mq.addEventListener('change', on);
    this.offs.push(() => mq.removeEventListener('change', on));
  }

  dispose() {
    this.bootToken++;
    this.offs.forEach((off) => { try { off(); } catch { /* ignore */ } });
    this.offs = [];
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
    this.voice?.endCall().catch(() => {});
    this.voice?.dispose();
    this.voiceUi.dispose();
    this.experience?.dispose();
    this.level.setStream(null);
    this.voice = null;
    this.experience = null;
  }
}
