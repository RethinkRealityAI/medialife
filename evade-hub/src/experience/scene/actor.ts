// Bobo on a stage: where he stands, which way he faces, walking/running from the joystick and scripted moves
// for the moments. Uses the BearCharacter contract (play, whenClipDone, setExpression, lookAt, update), plus Bobo's
// own clips by name (`move`) when the character has them.
import * as THREE from 'three';
import type { BearCharacter, BearClip, BearExpression } from '../../shared/contracts';
import { angleTo, damp } from '../core/timeline';

export const WALK_SPEED = 0.75; // stage units (bear heights) per second
export const RUN_SPEED = 1.7;

export class Actor {
  /** Feet on the stage floor; rotation.y = heading (0 = facing +z). The bear is normalised to 1 unit tall inside. */
  readonly holder = new THREE.Group();
  /** Between the holder and the bear: squash-and-stretch and little hops live here (his shadow stays put). */
  readonly body = new THREE.Group();
  bear: BearCharacter | null = null;
  /** Look at this (world space) instead of the camera while set (a heart flying at his). */
  lookOverride: THREE.Vector3 | null = null;
  /** A hop height (stage units) added for one frame by the toss game's side-steps. */
  hop = 0;
  /** Reduced motion: smaller jiggles. */
  soft = false;
  // squash spring: s = vertical stretch (+ taller, - squashed)
  private sq = 0;
  private sqV = 0;
  heading = 0;
  /** > 0 while a moment drives his (the joystick waits). */
  scripted = 0;
  asleep = false;
  moving = 0; // 0..1 smoothed stick magnitude
  private loop: BearClip = 'idle';
  private onceUntil = 0;
  private gait: 'idle' | 'walk' | 'run' = 'idle';
  private tmp = new THREE.Vector3();

  constructor(name: string) {
    this.holder.name = name;
    this.body.name = `${name}-body`;
    this.holder.add(this.body);
  }

  /** A squash-and-stretch jiggle (tap, catch, landing). `amount` ~0.1 small, 0.25 big; negative squashes first. */
  jiggle(amount = 0.14): void {
    this.sqV += (this.soft ? 0.5 : 1) * amount * 22;
  }

  attach(bear: BearCharacter): void {
    this.bear = bear;
    const o = bear.object;
    o.position.set(0, 0, 0);
    o.rotation.set(0, 0, 0);
    o.scale.setScalar(1 / (bear.height || 1));
    o.userData.cbxOwnGpu = !!bear.releaseRenderer;
    this.body.add(o);
    this.gait = 'idle';
    bear.play(this.asleep ? 'sleep' : 'idle', { fade: 0.2 });
    this.loop = this.asleep ? 'sleep' : 'idle';
  }
  detach(): void {
    if (this.bear && this.bear.object.parent === this.body) this.body.remove(this.bear.object);
    this.bear = null;
  }
  get attached(): boolean {
    return !!this.bear && this.bear.object.parent === this.body;
  }

  get position(): THREE.Vector3 {
    return this.holder.position;
  }

  /** Switch the looping clip (only on change: re-playing every frame restarts cross-fades). */
  setLoop(clip: BearClip, fade = 0.3): void {
    if (!this.bear) return;
    if (clip === this.loop && performance.now() > this.onceUntil) return;
    this.loop = clip;
    this.onceUntil = 0;
    this.bear.play(clip, { fade });
  }
  get loopClip(): BearClip {
    return this.loop;
  }

  /** Play a clip once; resolves when it is done (or after maxS as a fallback). */
  once(clip: BearClip, maxS = 4, speed = 1): Promise<void> {
    if (!this.bear) return Promise.resolve();
    this.bear.play(clip, { once: true, fade: 0.25, speed });
    this.onceUntil = performance.now() + maxS * 1000;
    const done = this.bear.whenClipDone();
    return Promise.race([done, new Promise<void>((r) => window.setTimeout(r, maxS * 1000))]).then(() => {
      this.onceUntil = 0;
    });
  }

  /** One of Bobo's own clips by name (Sit, Chill, Purr, Alert...): looping, or once (then back to the loop). */
  move(name: string, once = false, speed = 1): void {
    const b = this.bear as (BearCharacter & { playMove?: (n: string, o: { once?: boolean; fade?: number; speed?: number }) => void; hasMove?: (n: string) => boolean }) | null;
    if (!b) return;
    if (!b.playMove || (b.hasMove && !b.hasMove(name))) { if (once) void this.once('cheer', 4, speed); else this.setLoop('sway'); return; }
    b.playMove(name, { once, fade: 0.3, speed });
    if (once) this.onceUntil = performance.now() + 4000;
    else this.loop = 'sway'; // a named loop: the next setLoop() always switches back
  }

  face(e: BearExpression, hold?: number): void {
    this.bear?.setExpression(e, hold ? { hold } : undefined);
  }

  /** Turn towards a yaw smoothly. */
  turnTo(yaw: number, dt: number, rate = 8): void {
    this.heading += angleTo(this.heading, yaw) * damp(rate, dt);
    this.holder.rotation.y = this.heading;
  }
  /** Turn towards a point (stage-local). */
  turnToPoint(p: THREE.Vector3, dt: number, rate = 8): void {
    const dx = p.x - this.holder.position.x, dz = p.z - this.holder.position.z;
    if (dx * dx + dz * dz > 1e-6) this.turnTo(Math.atan2(dx, dz), dt, rate);
  }
  setHeading(yaw: number): void {
    this.heading = yaw;
    this.holder.rotation.y = yaw;
  }

  /**
   * Joystick locomotion. `dir` is a stage-local XZ direction with length 0..1 (stick magnitude).
   * `constrain` keeps his inside the play area / out of the house. Returns true while he moves.
   */
  drive(dir: THREE.Vector3, dt: number, constrain?: (p: THREE.Vector3) => void): boolean {
    const mag = Math.min(1, dir.length());
    this.moving += (mag - this.moving) * damp(10, dt);
    if (this.scripted > 0) return false;
    if (mag < 0.08) {
      if (this.gait !== 'idle') {
        this.gait = 'idle';
        this.setLoop(this.asleep ? 'sleep' : 'idle', 0.25);
      }
      return false;
    }
    const run = mag > 0.72;
    const want = run ? 'run' : 'walk';
    if (this.gait !== want) {
      this.gait = want;
      this.setLoop(want, 0.2);
    }
    const sp = (run ? RUN_SPEED : WALK_SPEED) * (run ? 1 : 0.55 + 0.6 * mag) * dt;
    this.tmp.copy(dir).setY(0).normalize();
    this.holder.position.addScaledVector(this.tmp, sp);
    constrain?.(this.holder.position);
    this.turnTo(Math.atan2(this.tmp.x, this.tmp.z), dt, 12);
    return true;
  }

  get walking(): boolean {
    return this.gait !== 'idle';
  }
  /** Back to the plain standing loop (after a moment). */
  settle(): void {
    this.gait = 'idle';
    this.setLoop(this.asleep ? 'sleep' : 'idle', 0.35);
  }

  update(dt: number, lookAt: THREE.Vector3 | null): void {
    // squash spring (semi-implicit, stable at 10 fps too): stretch up = thinner, squash = wider
    const h = Math.min(dt, 0.05);
    this.sqV += (-190 * this.sq - 11 * this.sqV) * h;
    this.sq += this.sqV * h;
    if (Math.abs(this.sq) < 1e-4 && Math.abs(this.sqV) < 1e-3) { this.sq = 0; this.sqV = 0; }
    const sq = THREE.MathUtils.clamp(this.sq, -0.3, 0.3);
    this.body.scale.set(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5);
    this.body.position.y = Math.max(0, this.hop);
    const b = this.bear;
    if (!b) return;
    const look = this.lookOverride && !this.asleep ? this.lookOverride : this.asleep || this.walking || this.scripted ? null : lookAt;
    b.lookAt(look);
    // talking while standing: the chatty idle (only switches on change)
    if (!this.asleep && !this.walking && !this.scripted && performance.now() > this.onceUntil) {
      const want: BearClip = b.speaking ? 'talkIdle' : 'idle';
      if ((this.loop === 'idle' || this.loop === 'talkIdle') && this.loop !== want) this.setLoop(want, 0.4);
    }
    b.update(dt);
  }
}
