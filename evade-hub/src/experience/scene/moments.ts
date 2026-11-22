// The eleven moments (plus a generic Cheer) as short choreographies on a Timeline: Happi's clip, the props that
// appear, particles, lighting mood and sound. Every moment starts from and returns to a tidy idle, so they can follow
// each other in any order. Timings port the Mattercraft timelines (cb-ref 3d.txt) where those existed: House Up
// (house pops in 0.49 s, car "drive in" 2.6 s), Rainbow (flies in from the camera at 1.65 s, lands 2.65 s, grows
// to 3.67 s), Magic Orb (rises 0.99 s, circles 1.24 / 2.48 / 3.72 / 4.96 s, emissive cycle 1.32 s steps), Party Time
// (floor + TV rise in 0.5 s, theme song, disco ball spins). Running, Sleep, WakeUp, Cold and Dance are new designs.
//
// Runner rules: one moment at a time; up to two wait in a queue (repeats of the same name are ignored); 1.5 s
// cooldown per name; Sleep is a state (she stays asleep until WakeUp, another action, the joystick, or ~30 s); a
// queued action shortens a long moment (Party, House) to its outro once it has had a few seconds.
import * as THREE from 'three';
import { CORE_ACTIONS } from '../../shared/contracts';
import type { BearClip } from '../../shared/contracts';
import { Timeline, ease, sampleKeys } from '../core/timeline';
import type { EmitOptions } from './fx';
import { PAL, RAINBOW } from './fx';
import type { Stage } from './stage';
import { COT } from './house/dims';

// 'Stare' (the Care Bear Stare, round 2) is a core action, so the admin keyword list and the voice synonyms
// ("care bear stare") fire it. 'Cheer' is experience-only.
export const MOMENT_NAMES = [...CORE_ACTIONS, 'Cheer'] as const;
export type MomentName = (typeof MOMENT_NAMES)[number];

const ALIASES: Record<string, MomentName> = {
  wake: 'WakeUp', 'wake up': 'WakeUp', run: 'Running', magicorb: 'Magic', 'magic orb': 'Magic',
  'happi burst': 'Stare', happiburst: 'Stare', burst: 'Stare',
};
/** Case-insensitive name lookup ('wakeup', 'Wake Up', 'RAINBOW' ...). Null when unknown. */
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
  /** Turn her to the camera while it plays (default true). */
  faceCam?: boolean;
}

interface Ctx {
  st: Stage;
  /** Her spot when the moment started (stage-local, y = 0). */
  A: THREE.Vector3;
  /** Unit XZ vector from her towards the camera, and the side vector (camera's right as seen from her). */
  f: THREE.Vector3;
  s: THREE.Vector3;
  yawCam: number;
  emit(o: EmitOptions): void;
  reduced: boolean;
  play(clip: BearClip, once?: boolean, speed?: number): void;
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
  /** Seconds she sleeps before waking up by herself. */
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
    // asleep: anything else wakes her first
    if (this.asleep && m !== 'WakeUp' && m !== 'Sleep' && !this.queue.includes('WakeUp') && this.cur?.name !== 'WakeUp') this.queue.push('WakeUp');
    this.queue.push(m);
    this.last.set(m, t);
    if (!this.cur) this.next();
    return true;
  }

  /** The joystick moved (or she was tapped) while asleep: wake up. */
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
    // Mattercraft: two sparkle emitters, one low and wide rising slowly (blue/pink/lilac/lime), one at chest height
    const tl = new Timeline();
    const cols = [0x1c64e0, 0xe74caa, 0xe6ccff, 0xcfe77f, PAL.yellow, PAL.white];
    tl.at(0, () => { c.play('cheer'); c.st.actor.face('happy', 3); });
    for (let k = 0; k < (c.reduced ? 3 : 6); k++) {
      tl.at(0.15 + k * 0.4, () => c.emit({ count: 22, glyph: ['sparkle', 'star'], colors: cols, at: c.A.clone().setY(0.05), ring: 0.75, spread: [0, 0.05, 0], vel: [0, 0.45, 0], velSpread: [0.12, 0.15, 0.12], life: [1.4, 2.2], size: [0.06, 0.13], drag: 0.3 }));
    }
    tl.at(0.7, () => c.emit({ count: 50, glyph: ['sparkle', 'star', 'dot'], colors: cols, at: c.A.clone().setY(0.6), burst: 1.4, drag: 1.2, gravity: 1.6, life: [1.6, 2.3], size: [0.05, 0.12], floor: 0, bounce: 0.5, rest: 0.6 }))
      .hold(3.5);
    return { tl, tidy: () => undefined };
  },

  Running: (c) => {
    // a lap: a circle beside her, through her spot, then back to face you
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
        // cut before she fell asleep properly: still asleep (the state is the point of Sleep)
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
    // the Magic Orb: rises from her paws, circles her (Mattercraft keys 1.24 / 2.48 / 3.72 / 4.96 s), comes back and
    // bursts into sparkles; its glow cycles blue -> gold -> pink -> green -> blue
    const st = c.st, orb = st.orb, mat = orb.material as THREE.MeshStandardMaterial, a = st.actor;
    const keys: Array<[number, [number, number, number]]> = []; // in her frame: x = side, y = up, z = towards camera
    keys.push([0, [0, 0.45, 0.22]], [0.99, [0, 0.62, 0.3]], [1.24, [0, 0.75, 0.62]], [2.48, [-0.75, 0.82, 0]], [3.72, [0, 0.9, -0.7]], [4.96, [0.75, 0.82, 0]], [6.0, [0, 0.75, 0.55]], [6.8, [0, 0.72, 0.32]]);
    const scaleK: Array<[number, number]> = [[0, 0.02], [0.99, 0.17], [3.31, 0.16], [4.96, 0.14], [6.8, 0.16]];
    const glow: Array<[number, [number, number, number]]> = [[0, [0.3, 0.6, 1]], [1.32, [1, 0.8, 0.2]], [2.64, [1, 0.3, 0.8]], [3.97, [0.2, 1, 0.6]], [4.96, [0.3, 0.6, 1]], [6.3, [1, 0.8, 0.2]], [7, [0.3, 0.6, 1]]];
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
          c.emit({ count: 1, glyph: 'sparkle', colors: [0x80ccff, PAL.white, PAL.yellow], at: orb.position, spread: [0.03, 0.03, 0.03], vel: [0, 0.05, 0], life: [0.6, 0.9], size: [0.04, 0.08] });
        }
      }, ease.linear)
      .at(1.6, () => { a.face('happy', 5); c.play('sway', false); })
      .at(6.8, () => {
        c.emit({ count: 60, glyph: ['sparkle', 'star', 'dot'], colors: [0x80ccff, PAL.yellow, PAL.pink, PAL.white, PAL.green], at: orb.position.clone(), burst: 1.3, drag: 1.3, gravity: 1.4, life: [1.4, 2], size: [0.05, 0.12], floor: 0, bounce: 0.45, rest: 0.5 });
        c.st.play.starBurst(orb.position, 6, 1.1, [0x80ccff, PAL.yellow, PAL.pink, PAL.white, PAL.green], 1.2);
        c.play('cheer');
      })
      .tween(6.8, 0.25, (k) => { orb.scale.setScalar(0.16 * (1 + k * 0.8)); mat.opacity = 0.92 * (1 - k); }, ease.out)
      .at(7.1, () => { orb.visible = false; })
      .hold(8.6);
    return { tl, tidy: () => { orb.visible = false; mat.opacity = 0.92; mat.emissive.setRGB(0.3, 0.6, 1); } };
  },

  Cold: (c) => {
    const st = c.st, a = st.actor, tl = new Timeline(), D = 6;
    const base = c.A.clone();
    tl.at(0, () => { st.setMood('cold'); a.face('cold', D); c.play('shiver', false); });
    for (let t = 0; t < D - 1; t += c.reduced ? 0.5 : 0.22) {
      // the flakes land (floor and her head) and pile up for a moment before they melt away
      tl.at(t, () => c.emit({ count: 4, glyph: 'snow', colors: [PAL.white, PAL.ice, PAL.sky], at: c.A.clone().setY(1.9), spread: [1.3, 0.2, 1.1], vel: [0, -0.42, 0], velSpread: [0.05, 0.08, 0.05], sway: 0.08, spin: 1, life: [5.5, 6], size: [0.05, 0.1], drag: 0, floor: 0, bounce: 0, rest: 1.6, perch: c.st.headPerch }));
      if (!c.reduced) tl.at(t + 0.1, () => c.emit({ count: 1, glyph: 'snow', colors: [PAL.white], at: c.A.clone().setY(1.6), spread: [0.18, 0.1, 0.16], vel: [0, -0.4, 0], velSpread: [0.02, 0.05, 0.02], sway: 0.03, spin: 0.6, life: [5, 5.5], size: [0.06, 0.09], drag: 0, floor: 0, bounce: 0, rest: 1.8, perch: c.st.headPerch }));
    }
    if (!c.reduced) tl.tween(0.3, D - 1.4, (_k, t) => { a.position.copy(base).addScaledVector(c.s, Math.sin(t * 62) * 0.006); }, ease.linear);
    tl.at(D - 1.1, () => { a.position.copy(base); st.setMood('normal'); c.play('idle', false); })
      .at(D - 0.9, () => { a.face('happy', 1.5); c.emit({ count: 10, glyph: 'heart', colors: [PAL.pink, PAL.orange], at: c.A.clone().setY(0.85), burst: 0.5, drag: 1.2, life: [1, 1.4], size: [0.06, 0.1] }); })
      .hold(D);
    return { tl, tidy: () => { a.position.copy(base); st.setMood('normal'); } };
  },

  Party: (c) => {
    // Party Time: tile floor grows in (0.5 s), the TV rises behind her playing the theme with sound, the disco ball
    // drops in and spins, party lights, she dances, notes and confetti
    const st = c.st, a = st.actor, D = 15, OUT = D - 1.2;
    const floor = st.discoFloor, fm = floor.material, ball = st.discoBall, tv = st.partyTv;
    const tvPos = c.A.clone().addScaledVector(c.f, -1.25).addScaledVector(c.s, 0.25);
    const tl = new Timeline();
    tl.at(0, () => {
      st.disco.position.copy(c.A);
      floor.mesh.visible = true;
      fm.opacity = 0;
      ball.visible = true;
      ball.position.set(0, 1.55, 0);
      ball.scale.setScalar(0.001);
      tv.visible = true;
      tv.position.copy(tvPos);
      tv.rotation.y = yawOf(c.f);
      tv.scale.setScalar(0.001);
      st.media.playTheme('party', true);
      st.setMood('party');
      a.face('happy', D);
    })
      .tween(0, 0.5, (k) => { fm.opacity = 0.92 * k; floor.mesh.scale.setScalar(0.3 + 0.7 * k); }, ease.out)
      .tween(0.1, 0.55, (k) => tv.scale.setScalar(Math.max(0.001, k)), ease.backOut)
      .tween(0.35, 0.7, (k) => { ball.scale.setScalar(Math.max(0.001, k)); ball.position.y = 2.1 - 0.55 * k; }, ease.backOut)
      .at(0.4, () => c.play('dance', false))
      // balloons rise around her and float, bumping each other (tap one to pop it); they float away at the end
      .at(0.6, () => { if (!c.cut()) st.play.balloonsAround(c.A, c.reduced ? 4 : 7, 1.45, 0.95); });
    for (let t = 0.6; t < OUT - 0.3; t += c.reduced ? 0.9 : 0.4) {
      tl.at(t, () => {
        c.emit({ count: 1, glyph: 'note', colors: [PAL.pink, PAL.blue, PAL.purple, PAL.yellow], at: c.A.clone().setY(0.95), spread: [0.4, 0.15, 0.25], vel: [0, 0.3, 0], velSpread: [0.15, 0.05, 0.1], sway: 0.06, life: [1.6, 2.2], size: [0.1, 0.15] });
        c.emit({ count: 3, glyph: ['dot', 'star'], colors: RAINBOW, at: c.A.clone().setY(1.75), spread: [1, 0.1, 0.9], vel: [0, -0.4, 0], velSpread: [0.1, 0.1, 0.1], sway: 0.05, spin: 3, life: [4.6, 5], size: [0.04, 0.07], drag: 0, floor: 0, bounce: 0, rest: 1.2 });
      });
    }
    tl.at(OUT, () => { st.media.stopTheme('party'); st.setMood('normal'); c.play('idle', false); c.play('cheer'); st.play.releaseBalloons(); })
      .tween(OUT, 0.6, (k) => { fm.opacity = 0.92 * (1 - k); floor.mesh.scale.setScalar(1 - 0.3 * k); }, ease.in)
      .tween(OUT, 0.5, (k) => tv.scale.setScalar(Math.max(0.001, 1 - k)), ease.in)
      .tween(OUT + 0.1, 0.6, (k) => { ball.scale.setScalar(Math.max(0.001, 1 - k)); ball.position.y = 1.55 + 0.55 * k; }, ease.in)
      .hold(D);
    return {
      tl, outro: OUT, minT: 4,
      tidy: () => {
        floor.mesh.visible = false; fm.opacity = 0; floor.mesh.scale.setScalar(1);
        ball.visible = false; ball.scale.setScalar(1);
        tv.visible = false; tv.scale.setScalar(1);
        st.media.stopTheme('party');
        st.setMood('normal');
        st.play.releaseBalloons();
      },
    };
  },

  Rainbow: (c) => {
    // flies in from beside the camera, lands behind her, pops up big, holds while she sways, shrinks away
    const st = c.st, rb = st.rainbow, a = st.actor;
    const camDist = st.cam.distanceTo(c.A);
    const from = st.cam.clone().addScaledVector(st.camDir, Math.min(0.9, camDist * 0.3)).setY(Math.max(0.3, st.cam.y - 0.4)).addScaledVector(c.s, 0.25);
    const land = c.A.clone().addScaledVector(c.f, -0.55);
    const p = v3();
    let trail = 0, prev = 0;
    const tl = new Timeline();
    tl.at(0, () => {
      rb.visible = true;
      rb.position.copy(from);
      rb.rotation.set(0, c.yawCam, 0);
      rb.scale.setScalar(0.08);
      a.face('surprised', 1);
    })
      .tween(0, 1.0, (k, t) => {
        p.lerpVectors(from, land, k);
        p.y += Math.sin(k * Math.PI) * 0.35;
        rb.position.copy(p);
        rb.rotation.z = Math.sin(k * Math.PI * 2) * 0.3;
        rb.scale.setScalar(0.08 + 0.07 * k);
        trail -= t - prev;
        prev = t;
        if (trail <= 0) {
          trail = 0.05;
          c.emit({ count: 2, glyph: ['sparkle', 'dot'], colors: RAINBOW, at: p.clone().setY(p.y + 0.05), spread: [0.04, 0.04, 0.04], life: [0.5, 0.9], size: [0.04, 0.08] });
        }
      }, ease.inOut)
      .at(1.0, () => {
        c.emit({ count: 40, glyph: ['sparkle', 'star', 'dot'], colors: RAINBOW, at: land.clone().setY(0.1), burst: 1.1, drag: 1.4, gravity: 1.2, life: [1.4, 2], size: [0.05, 0.11], floor: 0, bounce: 0.5, rest: 0.5 });
        if (!c.cut()) c.st.play.starBurst(land.clone().setY(0.25), 10, 1.3, RAINBOW, 1.9);
        a.face('happy', 4);
        c.play('sway', false);
      })
      // Mattercraft: 0.14 -> 0.93 (x) with a squash, then settles
      .tween(1.0, 0.9, (k) => { rb.scale.set(0.15 + 0.85 * k, 0.15 + 0.85 * k * (0.9 + 0.1 * k), 1 * (0.15 + 0.85 * k)); rb.rotation.z = 0; }, ease.elasticOut)
      // the rainbow drips a few more sparkly stars off its arc while it stands
      .at(2.2, () => { if (!c.cut()) c.st.play.starBurst(rb.position.clone().addScaledVector(c.s, 0.5).setY(1.05), c.reduced ? 2 : 4, 0.5, RAINBOW, 0.4); })
      .at(3.3, () => { if (!c.cut()) c.st.play.starBurst(rb.position.clone().addScaledVector(c.s, -0.5).setY(1.05), c.reduced ? 2 : 4, 0.5, RAINBOW, 0.4); })
      .tween(4.6, 0.7, (k) => rb.scale.setScalar(Math.max(0.001, 1 - k)), ease.in)
      .at(5.3, () => { rb.visible = false; c.play('idle', false); })
      .hold(6.2);
    return { tl, tidy: () => { rb.visible = false; rb.scale.setScalar(1); rb.rotation.set(0, 0, 0); } };
  },

  House: (c) => (c.st.variant === 'ar' ? houseAr(c) : houseShowcase(c)),

  Stare: (c) => stare(c),

  Cheer: (c) => {
    const tl = new Timeline();
    tl.at(0, () => { c.play('cheer'); c.st.actor.face('happy', 2.5); })
      .at(0.5, () => c.emit({ count: 26, glyph: ['star', 'sparkle'], colors: [PAL.pink, PAL.yellow, PAL.blue, PAL.white], at: c.A.clone().setY(0.9), burst: 1, drag: 1.6, gravity: 0.2, life: [1, 1.5], size: [0.05, 0.11] }))
      .hold(2.6);
    return { tl, tidy: () => undefined };
  },
};

// ------------------------------------------------------------------ House
function carDrive(c: Ctx, from: THREE.Vector3, to: THREE.Vector3): (k: number) => void {
  const car = c.st.car, d = to.clone().sub(from);
  const yaw = yawOf(d);
  return (k) => {
    car.position.lerpVectors(from, to, k);
    car.rotation.set(0, yaw, 0);
    c.st.carModel.position.y = Math.abs(Math.sin(k * 40)) * 0.012 * (1 - k);
  };
}

/**
 * Showcase: her house pops up behind her (elastic), the mailbox pops up, the door swings open and the car drives in
 * and parks. Then the camera glides through the door into the room (scene/house/: the same room AR walks into):
 * she pops in to wave, a look at the TV playing the theme, a little jukebox party, and back out again. The house
 * shrinks away at the end.
 */
function houseShowcase(c: Ctx): MomentDef {
  const st = c.st, h = st.house, hs = st.houseSet, mb = st.mailbox, a = st.actor;
  const K = hs.k, D = COT.d * K, Wd = COT.w * K;
  const hp = c.A.clone().addScaledVector(c.f, -(1.9 + D / 2));
  const park = hp.clone().addScaledVector(c.s, Wd / 2 + 0.85).addScaledVector(c.f, D / 2 + 0.75);
  const start = park.clone().addScaledVector(c.s, 3.4).addScaledVector(c.f, 0.3);
  const gone = park.clone().addScaledVector(c.s, -7);
  const mbp = hp.clone().addScaledVector(c.s, -(Wd / 2 + 0.55)).addScaledVector(c.f, D / 2 + 0.6);
  const L = (x: number, y: number, z: number) => hs.toStage(v3(x, y, z));
  const tour = hs.tour;
  let inRoom = false;
  // waypoints in door-local metres: [time, position, look-at]
  const path: Array<[number, [number, number, number], [number, number, number]]> = [
    [0, [0, 1.45, 3.4], [0, 1.15, -2]],
    [1.6, [0, 1.3, 1.2], [0, 1.0, -4.5]],
    [3.0, [0, 1.25, -1.15], [0, 0.95, -4.5]],
    [5.0, [0.1, 1.2, -1.55], [-0.15, 0.95, -4.5]],
    [6.4, [-0.25, 1.22, -1.7], [-1.2, 0.95, -4.3]],
    [7.9, [-0.2, 1.22, -1.75], [0.8, 0.6, -3.1]],
    [9.2, [0, 1.3, -0.9], [0, 1.0, -3.5]],
    [10.6, [0, 1.45, 3.0], [0, 1.3, 0]],
  ];
  const P = v3(), LK = v3(), PA = v3(), PB = v3();
  const sample = (u: number) => {
    let i = 0;
    while (i < path.length - 2 && u > path[i + 1][0]) i++;
    const [t0, p0, l0] = path[i], [t1, p1, l1] = path[i + 1];
    const k = ease.inOut(THREE.MathUtils.clamp((u - t0) / (t1 - t0), 0, 1));
    P.lerpVectors(PA.set(...p0), PB.set(...p1), k);
    LK.lerpVectors(PA.set(...l0), PB.set(...l1), k);
    hs.toStage(P, tour.pos);
    hs.toStage(LK, tour.look);
  };
  const TOUR = 4.4, TL = path[path.length - 1][0];
  const OUT = TOUR + TL + 1.4;
  const tl = new Timeline();
  tl.at(0, () => {
    h.visible = true; h.position.copy(hp); h.rotation.set(0, c.yawCam, 0); h.scale.setScalar(0.07);
    hs.setOpen(false, true);
    mb.visible = false; mb.position.copy(mbp); mb.rotation.set(0, c.yawCam + 0.4, 0);
    st.car.visible = false;
    c.emit({ count: 45, glyph: ['sparkle', 'star'], colors: [0xe6ccff, PAL.pink, PAL.yellow, PAL.white], at: hp.clone().setY(0.4), spread: [0.9, 0.3, 0.6], burst: 0.9, drag: 1.4, life: [1, 1.6], size: [0.07, 0.14] });
    a.face('surprised', 1.2);
  })
    .tween(0, 0.9, (k) => h.scale.setScalar(0.07 + 0.93 * k), ease.elasticOut)
    .at(0.7, () => { mb.visible = true; mb.scale.setScalar(0.001); })
    .tween(0.7, 0.6, (k) => mb.scale.setScalar(Math.max(0.001, k)), ease.backOut)
    .at(0.9, () => { c.play('present'); a.face('happy', 6); hs.puffHearts(c.reduced ? 4 : 10); })
    .at(1.1, () => hs.setOpen(true))
    .at(1.2, () => { st.car.visible = true; })
    .tween(1.2, 2.6, carDrive(c, start, park), ease.out)
    .at(3.6, () => c.play('cheer'))
    // the glide in: blend from the follow camera, then along the path through the door
    .at(TOUR, () => { sample(0); hs.tourTv(true); })
    .tween(TOUR, TL, (_k, t) => {
      sample(t);
      tour.k = Math.min(1, t / 1.4);
    }, ease.linear)
    // she pops into the room to wave at you
    .at(TOUR + 2.4, () => {
      if (c.cut()) return;
      c.emit({ count: 16, glyph: ['sparkle', 'star'], colors: [PAL.pink, PAL.yellow, PAL.white], at: a.position.clone().setY(0.5), burst: 0.7, drag: 1.5, life: [0.6, 1], size: [0.06, 0.1] });
      a.position.copy(L(0.85, 0, -3.1)).setY(0); // on the rug, clear of the camera's path (she's big next to the 0.72 house)
      const cam = L(0, 0, -1.2);
      a.setHeading(Math.atan2(cam.x - a.position.x, cam.z - a.position.z));
      inRoom = true;
      c.emit({ count: 22, glyph: ['sparkle', 'star', 'heart'], colors: [PAL.pink, PAL.yellow, PAL.white], at: a.position.clone().setY(0.5), burst: 0.8, drag: 1.5, life: [0.7, 1.1], size: [0.06, 0.11] });
      c.play('wave');
    })
    // a little jukebox party
    .at(TOUR + 6.0, () => { if (!c.cut() && hs.interact('jukebox') === 'dance') c.play('dance', false); })
    // back out with you
    .at(TOUR + 9.4, () => {
      if (!inRoom) return;
      inRoom = false;
      c.emit({ count: 16, glyph: ['sparkle', 'star'], colors: [PAL.pink, PAL.yellow, PAL.white], at: a.position.clone().setY(0.5), burst: 0.7, drag: 1.5, life: [0.6, 1], size: [0.06, 0.1] });
      a.position.copy(c.A);
      a.setHeading(c.yawCam);
      c.play('idle', false);
      c.play('cheer');
    })
    .at(TOUR + TL, () => hs.tourTv(false))
    .tween(TOUR + TL, 1.3, (k) => { tour.k = 1 - k; }, ease.inOut)
    .at(OUT, () => { c.play('wave'); hs.setOpen(false); })
    .tween(OUT, 1.6, carDrive(c, park, gone), ease.in)
    .tween(OUT + 1.2, 0.5, (k) => { h.scale.setScalar(Math.max(0.001, 1 - k)); mb.scale.setScalar(Math.max(0.001, 1 - k)); }, ease.in)
    .hold(OUT + 1.9);
  return {
    tl, outro: OUT, minT: 4, faceCam: false,
    tidy: () => {
      tour.k = 0;
      hs.reset();
      hs.setOpen(false, true);
      if (inRoom) { a.position.copy(c.A); inRoom = false; }
      h.visible = false; h.scale.setScalar(1);
      mb.visible = false; mb.scale.setScalar(1);
      st.car.visible = false;
    },
  };
}

/**
 * AR: the house is already there, life size. It bounces with sparkles and puffs hearts from its chimney, the door
 * swings open, the mailbox wobbles, a little cloud car drives up and parks in the garden, then drives off.
 */
function houseAr(c: Ctx): MomentDef {
  const st = c.st, hs = st.houseSet, a = st.actor;
  const K = hs.k;
  const L = (x: number, y: number, z: number) => hs.toStage(v3(x, y, z)).setY(0);
  const park = L(COT.w / 2 + 0.95, 0, 1.25);
  const start = L(COT.w / 2 + 4.2, 0, 2.2);
  const gone = L(COT.w / 2 + 0.2, 0, 6.5);
  const OUT = 7.5;
  const tl = new Timeline();
  tl.at(0, () => {
    st.car.visible = false;
    st.car.scale.setScalar((0.85 * K) / 0.68);
    c.emit({ count: 45, glyph: ['sparkle', 'star'], colors: [0xe6ccff, PAL.pink, PAL.yellow, PAL.white], at: hs.toStage(v3(0, COT.peak * 0.7, 0.3)), spread: [1.2 * K, 0.6 * K, 0.3 * K], burst: 0.5 * K, drag: 1.4, life: [1, 1.6], size: [0.07 * K, 0.14 * K] });
    c.play('present');
    a.face('happy', 6);
    hs.setOpen(true);
  })
    .tween(0, 0.9, (k) => { hs.squash = 1 + Math.sin(k * Math.PI) * 0.07 * (1 - k * 0.5); }, ease.linear)
    .at(0.25, () => hs.puffHearts(c.reduced ? 5 : 12))
    .tween(0.3, 1.2, (k) => { hs.mailTilt = Math.sin(k * Math.PI * 4) * 0.2 * (1 - k); }, ease.linear)
    .at(0.8, () => { st.car.visible = true; })
    .tween(0.8, 2.6, carDrive(c, start, park), ease.out)
    .at(3.6, () => c.play('cheer'))
    .tween(OUT, 1.8, carDrive(c, park, gone), ease.in)
    .hold(OUT + 1.9);
  return {
    tl, outro: OUT, minT: 3.5,
    tidy: () => { hs.squash = 1; hs.mailTilt = 0; st.car.visible = false; st.car.scale.setScalar(1); },
  };
}

// ------------------------------------------------------------------ the Care Bear Stare
/**
 * Her signature: she plants her feet, her tummy glitters, and a flat-striped rainbow beam rolls out of it, dips to the
 * floor and runs along it towards you (in AR it stops a little in front of your feet); stars bounce out where it
 * lands. 5.6 s.
 */
function stare(c: Ctx): MomentDef {
  const st = c.st, a = st.actor, beam = st.beam, bm = beam.material;
  const tummy = c.A.clone().addScaledVector(c.f, 0.2).setY(0.42);
  const camXZ = st.cam.clone().setY(0);
  const toCam = camXZ.distanceTo(c.A);
  let land: THREE.Vector3;
  if (st.variant === 'ar') {
    // along the floor towards you, ending ~45 cm in front of the phone
    const metres = Math.max(0.05, st.root.scale.x);
    const L = THREE.MathUtils.clamp(toCam - 0.45 / metres, 1.2, 6);
    land = c.A.clone().addScaledVector(c.f, L).addScaledVector(c.s, 0.12).setY(0.012);
  } else {
    // across the cloud towards you and off to one side, landing where you can see the stars bounce
    const L = THREE.MathUtils.clamp(toCam * 0.3, 0.8, 1.2);
    land = c.A.clone().addScaledVector(c.f, L).addScaledVector(c.s, 0.85).setY(0.012);
  }
  const W0 = 0.14, W1 = st.variant === 'ar' ? 0.62 : 0.5;
  const FIRE = 1.0, RUN = 0.55, END = 3.8, BACK = 0.5;
  let head = 0, tail = 0, glit = 0, sprk = 0, starT = 0, prev = 0, prevB = 0;
  const p = v3();
  const along = (u: number): THREE.Vector3 => {
    const s2 = Math.min(1, u / 0.45);
    return p.lerpVectors(tummy, land, u).setY(land.y + (tummy.y - land.y) * (1 - s2) * (1 - s2) * (1 + 2 * s2) + 0.04);
  };
  const tl = new Timeline();
  tl.at(0, () => { c.play('present'); a.face('happy', 5); a.jiggle(-0.12); })
    // the tummy glitters while she gathers it up
    .tween(0, FIRE, (_k, t) => {
      glit -= t - prev;
      prev = t;
      if (glit <= 0) {
        glit = c.reduced ? 0.25 : 0.1;
        c.emit({ count: 3, glyph: ['sparkle', 'star'], colors: [PAL.white, PAL.yellow, PAL.pink], at: tummy, spread: [0.07, 0.07, 0.03], burst: 0.35, drag: 2.5, life: [0.3, 0.5], size: [0.04, 0.08] });
      }
    }, ease.linear)
    .at(FIRE - 0.15, () => c.emit({ count: 1, glyph: 'ring', colors: [PAL.white], at: tummy, life: [0.3, 0.32], size: [0.26, 0.27], spin: 0 }))
    .at(FIRE, () => {
      if (c.cut()) return;
      beam.mesh.visible = true;
      bm.opacity = 0.96;
      a.jiggle(0.2);
      c.emit({ count: 14, glyph: ['sparkle', 'star', 'heart'], colors: RAINBOW, at: tummy, burst: 0.9, drag: 2, life: [0.5, 0.8], size: [0.05, 0.1] });
    })
    .tween(FIRE, RUN, (k) => { head = k; }, ease.out)
    .tween(FIRE, END + BACK - FIRE, (_k, t) => {
      beam.set(tummy, land, tail, Math.max(head, tail + 0.001), W0, W1, t, c.reduced ? 0.3 : 1);
      // sparkles stream along it, stars bounce out where it lands
      sprk -= t - prevB;
      prevB = t;
      if (sprk <= 0 && head > 0.1 && tail < 0.9) {
        sprk = c.reduced ? 0.2 : 0.07;
        const u = tail + Math.random() * (head - tail);
        c.emit({ count: 1, glyph: ['sparkle', 'star'], colors: [PAL.white, ...RAINBOW], at: along(u), spread: [0.08, 0.03, 0.08], vel: [0, 0.3, 0], life: [0.5, 0.8], size: [0.04, 0.08] });
      }
      if (head >= 0.98 && tail < 0.6 && t >= starT) {
        starT = t + (c.reduced ? 0.42 : 0.2);
        st.play.starBurst(land, 2, 1.1, RAINBOW, 2.2);
      }
    }, ease.linear)
    .at(FIRE + RUN, () => {
      if (c.cut()) return;
      c.emit({ count: 24, glyph: ['sparkle', 'star', 'dot'], colors: RAINBOW, at: land.clone().setY(0.08), burst: 1.2, drag: 1.4, gravity: 1.4, life: [1.2, 1.8], size: [0.05, 0.11], floor: 0, bounce: 0.5, rest: 0.4 });
      c.emit({ count: 1, glyph: 'ring', colors: [PAL.white], at: land.clone().setY(0.05), life: [0.35, 0.4], size: [0.5, 0.52], spin: 0 });
    })
    .tween(END, BACK, (k) => { tail = k; bm.opacity = 0.96 * (1 - k * 0.4); }, ease.in)
    .at(END + BACK, () => {
      beam.mesh.visible = false;
      if (c.cut()) return;
      st.play.starBurst(land, 6, 1.4, RAINBOW, 2.4);
      c.play('cheer');
      a.face('happy', 2);
    })
    .hold(5.6);
  return { tl, tidy: () => { beam.mesh.visible = false; bm.opacity = 0.96; } };
}
