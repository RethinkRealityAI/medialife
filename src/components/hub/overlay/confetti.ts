/**
 * A tiny canvas particle engine for the Live Drop overlay: sparkle bursts for
 * order alerts and a confetti storm for "goal smashed".
 *
 * Built to sit in an OBS browser source for hours: one canvas, a fixed-size
 * particle pool that never grows past MAX, and a requestAnimationFrame loop that
 * only runs while particles are alive (an idle overlay costs nothing). Colours
 * are plain hex strings — no oklch, no shadowBlur (both slow or unsupported in
 * the Chromium builds streaming apps embed).
 */

const MAX = 700;

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  color: string;
  /** Seconds lived / seconds to live. */
  age: number;
  life: number;
  /** 0 confetti ribbon, 1 sparkle star, 2 dot. */
  kind: 0 | 1 | 2;
  /** Flutter phase for ribbons. */
  phase: number;
  gravity: number;
  drag: number;
};

export type BurstOptions = {
  count?: number;
  colors: string[];
  /** Initial speed in px/s. */
  speed?: number;
  /** Direction in radians (0 = right, -PI/2 = up) and spread around it. */
  angle?: number;
  spread?: number;
  /** Mix of particle kinds. */
  sparkle?: boolean;
  confetti?: boolean;
  gravity?: number;
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

export class ParticleField {
  private ctx: CanvasRenderingContext2D | null;
  private parts: Particle[] = [];
  private raf = 0;
  private last = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private dead = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d");
  }

  get active() {
    return this.parts.length;
  }

  burst(x: number, y: number, o: BurstOptions) {
    if (this.dead || !this.ctx) return;
    const count = Math.min(o.count ?? 40, MAX - this.parts.length);
    const speed = o.speed ?? 520;
    const angle = o.angle ?? -Math.PI / 2;
    const spread = o.spread ?? Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const a = angle + rand(-spread / 2, spread / 2);
      const s = speed * rand(0.35, 1);
      const kind: Particle["kind"] =
        o.confetti && (!o.sparkle || Math.random() < 0.7)
          ? 0
          : o.sparkle
            ? Math.random() < 0.55
              ? 1
              : 2
            : 2;
      this.parts.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        rot: rand(0, Math.PI * 2),
        vr: rand(-9, 9),
        w: kind === 0 ? rand(10, 18) : kind === 1 ? rand(9, 17) : rand(3, 6),
        h: kind === 0 ? rand(5, 9) : 0,
        color: pick(o.colors),
        age: 0,
        life: kind === 0 ? rand(3.2, 5.2) : rand(0.8, 1.6),
        kind,
        phase: rand(0, Math.PI * 2),
        gravity: o.gravity ?? (kind === 0 ? 900 : 380),
        drag: kind === 0 ? 1.6 : 2.4,
      });
    }
    this.start();
  }

  /** The big one: two cannons from the bottom corners, then a shower from the top. */
  celebrate(width: number, height: number, colors: string[]) {
    const fire = (fn: () => void, ms: number) => {
      const t = setTimeout(() => {
        this.timers.delete(t);
        fn();
      }, ms);
      this.timers.add(t);
    };
    const cannons = (n: number) => {
      this.burst(-10, height * 0.92, {
        count: n,
        colors,
        speed: 1900,
        angle: -Math.PI / 3.1,
        spread: 0.55,
        confetti: true,
        sparkle: true,
      });
      this.burst(width + 10, height * 0.92, {
        count: n,
        colors,
        speed: 1900,
        angle: -Math.PI + Math.PI / 3.1,
        spread: 0.55,
        confetti: true,
        sparkle: true,
      });
    };
    cannons(110);
    fire(() => cannons(80), 280);
    // a gentle shower from the top, staggered so it never arrives as clumps
    for (let wave = 0; wave < 3; wave++)
      fire(
        () => {
          for (let i = 0; i < 10; i++)
            this.burst(rand(0, width), rand(-60, -10), {
              count: 7,
              colors,
              speed: 220,
              angle: Math.PI / 2,
              spread: 2.4,
              confetti: true,
              gravity: 420,
            });
        },
        600 + wave * 420,
      );
    fire(
      () => this.burst(width / 2, height * 0.42, { count: 90, colors, speed: 900, sparkle: true }),
      120,
    );
  }

  clear() {
    this.parts.length = 0;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.stop();
    this.paintClear();
  }

  destroy() {
    this.clear();
    this.dead = true;
  }

  private start() {
    if (this.raf || this.dead) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private paintClear() {
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private tick = (now: number) => {
    const ctx = this.ctx;
    if (!ctx || this.dead) return;
    // Clamp dt: a backgrounded tab (or OBS hiding the scene) can pause rAF for
    // minutes; resuming must not teleport particles.
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);

    let alive = 0;
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      p.age += dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy = p.vy * k + p.gravity * dt;
      if (p.kind === 0) {
        // ribbons flutter sideways as they fall
        p.phase += dt * 7;
        p.x += (p.vx + Math.sin(p.phase) * 40) * dt;
      } else {
        p.x += p.vx * dt;
      }
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.age >= p.life || p.y > H + 60 || p.x < -80 || p.x > W + 80) continue;
      this.parts[alive++] = p;

      const t = p.age / p.life;
      ctx.globalAlpha = t > 0.75 ? Math.max(0, (1 - t) / 0.25) : 1;
      ctx.fillStyle = p.color;
      if (p.kind === 0) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        // fake 3D tumble: squash one axis with the flutter phase
        ctx.scale(1, Math.cos(p.phase * 0.9));
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      } else if (p.kind === 1) {
        const r = p.w * (1 - t * 0.5);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot * 0.3);
        ctx.beginPath();
        // four-point star
        ctx.moveTo(0, -r);
        ctx.quadraticCurveTo(0, 0, r, 0);
        ctx.quadraticCurveTo(0, 0, 0, r);
        ctx.quadraticCurveTo(0, 0, -r, 0);
        ctx.quadraticCurveTo(0, 0, 0, -r);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.w * (1 - t * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    this.parts.length = alive;
    ctx.globalAlpha = 1;

    if (alive > 0) {
      this.raf = requestAnimationFrame(this.tick);
    } else {
      this.raf = 0;
      this.paintClear();
    }
  };
}
