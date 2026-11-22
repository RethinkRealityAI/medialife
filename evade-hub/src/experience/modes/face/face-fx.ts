// What the Selfie puts on your head and face, in face units (1 FU ~ 118-139 mm; x = wearer's left, y up, the face
// looks down -z). Two looks:
//   hood    Happi's own head from the model (src/happi/hood.ts, the head Happi wears), a vertical face oval centred on
//           your face, the hood wraps the head (the code-built hood is the fallback); a depth-only head occluder hides what is behind your head.
//   faces   flat "Happi faces" decals: red cheek dots, the little squirrel face on your forehead, and the four
//           official expression heads that pop up beside you to match your face (smile, gasp, frown, sleepy).
// Both looks can pop an expression head when you react. Flat colours, DoubleSide because the display is mirrored.
import * as THREE from 'three';
import { buildHood, buildModelHood } from '../../../happi/hood';

const RED = 0xe8222a;

export type FxLook = 'hood' | 'faces';
export type HeadMood = 'happy' | 'surprised' | 'grumpy' | 'sleepy';
const MOODS: HeadMood[] = ['happy', 'surprised', 'grumpy', 'sleepy'];

// fallbacks (FU) when the engine does not send an attachment point (immersive skill: measured points)
const CHEEKS = { left: new THREE.Vector3(0.32, -0.24, -0.5), right: new THREE.Vector3(-0.32, -0.24, -0.5) };
const FOREHEAD = new THREE.Vector3(0, 0.5, -0.62);

/** Hood fit (FU): the opening centre relative to the face anchor, its scale and a small forward tilt. */
export const HOOD_FIT = { x: 0, y: 0, z: 0, scale: 1, tilt: 0.06 };

export function heartShape(size: number): THREE.ShapeGeometry {
  // Happi's build: a cherry blossom (five notched petals), centred, about `size` across (photo mode's hop blossoms)
  const r = size / 2;
  const shapes: THREE.Shape[] = [];
  for (let k = 0; k < 5; k++) {
    const a = (k * 2 * Math.PI) / 5, c = Math.cos(a), sn = Math.sin(a);
    const P = (x: number, y: number) => new THREE.Vector2((x * c - y * sn) * r, (x * sn + y * c) * r);
    const s = new THREE.Shape();
    const p0 = P(0, 0);
    s.moveTo(p0.x, p0.y);
    let q = [P(-0.5, 0.3), P(-0.43, 0.93), P(-0.12, 0.93)];
    s.bezierCurveTo(q[0].x, q[0].y, q[1].x, q[1].y, q[2].x, q[2].y);
    const n = P(0, 0.77), m = P(0.12, 0.93);
    s.lineTo(n.x, n.y); s.lineTo(m.x, m.y);
    q = [P(0.43, 0.93), P(0.5, 0.3), P(0, 0)];
    s.bezierCurveTo(q[0].x, q[0].y, q[1].x, q[1].y, q[2].x, q[2].y);
    shapes.push(s);
  }
  return new THREE.ShapeGeometry(shapes, 8);
}

const flat = (color: number) =>
  new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });

/** The little squirrel face from Happi's forehead: three white stripes, two eyes, a dot nose (canvas, flat). */
function foreheadTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 192;
  const g = c.getContext('2d')!;
  g.lineCap = 'round';
  g.strokeStyle = '#1b1b1f'; g.lineWidth = 9;
  g.fillStyle = '#ffffff';
  g.beginPath(); g.moveTo(52, 46); g.quadraticCurveTo(128, 18, 204, 46); g.stroke();
  for (const x of [104, 128, 152]) { g.beginPath(); g.ellipse(x, 52, 7, 18, 0, 0, Math.PI * 2); g.fill(); g.stroke(); }
  for (const x of [96, 160]) {
    g.fillStyle = '#ffffff';
    g.beginPath(); g.ellipse(x, 116, 30, 34, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#1b1b1f'; g.beginPath(); g.ellipse(x + 2, 120, 12, 18, 0, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#1b1b1f'; g.beginPath(); g.ellipse(128, 160, 9, 7, 0, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A piece that pops in (scale) when the face is found. */
interface Piece { node: THREE.Object3D; delay: number }

export class FaceFx {
  readonly group = new THREE.Group();
  look: FxLook = 'hood';
  /** The expression head showing now (null: none). */
  mood: HeadMood | null = null;
  hoodLoaded = false;
  private pieces: Piece[] = [];
  private hood = new THREE.Group();
  private decals = new THREE.Group();
  private cheekL = new THREE.Group();
  private cheekR = new THREE.Group();
  private brow = new THREE.Group();
  private heads = new THREE.Group();
  private headMeshes = new Map<HeadMood, THREE.Mesh>();
  private popT = 1;
  private moodT = 0;
  private moodHold = 0;

  constructor(opts: { heads?: boolean } = {}) {
    this.group.name = 'face-fx';
    // depth-only head: hides whatever is behind your head (the hood's back, Happi behind you)
    const occ = new THREE.Mesh(
      new THREE.SphereGeometry(1, 28, 18),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true }),
    );
    occ.scale.set(0.5, 0.72, 0.56);
    occ.position.set(0, 0.04, 0.03);
    occ.renderOrder = -1;
    occ.name = 'head-occluder';
    this.group.add(occ);

    this.hood.name = 'happi-hood';
    this.group.add(this.hood);
    this.pieces.push({ node: this.hood, delay: 0 });

    // ---- Happi faces: cheek dots + forehead squirrel
    this.decals.name = 'happi-faces';
    this.group.add(this.decals);
    const cheekG = new THREE.CircleGeometry(0.075, 36), cheekM = flat(RED);
    for (const [g, name] of [[this.cheekL, 'cheek-left'], [this.cheekR, 'cheek-right']] as const) {
      const m = new THREE.Mesh(cheekG, cheekM);
      m.renderOrder = 2;
      g.add(m);
      g.name = name;
      this.decals.add(g);
      this.pieces.push({ node: g, delay: 0.1 });
    }
    const browM = new THREE.MeshBasicMaterial({
      map: foreheadTexture(), transparent: true, side: THREE.DoubleSide, toneMapped: false, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
    });
    const brow = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.315), browM);
    brow.rotation.y = Math.PI; // faces the camera (the face looks down -z)
    brow.scale.x = -1; // and reads the right way round in the mirrored selfie
    brow.renderOrder = 3;
    this.brow.add(brow);
    this.brow.name = 'forehead-squirrel';
    this.decals.add(this.brow);
    this.pieces.push({ node: this.brow, delay: 0.18 });

    // ---- the four expression heads (cut from the official artwork), floating up beside your head
    this.heads.name = 'expression-heads';
    this.heads.position.set(-0.78, 0.78, -0.1);
    this.heads.visible = opts.heads !== false;
    this.group.add(this.heads);
    const loader = new THREE.TextureLoader();
    for (const m of MOODS) {
      const tex = loader.load(`/evade/hub/img/happi/head-${m}.webp`);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.62, 0.57),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide, toneMapped: false, depthTest: false }),
      );
      mesh.rotation.y = Math.PI;
      mesh.scale.set(-0.001, 0.001, 1);
      mesh.renderOrder = 20;
      mesh.visible = false;
      mesh.name = `head-${m}`;
      this.heads.add(mesh);
      this.headMeshes.set(m, mesh);
    }
    this.setLook('hood');
    this.place(null);
  }

  /** Load the hood once: Happi's own head as worn by Happi; the code-built hood if the model can't load. */
  async loadHood(_loader?: unknown): Promise<void> {
    if (this.hoodLoaded) return;
    const fit = new THREE.Group();
    fit.name = 'hood-fit';
    try {
      fit.add(await buildModelHood()); // the model head, no fur (Dapo, round 6: the same one Happi has)
    } catch (e) {
      console.warn('[selfie] model hood failed, using the drawn one', e);
      fit.add(buildHood());
    }
    if (this.hoodLoaded) return;
    this.hood.add(fit);
    this.applyFit();
    this.hoodLoaded = true;
  }

  applyFit(): void {
    const fit = this.hood.children[0];
    if (!fit) return;
    fit.position.set(HOOD_FIT.x, HOOD_FIT.y, HOOD_FIT.z);
    fit.rotation.x = HOOD_FIT.tilt;
    fit.scale.setScalar(HOOD_FIT.scale);
  }

  setLook(l: FxLook): void {
    this.look = l;
    this.hood.visible = l === 'hood';
    this.decals.visible = l === 'faces';
  }

  /** Pop an expression head beside you for `hold` seconds (null clears it). */
  react(mood: HeadMood | null, hold = 1.8): void {
    if (mood && mood === this.mood) { this.moodHold = Math.max(this.moodHold, hold); return; }
    for (const [k, m] of this.headMeshes) if (k !== mood) m.visible = false;
    this.mood = mood;
    this.moodT = 0;
    this.moodHold = hold;
    if (mood) this.headMeshes.get(mood)!.visible = true;
  }

  /** Follow the engine's attachment points (face units), falling back to measured positions. */
  place(points: Record<string, { position: { x: number; y: number; z: number } }> | null): void {
    const p = (name: string, fb: THREE.Vector3, out: THREE.Object3D, dz: number) => {
      const q = points?.[name]?.position;
      if (q) out.position.set(q.x, q.y, q.z + dz);
      else out.position.set(fb.x, fb.y, fb.z + dz);
    };
    p('leftCheek', CHEEKS.left, this.cheekL, -0.035);
    p('rightCheek', CHEEKS.right, this.cheekR, -0.035);
    // the engine's cheek points sit out on the cheekbones: pull the dots in a little, under the eyes
    this.cheekL.position.x *= 0.86; this.cheekR.position.x *= 0.86;
    this.cheekL.position.y -= 0.02;
    this.cheekR.position.y -= 0.02;
    p('forehead', FOREHEAD, this.brow, -0.05);
  }

  /** Start the pop-in. */
  pop(): void {
    this.popT = 0;
  }

  update(dt: number, reduced: boolean): void {
    if (this.popT < 1.6) {
      this.popT += dt;
      for (const pc of this.pieces) {
        const t = Math.max(0, Math.min(1, (this.popT - (reduced ? 0 : pc.delay)) / (reduced ? 0.2 : 0.45)));
        const c = 1.7;
        const k = reduced ? t : 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
        pc.node.scale.setScalar(Math.max(0.001, k));
      }
    }
    // the expression head: springs in, bobs, then shrinks away when the hold runs out
    if (!this.mood) return;
    const m = this.headMeshes.get(this.mood)!;
    this.moodT += dt;
    this.moodHold -= dt;
    let s: number;
    if (this.moodHold <= 0) {
      s = Math.max(0, 1 + this.moodHold / 0.25);
      if (s <= 0.001) { m.visible = false; this.mood = null; return; }
    } else {
      const t = Math.min(1, this.moodT / (reduced ? 0.15 : 0.35));
      const c = 1.9;
      s = reduced ? t : 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
    }
    m.scale.set(-Math.max(0.001, s), Math.max(0.001, s), 1);
    m.position.y = reduced ? 0 : Math.sin(this.moodT * 3.2) * 0.03;
    m.rotation.z = reduced ? 0 : Math.sin(this.moodT * 2.1) * 0.08;
  }
}
