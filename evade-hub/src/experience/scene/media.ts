// The theme song video that plays on the TVs (party, inside the house). The old keyed-green portal swirl
// (public/media/portal.mp4) is no longer loaded: her doorway is a real walk-through room now (scene/house).
// Video elements live in the document with playsinline set before src (iOS shows off-document videos black). The theme is "primed" inside the Start tap so it may play with sound later.
import * as THREE from 'three';
import { makeVideo } from './fx';

export class Media {
  readonly theme: HTMLVideoElement;
  readonly themeTexture: THREE.VideoTexture;
  private primed = false;
  private themeUsers = new Set<string>();
  private fade = 0;
  private fadeTimer = 0;
  /** The theme may play with sound (the Start tap unlocked it). */
  soundOk = false;

  constructor() {
    this.theme = makeVideo('/evade/hub/media/theme.mp4', { loop: true, muted: true });
    this.theme.volume = 0.6;
    this.themeTexture = new THREE.VideoTexture(this.theme);
    this.themeTexture.colorSpace = THREE.SRGBColorSpace;
    this.themeTexture.minFilter = THREE.LinearFilter;
    this.themeTexture.generateMipmaps = false;
    // the theme is 4:3 pillarboxed in a 16:9 frame: show the middle 75 % on the (4:3-ish) TV screens
    this.themeTexture.repeat.set(0.75, 1);
    this.themeTexture.offset.set(0.125, 0);
  }

  /** Resolves when the theme can show a first frame (or after `ms`). For the loading bar. */
  ready(ms = 8000): Promise<void> {
    const one = (v: HTMLVideoElement) =>
      v.readyState >= 2
        ? Promise.resolve()
        : new Promise<void>((r) => {
            v.addEventListener('loadeddata', () => r(), { once: true });
            v.addEventListener('error', () => r(), { once: true });
          });
    return Promise.race([
      one(this.theme),
      new Promise<void>((r) => window.setTimeout(r, ms)),
    ]);
  }

  /** Call inside the Start tap: unlocks the theme (and its sound) for later play() without a gesture. */
  prime(): void {
    if (this.primed) return;
    this.primed = true;
    // play() unmuted inside the gesture marks the element as allowed to make sound later; pausing at once keeps it
    // silent (iOS ignores volume, so a volume-0 trick would blip). An AbortError just means "paused before it began".
    const t = this.theme;
    t.muted = false;
    const p = t.play();
    t.pause();
    this.soundOk = true;
    if (p) p.catch((e: unknown) => {
      const name = (e as { name?: string } | null)?.name;
      if (name === 'NotAllowedError') {
        this.soundOk = false;
        t.muted = true;
      }
    });
  }

  /** Start the theme for a user ('party', 'inside'). Fades in. Plays muted if sound is not allowed. */
  playTheme(user: string, fromStart = false): void {
    const first = this.themeUsers.size === 0;
    this.themeUsers.add(user);
    const t = this.theme;
    window.clearInterval(this.fadeTimer);
    if (first && fromStart) t.currentTime = 0;
    t.muted = !this.soundOk;
    this.fadeTo(0.6, first ? 0.6 : 0.2, first);
    const p = t.play();
    if (p) p.catch(() => {
      t.muted = true;
      t.play().catch(() => undefined);
    });
  }

  /** Stop the theme for a user; it fades out when nobody wants it. */
  stopTheme(user: string): void {
    this.themeUsers.delete(user);
    if (this.themeUsers.size) return;
    this.fadeTo(0, 0.8, false, () => {
      if (!this.themeUsers.size) this.theme.pause();
    });
  }

  private fadeTo(target: number, seconds: number, fromZero: boolean, done?: () => void): void {
    const t = this.theme;
    window.clearInterval(this.fadeTimer);
    if (fromZero) t.volume = 0;
    const start = t.volume, t0 = performance.now();
    this.fade = target;
    this.fadeTimer = window.setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / (seconds * 1000));
      try { t.volume = start + (this.fade - start) * k; } catch { /* iOS: volume is read-only, fine */ }
      if (k >= 1) {
        window.clearInterval(this.fadeTimer);
        done?.();
      }
    }, 50);
  }

  /** Pause everything (page hidden, leaving to a camera mode that does not show them). */
  pauseAll(): void {
    this.theme.pause();
  }
  resumeAll(): void {
    if (this.themeUsers.size) this.theme.play().catch(() => undefined);
  }
  get themeOn(): boolean {
    return this.themeUsers.size > 0;
  }
  /** Stop everything and forget users (Start again). */
  reset(): void {
    this.themeUsers.clear();
    window.clearInterval(this.fadeTimer);
    this.theme.pause();
    try { this.theme.currentTime = 0; } catch { /* not loaded */ }
  }

  dispose(): void {
    window.clearInterval(this.fadeTimer);
    this.themeTexture.dispose();
    for (const v of [this.theme]) {
      v.pause();
      v.removeAttribute('src');
      v.load();
      v.remove();
    }
  }
}
