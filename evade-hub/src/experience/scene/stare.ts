// The Care Bear Stare beam: six flat rainbow stripes (no gradients) that roll out from Happi's tummy, dip to the
// floor and run along it towards the viewer. One mesh, one program (built and compiled with the stage); its vertices
// are rewritten in place while the beam is on (preallocated, nothing allocated per frame).
import * as THREE from 'three';
import { RAINBOW } from './fx';

const STRIPES = RAINBOW.length;
const SEG = 56;

export class StareBeam {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array;
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();
  private d = new THREE.Vector3();
  private side = new THREE.Vector3();
  private p = new THREE.Vector3();

  constructor() {
    // each stripe has its own vertex columns (so the colours are hard-edged): stripes x (SEG+1) x 2 vertices
    const vcount = STRIPES * (SEG + 1) * 2;
    this.pos = new Float32Array(vcount * 3);
    const col = new Float32Array(vcount * 3);
    const idx: number[] = [];
    const c = new THREE.Color();
    for (let s = 0; s < STRIPES; s++) {
      c.setHex(RAINBOW[s], THREE.SRGBColorSpace);
      for (let i = 0; i <= SEG; i++) {
        for (let e = 0; e < 2; e++) {
          const v = (s * (SEG + 1) + i) * 2 + e;
          col.set([c.r, c.g, c.b], v * 3);
        }
        if (i < SEG) {
          const v0 = (s * (SEG + 1) + i) * 2;
          idx.push(v0, v0 + 1, v0 + 2, v0 + 1, v0 + 3, v0 + 2);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.mesh = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.96, depthWrite: false, toneMapped: false }),
    );
    this.mesh.name = 'stare-beam';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.visible = false;
  }

  get material(): THREE.MeshBasicMaterial {
    return this.mesh.material as THREE.MeshBasicMaterial;
  }

  /**
   * Lay the beam out (stage-local): from `from` (her tummy) to `to` (on the floor). `tail` .. `head` (0..1) is the
   * visible part; widths at the start and end; `t` animates a little wave.
   */
  set(from: THREE.Vector3, to: THREE.Vector3, tail: number, head: number, w0: number, w1: number, t: number, wave = 1): void {
    const P = this.pos;
    this.a.copy(from);
    this.b.copy(to);
    this.d.subVectors(this.b, this.a).setY(0);
    const len = this.d.length() || 1;
    this.d.divideScalar(len);
    this.side.set(-this.d.z, 0, this.d.x);
    const y0 = this.a.y, y1 = this.b.y;
    for (let i = 0; i <= SEG; i++) {
      const u = tail + (head - tail) * (i / SEG);
      // XZ: straight out; y: from the tummy down to the floor by 45 % of the way (smooth, no slope at either end)
      const s = Math.min(1, u / 0.45);
      const y = y1 + (y0 - y1) * (1 - s) * (1 - s) * (1 + 2 * s);
      const wob = Math.sin(u * 13 - t * 9) * 0.035 * wave * Math.min(1, u * 4);
      this.p.copy(this.a).addScaledVector(this.d, u * len).addScaledVector(this.side, wob).setY(y + Math.max(0, Math.sin(u * 9 - t * 7)) * 0.02 * wave);
      const w = w0 + (w1 - w0) * Math.min(1, u * 1.4);
      for (let k = 0; k < STRIPES; k++) {
        const l = (k / STRIPES - 0.5) * w, r = ((k + 1) / STRIPES - 0.5) * w;
        const v = (k * (SEG + 1) + i) * 2 * 3;
        P[v] = this.p.x + this.side.x * l; P[v + 1] = this.p.y; P[v + 2] = this.p.z + this.side.z * l;
        P[v + 3] = this.p.x + this.side.x * r; P[v + 4] = this.p.y; P[v + 5] = this.p.z + this.side.z * r;
      }
    }
    const at = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    at.needsUpdate = true;
  }
}
