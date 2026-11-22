// The physical toys of one stage: soft hearts (thrown at Bobo), bouncing stars (sparkles, the fizz orb)
// and party balloons (they float, bump each other and pop when tapped). One World, three pooled instanced meshes
// (one draw and one program each, built and compiled with the stage at load), plus the balloons' strings in one line
// draw. Flat colours only. Everything despawns: resting toys shrink away, each kind has a hard cap and the oldest is
// recycled first. Nothing is allocated per frame.
import * as THREE from 'three';
import { World, type Body } from './world';
import { PAL, RAINBOW, type Particles } from '../scene/fx';

export const KIND = { heart: 0, star: 1, balloon: 2 } as const;
export type ToyKind = keyof typeof KIND;

const CAP = { heart: 14, star: 36, balloon: 9 };
export const HEART_R = 0.085;
export const STAR_R = 0.06;
export const BALLOON_R = 0.16;

/** How long a resting toy stays before it shrinks away, and its longest life. */
const REST_LIFE = [1.8, 1.1, 99];
const MAX_AGE = [10, 7, 40];
const FADE = 0.35;

export const HEART_COLORS = [PAL.pink, PAL.red, PAL.yellow, PAL.sky];
export const BALLOON_COLORS = [PAL.pink, PAL.blue, PAL.yellow, PAL.green, PAL.purple, PAL.orange, PAL.red];

/** Extra per-body state the World doesn't need. */
interface ToyState {
  /** 0..1 shrink-away progress (> 0 = leaving). */
  out: number;
  /** Popped / caught: free on the next update. */
  gone: boolean;
  /** Settling into a lying pose (hearts, stars) 0..1. */
  settle: number;
  readonly restQ: THREE.Quaternion;
  /** Balloon let go (floats off). */
  released: boolean;
  hex: number;
}

function heartShape(): THREE.Shape {
  // a soft heart, y up, about 2 units wide
  const s = new THREE.Shape();
  s.moveTo(0, -0.95);
  s.bezierCurveTo(-1.15, -0.1, -1.0, 0.95, -0.42, 0.95);
  s.bezierCurveTo(-0.15, 0.95, 0, 0.75, 0, 0.6);
  s.bezierCurveTo(0, 0.75, 0.15, 0.95, 0.42, 0.95);
  s.bezierCurveTo(1.0, 0.95, 1.15, -0.1, 0, -0.95);
  return s;
}
function starShape(): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 + Math.PI / 2, r = i % 2 ? 0.46 : 1;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
}
/** Centre a geometry and scale it so its bounding sphere has radius 1 (the body radius then is the instance scale). */
function unit(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.computeBoundingBox();
  const c = g.boundingBox!.getCenter(new THREE.Vector3());
  g.translate(-c.x, -c.y, -c.z);
  g.computeBoundingSphere();
  const r = g.boundingSphere!.radius || 1;
  g.scale(1 / r, 1 / r, 1 / r);
  g.computeBoundingSphere();
  return g;
}

function toyMesh(geo: THREE.BufferGeometry, cap: number, rough: number, name: string): THREE.InstancedMesh {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: rough, metalness: 0 });
  const m = new THREE.InstancedMesh(geo, mat, cap);
  m.name = name;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const c = new THREE.Color(1, 1, 1);
  for (let i = 0; i < cap; i++) m.setColorAt(i, c); // instanceColor exists before the first compile (no recompile later)
  m.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  m.count = 0;
  m.frustumCulled = false;
  return m;
}

export class Playground {
  readonly group = new THREE.Group();
  readonly world: World;
  readonly hearts: THREE.InstancedMesh;
  readonly stars: THREE.InstancedMesh;
  readonly balloons: THREE.InstancedMesh;
  readonly strings: THREE.LineSegments;
  /** Bobo's body (two static spheres) and the house walls (AR). */
  readonly bearLow;
  readonly bearHigh;
  readonly houseBox;
  /** A heart reached his paws (the sensor). Return true to consume it. */
  onCatch: ((b: Body) => boolean) | null = null;
  /** A heart touched the floor for the first time (a miss). */
  onMiss: ((b: Body) => void) | null = null;
  /** A thrown heart bonked his body (he was asleep, so the sensor was off). */
  onBonk: ((b: Body) => void) | null = null;
  /** Reduced motion: fewer stars, softer bounces. */
  reduced = false;
  private pools: Body[][] = [[], [], []];
  private state: ToyState[] = [];
  private strPos: Float32Array;
  private rope: Float32Array; // 9 balloons x 3 points x xyz
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private t0 = new THREE.Vector3();
  private t1 = new THREE.Vector3();
  private bear = new THREE.Vector3();

  constructor(private fx: Particles) {
    this.group.name = 'playground';
    const total = CAP.heart + CAP.star + CAP.balloon;
    this.world = new World(total);
    let i = 0;
    for (const [kind, n] of [[0, CAP.heart], [1, CAP.star], [2, CAP.balloon]] as const) {
      for (let s = 0; s < n; s++, i++) {
        const b = this.world.bodies[i];
        b.kind = kind;
        b.slot = s;
        this.pools[kind].push(b);
      }
    }
    for (let k = 0; k < total; k++) this.state.push({ out: 0, gone: false, settle: 0, restQ: new THREE.Quaternion(), released: false, hex: 0xffffff });

    const ext = { depth: 0.5, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.16, bevelSegments: 3, curveSegments: 10 };
    this.hearts = toyMesh(unit(new THREE.ExtrudeGeometry(heartShape(), ext)), CAP.heart, 0.42, 'toy-hearts');
    this.stars = toyMesh(unit(new THREE.ExtrudeGeometry(starShape(), { ...ext, depth: 0.32, bevelThickness: 0.14, bevelSize: 0.1, curveSegments: 1 })), CAP.star, 0.35, 'toy-stars');
    const bg = new THREE.SphereGeometry(1, 20, 14);
    bg.scale(1, 1.16, 1);
    const knot = new THREE.ConeGeometry(0.16, 0.2, 8);
    knot.translate(0, -1.2, 0);
    this.balloons = toyMesh(mergeTwo(bg, knot), CAP.balloon, 0.28, 'toy-balloons');
    this.strPos = new Float32Array(CAP.balloon * 3 * 2 * 3);
    this.rope = new Float32Array(CAP.balloon * 3 * 3);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.strPos, 3).setUsage(THREE.DynamicDrawUsage));
    sg.setDrawRange(0, 0);
    this.strings = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, toneMapped: false }));
    this.strings.frustumCulled = false;
    this.strings.name = 'toy-strings';
    this.group.add(this.hearts, this.stars, this.balloons, this.strings);

    const w = this.world;
    this.bearLow = w.addSphere(0.3);
    this.bearHigh = w.addSphere(0.25);
    this.houseBox = w.addBox();
    w.sensor.r = 0.3;
    w.hooks = {
      onSense: (b) => this.onCatch?.(b) ?? false,
      onImpact: (b, speed) => this.impact(b, speed),
    };
  }

  get liveCount(): number {
    let n = 0;
    for (const b of this.world.bodies) if (b.alive) n++;
    return n;
  }
  count(kind: ToyKind): number {
    let n = 0;
    for (const b of this.pools[KIND[kind]]) if (b.alive) n++;
    return n;
  }
  /** Bodies of a kind (read-only use: the toss game looks at flying hearts). */
  pool(kind: ToyKind): readonly Body[] {
    return this.pools[KIND[kind]];
  }

  /** Per frame: where he stands (stage-local), whether his paws are up (awake, not walking). */
  setBear(pos: THREE.Vector3, catching: boolean, sensorY = 0.6): void {
    this.bear.copy(pos);
    this.bearLow.c.set(pos.x, 0.3, pos.z);
    this.bearHigh.c.set(pos.x, 0.72, pos.z);
    this.bearLow.on = this.bearHigh.on = true;
    this.world.sensor.on = catching;
    this.world.sensor.c.set(pos.x, sensorY, pos.z);
  }

  /** Point the sensor a little towards the throw (his arms reach out). */
  get sensor(): THREE.Vector3 {
    return this.world.sensor.c;
  }

  // ------------------------------------------------------------------ spawning
  private take(kind: number): Body {
    const pool = this.pools[kind];
    let pick: Body | null = null;
    for (const b of pool) if (!b.alive) { pick = b; break; }
    if (!pick) {
      // recycle: the one resting longest, else the oldest
      let best = -1;
      for (const b of pool) {
        const score = (b.asleep ? 100 + b.rest : 0) + b.age;
        if (score > best) { best = score; pick = b; }
      }
    }
    const st = this.state[pick!.index];
    st.out = 0; st.gone = false; st.settle = 0; st.released = false;
    return pick!;
  }

  /** A thrown heart (stage-local origin and velocity; `hex` picks its colour, e.g. Paw Hoops' gold heart). */
  throwHeart(from: THREE.Vector3, vel: THREE.Vector3, hex?: number): Body {
    const b = this.world.spawn(this.take(KIND.heart), from, vel, HEART_R);
    b.restitution = this.reduced ? 0.3 : 0.48;
    b.friction = 3.2;
    b.drag = 0.15;
    b.sense = true;
    b.w.set((Math.random() - 0.5) * 3, 6 + Math.random() * 3, (Math.random() - 0.5) * 3);
    // start facing the direction of travel's opposite (you see its face as it leaves you)
    this.e.set(0, Math.atan2(-vel.x, -vel.z), 0);
    b.q.setFromEuler(this.e);
    const st = this.state[b.index];
    st.hex = hex ?? HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)];
    this.restPose(b, st);
    return b;
  }

  /** A bouncing star (Rainbow, the Stare). */
  star(at: THREE.Vector3, vel: THREE.Vector3, hex: number, r = STAR_R): Body {
    const b = this.world.spawn(this.take(KIND.star), at, vel, r);
    b.restitution = this.reduced ? 0.35 : 0.62;
    b.friction = 4;
    b.drag = 0.25;
    b.w.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 10);
    this.e.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    b.q.setFromEuler(this.e);
    const st = this.state[b.index];
    st.hex = hex;
    this.restPose(b, st);
    return b;
  }

  /** A burst of bouncing stars from a point, flying up and out. */
  starBurst(at: THREE.Vector3, n: number, speed = 1.6, colors: readonly number[] = RAINBOW, up = 1.6): void {
    const count = Math.max(1, Math.round(n * (this.reduced ? 0.5 : 1)));
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.45 + Math.random() * 0.55);
      this.t1.set(Math.cos(a) * s, up * (0.7 + Math.random() * 0.6), Math.sin(a) * s);
      this.star(at, this.t1, colors[i % colors.length], STAR_R * (0.8 + Math.random() * 0.5));
    }
  }

  /** Party balloons around a point (stage-local), floating at `height`. */
  balloonsAround(at: THREE.Vector3, n: number, height: number, radius = 0.8): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      this.t0.set(at.x + Math.cos(a) * radius * (0.8 + Math.random() * 0.4), 0.25 + Math.random() * 0.2, at.z + Math.sin(a) * radius * (0.8 + Math.random() * 0.4));
      this.t1.set(0, 0.6 + Math.random() * 0.5, 0);
      const b = this.world.spawn(this.take(KIND.balloon), this.t0, this.t1, BALLOON_R * (0.9 + Math.random() * 0.25));
      b.gravity = 0;
      b.hover = height + (Math.random() - 0.5) * 0.45;
      b.drag = 1.4;
      b.restitution = 0.7;
      b.friction = 1;
      const st = this.state[b.index];
      st.hex = BALLOON_COLORS[(i + Math.floor(Math.random() * 3)) % BALLOON_COLORS.length];
      // the string hangs straight down from the knot to start with
      for (let k = 0; k < 3; k++) {
        const o = (b.slot * 3 + k) * 3;
        this.rope[o] = this.t0.x; this.rope[o + 1] = this.t0.y - b.r * 1.2 - 0.12 * (k + 1); this.rope[o + 2] = this.t0.z;
      }
    }
  }

  /** Let every balloon go: they float up and away. */
  releaseBalloons(): void {
    for (const b of this.pools[KIND.balloon]) {
      if (!b.alive) continue;
      this.state[b.index].released = true;
      b.hover = NaN;
      b.gravity = -0.18;
      b.asleep = false;
      b.v.y += 0.3;
    }
  }

  /** Pop the first balloon the (stage-local) ray hits. */
  popRay(ray: THREE.Ray): boolean {
    let hit: Body | null = null, best = Infinity;
    for (const b of this.pools[KIND.balloon]) {
      if (!b.alive || this.state[b.index].gone) continue;
      // a little generous: fingers are big and balloons move
      this.t0.copy(b.p);
      const r = b.r * 1.35;
      const d = ray.distanceSqToPoint(this.t0);
      if (d < r * r) {
        const t = this.t0.sub(ray.origin).dot(ray.direction);
        if (t > 0 && t < best) { best = t; hit = b; }
      }
    }
    if (!hit) return false;
    this.pop(hit);
    return true;
  }

  pop(b: Body): void {
    const st = this.state[b.index];
    st.gone = true;
    const n = this.reduced ? 8 : 16;
    this.fx.emit({ count: n, glyph: ['dot', 'star'], colors: [st.hex, PAL.white], at: b.p, burst: 1.3, drag: 2.4, gravity: 0.6, life: [0.45, 0.8], size: [0.035, 0.07], floor: 0, bounce: 0.4 });
    this.fx.emit({ count: 1, glyph: 'ring', colors: [st.hex], at: b.p, life: [0.22, 0.26], size: [0.35, 0.36], spin: 0 });
  }

  /** Free a heart that was caught (the caller makes the particles). */
  consume(b: Body): void {
    this.state[b.index].gone = true;
  }

  clear(): void {
    this.world.clear();
    for (const st of this.state) { st.gone = false; st.out = 0; }
    this.hearts.count = this.stars.count = this.balloons.count = 0;
    this.strings.geometry.setDrawRange(0, 0);
  }

  // ------------------------------------------------------------------ per frame
  update(dt: number): void {
    const w = this.world;
    const any = this.liveCount > 0;
    if (any) w.step(dt);
    // the house walls (AR) and his body stay as the stage set them
    for (const b of w.bodies) {
      if (!b.alive) continue;
      const st = this.state[b.index];
      if (st.gone) { w.free(b); continue; }
      if (st.released && b.p.y > (b.hover === b.hover ? b.hover : 0) + 2.4) st.out += dt / FADE;
      else if (b.age > MAX_AGE[b.kind] || (b.asleep && b.rest > REST_LIFE[b.kind])) st.out += dt / FADE;
      if (st.out >= 1) { w.free(b); continue; }
      if (b.asleep || (b.grounded && b.v.lengthSq() < 0.04)) st.settle = Math.min(1, st.settle + dt * 5);
      else st.settle = Math.max(0, st.settle - dt * 3);
      if (b.sense && b.landed) b.sense = false; // bounced: no longer catchable
    }
    this.draw(this.hearts, KIND.heart, 0.72);
    this.draw(this.stars, KIND.star, 0.6);
    this.draw(this.balloons, KIND.balloon, 0);
    this.drawStrings(dt);
  }

  private restPose(b: Body, st: ToyState): void {
    // lying on its back, face up, at a random turn
    this.e.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2, 'YXZ');
    st.restQ.setFromEuler(this.e);
  }

  private draw(mesh: THREE.InstancedMesh, kind: number, flatten: number): void {
    let n = 0;
    const e = this.m.elements;
    for (const b of this.pools[kind]) {
      if (!b.alive) continue;
      const st = this.state[b.index];
      const age = b.age;
      // grow in (0.22 s with a little overshoot: a thrown heart starts small near your hand), shrink away when leaving
      const kin = age < 0.22 ? 0.3 + (age / 0.22) * 0.78 : age < 0.3 ? 1.08 - ((age - 0.22) / 0.08) * 0.08 : 1;
      const kout = 1 - st.out;
      const sc = b.r * kin * Math.max(0, kout);
      if (kind === KIND.balloon) {
        // upright, leaning with its drift
        this.e.set(THREE.MathUtils.clamp(b.v.z * 0.6, -0.4, 0.4), 0, THREE.MathUtils.clamp(-b.v.x * 0.6, -0.4, 0.4));
        this.q.setFromEuler(this.e);
      } else {
        this.q.copy(b.q);
        if (st.settle > 0) this.q.slerp(st.restQ, st.settle * st.settle);
      }
      this.m.makeRotationFromQuaternion(this.q);
      this.m.scale(this.s.setScalar(sc));
      // squash along world up (keeps the volume roughly)
      const sq = THREE.MathUtils.clamp(b.squash, -0.45, 0.45);
      const ay = 1 + sq, axz = 1 - sq * 0.5;
      for (let c = 0; c < 3; c++) { e[c * 4] *= axz; e[c * 4 + 1] *= ay; e[c * 4 + 2] *= axz; }
      // lying flat: sink to the floor (the body is a sphere, the toy is flat)
      const sink = flatten * b.r * st.settle;
      e[12] = b.p.x; e[13] = b.p.y - sink; e[14] = b.p.z;
      mesh.setMatrixAt(n, this.m);
      mesh.setColorAt(n, this.c.setHex(st.hex));
      n++;
    }
    mesh.count = n;
    mesh.visible = n > 0;
    if (n) {
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, n * 16);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.clearUpdateRanges();
      mesh.instanceColor!.addUpdateRange(0, n * 3);
      mesh.instanceColor!.needsUpdate = true;
    }
  }

  private drawStrings(dt: number): void {
    let n = 0;
    const P = this.strPos, R = this.rope, L = 0.13;
    const follow = Math.min(1, dt * 14);
    for (const b of this.pools[KIND.balloon]) {
      if (!b.alive) continue;
      const st = this.state[b.index];
      const k = Math.max(0, 1 - st.out);
      let px = b.p.x, py = b.p.y - b.r * 1.22 * k, pz = b.p.z;
      for (let i = 0; i < 3; i++) {
        const o = (b.slot * 3 + i) * 3;
        // each point hangs below the previous one, lagging behind (reads as a light string)
        let dx = R[o] - px, dy = R[o + 1] - 0.03 - py, dz = R[o + 2] - pz;
        const l = Math.hypot(dx, dy, dz) || 1;
        dx = (dx / l) * L * k; dy = (dy / l) * L * k; dz = (dz / l) * L * k;
        R[o] += (px + dx - R[o]) * follow; R[o + 1] += (py + dy - R[o + 1]) * follow; R[o + 2] += (pz + dz - R[o + 2]) * follow;
        const w = n * 6;
        P[w] = px; P[w + 1] = py; P[w + 2] = pz;
        P[w + 3] = R[o]; P[w + 4] = R[o + 1]; P[w + 5] = R[o + 2];
        px = R[o]; py = R[o + 1]; pz = R[o + 2];
        n++;
      }
    }
    const g = this.strings.geometry;
    g.setDrawRange(0, n * 2);
    this.strings.visible = n > 0;
    if (n) {
      const a = g.getAttribute('position') as THREE.BufferAttribute;
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * 6);
      a.needsUpdate = true;
    }
  }

  private impact(b: Body, speed: number): void {
    if (b.kind === KIND.heart) {
      if (b.sense) {
        // first touch: floor = a miss; his body = a bonk (he was asleep)
        const dx = b.p.x - this.bear.x, dz = b.p.z - this.bear.z;
        if (b.p.y > b.r * 1.5 && dx * dx + dz * dz < 0.36) this.onBonk?.(b);
        else this.onMiss?.(b);
        b.sense = false;
      }
      if (speed > 1.2) {
        this.fx.emit({ count: this.reduced ? 2 : 4, glyph: 'heart', colors: [PAL.pinkSoft, PAL.pink], at: b.p, burst: 0.5, drag: 2.5, life: [0.35, 0.6], size: [0.03, 0.05] });
      }
    } else if (b.kind === KIND.star && speed > 1.4 && !this.reduced) {
      this.fx.emit({ count: 2, glyph: 'sparkle', colors: [PAL.white, PAL.yellow], at: b.p, burst: 0.4, drag: 3, life: [0.25, 0.45], size: [0.03, 0.05] });
    }
  }
}

/** Merge two non-indexed-compatible geometries (sphere + knot) without pulling in BufferGeometryUtils. */
function mergeTwo(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const A = a.index ? a.toNonIndexed() : a, B = b.index ? b.toNonIndexed() : b;
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal']) {
    const x = A.getAttribute(name) as THREE.BufferAttribute, y = B.getAttribute(name) as THREE.BufferAttribute;
    const arr = new Float32Array(x.array.length + y.array.length);
    arr.set(x.array as Float32Array, 0);
    arr.set(y.array as Float32Array, x.array.length);
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  out.computeBoundingSphere();
  return out;
}
