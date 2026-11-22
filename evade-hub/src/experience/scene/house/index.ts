// Bobo's Hideout as a stage set (one per stage, showcase / AR), built from src/evade/world/hideout.ts.
//
//   showcase  the hideout IS the world: Bobo lives on the can's ground floor, the arcade machines line the hall.
//             No door, no clip (plain materials), always "inside".
//   ar        a freestanding door (an Eclipse can opened up into a doorway) stands behind Bobo. Its door swings open
//             onto the life-size hall: walk in through it with your phone (the portal notices the crossing), or tap
//             "Step inside" and the hall comes to you (modes/ar/house-walk.ts). From outside the hall is only drawn
//             through the doorway (DoorClip: a fixed shader patch, planes are uniforms); inside it wears plain twins.
//
// Stability (pitfalls 13-14): everything is built and compiled at load with the stage. No new lights, materials or
// shader inputs at the moment the door opens; textures are small canvases without mipmaps.
//
// `root` is in door-local metres (src/experience/scene/house/dims.ts) and scaled into stage units by `k`.
import * as THREE from 'three';
import type { PropKit } from '../props';
import type { Media } from '../media';
import type { Stage } from '../stage';
import { PAL } from '../fx';
import { damp, ease } from '../../core/timeline';
import { COT, DOOR, ROOM_SLACK } from './dims';
import { DoorClip } from './clip';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildHideout, clampToHall, HALL, type Hideout } from '../../../evade/world/hideout';
import { pickCabinet, type Cabinet } from '../../../evade/world/arcade';

/** What a tap can hit: the door, the door frame, or an arcade machine (`arcade:<id>`). */
export type HouseItem = 'door' | 'house' | `arcade:${string}`;

/** Showcase: stage units per metre (Bobo is 1 unit there, the size of the room's own Bobo). */
export const SHOW_K = 1.33;

const V = new THREE.Vector3(), V2 = new THREE.Vector3(), W = new THREE.Vector3();
const MX = new THREE.Matrix4(), INV = new THREE.Matrix4();
const R = new THREE.Ray();
const C4 = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const BOX = new THREE.Box3();
const DOORP = new THREE.Plane();

const SLATE = 0x1d2a3a, INK = 0x15131a, CYAN = 0x4fd6e8, YELLOW = 0xf6c344, RED = 0xe3243a, WHITE = 0xffffff;

function colored(geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = (geo.index ? geo.toNonIndexed() : geo).translate(x, y, z);
  if (g.attributes.uv) g.deleteAttribute('uv');
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/** The door frame: two can-label pillars, a lintel with the sign, cyan neon edges, a step. Door-local metres. */
function frameGeometry(): THREE.BufferGeometry {
  const hw = DOOR.w / 2, pw = (COT.w - DOOR.w) / 2, d = COT.d, top = COT.peak;
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const x = s * (hw + pw / 2);
    parts.push(colored(new THREE.BoxGeometry(pw, top, d), SLATE, x, top / 2, -d / 2));
    // can stripes: red band, white band
    parts.push(colored(new THREE.BoxGeometry(pw + 0.01, 0.34, d + 0.01), RED, x, 0.95, -d / 2));
    parts.push(colored(new THREE.BoxGeometry(pw + 0.012, 0.06, d + 0.012), WHITE, x, 1.16, -d / 2));
    // neon edge round the opening
    parts.push(colored(new THREE.BoxGeometry(0.035, DOOR.h, 0.035), CYAN, s * (hw + 0.02), DOOR.h / 2, 0.005));
  }
  parts.push(colored(new THREE.BoxGeometry(DOOR.w, top - DOOR.h, d), SLATE, 0, DOOR.h + (top - DOOR.h) / 2, -d / 2));
  parts.push(colored(new THREE.BoxGeometry(DOOR.w + 0.075, 0.035, 0.035), CYAN, 0, DOOR.h + 0.02, 0.005));
  // can lip on top
  parts.push(colored(new THREE.BoxGeometry(COT.w + 0.08, 0.08, d + 0.08), 0xc9d1de, 0, top + 0.04, -d / 2));
  // step
  parts.push(colored(new THREE.BoxGeometry(DOOR.w + 0.3, 0.04, 0.42), INK, 0, 0.02, 0.18));
  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return g;
}

/** The sign over the door: "BOBO'S HIDEOUT" (flat, yellow on ink). */
function signTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d')!;
  const draw = () => {
    g.fillStyle = '#15131a'; g.fillRect(0, 0, 512, 128);
    g.fillStyle = '#f6c344';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'italic 900 58px "Exo 2", system-ui, sans-serif';
    g.fillText("BOBO'S HIDEOUT", 256, 58, 480);
    g.fillStyle = '#4fd6e8'; g.fillRect(40, 104, 432, 6);
  };
  draw();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  try { void document.fonts?.ready.then(() => { draw(); t.needsUpdate = true; }); } catch { /* ignore */ }
  return t;
}

/** The door leaf: yellow, a round porthole, a paw. Hinged on its left edge (x = 0 .. w). */
function leafGeometry(): THREE.BufferGeometry {
  const w = DOOR.w - 0.03, h = DOOR.h - 0.02, dz = 0.05;
  const parts = [
    colored(new THREE.BoxGeometry(w, h, dz), YELLOW, w / 2, h / 2, 0),
    colored(new THREE.CylinderGeometry(0.17, 0.17, dz + 0.01, 28).rotateX(Math.PI / 2), INK, w / 2, 1.5, 0),
    colored(new THREE.CylinderGeometry(0.13, 0.13, dz + 0.02, 28).rotateX(Math.PI / 2), CYAN, w / 2, 1.5, 0),
    colored(new THREE.BoxGeometry(w * 0.7, 0.05, dz + 0.012), 0xb98d1f, w / 2, 0.45, 0),
    colored(new THREE.SphereGeometry(0.045, 12, 8), INK, w - 0.12, 1.0, 0.04),
    colored(new THREE.SphereGeometry(0.045, 12, 8), INK, w - 0.12, 1.0, -0.04),
  ];
  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return g;
}

let frameGeo: THREE.BufferGeometry | null = null;
let leafGeo: THREE.BufferGeometry | null = null;
let signTex: THREE.CanvasTexture | null = null;

export class HouseSet {
  /** Door-local metres (the door at the origin, the hall on -z). Child of `stage.house`. */
  readonly root = new THREE.Group();
  /** The door frame outside (taps). */
  readonly exterior = new THREE.Group();
  readonly front: THREE.Mesh;
  /** The frame's back (kept for the stage's API; the frame is all front). */
  readonly body = new THREE.Group();
  readonly room: { group: THREE.Object3D };
  readonly hideout: Hideout;
  /** The door (swings into the hall). */
  readonly leaf = new THREE.Group();
  readonly clip = new DoorClip();
  /** The camera is in the hall (walked through the door, or the hall was brought to you). Always true in 3D. */
  inside = false;
  open = 0;
  openTarget = 0;
  /** Moment bounce (1 = rest) and a wobble (kept for the stage API). */
  squash = 1;
  mailTilt = 0;
  /** Stage units per metre (AR: life size times `sizeMul`, whatever size Bobo is). */
  k = 1;
  sizeMul = 1;
  private awayK = 1;
  private awayTarget = 1;
  private swaps: Array<[THREE.Mesh, THREE.Material, THREE.Material]> = [];
  private plain = false;
  /** Someone else poses `stage.house` (the AR walk-in glide). */
  posed = false;
  /** Kept for the stage API (the old showcase camera tour); unused. */
  readonly tour = { k: 0, pos: new THREE.Vector3(), look: new THREE.Vector3() };
  onCross: ((inside: boolean) => void) | null = null;
  /** The camera in door-local metres (last update). */
  readonly cam = new THREE.Vector3();
  private wasOutside = true;
  private t = 0;
  private readonly ar: boolean;

  constructor(private st: Stage, _kit: PropKit, private media: Media) {
    this.ar = st.variant === 'ar';
    this.root.name = 'house-set';
    const clip = this.clip;
    const clipMat = (m: THREE.Material) => clip.apply(m.clone());
    // the hall and the machines (AR: every material cloned and clip-patched; 3D: as loaded)
    this.hideout = buildHideout(this.ar ? clipMat : (m) => m);
    this.room = { group: this.hideout.room };
    this.root.add(this.hideout.root);

    if (this.ar) {
      frameGeo ??= frameGeometry();
      leafGeo ??= leafGeometry();
      signTex ??= signTexture();
      this.front = new THREE.Mesh(frameGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
      this.front.name = 'hideout-door-frame';
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(COT.w * 0.86, COT.w * 0.86 / 4), new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false }));
      sign.position.set(0, DOOR.h + (COT.peak - DOOR.h) / 2, 0.004);
      sign.name = 'hideout-sign';
      this.exterior.add(this.front, sign, this.body);
      this.root.add(this.exterior);
      const leaf = new THREE.Mesh(leafGeo, clip.apply(new THREE.MeshLambertMaterial({ vertexColors: true })));
      leaf.name = 'hideout-door';
      this.leaf.add(leaf);
      this.leaf.position.set(-DOOR.w / 2 + 0.015, 0, -0.06);
      this.root.add(this.leaf);
      this.hideout.room.visible = false;
      // plain twins for inside (compiled at load with everything else: they ride on a hidden holder)
      const tw = clip.twinHolder(this.root);
      this.swaps = tw.swaps;
      this.root.add(tw.holder);
    } else {
      this.front = new THREE.Mesh();
      this.exterior.visible = false;
      this.inside = true;
      this.wasOutside = false;
    }
  }

  // ------------------------------------------------------------------ arcade
  get cabinets(): Cabinet[] {
    return this.hideout.cabinets;
  }
  /** The machine a world ray hits (in 3D always; in AR only inside or through the open door). */
  pickCabinet(worldRay: THREE.Ray): Cabinet | null {
    if (!this.present || !this.hideout.room.visible) return null;
    this.root.updateMatrixWorld(true);
    R.copy(worldRay).applyMatrix4(INV.copy(this.root.matrixWorld).invert());
    if (!this.inside) {
      // from outside, only through the doorway
      if (!(R.origin.z > 0 && R.direction.z < 0) || this.open < 0.5) return null;
      const t = -R.origin.z / R.direction.z;
      const x = R.origin.x + R.direction.x * t, y = R.origin.y + R.direction.y * t;
      if (Math.abs(x) > DOOR.w / 2 || y < 0 || y > DOOR.h) return null;
    }
    return pickCabinet(this.hideout.cabinets, R);
  }
  /** Stage-local floor point in front of a machine (where Bobo stands to play it). */
  cabinetFront(c: Cabinet, out = new THREE.Vector3()): THREE.Vector3 {
    return this.toStage(c.front, out).setY(0);
  }
  /** Stage-local point on a machine's screen (camera framing). */
  cabinetScreen(c: Cabinet, out = new THREE.Vector3()): THREE.Vector3 {
    c.group.updateMatrix();
    return this.toStage(V.set(0, 1.05, 0.1).applyMatrix4(c.group.matrix), out);
  }
  /** The machine Bobo is standing at (stage-local position), or null. */
  nearCabinet(p: THREE.Vector3): Cabinet | null {
    if (!this.present || (this.ar && !this.inside && !this.hideout.room.visible)) return null;
    const l = this.fromStage(p, V);
    let best: Cabinet | null = null, bd = 0.62 * 0.62;
    for (const c of this.hideout.cabinets) {
      const d = (c.front.x - l.x) ** 2 + (c.front.z - l.z) ** 2;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  // ------------------------------------------------------------------ state
  get present(): boolean {
    return this.st.house.visible && this.awayTarget > 0 && this.awayK > 0.001;
  }
  get away(): boolean {
    return this.awayTarget === 0;
  }

  /** A mini game is on: in AR the door pops away so the game has the floor. 3D keeps its hall. Scale only. */
  setAway(on: boolean): void {
    if (!this.ar) return;
    const t = on ? 0 : 1;
    if (t === this.awayTarget) return;
    this.awayTarget = t;
    if (on && this.inside) this.setInside(false);
    const k = this.k, at = this.toStage(V.set(0, COT.peak * 0.45, 0), new THREE.Vector3());
    if (this.st.house.visible) {
      this.st.fx.emit({ count: on ? 26 : 30, glyph: ['sparkle', 'star'], colors: [PAL.yellow, PAL.white, PAL.sky], at, spread: [COT.w * 0.35 * k, COT.peak * 0.3 * k, 0.2 * k], burst: 0.5 * k, drag: 1.4, life: [0.7, 1.2], size: [0.07 * k, 0.13 * k] });
    }
    if (!on) this.root.visible = true;
  }

  private wearPlain(on: boolean): void {
    if (on === this.plain) return;
    this.plain = on;
    for (const [mesh, clipped, plain] of this.swaps) {
      const want = on ? plain : clipped, was = mesh.material as THREE.Material;
      if (was === want) continue;
      const a = was as THREE.MeshBasicMaterial, b = want as THREE.MeshBasicMaterial;
      if (a.color && b.color) b.color.copy(a.color);
      b.opacity = a.opacity;
      mesh.material = want;
    }
  }

  // ------------------------------------------------------------------ space
  toStage(local: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    this.st.house.updateMatrix();
    this.root.updateMatrix();
    return out.copy(local).applyMatrix4(MX.multiplyMatrices(this.st.house.matrix, this.root.matrix));
  }
  fromStage(p: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    this.st.house.updateMatrix();
    this.root.updateMatrix();
    return out.copy(p).applyMatrix4(MX.multiplyMatrices(this.st.house.matrix, this.root.matrix).invert());
  }
  dirToStage(d: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(d).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.st.house.rotation.y).multiplyScalar(this.k);
  }
  yawToStage(yaw: number): number {
    return yaw + this.st.house.rotation.y;
  }

  /** Where the door stands on the stage: AR about a metre behind Bobo; 3D so that Bobo's home is the stage origin. */
  restPos(out = new THREE.Vector3()): THREE.Vector3 {
    const k = this.k;
    if (!this.ar) return out.set(-HALL.home.x * k, 0, -HALL.home.z * k);
    return out.set(0, 0, -THREE.MathUtils.clamp(1.0 * k, 0.9, 3.2));
  }

  /** The door frame's footprint in stage-local space (AR toys and pickups keep out). 3D: none. */
  bounds(out: THREE.Box3): THREE.Box3 | null {
    if (!this.ar || !this.st.house.visible || this.awayTarget === 0) return null;
    out.makeEmpty();
    const hw = COT.w / 2 + 0.2;
    for (const x of [-hw, hw]) for (const z of [-COT.d - 0.2, 0.45]) out.expandByPoint(this.toStage(V.set(x, 0, z), V2));
    out.min.y = 0;
    out.max.y = (COT.peak + 0.2) * this.k * this.squash;
    return out;
  }

  /** The hall floor Bobo may walk on (door-local metres). */
  clampToRoom(p: THREE.Vector3): THREE.Vector3 {
    return clampToHall(p);
  }
  /** Just behind the door (where Bobo waits when he walks in ahead of you), door-local. */
  clampToCottage(p: THREE.Vector3): THREE.Vector3 {
    p.x = THREE.MathUtils.clamp(p.x, -DOOR.w / 2 + 0.2, DOOR.w / 2 - 0.2);
    p.z = THREE.MathUtils.clamp(p.z, -1.1, -0.35);
    p.y = 0;
    return p;
  }

  // ------------------------------------------------------------------ the door
  setOpen(on: boolean, instant = false): void {
    this.openTarget = on ? 1 : 0;
    if (instant) this.open = this.openTarget;
  }

  setInside(v: boolean): void {
    if (!this.ar || v === this.inside) return;
    this.inside = v;
    this.wearPlain(v);
    this.wasOutside = !v;
    this.onCross?.(v);
  }

  // ------------------------------------------------------------------ taps
  /** What a world ray hits: a machine (inside, or through the open door), the door, the frame. */
  pick(ray: THREE.Ray): HouseItem | null {
    if (!this.present) return null;
    const cab = this.pickCabinet(ray);
    if (cab) return `arcade:${cab.item.id}`;
    if (!this.ar || this.inside) return null;
    this.root.updateMatrixWorld(true);
    R.copy(ray).applyMatrix4(INV.copy(this.root.matrixWorld).invert());
    if (R.origin.z > 0 && R.direction.z < 0) {
      const t = -R.origin.z / R.direction.z;
      const x = R.origin.x + R.direction.x * t, y = R.origin.y + R.direction.y * t;
      if (y >= 0 && y <= DOOR.h && Math.abs(x) < DOOR.w / 2) return 'door';
    }
    const hw = COT.w / 2 + 0.15;
    if (R.intersectsBox(BOX.set(V.set(-hw, 0, -COT.d - 0.1), V2.set(hw, COT.peak + 0.2, 0.3)))) return 'house';
    return null;
  }

  /** Kept for the walk-in: machines are opened by the mode (it emits the `arcade` event). */
  interact(_item: HouseItem): 'dance' | 'cheer' | 'sparkle' | null {
    return null;
  }

  // ------------------------------------------------------------------ per frame
  update(dt: number, camObj: THREE.Camera | null): void {
    const st = this.st, h = st.house;
    const k = this.ar ? this.sizeMul / Math.max(0.05, st.root.scale.x) : SHOW_K;
    this.k = k;
    if (this.awayK !== this.awayTarget) {
      const soft = st.actor.soft;
      this.awayK = THREE.MathUtils.clamp(this.awayK + (this.awayTarget ? 1 : -1) * dt / (soft ? 0.25 : this.awayTarget ? 0.45 : 0.3), 0, 1);
      if (this.awayK === 0) this.root.visible = false;
    }
    const pop = this.awayK >= 1 ? 1 : this.awayTarget ? (st.actor.soft ? this.awayK : ease.backOut(this.awayK)) : (st.actor.soft ? this.awayK : 1 - ease.inOut(1 - this.awayK));
    const pk = Math.max(0.001, pop);
    if (!this.posed) {
      this.restPos(h.position);
      h.rotation.set(0, 0, 0);
    }
    const sq = this.squash;
    this.root.scale.set(k * sq * pk, k * (2 - sq) * pk, k * sq * pk);
    this.root.position.set(0, 0, 0);
    st.houseSize.set((COT.w + 0.3) * k, COT.peak * k, (COT.d + 0.3) * k);
    this.toStage(V.set(0, 0, 0.45), st.door);
    h.updateMatrixWorld(true);
    if (!h.visible || !this.root.visible) return;

    this.t += dt;
    if (this.hideout.room.visible) this.hideout.update(dt);
    if (!this.ar) return;
    this.open += (this.openTarget - this.open) * damp(2.4, dt);
    if (Math.abs(this.openTarget - this.open) < 0.002) this.open = this.openTarget;
    const leafY = ease.inOut(this.open) * 1.92;
    if (this.leaf.rotation.y !== leafY) this.leaf.rotation.y = leafY;
    this.portal(camObj);
  }

  /** The portal: which side the camera is on, what to draw, the doorway clip. */
  private portal(camObj: THREE.Camera | null): void {
    if (!camObj) return;
    camObj.getWorldPosition(W);
    const lp = this.root.worldToLocal(this.cam.copy(W));
    const inOpening = Math.abs(lp.x) < DOOR.w / 2 + 0.2 && lp.y < DOOR.h + 0.45 && lp.y > -1;
    const outsideNow = lp.z > 0;
    const hallD = Math.hypot(lp.x, lp.z - HALL.cz);
    if (this.open > 0.5 && outsideNow !== this.wasOutside && inOpening) this.setInside(!outsideNow);
    else if (this.inside && ((outsideNow && lp.z > 0.05 && !inOpening) || hallD > HALL.r + ROOM_SLACK)) this.setInside(false);
    this.wasOutside = outsideNow;
    const front = lp.z > 0;
    this.hideout.room.visible = this.inside || (front && this.open > 0.01);
    this.leaf.visible = this.inside || front;
    this.exterior.visible = !this.inside || front;
    if (!this.hideout.room.visible && !this.leaf.visible) return;
    const m = this.root.matrixWorld;
    DOORP.setFromNormalAndCoplanarPoint(V2.set(0, 0, -1).transformDirection(m), V.set(0, 0, -0.03).applyMatrix4(m));
    if (this.inside) this.clip.off();
    else if (front && lp.z < 0.08 && inOpening) this.clip.doorway(DOORP);
    else {
      const hw = DOOR.w / 2 + 0.012, yb = -0.6, yt = DOOR.h + 0.02;
      C4[0].set(-hw, yb, 0).applyMatrix4(m);
      C4[1].set(hw, yb, 0).applyMatrix4(m);
      C4[2].set(hw, yt, 0).applyMatrix4(m);
      C4[3].set(-hw, yt, 0).applyMatrix4(m);
      this.clip.through(W, C4, V.set(0, DOOR.h / 2, -1).applyMatrix4(m), DOORP);
    }
  }

  /** Kept for the stage API (no camera tour any more). */
  applyTour(_cam: THREE.PerspectiveCamera): void { /* no tour */ }
  tourTv(_on: boolean): void { void this.media; }

  /** Everything back to rest (Start again, Move): outside, door shut. */
  reset(): void {
    if (this.ar && this.inside) this.setInside(false);
    this.squash = 1;
    this.mailTilt = 0;
  }
}
