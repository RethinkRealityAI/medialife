// The capture button for the 3D and AR views (Dapo, round 5: "we should be able to record in each of these
// scenarios"). Those views keep the joystick bottom centre, so the shutter sits bottom right, under Games and
// Actions (house rule for joystick games: record bottom right, the action buttons stacked above it).
// Tap = a photo of the view as drawn with the parade lockup; press and hold = a video clip with the same lockup.
import type { HudApi } from '../types';
import { compose } from './compose';
import { flash } from './countdown';
import { drawFrameArt, loadFrameArt } from './frame-art';
import { clipHold, recorder } from './recorder';
import { ReviewSheet } from './review';
import { shutterSound } from './sounds';

export class CaptureDock {
  private btn: HTMLButtonElement;
  private review: ReviewSheet;
  private on = false;
  private busy = false;

  constructor(private hud: HudApi, private container: HTMLElement, private onPhoto: (blob: Blob) => void, private reduced: () => boolean) {
    this.review = new ReviewSheet({
      container,
      name: 'happi',
      share: { title: 'Me and Happi', text: 'Me and Happi, the Japan Parade & Street Fair mascot' },
      onRetake: () => { /* back to the view: nothing to undo */ },
    });
    this.btn = hud.shutter(() => void this.photo(), 'Take a photo', clipHold({
      can: () => this.on && !this.busy && !this.review.open,
      options: () => ({ overlay: lockup }),
      onDone: (blob) => {
        if (!this.on) return;
        if (!blob) { this.hud.toast('Hold a little longer for a video', 2000); return; }
        this.review.show(blob);
      },
    }));
    this.btn.classList.add('mini');
    void loadFrameArt();
  }

  /** Show it in the views that have no shutter of their own (3D, AR). */
  show(on: boolean): void {
    this.on = on;
    if (on) { if (this.btn.parentElement !== this.hud.right) this.hud.right.appendChild(this.btn); }
    else {
      this.btn.remove();
      if (recorder.recording) void recorder.stop();
      this.review.close();
    }
  }

  private async photo(): Promise<void> {
    if (!this.on || this.busy || this.review.open) return;
    this.busy = true;
    try {
      flash(this.container, this.reduced());
      shutterSound(this.reduced());
      const shot = await recorder.still();
      if (!shot || !this.on) return;
      const { blob } = await compose(shot, lockup);
      shot.width = shot.height = 0;
      if (!this.on) return;
      this.onPhoto(blob);
      this.review.show(blob);
    } catch (e) {
      console.warn('[capture] photo failed', e);
      this.hud.toast('That photo did not work. Try again?', 2200);
    } finally {
      this.busy = false;
    }
  }
}

function lockup(g: CanvasRenderingContext2D, w: number, h: number): void {
  drawFrameArt(g, w, h, { title: true, titleWidth: 0.3, titleAt: 'bottom-left', frame: 'clean' });
}
