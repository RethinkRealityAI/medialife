// Loads the sibling modules (experience, voice, audio unlock) without ever white-screening the app.
//
// `import.meta.glob` is used instead of a plain `import('@/experience')` on purpose: when a sibling's entry file
// does not exist yet, a plain dynamic import fails at build/transform time and takes App.tsx down with it, while a
// glob simply matches nothing. If the module exists but throws while loading or constructing, we fall back too.
//
// URL flags: ?mock (mock experience + mock voice + default config), ?mockExperience (mock experience only).
// ?mockVoice is passed through to the real voice module (which simulates a call itself); if that module is
// missing, our MockVoice is used instead.
import type { ConfigClient, ExperienceApi, ExperienceOptions, VoiceSession } from '@/shared/contracts';
import type { AppConfig } from '@/shared/config';
import { createMockExperience } from './dev/MockExperience';
import { createLocalConfigClient, createMockVoice, createUnavailableVoice } from './dev/MockVoice';
import { params } from './dev/emitter';

type ExperienceModule = { createExperience(opts?: ExperienceOptions): ExperienceApi };
type VoiceModule = {
  createVoiceSession(opts: { getConfig(): AppConfig }): VoiceSession;
  configClient: ConfigClient;
};

const experienceEntry = import.meta.glob<ExperienceModule>('../experience/index.ts');
const voiceEntry = import.meta.glob<VoiceModule>('../voice/index.ts');
const unlockEntries = import.meta.glob<{ unlockAudio?: () => void }>(['../audio/index.ts', '../bear/index.ts']);

export type Source = 'real' | 'mock' | 'unavailable';

async function loadOne<T>(entries: Record<string, () => Promise<T>>): Promise<T | null> {
  const loader = Object.values(entries)[0];
  if (!loader) return null;
  try {
    return await loader();
  } catch (err) {
    console.error('[app] a sibling module failed to load', err);
    return null;
  }
}

export async function loadVoice(getConfig: () => AppConfig): Promise<{
  voice: VoiceSession; configClient: ConfigClient; source: Source;
}> {
  const p = params();
  if (p.has('mock')) {
    return { voice: createMockVoice({ getConfig }), configClient: createLocalConfigClient(), source: 'mock' };
  }
  const mod = await loadOne(voiceEntry);
  let configClient: ConfigClient | null = null;
  if (mod?.configClient) configClient = mod.configClient;
  if (mod?.createVoiceSession) {
    try {
      return { voice: mod.createVoiceSession({ getConfig }), configClient: configClient ?? createLocalConfigClient(), source: 'real' };
    } catch (err) {
      console.error('[app] createVoiceSession threw', err);
    }
  }
  const voice = import.meta.env.DEV || p.has('mockVoice')
    ? createMockVoice({ getConfig })
    : createUnavailableVoice(mod ? 'voice failed to start' : 'voice module missing');
  return { voice, configClient: configClient ?? createLocalConfigClient(), source: import.meta.env.DEV ? 'mock' : 'unavailable' };
}

export async function loadExperience(opts: ExperienceOptions): Promise<{ experience: ExperienceApi; source: Source }> {
  const p = params();
  if (p.has('mock') || p.has('mockExperience')) return { experience: createMockExperience(), source: 'mock' };
  const mod = await loadOne(experienceEntry);
  if (mod?.createExperience) {
    try {
      return { experience: mod.createExperience(opts), source: 'real' };
    } catch (err) {
      console.error('[app] createExperience threw', err);
    }
  }
  console.warn('[app] experience module unavailable, using the mock stage');
  return { experience: createMockExperience(), source: 'mock' };
}

const unlockers: Array<() => void> = [];

/** Resolve the siblings' `unlockAudio` functions ahead of time, so the gesture handler can call them synchronously
 *  (iOS only unlocks audio inside the gesture's own call stack). */
export async function preloadAudioUnlock(): Promise<void> {
  if (params().has('mock')) return;
  for (const load of Object.values(unlockEntries)) {
    try {
      const m = await load();
      if (typeof m.unlockAudio === 'function' && !unlockers.includes(m.unlockAudio)) unlockers.push(m.unlockAudio);
    } catch { /* optional */ }
  }
}

/** Call inside a user gesture. */
export function unlockAudio(): void {
  for (const fn of unlockers) {
    try { fn(); } catch (err) { console.warn('[app] unlockAudio failed', err); }
  }
}
