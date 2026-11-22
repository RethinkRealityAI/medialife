// Heart toss: swipe up to throw soft hearts at Happi (3D and AR). She watches each one come, shuffles to get
// under it and catches it in her arms (a small cheer, a heart burst, a squash-and-stretch); misses bounce on the floor
// (the cloud in 3D, your real floor in AR), roll, settle and shrink away. Catches in a row show a gentle counter.
//
// The throw is aim-assisted for little hands: the swipe's lean picks a direction and its length a distance; close
// enough to her counts as "at her". Everything runs in the stage's local space, so the same code serves both modes.
import * as THREE from 'three';
import './toss.css';
import type { Body } from './world';
import type { Stage } from '../scene/stage';
import type { MomentRunner } from '../scene/moments';
import { PAL, RAINBOW } from '../scene/fx';

export interface TossHost {
  stage: Stage;
  runner: MomentRunner;
  /** The HUD's overlay layer (the counter goes here). */
  layer: HTMLElement;
  reduced: boolean;
  /** Keeps her side-steps inside the play area (AR: out of the house walls, never through the door). */
  constrain?(p: THREE.Vector3): void;
  /** A catch happened (the mode may clear its hint, etc.). */
  onCatch?(combo: number): void;
}

const HEART_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 21.2 3.9 13.4A5.1 5.1 0 0 1 12 6.6a5.1 5.1 0 0 1 8.1 6.8Z"/></svg>';
const UP = new THREE.Vector3(0, 1, 0);
/** Side-step speed (stage units / s) and how far she may shuffle for one heart. */
const STEP_SPEED = 2.1;
const STEP_BUDGET = 0.7;

export class HeartToss {
  thrown = 0;
  caught = 0;
  combo = 0;
  best = 0;
  private last = -1e9;
  private badge: HTMLElement;
  private badgeN: HTMLElement;
  private badgeT = 0;
  private target: Body | null = null;
  private budget = 0;
  private hopPh = 0;
  private sensorY = 0.6;
  private lookW = new THREE.Vector3();
  private o = new THREE.Vector3();
  private v = new THREE.Vector3();
  private t = new THREE.Vector3();
  private d = new THREE.Vector3();
  private pred = new THREE.Vector3();

  constructor(private host: TossHost) {
    const play = host.stage.play;
    play.reduced = host.reduced;
    play.onCatch = (b) => this.catch(b);
    play.onMiss = () => this.miss();
    play.onBonk = () => this.bonk();
    this.badge = document.createElement('div');
    this.badge.className = 'cbx-combo';
    this.badge.setAttribute('role', 'status');
    this.badge.innerHTML = `${HEART_SVG}<b>0</b><span>in a row</span>`;
    this.badgeN = this.badge.querySelector('b')!;
  }

  /** Show / hide the counter with the mode. */
  show(on: boolean): void {
    if (on) this.host.layer.appendChild(this.badge);
    else { this.badge.remove(); this.badge.classList.remove('on'); }
  }

  /**
   * Throw a heart. `power` 0..1 (swipe length/speed: ~0.5 reaches her), `side` -0.6..0.6 rad (swipe lean, + = right).
   * Returns false while the previous throw is too recent or she isn't there.
   */
  throw(power: number, side = 0): boolean {
    const st = this.host.stage, a = st.actor;
    const now = performance.now();
    if (!a.bear || now - this.last < 200) return false;
    this.last = now;
    const unitsPerM = 1 / (st.variant === 'ar' ? Math.max(0.05, st.root.scale.x) : 0.9);
    // from low in your view, as if from your hand (it grows to full size as it leaves)
    this.o.copy(st.cam).addScaledVector(st.camDir, 0.5 * unitsPerM);
    this.o.y = Math.max(0.15, this.o.y - 0.22 * unitsPerM);
    // at her chest, where her arms are (a little in front of her, towards you)
    this.d.subVectors(this.o, a.position).setY(0);
    if (this.d.lengthSq() > 1e-6) this.d.normalize();
    this.t.copy(a.position).addScaledVector(this.d, 0.15).setY(0.55);
    this.d.subVectors(this.t, this.o).setY(0);
    const dist = Math.max(0.25, this.d.length());
    this.d.divideScalar(dist);
    // direction: where you look, leaned by the swipe; snapped onto her when it's close (aim assist)
    this.v.copy(st.camDir).setY(0);
    if (this.v.lengthSq() < 1e-6) this.v.copy(this.d);
    this.v.normalize().applyAxisAngle(UP, -THREE.MathUtils.clamp(side, -0.6, 0.6) * 0.8);
    const ang = Math.acos(THREE.MathUtils.clamp(this.v.dot(this.d), -1, 1));
    const snap = THREE.MathUtils.clamp((0.6 - ang) / 0.3, 0, 1);
    this.v.lerp(this.d, snap).normalize();
    // distance: the swipe's power; within 20 % of her counts as "at her"
    let D = dist * (0.45 + THREE.MathUtils.clamp(power, 0, 1.2) * 1.1);
    if (Math.abs(D / dist - 1) < 0.2 && snap > 0.5) D = dist;
    // a soft lob that comes down at her chest height after D
    const g = st.play.world.gravityY;
    const dy = this.t.y - this.o.y;
    let elev = 0.52;
    let den = D * Math.tan(elev) - dy;
    if (den < 0.12 * D) { elev = Math.atan((dy + 0.12 * D) / D) + 0.08; den = D * Math.tan(elev) - dy; }
    const c = Math.cos(elev);
    const speed = Math.min(16 * unitsPerM, Math.sqrt((g * D * D) / (2 * c * c * Math.max(den, 1e-3))));
    this.v.multiplyScalar(c * speed).addScaledVector(UP, Math.sin(elev) * speed);
    st.play.throwHeart(this.o, this.v);
    this.thrown++;
    this.budget = STEP_BUDGET;
    if (a.asleep) a.face('sleepy');
    return true;
  }

  /** Per frame, BEFORE stage.update (it sets her catch sensor for this frame's physics). */
  update(dt: number): void {
    const st = this.host.stage, a = st.actor, play = st.play;
    const free = !!a.bear && !a.asleep && !a.walking && a.scripted === 0 && !this.host.runner.busy;
    // find the heart that will reach her first
    let best: Body | null = null, bt = 9, bd = 0;
    for (const b of play.pool('heart')) {
      if (!b.alive || !b.sense) continue;
      const rx = a.position.x - b.p.x, rz = a.position.z - b.p.z;
      const d = Math.hypot(rx, rz) || 1e-3;
      const closing = (b.v.x * rx + b.v.z * rz) / d;
      if (closing < 0.3) continue;
      const tt = d / closing;
      if (tt < bt) { bt = tt; best = b; bd = d; }
    }
    this.target = best;
    let hop = 0;
    let wantY = 0.6;
    if (best && !a.asleep) {
      a.lookOverride = st.root.localToWorld(this.lookW.copy(best.p));
      // where it will be when it reaches her
      const T = Math.min(bt, 1.2);
      this.pred.copy(best.p).addScaledVector(best.v, T);
      this.pred.y -= 0.5 * play.world.gravityY * T * T;
      // she reaches up or bends down for it once it's close
      if (bd < 1.0) wantY = THREE.MathUtils.clamp(best.p.y, 0.32, 0.8);
      if (free) {
        a.turnToPoint(best.p, dt, 10);
        // shuffle under it when it's close and a little off to the side
        const lx = this.pred.x - a.position.x, lz = this.pred.z - a.position.z;
        const off = Math.hypot(lx, lz);
        if (bt < 0.75 && off > 0.1 && off < 0.9 && this.budget > 0 && bd > 0.35) {
          const step = Math.min(off - 0.06, STEP_SPEED * dt, this.budget);
          this.budget -= step;
          a.position.x += (lx / off) * step;
          a.position.z += (lz / off) * step;
          this.host.constrain?.(a.position);
          this.hopPh += dt * 18;
          hop = Math.abs(Math.sin(this.hopPh)) * (this.host.reduced ? 0.015 : 0.04);
        }
      }
    } else a.lookOverride = null;
    a.hop = hop;
    this.sensorY += (wantY - this.sensorY) * Math.min(1, dt * 16);
    st.catching = !!a.bear && !a.asleep;
    st.catchY = this.sensorY;
    // reach a little towards the incoming heart: the sensor sits slightly in front of her
    if (this.badgeT > 0 && (this.badgeT -= dt) <= 0) this.badge.classList.remove('on', 'big');
  }

  /** Forget the round (Start again / leaving the mode). */
  reset(): void {
    this.combo = 0;
    this.target = null;
    this.badge.classList.remove('on', 'big');
    this.host.stage.actor.lookOverride = null;
    this.host.stage.actor.hop = 0;
  }

  get flying(): number {
    let n = 0;
    for (const b of this.host.stage.play.pool('heart')) if (b.alive && b.sense) n++;
    return n;
  }

  // ------------------------------------------------------------------ outcomes
  private catch(b: Body): boolean {
    const st = this.host.stage, a = st.actor;
    if (!a.bear || a.asleep) return false;
    const fx = st.fx, rm = this.host.reduced;
    fx.emit({ count: rm ? 6 : 12, glyph: 'heart', colors: [PAL.pink, PAL.pinkSoft, PAL.red], at: b.p, burst: 0.8, drag: 2.2, gravity: -0.1, life: [0.6, 1], size: [0.05, 0.09] });
    fx.emit({ count: 1, glyph: 'ring', colors: [PAL.white], at: b.p, life: [0.25, 0.28], size: [0.3, 0.31], spin: 0 });
    a.jiggle(0.17);
    this.combo++;
    this.caught++;
    this.best = Math.max(this.best, this.combo);
    if (a.scripted === 0 && !this.host.runner.busy && !a.walking) {
      void a.once(this.combo % 5 === 0 ? 'cheer' : 'present', 2.2, 1.25);
    }
    a.face('happy', 1.6);
    if (this.combo % 5 === 0) {
      // every five in a row: a ring of bouncing stars around her
      st.play.starBurst(this.t.copy(a.position).setY(0.5), rm ? 4 : 8, 1.3, RAINBOW, 1.8);
    }
    this.showCombo();
    this.host.onCatch?.(this.combo);
    return true;
  }

  private miss(): void {
    const a = this.host.stage.actor;
    if (this.combo >= 2) this.badge.classList.remove('on', 'big');
    this.combo = 0;
    if (a.bear && !a.asleep && a.scripted === 0) a.face('surprised', 0.7);
  }

  private bonk(): void {
    const a = this.host.stage.actor;
    a.jiggle(-0.15);
    this.combo = 0;
    if (a.asleep) this.host.runner.nudge();
  }

  private showCombo(): void {
    if (this.combo < 2) return;
    this.badgeN.textContent = String(this.combo);
    const el = this.badge;
    el.classList.toggle('big', this.combo >= 5);
    el.classList.add('on');
    el.classList.remove('pop');
    void el.offsetWidth; // restart the pop animation
    el.classList.add('pop');
    this.badgeT = 3;
  }
}

/** A hug (long press on her), shared with AR: she squeezes, a ring of hearts rises around her. */
export function hugBear(stage: Stage, runner: MomentRunner, reduced: boolean): void {
  const a = stage.actor, p = a.position;
  if (a.asleep) { a.jiggle(-0.12); runner.nudge(); return; }
  a.jiggle(-0.24);
  a.face('happy', 2.5);
  if (!runner.busy && a.scripted === 0 && !a.walking) void a.once('present', 2.2, 1);
  const at = HUG_AT.set(p.x, 0.55, p.z);
  stage.fx.emit({ count: reduced ? 8 : 16, glyph: 'heart', colors: [PAL.pink, PAL.red, PAL.pinkSoft], at, ring: 0.42, spread: [0, 0.12, 0], vel: [0, 0.55, 0], velSpread: [0.05, 0.12, 0.05], drag: 0.8, life: [1.1, 1.6], size: [0.07, 0.12], sway: 0.03 });
  stage.fx.emit({ count: reduced ? 4 : 8, glyph: 'heart', colors: [PAL.pink, PAL.white], at: HUG_AT.setY(0.7), burst: 0.9, drag: 2, life: [0.7, 1], size: [0.08, 0.14] });
  stage.fx.emit({ count: 1, glyph: 'ring', colors: [PAL.pinkSoft], at: HUG_AT.setY(0.6), life: [0.35, 0.4], size: [0.7, 0.72], spin: 0 });
}
const HUG_AT = new THREE.Vector3();
