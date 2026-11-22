// ExperienceApi.command(): things you can tell the experience to do by voice (hold-to-talk) or from the app.
// (voice-3) Kept in its own file so the experience entry only needs one delegating line.
//
//   1. the active mode's own `command(name)` gets the first go (games and future modes plug in here);
//   2. otherwise we PRESS the mode's existing on-screen button, so a voice command runs exactly the code a tap runs:
//        capture -> the shutter (`.cbx-shutter`) in the bottom centre slot
//        place   -> the button tagged data-cmd="place" (AR / Photo "Place Happi")
//        move    -> the button tagged data-cmd="move" (Move, bottom left)
//      A hidden or disabled button means "not now": false, nothing happens.
//   3. hug -> the same squeeze + ring of hearts as a long press on her (3D, and AR once placed).
import type { ExperienceCommand } from '../shared/contracts';
import { hugBear } from './physics/toss';
import type { MomentRunner } from './scene/moments';
import type { Stage } from './scene/stage';
import type { Mode } from './types';

export interface CommandScene {
  stages: { showcase: Stage; ar: Stage } | null;
  runners: { showcase: MomentRunner; ar: MomentRunner } | null;
  reduced: boolean;
}

/** The on-screen button a command presses, if this mode shows a usable one right now. */
function buttonFor(name: ExperienceCommand, root: HTMLElement): HTMLButtonElement | null {
  const selector = name === 'capture' ? '.cbx-shutter' : name === 'place' || name === 'move' ? `[data-cmd="${name}"]` : null;
  if (!selector) return null;
  return [...root.querySelectorAll<HTMLButtonElement>(selector)].find(usable) ?? null;
}

/** True when the mode shows a usable button for `name` (capture / place / move). Runs nothing. */
export function modeCanCommand(name: ExperienceCommand, root: HTMLElement): boolean {
  return !!buttonFor(name, root);
}

export function runModeCommand(name: ExperienceCommand, mode: Mode, root: HTMLElement, scene: CommandScene): boolean {
  try {
    if (mode.command?.(name)) return true;
  } catch (e) {
    console.error('[experience] command failed', name, e);
    return false;
  }
  if (name === 'hug') return hug(mode, scene);
  const btn = buttonFor(name, root);
  if (!btn) return false;
  btn.click();
  return true;
}

function usable(b: HTMLButtonElement): boolean {
  if (b.disabled || b.getAttribute('aria-disabled') === 'true' || !b.isConnected) return false;
  if (!b.getClientRects().length) return false; // display: none (or not in the layout)
  for (let el: HTMLElement | null = b; el; el = el.parentElement) {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0 || cs.pointerEvents === 'none' && el === b) return false;
  }
  return true;
}

function hug(mode: Mode, scene: CommandScene): boolean {
  if (!scene.stages || !scene.runners) return false;
  if (mode.id === 'showcase') {
    hugBear(scene.stages.showcase, scene.runners.showcase, scene.reduced);
    return true;
  }
  if (mode.id === 'ar' && (mode as Mode & { placed?: boolean }).placed) {
    hugBear(scene.stages.ar, scene.runners.ar, scene.reduced);
    return true;
  }
  return false;
}
