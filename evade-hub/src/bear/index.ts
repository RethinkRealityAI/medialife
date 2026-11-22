// Entry point of the character module (see src/shared/contracts.ts).
//
//   import { loadBear, unlockAudio } from '@/bear';
//   const bear = await loadBear({ onProgress: p => ... });
//   scene.add(bear.object);  // feet on y = 0, facing +z, bear.height metres tall
//   renderer.setAnimationLoop(() => { bear.update(clock.getDelta()); renderer.render(scene, camera); });
//   // in a tap:   unlockAudio();
//   // on a call:  bear.setSpeechStream(remoteStream);
import type { BearCharacter } from '../shared/contracts';
import type { LoadBearOptions } from './Bear';
import { Happi, HAPPI_MODEL_URL } from '../happi/Happi';

export { unlockAudio } from '../audio/context';
export type { LoadBearOptions } from './Bear';
export { Bear } from './Bear';
export { Happi } from '../happi/Happi';

/** URL of the one character model used everywhere (Happi in this build). */
export const BEAR_MODEL_URL = HAPPI_MODEL_URL;

/** Load the character (Happi). Resolves with a ready character (idle playing, face alive). */
export function loadBear(opts?: LoadBearOptions): Promise<BearCharacter> {
  return Happi.load(opts);
}
