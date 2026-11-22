import type { CallStatus, ExperienceMode, Speaker, TriggerEvent } from '@/shared/contracts';
import type { UiMode } from '@/shared/config';
import { DEFAULT_CONFIG } from '@/shared/config';
import { createStore } from './store';
import { loadPrefs, type Prefs } from './prefs';
import { newGame, type GameState } from './game';
import { normaliseConfig, type UiSettings } from './uiConfig';
import type { Source } from '../loaders';

export type TabId = 'talk' | 'actions' | 'games' | 'settings';
export type SheetSnap = 'half' | 'full';
export type Overlay = null | 'welcome' | 'hint' | 'completion' | 'keys';

export interface ChatMessage {
  id: string;
  kind: 'user' | 'bear' | 'system' | 'action';
  text: string;
  /** False for streaming partials (shown only in the staff view). */
  final: boolean;
  source: 'typed' | 'call' | 'system';
  at: number;
  /** Small status under a message (e.g. "Sent"), or staff detail for actions. */
  note?: string;
  /** For actions: who caused it and whether the scene played it. */
  trigger?: { speaker: TriggerEvent['speaker']; via: TriggerEvent['via']; played: boolean; counted: boolean };
}

export interface Toast {
  id: number;
  kind: 'found' | 'info' | 'error';
  text: string;
}

export type TranscriptionState = 'off' | 'connecting' | 'live' | 'error';

/** Voice mode (hold to talk): what the talk button is doing. */
export type VoiceUiState = 'idle' | 'starting' | 'listening' | 'finishing' | 'unsupported' | 'denied' | 'error';

/** The bubble above the talk button in voice mode. */
export interface VoiceBubble {
  id: number;
  kind: 'nudge' | 'hint' | 'caption' | 'unknown' | 'camera' | 'info' | 'problem';
  text: string;
  /** 'problem' (voice-4): a line for a grown-up on what to change (Siri & Dictation, mic permission...). */
  help?: string;
  /** "Try saying…" chips (unknown speech). */
  examples?: Array<{ say: string; label: string }>;
  /** 'camera': the mode the chip's tap opens. */
  mode?: ExperienceMode;
}

export interface AppState {
  started: boolean;
  sources: { experience: Source | 'loading'; voice: Source | 'loading' };
  expMode: ExperienceMode;
  expBusy: boolean;
  ui: UiSettings;
  call: CallStatus;
  callMessage: string | null;
  callStartedAt: number | null;
  /** The current call is a simulated demo call (voice ?mockVoice, or calling not set up). */
  callDemo: boolean;
  muted: boolean;
  /** Happi is talking (from her transcript events). */
  speaking: boolean;
  /** Her words are showing in the scene's speech bubble (the talk button's nudge stays out of its way). */
  captionOn: boolean;
  transcription: Record<Speaker, { state: TranscriptionState; message?: string }>;
  messages: ChatMessage[];
  uiMode: UiMode;
  /** Staff view: show call transcripts even when the policy says off. */
  staffTranscripts: boolean;
  /** Typed text fires actions directly (old "command mode"). */
  commandMode: boolean;
  /** Local override of config.allowUserTriggers (settings item "user_triggers"). */
  allowUserTriggers: boolean;
  sheetOpen: boolean;
  sheetSnap: SheetSnap;
  tab: TabId;
  overlay: Overlay;
  micAsk: boolean;
  micGranted: boolean;
  toast: Toast | null;
  game: GameState;
  prefs: Prefs;
  isDesktop: boolean;
  /** Voice mode: the talk button is a hold-to-talk mic (config on, no call live). */
  voice: VoiceUiState;
  /** Live words while you hold (interim), the final words after. */
  voiceText: string;
  voiceBubble: VoiceBubble | null;
  /** Calling can actually connect here (Twilio set up, or the demo call): show the small phone button. */
  callsAvailable: boolean;
}

export function createAppStore() {
  const prefs = loadPrefs();
  const ui = normaliseConfig(DEFAULT_CONFIG);
  return createStore<AppState>({
    started: false,
    sources: { experience: 'loading', voice: 'loading' },
    expMode: 'showcase',
    expBusy: false,
    ui,
    call: 'idle',
    callMessage: null,
    callStartedAt: null,
    callDemo: false,
    muted: false,
    speaking: false,
    captionOn: false,
    transcription: { cheer_bear: { state: 'off' }, user: { state: 'off' } },
    messages: [],
    uiMode: prefs.uiMode ?? ui.modeDefault,
    staffTranscripts: false,
    commandMode: ui.commandModeDefault,
    allowUserTriggers: ui.allowUserTriggers,
    sheetOpen: false,
    sheetSnap: 'half',
    tab: 'talk',
    overlay: null,
    micAsk: false,
    micGranted: false,
    toast: null,
    game: newGame(null),
    prefs,
    isDesktop: typeof matchMedia === 'function' ? matchMedia('(min-width: 901px)').matches : false,
    voice: 'idle',
    voiceText: '',
    voiceBubble: null,
    callsAvailable: false,
  });
}

export type AppStore = ReturnType<typeof createAppStore>;
