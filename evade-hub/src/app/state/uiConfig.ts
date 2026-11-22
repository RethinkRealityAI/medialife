// Everything the app reads from AppConfig goes through here. The config shape belongs to server-voice and may be
// trimmed while the rebuild is in progress, so we read it loosely (every field optional) and fall back to the
// defaults below. Components only ever see the normalised `UiSettings`.
import type { AppConfig, GameMode, TranscriptVisibility, UiMode } from '@/shared/config';
import { CORE_ACTIONS } from '@/shared/contracts';

/** The parts of the (old) config shape the app understands, all optional. */
interface LooseConfig {
  modeDefault?: string;
  allowUserTriggers?: boolean;
  transcriptVisibility?: string;
  intentMatchingEngine?: string;
  englishOnlyTranscripts?: boolean;
  allowUserAudioToOpenAI?: boolean;
  smsPolicy?: { sendTypedChatToSms?: boolean; sendSpeechToSms?: boolean };
  triggerPolicy?: { triggerCooldownMs?: number; dispatchMode?: string; partialTriggerEnabled?: boolean };
  localClassifier?: { keywords?: string[] };
  voiceMode?: { enabled?: boolean; holdToTalk?: boolean; spokenReplies?: boolean };
  gameModes?: Partial<GameMode>[];
  activeGameMode?: string | null;
  ui?: {
    isCommandMode?: boolean;
    customization?: Partial<{
      experienceName: string;
      headerTitle: string;
      primaryColor: string;
      secondaryColor: string;
      accentColor: string;
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
      welcomeModal: Partial<WelcomeSettings> & { items?: Partial<WelcomeItem>[] };
      settingsPanel: { items?: Record<string, boolean> };
    }>;
  };
}

export interface WelcomeItem { id: string; title: string; description: string; icon: string; imageUrl?: string }
export interface WelcomeSettings {
  enabled: boolean;
  showOnce: boolean;
  version: number;
  title: string;
  description: string;
  heroImageUrl?: string;
  delayMs: number;
  items: WelcomeItem[];
}

export type ThemeToken = 'pink' | 'blue' | 'yellow' | 'orange' | 'green' | 'purple' | 'red';

export interface UiSettings {
  name: string;
  title: string;
  colors: { primary: ThemeToken; secondary: ThemeToken; accent: ThemeToken };
  text: {
    chatPlaceholder: string;
    commandPlaceholder: string;
    call: string;
    hangUp: string;
    openChat: string;
  };
  show: { quickActions: boolean; settings: boolean; keyboardHelp: boolean; call: boolean };
  defaultSheetOpen: { desktop: boolean; mobile: boolean };
  modeDefault: UiMode;
  transcriptVisibility: TranscriptVisibility;
  allowUserTriggers: boolean;
  commandModeDefault: boolean;
  keywords: string[];
  /** Voice mode (hold the talk button and say what should happen; no call). Admin defaults. */
  voiceMode: { enabled: boolean; holdToTalk: boolean; spokenReplies: boolean };
  gameModes: GameMode[];
  activeGameMode: string | null;
  welcome: WelcomeSettings;
  /** Settings panel items that are switched on (by id). Unknown ids default to on, as in the old app. */
  settingsItems: Record<string, boolean>;
  staff: {
    intentEngine: string;
    englishOnly: boolean;
    userAudioToOpenAI: boolean;
    smsTyped: boolean;
    smsSpeech: boolean;
    cooldownMs: number;
    dispatchMode: string;
    partialTriggers: boolean;
  };
}

const str = (v: unknown, d: string) => (typeof v === 'string' && v.trim() ? v : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

const UI_MODES: UiMode[] = ['calm', 'chat', 'call_debug'];
const VISIBILITIES: TranscriptVisibility[] = ['off', 'call_debug_only', 'chat_only', 'chat_and_call_debug'];

// Theme tokens (theme.css) as RGB, to snap admin-picked colours onto the brand palette: no new colours.
const TOKENS: Record<ThemeToken, [number, number, number]> = {
  pink: [0xff, 0x38, 0x9b],
  blue: [0x43, 0x9b, 0xdd],
  yellow: [0xff, 0xd8, 0x4a],
  orange: [0xff, 0x9a, 0x3d],
  green: [0x5f, 0xcf, 0x86],
  purple: [0x9a, 0x6b, 0xff],
  red: [0xff, 0x5a, 0x5f],
};

export function nearestToken(color: unknown, fallback: ThemeToken): ThemeToken {
  if (typeof color !== 'string') return fallback;
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(color.trim());
  if (!m) return fallback;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  let best: ThemeToken = fallback;
  let bestD = Infinity;
  for (const [name, t] of Object.entries(TOKENS) as [ThemeToken, [number, number, number]][]) {
    // weighted RGB distance (roughly perceptual)
    const d = 2 * (rgb[0] - t[0]) ** 2 + 4 * (rgb[1] - t[1]) ** 2 + 3 * (rgb[2] - t[2]) ** 2;
    if (d < bestD) { bestD = d; best = name; }
  }
  return best;
}

function normaliseGameMode(g: Partial<GameMode>, i: number): GameMode | null {
  if (!g || typeof g !== 'object') return null;
  const id = str(g.id, `mode-${i}`);
  return {
    id,
    name: str(g.name, 'Word game'),
    description: str(g.description, ''),
    enabled: bool(g.enabled, true),
    triggerWords: Array.isArray(g.triggerWords) ? g.triggerWords.filter((w): w is string => typeof w === 'string') : [],
    hints: {
      general: Array.isArray(g.hints?.general) ? g.hints!.general.filter((h) => typeof h === 'string') : [],
      specific: g.hints?.specific && typeof g.hints.specific === 'object' ? g.hints.specific : {},
    },
    objective: str(g.objective, ''),
    instructions: typeof g.instructions === 'string' ? g.instructions : undefined,
  };
}

export function normaliseConfig(config: AppConfig | null | undefined): UiSettings {
  const c = (config ?? {}) as unknown as LooseConfig;
  const cu = c.ui?.customization ?? {};
  const wm = cu.welcomeModal ?? {};
  const keywords = (c.localClassifier?.keywords ?? []).filter((k): k is string => typeof k === 'string' && !!k.trim());
  const gameModes = (Array.isArray(c.gameModes) ? c.gameModes : [])
    .map(normaliseGameMode)
    .filter((g): g is GameMode => !!g);
  return {
    name: str(cu.experienceName, 'Happi'),
    title: str(cu.headerTitle, str(cu.experienceName, 'Happi')),
    colors: {
      primary: nearestToken(cu.primaryColor, 'pink'),
      secondary: nearestToken(cu.secondaryColor, 'purple'),
      accent: nearestToken(cu.accentColor, 'yellow'),
    },
    text: {
      chatPlaceholder: str(cu.chatPlaceholder, 'Write to Happi…'),
      commandPlaceholder: str(cu.commandPlaceholder, 'Type an action word…'),
      call: str(cu.callButtonText, 'Call Happi'),
      hangUp: str(cu.hangupButtonText, 'End call'),
      openChat: str(cu.collapsedChatText, 'Talk to Happi'),
    },
    show: {
      quickActions: bool(cu.showQuickActionsButton, true),
      settings: bool(cu.showSettingsButton, true),
      keyboardHelp: bool(cu.showKeyboardHelpButton, true),
      call: bool(cu.showCallButton, true),
    },
    defaultSheetOpen: {
      desktop: bool(cu.defaultChatExpandedDesktop, true),
      mobile: bool(cu.defaultChatExpandedMobile, false),
    },
    modeDefault: UI_MODES.includes(c.modeDefault as UiMode) ? (c.modeDefault as UiMode) : 'calm',
    transcriptVisibility: VISIBILITIES.includes(c.transcriptVisibility as TranscriptVisibility)
      ? (c.transcriptVisibility as TranscriptVisibility)
      : 'off',
    allowUserTriggers: bool(c.allowUserTriggers, false),
    commandModeDefault: bool(c.ui?.isCommandMode, false),
    keywords: keywords.length ? keywords : [...CORE_ACTIONS],
    voiceMode: {
      enabled: bool(c.voiceMode?.enabled, true),
      holdToTalk: bool(c.voiceMode?.holdToTalk, true),
      spokenReplies: bool(c.voiceMode?.spokenReplies, true),
    },
    gameModes,
    activeGameMode: typeof c.activeGameMode === 'string' ? c.activeGameMode : null,
    welcome: {
      enabled: bool(wm.enabled, false),
      showOnce: bool(wm.showOnce, true),
      version: num(wm.version, 1),
      title: str(wm.title, 'Welcome!'),
      description: str(wm.description, ''),
      heroImageUrl: typeof wm.heroImageUrl === 'string' && wm.heroImageUrl.trim() ? wm.heroImageUrl : undefined,
      delayMs: Math.min(10000, Math.max(0, num(wm.delayMs, 0))),
      items: (Array.isArray(wm.items) ? wm.items : [])
        .filter((it) => it && (it as { enabled?: boolean }).enabled !== false)
        .map((it, i) => ({
          id: str(it.id, `item-${i}`),
          title: str(it.title, ''),
          description: str(it.description, ''),
          icon: str(it.icon, 'Sparkles'),
          imageUrl: typeof it.imageUrl === 'string' && it.imageUrl.trim() ? it.imageUrl : undefined,
        })),
    },
    settingsItems: { ...(cu.settingsPanel?.items ?? {}) },
    staff: {
      intentEngine: str(c.intentMatchingEngine, 'local'),
      englishOnly: bool(c.englishOnlyTranscripts, true),
      userAudioToOpenAI: bool(c.allowUserAudioToOpenAI, false),
      smsTyped: bool(c.smsPolicy?.sendTypedChatToSms, true),
      smsSpeech: bool(c.smsPolicy?.sendSpeechToSms, false),
      cooldownMs: num(c.triggerPolicy?.triggerCooldownMs, 3000),
      dispatchMode: str(c.triggerPolicy?.dispatchMode, 'first_only'),
      partialTriggers: bool(c.triggerPolicy?.partialTriggerEnabled, false),
    },
  };
}

export const settingOn = (ui: UiSettings, id: string) => ui.settingsItems[id] !== false;

/**
 * Whether call transcripts may be shown (chat list and Happi's speech bubble).
 * Calm is audio only, so never. The old app's `chat_only` case returned false for every mode (a bug: the admin
 * label says "Chat mode only"); here it means what it says.
 */
export function transcriptsVisible(visibility: TranscriptVisibility, mode: UiMode, staffOverride: boolean): boolean {
  if (mode === 'calm') return false;
  if (mode === 'call_debug' && staffOverride) return true;
  switch (visibility) {
    case 'chat_only': return mode === 'chat';
    case 'call_debug_only': return mode === 'call_debug';
    case 'chat_and_call_debug': return true;
    default: return false;
  }
}
