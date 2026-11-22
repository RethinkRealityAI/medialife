// Video clips (Dapo, round 5: "tap for a photo, hold for a video" in every view). The engines hand every finished
// frame to `recorder.frame(canvas)` straight after drawing it (the XR pipeline's onRender, the 3D view's render), so
// the WebGL canvas is still valid without preserveDrawingBuffer. While a clip runs, each frame is copied onto a 2D
// canvas (with the live filter and the overlay art, drawn once into a cache), which a MediaRecorder encodes.
// The same hook takes single stills for views that have no engine screenshot (the 3D view): `recorder.still()`.
import type { OverlayFn } from './compose';

export const CLIP_MAX_S = 30;
const LONG_EDGE = 1280;
const STILL_EDGE = 1920;
const TYPES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

export interface ClipOptions {
  /** Brand art over the video (drawn once at the clip's size). */
  overlay?: OverlayFn;
  /** 2D canvas filter string (the live look), e.g. 'grayscale(1)'. */
  filter?: string;
  /** A flat tint over the picture (the Gold / Eclipse filters), e.g. 'rgba(42,91,215,0.18)'. */
  tint?: string;
  /** Called every ~100 ms with seconds recorded (for the ring). */
  onTick?: (s: number) => void;
  /** The clip stopped by itself (time limit): the blob, or null when nothing usable was recorded. */
  onAutoStop?: (blob: Blob | null) => void;
}

class Recorder {
  private c: HTMLCanvasElement | null = null;
  private g: CanvasRenderingContext2D | null = null;
  private cache: HTMLCanvasElement | null = null;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private o: ClipOptions | null = null;
  private t0 = 0;
  private tickT = 0;
  private done: ((b: Blob | null) => void) | null = null;
  private stillWant: ((c: HTMLCanvasElement | null) => void) | null = null;
  private stillT = 0;
  private type = '';

  get supported(): boolean {
    return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function' && !!this.pickType();
  }
  get recording(): boolean {
    return !!this.o;
  }
  get seconds(): number {
    return this.o && this.t0 ? (performance.now() - this.t0) / 1000 : 0;
  }

  private pickType(): string {
    if (typeof MediaRecorder === 'undefined') return '';
    for (const t of TYPES) {
      try { if (MediaRecorder.isTypeSupported(t)) return t; } catch { /* keep looking */ }
    }
    return '';
  }

  /** Start a clip; frames arrive through frame(). Returns false when this browser can't record. */
  start(o: ClipOptions): boolean {
    if (this.o || !this.supported) return false;
    this.o = o;
    this.chunks = [];
    this.t0 = 0;
    return true;
  }

  /** Stop and get the clip (null when it was too short or failed). */
  stop(): Promise<Blob | null> {
    if (!this.o) return Promise.resolve(null);
    return new Promise((resolve) => {
      const rec = this.rec;
      this.o = null;
      if (!rec || rec.state === 'inactive') { this.reset(); resolve(null); return; }
      this.done = resolve;
      try { rec.requestData(); } catch { /* some browsers */ }
      rec.stop();
    });
  }

  /** The next frame as a canvas (a still for views without an engine screenshot). */
  still(): Promise<HTMLCanvasElement | null> {
    return new Promise((resolve) => {
      this.stillWant?.(null);
      this.stillWant = resolve;
      clearTimeout(this.stillT);
      this.stillT = window.setTimeout(() => { if (this.stillWant === resolve) { this.stillWant = null; resolve(null); } }, 1500);
    });
  }

  /** Called by the engines right after each frame is drawn. Cheap when idle. */
  frame(src: HTMLCanvasElement): void {
    if (this.stillWant) {
      const want = this.stillWant;
      this.stillWant = null;
      clearTimeout(this.stillT);
      want(copy(src, STILL_EDGE));
    }
    const o = this.o;
    if (!o || !src.width || !src.height) return;
    if (!this.rec) this.begin(src, o);
    const g = this.g, c = this.c;
    if (!g || !c) return;
    if (o.filter) g.filter = o.filter;
    g.drawImage(src, 0, 0, c.width, c.height);
    if (o.filter) g.filter = 'none';
    if (o.tint) { g.fillStyle = o.tint; g.fillRect(0, 0, c.width, c.height); }
    if (this.cache) g.drawImage(this.cache, 0, 0);
    const now = performance.now();
    if (now - this.tickT > 100) { this.tickT = now; o.onTick?.(this.seconds); }
    if (this.seconds >= CLIP_MAX_S) {
      const cb = o.onAutoStop;
      void this.stop().then((b) => cb?.(b));
    }
  }

  private begin(src: HTMLCanvasElement, o: ClipOptions): void {
    const k = Math.min(1, LONG_EDGE / Math.max(src.width, src.height));
    const w = even(src.width * k), h = even(src.height * k);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    this.c = c;
    this.g = c.getContext('2d');
    if (o.overlay) {
      const cache = document.createElement('canvas');
      cache.width = w; cache.height = h;
      const cg = cache.getContext('2d');
      if (cg) { try { o.overlay(cg, w, h); } catch (e) { console.warn('[recorder] overlay failed', e); } }
      this.cache = cache;
    }
    this.type = this.pickType();
    try {
      const stream = c.captureStream(30);
      const rec = new MediaRecorder(stream, { mimeType: this.type, videoBitsPerSecond: 6_000_000 });
      rec.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
      rec.onstop = () => {
        const blob = this.chunks.length ? new Blob(this.chunks, { type: this.type.split(';')[0] }) : null;
        const cb = this.done;
        this.reset();
        cb?.(blob && blob.size > 2000 ? blob : null);
      };
      rec.start(250);
      this.rec = rec;
      this.t0 = performance.now();
    } catch (e) {
      console.warn('[recorder] could not start', e);
      const cb = o.onAutoStop;
      this.o = null;
      this.reset();
      cb?.(null);
    }
  }

  private reset(): void {
    this.rec = null;
    this.done = null;
    this.chunks = [];
    if (this.c) this.c.width = this.c.height = 0;
    if (this.cache) this.cache.width = this.cache.height = 0;
    this.c = this.cache = null;
    this.g = null;
    this.t0 = 0;
  }
}

function even(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2);
}

function copy(src: HTMLCanvasElement, edge: number): HTMLCanvasElement | null {
  if (!src.width || !src.height) return null;
  const k = Math.min(1, edge / Math.max(src.width, src.height));
  const c = document.createElement('canvas');
  c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
  c.getContext('2d')?.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** File extension for a clip blob. */
export function clipExt(blob: Blob): string {
  return /mp4/.test(blob.type) ? 'mp4' : 'webm';
}

export const recorder = new Recorder();

/**
 * A shutter's press-and-hold video, wired to a view: `can()` says whether it may record now, `options()` gives the
 * clip's overlay and look at the moment recording starts, `onStart` / `onDone` let the view tuck its UI and show
 * the review (blob null = too short or failed).
 */
export function clipHold(v: {
  can(): boolean;
  options?(): Omit<ClipOptions, 'onAutoStop' | 'onTick'>;
  onStart?(): void;
  onDone(blob: Blob | null): void;
}): { start(): boolean; stop(): void } {
  let live = false;
  const finish = (b: Blob | null) => { if (!live) return; live = false; v.onDone(b); };
  return {
    start() {
      if (!v.can() || !recorder.supported) return false;
      if (!recorder.start({ ...(v.options?.() ?? {}), onAutoStop: finish })) return false;
      live = true;
      v.onStart?.();
      return true;
    },
    stop() {
      if (!live) return;
      void recorder.stop().then(finish);
    },
  };
}
