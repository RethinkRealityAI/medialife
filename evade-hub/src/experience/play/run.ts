// Heart Run (the Cola Run idea): 60 seconds to run Happi around with the joystick and collect what floats over
// the pulsing floor beacons.
//
//   heart    common, +1 (a run of quick pickups climbs in pitch; every 5 in a row +2)
//   rainbow  rare, +5 and a short speed boost with a rainbow trail
//   star     every ~15 s, +2 and a magnet: nearby hearts glide to her for 4 s
//   cloud    after the first 18 s a grumpy grey raincloud drifts after her; if it reaches her she drops 3 hearts
//
// Pickups use a seeded minimum-separation layout inside the play area (AR: the placed stage's radius, out of the
// house); collected ones respawn somewhere new, so 9 to 11 are always out. Everything is stage-local.
import * as THREE from 'three';
import type { PlayStatus } from '../../shared/contracts';
import { PAL, RAINBOW } from '../scene/fx';
import { RUN_SPEED } from '../scene/actor';
import { IS_PHONE } from '../core/device';
import { PlayGame, mulberry32, type PlayHost } from './game';
import { houseBounds, type PickDraw, type PickKind } from './kit';

const ROUND_S = 60;
const ON_FIELD = 9;
const MIN_SEP = 0.72;
const REACH = 0.4;
const STREAK_GAP = 1.9; // seconds between pickups that still count as "in a row"
const STAR_EVERY = 15;
const BOOST_S = 3;
const MAGNET_S = 4;
const CLOUD_AFTER = 18;
const HEART_HEX = [0xffb7c9, 0xff94b0, 0xffd9e3];

interface Slot extends PickDraw {
  alive: boolean;
  /** 0..1 pop-in, and 1..0 while it goes (collected / timed out). */
  k: number;
  going: boolean;
  age: number;
  life: number;
  baseY: number;
}

export class HeartRun extends PlayGame {
  readonly id = 'heart-run' as const;
  readonly label = 'Parade Dash';
  readonly showStick = true;
  protected readonly roundS = ROUND_S;
  protected readonly starAt = [25, 50, 80] as const;
  protected readonly balls = 0;
  protected readonly goLine = 'Catch the blossoms!';
  /** The 3D camera pulls back and looks down a little while this runs. */
  readonly view = { wide: 2.7, pitch: 0.42 as number | null };
  private slots: Slot[] = [];
  private draws: PickDraw[] = [];
  private rng = mulberry32(1);
  seed = 0;
  private elapsed = 0;
  private lastPick = -9;
  streak = 0;
  hearts = 0;
  rainbows = 0;
  stars = 0;
  drops = 0;
  private nextStar = STAR_EVERY;
  private boost = 0;
  private magnet = 0;
  private trailT = 0;
  private respawn: number[] = [];
  // the raincloud
  private cloudOn = false;
  private cloudP = new THREE.Vector3();
  private cloudV = new THREE.Vector3();
  private cloudCool = 0;
  private rainT = 0;
  private cloudK = 0;
  private cloudSlot: PickDraw = { kind: 'heart', x: 0, y: 0, z: 0, s: 0, yaw: 0, hex: 0, beacon: -1, phase: 0.3, beaconSize: 0.8 };
  private field = { x: 0, z: 0, r: 2.4 };
  private house = new THREE.Box3();
  private t = new THREE.Vector3();
  private t2 = new THREE.Vector3();
  /** polish-4: a one-time nudge when she has not moved a few seconds into the round (is the joystick obvious?). */
  private stillT = 0;
  private movedOnce = false;
  private nudgeEl: HTMLElement | null = null;
  /** Test hook: how often the nudge showed. */
  nudges = 0;

  constructor(host: PlayHost, emit: (s: PlayStatus) => void, exit: () => void) {
    super(host, emit, exit);
    for (let i = 0; i < 14; i++) {
      this.slots.push({ kind: 'heart', x: 0, y: 0, z: 0, s: 0, yaw: 0, hex: PAL.pink, beacon: PAL.pink, phase: 0, alive: false, k: 0, going: false, age: 0, life: 99, baseY: 0.34 });
    }
  }

  // ------------------------------------------------------------------ round
  protected setup(): void {
    this.seed = (Math.random() * 4294967296) >>> 0;
    this.rng = mulberry32(this.seed ^ 0x9e3779b9);
    this.elapsed = 0;
    this.lastPick = -9;
    this.streak = this.hearts = this.rainbows = this.stars = this.drops = 0;
    this.nextStar = STAR_EVERY;
    this.boost = this.magnet = 0;
    this.respawn.length = 0;
    this.cloudOn = false;
    this.cloudK = 0;
    this.cloudCool = 0;
    this.host.kit.cloud.visible = false;
    for (const s of this.slots) { s.alive = false; s.k = 0; s.going = false; }
    this.host.field(this.field);
    // her starting spot: the field's centre, facing you
    const a = this.host.stage.actor;
    if (Math.hypot(a.position.x - this.field.x, a.position.z - this.field.z) > this.field.r * 0.8) a.position.set(this.field.x, 0, this.field.z);
    // the opening layout: hearts and one rainbow, spread out (pop in during the countdown)
    for (let i = 0; i < ON_FIELD; i++) this.spawn(i === 4 ? 'rainbow' : 'heart', i * 0.05);
    this.ui.power(null);
    this.ui.streak(0);
    this.stillT = 0;
    this.movedOnce = false;
    this.nudge(false);
  }

  /** The joystick nudge: a ring pulses round the stick and a pill says how to run. */
  private nudge(on: boolean): void {
    const stick = this.host.root.querySelector('.cbx-stick');
    stick?.classList.toggle('cbp-nudge', on);
    if (on && !this.nudgeEl) {
      const p = document.createElement('div');
      p.className = 'cbp-nudge-pill';
      p.setAttribute('role', 'status');
      p.textContent = IS_PHONE ? 'Drag the joystick to run' : 'Arrow keys or the joystick';
      this.host.layer.appendChild(p);
      this.nudgeEl = p;
      requestAnimationFrame(() => p.classList.add('on'));
      this.nudges++;
    } else if (!on && this.nudgeEl) {
      const p = this.nudgeEl;
      this.nudgeEl = null;
      p.classList.remove('on');
      window.setTimeout(() => p.remove(), 400);
    }
  }

  /** A seeded spot in the field: apart from the others, not on her, not in the house, inside the play area. */
  private spot(out: THREE.Vector3): boolean {
    const f = this.field, a = this.host.stage.actor.position;
    const hb = houseBounds(this.host.stage, 0.32, this.house);
    for (let tries = 0; tries < 48; tries++) {
      const sep = tries < 30 ? MIN_SEP : MIN_SEP * 0.6;
      const r = f.r * Math.sqrt(0.04 + 0.96 * this.rng()), ang = this.rng() * Math.PI * 2;
      out.set(f.x + Math.cos(ang) * r, 0, f.z + Math.sin(ang) * r);
      if (hb && out.x > hb.min.x && out.x < hb.max.x && out.z > hb.min.z && out.z < hb.max.z) continue;
      this.t2.copy(out);
      this.host.constrain(this.t2);
      if (this.t2.distanceToSquared(out) > 1e-4) continue;
      if (Math.hypot(out.x - a.x, out.z - a.z) < (tries < 30 ? 0.9 : 0.5)) continue;
      let ok = true;
      for (const s of this.slots) if (s.alive && Math.hypot(s.x - out.x, s.z - out.z) < sep) { ok = false; break; }
      if (ok) return true;
    }
    return false;
  }

  private spawn(kind: PickKind, delay = 0): boolean {
    const s = this.slots.find((x) => !x.alive);
    if (!s || !this.spot(this.t)) return false;
    s.alive = true;
    s.kind = kind;
    s.x = this.t.x; s.z = this.t.z;
    s.k = -delay * 4;
    s.going = false;
    s.age = 0;
    s.life = kind === 'star' ? 9 : kind === 'rainbow' ? 14 : 99;
    s.baseY = kind === 'heart' ? 0.34 : kind === 'star' ? 0.42 : 0.3;
    s.phase = this.rng();
    s.yaw = this.rng() * Math.PI * 2;
    s.hex = kind === 'heart' ? HEART_HEX[Math.floor(this.rng() * HEART_HEX.length)] : kind === 'star' ? PAL.yellow : PAL.white;
    s.beacon = kind === 'heart' ? PAL.pink : kind === 'star' ? PAL.yellow : PAL.purple;
    return true;
  }

  private get onField(): number {
    let n = 0;
    for (const s of this.slots) if (s.alive && !s.going) n++;
    return n;
  }

  // ------------------------------------------------------------------ per frame
  protected tick(dt: number): void {
    const st = this.host.stage, a = st.actor;
    this.elapsed += dt;
    // not moved yet 2.5 s into the round: show how (once she runs, it goes for the rest of the round)
    if (!this.movedOnce) {
      if (a.walking && a.moving > 0.1) { this.movedOnce = true; this.nudge(false); }
      else if ((this.stillT += dt) > 2.5 && !this.nudgeEl) this.nudge(true);
    }
    this.boost = Math.max(0, this.boost - dt);
    this.magnet = Math.max(0, this.magnet - dt);
    // the rainbow boost: faster, with a trail
    if (this.boost > 0 && a.walking && a.moving > 0.1) {
      const sp = RUN_SPEED * 0.6 * a.moving * dt;
      a.position.x += Math.sin(a.heading) * sp;
      a.position.z += Math.cos(a.heading) * sp;
      this.host.constrain(a.position);
      if ((this.trailT -= dt) <= 0) {
        this.trailT = this.host.reduced ? 0.12 : 0.05;
        st.fx.emit({ count: this.host.reduced ? 2 : 3, glyph: ['dot', 'star'], colors: RAINBOW, at: this.t.set(a.position.x, 0.12, a.position.z), spread: [0.1, 0.06, 0.1], vel: [0, 0.25, 0], velSpread: [0.15, 0.1, 0.15], drag: 2, life: [0.5, 0.8], size: [0.05, 0.09] });
      }
    }
    if (this.boost > 0) this.ui.power('Rainbow boost!', this.boost / BOOST_S, true);
    else if (this.magnet > 0) this.ui.power('Blossom magnet!', this.magnet / MAGNET_S);
    else this.ui.power(null);

    // pickups: magnet pull, collect
    const px = a.position.x, pz = a.position.z;
    for (const s of this.slots) {
      if (!s.alive || s.going || s.k < 0.6) continue;
      let d = Math.hypot(s.x - px, s.z - pz);
      if (this.magnet > 0 && s.kind === 'heart' && d < 2.2 && d > 0.05) {
        const step = Math.min(d, (1.2 + (2.2 - d)) * 1.6 * dt);
        s.x += ((px - s.x) / d) * step;
        s.z += ((pz - s.z) / d) * step;
        d -= step;
      }
      if (d < REACH + (this.magnet > 0 ? 0.08 : 0)) this.collect(s);
    }
    // timed pickups leave
    for (const s of this.slots) if (s.alive && !s.going && s.age > s.life) s.going = true;
    // keep the field full (a short beat before a new one appears)
    const want = ON_FIELD - this.respawn.length;
    for (let i = this.onField; i < want; i++) this.respawn.push(0.5 + this.rng() * 0.5);
    for (let i = this.respawn.length - 1; i >= 0; i--) {
      if ((this.respawn[i] -= dt) > 0) continue;
      this.respawn.splice(i, 1);
      const rare = this.rng() < 0.09 && !this.slots.some((s) => s.alive && s.kind === 'rainbow');
      this.spawn(rare ? 'rainbow' : 'heart');
    }
    if (this.elapsed >= this.nextStar) {
      this.nextStar += STAR_EVERY;
      if (this.spawn('star')) this.host.hint('A star! Grab it!');
      window.setTimeout(() => this.host.hint(''), 2200);
    }
    this.raincloud(dt);
  }

  private collect(s: Slot): void {
    const st = this.host.stage, a = st.actor, rm = this.host.reduced;
    s.going = true;
    const quick = this.elapsed - this.lastPick < STREAK_GAP;
    this.lastPick = this.elapsed;
    this.streak = quick ? this.streak + 1 : 1;
    this.ui.streak(this.streak);
    const at = this.t.set(s.x, s.y, s.z);
    if (s.kind === 'heart') {
      this.hearts++;
      let pts = 1;
      const bonus = this.streak % 5 === 0;
      if (bonus) pts += 2;
      this.score += pts;
      this.sounds.blip(this.streak);
      st.fx.emit({ count: rm ? 5 : 10, glyph: 'heart', colors: [PAL.pink, PAL.pinkSoft, PAL.red], at, burst: 0.8, drag: 2.2, gravity: -0.1, life: [0.5, 0.9], size: [0.05, 0.09] });
      this.popAt(at, bonus ? '+3' : '+1', '', bonus ? `${this.streak} in a row` : '');
      a.jiggle(0.08);
    } else if (s.kind === 'rainbow') {
      this.rainbows++;
      this.score += 5;
      this.boost = BOOST_S;
      this.sounds.sparkle();
      st.fx.emit({ count: rm ? 10 : 22, glyph: ['star', 'dot', 'sparkle'], colors: RAINBOW, at, burst: 1.1, drag: 2, life: [0.6, 1.1], size: [0.06, 0.11] });
      this.popAt(at, '+5', 'rainbow', 'Boost!');
      a.face('happy', 2);
      a.jiggle(0.16);
    } else {
      this.stars++;
      this.score += 2;
      this.magnet = MAGNET_S;
      this.sounds.sparkle();
      st.fx.emit({ count: rm ? 8 : 16, glyph: ['star', 'sparkle'], colors: [PAL.yellow, PAL.white, PAL.orange], at, burst: 1, drag: 2, life: [0.6, 1], size: [0.06, 0.12] });
      st.fx.emit({ count: 1, glyph: 'ring', colors: [PAL.yellow], at: this.t2.set(a.position.x, 0.4, a.position.z), life: [0.45, 0.5], size: [0.9, 0.92], spin: 0 });
      this.popAt(at, '+2', 'star', 'Magnet!');
      a.face('happy', 2);
    }
  }

  private raincloud(dt: number): void {
    const st = this.host.stage, a = st.actor;
    if (!this.cloudOn && this.elapsed > CLOUD_AFTER) {
      // it drifts in from the far side of the field
      this.cloudOn = true;
      const f = this.field;
      const ang = Math.atan2(a.position.z - f.z, a.position.x - f.x) + Math.PI;
      this.cloudP.set(f.x + Math.cos(ang) * f.r * 0.9, 1.3, f.z + Math.sin(ang) * f.r * 0.9);
      this.cloudV.set(0, 0, 0);
      this.cloudCool = 1.5;
      this.host.hint('Watch out for the raincloud!');
      window.setTimeout(() => this.host.hint(''), 2600);
    }
    if (!this.cloudOn) return;
    this.cloudCool = Math.max(0, this.cloudCool - dt);
    // seek her slowly (or drift away after a hit), with a little wander
    const sp = (this.host.reduced ? 0.32 : 0.46) * (this.cloudCool > 0 ? -0.6 : 1);
    const dx = a.position.x - this.cloudP.x, dz = a.position.z - this.cloudP.z;
    const d = Math.hypot(dx, dz) || 1;
    const wob = Math.sin(this.elapsed * 0.9) * 0.25;
    this.cloudV.x += ((dx / d) * sp + (-dz / d) * wob - this.cloudV.x) * Math.min(1, dt * 1.5);
    this.cloudV.z += ((dz / d) * sp + (dx / d) * wob - this.cloudV.z) * Math.min(1, dt * 1.5);
    this.cloudP.x += this.cloudV.x * dt;
    this.cloudP.z += this.cloudV.z * dt;
    // stay over the field
    const f = this.field, fx = this.cloudP.x - f.x, fz = this.cloudP.z - f.z, fl = Math.hypot(fx, fz);
    if (fl > f.r) { this.cloudP.x = f.x + (fx / fl) * f.r; this.cloudP.z = f.z + (fz / fl) * f.r; }
    // rain
    if ((this.rainT -= dt) <= 0) {
      this.rainT = this.host.reduced ? 0.16 : 0.07;
      st.fx.emit({ count: 1, glyph: 'dot', colors: [PAL.blue, PAL.sky], at: this.t.set(this.cloudP.x, this.cloudP.y - 0.1, this.cloudP.z), spread: [0.18, 0.02, 0.1], vel: [0, -1.4, 0], gravity: 1.5, life: [0.8, 0.9], size: [0.025, 0.035], floor: 0, bounce: 0, rest: 0.1 });
    }
    // it reaches her: she drops 3 hearts (they pop out and bounce away)
    if (this.cloudCool <= 0 && d < 0.42) {
      this.cloudCool = 4;
      const lost = Math.min(3, this.score);
      this.score -= lost;
      this.drops += lost;
      this.streak = 0;
      this.ui.streak(0);
      this.sounds.bump();
      a.face('surprised', 1.2);
      a.jiggle(-0.22);
      for (let i = 0; i < 3; i++) {
        const ang = (i / 3) * Math.PI * 2 + this.rng();
        this.t.set(a.position.x, 0.6, a.position.z);
        this.t2.set(Math.cos(ang) * 1.1, 2.0, Math.sin(ang) * 1.1);
        st.play.throwHeart(this.t, this.t2).sense = false;
      }
      this.popAt(this.t.set(a.position.x, 1.0, a.position.z), lost ? `-${lost}` : 'Brrr!', 'bad');
    }
  }

  protected visuals(dt: number): void {
    const kit = this.host.kit;
    const live = this.state === 'countdown' || this.state === 'playing' || this.state === 'paused';
    if (this.nudgeEl && this.state !== 'playing') this.nudge(false);
    this.draws.length = 0;
    for (const s of this.slots) {
      if (!s.alive) continue;
      if (!live) s.going = true;
      if (s.going) {
        s.k -= dt * (live ? 6 : 3);
        if (s.k <= 0) { s.alive = false; continue; }
      } else s.k = Math.min(1, s.k + dt * 3);
      if (this.state === 'playing') s.age += dt;
      const kin = Math.max(0, s.k);
      // pop in with a little overshoot; bob and spin
      const pop = s.going ? kin : kin < 1 ? kin * (1.15 - 0.15 * kin) : 1;
      const tt = performance.now() / 1000;
      s.y = s.baseY + Math.sin(tt * 2.4 + s.phase * 6.28) * (this.host.reduced ? 0.02 : 0.05) + (s.going ? (1 - kin) * 0.35 : 0);
      s.yaw += dt * (s.kind === 'star' ? 2.4 : s.kind === 'heart' ? 1.4 : 0.6) * (this.host.reduced ? 0.5 : 1);
      s.s = pop * (s.going ? 1 + (1 - kin) * 0.5 : 1);
      // a pickup about to vanish blinks (stars, rainbows)
      if (!s.going && s.age > s.life - 2.5 && Math.floor(tt * 6) % 2 === 0) s.s *= 0.75;
      this.draws.push(s);
    }
    // the raincloud and its shadow beacon
    const show = this.cloudOn && live;
    this.cloudK = Math.max(0, Math.min(1, this.cloudK + dt * (show ? 2 : -3)));
    const c = kit.cloud;
    c.visible = this.cloudK > 0.01;
    if (c.visible) {
      const tt = performance.now() / 1000;
      c.position.set(this.cloudP.x, this.cloudP.y + Math.sin(tt * 1.7) * 0.04, this.cloudP.z);
      c.scale.setScalar(this.cloudK * (this.cloudCool > 2.5 ? 1.12 : 1));
      // it faces you (yaw only), and grins when it got her
      const cam = this.host.stage.cam;
      c.rotation.set(0, Math.atan2(cam.x - c.position.x, cam.z - c.position.z), 0);
      kit.cloudFrown.rotation.z = this.cloudCool > 2.5 ? Math.PI : 0;
      kit.cloudFrown.position.y = this.cloudCool > 2.5 ? -0.03 : -0.06;
      const sl = this.cloudSlot;
      sl.x = this.cloudP.x; sl.z = this.cloudP.z; sl.beacon = 0x7d8597; sl.s = 0;
      this.draws.push(sl);
    }
    kit.beaconAlpha = this.state === 'paused' ? 0.5 : 1;
    kit.draw(this.draws);
  }

  protected summary(stars: number): { title: string; line: string } {
    const bits = [`${this.hearts} blossom${this.hearts === 1 ? '' : 's'}`];
    if (this.rainbows) bits.push(`${this.rainbows} rainbow${this.rainbows === 1 ? '' : 's'}`);
    if (this.stars) bits.push(`${this.stars} star${this.stars === 1 ? '' : 's'}`);
    const title = stars >= 3 ? 'Parade champion!' : stars === 2 ? 'Super running!' : stars === 1 ? 'Lovely running!' : 'Good try!';
    return { title, line: bits.join(' · ') };
  }

  protected clear(): void {
    this.nudge(false);
    for (const s of this.slots) s.alive = false;
    this.cloudOn = false;
    this.host.kit.cloud.visible = false;
    this.host.kit.draw([]);
  }

  /** Test hook: where the nearest live pickup is (stage-local), or null. */
  nearest(out: THREE.Vector3): THREE.Vector3 | null {
    const a = this.host.stage.actor.position;
    let best: Slot | null = null, bd = Infinity;
    for (const s of this.slots) {
      if (!s.alive || s.going || s.k < 0.6) continue;
      const d = Math.hypot(s.x - a.x, s.z - a.z);
      if (d < bd) { bd = d; best = s; }
    }
    return best ? out.set(best.x, 0, best.z) : null;
  }

  get live(): number {
    return this.onField;
  }
}
