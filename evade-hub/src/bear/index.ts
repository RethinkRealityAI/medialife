// Entry point of the character module (see src/shared/contracts.ts). The character in this build is Bobo, EVADE's
// cat (src/evade/world/Bobo.ts): a rigged 3D body with his own clips, no face canvas, no lip sync.
//
//   import { loadBear, unlockAudio } from '@/bear';
//   const bobo = await loadBear({ onProgress: p => ... });
//   scene.add(bobo.object);  // feet on y = 0, facing +z, bobo.height tall
//   renderer.setAnimationLoop(() => { bobo.update(clock.getDelta()); renderer.render(scene, camera); });
//   // in a tap: unlockAudio();
import type { BearCharacter } from '../shared/contracts';
import { Bobo, BOBO_MODEL_URL, type LoadBoboOptions } from '../evade/world/Bobo';

export { unlockAudio } from '../audio/context';
export type { LoadBoboOptions as LoadBearOptions } from '../evade/world/Bobo';
export { Bobo } from '../evade/world/Bobo';

/** URL of the one character model used everywhere (Bobo). */
export const BEAR_MODEL_URL = BOBO_MODEL_URL;

/** Load the character (Bobo). Resolves with a ready character (idle playing). */
export function loadBear(opts?: LoadBoboOptions): Promise<BearCharacter> {
  return Bobo.load(opts);
}
