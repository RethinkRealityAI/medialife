// Bobo's moments as short choreographies on a Timeline: his clip, the props that appear, particles, lighting mood.
// Every moment starts from and returns to a tidy idle, so they can follow each other in any order.
//
//   Bobo's own moves (his real clips): Sit, Chill, Purr, Alert, Excited (Cheer), Sleep / WakeUp, Running (a lap)
//   Little shows: Wave (hello), Sparkle, Dance, Magic (the fizz orb), Party (dance floor, disco ball, balloons)
//
// Runner rules: one moment at a time; up to two wait in a queue (repeats of the same name are ignored); 1.5 s
// cooldown per name; Sleep is a state (Bobo stays asleep until WakeUp, another action, the joystick, or ~30 s); a
// queued action shortens a long moment (Party) to its outro once it has had a few seconds.
import * as THREE from 'three';
import type { BearClip } from '../../shared/contracts';
import { Timeline, ease, sampleKeys } from '../core/timeline';
import type { EmitOptions } from './fx';
import { PAL, RAINBOW } from './fx';
import type { Stage } from './stage';

/** Everything Bobo can do (the Actions sheet, voice/app triggers). 'House', 'Rainbow', 'Stare', 'Cold' are gone. */
export const MOMENT_NAMES = [
  'Wave', 'Sit', 'Chill', 'Purr', 'Alert', 'Cheer', 'Dance', 'Running', 'Sparkle', 'Magic', 'Party', 'Sleep', 'WakeUp',
] as const;
export type MomentName = (typeof MOMENT_NAMES)[number];

const ALIASES: Record<string, MomentName> = {
  wake: 'WakeUp', 'wake up': 'WakeUp', run: 'Running', magicorb: 'Magic', 'magic orb': 'Magic', fizz: 'Magic',
  hello: 'Wave', hi: 'Wave', excited: 'Cheer', nap: 'Sleep', relax: 'Chill', sit: 'Sit', purr: 'Purr', alert: 'Alert',
};
/** Case-insensitive name lookup ('wakeup', 'Wake Up', 'PARTY' ...). Null when unknown. */
export function canonicalMoment(name: string): MomentName | null {
  const n = String(name ?? '').trim().toLowerCase();
  if (!n) return null;
  for (const m of MOMENT_NAMES) if (m.toLowerCase() === n) return m;
  return ALIASES[n] ?? ALIASES[n.replace(/[\s_-]+/g, ' ')] ?? ALIASES[n.replace(/[\s_-]+/g, '')] ?? null;
}

interface MomentDef {
  tl: Timeline;
  /** Put everything this moment touched back (called after the timeline ends or is cut). */
  tidy(): void;
  /** Time of the outro (a queued action may skip to it after `minT`). */
  outro?: number;
  minT?: number;
  /** Turn his to the camera while it plays (default true). */
  faceCam?: boolean;
}

interface Ctx {
  st: Stage;
  /** His spot when the moment started (stage-local, y = 0). */
  A: THREE.Vector3;
  /** Unit XZ vector from him towards the camera, and the side vector (the camera's right as seen from him). */
  f: THREE.Vector3;
  s: THREE.Vector3;
  yawCam: number;
  emit(o: EmitOptions): void;
  reduced: boolean;
  play(clip: BearClip, once?: boolean, speed?: number): void;
  /** One of Bobo's own clips by name (Sit, Chill, Purr, Alert...). */
  move(name: string, once?: boolean, speed?: number): void;
  /** True while the moment is being cut short (spawn nothing new). */
  cut(): boolean;
}

export interface RunnerHost {
  reducedMotion: boolean;
  /** Something needs a moment of quiet (e.g. AR: inside the house the House action opens/closes it instead). */
  intercept?(name: MomentName): boolean;
}

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const yawOf = (d: THREE.Vector3) => Math.atan2(d.x, d.z);

export class MomentRunner {
  private cur: { name: MomentName; def: MomentDef } | null = null;
  private queue: MomentName[] = [];
  private last = new Map<MomentName, number>();
  private cutting = false;
  private sleepT = 0;
  private zT = 0;
  /** Seconds Bobo sleeps before waking up by herself. */
  autoWake = 30;

  constructor(private st: Stage, private host: RunnerHost) {}

  get busy(): boolean {
    return !!this.cur;
  }
  get current(): MomentName | null {
    return this.cur?.name ?? null;
  }
  get asleep(): boolean {
    return this.st.actor.asleep;
  }

  /** Queue or start a moment. Returns false for unknown names (or when ignored as a repeat / cooldown). */
  trigger(name: string): boolean {
    const m = canonicalMoment(name);
    if (!m) return false;
    if (this.host.intercept?.(m)) return true;
    const t = performance.now();
    if (this.cur?.name === m || this.queue.includes(m)) return false; // already happening
    if (t - (this.last.get(m) ?? -1e9) < 1500) return false; // cooldown
    if (m === 'Sleep' && this.asleep && !this.cur) return false; // already asleep
    if (this.queue.length >= 2) this.queue.shift();
    // asleep: anything else wakes his first
    if (this.asleep && m !== 'WakeUp' && m !== 'Sleep' && !this.queue.includes('WakeUp') && this.cur?.name !== 'WakeUp') this.queue.push('WakeUp');
    this.queue.push(m);
    this.last.set(m, t);
    if (!this.cur) this.next();
    return true;
  }

  /** The joystick moved (or Bobo was tapped) while asleep: wake up. */
  nudge(): void {
    if (this.asleep && this.cur?.name !== 'WakeUp' && !this.queue.includes('WakeUp')) {
      this.queue.unshift('WakeUp');
      if (!this.cur) this.next();
    }
  }

  /** Cut whatever is playing and forget the queue (Move, a mode switch, entering the house). Sleep state stays. */
  cancel(): void {
    this.queue.length = 0;
    this.cut();
  }

  /** Start again: everything tidy, awake, normal light. */
  reset(): void {
    this.cancel();
    const a = this.st.actor;
    a.asleep = false;
    a.scripted = 0;
    this.st.resetLayout();
    this.st.media.stopTheme('party');
    a.settle();
    a.face('neutral');
    this.sleepT = 0;
  }

  update(dt: number): void {
    const a = this.st.actor;
    if (this.cur) {
      const { def } = this.cur;
      if (this.queue.length && def.outro !== undefined && def.tl.t >= (def.minT ?? 3) && def.tl.t < def.outro) def.tl.skipTo(def.outro);
      if (def.faceCam !== false) a.turnToPoint(this.st.cam, dt, 5);
      if (def.tl.update(dt)) this.end();
    }
    if (a.asleep) {
      this.sleepT += dt;
      this.zT -= dt;
      if (this.zT <= 0) {
        this.zT = 1.2;
        const p = a.position;
        this.st.fx.emit({ count: 1, glyph: 'z', colors: [PAL.white, PAL.sky], at: v3(p.x + 0.12, 0.62, p.z + 0.05), vel: [0.05, 0.22, 0.02], sway: 0.05, life: [2.4, 2.8], size: [0.1, 0.16], drag: 0.2 });
      }
      if (this.sleepT > this.autoWake && !this.cur && !this.queue.length) this.nudge();
    } else this.sleepT = 0;
  }

  // ------------------------------------------------------------------ internals
  private next(): void {
    const m = this.queue.shift();
    if (!m) return;
    const st = this.st, a = st.actor;
    const A = a.position.clone().setY(0);
    const f = st.cam.clone().sub(A).setY(0);
    if (f.lengthSq() < 1e-6) f.set(0, 0, 1);
    f.normalize();
    const s = v3(f.z, 0, -f.x); // the viewer's right (camera looks along -f)
    const ctx: Ctx = {
      st, A, f, s, yawCam: yawOf(f), reduced: this.host.reducedMotion,
      emit: (o) => { if (!this.cutting) st.fx.emit(o); },
      cut: () => this.cutting,
      play: (clip, once = true, speed = 1) => {
        if (this.cutting) return;
        if (once) void a.once(clip, 6, speed);
        else a.setLoop(clip, 0.25);
      },
      move: (name, once = false, speed = 1) => {
        if (this.cutting) return;
        a.move(name, once, speed);
      },
    };
    a.scripted++;
    a.setLoop('idle', 0.25);
    this.cur = { name: m, def: BUILD[m](ctx) };
  }

  private end(): void {
    const c = this.cur;
    if (!c) return;
    this.cur = null;
    c.def.tidy();
    const a = this.st.actor;
    a.scripted = Math.max(0, a.scripted - 1);
    if (!a.scripted) a.settle();
    if (this.queue.length) this.next();
  }

  private cut(): void {
    if (!this.cur) return;
    this.cutting = true;
    try {
      this.cur.def.tl.finish();
    } finally {
      this.cutting = false;
    }
    this.end();
  }
}

// ==================================================================== the moments
const BUILD: Record<MomentName, (c: Ctx) => MomentDef> = {
  Wave: (c) => {
    const tl = new Timeline();
    const head = c.A.clone().setY(0.95).addScaledVector(c.f, 0.1);
    tl.at(0, () => { c.play('wave'); c.st.actor.face('happy', 3); })
      .at(0.5, () => c.emit({ count: 6, glyph: 'heart', colors: [PAL.pink, PAL.pinkSoft, PAL.red], at: head, spread: [0.25, 0.1, 0.1], vel: [0, 0.35, 0.05], velSpread: [0.15, 0.1, 0.05], life: [1.4, 2], size: [0.08, 0.14], sway: 0.04 }))
      .at(1.4, () => c.emit({ count: 5, glyph: 'heart', colors: [PAL.pink, PAL.pinkSoft], at: head, spread: [0.3, 0.1, 0.1], vel: [0, 0.4, 0.05], velSpread: [0.15, 0.1, 0.05], life: [1.4, 2], size: [0.07, 0.12], sway: 0.04 }))
      .hold(3.2);
    return { tl, tidy: () => undefined };
  },

  Sparkle: (c) => {
    // two sparkle emitters: one low and wide rising slowly, one burst at chest height (EVADE colours, flat)
    const tl = new Timeline();
    const cols = [PAL.sky, PAL.pink, PAL.yellow, PAL.blue, PAL.white];
    tl.at(0, () => { c.play('cheer'); c.st.actor.face('happy', 3); });
    for (let k = 0; k < (c.reduced ? 3 : 6); k++) {
      tl.at(0.15 + k * 0.4, () => c.emit({ count: 22, glyph: ['sparkle', 'star'], colors: cols, at: c.A.clone().setY(0.05), ring: 0.75, spread: [0, 0.05, 0], vel: [0, 0.45, 0], velSpread: [0.12, 0.15, 0.12], life: [1.4, 2.2], size: [0.06, 0.13], drag: 0.3 }));
    }
    tl.at(0.7, () => c.emit({ count: 50, glyph: ['sparkle', 'star', 'dot'], colors: cols, at: c.A.clone().setY(0.6), burst: 1.4, drag: 1.2, gravity: 1.6, life: [1.6, 2.3], size: [0.05, 0.12], floor: 0, bounce: 0.5, rest: 0.6 }))
      .hold(3.5);
    return { tl, tidy: () => undefined };
  },

  Running: (c) => {
    // a lap: a circle beside him, through his spot, then back to face you
    const a = c.st.actor, R = c.st.variant === 'ar' ? 0.7 : 0.9, T = (2 * Math.PI * R) / 1.75;
    const C = c.A.clone().addScaledVector(c.s, R);
    const d0 = c.A.clone().sub(C).normalize();
    const p = v3(), tan = v3();
    let dustT = 0, lastT = 0;
    const tl = new Timeline();
    tl.at(0, () => { c.play('run', false); a.face('happy', T + 1); })
      .tween(0.15, T, (k, t) => {
        const th = -k * Math.PI * 2; // counter-clockwise seen from above: runs off to the viewer's right first
        const cs = Math.cos(th), sn = Math.sin(th);
        p.set(d0.x * cs - d0.z * sn, 0, d0.x * sn + d0.z * cs);
        tan.set(-p.z, 0, p.x).multiplyScalar(-1); // direction of travel (d/dθ with θ decreasing)
        a.position.copy(C).addScaledVector(p, R);
        a.setHeading(yawOf(tan));
        dustT -= t - lastT;
        lastT = t;
        if (dustT <= 0 && k < 0.98) {
          dustT = 0.16;
          c.emit({ count: 2, glyph: 'dot', colors: [PAL.white, PAL.pinkSoft], at: a.position.clone().setY(0.03), spread: [0.05, 0, 0.05], vel: [0, 0.15, 0], velSpread: [0.1, 0.05, 0.1], life: [0.5, 0.8], size: [0.05, 0.09], drag: 2 });
        }
      }, ease.sine)
      .at(0.15 + T, () => { a.position.copy(c.A); c.play('idle', false); })
      .at(0.3 + T, () => c.play('cheer'))
      .hold(T + 2.2);
    return { tl, faceCam: false, tidy: () => a.position.copy(c.A) };
  },

  Sleep: (c) => {
    const a = c.st.actor, tl = new Timeline();
    tl.at(0, () => { a.face('sleepy'); c.st.setMood('sleep'); c.play('sleep', false); a.asleep = true; })
      .at(0.9, () => c.emit({ count: 1, glyph: 'z', colors: [PAL.white], at: c.A.clone().setY(0.62).addScaledVector(c.s, 0.12), vel: [0.05, 0.22, 0.02], sway: 0.05, life: [2.4, 2.8], size: [0.12, 0.16], drag: 0.2 }))
      .hold(2.4);
    return {
      tl,
      tidy: () => {
        // cut before Bobo fell asleep properly: still asleep (the state is the point of Sleep)
        a.asleep = true;
        c.st.setMood('sleep');
      },
    };
  },

  WakeUp: (c) => {
    const a = c.st.actor, tl = new Timeline();
    const was = a.asleep;
    tl.at(0, () => {
      a.asleep = false;
      c.st.setMood('normal');
      a.face(was ? 'surprised' : 'happy', 1.2);
      c.play('wakeUp');
    })
      .at(1.3, () => { a.face('happy', 2); c.emit({ count: 18, glyph: ['sparkle', 'star'], colors: [PAL.yellow, PAL.white, PAL.pinkSoft], at: c.A.clone().setY(0.9), burst: 0.8, drag: 1.5, life: [0.9, 1.4], size: [0.05, 0.1] }); })
      .hold(3);
    return { tl, tidy: () => { a.asleep = false; c.st.setMood('normal'); } };
  },

  Dance: (c) => {
    const a = c.st.actor, tl = new Timeline(), D = 6;
    tl.at(0, () => { c.play('dance', false); a.face('happy', D); });
    for (let t = 0.2; t < D - 0.6; t += c.reduced ? 0.8 : 0.45) {
      tl.at(t, () => c.emit({ count: 1, glyph: 'note', colors: [PAL.pink, PAL.blue, PAL.purple, PAL.yellow], at: c.A.clone().setY(0.9), spread: [0.35, 0.15, 0.2], vel: [0, 0.32, 0], velSpread: [0.15, 0.05, 0.1], sway: 0.06, life: [1.6, 2.2], size: [0.1, 0.15], drag: 0.3 }));
    }
    tl.at(D - 0.4, () => c.play('idle', false)).hold(D);
    return { tl, tidy: () => undefined };
  },

  Magic: (c) => {
    // the fizz orb: a big Eclipse fizz bubble rises from his paws, circles him, comes back and bursts into sparkles;
    // its flat glow steps through cyan -> yellow -> pink -> violet -> cyan
    const st = c.st, orb = st.orb, mat = orb.material as THREE.MeshStandardMaterial, a = st.actor;
    const keys: Array<[number, [number, number, number]]> = []; // in his frame: x = side, y = up, z = towards camera
    keys.push([0, [0, 0.45, 0.22]], [0.99, [0, 0.62, 0.3]], [1.24, [0, 0.75, 0.62]], [2.48, [-0.75, 0.82, 0]], [3.72, [0, 0.9, -0.7]], [4.96, [0.75, 0.82, 0]], [6.0, [0, 0.75, 0.55]], [6.8, [0, 0.72, 0.32]]);
    const scaleK: Array<[number, number]> = [[0, 0.02], [0.99, 0.17], [3.31, 0.16], [4.96, 0.14], [6.8, 0.16]];
    const glow: Array<[number, [number, number, number]]> = [[0, [0.31, 0.84, 0.91]], [1.32, [0.96, 0.76, 0.27]], [2.64, [1, 0.31, 0.6]], [3.97, [0.42, 0.2, 0.91]], [4.96, [0.31, 0.84, 0.91]], [6.3, [0.96, 0.76, 0.27]], [7, [0.31, 0.84, 0.91]]];
    const loc = v3(), g = v3();
    const place = (t: number) => {
      sampleKeys(keys, t, loc);
      orb.position.copy(c.A).addScaledVector(c.s, loc.x).addScaledVector(c.f, loc.z).setY(loc.y + Math.sin(t * 5) * 0.02);
      orb.scale.setScalar(sampleKeys(scaleK, t));
      sampleKeys(glow, t, g);
      mat.emissive.setRGB(g.x, g.y, g.z);
    };
    let trail = 0, prev = 0;
    const tl = new Timeline();
    tl.at(0, () => { place(0); orb.visible = true; mat.opacity = 0.92; c.play('present'); a.face('surprised', 1); })
      .tween(0, 6.8, (_k, t) => {
        place(t);
        trail -= t - prev;
        prev = t;
        if (trail <= 0) {
          trail = c.reduced ? 0.2 : 0.08;
          c.emit({ count: 1, glyph: 'sparkle', colors: [PAL.sky, PAL.white, PAL.yellow], at: orb.position, spread: [0.03, 0.03, 0.03], vel: [0, 0.05, 0], life: [0.6, 0.9], size: [0.04, 0.08] });
        }
      }, ease.linear)
      .at(1.6, () => { a.face('happy', 5); c.play('sway', false); })
      .at(6.8, () => {
        c.emit({ count: 60, glyph: ['sparkle', 'star', 'dot'], colors: [PAL.sky, PAL.yellow, PAL.pink, PAL.white, PAL.purple], at: orb.position.clone(), burst: 1.3, drag: 1.3, gravity: 1.4, life: [1.4, 2], size: [0.05, 0.12], floor: 0, bounce: 0.45, rest: 0.5 });
        c.st.play.starBurst(orb.position, 6, 1.1, [PAL.sky, PAL.yellow, PAL.pink, PAL.white, PAL.purple], 1.2);
        c.play('cheer');
      })
      .tween(6.8, 0.25, (k) => { orb.scale.setScalar(0.16 * (1 + k * 0.8)); mat.opacity = 0.92 * (1 - k); }, ease.out)
      .at(7.1, () => { orb.visible = false; })
      .hold(8.6);
    return { tl, tidy: () => { orb.visible = false; mat.opacity = 0.92; mat.emissive.setRGB(0.31, 0.84, 0.91); } };
  },

  Party: (c) => {
    // Party: the tile floor grows in (0.5 s), the disco ball drops in and spins, party lights, Bobo dances,
    // notes, confetti and balloons
    const st = c.st, a = st.actor, D = 15, OUT = D - 1.2;
    const floor = st.discoFloor, fm = floor.material, ball = st.discoBall;
    const tl = new Timeline();
    tl.at(0, () => {
      st.disco.position.copy(c.A);
      floor.mesh.visible = true;
      fm.opacity = 0;
      ball.visible = true;
      ball.position.set(0, 1.55, 0);
      ball.scale.setScalar(0.001);
      st.setMood('party');
      a.face('happy', D);
    })
      .tween(0, 0.5, (k) => { fm.opacity = 0.92 * k; floor.mesh.scale.setScalar(0.3 + 0.7 * k); }, ease.out)
      .tween(0.35, 0.7, (k) => { ball.scale.setScalar(Math.max(0.001, k)); ball.position.y = 2.1 - 0.55 * k; }, ease.backOut)
      .at(0.4, () => c.play('dance', false))
      // balloons rise around him and float, bumping each other (tap one to pop it); they float away at the end
      .at(0.6, () => { if (!c.cut()) st.play.balloonsAround(c.A, c.reduced ? 4 : 7, 1.45, 0.95); });
    for (let t = 0.6; t < OUT - 0.3; t += c.reduced ? 0.9 : 0.4) {
      tl.at(t, () => {
        c.emit({ count: 1, glyph: 'note', colors: [PAL.pink, PAL.blue, PAL.purple, PAL.yellow], at: c.A.clone().setY(0.95), spread: [0.4, 0.15, 0.25], vel: [0, 0.3, 0], velSpread: [0.15, 0.05, 0.1], sway: 0.06, life: [1.6, 2.2], size: [0.1, 0.15] });
        c.emit({ count: 3, glyph: ['dot', 'star'], colors: RAINBOW, at: c.A.clone().setY(1.75), spread: [1, 0.1, 0.9], vel: [0, -0.4, 0], velSpread: [0.1, 0.1, 0.1], sway: 0.05, spin: 3, life: [4.6, 5], size: [0.04, 0.07], drag: 0, floor: 0, bounce: 0, rest: 1.2 });
      });
    }
    tl.at(OUT, () => { st.setMood('normal'); c.play('idle', false); c.play('cheer'); st.play.releaseBalloons(); })
      .tween(OUT, 0.6, (k) => { fm.opacity = 0.92 * (1 - k); floor.mesh.scale.setScalar(1 - 0.3 * k); }, ease.in)
      .tween(OUT + 0.1, 0.6, (k) => { ball.scale.setScalar(Math.max(0.001, 1 - k)); ball.position.y = 1.55 + 0.55 * k; }, ease.in)
      .hold(D);
    return {
      tl, outro: OUT, minT: 4,
      tidy: () => {
        floor.mesh.visible = false; fm.opacity = 0; floor.mesh.scale.setScalar(1);
        ball.visible = false; ball.scale.setScalar(1);
        st.setMood('normal');
        st.play.releaseBalloons();
      },
    };
  },

  Sit: (c) => {
    // Bobo sits down and stays a moment, looking at you
    const a = c.st.actor, tl = new Timeline();
    tl.at(0, () => { c.move('Sit'); a.face('happy', 5); })
      .at(1.2, () => c.emit({ count: 6, glyph: 'heart', colors: [PAL.pink, PAL.yellow], at: c.A.clone().setY(0.7), spread: [0.2, 0.05, 0.1], vel: [0, 0.3, 0.05], velSpread: [0.1, 0.08, 0.05], life: [1.2, 1.6], size: [0.06, 0.1], sway: 0.04 }))
      .at(5.6, () => c.play('idle', false))
      .hold(6);
    return { tl, tidy: () => undefined };
  },

  Chill: (c) => {
    // Bobo kicks back: his chill loop, slow notes drifting up
    const a = c.st.actor, tl = new Timeline(), D = 7;
    tl.at(0, () => { c.move('Chill'); a.face('sleepy', D); });
    for (let t = 0.6; t < D - 0.8; t += c.reduced ? 1.4 : 0.9) {
      tl.at(t, () => c.emit({ count: 1, glyph: 'note', colors: [PAL.sky, PAL.white, PAL.yellow], at: c.A.clone().setY(0.75), spread: [0.25, 0.1, 0.15], vel: [0, 0.22, 0], velSpread: [0.08, 0.04, 0.06], sway: 0.05, life: [1.8, 2.4], size: [0.08, 0.12], drag: 0.3 }));
    }
    tl.at(D - 0.4, () => c.play('idle', false)).hold(D);
    return { tl, tidy: () => undefined };
  },

  Purr: (c) => {
    // a happy purr: hearts float up round him
    const a = c.st.actor, tl = new Timeline(), D = 5;
    tl.at(0, () => { c.move('Purr'); a.face('love', D); });
    for (let t = 0.3; t < D - 0.6; t += c.reduced ? 0.8 : 0.45) {
      tl.at(t, () => c.emit({ count: 2, glyph: 'heart', colors: [PAL.pink, PAL.pinkSoft, PAL.red], at: c.A.clone().setY(0.6), spread: [0.3, 0.12, 0.2], vel: [0, 0.3, 0.04], velSpread: [0.12, 0.08, 0.06], sway: 0.05, life: [1.3, 1.8], size: [0.06, 0.11] }));
    }
    tl.at(D - 0.3, () => c.play('idle', false)).hold(D);
    return { tl, tidy: () => undefined };
  },

  Alert: (c) => {
    // ears up, on watch: a ring pings out from him
    const a = c.st.actor, tl = new Timeline();
    tl.at(0, () => { c.move('Alert', true); a.face('surprised', 2.5); })
      .at(0.25, () => c.emit({ count: 1, glyph: 'ring', colors: [PAL.sky], at: c.A.clone().setY(0.05), life: [0.6, 0.7], size: [0.6, 0.62], spin: 0 }))
      .at(0.55, () => c.emit({ count: 1, glyph: 'ring', colors: [PAL.yellow], at: c.A.clone().setY(0.05), life: [0.6, 0.7], size: [0.9, 0.92], spin: 0 }))
      .at(0.4, () => c.emit({ count: 10, glyph: ['star', 'sparkle'], colors: [PAL.yellow, PAL.white, PAL.sky], at: c.A.clone().setY(0.95), burst: 0.6, drag: 1.6, life: [0.7, 1.1], size: [0.05, 0.09] }))
      .hold(3);
    return { tl, tidy: () => undefined };
  },

  Cheer: (c) => {
    const tl = new Timeline();
    tl.at(0, () => { c.play('cheer'); c.st.actor.face('happy', 2.5); })
      .at(0.5, () => c.emit({ count: 26, glyph: ['star', 'sparkle'], colors: [PAL.yellow, PAL.sky, PAL.pink, PAL.white], at: c.A.clone().setY(0.9), burst: 1, drag: 1.6, gravity: 0.2, life: [1, 1.5], size: [0.05, 0.11] }))
      .hold(2.6);
    return { tl, tidy: () => undefined };
  },
};
