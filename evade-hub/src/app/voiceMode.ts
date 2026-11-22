// Voice mode in the app (hold to talk, no call): the talk button's press / release -> the voice module's VoiceMode
// (browser speech recognition + local command matcher) -> what to do in the experience.
//
//   trigger words  -> fired at once (on the interim words) through the voice pipeline, same as a call
//   place / move / hug / games -> run at once
//   camera modes and the shutter -> wait for the RELEASE: the release is a user gesture, which a camera start (and
//                   iOS motion permission, the selfie clip's sound) needs. Said only in the final words, after the
//                   release, we check navigator.userActivation; if the gesture has expired a "Tap to open the
//                   camera" chip asks for one more tap.
//   unknown words  -> "Try saying…" with three example chips you can tap
//   then Happi answers with one short canned line (browser voice, never a trigger word), if spoken replies are on
//
// Owner: voice-3 / voice-4 (docs/handoff/voice-3.md, voice-4.md: one specific line per listening problem, the
// permission prompt is never aborted by a quick release). The AppController creates one and forwards the button events.
import type { ExperienceApi, ExperienceMode, PlayStatus, VoiceSession } from '@/shared/contracts';
import type { AppState, AppStore, VoiceBubble, VoiceUiState } from './state/appState';
import type { Prefs } from './state/prefs';

// Local copies of the voice module's types (the app reaches the voice module only through the session object).
type VoiceCommand =
  | { kind: 'trigger'; keyword: string }
  | { kind: 'mode'; mode: ExperienceMode; orCapture?: boolean }
  | { kind: 'command'; name: 'capture' | 'place' | 'move' | 'pause' | 'resume' | 'again' | 'hug'; orMode?: ExperienceMode }
  | { kind: 'play'; game: 'heart-run' | 'heart-hoops' }
  | { kind: 'stopPlay' };
interface VoiceMatch { id: string; command: VoiceCommand; phrase: string }
/** voice-4: see src/voice/voiceHelp.ts (problemHelp). */
interface ProblemHelp { text: string; help?: string; chips: boolean; block: boolean }
interface DoneEvent { text: string; audio: boolean; heldMs: number; matched: number; reason: string; problem?: string; help: ProblemHelp | null }
type Phase = 'interim' | 'release' | 'final' | 'tap';
/** Modes with a shutter (same list as SHUTTER_MODES in src/voice/commands.ts); AR counts once it shows one. */
const SHUTTER_MODES: ReadonlySet<ExperienceMode> = new Set<ExperienceMode>(['face', 'photo']);
interface VoiceModeLike {
  readonly supported: boolean;
  readonly unavailable: 'unsupported' | 'denied' | null;
  readonly active: boolean;
  readonly state: VoiceUiState;
  readonly lastProblem: string | null;
  readonly micPermission: 'granted' | 'denied' | 'prompt' | 'unknown';
  help(problem: string): ProblemHelp;
  press(opts?: { auto?: boolean }): boolean;
  release(): void;
  cancel(): void;
  run(text: string): VoiceMatch[];
  fireTrigger(keyword: string): void;
  reply(command: VoiceCommand, speak: boolean): string | null;
  hush(): void;
  examples(n?: number): Array<{ say: string; label: string }>;
  on(event: 'state', cb: (e: { state: VoiceUiState; message?: string }) => void): () => void;
  on(event: 'text', cb: (e: { text: string; final: boolean }) => void): () => void;
  on(event: 'level', cb: (l: number) => void): () => void;
  on(event: 'commands', cb: (e: { matches: VoiceMatch[]; phase: Phase }) => void): () => void;
  on(event: 'done', cb: (e: DoneEvent) => void): () => void;
}

export interface VoiceHost {
  store: AppStore;
  experience: ExperienceApi | null;
  voice: VoiceSession | null;
  showToast(kind: 'info' | 'error', text: string, ms?: number): void;
  openSheet(tab: 'actions'): void;
  updatePrefs(patch: Partial<Prefs>): void;
  /** Log what you said in the chat (as a user message). */
  logSaid(text: string): void;
}

/** Shorter than this is a tap, not a hold. */
export const TAP_MS = 250;
const CAMERA: ReadonlySet<ExperienceMode> = new Set(['ar', 'face', 'photo']);
const LABEL: Record<ExperienceMode, string> = { showcase: '3D', ar: 'AR', face: 'Selfie', photo: '3D Photo' };

let bubbleSeq = 0;

export class VoiceModeUi {
  private vm: VoiceModeLike | null = null;
  private offs: Array<() => void> = [];
  private levelSubs = new Set<(l: number) => void>();
  private pressAt = 0;
  private pending: VoiceMatch[] = [];
  private replied: VoiceCommand | null = null;
  private lastTrigger: string | null = null;
  private play: PlayStatus | null = null;
  private bubbleTimer = 0;
  private pressMode: 'hold' | 'tap' = 'hold';
  /** A quick tap let go before the mic opened: its hint is already up, its "done" stays quiet. */
  private quietDone = false;
  /** Why the button can't listen this session (shown in the toast and the Talk tab). */
  private blockedHelp: ProblemHelp | null = null;

  constructor(private host: VoiceHost) {}

  private get s(): AppState { return this.host.store.get(); }
  private set(patch: Partial<AppState>) { this.host.store.set(patch); }

  /** Voice mode is switched on by the admin and no call is live (a call listens by itself). */
  get on(): boolean {
    const s = this.s;
    return s.ui.voiceMode.enabled && (s.call === 'idle' || s.call === 'error');
  }

  get tapToTalk(): boolean {
    const p = this.s.prefs.tapToTalk;
    return p ?? !this.s.ui.voiceMode.holdToTalk;
  }

  get spokenReplies(): boolean {
    const p = this.s.prefs.spokenReplies;
    return p ?? this.s.ui.voiceMode.spokenReplies;
  }

  /** Wire to the voice session (after boot). Sessions without voice mode (mocks) leave it unsupported. */
  attach(voice: VoiceSession | null, exp: ExperienceApi | null): void {
    this.detach();
    const vm = (voice as unknown as { voiceMode?: VoiceModeLike } | null)?.voiceMode ?? null;
    this.vm = vm;
    if (!vm || !vm.supported) this.set({ voice: 'unsupported' });
    if (exp) this.offs.push(exp.on('play', (p) => { this.play = p; }));
    if (!vm) return;
    this.offs.push(
      vm.on('state', ({ state }) => {
        // messages come with 'done' (one specific line per cause); a permission given back in Settings -> idle again
        this.set({ voice: state });
        if (state === 'idle' && this.blockedHelp && !vm.unavailable) this.blockedHelp = null;
        // the mic is open: now is the moment to talk (Android needs ~0.3-1 s and a beep before it hears anything)
        if (state === 'listening' && !this.s.voiceText && this.s.voiceBubble?.kind === 'caption') this.bubble({ kind: 'caption', text: 'Talk now!' }, 0);
      }),
      vm.on('text', ({ text }) => {
        if (!text || !vm.active) return;
        this.set({ voiceText: text });
        this.bubble({ kind: 'caption', text }, 0);
      }),
      vm.on('level', (l) => { for (const cb of this.levelSubs) cb(l); }),
      vm.on('commands', ({ matches, phase }) => { for (const m of matches) this.run(m, phase); }),
      vm.on('done', (r) => this.onDone(r)),
    );
  }

  /** A call is starting: drop any hold in progress. */
  cancel(): void {
    this.vm?.cancel();
    this.pending = [];
    this.clearBubble();
    if (this.s.voice !== 'unsupported' && this.s.voice !== 'denied') this.set({ voice: 'idle' });
  }

  detach(): void {
    this.offs.forEach((off) => { try { off(); } catch { /* ignore */ } });
    this.offs = [];
    this.vm?.cancel();
  }

  /** The mic level while listening (0..1), for the talk button's ring. */
  onLevel(cb: (l: number) => void): () => void {
    this.levelSubs.add(cb);
    return () => this.levelSubs.delete(cb);
  }

  // ------------------------------------------------------------------ the button
  /** pointerdown / keydown on the talk button (a user gesture). */
  press(via: 'pointer' | 'key'): void {
    const vm = this.vm;
    if (this.tapToTalk) return; // tap mode: the click does it
    if (!vm || vm.unavailable || !vm.supported) return; // the click falls back to the Actions tab
    this.pressMode = 'hold';
    this.start(via);
  }

  /** pointerup / keyup (a user gesture). A tap shorter than TAP_MS shows "Hold me while you talk!". */
  release(): void {
    if (this.tapToTalk || !this.vm?.active) return;
    const held = performance.now() - this.pressAt;
    if (held < TAP_MS) return this.quickTap(true);
    this.finishInGesture();
  }

  /** The pointer left / was cancelled (e.g. a scroll, or the browser's permission prompt took over). */
  abort(): void {
    if (this.tapToTalk || !this.vm?.active) return;
    if (performance.now() - this.pressAt < TAP_MS) return this.quickTap(false);
    this.finishInGesture();
  }

  /**
   * Let go almost at once. Before the mic opened (or while the browser asks for permission) the recogniser is NOT
   * aborted: that can kill the permission prompt, so the first hold would fail every time. It is released instead
   * (the voice module waits for the mic, then drops it quietly).
   */
  private quickTap(hint: boolean): void {
    const vm = this.vm!;
    if (vm.state === 'finishing') return; // already let go (pointerup, then lostpointercapture)
    this.pending = [];
    const asking = vm.micPermission === 'prompt' || vm.micPermission === 'unknown';
    const waiting = vm.state === 'starting'; // the mic has not opened yet (maybe the permission prompt)
    if (waiting) {
      this.quietDone = true;
      vm.release();
    } else {
      vm.cancel();
      this.set({ voice: 'idle' });
    }
    if (waiting) {
      if (hint || asking) this.bubble({ kind: 'hint', text: vm.micPermission === 'prompt' ? 'Tap Allow, then hold me and talk!' : 'Hold me while you talk!' }, 3200);
    } else if (hint) {
      this.bubble({ kind: 'hint', text: 'Hold me while you talk!' }, 2600);
    }
  }

  /** A click on the talk button (tap-to-talk, and every fallback). */
  click(): void {
    const vm = this.vm;
    if (!vm || vm.unavailable || !vm.supported) {
      const why = vm?.unavailable === 'denied' ? 'denied' : 'unsupported';
      this.fallback(why, this.blockedHelp ?? (vm && why === 'unsupported' ? vm.help('unsupported') : null));
      return;
    }
    if (!this.tapToTalk) return; // handled by press/release
    if (vm.active) { this.finishInGesture(); return; }
    this.pressMode = 'tap';
    this.start('pointer', true);
  }

  private start(_via: 'pointer' | 'key', auto = false): void {
    const vm = this.vm!;
    this.pressAt = performance.now();
    this.pending = [];
    this.replied = null;
    this.quietDone = false;
    this.set({ voiceText: '' });
    // start() runs synchronously inside this press (iOS needs the gesture): nothing is awaited before it
    if (!vm.press({ auto })) {
      const problem = vm.lastProblem ?? 'unsupported';
      if (vm.unavailable) this.fallback(vm.unavailable, this.blockedHelp ?? vm.help(problem));
      else this.bubble({ kind: 'problem', text: vm.help(problem).text }, 3200);
      return;
    }
    try { navigator.vibrate?.(10); } catch { /* not supported */ }
    // "Getting ready" until the browser says the mic is open, then "Talk now!" (state 'listening')
    this.bubble({ kind: 'caption', text: vm.state === 'listening' ? 'Talk now!' : 'Getting ready…' }, 0);
  }

  /** Release inside the gesture: the voice module hands over what was said so far, camera things run now. */
  private finishInGesture(): void {
    this.vm?.release();
    this.flushPending(true);
  }

  /** Unsupported browser / blocked microphone / speech service off: never a dead button. */
  private fallback(why: 'unsupported' | 'denied', help: ProblemHelp | null = null): void {
    if (help) this.blockedHelp = help;
    this.set({ voice: why });
    this.host.openSheet('actions');
    const h = this.blockedHelp;
    const text = h ? h.text : why === 'denied' ? 'Your microphone is off, so tap a magic word instead!' : 'This browser can’t hear you, so tap a magic word instead!';
    this.host.showToast('info', h?.help ? `${text} ${h.help}` : text, h?.help ? 8000 : 4200);
  }

  /** What the Talk tab says while the button can't listen (null: it can). */
  get blockedText(): { text: string; help?: string } | null {
    const s = this.s.voice;
    if (s !== 'unsupported' && s !== 'denied') return null;
    return this.blockedHelp ?? { text: s === 'denied' ? 'Your microphone is off.' : 'This browser can’t hear you.' };
  }

  // ------------------------------------------------------------------ commands
  private run(m: VoiceMatch, phase: Phase): void {
    const c = m.command;
    const exp = this.host.experience;
    const gestureLater = phase === 'interim';
    switch (c.kind) {
      case 'trigger':
        this.vm?.fireTrigger(c.keyword);
        this.lastTrigger = c.keyword;
        this.noteReply(c);
        return;
      case 'mode': {
        const target: ExperienceMode = c.orCapture && exp?.mode === c.mode ? exp.mode : c.mode;
        if (c.orCapture && exp?.mode === c.mode) return this.run({ ...m, command: { kind: 'command', name: 'capture' } }, phase);
        if (CAMERA.has(target) && gestureLater) { this.pending.push(m); return; }
        if (CAMERA.has(target) && phase === 'final' && !gestureStillActive()) {
          this.bubble({ kind: 'camera', text: `Ready for ${LABEL[target]}?`, mode: target }, 8000);
          return;
        }
        this.openMode(target);
        this.noteReply(c);
        return;
      }
      case 'command': {
        if (c.name === 'capture') {
          if (gestureLater) { this.pending.push(m); return; }
          // mirrors resolveCapture() in src/voice/commands.ts (unit tested there): the shutter where there is one,
          // else bare "photo" opens 3D Photo and "take a picture" / "cheese" open Selfie (where the shutter is)
          const mode = exp?.mode ?? 'showcase';
          if (!SHUTTER_MODES.has(mode) && !exp?.canCommand?.('capture')) {
            return this.run({ ...m, command: { kind: 'mode', mode: c.orMode ?? 'face' } }, phase);
          }
          if (exp?.command?.('capture')) this.noteReply(c);
          else this.bubble({ kind: 'info', text: 'One moment, then say cheese!' }, 2600);
          return;
        }
        if (c.name === 'again') {
          const st = this.play?.state;
          if (this.play?.id && (st === 'over' || st === 'won') && exp?.command?.('again')) { this.noteReply(c); return; }
          if (this.lastTrigger) { this.vm?.fireTrigger(this.lastTrigger); this.noteReply({ kind: 'trigger', keyword: this.lastTrigger }); }
          else this.bubble({ kind: 'info', text: 'Say a magic word first!' }, 2600);
          return;
        }
        const ok = exp?.command?.(c.name) ?? false;
        if (ok) this.noteReply(c);
        else if (c.name === 'place' || c.name === 'move') {
          this.bubble({ kind: 'info', text: exp?.mode === 'ar' || exp?.mode === 'photo' ? 'Point at the floor first!' : 'Say “AR” to put her in your room!' }, 3200);
        } else if (c.name === 'hug') {
          // no hug in this view: a happy wave instead
          this.vm?.fireTrigger('Wave');
          this.noteReply(c);
        }
        return;
      }
      case 'play': {
        if (!exp?.startPlay) { this.bubble({ kind: 'info', text: 'Games are coming soon!' }, 2600); return; }
        const go = () => exp.startPlay!(c.game).then((ok) => { if (!ok) this.bubble({ kind: 'info', text: 'Games play in 3D or AR.' }, 2800); });
        if (exp.mode === 'face' || exp.mode === 'photo') void exp.setMode('showcase').then(go);
        else void go();
        this.noteReply(c);
        return;
      }
      case 'stopPlay':
        if (this.play?.id && this.play.state !== 'idle') { exp?.stopPlay?.(); this.noteReply(c); }
        return;
    }
  }

  private openMode(mode: ExperienceMode): void {
    const exp = this.host.experience;
    if (!exp || exp.mode === mode) return;
    void exp.setMode(mode);
  }

  /** Runs the camera commands said during the hold. `inGesture`: called from the release handler itself. */
  private flushPending(inGesture: boolean): void {
    const list = this.pending;
    this.pending = [];
    for (const m of list) this.run(m, inGesture ? 'release' : 'final');
  }

  /** Remember the first command of this hold for her one spoken answer. */
  private noteReply(c: VoiceCommand): void {
    if (!this.replied) this.replied = c;
  }

  private onDone(r: DoneEvent): void {
    if (this.pending.length) this.flushPending(false); // tap-to-talk auto stop: no gesture left
    const quiet = this.quietDone;
    this.quietDone = false;
    const text = r.text.trim();
    this.set({ voiceText: text });
    if (text) this.host.logSaid(text);
    if (r.matched > 0) {
      if (!this.s.prefs.voiceNudgeDone) this.host.updatePrefs({ voiceNudgeDone: true });
      const reply = this.replied ? this.vm?.reply(this.replied, this.spokenReplies) ?? null : null;
      this.replied = null;
      // her line shows in her own speech bubble; ours shows what we heard for a moment
      if (this.s.voiceBubble?.kind !== 'camera' && this.s.voiceBubble?.kind !== 'info') this.bubble({ kind: 'caption', text: `“${text}”` }, reply ? 1400 : 2200);
      return;
    }
    if (text) {
      const ex = this.examples();
      this.bubble({ kind: 'unknown', text: 'Hmm! Try saying:', examples: ex }, 9000);
      return;
    }
    const h = r.help;
    if (!h) { this.clearBubble(); return; }
    if (h.block) { this.fallback(this.vm?.unavailable ?? 'denied', h); this.clearBubble(); return; }
    // a quick tap already showed its hint; only the permission prompt case says more
    if (quiet && r.problem === 'too-short') return;
    // let go to answer the permission prompt, and the mic opened after all: allowed
    if (r.problem === 'permission-pending' && r.audio) { this.bubble({ kind: 'hint', text: 'Yay! Now hold me and talk!' }, 3600); return; }
    this.bubble({ kind: 'problem', text: h.text, help: h.help, examples: h.chips ? this.examples().slice(0, 2) : undefined }, h.chips || h.help ? 9000 : 3600);
  }

  /** Three things to try: two magic words and a mode you are not in. */
  examples(): Array<{ say: string; label: string }> {
    const ex = (this.vm?.examples(3) ?? []).slice(0, 2);
    const mode = this.host.experience?.mode ?? 'showcase';
    ex.push(mode === 'showcase' ? { say: 'go to ar', label: 'Go to AR' } : { say: 'go to 3d', label: 'Go to 3D' });
    return ex;
  }

  /** An example chip was tapped (a user gesture): run it as if it was said. */
  runExample(say: string): void {
    this.clearBubble();
    this.replied = null;
    const matches = this.vm?.run(say) ?? [];
    if (matches.length && this.replied) this.vm?.reply(this.replied, this.spokenReplies);
    this.replied = null;
  }

  /** The "Tap to open the camera" chip (a user gesture). */
  openCamera(mode: ExperienceMode): void {
    this.clearBubble();
    this.openMode(mode);
  }

  // ------------------------------------------------------------------ bubble
  bubble(b: Omit<VoiceBubble, 'id'>, ms: number): void {
    // a fresh hold's caption replaces anything; nothing else replaces the camera chip while it is up
    const cur = this.s.voiceBubble;
    if (cur?.kind === 'camera' && b.kind !== 'camera' && !this.vm?.active) return;
    const keepId = cur && cur.kind === b.kind && b.kind === 'caption';
    this.set({ voiceBubble: { ...b, id: keepId ? cur!.id : ++bubbleSeq } });
    window.clearTimeout(this.bubbleTimer);
    if (ms > 0) this.bubbleTimer = window.setTimeout(() => this.clearBubble(), ms);
  }

  clearBubble(): void {
    window.clearTimeout(this.bubbleTimer);
    if (this.s.voiceBubble) this.set({ voiceBubble: null });
  }

  setTapToTalk(v: boolean): void {
    this.vm?.cancel();
    this.host.updatePrefs({ tapToTalk: v });
  }

  setSpokenReplies(v: boolean): void {
    if (!v) this.vm?.hush();
    this.host.updatePrefs({ spokenReplies: v });
  }

  dispose(): void {
    this.detach();
    window.clearTimeout(this.bubbleTimer);
    this.levelSubs.clear();
  }
}

/** True while the page still has the user's last gesture (Chrome keeps it ~5 s; unknown browsers: assume yes). */
function gestureStillActive(): boolean {
  const ua = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
  return ua ? ua.isActive : true;
}
