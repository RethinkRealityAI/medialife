// A small timeline / tween helper for the scene moments (ports the Mattercraft timelines' keyframes and timings).
//
//   const tl = new Timeline()
//     .tween(0, 0.5, (k) => house.scale.setScalar(k), ease.backOut)   // start s, duration s, progress 0..1
//     .at(1.2, () => bear.play('wave', { once: true }))                // a cue
//     .tween(2, 1, (k) => ..., ease.inOut);
//   tl.update(dt) every frame; tl.done is true after the last item; tl.finish() jumps to the end.
import * as THREE from 'three';

export type Ease = (x: number) => number;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export const ease = {
  linear: ((x) => clamp01(x)) as Ease,
  in: ((x) => clamp01(x) ** 3) as Ease,
  out: ((x) => 1 - (1 - clamp01(x)) ** 3) as Ease,
  inOut: ((x) => {
    x = clamp01(x);
    return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
  }) as Ease,
  /** Overshoots a little and settles (pop-ins). */
  backOut: ((x) => {
    const c = 1.70158;
    x = clamp01(x) - 1;
    return 1 + (c + 1) * x * x * x + c * x * x;
  }) as Ease,
  /** Springy (Mattercraft's "elastic" pop). */
  elasticOut: ((x) => {
    x = clamp01(x);
    if (x === 0 || x === 1) return x;
    return 2 ** (-10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  }) as Ease,
  sine: ((x) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(x))) as Ease,
};

interface Item {
  start: number;
  dur: number;
  fn: (k: number, t: number) => void;
  ease: Ease;
  state: 0 | 1 | 2; // not started, running, done
}
interface Cue {
  at: number;
  fn: () => void;
  fired: boolean;
}

export class Timeline {
  t = 0;
  private items: Item[] = [];
  private cues: Cue[] = [];
  private end = 0;
  private stopped = false;
  /** Time scale (reduced motion keeps 1; moments shorten themselves instead). */
  speed = 1;

  /** Run `fn(progress)` from `start` for `dur` seconds. `fn(1)` is always called at the end. */
  tween(start: number, dur: number, fn: (k: number, t: number) => void, easing: Ease = ease.inOut): this {
    this.items.push({ start, dur: Math.max(1e-4, dur), fn, ease: easing, state: 0 });
    this.items.sort((a, b) => a.start - b.start); // stable: same-start items keep their order
    this.end = Math.max(this.end, start + dur);
    return this;
  }

  /** Call `fn` once when the timeline passes `time`. */
  at(time: number, fn: () => void): this {
    this.cues.push({ at: time, fn, fired: false });
    this.cues.sort((a, b) => a.at - b.at); // finish() fires the rest in time order
    this.end = Math.max(this.end, time);
    return this;
  }

  /** Keep the timeline alive until at least `time` (for moments that hold a pose). */
  hold(time: number): this {
    this.end = Math.max(this.end, time);
    return this;
  }

  get duration(): number {
    return this.end;
  }

  get done(): boolean {
    return this.stopped || this.t >= this.end;
  }

  update(dt: number): boolean {
    if (this.stopped) return true;
    this.t += dt * this.speed;
    for (const c of this.cues) {
      if (!c.fired && this.t >= c.at) {
        c.fired = true;
        c.fn();
      }
    }
    for (const it of this.items) {
      if (it.state === 2 || this.t < it.start) continue;
      const raw = (this.t - it.start) / it.dur;
      if (raw >= 1) {
        it.state = 2;
        it.fn(it.ease(1), it.dur);
      } else {
        it.state = 1;
        it.fn(it.ease(raw), this.t - it.start);
      }
    }
    return this.t >= this.end;
  }

  /** Jump to the end: fire the remaining cues and finish every tween (used when a moment is cut short). */
  finish(): void {
    if (this.stopped) return;
    this.t = Math.max(this.t, this.end);
    this.update(0);
    this.stopped = true;
  }

  stop(): void {
    this.stopped = true;
  }

  /**
   * Jump ahead to `time` (cut a long moment to its outro). Cues and tweens that would have happened entirely in the
   * skipped stretch are dropped; tweens running across `time` continue from there.
   */
  skipTo(time: number): void {
    if (this.stopped || time <= this.t) return;
    for (const c of this.cues) if (!c.fired && c.at < time) c.fired = true;
    for (const it of this.items) if (it.state === 0 && it.start + it.dur <= time) it.state = 2;
    this.t = time;
  }
}

/** Sample keyframes `[time, value][]` (times ascending) linearly at time t. Values are numbers or [x, y, z]. */
export function sampleKeys(keys: Array<[number, number]>, t: number): number;
export function sampleKeys(keys: Array<[number, [number, number, number]]>, t: number, out: THREE.Vector3): THREE.Vector3;
export function sampleKeys(
  keys: Array<[number, number] | [number, [number, number, number]]>,
  t: number,
  out?: THREE.Vector3,
): number | THREE.Vector3 {
  let i = 0;
  while (i < keys.length - 1 && t > keys[i + 1][0]) i++;
  const a = keys[i];
  const b = keys[Math.min(i + 1, keys.length - 1)];
  const span = b[0] - a[0];
  const k = span > 0 ? clamp01((t - a[0]) / span) : 1;
  if (typeof a[1] === 'number') return (a[1] as number) + ((b[1] as number) - (a[1] as number)) * k;
  const va = a[1] as [number, number, number];
  const vb = b[1] as [number, number, number];
  return out!.set(va[0] + (vb[0] - va[0]) * k, va[1] + (vb[1] - va[1]) * k, va[2] + (vb[2] - va[2]) * k);
}

/** Exponential smoothing factor for a rate (per second) and dt: `x += (target - x) * damp(8, dt)`. */
export const damp = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);

/** Shortest signed angle from a to b. */
export const angleTo = (a: number, b: number): number => Math.atan2(Math.sin(b - a), Math.cos(b - a));
