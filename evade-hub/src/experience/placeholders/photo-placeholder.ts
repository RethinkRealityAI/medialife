// Placeholder Photo mode (runs until src/experience/modes/photo/index.ts exists). Proves the capture path: back
// camera, the shutter in the bottom-centre slot, an engine screenshot (camera + 3D), handed to the app as a photo.
import type { ExperienceMode } from '../../shared/contracts';
import type { Mode, ModeContext } from '../types';

export function createPhotoPlaceholder(ctx: ModeContext): Mode {
  let shutter: HTMLButtonElement | null = null;
  let busy = false;

  const shoot = async () => {
    if (busy) return;
    busy = true;
    try {
      ctx.hud.flash();
      const img = await ctx.engine.screenshot();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d')!.drawImage(img, 0, 0);
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.9));
      if (blob) {
        ctx.capture(blob);
        ctx.hud.toast('Photo taken!');
      }
    } catch (e) {
      console.warn('[experience] photo failed', e);
      ctx.hud.toast('That photo did not work');
    } finally {
      busy = false;
    }
  };

  return {
    id: 'photo' as ExperienceMode,
    camera: 'world',
    enter() {
      shutter = ctx.hud.shutter(() => void shoot());
      ctx.hud.centre.appendChild(shutter);
      ctx.hud.hint('3D photo: coming soon');
    },
    exit() {
      shutter?.remove();
      shutter = null;
      ctx.hud.hint('');
    },
    update() {
      /* nothing moves */
    },
    trigger() {
      return false;
    },
  };
}
