// What the Selfie puts on your head and face: Bobo Booth's pieces (wearables.ts, ported from public/evade/bobo-booth/),
// in the face's own units (1 FU ~ 118-139 mm; x = the wearer's left, y up, the face looks down -z). Four looks, the
// booth's own sets:
//   full   Full Bobo     the Bobo cat hat, Bobo shades, an Eclipse can + a gold hoop, a septum ring
//   fizz   Eclipse fizz  the BOBO visor, night shades, two Eclipse cans, a star stud, game-day cheek stripes
//   gold   Gold rush     gold cat-eye shades, gold hoops, a nose hoop
//   cat    Be Bobo       the cat hat, Bobo's collar bells, whiskers and a pink nose
// Each piece arrives and leaves its own way (wearables.ANIM). Earrings swing with your head (a damped pendulum toward
// gravity). The booth paints on the live face mesh; here the paint is flat decals at the cheek points, and the face
// mesh (when the engine sends it) is a depth-only occluder so the septum ring and temple arms tuck behind your face.
// Flat colours only; built in code from EVADE's own art and models (no generative tools).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as W from './wearables';

export type FxLook = 'full' | 'fizz' | 'gold' | 'cat';
export const FX_LOOKS: Array<{ id: FxLook; label: string; short: string }> = [
  { id: 'full', label: 'Full Bobo', short: 'Full Bobo' },
  { id: 'fizz', label: 'Eclipse fizz', short: 'Fizz' },
  { id: 'gold', label: 'Gold rush', short: 'Gold' },
  { id: 'cat', label: 'Be Bobo', short: 'Be Bobo' },
];
/** Kept for callers that react to your face: a cue makes the earrings swing and the hat hop. */
export type HeadMood = 'happy' | 'surprised' | 'grumpy' | 'sleepy';

type Hat = 'none' | 'cathat' | 'visor';
type Shades = 'none' | 'bobo' | 'night' | 'gold';
type Ear = null | 'can' | 'hoop' | 'bell' | 'stud';
type Nose = 'none' | 'septum' | 'hoop' | 'stud';
type Paint = 'none' | 'whiskers' | 'eclipse';
interface Set { hat: Hat; shades: Shades; ears: [Ear, Ear]; nose: Nose; paint: Paint }
const SETS: Record<FxLook, Set> = {
  full: { hat: 'cathat', shades: 'bobo', ears: ['can', 'hoop'], nose: 'septum', paint: 'none' },
  fizz: { hat: 'visor', shades: 'night', ears: ['can', 'can'], nose: 'stud', paint: 'eclipse' },
  gold: { hat: 'none', shades: 'gold', ears: ['hoop', 'hoop'], nose: 'hoop', paint: 'none' },
  cat: { hat: 'cathat', shades: 'none', ears: ['bell', 'bell'], nose: 'none', paint: 'whiskers' },
};
const CAN_URL = '/evade/keychain/ar/eclipse-can.glb';

// measured defaults (FU) when the engine does not send an attachment point (from the booth)
const AP = {
  leftLobe: new THREE.Vector3(0.636, -0.212, 0.123),
  rightLobe: new THREE.Vector3(-0.636, -0.212, 0.123),
  noseTip: new THREE.Vector3(0, -0.256, -0.744),
  noseBridge: new THREE.Vector3(0, -0.034, -0.626),
  forehead: new THREE.Vector3(0, 0.278, -0.615),
  leftCheek: new THREE.Vector3(0.32, -0.24, -0.5),
  rightCheek: new THREE.Vector3(-0.32, -0.24, -0.5),
};

/** A flat four-point sparkle about `size` across (photo mode's hop bits). */
export function heartShape(size: number): THREE.ShapeGeometry {
  const R = size / 2, r = R * 0.3, s = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 4, rr = i % 2 ? r : R;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    if (i) s.lineTo(x, y); else s.moveTo(x, y);
  }
  s.closePath();
  return new THREE.ShapeGeometry(s, 1);
}

let canPromise: Promise<THREE.Object3D | null> | null = null;
function loadCan(): Promise<THREE.Object3D | null> {
  canPromise ??= new GLTFLoader().loadAsync(CAN_URL).then((g) => g.scene).catch((e) => {
    console.warn('[selfie] Eclipse can failed, the can earrings fall back to hoops', e);
    return null;
  });
  return canPromise;
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** One cheek's paint, drawn for the wearer's left cheek (u = 1 is the outer side). */
function cheekTex(kind: Paint): THREE.CanvasTexture {
  return canvasTex(256, 160, (g) => {
    g.lineCap = 'round';
    if (kind === 'whiskers') {
      g.strokeStyle = '#15131a'; g.lineWidth = 9;
      for (const [y0, y1] of [[62, 34], [82, 82], [102, 130]]) {
        g.beginPath(); g.moveTo(46, y0); g.quadraticCurveTo(150, (y0 + y1) / 2 - 6, 236, y1); g.stroke();
      }
      g.fillStyle = '#f4a3a8';
      g.beginPath(); g.ellipse(40, 82, 22, 15, 0, 0, Math.PI * 2); g.fill();
    } else if (kind === 'eclipse') {
      g.fillStyle = '#f6c344'; g.beginPath(); g.roundRect(40, 40, 180, 30, 15); g.fill();
      g.fillStyle = '#2a5bd7'; g.beginPath(); g.roundRect(64, 88, 150, 26, 13); g.fill();
    }
  });
}

interface Anim { w: THREE.Object3D; spec: any; dir: 1 | -1; t: number; dur: number; done?: () => void } // eslint-disable-line @typescript-eslint/no-explicit-any
interface EarRig { kind: Ear; obj: THREE.Group; w: THREE.Object3D; len: number; fixed: boolean; dir: THREE.Vector3; vel: THREE.Vector3 }

export class FaceFx {
  readonly group = new THREE.Group();
  look: FxLook;
  /** The last reaction (test hook). */
  mood: HeadMood | null = null;
  loaded = false;
  private can: THREE.Object3D | null = null;
  private slots = { hat: new THREE.Group(), shades: new THREE.Group(), nose: new THREE.Group() };
  private worn: { hat: string; shades: string; nose: string; paint: string; ears: [Ear, Ear] } = { hat: '', shades: '', nose: '', paint: '', ears: [null, null] };
  private ears: [EarRig | null, EarRig | null] = [null, null];
  private paint = new THREE.Group();
  private cheeks: THREE.Mesh[] = [];
  private noseDot: THREE.Mesh;
  private paintFade = { cur: 0, to: 0 };
  private anims: Anim[] = [];
  private pts = {
    lobeL: AP.leftLobe.clone(), lobeR: AP.rightLobe.clone(), tip: AP.noseTip.clone(), bridge: AP.noseBridge.clone(),
    forehead: AP.forehead.clone(), cheekL: AP.leftCheek.clone(), cheekR: AP.rightCheek.clone(),
  };
  private faceMesh: THREE.Mesh | null = null;
  private hop = 0;
  private reduced = false;
  private qW = new THREE.Quaternion();
  private vD = new THREE.Vector3();
  private vA = new THREE.Vector3();
  private qT = new THREE.Quaternion();

  constructor(opts: { look?: FxLook } = {}) {
    this.group.name = 'face-fx';
    this.look = opts.look ?? 'full';
    this.group.add(W.buildHeadOccluder());
    for (const [k, s] of Object.entries(this.slots)) { s.name = `slot-${k}`; this.group.add(s); }
    // the paint decals: one plane per cheek (facing the camera), a pink nose for Be Bobo
    this.paint.name = 'face-paint';
    this.group.add(this.paint);
    for (const side of [1, -1]) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.36, 0.225),
        new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, toneMapped: false, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      );
      m.rotation.y = Math.PI; // faces the camera (the face looks down -z)
      if (side > 0) m.scale.x = -1; // the wearer's left: its outer edge is +x
      m.renderOrder = 2;
      m.userData.side = side;
      this.cheeks.push(m);
      this.paint.add(m);
    }
    const nose = new THREE.Shape();
    nose.moveTo(-0.05, 0.02); nose.lineTo(0.05, 0.02); nose.quadraticCurveTo(0.012, -0.04, 0, -0.045); nose.quadraticCurveTo(-0.012, -0.04, -0.05, 0.02);
    this.noseDot = new THREE.Mesh(new THREE.ShapeGeometry(nose, 6), new THREE.MeshBasicMaterial({ color: 0xf4a3a8, side: THREE.DoubleSide, transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
    this.noseDot.renderOrder = 3;
    this.paint.add(this.noseDot);
    this.paint.visible = false;
    this.apply(false);
    this.place(null);
  }

  /** Load the Eclipse can (for the can earrings). Everything else is built in code and is on at once. */
  async load(): Promise<void> {
    if (this.loaded) return;
    this.can = await loadCan();
    this.loaded = true;
    // swap any stand-in hoops for the cans now they are here
    if (this.can && SETS[this.look].ears.includes('can')) { this.worn.ears = [null, null]; this.apply(false); }
  }

  /** The engine's face mesh (facecontroller loading detail): a depth-only occluder that follows your expressions. */
  meshLoading(detail: any): void { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (this.faceMesh || !detail?.indices || !detail?.pointsPerDetection) return;
    const idx: number[] = [];
    for (const t of detail.indices) {
      if (typeof t === 'number') idx.push(t);
      else idx.push(t.a, t.b, t.c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(detail.pointsPerDetection * 3), 3));
    geo.setIndex(idx);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ colorWrite: false }));
    m.renderOrder = -10;
    m.frustumCulled = false;
    m.visible = false;
    m.name = 'face-occluder';
    this.faceMesh = m;
    this.group.add(m);
  }

  setLook(l: FxLook, anim = true): void {
    this.look = l;
    this.apply(anim);
  }

  /** A face cue: the earrings swing, the hat hops (no expression heads: Bobo stands beside you for that). */
  react(mood: HeadMood | null, _hold = 1.8): void {
    this.mood = mood;
    if (!mood || this.reduced) return;
    const k = mood === 'surprised' ? 1.4 : 1;
    for (const e of this.ears) if (e) e.vel.x += (Math.random() < 0.5 ? -1 : 1) * 2.2 * k;
    this.hop = 1;
  }

  /** Follow the engine's attachment points (face units), falling back to measured positions; the face mesh too. */
  place(points: Record<string, { position: { x: number; y: number; z: number } }> | null, vertices?: Array<{ x: number; y: number; z: number }>): void {
    const set = (out: THREE.Vector3, name: string, fb: THREE.Vector3, k: number) => {
      const q = points?.[name]?.position;
      if (q) out.lerp(this.vD.set(q.x, q.y, q.z), k); else out.lerp(fb, k);
    };
    set(this.pts.lobeL, 'leftLobe', AP.leftLobe, 0.5);
    set(this.pts.lobeR, 'rightLobe', AP.rightLobe, 0.5);
    set(this.pts.tip, 'noseTip', AP.noseTip, 0.5);
    set(this.pts.bridge, 'noseBridge', AP.noseBridge, 0.5);
    set(this.pts.forehead, 'forehead', AP.forehead, 0.4);
    set(this.pts.cheekL, 'leftCheek', AP.leftCheek, 0.5);
    set(this.pts.cheekR, 'rightCheek', AP.rightCheek, 0.5);
    const fm = this.faceMesh;
    if (fm && vertices?.length) {
      const a = fm.geometry.attributes.position as THREE.BufferAttribute, n = Math.min(a.count, vertices.length);
      for (let i = 0; i < n; i++) { const v = vertices[i]; a.setXYZ(i, v.x, v.y, v.z + 0.012); } // a hair back: studs stay visible
      a.needsUpdate = true;
      fm.visible = true;
    }
  }

  /** Every piece arrives again (the face was just found). */
  pop(): void {
    for (const s of Object.values(this.slots)) for (const w of s.children) if (!w.userData.leaving) this.animate(w, 1);
    for (const e of this.ears) if (e) this.animate(e.w, 1);
    if (this.paintFade.to > 0) this.paintFade.cur = 0;
  }

  update(dt: number, reduced: boolean): void {
    this.reduced = reduced;
    // anims
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.t = Math.min(1, a.t + dt / a.dur);
      W.animFrame(a.w, a.spec, a.dir, a.t, reduced);
      if (a.t >= 1) { this.anims.splice(i, 1); a.done?.(); }
    }
    // slots follow the points (the booth's offsets from the measured defaults)
    const p = this.pts;
    this.hop = Math.max(0, this.hop - dt * 2.6);
    const hop = reduced ? 0 : Math.sin((1 - this.hop) * Math.PI) * this.hop * 0.06;
    this.slots.hat.position.set(0, p.forehead.y - AP.forehead.y + hop, p.forehead.z - AP.forehead.z);
    this.slots.shades.position.set(p.bridge.x, p.bridge.y - AP.noseBridge.y, p.bridge.z - AP.noseBridge.z);
    this.slots.nose.position.copy(p.tip);
    // paint: on the cheek points, pulled in a little under the eyes; fades in / out
    for (const m of this.cheeks) {
      const c = m.userData.side > 0 ? p.cheekL : p.cheekR;
      m.position.set(c.x * 0.92 + m.userData.side * 0.04, c.y + 0.02, c.z - 0.04);
      m.rotation.set(0, Math.PI - m.userData.side * 0.42, 0);
    }
    this.noseDot.position.set(p.tip.x, p.tip.y + 0.01, p.tip.z - 0.035);
    this.noseDot.rotation.set(0, Math.PI, 0);
    const f = this.paintFade;
    if (f.cur !== f.to) {
      f.cur += Math.sign(f.to - f.cur) * Math.min(Math.abs(f.to - f.cur), dt / (reduced ? 0.15 : 0.45));
      for (const m of this.cheeks) (m.material as THREE.MeshBasicMaterial).opacity = f.cur;
      (this.noseDot.material as THREE.MeshBasicMaterial).opacity = this.worn.paint === 'whiskers' ? f.cur : 0;
      this.paint.visible = f.cur > 0.001;
    }
    // earrings: hang from the lobes, swing toward gravity (a damped spring on the hanging direction, in face space)
    this.group.updateWorldMatrix(true, false);
    this.group.getWorldQuaternion(this.qW);
    const down = this.vD.set(0, -1, 0).applyQuaternion(this.qT.copy(this.qW).invert()).normalize();
    const h = Math.min(dt, 1 / 30);
    this.ears.forEach((e, i) => {
      if (!e) return;
      e.obj.position.copy(i === 0 ? p.lobeL : p.lobeR);
      if (e.fixed || e.len <= 0) { e.obj.quaternion.identity(); return; }
      // a pendulum: gravity across the string, damping; kicks (react) add velocity
      const stiff = reduced ? 60 : 38, damp = reduced ? 14 : 3.2;
      const pull = this.vA.copy(down).addScaledVector(e.dir, -e.dir.dot(down)); // the part of gravity across the swing
      e.vel.addScaledVector(pull, stiff * h);
      e.vel.addScaledVector(e.vel, -damp * h);
      e.vel.addScaledVector(e.dir, -e.vel.dot(e.dir)); // no stretching along the string
      e.dir.addScaledVector(e.vel, h).normalize();
      // keep the swing to a plausible cone (never up through the ear)
      if (e.dir.y > -0.2) { e.dir.y = -0.2; e.dir.normalize(); }
      e.obj.quaternion.setFromUnitVectors(W_DOWN, e.dir);
    });
  }

  // ------------------------------------------------------------------ wearing
  private animate(w: THREE.Object3D, dir: 1 | -1, done?: () => void): void {
    const spec = w.userData.anim;
    for (let i = this.anims.length - 1; i >= 0; i--) if (this.anims[i].w === w) this.anims.splice(i, 1);
    const dur = this.reduced ? 0.2 : dir > 0 ? spec.inS : spec.outS;
    this.anims.push({ w, spec, dir, t: 0, dur, done });
    W.animFrame(w, spec, dir, 0, this.reduced);
  }

  private apply(anim: boolean): void {
    const set = SETS[this.look];
    const make = {
      hat: (id: Hat) => (id === 'cathat' ? W.buildCatHat() : id === 'visor' ? W.buildVisor() : null),
      shades: (id: Shades) =>
        id === 'bobo' ? W.buildShades({ frame: 'gold', tint: 'rgba(63,155,230,0.58)', ears: 'bobo' })
          : id === 'night' ? W.buildShades({ frame: 'blue', tint: 'rgba(15,21,25,0.72)', ears: 'bobo' })
            : id === 'gold' ? W.buildShades({ frame: 'gold', tint: 'rgba(246,195,68,0.42)', ears: 'spike' }) : null,
      nose: (id: Nose) => (id === 'none' ? null : W.buildNose(id)),
    };
    for (const k of ['hat', 'shades', 'nose'] as const) {
      const id = set[k], slot = this.slots[k];
      if (this.worn[k] === id) continue;
      this.worn[k] = id;
      for (const old of slot.children.filter((c) => !c.userData.leaving)) {
        old.userData.leaving = true;
        const drop = () => { slot.remove(old); dispose(old); };
        if (anim) this.animate(old, -1, drop); else drop();
      }
      const obj = (make[k] as (id: string) => THREE.Object3D | null)(id);
      if (!obj) continue;
      const w = W.wrap(obj, k, id);
      slot.add(w);
      if (anim) this.animate(w, 1); else W.animFrame(w, w.userData.anim, 1, 1, this.reduced);
    }
    // earrings (each its own rig, so it can swing)
    set.ears.forEach((want, i) => {
      const kind: Ear = want === 'can' && !this.can ? 'hoop' : want;
      if (this.worn.ears[i] === kind && this.ears[i]) return;
      this.worn.ears[i] = kind;
      const cur = this.ears[i];
      if (cur) {
        this.ears[i] = null;
        const drop = () => { this.group.remove(cur.obj); dispose(cur.obj); };
        if (anim) this.animate(cur.w, -1, drop); else drop();
      }
      if (!kind) return;
      const piece = W.buildEarring(kind, this.can);
      const w = W.wrap(piece, 'ears', kind);
      const obj = new THREE.Group();
      obj.name = `earring-${i ? 'right' : 'left'}`;
      obj.add(w);
      this.group.add(obj);
      this.ears[i] = { kind, obj, w, len: w.userData.len ?? 0, fixed: !!w.userData.fixed, dir: new THREE.Vector3(0, -1, 0), vel: new THREE.Vector3(anim ? (i ? -1.5 : 1.5) : 0, 0, 0) };
      if (anim) this.animate(w, 1); else W.animFrame(w, w.userData.anim, 1, 1, this.reduced);
    });
    // paint
    if (this.worn.paint !== set.paint) {
      const was = this.worn.paint;
      this.worn.paint = set.paint;
      if (set.paint !== 'none') {
        const tex = cheekTex(set.paint);
        for (const m of this.cheeks) {
          const mat = m.material as THREE.MeshBasicMaterial;
          mat.map?.dispose();
          mat.map = tex;
          mat.needsUpdate = true;
        }
        if (was !== 'none' && was) this.paintFade.cur = 0;
      }
      this.paintFade.to = set.paint === 'none' ? 0 : 1;
      if (!anim) this.paintFade.cur = this.paintFade.to === 1 ? 0.999 : 0.001;
    }
  }
}

const W_DOWN = new THREE.Vector3(0, -1, 0);

function dispose(o: THREE.Object3D): void {
  o.traverse((x) => { (x as THREE.Mesh).geometry?.dispose(); });
}
