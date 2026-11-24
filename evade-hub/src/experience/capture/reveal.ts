// "Watch photo animation": Happi's reveal clip (CB-reveal-green, transcoded to /media/capture/reveal.mp4) with the
// user's photo put into the picture frame she ends up holding. The old Mattercraft scene keyed nothing (similarity 0):
// it laid the photo over the frame's opening for the last 0.75 s (RevealPhoto, 9051 -> 9804 ms) and held there. We do
// the same on a 2D canvas, measured on the clip's frames: the opening is x 505-1000, y 875-1495 of 1080x1920 and the
// pose is still from 9.2 s. Her left paw overlaps the opening, so the paw's pink pixels are drawn back on top.
// Also "Behind the scenes" (bts-cheerbear.mp4) with the user's photo in the frame she holds (tracked, bts-track.ts).
import { drawCover } from './compose';
import { saveBlob } from './share';
import { BTS_TRACK } from './bts-track';
import { actionButton, CICON, el, iconButton } from './ui';

const SRC = { w: 1080, h: 1920 };
const OPENING = { x: 505, y: 875, w: 495, h: 620 }; // in SRC pixels
const PAW = { x: 420, y: 1270, w: 230, h: 250 }; // where the paw can cover the opening (SRC pixels)
const FADE_IN = { at: 9.05, dur: 0.6 };

export const REVEAL_URL = '/evade/hub/media/capture/reveal.mp4';
export const BTS_URL = '/evade/hub/media/capture/bts.mp4';

function makeVideo(src: string): HTMLVideoElement {
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.setAttribute('playsinline', '');
  v.setAttribute('webkit-playsinline', '');
  v.preload = 'auto';
  v.crossOrigin = 'anonymous';
  v.src = src;
  return v;
}

function freeVideo(v: HTMLVideoElement | null): void {
  if (!v) return;
  try { v.pause(); } catch { /* none */ }
  v.removeAttribute('src');
  try { v.load(); } catch { /* none */ }
  v.remove();
}

export class RevealPlayer {
  private node: HTMLElement | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private photo: HTMLImageElement | null = null;
  private photoUrl: string | null = null;
  private raf = 0;
  private endBar: HTMLElement | null = null;
  private skipBtn: HTMLButtonElement | null = null;
  private paw: HTMLCanvasElement | null = null;
  private status: HTMLElement | null = null;
  /** Test hook: the last drawn frame's state. */
  readonly diag = { frames: 0, photoAlpha: 0, ended: false };

  constructor(private container: HTMLElement, private name: string) {}

  get open(): boolean {
    return !!this.node;
  }

  /** Play the reveal with `blob` in the frame. Call from a tap. */
  play(blob: Blob): void {
    this.close();
    const n = el('div', 'cbc-player');
    n.setAttribute('role', 'dialog');
    n.setAttribute('aria-modal', 'true');
    n.setAttribute('aria-label', 'Photo animation');
    const stage = el('div', 'cbc-pl-stage');
    const c = el('canvas');
    c.width = 720;
    c.height = 1280;
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', 'Your photo goes into the picture frame');
    stage.appendChild(c);
    const close = iconButton(CICON.close, 'Close the animation', () => this.close(), 'cbc-pl-close');
    this.skipBtn = actionButton('Skip', CICON.skip, () => this.skip(), 'ghost');
    this.skipBtn.classList.add('cbc-pl-skip');
    const bar = el('div', 'cbc-pl-bar');
    bar.hidden = true;
    bar.append(
      actionButton('Save picture', CICON.save, () => this.saveStill()),
      actionButton('Replay', CICON.replay, () => this.replay(), 'alt'),
    );
    this.status = el('p', 'cbc-status light');
    this.status.setAttribute('role', 'status');
    bar.append(this.status);
    n.append(stage, close, this.skipBtn, bar);
    this.container.appendChild(n);
    this.node = n;
    this.canvas = c;
    this.endBar = bar;

    this.photoUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.src = this.photoUrl;
    this.photo = img;

    const v = makeVideo(REVEAL_URL);
    v.style.cssText = 'position:absolute;width:2px;height:2px;opacity:0;pointer-events:none;left:0;top:0';
    n.appendChild(v); // iOS: a video must be in the document to decode frames for drawImage
    this.video = v;
    v.addEventListener('ended', () => this.onEnded());
    void v.play().catch(() => {
      // autoplay refused (should not happen: muted + inside a tap): show the end frame anyway
      this.onEnded();
    });
    const loop = () => {
      this.draw();
      if (!this.diag.ended) this.raf = requestAnimationFrame(loop);
    };
    this.diag.frames = 0;
    this.diag.ended = false;
    this.raf = requestAnimationFrame(loop);
    close.focus({ preventScroll: true });
  }

  private draw(): void {
    const v = this.video, c = this.canvas;
    if (!v || !c) return;
    const g = c.getContext('2d')!;
    if (v.readyState >= 2) {
      g.drawImage(v, 0, 0, c.width, c.height);
      this.diag.frames++;
    } else if (this.diag.frames === 0) {
      g.fillStyle = '#d4edff';
      g.fillRect(0, 0, c.width, c.height);
    }
    const t = this.diag.ended ? 99 : v.currentTime;
    const a = Math.max(0, Math.min(1, (t - FADE_IN.at) / FADE_IN.dur));
    this.diag.photoAlpha = a;
    if (a > 0 && v.readyState >= 2) this.drawPhoto(g, c, v, a);
  }

  private drawPhoto(g: CanvasRenderingContext2D, c: HTMLCanvasElement, v: HTMLVideoElement, a: number): void {
    const p = this.photo;
    if (!p || !p.complete || !p.naturalWidth) return;
    const kx = c.width / SRC.w, ky = c.height / SRC.h;
    const r = { x: OPENING.x * kx, y: OPENING.y * ky, w: OPENING.w * kx, h: OPENING.h * ky };
    g.save();
    g.globalAlpha = a;
    // faces sit in the upper part of a portrait selfie: bias the crop up
    drawCover(g, p, p.naturalWidth, p.naturalHeight, r.x, r.y, r.w, r.h, -0.4);
    g.restore();
    // her paw goes back on top: copy its pink pixels from this video frame
    const pw = Math.round(PAW.w * kx), phh = Math.round(PAW.h * ky);
    const px = Math.round(PAW.x * kx), py = Math.round(PAW.y * ky);
    if (!this.paw) {
      this.paw = document.createElement('canvas');
      this.paw.width = pw;
      this.paw.height = phh;
    }
    const pg = this.paw.getContext('2d', { willReadFrequently: true })!;
    pg.clearRect(0, 0, pw, phh);
    pg.drawImage(v, (px / c.width) * v.videoWidth, (py / c.height) * v.videoHeight, (pw / c.width) * v.videoWidth, (phh / c.height) * v.videoHeight, 0, 0, pw, phh);
    try {
      const d = pg.getImageData(0, 0, pw, phh);
      const q = d.data;
      for (let i = 0; i < q.length; i += 4) {
        const R = q[i], G = q[i + 1], B = q[i + 2];
        const pink = R > 165 && R - G > 55 && B > 85;
        q[i + 3] = pink ? 255 : 0;
      }
      pg.putImageData(d, 0, 0);
      g.drawImage(this.paw, px, py);
    } catch { /* tainted (should not happen: same origin) */ }
  }

  private onEnded(): void {
    if (!this.node) return;
    this.diag.ended = true;
    cancelAnimationFrame(this.raf);
    this.draw();
    if (this.endBar) this.endBar.hidden = false;
    if (this.skipBtn) this.skipBtn.hidden = true;
    (this.endBar?.firstElementChild as HTMLElement | null)?.focus({ preventScroll: true });
  }

  private skip(): void {
    const v = this.video;
    if (!v) return;
    try {
      v.currentTime = Math.max(0, (v.duration || 10.06) - 0.05);
    } catch { /* not seekable yet */ }
    v.pause();
    // wait for the seek so the last frame is drawn
    const done = () => this.onEnded();
    v.addEventListener('seeked', done, { once: true });
    window.setTimeout(done, 700);
  }

  private replay(): void {
    const v = this.video;
    if (!v) return;
    this.diag.ended = false;
    if (this.endBar) this.endBar.hidden = true;
    if (this.skipBtn) this.skipBtn.hidden = false;
    v.currentTime = 0;
    void v.play().catch(() => this.onEnded());
    const loop = () => {
      this.draw();
      if (!this.diag.ended) this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private saveStill(): void {
    const c = this.canvas;
    if (!c) return;
    c.toBlob((b) => {
      if (!b || !this.status) return;
      this.status.textContent = saveBlob(b, `${this.name}-reveal.jpg`) ? 'Saved to your downloads' : 'Could not save that one';
    }, 'image/jpeg', 0.9);
  }

  close(): void {
    cancelAnimationFrame(this.raf);
    freeVideo(this.video);
    this.video = null;
    this.node?.remove();
    this.node = null;
    if (this.canvas) this.canvas.width = this.canvas.height = 0;
    this.canvas = null;
    if (this.paw) this.paw.width = this.paw.height = 0;
    this.paw = null;
    if (this.photoUrl) URL.revokeObjectURL(this.photoUrl);
    this.photoUrl = null;
    this.photo = null;
    this.endBar = null;
    this.skipBtn = null;
    this.status = null;
    this.diag.ended = false;
  }
}

/** Behind the scenes: the studio clip, full screen, closable. With a photo, it sits in the frame she holds (tracked). */
export class BtsPlayer {
  private node: HTMLElement | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private photo: HTMLImageElement | null = null;
  private photoUrl: string | null = null;
  private paw: HTMLCanvasElement | null = null;
  private raf = 0;
  private vfc = 0;
  /** Test hook. */
  readonly diag = { frames: 0, photoFrames: 0, lastIndex: -1 };

  constructor(private container: HTMLElement) {}

  get open(): boolean {
    return !!this.node;
  }
  get playing(): boolean {
    return !!this.video && !this.video.paused;
  }

  /** Call from a tap. `photo`: the user's photo, put into the picture frame Happi holds in the clip. */
  play(photo?: Blob | null): void {
    this.close();
    const n = el('div', 'cbc-player');
    n.setAttribute('role', 'dialog');
    n.setAttribute('aria-modal', 'true');
    n.setAttribute('aria-label', 'Behind the scenes');
    const stage = el('div', 'cbc-pl-stage bts');
    const v = makeVideo(BTS_URL);
    v.controls = false;
    if (photo) {
      const c = el('canvas');
      c.width = BTS_TRACK.size[0];
      c.height = BTS_TRACK.size[1];
      c.setAttribute('role', 'img');
      c.setAttribute('aria-label', 'Behind the scenes, holding your photo');
      stage.appendChild(c);
      v.style.cssText = 'position:absolute;width:2px;height:2px;opacity:0;pointer-events:none;left:0;top:0';
      n.appendChild(v); // iOS: in the document, or drawImage gets no frames
      this.canvas = c;
      this.photoUrl = URL.createObjectURL(photo);
      const img = new Image();
      img.src = this.photoUrl;
      this.photo = img;
    } else {
      v.setAttribute('aria-label', 'Behind the scenes');
      stage.appendChild(v);
    }
    const close = iconButton(CICON.close, 'Close', () => this.close(), 'cbc-pl-close');
    const bar = el('div', 'cbc-pl-bar');
    bar.hidden = true;
    bar.append(actionButton('Replay', CICON.replay, () => { bar.hidden = true; v.currentTime = 0; void v.play(); this.loop(); }, 'alt'));
    v.addEventListener('ended', () => { bar.hidden = false; this.draw(); });
    n.append(stage, close, bar);
    this.container.appendChild(n);
    this.node = n;
    this.video = v;
    this.diag.frames = this.diag.photoFrames = 0;
    v.muted = false; // the clip has no sound; unmuted play inside the tap is allowed anyway
    void v.play().catch(() => { v.muted = true; void v.play().catch(() => { bar.hidden = false; }); });
    if (this.canvas) this.loop();
    close.focus({ preventScroll: true });
  }

  private loop(): void {
    const v = this.video as (HTMLVideoElement & { requestVideoFrameCallback?(cb: (now: number, m: { mediaTime: number }) => void): number }) | null;
    if (!v || !this.canvas) return;
    cancelAnimationFrame(this.raf);
    if (v.requestVideoFrameCallback) {
      const step = (_n: number, m: { mediaTime: number }) => {
        this.draw(m.mediaTime);
        if (this.node && !v.ended) this.vfc = v.requestVideoFrameCallback!(step);
      };
      this.vfc = v.requestVideoFrameCallback(step);
    } else {
      const step = () => {
        this.draw();
        if (this.node && !v.ended) this.raf = requestAnimationFrame(step);
      };
      this.raf = requestAnimationFrame(step);
    }
  }

  private draw(mediaTime?: number): void {
    const v = this.video, c = this.canvas;
    if (!v || !c || v.readyState < 2) return;
    const g = c.getContext('2d')!;
    g.drawImage(v, 0, 0, c.width, c.height);
    this.diag.frames++;
    const T = BTS_TRACK;
    const i = Math.max(0, Math.min(T.frames.length - 1, Math.round((mediaTime ?? v.currentTime) * T.fps)));
    this.diag.lastIndex = i;
    const p = this.photo;
    if (!p || !p.complete || !p.naturalWidth) return;
    const [x, y, s, a] = T.frames[i];
    const [ix0, iy0, ix1, iy1] = T.inner0;
    const [cx0, cy0] = T.centre0;
    g.save();
    g.translate(x, y);
    g.rotate((-a * Math.PI) / 180);
    g.scale(s, s);
    drawCover(g, p, p.naturalWidth, p.naturalHeight, ix0 - cx0, iy0 - cy0, ix1 - ix0, iy1 - iy0, -0.4);
    g.restore();
    this.diag.photoFrames++;
    // her paw holds the picture at its bottom left: copy its pink pixels from this video frame back on top
    const pw = 48, ph = 56;
    const px = Math.round(x + (ix0 - cx0 - 14) * s), py = Math.round(y + (iy1 - cy0 - 40) * s);
    if (!this.paw) { this.paw = document.createElement('canvas'); this.paw.width = pw; this.paw.height = ph; }
    const pg = this.paw.getContext('2d', { willReadFrequently: true })!;
    pg.clearRect(0, 0, pw, ph);
    pg.drawImage(v, px * (v.videoWidth / c.width), py * (v.videoHeight / c.height), pw * (v.videoWidth / c.width), ph * (v.videoHeight / c.height), 0, 0, pw, ph);
    try {
      const d = pg.getImageData(0, 0, pw, ph);
      const q = d.data;
      for (let k = 0; k < q.length; k += 4) {
        const R = q[k], G = q[k + 1], B = q[k + 2];
        q[k + 3] = R > 165 && R - G > 55 && B > 85 ? 255 : 0;
      }
      pg.putImageData(d, 0, 0);
      g.drawImage(this.paw, px, py);
    } catch { /* tainted: same origin, should not happen */ }
  }

  close(): void {
    cancelAnimationFrame(this.raf);
    const v = this.video as (HTMLVideoElement & { cancelVideoFrameCallback?(h: number): void }) | null;
    try { v?.cancelVideoFrameCallback?.(this.vfc); } catch { /* none */ }
    freeVideo(this.video);
    this.video = null;
    this.node?.remove();
    this.node = null;
    if (this.canvas) this.canvas.width = this.canvas.height = 0;
    this.canvas = null;
    if (this.paw) this.paw.width = this.paw.height = 0;
    this.paw = null;
    if (this.photoUrl) URL.revokeObjectURL(this.photoUrl);
    this.photoUrl = null;
    this.photo = null;
  }
}
