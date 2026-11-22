// The splash's cherry-blossom weather: petals float in from above and drift down across the whole splash (over the
// cards and the hero window, never catching taps), tumbling as they fall, on a soft breeze with gusts. Start sends a
// gust that blows them up and away as the cards slide off. Plus cherry branches in the sky card's top corners.
// One 2D canvas, flat colours, DPR capped at 2, runs only while the splash is on screen. Reduced motion: a few slow
// petals, no tumbling, no gust.
import { cherryBranch } from '../experience/capture/frame-art';

const COLS = ['#ffb7c9', '#ffc9d6', '#ff9fbb', '#fff1f5', '#ffd6e0'];
const BACK = ['#f7a3b8', '#f6b6c5', '#f08cab', '#f4dce2', '#f5c3cf']; // the underside, seen mid-tumble

interface Petal {
  x: number; y: number; z: number;
  vx: number; vy: number;
  rot: number; spin: number;
  flip: number; flipV: number;
  sway: number; swayV: number; swayA: number;
  c: number;
}

/** One petal, about 2 units long, base at +y, notched tip at -y. */
const PETAL = (() => {
  const p = new Path2D();
  p.moveTo(0, 1);
  p.bezierCurveTo(-0.78, 0.35, -0.7, -0.92, -0.2, -1);
  p.lineTo(0, -0.74);
  p.lineTo(0.2, -1);
  p.bezierCurveTo(0.7, -0.92, 0.78, 0.35, 0, 1);
  p.closePath();
  return p;
})();

export class PetalField {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private petals: Petal[] = [];
  private raf = 0;
  private last = 0;
  private t = 0;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private gustT = -1;
  private ro: ResizeObserver;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private host: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'sp-petals';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.g = this.canvas.getContext('2d')!;
    host.appendChild(this.canvas);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
  }

  private resize(): void {
    const r = this.host.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return; // not laid out yet: the observer calls again once it is
    const first = this.w < 10;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    const want = this.reduced ? 10 : Math.round(Math.min(70, Math.max(28, (this.w * this.h) / 7500)));
    if (first) this.petals = [];
    while (this.petals.length < want) this.petals.push(this.spawn(true));
    this.petals.length = want;
  }

  /** A new petal above the top (or, now and then, in from the upwind left edge). `intro`: stagger the first wave. */
  private spawn(intro = false): Petal {
    const z = 0.45 + Math.random() * 0.85; // depth: small and slow far away, big and quick up close
    const side = !intro && Math.random() < 0.22;
    return {
      x: side ? -20 : Math.random() * (this.w + 80) - 40,
      y: side ? Math.random() * this.h * 0.6 : intro ? (Math.random() < 0.3 ? Math.random() * this.h * 0.7 : -20 - Math.random() * this.h * 0.5) : -20 - Math.random() * 60,
      z,
      vx: 0, vy: (this.reduced ? 24 : intro ? 200 + Math.random() * 120 : 50) * z, // the first wave floats in quickly, then settles
      rot: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 1.6,
      flip: Math.random() * Math.PI * 2, flipV: 1.4 + Math.random() * 2.2,
      sway: Math.random() * Math.PI * 2, swayV: 0.8 + Math.random() * 0.9, swayA: 14 + Math.random() * 22,
      c: (Math.random() * COLS.length) | 0,
    };
  }

  start(): void {
    if (this.raf) return;
    if (this.w < 10) this.resize();
    this.last = performance.now();
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (this.w < 10) return;
      this.step(dt);
      this.draw();
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Start: a gust lifts the petals up and away to the right as the splash leaves. */
  gust(): void {
    if (this.reduced) return;
    this.gustT = 0;
    for (const p of this.petals) { p.vy -= 120 + Math.random() * 160; p.spin *= 3; p.flipV *= 2; }
  }

  dispose(): void {
    this.stop();
    this.ro.disconnect();
    this.canvas.remove();
  }

  private step(dt: number): void {
    this.t += dt;
    const t = this.t;
    // the breeze: a light steady push to the right with slow swells
    let wind = this.reduced ? 6 : 14 + Math.sin(t * 0.35) * 10 + Math.max(0, Math.sin(t * 0.9 + 1.3)) * 18;
    let lift = 0;
    if (this.gustT >= 0) {
      this.gustT += dt;
      const k = Math.max(0, 1 - this.gustT / 1.4);
      wind += 520 * k;
      lift = 260 * k;
      if (this.gustT > 1.4) this.gustT = -1;
    }
    for (let i = 0; i < this.petals.length; i++) {
      const p = this.petals[i];
      p.sway += p.swayV * dt;
      p.flip += (this.reduced ? 0 : p.flipV) * dt;
      p.rot += p.spin * dt * (this.reduced ? 0.3 : 1);
      const fall = (this.reduced ? 24 : 42 + Math.abs(Math.cos(p.flip)) * 30) * p.z; // edge-on falls faster than flat-on
      p.vy += (fall - p.vy) * Math.min(1, dt * 0.7);
      p.x += (wind * p.z + Math.cos(p.sway) * p.swayA * p.z) * dt;
      p.y += (p.vy - lift * p.z) * dt;
      const out = p.y > this.h + 30 || p.x > this.w + 40 || (this.gustT < 0 && p.y < -this.h * 1.3);
      if (out) this.petals[i] = this.spawn();
    }
  }

  private draw(): void {
    const g = this.g, d = this.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const p of this.petals) {
      if (p.y < -30 || p.x < -30) continue;
      const s = (4.5 + p.z * 7.5) * d; // half-length in px
      const f = Math.cos(p.flip);
      const cr = Math.cos(p.rot), sr = Math.sin(p.rot);
      // rotate, then squash across the petal (the tumble)
      const sx = s * 0.8 * Math.max(0.12, Math.abs(f)), sy = s;
      g.setTransform(cr * sx, sr * sx, -sr * sy, cr * sy, p.x * d, p.y * d);
      g.globalAlpha = Math.min(1, 0.68 + p.z * 0.3);
      g.fillStyle = f >= 0 ? COLS[p.c] : BACK[p.c];
      g.fill(PETAL);
    }
    g.globalAlpha = 1;
  }
}

/** Cherry branches reaching in from the sky card's two top corners (each its own canvas so each can sway). */
export function cornerBranches(host: HTMLElement): void {
  for (const dir of [1, -1] as const) {
    const c = document.createElement('canvas');
    c.className = `sp-branch ${dir > 0 ? 'l' : 'r'}`;
    c.setAttribute('aria-hidden', 'true');
    host.prepend(c);
    const draw = () => {
      const r = host.getBoundingClientRect();
      const d = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width * 0.5)), h = Math.max(1, Math.round(r.height));
      c.width = Math.round(w * d); c.height = Math.round(h * d);
      c.style.width = w + 'px'; c.style.height = h + 'px';
      const g = c.getContext('2d')!;
      g.setTransform(d, 0, 0, d, 0, 0);
      g.clearRect(0, 0, w, h);
      // from the outer top corner, angled down along the side so it frames the lockup instead of crossing it
      const ox = dir > 0 ? 0 : w;
      g.translate(ox, 0); g.rotate(dir * 0.42); g.translate(-ox, 0);
      cherryBranch(g, w, h, dir, dir > 0 ? 0.82 : 0.72, Math.min(w, h * 1.1));
    };
    draw();
    new ResizeObserver(draw).observe(host);
  }
}
