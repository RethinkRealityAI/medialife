// Loads the experience (and the character's audio unlock) without ever white-screening the app.
//
// `import.meta.glob` is used instead of a plain `import('@/experience')` on purpose: if the entry file is missing a
// glob simply matches nothing, and if it throws while loading or constructing we fall back to the mock stage.
// URL flags: ?mock / ?mockExperience (the mock stage).
import type { ExperienceApi, ExperienceOptions } from '@/shared/contracts';
import { createMockExperience } from './dev/MockExperience';
import { params } from './dev/emitter';

type ExperienceModule = { createExperience(opts?: ExperienceOptions): ExperienceApi };

const experienceEntry = import.meta.glob<ExperienceModule>('../experience/index.ts');
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

/** Resolve the siblings' `unlockAudio` ahead of time, so the gesture handler can call them synchronously
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
