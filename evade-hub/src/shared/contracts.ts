// The contracts between the parts of the app. Each part is built by a different owner (see docs/ARCHITECTURE.md),
// so everything that crosses a boundary is typed here. Change a contract only together with its owner.
//
//   voice  (src/voice)       -> emits transcripts, triggers and Happi's audio stream
//   experience (src/experience) -> the 3D / AR / selfie / photo view; takes actions and a speech stream
//   bear   (src/bear)        -> the character: body clips, face, lip sync
//   app    (src/app)         -> React UI that wires voice to experience, plus chat, games, settings, admin
//
// The old build sent TRIGGER_ANIMATION / SPEECH_TEXT / VISEME_UPDATE over iframe postMessage to a Mattercraft page.
// Here they are direct calls on `ExperienceApi`.

// ------------------------------------------------------------------ actions
/** The trigger words Happi reacts to. Admin can add more keywords; unknown ones fall back to a generic cheer. */
export const CORE_ACTIONS = [
  'House', 'Sparkle', 'Running', 'WakeUp', 'Sleep', 'Dance', 'Wave', 'Magic', 'Cold', 'Party', 'Rainbow', 'Stare',
] as const;
export type CoreAction = (typeof CORE_ACTIONS)[number];
/** Action names are matched case-insensitively. */
export type ActionName = CoreAction | (string & {});

// ------------------------------------------------------------------ lip sync
/** The 15 Oculus-style visemes the lip sync engine outputs, each 0..1. */
export const VISEMES = ['sil', 'PP', 'FF', 'TH', 'DD', 'kk', 'CH', 'SS', 'nn', 'RR', 'aa', 'E', 'I', 'O', 'U'] as const;
export type Viseme = (typeof VISEMES)[number];
export interface VisemeFrame {
  /** Weight per viseme, 0..1. Missing visemes are 0. */
  weights: Partial<Record<Viseme, number>>;
  /** Overall loudness 0..1 (drives jaw fallback and body "talking" energy). */
  amplitude: number;
  /** True while speech is detected. */
  speaking: boolean;
}

// ------------------------------------------------------------------ bear
/** Body clips the character must provide (names are logical; the Bear class maps them to GLB clip names). */
export type BearClip =
  | 'idle' | 'talkIdle' | 'wave' | 'walk' | 'run' | 'dance' | 'cheer' | 'sway' | 'present' | 'sleep' | 'wakeUp' | 'shiver';
export type BearExpression = 'neutral' | 'happy' | 'surprised' | 'sleepy' | 'cold' | 'wink' | 'love' | 'excited';

export interface BearCharacter {
  /** The object to add to a scene. Feet on y = 0, facing +z, `height` metres tall at scale 1. */
  readonly object: import('three').Object3D;
  readonly height: number;
  /** Cross-fade to a body clip. `once` plays it once and then returns to the previous looping clip. */
  play(clip: BearClip, opts?: { once?: boolean; fade?: number; speed?: number }): void;
  /** Resolves when a `once` clip has finished (immediately for looping clips). */
  whenClipDone(): Promise<void>;
  setExpression(e: BearExpression, opts?: { hold?: number }): void;
  /** Feed lip sync directly (the Bear smooths and maps to its blend shapes). Null closes the mouth. */
  setVisemes(frame: VisemeFrame | null): void;
  /** Lip sync from a live stream (Happi's side of the call). Null stops and closes the mouth. */
  setSpeechStream(stream: MediaStream | null): void;
  /** Play a sound file out loud with lip sync. Resolves when it ends (or at once if audio is locked). */
  say(audioUrl: string): Promise<void>;
  /** True while her mouth is moving from a stream or a `say`. */
  readonly speaking: boolean;
  /** Point the eyes and a little of the head at a world position; null looks ahead. */
  lookAt(target: import('three').Vector3 | null): void;
  /** Advance mixers, blinking, face. Call once per rendered frame. */
  update(dt: number): void;
  /** Free GPU resources held on `renderer` (the AR engine hands over a new renderer on every camera swap). */
  releaseRenderer?(renderer: import('three').WebGLRenderer): void;
  dispose(): void;
}

// ------------------------------------------------------------------ experience
export type ExperienceMode = 'showcase' | 'ar' | 'face' | 'photo';

export interface ExperienceEvents {
  /** Loading progress 0..1 while the splash is up. */
  progress: number;
  /** Splash dismissed, first mode is live. */
  started: { mode: ExperienceMode };
  /** A mode switch began / finished. `busy` is true while the camera is switching. */
  mode: { mode: ExperienceMode; busy: boolean };
  /** The user tapped Start on the splash (a user gesture: unlock audio here). */
  userGesture: void;
  /** An action started playing (from a trigger or a tap in the scene). */
  action: { name: string; source: 'api' | 'tap' };
  /** A photo was captured (before the reveal). */
  photo: { blob: Blob; mode: ExperienceMode };
  /** The experience cannot run a camera mode here (desktop, permission denied...). `mode` falls back to showcase. */
  unavailable: { mode: ExperienceMode; reason: 'desktop' | 'permission' | 'unsupported' | 'error'; message: string };
  /** Mini game (Heart Run, Heart Hoops) state, emitted on every change of state and score. */
  play: PlayStatus;
}

// ------------------------------------------------------------------ mini games (round 3)
/** Mini games played inside 3D and AR. Not the word games (those live in the app and count her words). */
export type PlayGameId = 'heart-run' | 'heart-hoops';
export interface PlayGameInfo { id: PlayGameId; label: string; lead: string }
export interface PlayStatus {
  id: PlayGameId | null;
  state: 'idle' | 'countdown' | 'playing' | 'paused' | 'won' | 'over';
  score: number;
  /** Best score on this device (localStorage). */
  best: number;
  /** Seconds left, or null when the game has no clock. */
  timeLeft: number | null;
}
/** Things you can tell the experience to do by voice (hold-to-talk) or from the app. */
export type ExperienceCommand = 'capture' | 'place' | 'move' | 'pause' | 'resume' | 'again'
  /** (voice-3) a hug from Happi in 3D / placed AR: the same squeeze + ring of hearts as a long press on her. */
  | 'hug';

export interface ExperienceApi {
  /** Build the DOM (canvas, splash, in-camera HUD) inside `container` and start loading. */
  mount(container: HTMLElement): Promise<void>;
  readonly mode: ExperienceMode;
  readonly started: boolean;
  /** Switch mode in place (no reload). Resolves when the new mode is live. Camera modes must be called from a tap. */
  setMode(mode: ExperienceMode): Promise<void>;
  /** Play the scene reaction for a trigger word. Returns false when the name is unknown or it is on cooldown. */
  trigger(action: ActionName): boolean;
  /** Names `trigger` understands, for quick-action buttons. */
  readonly actions: readonly string[];
  /** Happi's voice: the experience runs lip sync on it. Null when the call ends. */
  setSpeechStream(stream: MediaStream | null): void;
  /** Show what Happi is saying in a speech bubble (null hides it). */
  setSpeechText(text: string | null): void;
  /** Play a sound through the bear with lip sync (sample lines, tests). Resolves when it ends. */
  say(audioUrl: string, caption?: string): Promise<void>;
  /** Keep this many CSS pixels free at the bottom right for the app's talk button (default 88). */
  setReservedCorner(px: number): void;
  /**
   * Drive the mouth directly (speech with no audio stream to analyse, e.g. the browser's speech synthesis in the
   * demo call). Null hands the mouth back to the audio lip sync.
   */
  setVisemes?(frame: VisemeFrame | null): void;
  /** Lip sync tuning from the admin config (mouth size and timing). Optional: mocks may leave it out. */
  setLipSync?(tuning: { intensity?: number; attackMs?: number; releaseMs?: number }): void;
  /** Mini games this build offers (round 3). */
  readonly playGames?: readonly PlayGameInfo[];
  /** Start a mini game in the current mode (3D or AR). False when this mode cannot host it. */
  startPlay?(id: PlayGameId): Promise<boolean>;
  /** End the running mini game (no-op when none). */
  stopPlay?(): void;
  /** Run a command if the current mode supports it (shutter, Place, Move, pause...). False when it does not apply. */
  command?(name: ExperienceCommand): boolean;
  /** Whether `command(name)` would do something right now (e.g. a usable shutter on screen), without running it. */
  canCommand?(name: ExperienceCommand): boolean;
  on<K extends keyof ExperienceEvents>(event: K, cb: (payload: ExperienceEvents[K]) => void): () => void;
  dispose(): void;
}

// ------------------------------------------------------------------ voice
export type Speaker = 'cheer_bear' | 'user';
export type CallStatus = 'idle' | 'connecting' | 'ringing' | 'in-call' | 'ending' | 'error';

export interface TranscriptEvent {
  id: string;
  speaker: Speaker;
  text: string;
  /** False for streaming partials of the same `id`. */
  final: boolean;
  at: number;
  /**
   * True when this is the demo Happi answering a TYPED chat message (not words heard on a call): the chat shows
   * it like a chat reply, whatever the call-transcript visibility policy says.
   */
  chat?: boolean;
}
export interface TriggerEvent {
  keyword: string;
  speaker: Speaker | 'typed' | 'quick-action';
  /** Which engine matched it. */
  via: 'local' | 'openai' | 'manual';
  transcriptId?: string;
  at: number;
}

export interface VoiceEvents {
  /**
   * `code` says why (for the app to pick the right message); `mock` is true while the call is the demo call.
   */
  status: {
    status: CallStatus;
    message?: string;
    code?: 'not_configured' | 'mic_denied' | 'token_failed' | 'call_failed' | 'demo';
    mock?: boolean;
  };
  transcript: TranscriptEvent;
  trigger: TriggerEvent;
  /** Happi's audio (the remote side of the call), or null when it stops. Feed to ExperienceApi.setSpeechStream. */
  remoteStream: MediaStream | null;
  /**
   * Mouth shapes for speech that has no stream to analyse (the demo call's browser voice). Feed to
   * ExperienceApi.setVisemes; null when she stops talking.
   */
  visemes: VisemeFrame | null;
  /** Transcription connection state, for the debug view. */
  transcription: { speaker: Speaker; state: 'off' | 'connecting' | 'live' | 'error'; message?: string };
  muted: boolean;
}

export interface VoiceSession {
  readonly status: CallStatus;
  readonly muted: boolean;
  /** Must be called from a tap (microphone permission + audio unlock). */
  /** `mock: true` starts the demo call (no Twilio; Happi answers with the browser's voice). */
  startCall(opts?: { to?: string; mock?: boolean }): Promise<void>;
  endCall(): Promise<void>;
  setMuted(muted: boolean): void;
  /** Send a typed message: runs it through the classifier (when user triggers are allowed) and the SMS bridge. */
  sendText(text: string): Promise<{ triggers: string[]; smsSent: boolean }>;
  /** Fire a trigger by hand (quick actions, command mode). Goes through the same cooldown/dispatch policy. */
  fireTrigger(keyword: string, speaker?: TriggerEvent['speaker']): void;
  on<K extends keyof VoiceEvents>(event: K, cb: (payload: VoiceEvents[K]) => void): () => void;
  dispose(): void;
}

// ------------------------------------------------------------------ module entry points
// Each part exposes ONE entry file with these exports (so the others can import before the internals exist):
//
//   src/bear/index.ts        export function loadBear(opts?: { onProgress?: (p: number) => void }): Promise<BearCharacter>
//                            export function unlockAudio(): void            // call inside a user gesture
//   src/experience/index.ts  export function createExperience(opts?: ExperienceOptions): ExperienceApi
//   src/voice/index.ts       export function createVoiceSession(opts: { getConfig(): AppConfig; mock?; endCallWhenHidden? }): VoiceSession
//                            (extras: VoiceSessionExt, ConfigClientExt.services, AdminApiExt; see docs/handoff/server-voice.md)
//                            export const configClient: ConfigClient
//                            export const adminApi: AdminApi
//   src/app/App.tsx          default export: the experience page       (route /)
//   src/admin/AdminPage.tsx  default export: the admin panel           (route /admin)
//   src/bear/lab/LipSyncLab.tsx  default export: lip sync test page     (route /lab/lipsync)

export interface ExperienceOptions {
  /** Start in this mode after the splash (default 'showcase'). */
  initialMode?: ExperienceMode;
  /** Text on the splash and HUD, from admin config. */
  title?: string;
  lead?: string;
}

import type { AppConfig } from './config';

export interface ConfigClient {
  /** Last loaded config (defaults until `load` resolves). */
  readonly current: AppConfig;
  load(): Promise<AppConfig>;
  /** Called on load and whenever the config changes (the client re-checks every so often and on tab focus). */
  subscribe(cb: (config: AppConfig) => void): () => void;
}

export interface AdminApi {
  readonly loggedIn: boolean;
  login(username: string, password: string): Promise<void>;
  logout(): void;
  getConfig(): Promise<AppConfig>;
  /** Deep-merges a partial config, validates and saves it. Returns the saved config. */
  updateConfig(patch: DeepPartial<AppConfig>): Promise<AppConfig>;
  resetConfig(): Promise<AppConfig>;
  history(): Promise<Array<{ id: string; at: string; by: string; summary: string }>>;
  restore(id: string): Promise<AppConfig>;
  /** Run a phrase through the keyword classifier with the saved (or a draft) config. */
  testPhrase(text: string, draft?: DeepPartial<AppConfig>): Promise<{ matches: string[]; engine: string }>;
  /** Which server-side services are configured (never the values). */
  status(): Promise<{ twilio: boolean; openai: boolean; storage: 'blobs' | 'memory' | 'file'; adminConfigured: boolean }>;
}

export type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
