// A tiny rigid-sphere solver for the playful bits (thrown hearts, bouncing stars, party balloons). No library: the
// scenes only ever need spheres against a floor plane, a few static spheres/boxes (Bobo's body, the hideout door
// walls), sphere-sphere bumps and one "catch" sensor, and cannon-es would cost ~130 KB for that.
//
// Rules that keep world tracking smooth (pitfall 14: tracking quality = frame rate):
//   - fixed timestep (1/120 s) with an accumulator and a hard cap on substeps per frame;
//   - every body is pooled at construction: nothing is allocated while stepping;
//   - bodies fall asleep when they rest, and the owner despawns them (hard caps per kind).
// Units are the stage's (Bobo is 1 unit tall); y is up and the floor is y = 0 unless `floorY` says otherwise.
import * as THREE from 'three';

export const STEP = 1 / 120;
const MAX_SUBSTEPS = 6;

export interface Body {
  readonly index: number;
  alive: boolean;
  asleep: boolean;
  /** Position / velocity (stage units, per second). */
  readonly p: THREE.Vector3;
  readonly v: THREE.Vector3;
  /** Orientation and angular velocity (rad/s, world axes) for the visuals. */
  readonly q: THREE.Quaternion;
  readonly w: THREE.Vector3;
  r: number;
  /** 0..1 bounciness against the floor and statics. */
  restitution: number;
  /** Tangential slow-down per second while touching the floor (rolling/sliding friction). */
  friction: number;
  /** Air drag per second. */
  drag: number;
  /** Gravity multiplier (negative floats up, e.g. a balloon). */
  gravity: number;
  /** Optional hover height: an upward spring towards it (balloons). NaN = off. */
  hover: number;
  /** Collides with other bodies. */
  bump: boolean;
  /** Can trip the sensor (thrown hearts while flying). */
  sense: boolean;
  /** Touching the floor this step. */
  grounded: boolean;
  /** Has touched the floor or a static since it was spawned. */
  landed: boolean;
  /** Seconds since spawn, and seconds spent resting. */
  age: number;
  rest: number;
  /** Squash spring for the visuals (0 = round), set on impacts. */
  squash: number;
  squashV: number;
  /** Owner data: which pool it belongs to and the slot in that pool's instanced mesh. */
  kind: number;
  slot: number;
  /** Free-form owner value (colour index, etc.). */
  tag: number;
}

export interface StaticSphere { readonly c: THREE.Vector3; r: number; on: boolean }
export interface StaticBox { readonly min: THREE.Vector3; readonly max: THREE.Vector3; on: boolean }

export interface WorldHooks {
  /** A body hit the floor or a static hard enough to notice (speed = normal speed before the bounce). */
  onImpact?(b: Body, speed: number): void;
  /** A sensing body entered the sensor sphere. Return true to consume it (the body is freed). */
  onSense?(b: Body): boolean;
}

export class World {
  readonly bodies: Body[] = [];
  gravityY = 9.81;
  floorY = 0;
  /** Static colliders, created once and switched on/off. */
  readonly spheres: StaticSphere[] = [];
  readonly boxes: StaticBox[] = [];
  /** One catch sensor (his arms). */
  readonly sensor: StaticSphere = { c: new THREE.Vector3(), r: 0, on: false };
  hooks: WorldHooks = {};
  private acc = 0;
  private tq = new THREE.Quaternion();
  private ta = new THREE.Vector3();
  private tn = new THREE.Vector3();
  /** Time accumulated by the hover wobble (balloons sway together, phase per body). */
  private clock = 0;

  constructor(capacity: number) {
    for (let i = 0; i < capacity; i++) {
      this.bodies.push({
        index: i, alive: false, asleep: false, p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(),
        w: new THREE.Vector3(), r: 0.1, restitution: 0.5, friction: 2, drag: 0.1, gravity: 1, hover: NaN, bump: true,
        sense: false, grounded: false, landed: false, age: 0, rest: 0, squash: 0, squashV: 0, kind: 0, slot: 0, tag: 0,
      });
    }
  }

  addSphere(r: number): StaticSphere {
    const s = { c: new THREE.Vector3(), r, on: false };
    this.spheres.push(s);
    return s;
  }
  addBox(): StaticBox {
    const b = { min: new THREE.Vector3(), max: new THREE.Vector3(), on: false };
    this.boxes.push(b);
    return b;
  }

  /** Reset a pooled body for reuse (the caller sets kind/slot and the rest). */
  spawn(b: Body, p: THREE.Vector3, v: THREE.Vector3, r: number): Body {
    b.alive = true; b.asleep = false; b.grounded = false; b.landed = false;
    b.p.copy(p); b.v.copy(v); b.r = r; b.age = 0; b.rest = 0; b.squash = 0; b.squashV = 0;
    b.restitution = 0.5; b.friction = 2; b.drag = 0.1; b.gravity = 1; b.hover = NaN; b.bump = true; b.sense = false;
    b.w.set(0, 0, 0); b.q.identity(); b.tag = 0;
    return b;
  }

  free(b: Body): void {
    b.alive = false;
  }

  clear(): void {
    for (const b of this.bodies) b.alive = false;
    this.acc = 0;
  }

  get awakeCount(): number {
    let n = 0;
    for (const b of this.bodies) if (b.alive && !b.asleep) n++;
    return n;
  }

  /** Advance by a frame's dt in fixed substeps. Returns the number of substeps run. */
  step(dt: number): number {
    this.acc = Math.min(this.acc + Math.max(0, dt), STEP * MAX_SUBSTEPS);
    let n = 0;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.sub(STEP);
      n++;
    }
    // ages and the visual squash spring run once per frame (smooth at any frame rate)
    for (const b of this.bodies) {
      if (!b.alive) continue;
      b.age += dt;
      if (b.asleep) b.rest += dt;
      // critically-damped-ish spring: wobble a couple of times, then round again
      b.squashV += (-170 * b.squash - 9 * b.squashV) * Math.min(dt, 0.05);
      b.squash += b.squashV * Math.min(dt, 0.05);
    }
    return n;
  }

  private sub(h: number): void {
    const g = this.gravityY;
    this.clock += h;
    const bodies = this.bodies;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (!b.alive || b.asleep) continue;
      // forces
      b.v.y -= g * b.gravity * h;
      if (b.hover === b.hover) {
        // NaN check above: hover springs towards a height with a soft, slow bob (balloons)
        const want = b.hover + Math.sin(this.clock * 1.3 + b.index) * 0.05;
        b.v.y += (want - b.p.y) * 3.2 * h;
        b.v.x += Math.sin(this.clock * 0.7 + b.index * 1.7) * 0.08 * h;
        b.v.z += Math.cos(this.clock * 0.6 + b.index * 2.3) * 0.08 * h;
      }
      const k = Math.exp(-b.drag * h);
      b.v.multiplyScalar(k);
      b.p.addScaledVector(b.v, h);
      // spin (visual)
      const wl = b.w.length();
      if (wl > 1e-4) {
        this.tq.setFromAxisAngle(this.ta.copy(b.w).divideScalar(wl), wl * h);
        b.q.premultiply(this.tq);
      }
      // floor
      b.grounded = false;
      const fy = this.floorY + b.r;
      if (b.p.y < fy) {
        b.p.y = fy;
        if (b.v.y < 0) {
          const s = -b.v.y;
          if (s > 0.6) this.impact(b, s);
          b.v.y = s > 0.35 ? s * b.restitution : 0;
        }
        b.grounded = true;
        b.landed = true;
        const f = Math.exp(-b.friction * h);
        b.v.x *= f;
        b.v.z *= f;
        // roll: angular velocity matches the ground speed (reads as a soft toy tumbling)
        b.w.set(b.v.z / b.r, b.w.y * f, -b.v.x / b.r);
      }
      // sensor (before the statics: his arms reach out in front of his body)
      const sn = this.sensor;
      if (sn.on && b.sense && this.hooks.onSense) {
        const rr = sn.r + b.r;
        if (b.p.distanceToSquared(sn.c) < rr * rr && this.hooks.onSense(b)) {
          b.alive = false;
          continue;
        }
      }
      // statics
      for (let j = 0; j < this.spheres.length; j++) {
        const s = this.spheres[j];
        if (s.on) this.vsSphere(b, s.c, s.r);
      }
      for (let j = 0; j < this.boxes.length; j++) {
        const s = this.boxes[j];
        if (s.on) this.vsBox(b, s);
      }
      // sleep: resting on the floor, slow for a moment
      if (b.grounded && b.v.lengthSq() < 0.0036) {
        b.rest += h;
        if (b.rest > 0.35) {
          b.asleep = true;
          b.v.set(0, 0, 0);
          b.w.set(0, 0, 0);
        }
      } else if (!b.asleep) b.rest = 0;
    }
    // body vs body (few bodies: O(n^2) is fine and allocation-free)
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      if (!a.alive || !a.bump) continue;
      for (let j = i + 1; j < bodies.length; j++) {
        const c = bodies[j];
        if (!c.alive || !c.bump || (a.asleep && c.asleep)) continue;
        const rr = a.r + c.r;
        const n = this.tn.subVectors(c.p, a.p);
        const d2 = n.lengthSq();
        if (d2 >= rr * rr || d2 < 1e-10) continue;
        const d = Math.sqrt(d2);
        n.divideScalar(d);
        const pen = (rr - d) * 0.5;
        a.p.addScaledVector(n, -pen);
        c.p.addScaledVector(n, pen);
        const vn = (c.v.x - a.v.x) * n.x + (c.v.y - a.v.y) * n.y + (c.v.z - a.v.z) * n.z;
        if (vn < 0) {
          const e = Math.min(a.restitution, c.restitution);
          const jn = (-(1 + e) * vn) / 2;
          a.v.addScaledVector(n, -jn);
          c.v.addScaledVector(n, jn);
          if (-vn > 0.5) { this.impact(a, -vn * 0.6); this.impact(c, -vn * 0.6); }
        }
        if (a.asleep) { a.asleep = false; a.rest = 0; }
        if (c.asleep) { c.asleep = false; c.rest = 0; }
      }
    }
  }

  private vsSphere(b: Body, c: THREE.Vector3, r: number): void {
    const rr = r + b.r;
    const n = this.tn.subVectors(b.p, c);
    const d2 = n.lengthSq();
    if (d2 >= rr * rr) return;
    const d = Math.sqrt(d2) || 1e-4;
    n.divideScalar(d);
    b.p.copy(c).addScaledVector(n, rr);
    this.reflect(b, n);
  }

  private vsBox(b: Body, box: StaticBox): void {
    // closest point on the box
    const cx = THREE.MathUtils.clamp(b.p.x, box.min.x, box.max.x);
    const cy = THREE.MathUtils.clamp(b.p.y, box.min.y, box.max.y);
    const cz = THREE.MathUtils.clamp(b.p.z, box.min.z, box.max.z);
    const n = this.tn.set(b.p.x - cx, b.p.y - cy, b.p.z - cz);
    const d2 = n.lengthSq();
    if (d2 >= b.r * b.r) return;
    if (d2 > 1e-10) {
      const d = Math.sqrt(d2);
      n.divideScalar(d);
      b.p.addScaledVector(n, b.r - d);
    } else {
      // centre inside: push out through the nearest face
      const dx0 = b.p.x - box.min.x, dx1 = box.max.x - b.p.x, dz0 = b.p.z - box.min.z, dz1 = box.max.z - b.p.z, dy1 = box.max.y - b.p.y;
      const m = Math.min(dx0, dx1, dz0, dz1, dy1);
      n.set(0, 0, 0);
      if (m === dy1) { n.y = 1; b.p.y = box.max.y + b.r; }
      else if (m === dx0) { n.x = -1; b.p.x = box.min.x - b.r; }
      else if (m === dx1) { n.x = 1; b.p.x = box.max.x + b.r; }
      else if (m === dz0) { n.z = -1; b.p.z = box.min.z - b.r; }
      else { n.z = 1; b.p.z = box.max.z + b.r; }
    }
    this.reflect(b, n);
  }

  private reflect(b: Body, n: THREE.Vector3): void {
    const vn = b.v.dot(n);
    if (vn < 0) {
      if (-vn > 0.6) this.impact(b, -vn);
      b.v.addScaledVector(n, -(1 + b.restitution) * vn);
      b.v.multiplyScalar(0.92);
    }
    b.landed = true;
    if (b.asleep) { b.asleep = false; b.rest = 0; }
  }

  private impact(b: Body, speed: number): void {
    b.squashV -= Math.min(6, speed * 2.2);
    this.hooks.onImpact?.(b, speed);
  }
}
