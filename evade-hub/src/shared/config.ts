// Runtime configuration: types, defaults, deep merge and validation. Shared by the browser (config client, admin
// panel, voice pipeline) and the Netlify functions (config store). Owner: server-voice.
//
// Ported from the old app's src/server/types.ts + configStore.ts. Removed (no longer apply on Netlify):
//   - arIframeUrl                 (no iframe: the experience is in this app)
//   - lipSync.modelUrl            (models are static files in public/, no GCS upload)
//   - lipSync.backgroundImageUrl  (GCS upload)
//   - twilioPhoneNumber           (caller ID is server-only now: TWILIO_PHONE_NUMBER env var)
// Everything in AppConfig is safe to send to any browser: GET /api/config returns it whole.

export type UiMode = 'calm' | 'chat' | 'call_debug';
export type IntentMatchingEngine = 'local' | 'openai' | 'hybrid';
export type TranscriptVisibility = 'off' | 'call_debug_only' | 'chat_only' | 'chat_and_call_debug';
export type TriggerDispatchMode = 'first_only' | 'queue_all';

export interface LocalClassifier {
  keywords: string[];
  /** Lower-case keyword -> extra words/phrases that count as that keyword. */
  synonyms: Record<string, string[]>;
  /** Lower-case keyword -> example sentences (used as hints for the OpenAI intent fallback). */
  examples: Record<string, string[]>;
  /** Also match simple inflections (dance -> dances, danced, dancing). */
  morphologyEnabled: boolean;
}

export interface SmsPolicy {
  /** Typed chat messages are also texted to Bobo's number while a call is live. */
  sendTypedChatToSms: boolean;
  /** The user's own call transcripts are texted too (only when user audio goes to OpenAI). */
  sendSpeechToSms: boolean;
}

export interface TriggerPolicy {
  /** Fire on streaming partial transcripts (faster, more false positives). */
  partialTriggerEnabled: boolean;
  /** The same keyword from the same speaker cannot fire again within this many ms. */
  triggerCooldownMs: number;
  /** first_only: one queued trigger per keyword; queue_all: play everything in order. */
  dispatchMode: TriggerDispatchMode;
  /** Gap between two queued triggers. */
  dispatchIntervalMs: number;
}

export interface WelcomeModalItem {
  id: string;
  enabled: boolean;
  title: string;
  description: string;
  /** A safe icon key mapped client-side (e.g. "Phone", "MessageSquare", "Home", "Gamepad2"). Unknown -> default. */
  icon: string;
  imageUrl?: string;
}

export interface WelcomeModalConfig {
  enabled: boolean;
  /** Dismissal persists per device (localStorage). Bump `version` to show it again. */
  showOnce: boolean;
  version: number;
  title: string;
  description: string;
  heroImageUrl?: string;
  /** Delay (ms) after the experience starts. 0 = straight away. */
  delayMs: number;
  items: WelcomeModalItem[];
}

export type SettingsPanelItemId =
  // User-facing items
  | 'trigger_keywords'
  | 'experience_mode'
  | 'call_transcripts_toggle'
  | 'input_mode'
  | 'user_triggers'
  | 'call_mode_toggle'
  // Admin items shown in the in-app settings sheet
  | 'admin_transcript_visibility'
  | 'admin_intent_engine'
  | 'admin_trigger_policy'
  | 'admin_sms_policy'
  | 'admin_allow_user_audio_to_openai'
  | 'admin_english_only';

export const USER_SETTINGS_PANEL_ITEM_IDS: readonly SettingsPanelItemId[] = [
  'trigger_keywords', 'experience_mode', 'call_transcripts_toggle', 'input_mode', 'user_triggers', 'call_mode_toggle',
];
export const ADMIN_SETTINGS_PANEL_ITEM_IDS: readonly SettingsPanelItemId[] = [
  'admin_transcript_visibility', 'admin_intent_engine', 'admin_trigger_policy', 'admin_sms_policy',
  'admin_allow_user_audio_to_openai', 'admin_english_only',
];
export function isValidSettingsPanelItemId(id: string): id is SettingsPanelItemId {
  return (USER_SETTINGS_PANEL_ITEM_IDS as readonly string[]).includes(id)
    || (ADMIN_SETTINGS_PANEL_ITEM_IDS as readonly string[]).includes(id);
}

export interface SettingsPanelConfig {
  items: Record<SettingsPanelItemId, boolean>;
}

export interface UiCustomization {
  experienceName: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  headerTitle: string;
  chatPlaceholder: string;
  commandPlaceholder: string;
  callButtonText: string;
  hangupButtonText: string;
  collapsedChatText: string;
  showQuickActionsButton: boolean;
  showSettingsButton: boolean;
  showKeyboardHelpButton: boolean;
  showCallButton: boolean;
  showMobileCallButton: boolean;
  defaultChatExpandedDesktop: boolean;
  defaultChatExpandedMobile: boolean;
  /** Old orb-vs-chat layout. Kept for the admin panel; the new layout always has the talk button (app-ui decides). */
  defaultCallModeDesktop: boolean;
  /** See `defaultCallModeDesktop`. */
  defaultCallModeMobile: boolean;
  /** Old: delay before showing the UI after the AR iframe loaded. The splash now gates the UI (app-ui decides). */
  uiDelayMs: number;
  welcomeModal: WelcomeModalConfig;
  settingsPanel: SettingsPanelConfig;
}

export interface LipSyncDisplayConfig {
  /** Show the controls panel on the /lab/lipsync page. */
  showControlsPanel: boolean;
  /** Show the lip sync debug HUD. */
  showDebugHud: boolean;
  /** Mouth size: 1 is the tuned default, lower is subtler, higher is bigger. */
  intensity: number;
  /** Time to reach a new mouth shape, in milliseconds (lower is snappier). */
  attackMs: number;
  /** Time to relax out of a mouth shape, in milliseconds. */
  releaseMs: number;
}

/** Bobo's browser voice and local "brain" (the demo call, and answers to typed chat when no call is live). */
export interface DemoVoiceConfig {
  /** Outside a call, Bobo answers typed chat out loud with the browser's voice (and her mouth moves). */
  speakTypedChatOutsideCall: boolean;
  /** Browser voice pitch: 1 is the voice's normal pitch (0.5 to 2). */
  pitch: number;
  /** Browser voice speed: 1 is normal (0.5 to 2). */
  rate: number;
  /** Her answers may come from the AI chat function (/api/chat) when the server has an OpenAI key; else the local brain. */
  useAiBrain: boolean;
}

/**
 * Voice mode: hold the talk button (or tap, see holdToTalk) and say what should happen ("rainbow", "go to AR",
 * "take a picture"). No call, no server, no AI: the browser's own speech recognition turns speech into words and a
 * local matcher (src/voice/commands.ts) turns words into actions. Chrome sends the audio to Google's speech service
 * and Safari to Apple's (free, no key), so it is not on-device.
 */
export interface VoiceModeConfig {
  /** The talk button is a hold-to-talk mic when no call is live (calling moves to a smaller phone button). */
  enabled: boolean;
  /** Default for new visitors: hold the button while talking (true) or tap once to start and once to stop (false). */
  holdToTalk: boolean;
  /** Bobo answers commands with a short canned line in the browser's voice (visitors can turn it off). */
  spokenReplies: boolean;
}

export interface UiPrefs {
  useCallMode: boolean;
  isCommandMode: boolean;
  customization: UiCustomization;
}

export interface GameModeHints {
  /** General questions for any trigger word. */
  general: string[];
  /** Lower-case keyword -> word-specific hints. */
  specific: Record<string, string[]>;
}

export interface GameMode {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  /** Words to get Bobo to say. Empty for 'chat-time', which uses every keyword. */
  triggerWords: string[];
  hints: GameModeHints;
  objective: string;
  instructions?: string;
}

export interface AppConfig {
  modeDefault: UiMode;
  /** The user's own words (typed, or transcribed when allowed) may fire triggers. */
  allowUserTriggers: boolean;
  /** Privacy gate: send the user's microphone to OpenAI for transcription. Off = only Bobo is transcribed. */
  allowUserAudioToOpenAI: boolean;
  intentMatchingEngine: IntentMatchingEngine;
  localClassifier: LocalClassifier;
  transcriptVisibility: TranscriptVisibility;
  smsPolicy: SmsPolicy;
  /** Strip non-ASCII characters from transcripts before showing and matching them. */
  englishOnlyTranscripts: boolean;
  triggerPolicy: TriggerPolicy;
  ui: UiPrefs;
  gameModes: GameMode[];
  activeGameMode: string | null;
  lipSync: LipSyncDisplayConfig;
  demoVoice: DemoVoiceConfig;
  voiceMode: VoiceModeConfig;
}

export const DEFAULT_CONFIG: AppConfig = {
  modeDefault: 'calm',
  allowUserTriggers: false,
  allowUserAudioToOpenAI: false,
  intentMatchingEngine: 'local',
  localClassifier: {
    keywords: ['House', 'Sparkle', 'Running', 'WakeUp', 'Sleep', 'Dance', 'Wave', 'Magic', 'Cold', 'Party', 'Rainbow', 'Stare'],
    synonyms: {
      house: ['home', 'houses'],
      sparkle: ['sparkles', 'sparkly', 'glitter'],
      running: ['run', 'ran'],
      wakeup: ['wake', 'wake up', 'wake-up', 'waking', 'woke'],
      sleep: ['sleepy', 'nap', 'sleeping', 'slept'],
      dance: ['dancing', 'danced', 'dances'],
      wave: ['waving', 'waved', 'waves'],
      magic: ['magical', 'spell'],
      cold: ['chill', 'freezing', 'icy'],
      party: ['partying', 'parties', 'partied', 'celebrate', 'celebration'],
      rainbow: ['rainbows', 'colorful', 'colors'],
      stare: ['care bear stare', 'carebear stare', 'bear stare'],
    },
    examples: {},
    morphologyEnabled: false,
  },
  transcriptVisibility: 'off',
  smsPolicy: { sendTypedChatToSms: true, sendSpeechToSms: false },
  englishOnlyTranscripts: true,
  triggerPolicy: {
    partialTriggerEnabled: false,
    triggerCooldownMs: 3000,
    dispatchMode: 'first_only',
    dispatchIntervalMs: 1000,
  },
  ui: {
    useCallMode: true,
    isCommandMode: false,
    customization: {
      experienceName: "Bobo's Hideout",
      primaryColor: '#ec4899',
      secondaryColor: '#7c3aed',
      accentColor: '#fbbf24',
      headerTitle: "Bobo's Hideout",
      chatPlaceholder: 'Type message...',
      commandPlaceholder: 'Direct Trigger...',
      callButtonText: 'Call Bobo',
      hangupButtonText: 'End call',
      collapsedChatText: 'Chat to Bobo',
      showQuickActionsButton: true,
      showSettingsButton: true,
      showKeyboardHelpButton: true,
      showCallButton: true,
      showMobileCallButton: true,
      defaultChatExpandedDesktop: true,
      defaultChatExpandedMobile: false,
      defaultCallModeDesktop: false,
      defaultCallModeMobile: true,
      uiDelayMs: 0,
      welcomeModal: {
        enabled: true,
        showOnce: true,
        version: 1,
        title: "Welcome to Bobo's Hideout",
        description:
          'Meet Bobo and explore the experience. Try calling or chatting, explore Bobo’s house, and play word games together.',
        heroImageUrl: '',
        delayMs: 0,
        items: [
          { id: 'call-chat', enabled: true, title: 'Call or chat to Bobo', description: 'Say hello and talk with Bobo in real time.', icon: 'Phone' },
          { id: 'explore-house', enabled: true, title: 'Explore Bobo’s house', description: 'Look around and discover Bobo’s world in AR.', icon: 'Home' },
          { id: 'word-games', enabled: true, title: 'Play word games', description: 'Try game modes and get Bobo to say special words.', icon: 'Gamepad2' },
        ],
      },
      settingsPanel: {
        items: {
          trigger_keywords: true,
          experience_mode: true,
          call_transcripts_toggle: true,
          input_mode: true,
          user_triggers: true,
          call_mode_toggle: true,
          admin_transcript_visibility: true,
          admin_intent_engine: true,
          admin_trigger_policy: true,
          admin_sms_policy: true,
          admin_allow_user_audio_to_openai: true,
          admin_english_only: true,
        },
      },
    },
  },
  lipSync: { showControlsPanel: true, showDebugHud: true, intensity: 1, attackMs: 55, releaseMs: 95 },
  demoVoice: { speakTypedChatOutsideCall: true, pitch: 1.3, rate: 1.05, useAiBrain: true },
  voiceMode: { enabled: true, holdToTalk: true, spokenReplies: true },
  gameModes: [
    {
      id: 'chat-time',
      name: 'Chat Time',
      description: 'Freely chat with Bobo and discover all the magical words!',
      enabled: true,
      triggerWords: [],
      hints: {
        general: [
          "What's your favorite thing to do?",
          'Tell me about yourself',
          'What makes you happy?',
          'How do you help others feel better?',
          "What's a fun memory you have?",
          'What do you like about New York?',
          "What's your favorite color?",
          'Do you have any special talents?',
          "What's your favorite season?",
          'Tell me about your friends',
        ],
        specific: {},
      },
      objective:
        'Freely chat with Bobo and ask it questions about itself, or just have any kind of conversation. When it says certain words, something magical will happen in this scene!',
      instructions:
        'Freely chat with Bobo and ask it questions about itself, or just have any kind of conversation. When Bobo says any of the trigger words, something magical will happen in this scene!',
    },
    {
      id: 'rainbow-adventure',
      name: 'Rainbow Adventure',
      description: 'Explore the colorful world of New York!',
      enabled: true,
      triggerWords: ['Rainbow', 'Sparkle', 'Magic', 'Party'],
      hints: {
        general: [
          "Tell me more about where you're from",
          "What's your favorite thing about New York?",
          'What makes your home so special?',
        ],
        specific: {
          rainbow: ['What do you see in the sky after it rains?', 'What colors can you see from your home?', 'Tell me about the beautiful things in New York'],
          sparkle: ['What makes things shine and twinkle?', 'Do you like glittery things?', "What's the most beautiful thing you've ever seen?"],
          magic: ['Can you do anything magical?', 'Tell me about something amazing that happened', 'What makes a festival special?'],
          party: ['How do you celebrate special occasions?', "What's your favorite way to have fun?", 'Do you like celebrations?'],
        },
      },
      objective: 'Get Bobo to say all the rainbow-themed words to trigger something cool in the scene!',
      instructions:
        'Ask Bobo questions about their home, favorite things, and magical world. Be creative - you cannot directly ask them to say specific words!',
    },
    {
      id: 'dance-party',
      name: 'Dance Party',
      description: 'Get Bobo ready to party!',
      enabled: true,
      triggerWords: ['Dance', 'Wave', 'Party', 'Running'],
      hints: {
        general: ['What do you like to do for fun?', 'How do you celebrate with friends?', 'What activities make you happy?'],
        specific: {
          dance: ['Do you like to move to music?', "What's your favorite way to express joy?", 'Show me how you celebrate!'],
          wave: ['How do you greet your friends?', 'Can you say hello to everyone?', 'What do you do when you see a friend?'],
          party: ["What's the best celebration you've had?", 'How do you make special moments fun?', 'What do you do on birthdays?'],
          running: ['Do you like to exercise?', 'What games do you play outside?', 'How do you stay active?'],
        },
      },
      objective: 'Get Bobo to say these words to trigger something cool in the scene!',
    },
    {
      id: 'care-bear-home',
      name: 'Bobo’s Home',
      description: "Learn about Bobo's daily routine!",
      enabled: true,
      triggerWords: ['House', 'Sleep', 'WakeUp', 'Cold'],
      hints: {
        general: ['Tell me about your day', "What's your daily routine like?", 'Where do you live?'],
        specific: {
          house: ['What does your home look like?', 'Where do you live in New York?', 'Describe your favorite room'],
          sleep: ["What do you do when you're tired?", 'Do you have sweet dreams?', 'What helps you relax?'],
          wakeup: ['What do you do in the morning?', 'How do you start your day?', "What's the first thing you do when you open your eyes?"],
          cold: ["What do you do when it's chilly?", 'How do you stay warm?', "What's winter like in New York?"],
        },
      },
      objective: 'Get Bobo to say these words to trigger something cool in the scene!',
    },
  ],
  activeGameMode: 'chat-time',
};

// ------------------------------------------------------------------ helpers

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A fresh deep copy of the defaults (never hand out the shared object). */
export function defaultConfig(): AppConfig {
  return structuredCloneSafe(DEFAULT_CONFIG);
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/**
 * Paths whose value is a free-form record (string -> string[]) or a list: a patch REPLACES them instead of merging,
 * so the admin can delete a synonym or a game mode. Everything else is merged key by key, following the shape of
 * DEFAULT_CONFIG; unknown keys are dropped (an old stored config with arIframeUrl etc. loads cleanly).
 */
const REPLACE_PATHS = new Set(['localClassifier.synonyms', 'localClassifier.examples']);

function mergeBySchema(schema: unknown, base: unknown, patch: unknown, path: string): unknown {
  if (patch === undefined) return base;
  if (REPLACE_PATHS.has(path)) return patch;
  if (Array.isArray(schema)) return patch; // lists are replaced wholesale (validated afterwards)
  if (isPlainObject(schema)) {
    if (!isPlainObject(patch)) return patch; // wrong type: let validation report it
    const out: Record<string, unknown> = {};
    const b = isPlainObject(base) ? base : {};
    for (const key of Object.keys(schema)) {
      const child = mergeBySchema(schema[key], b[key], patch[key], path ? `${path}.${key}` : key);
      if (child !== undefined) out[key] = child;
    }
    return out;
  }
  // Optional scalars (heroImageUrl, activeGameMode null): the schema value may be '' or null.
  return patch;
}

/**
 * Deep-merges a partial config onto `base`, keeping only known keys. Arrays and free-form records are replaced.
 * Does not validate: call `validateConfig` on the result.
 */
export function mergeConfig(base: AppConfig, patch: unknown): AppConfig {
  if (!isPlainObject(patch)) return structuredCloneSafe(base);
  const merged = mergeBySchema(DEFAULT_CONFIG, structuredCloneSafe(base), structuredCloneSafe(patch), '') as AppConfig;
  // An accidentally empty list of game modes keeps the previous ones (old behaviour).
  if (Array.isArray(merged.gameModes) && merged.gameModes.length === 0) merged.gameModes = structuredCloneSafe(base.gameModes);
  return merged;
}

// ------------------------------------------------------------------ validation

export const LIMITS = {
  keywords: 100,
  keywordLength: 50,
  synonymsPerKeyword: 50,
  examplesPerKeyword: 20,
  phraseLength: 200,
  gameModes: 50,
  hintsPerList: 50,
  textShort: 120,
  textLong: 2000,
  welcomeItems: 12,
  maxMs: 30000,
  /** JSON size of a whole saved config. */
  configBytes: 200_000,
} as const;

const KEYWORD_RE = /^[\p{L}\p{N}][\p{L}\p{N} '\-]*$/u;
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

class Checker {
  errors: string[] = [];
  fail(path: string, msg: string) {
    if (this.errors.length < 50) this.errors.push(`${path}: ${msg}`);
  }
  bool(v: unknown, path: string) {
    if (typeof v !== 'boolean') this.fail(path, 'must be true or false');
  }
  oneOf(v: unknown, values: readonly string[], path: string) {
    if (typeof v !== 'string' || !values.includes(v)) this.fail(path, `must be one of ${values.join(', ')}`);
  }
  num(v: unknown, min: number, max: number, path: string) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) this.fail(path, `must be a number from ${min} to ${max}`);
  }
  int(v: unknown, min: number, max: number, path: string) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) this.fail(path, `must be a whole number from ${min} to ${max}`);
  }
  str(v: unknown, max: number, path: string, opts: { optional?: boolean; nonEmpty?: boolean } = {}) {
    if (v === undefined && opts.optional) return;
    if (typeof v !== 'string') return this.fail(path, 'must be text');
    if (v.length > max) this.fail(path, `must be at most ${max} characters`);
    if (opts.nonEmpty && !v.trim()) this.fail(path, 'must not be empty');
  }
  url(v: unknown, path: string) {
    if (v === undefined || v === '') return;
    if (typeof v !== 'string' || v.length > 500) return this.fail(path, 'must be a URL (max 500 characters)');
    if (v.startsWith('/') && !v.startsWith('//')) return; // same-origin path
    try {
      const u = new URL(v);
      if (u.protocol !== 'https:') this.fail(path, 'must be an https URL or a /path');
    } catch {
      this.fail(path, 'must be an https URL or a /path');
    }
  }
  strList(v: unknown, maxItems: number, maxLen: number, path: string) {
    if (!Array.isArray(v)) return this.fail(path, 'must be a list');
    if (v.length > maxItems) this.fail(path, `must have at most ${maxItems} items`);
    v.forEach((s, i) => this.str(s, maxLen, `${path}[${i}]`));
  }
  record(v: unknown, maxKeys: number, maxItems: number, maxLen: number, path: string) {
    if (!isPlainObject(v)) return this.fail(path, 'must be an object');
    const keys = Object.keys(v);
    if (keys.length > maxKeys) this.fail(path, `must have at most ${maxKeys} entries`);
    for (const k of keys) {
      if (k.length > LIMITS.keywordLength || k === '__proto__' || k === 'constructor' || k === 'prototype') this.fail(`${path}.${k}`, 'invalid key');
      this.strList(v[k], maxItems, maxLen, `${path}.${k}`);
    }
  }
}

/** Validates a WHOLE config (after merging). Returns human-readable errors; empty when valid. */
export function validateConfig(config: unknown): string[] {
  const c = new Checker();
  if (!isPlainObject(config)) return ['config: must be an object'];
  const cfg = config as unknown as AppConfig;

  c.oneOf(cfg.modeDefault, ['calm', 'chat', 'call_debug'], 'modeDefault');
  c.bool(cfg.allowUserTriggers, 'allowUserTriggers');
  c.bool(cfg.allowUserAudioToOpenAI, 'allowUserAudioToOpenAI');
  c.oneOf(cfg.intentMatchingEngine, ['local', 'hybrid', 'openai'], 'intentMatchingEngine');
  c.oneOf(cfg.transcriptVisibility, ['off', 'call_debug_only', 'chat_only', 'chat_and_call_debug'], 'transcriptVisibility');
  c.bool(cfg.englishOnlyTranscripts, 'englishOnlyTranscripts');

  const lc = cfg.localClassifier;
  if (!isPlainObject(lc)) c.fail('localClassifier', 'must be an object');
  else {
    c.strList(lc.keywords, LIMITS.keywords, LIMITS.keywordLength, 'localClassifier.keywords');
    if (Array.isArray(lc.keywords)) {
      const seen = new Set<string>();
      lc.keywords.forEach((k, i) => {
        if (typeof k !== 'string') return;
        if (!KEYWORD_RE.test(k.trim())) c.fail(`localClassifier.keywords[${i}]`, 'use letters, numbers, spaces, - and \' only');
        const low = k.trim().toLowerCase();
        if (seen.has(low)) c.fail(`localClassifier.keywords[${i}]`, `duplicate keyword "${k}"`);
        seen.add(low);
      });
    }
    c.record(lc.synonyms, LIMITS.keywords, LIMITS.synonymsPerKeyword, LIMITS.keywordLength, 'localClassifier.synonyms');
    c.record(lc.examples, LIMITS.keywords, LIMITS.examplesPerKeyword, LIMITS.phraseLength, 'localClassifier.examples');
    c.bool(lc.morphologyEnabled, 'localClassifier.morphologyEnabled');
  }

  if (!isPlainObject(cfg.smsPolicy)) c.fail('smsPolicy', 'must be an object');
  else {
    c.bool(cfg.smsPolicy.sendTypedChatToSms, 'smsPolicy.sendTypedChatToSms');
    c.bool(cfg.smsPolicy.sendSpeechToSms, 'smsPolicy.sendSpeechToSms');
  }

  const tp = cfg.triggerPolicy;
  if (!isPlainObject(tp)) c.fail('triggerPolicy', 'must be an object');
  else {
    c.bool(tp.partialTriggerEnabled, 'triggerPolicy.partialTriggerEnabled');
    c.int(tp.triggerCooldownMs, 0, LIMITS.maxMs, 'triggerPolicy.triggerCooldownMs');
    c.oneOf(tp.dispatchMode, ['first_only', 'queue_all'], 'triggerPolicy.dispatchMode');
    c.int(tp.dispatchIntervalMs, 0, LIMITS.maxMs, 'triggerPolicy.dispatchIntervalMs');
  }

  const ui = cfg.ui;
  if (!isPlainObject(ui)) c.fail('ui', 'must be an object');
  else {
    c.bool(ui.useCallMode, 'ui.useCallMode');
    c.bool(ui.isCommandMode, 'ui.isCommandMode');
    const cu = ui.customization;
    if (!isPlainObject(cu)) c.fail('ui.customization', 'must be an object');
    else {
      for (const k of ['experienceName', 'headerTitle', 'chatPlaceholder', 'commandPlaceholder', 'callButtonText', 'hangupButtonText', 'collapsedChatText'] as const) {
        c.str(cu[k], LIMITS.textShort, `ui.customization.${k}`);
      }
      for (const k of ['primaryColor', 'secondaryColor', 'accentColor'] as const) {
        if (typeof cu[k] !== 'string' || !COLOR_RE.test(cu[k])) c.fail(`ui.customization.${k}`, 'must be a hex colour like #ec4899');
      }
      for (const k of [
        'showQuickActionsButton', 'showSettingsButton', 'showKeyboardHelpButton', 'showCallButton', 'showMobileCallButton',
        'defaultChatExpandedDesktop', 'defaultChatExpandedMobile', 'defaultCallModeDesktop', 'defaultCallModeMobile',
      ] as const) c.bool(cu[k], `ui.customization.${k}`);
      c.int(cu.uiDelayMs, 0, LIMITS.maxMs, 'ui.customization.uiDelayMs');

      const wm = cu.welcomeModal;
      if (!isPlainObject(wm)) c.fail('ui.customization.welcomeModal', 'must be an object');
      else {
        c.bool(wm.enabled, 'ui.customization.welcomeModal.enabled');
        c.bool(wm.showOnce, 'ui.customization.welcomeModal.showOnce');
        c.int(wm.version, 0, 1_000_000, 'ui.customization.welcomeModal.version');
        c.str(wm.title, LIMITS.textShort, 'ui.customization.welcomeModal.title');
        c.str(wm.description, LIMITS.textLong, 'ui.customization.welcomeModal.description');
        c.url(wm.heroImageUrl, 'ui.customization.welcomeModal.heroImageUrl');
        c.int(wm.delayMs, 0, LIMITS.maxMs, 'ui.customization.welcomeModal.delayMs');
        if (!Array.isArray(wm.items)) c.fail('ui.customization.welcomeModal.items', 'must be a list');
        else {
          if (wm.items.length > LIMITS.welcomeItems) c.fail('ui.customization.welcomeModal.items', `at most ${LIMITS.welcomeItems} items`);
          wm.items.forEach((it, i) => {
            const p = `ui.customization.welcomeModal.items[${i}]`;
            if (!isPlainObject(it)) return c.fail(p, 'must be an object');
            if (typeof it.id !== 'string' || !ID_RE.test(it.id)) c.fail(`${p}.id`, 'must be a short id (letters, numbers, - _)');
            c.bool(it.enabled, `${p}.enabled`);
            c.str(it.title, LIMITS.textShort, `${p}.title`);
            c.str(it.description, LIMITS.textLong, `${p}.description`);
            c.str(it.icon, 40, `${p}.icon`);
            c.url(it.imageUrl, `${p}.imageUrl`);
          });
        }
      }

      const sp = cu.settingsPanel;
      if (!isPlainObject(sp) || !isPlainObject(sp.items)) c.fail('ui.customization.settingsPanel.items', 'must be an object');
      else {
        for (const [k, v] of Object.entries(sp.items)) {
          if (!isValidSettingsPanelItemId(k)) c.fail(`ui.customization.settingsPanel.items.${k}`, 'unknown item');
          else c.bool(v, `ui.customization.settingsPanel.items.${k}`);
        }
      }
    }
  }

  if (!isPlainObject(cfg.lipSync)) c.fail('lipSync', 'must be an object');
  else {
    c.bool(cfg.lipSync.showControlsPanel, 'lipSync.showControlsPanel');
    c.bool(cfg.lipSync.showDebugHud, 'lipSync.showDebugHud');
    c.num(cfg.lipSync.intensity, 0.3, 1.5, 'lipSync.intensity');
    c.num(cfg.lipSync.attackMs, 15, 200, 'lipSync.attackMs');
    c.num(cfg.lipSync.releaseMs, 20, 300, 'lipSync.releaseMs');
  }

  if (!isPlainObject(cfg.demoVoice)) c.fail('demoVoice', 'must be an object');
  else {
    c.bool(cfg.demoVoice.speakTypedChatOutsideCall, 'demoVoice.speakTypedChatOutsideCall');
    c.num(cfg.demoVoice.pitch, 0.5, 2, 'demoVoice.pitch');
    c.num(cfg.demoVoice.rate, 0.5, 2, 'demoVoice.rate');
    c.bool(cfg.demoVoice.useAiBrain, 'demoVoice.useAiBrain');
  }

  if (!isPlainObject(cfg.voiceMode)) c.fail('voiceMode', 'must be an object');
  else {
    c.bool(cfg.voiceMode.enabled, 'voiceMode.enabled');
    c.bool(cfg.voiceMode.holdToTalk, 'voiceMode.holdToTalk');
    c.bool(cfg.voiceMode.spokenReplies, 'voiceMode.spokenReplies');
  }

  if (!Array.isArray(cfg.gameModes)) c.fail('gameModes', 'must be a list');
  else {
    if (cfg.gameModes.length > LIMITS.gameModes) c.fail('gameModes', `at most ${LIMITS.gameModes} game modes`);
    const ids = new Set<string>();
    cfg.gameModes.forEach((gm, i) => {
      const p = `gameModes[${i}]`;
      if (!isPlainObject(gm)) return c.fail(p, 'must be an object');
      if (typeof gm.id !== 'string' || !ID_RE.test(gm.id)) c.fail(`${p}.id`, 'must be a short id (letters, numbers, - _)');
      else if (ids.has(gm.id)) c.fail(`${p}.id`, `duplicate id "${gm.id}"`);
      else ids.add(gm.id);
      c.str(gm.name, LIMITS.textShort, `${p}.name`, { nonEmpty: true });
      c.str(gm.description, LIMITS.textLong, `${p}.description`);
      c.bool(gm.enabled, `${p}.enabled`);
      c.strList(gm.triggerWords, LIMITS.keywords, LIMITS.keywordLength, `${p}.triggerWords`);
      if (!isPlainObject(gm.hints)) c.fail(`${p}.hints`, 'must be an object');
      else {
        c.strList(gm.hints.general, LIMITS.hintsPerList, LIMITS.phraseLength, `${p}.hints.general`);
        c.record(gm.hints.specific, LIMITS.keywords, LIMITS.hintsPerList, LIMITS.phraseLength, `${p}.hints.specific`);
      }
      c.str(gm.objective, LIMITS.textLong, `${p}.objective`);
      c.str(gm.instructions, LIMITS.textLong, `${p}.instructions`, { optional: true });
    });
    if (cfg.activeGameMode !== null && (typeof cfg.activeGameMode !== 'string' || !ids.has(cfg.activeGameMode))) {
      c.fail('activeGameMode', 'must be null or the id of a game mode');
    }
  }

  if (c.errors.length === 0) {
    const size = JSON.stringify(config).length;
    if (size > LIMITS.configBytes) c.fail('config', `too large (${size} bytes, max ${LIMITS.configBytes})`);
  }
  return c.errors;
}

/** Tidies a valid config: trims keywords, lower-cases record keys, restores default game modes and a sane active one. */
export function normalizeConfig(config: AppConfig): AppConfig {
  const out = structuredCloneSafe(config);
  out.localClassifier.keywords = out.localClassifier.keywords.map((k) => k.trim()).filter(Boolean);
  const lowerKeys = (r: Record<string, string[]>) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim().toLowerCase(), v.map((s) => s.trim()).filter(Boolean)]));
  out.localClassifier.synonyms = lowerKeys(out.localClassifier.synonyms);
  out.localClassifier.examples = lowerKeys(out.localClassifier.examples);
  for (const gm of out.gameModes) gm.hints.specific = lowerKeys(gm.hints.specific);
  return ensureGameModes(out);
}

/** Old configStore behaviour: default game modes (e.g. Chat Time) are always present; the active one must exist and be enabled. */
export function ensureGameModes(config: AppConfig): AppConfig {
  const configured = Array.isArray(config.gameModes) ? config.gameModes : [];
  if (configured.length === 0) {
    return { ...config, gameModes: structuredCloneSafe(DEFAULT_CONFIG.gameModes), activeGameMode: config.activeGameMode ?? DEFAULT_CONFIG.activeGameMode };
  }
  const defaults = DEFAULT_CONFIG.gameModes;
  const defaultIds = new Set(defaults.map((m) => m.id));
  const byId = new Map(configured.map((m) => [m.id, m]));
  const modes = [...defaults.map((m) => byId.get(m.id) ?? structuredCloneSafe(m)), ...configured.filter((m) => !defaultIds.has(m.id))];
  let active = config.activeGameMode;
  if (active && !modes.some((m) => m.id === active)) active = DEFAULT_CONFIG.activeGameMode;
  if (active && !modes.some((m) => m.id === active && m.enabled)) active = modes.find((m) => m.enabled)?.id ?? null;
  return { ...config, gameModes: modes, activeGameMode: active };
}

/**
 * Loads anything (a stored config, an old Cloud SQL export, a /api/config response) into a valid AppConfig.
 * Invalid stored values fall back to the defaults instead of breaking the app.
 */
export function coerceConfig(input: unknown): AppConfig {
  const merged = mergeConfig(defaultConfig(), input);
  if (validateConfig(merged).length === 0) return normalizeConfig(merged);
  // Fall back section by section so one bad field does not wipe the rest.
  let cfg = defaultConfig();
  if (isPlainObject(input)) {
    for (const key of Object.keys(DEFAULT_CONFIG) as (keyof AppConfig)[]) {
      if (!(key in input)) continue;
      const attempt = mergeConfig(cfg, { [key]: (input as Record<string, unknown>)[key] });
      if (validateConfig(attempt).length === 0) cfg = attempt;
    }
  }
  return normalizeConfig(cfg);
}

/**
 * Applies an admin patch: merge, validate, normalise. Throws ConfigValidationError with the list of problems.
 */
export function applyConfigPatch(base: AppConfig, patch: unknown): AppConfig {
  if (!isPlainObject(patch)) throw new ConfigValidationError(['config: must be an object']);
  const merged = mergeConfig(base, patch);
  const errors = validateConfig(merged);
  if (errors.length) throw new ConfigValidationError(errors);
  return normalizeConfig(merged);
}

export class ConfigValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Config validation failed: ${errors.slice(0, 5).join('; ')}${errors.length > 5 ? ` (+${errors.length - 5} more)` : ''}`);
    this.name = 'ConfigValidationError';
  }
}

/** Dotted paths whose values differ (for history summaries). Lists and records count as one path. */
export function diffConfigPaths(a: unknown, b: unknown, path = '', out: string[] = []): string[] {
  if (out.length >= 30) return out;
  if (isPlainObject(a) && isPlainObject(b) && !REPLACE_PATHS.has(path)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) diffConfigPaths(a[k], b[k], path ? `${path}.${k}` : k, out);
    return out;
  }
  if (JSON.stringify(a as Json) !== JSON.stringify(b as Json)) out.push(path || '(all)');
  return out;
}

/** Shape of GET /api/config. */
export interface PublicConfigResponse {
  config: AppConfig;
  /** Which server-side services are set up (never the values). */
  services: { calls: boolean; transcription: boolean; sms: boolean; intentAi: boolean; chatAi?: boolean };
  updatedAt: string | null;
}
