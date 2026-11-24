// The splash's arcade weather: small flat squares ("pixels") in EVADE yellow, cyan and white rise slowly through the
// splash, twinkling, behind the copy and never catching taps. Start sends a burst that scatters them upward as the
// cards slide off. One 2D canvas, flat colours, DPR capped at 2, runs only while the splash is on screen.
// Reduced motion: fewer, slower pixels, no burst travel (softened, never frozen).

const COLS = ['#f6c344', '#4fd6e8', '#ffffff', '#4fd6e8', '#f6c344', '#ff4f9a'];

interface Px { x: number; y: number; s: number; v: number; c: number; tw: number; a: number; vx: number }

export class PixelField {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private px: Px[] = [];
  private raf = 0;
  private last = 0;
  private t = 0;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private burstT = -1;
  private ro: ResizeObserver;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private host: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'sp-petals';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.g = this.canvas.getContext('2d')!;
    host.prepend(this.canvas);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
  }

  private resize(): void {
    const r = this.host.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = r.width; this.h = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    const n = Math.round(Math.min(60, (r.width * r.height) / 12000) * (this.reduced ? 0.5 : 1));
    while (this.px.length < n) this.px.push(this.spawn(true));
    this.px.length = n;
  }

  private spawn(anywhere: boolean): Px {
    const s = 2 + Math.random() * 5;
    return {
      x: Math.random() * this.w, y: anywhere ? Math.random() * this.h : this.h + 10,
      s, v: (8 + Math.random() * 22) * (this.reduced ? 0.5 : 1), c: Math.floor(Math.random() * COLS.length),
      tw: Math.random() * 6, a: 0.25 + Math.random() * 0.5, vx: 0,
    };
  }

  start(): void {
    if (this.raf) return;
    this.burstT = -1;
    this.last = performance.now();
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.step(dt);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Start was tapped: pixels scatter up and fade. */
  burst(): void {
    this.burstT = 0;
    for (const p of this.px) p.vx = (Math.random() - 0.5) * (this.reduced ? 0 : 120);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private step(dt: number): void {
    const g = this.g, d = this.dpr;
    this.t += dt;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    let fade = 1;
    if (this.burstT >= 0) {
      this.burstT += dt;
      fade = Math.max(0, 1 - this.burstT / 0.9);
    }
    for (let i = 0; i < this.px.length; i++) {
      const p = this.px[i];
      const k = this.burstT >= 0 && !this.reduced ? 1 + this.burstT * 14 : 1;
      p.y -= p.v * k * dt;
      p.x += p.vx * dt;
      if (p.y < -10) { if (this.burstT < 0) this.px[i] = this.spawn(false); continue; }
      const tw = 0.6 + 0.4 * Math.sin(this.t * 2.2 + p.tw);
      g.globalAlpha = p.a * tw * fade;
      g.fillStyle = COLS[p.c];
      g.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
    }
    g.globalAlpha = 1;
  }

  dispose(): void {
    this.stop();
    this.ro.disconnect();
    this.canvas.remove();
  }
}
