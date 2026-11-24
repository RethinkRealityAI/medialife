// The mini games' 3D pieces for ONE stage (showcase or AR), built at load and added under the stage, so the engine's
// warm-up (AR) and the showcase's compileAsync compile them with everything else: nothing compiles when a game starts
// (pitfall 13). Flat colours only.
//
//   pickups   Eclipse cans (Can Dash), hearts, gold stars and fizz arcs as instanced meshes. Hearts and stars reuse
//             the toy geometries; the can is EVADE's real can model (src/evade/world/can.ts). Every instanced mesh has
//             instanceColor from the start, so nothing recompiles.
//   beacons   a pulsing flat ring on the floor under each pickup: one instanced mesh, one small shader (a solid core
//             disc + a crisp ring that grows and fades over time; no gradient across the shape).
//   hoop      Paw Hoops' ring: six flat EVADE bands standing on a big Eclipse can (plain standard materials).
//   cloud     the grumpy raincloud (Can Dash): grey puffs, two eyes, a frown. Our own simple geometry.
import * as THREE from 'three';
import type { Stage } from '../scene/stage';
import { PAL } from '../scene/fx';
import type { StaticSphere } from '../physics/world';
import { canParts } from '../../evade/world/can';

export const PICK = { heart: 0, star: 1, rainbow: 2, can: 3 } as const;
export type PickKind = keyof typeof PICK;
const CAP = { heart: 14, star: 3, rainbow: 3, can: 14 };
/** A can pickup's height (stage units; Bobo is 1 tall). */
const CAN_H = 0.3;
const BEACONS = 20;
/** The fizz arc pickup's four bands, outside in (flat EVADE colours). */
const ARC_COLORS = [PAL.pink, PAL.yellow, PAL.sky, PAL.blue];
/** The hoop's bands, outside in. */
const RING = [PAL.red, PAL.white, PAL.yellow, PAL.sky, PAL.blue, PAL.white];
/** Hoop: radius of the opening's centre line and the band half-width (stage units). */
export const HOOP_R = 0.36;
export const HOOP_BAND = 0.06;
export const RIM_N = 14;

const BEACON_VERT = /* glsl */ `
attribute float aPhase;
varying vec2 vUv;
varying vec3 vCol;
varying float vPhase;
void main() {
  vUv = uv * 2.0 - 1.0;
  vPhase = aPhase;
  #ifdef USE_INSTANCING_COLOR
  vCol = instanceColor;
  #else
  vCol = vec3(1.0);
  #endif
  vec4 p = vec4(position, 1.0);
  #ifdef USE_INSTANCING
  p = instanceMatrix * p;
  #endif
  gl_Position = projectionMatrix * modelViewMatrix * p;
}`;
const BEACON_FRAG = /* glsl */ `
uniform float uTime;
uniform float uAlpha;
varying vec2 vUv;
varying vec3 vCol;
varying float vPhase;
void main() {
  float d = length(vUv);
  if (d > 1.0) discard;
  // a solid core disc and a crisp ring that grows outwards and fades with time (flat colour, hard edges)
  float k = fract(uTime * 0.8 + vPhase);
  float ringR = 0.38 + k * 0.6;
  float ring = step(abs(d - ringR), 0.07) * (1.0 - k);
  float core = step(d, 0.34) * 0.42;
  float edge = step(abs(d - 0.36), 0.03) * 0.9;
  float a = max(max(core, edge), ring * 0.85) * uAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol, a);
}`;

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, name: string): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, cap);
  m.name = name;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const c = new THREE.Color(1, 1, 1);
  for (let i = 0; i < cap; i++) m.setColorAt(i, c); // instanceColor before the first compile (no recompile later)
  m.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  m.count = 0;
  m.frustumCulled = false;
  return m;
}
const toyMat = (rough = 0.4) => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: rough, metalness: 0 });
const flat = (hex: number, rough = 0.55) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0 });

export interface PickDraw {
  kind: PickKind;
  x: number; y: number; z: number;
  /** Overall scale (1 = full size): pops in and out. */
  s: number;
  /** Heading (spin) in radians. */
  yaw: number;
  hex: number;
  /** Beacon colour and phase; no beacon when beacon < 0. */
  beacon: number;
  phase: number;
  /** Beacon diameter (default from `s`). */
  beaconSize?: number;
}

export class PlayKit {
  readonly group = new THREE.Group();
  readonly hearts: THREE.InstancedMesh;
  /** Eclipse can pickups: one instanced mesh per can material (all drawn with the same matrices). */
  readonly cans: THREE.InstancedMesh[] = [];
  readonly stars: THREE.InstancedMesh;
  readonly arcs: THREE.InstancedMesh[] = [];
  readonly puffs: THREE.InstancedMesh;
  readonly beacons: THREE.InstancedMesh;
  readonly hoop = new THREE.Group();
  readonly hoopBands: THREE.Mesh[] = [];
  readonly cloud = new THREE.Group();
  readonly cloudFace = new THREE.Group();
  readonly cloudFrown: THREE.Mesh;
  private beaconMat: THREE.ShaderMaterial;
  private phase: THREE.InstancedBufferAttribute;
  /** The hoop's rim as static spheres in the stage's toy physics (off unless Paw Hoops shows the ring). */
  readonly rim: StaticSphere[] = [];
  private warmed = false;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private c = new THREE.Color();
  private canIsHeart = false;

  constructor(stage: Stage) {
    this.group.name = 'play-kit';
    const tm = toyMat();
    this.hearts = instanced(stage.play.hearts.geometry, tm, CAP.heart, 'play-hearts');
    this.stars = instanced(stage.play.stars.geometry, toyMat(0.3), CAP.star, 'play-stars');
    // a rainbow pickup: five half-ring bands (one instanced mesh per band, same program), two cloud puffs
    const bandR = [1, 0.82, 0.64, 0.46];
    bandR.forEach((r, i) => {
      const g = new THREE.TorusGeometry(r * 0.2, 0.034, 8, 24, Math.PI);
      this.arcs.push(instanced(g, tm, CAP.rainbow, `play-arc-${i}`));
    });
    this.puffs = instanced(new THREE.SphereGeometry(1, 14, 10), toyMat(0.7), CAP.rainbow * 2, 'play-puffs');
    // floor beacons
    const bg = new THREE.PlaneGeometry(1, 1);
    bg.rotateX(-Math.PI / 2);
    this.phase = new THREE.InstancedBufferAttribute(new Float32Array(BEACONS), 1);
    this.phase.setUsage(THREE.DynamicDrawUsage);
    bg.setAttribute('aPhase', this.phase);
    this.beaconMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 1 } },
      vertexShader: BEACON_VERT, fragmentShader: BEACON_FRAG,
      transparent: true, depthWrite: false, toneMapped: false,
    });
    this.beacons = instanced(bg, this.beaconMat, BEACONS, 'play-beacons');
    this.beacons.renderOrder = 1;
    const can = canParts();
    can.forEach((p, i) => this.cans.push(instanced(p.geometry, p.material, CAP.can, `play-can-${i}`)));
    // no can model: the pickups fall back to hearts
    if (!this.cans.length) this.cans.push(instanced(stage.play.hearts.geometry, tm, CAP.can, 'play-can-heart'));
    this.canIsHeart = !can.length;
    this.group.add(this.hearts, this.stars, ...this.arcs, this.puffs, this.beacons, ...this.cans);

    // ---- the hoop: six flat bands standing up, on a big Eclipse can
    const bands = RING.length;
    const w = (HOOP_BAND * 2) / bands;
    for (let i = 0; i < bands; i++) {
      const r = HOOP_R + HOOP_BAND - w * (i + 0.5);
      const g = new THREE.TorusGeometry(r, w * 0.62, 8, 48);
      const mesh = new THREE.Mesh(g, flat(RING[i], 0.45));
      mesh.name = `hoop-band-${i}`;
      this.hoopBands.push(mesh);
      this.hoop.add(mesh);
    }
    const puffG = new THREE.SphereGeometry(1, 16, 12);
    // the stand: an Eclipse can under the ring (or a flat yellow post when the model did not load)
    const standH = 0.34;
    if (can.length) {
      for (const p of can) {
        const cm = new THREE.Mesh(p.geometry, p.material);
        cm.name = 'hoop-can';
        cm.position.set(0, -HOOP_R - HOOP_BAND - standH / 2 + 0.02, 0);
        cm.scale.setScalar(standH);
        this.hoop.add(cm);
      }
    } else {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, standH, 20), flat(PAL.yellow, 0.6));
      post.position.set(0, -HOOP_R - HOOP_BAND - standH / 2 + 0.02, 0);
      this.hoop.add(post);
    }
    this.hoop.name = 'play-hoop';

    // ---- the grumpy raincloud: grey puffs, two eyes and a frown (flat colours)
    const grey = flat(0x9aa3b5, 0.85);
    for (const [x, y, z, s] of [[0, 0, 0, 0.2], [-0.2, -0.04, 0.02, 0.15], [0.2, -0.04, 0.02, 0.16], [-0.09, 0.1, -0.02, 0.15], [0.11, 0.09, -0.03, 0.14], [0, -0.08, 0.06, 0.13]] as const) {
      const pm = new THREE.Mesh(puffG, grey);
      pm.position.set(x, y, z);
      pm.scale.set(s * 1.15, s, s);
      this.cloud.add(pm);
    }
    const ink = flat(0x2d2433, 0.6);
    const eyeG = new THREE.SphereGeometry(0.026, 10, 8);
    for (const x of [-0.07, 0.07]) {
      const eye = new THREE.Mesh(eyeG, ink);
      eye.position.set(x, 0.02, 0.19);
      this.cloudFace.add(eye);
    }
    // cross eyebrows (two small slanted bars) and a frown
    const browG = new THREE.BoxGeometry(0.07, 0.014, 0.014);
    for (const sx of [-1, 1]) {
      const b = new THREE.Mesh(browG, ink);
      b.position.set(sx * 0.07, 0.07, 0.185);
      b.rotation.z = sx * -0.45;
      this.cloudFace.add(b);
    }
    this.cloudFrown = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.011, 6, 16, Math.PI), ink);
    this.cloudFrown.position.set(0, -0.06, 0.19);
    this.cloudFace.add(this.cloudFrown);
    this.cloud.add(this.cloudFace);
    this.cloud.name = 'play-cloud';

    // visible (but far under the floor) until the first update, so the warm-up compiles them; then hidden
    this.hoop.position.set(0, -60, 0);
    this.cloud.position.set(0, -60, 0);
    this.group.add(this.hoop, this.cloud);
    stage.content.add(this.group);
    for (let i = 0; i < RIM_N; i++) this.rim.push(stage.play.world.addSphere(HOOP_BAND));
  }

  /** Every frame (cheap): hides the warm-up pose once, animates the beacons. */
  tick(dt: number): void {
    if (!this.warmed) {
      this.warmed = true;
      this.hoop.visible = false;
      this.cloud.visible = false;
    }
    this.beaconMat.uniforms.uTime.value += dt;
  }

  /** Draw the pickups (call once per frame while a game shows them; an empty list hides everything). */
  draw(list: readonly PickDraw[]): void {
    let nh = 0, ns = 0, nr = 0, nb = 0, nc = 0;
    const m = this.m;
    for (const d of list) {
      if (d.s <= 0.001 && d.beacon < 0) continue;
      this.p.set(d.x, d.y, d.z);
      if (d.s <= 0.001) { /* beacon only (the raincloud's shadow) */ } else if (d.kind === 'can') {
        // an Eclipse can, standing up, leaning a little as it spins
        this.e.set(0.18, d.yaw, 0);
        this.q.setFromEuler(this.e);
        m.compose(this.p, this.q, this.s.setScalar((this.canIsHeart ? 0.13 : CAN_H) * d.s));
        this.c.setHex(this.canIsHeart ? d.hex : 0xffffff);
        for (const cm of this.cans) { cm.setMatrixAt(nc, m); cm.setColorAt(nc, this.c); }
        nc++;
      } else if (d.kind === 'heart') {
        this.e.set(0, d.yaw, 0);
        this.q.setFromEuler(this.e);
        m.compose(this.p, this.q, this.s.setScalar(0.13 * d.s));
        this.hearts.setMatrixAt(nh, m);
        this.hearts.setColorAt(nh++, this.c.setHex(d.hex));
      } else if (d.kind === 'star') {
        this.e.set(0, d.yaw, 0);
        this.q.setFromEuler(this.e);
        m.compose(this.p, this.q, this.s.setScalar(0.21 * d.s));
        this.stars.setMatrixAt(ns, m);
        this.stars.setColorAt(ns++, this.c.setHex(d.hex));
      } else {
        // a fizz arc standing up, turning slowly
        this.e.set(0, d.yaw, 0);
        this.q.setFromEuler(this.e);
        m.compose(this.p, this.q, this.s.setScalar(1.3 * d.s));
        for (let b = 0; b < this.arcs.length; b++) {
          this.arcs[b].setMatrixAt(nr, m);
          this.arcs[b].setColorAt(nr, this.c.setHex(ARC_COLORS[b]));
        }
        // the clouds at its feet
        for (const sx of [-1, 1]) {
          const o = this.s.set(sx * 0.16 * 1.3, 0, 0).applyQuaternion(this.q).multiplyScalar(d.s);
          m.compose(o.add(this.p), this.q, this.s.set(0.09 * d.s * 1.3, 0.07 * d.s, 0.08 * d.s));
          this.puffs.setMatrixAt(nr * 2 + (sx > 0 ? 1 : 0), m);
          this.puffs.setColorAt(nr * 2 + (sx > 0 ? 1 : 0), this.c.setHex(PAL.white));
          this.p.set(d.x, d.y, d.z);
        }
        nr++;
      }
      if (d.beacon >= 0 && nb < BEACONS) {
        this.e.set(0, 0, 0);
        this.q.identity();
        const bs = d.beaconSize ?? 0.62 * Math.max(0.2, d.s);
        m.compose(this.s.set(d.x, 0.006, d.z), this.q, this.p.set(bs, 1, bs));
        this.beacons.setMatrixAt(nb, m);
        this.beacons.setColorAt(nb, this.c.setHex(d.beacon));
        this.phase.setX(nb, d.phase);
        nb++;
      }
    }
    this.finish(this.hearts, nh);
    for (const cm of this.cans) this.finish(cm, nc);
    this.finish(this.stars, ns);
    for (const a of this.arcs) this.finish(a, nr);
    this.finish(this.puffs, nr * 2);
    this.finish(this.beacons, nb);
    if (nb) this.phase.needsUpdate = true;
  }

  private finish(mesh: THREE.InstancedMesh, n: number): void {
    mesh.count = n;
    mesh.visible = n > 0;
    if (!n) return;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.needsUpdate = true;
  }

  /** Beacons fade with this (pause / results). */
  set beaconAlpha(a: number) {
    this.beaconMat.uniforms.uAlpha.value = a;
  }

  /** Hide everything (game over, teardown). */
  clear(): void {
    this.draw([]);
    this.hoop.visible = false;
    this.cloud.visible = false;
    for (const r of this.rim) r.on = false;
  }
}

/**
 * The hideout door's footprint in stage-local space, read from the stage's house set (its geometry may change: never
 * hard-code its size). Null when the house is hidden. `pad` grows the box on every side.
 */
export function houseBounds(stage: Stage, pad = 0, out = new THREE.Box3()): THREE.Box3 | null {
  const s = stage as Stage & { houseBounds?: (o: THREE.Box3) => THREE.Box3 | null };
  if (typeof s.houseBounds === 'function') {
    const b = s.houseBounds(out);
    return b ? b.expandByScalar(pad) : null;
  }
  const h = stage.house;
  if (!h || !h.visible) return null;
  // the house set at rest: its bounding box, taken into stage-local space
  stage.root.updateMatrixWorld(true);
  out.setFromObject(h, false);
  if (out.isEmpty()) return null;
  const inv = INV.copy(stage.root.matrixWorld).invert();
  out.applyMatrix4(inv);
  out.min.y = 0;
  return out.expandByScalar(pad);
}
const INV = new THREE.Matrix4();
