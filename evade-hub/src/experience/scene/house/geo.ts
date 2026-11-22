// Geometry helpers for Happi's house: everything is built in code at load from three.js primitives and
// extruded 2D shapes, merged per material into a few big meshes with one flat colour per piece (vertex colours,
// no textures, no gradients). Units are metres, door-local: the door opening stands on the floor at z = 0, centred
// on x = 0; the room is on -z, the garden on +z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const C = new THREE.Color();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();

/** A transform: position, rotation (radians, XYZ) and scale. */
export function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}

/** Collects pieces (each one flat colour) and merges them into one geometry with position/normal/uv/color. */
export class Builder {
  private parts: THREE.BufferGeometry[] = [];

  add(geo: THREE.BufferGeometry, hex: number, m?: THREE.Matrix4 | null): this {
    let g = geo.clone();
    geo.dispose();
    if (m) g.applyMatrix4(m);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    const n = g.attributes.position.count;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.index) {
      const idx: number[] = new Array(n);
      for (let i = 0; i < n; i++) idx[i] = i;
      g.setIndex(idx);
    }
    C.setHex(hex); // sRGB -> linear working space
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = C.r; col[i * 3 + 1] = C.g; col[i * 3 + 2] = C.b; }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.parts.push(g);
    return this;
  }

  get count(): number {
    return this.parts.length;
  }

  build(): THREE.BufferGeometry {
    const g = this.parts.length ? mergeGeometries(this.parts, false) : new THREE.BufferGeometry();
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

// ------------------------------------------------------------------ primitives
/** A soft puff (a slightly squashed sphere). */
export function puff(r: number, squash = 1, seg = 12): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.7)));
  if (squash !== 1) g.scale(1, squash, 1);
  return g;
}
/** A dome (upper half of a sphere) sitting on y = 0: nothing pokes under the real floor. */
export function dome(r: number, squash = 1, seg = 14): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, seg, Math.max(4, Math.round(seg * 0.4)), 0, Math.PI * 2, 0, Math.PI / 2);
  if (squash !== 1) g.scale(1, squash, 1);
  return g;
}
export function box(w: number, h: number, d: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d);
}
export function cyl(rt: number, rb: number, h: number, seg = 16, open = false): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
}
export function extrude(shape: THREE.Shape, depth: number, bevel = 0, curveSegments = 18): THREE.BufferGeometry {
  return new THREE.ExtrudeGeometry(shape, {
    depth, curveSegments,
    bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2,
  });
}

// ------------------------------------------------------------------ 2D shapes
let heartPts: THREE.Vector2[] | null = null;
/** The heart outline (same silhouette as the particle and toy hearts), unit width, centred, point down. */
function heartUnit(): THREE.Vector2[] {
  // Happi's house uses a cherry blossom (five notched petals) everywhere the hub this was built on used a heart:
  // the same unit size (1 wide, centred) and winding, so every caller keeps working.
  if (heartPts) return heartPts;
  const pts: THREE.Vector2[] = [];
  const N = 90;
  for (let i = 0; i < N; i++) {
    const th = -Math.PI / 2 - (i / N) * Math.PI * 2; // clockwise from the bottom, like the old outline
    const u = ((((th - Math.PI / 2) / (Math.PI * 2 / 5) + 0.5) % 1) + 1) % 1; // 0..1 across one petal, a petal points up
    let r = 0.3 + 0.7 * Math.pow(Math.sin(Math.PI * u), 0.55);
    r -= 0.16 * Math.max(0, 1 - Math.abs(u - 0.5) / 0.09);
    pts.push(new THREE.Vector2(Math.cos(th) * r, Math.sin(th) * r));
  }
  const bx = new THREE.Box2().setFromPoints(pts);
  const c = bx.getCenter(new THREE.Vector2());
  const w = bx.max.x - bx.min.x;
  heartPts = pts.map((p) => new THREE.Vector2((p.x - c.x) / w, (p.y - c.y) / w));
  return heartPts;
}
/** Heart as a closed path/shape, `w` wide, centred on (cx, cy). Height is about 0.86 w. */
export function heartShape(w: number, cx = 0, cy = 0, into: THREE.Path = new THREE.Shape(), reverse = false): THREE.Path {
  const pts = heartUnit().map((p) => new THREE.Vector2(cx + p.x * w, cy + p.y * w));
  if (reverse) pts.reverse();
  into.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) into.lineTo(pts[i].x, pts[i].y);
  into.closePath();
  return into;
}
export const heart = (w: number, cx = 0, cy = 0): THREE.Shape => heartShape(w, cx, cy) as THREE.Shape;

/** The door outline: straight sides up to `h - w/2`, a half-circle top, bottom on y = 0. */
export function archShape(w: number, h: number, into: THREE.Path = new THREE.Shape(), clockwise = false): THREE.Path {
  const r = w / 2, h0 = h - r;
  if (!clockwise) {
    into.moveTo(-r, 0);
    into.lineTo(r, 0);
    into.lineTo(r, h0);
    into.absarc(0, h0, r, 0, Math.PI, false);
    into.lineTo(-r, 0);
  } else {
    into.moveTo(-r, 0);
    into.lineTo(-r, h0);
    into.absarc(0, h0, r, Math.PI, 0, true);
    into.lineTo(r, 0);
    into.lineTo(-r, 0);
  }
  return into;
}

/** One rainbow band round an arch: inner radius ri, outer ro, legs down to y = y0, arc centre at height h0. */
export function bandShape(ri: number, ro: number, h0: number, y0 = 0): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-ro, y0);
  s.lineTo(-ro, h0);
  s.absarc(0, h0, ro, Math.PI, 0, true);
  s.lineTo(ro, y0);
  s.lineTo(ri, y0);
  s.lineTo(ri, h0);
  s.absarc(0, h0, ri, 0, Math.PI, false);
  s.lineTo(-ri, y0);
  s.closePath();
  return s;
}

export function starShape(r1: number, r2: number, n = 5): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < n * 2; i++) {
    const a = (i * Math.PI) / n + Math.PI / 2, r = i % 2 ? r2 : r1;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
}

export function roundRect(w: number, h: number, r: number, cx = 0, cy = 0): THREE.Shape {
  const s = new THREE.Shape(), x = cx - w / 2, y = cy - h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** A flat cartoon cloud: a flat bottom and a row of round bumps, `w` wide, bottom at y = 0. */
export function cloudShape(w: number, h: number, bumps = 3): THREE.Shape {
  const s = new THREE.Shape();
  const r = h * 0.5;
  s.moveTo(-w / 2 + r, 0);
  s.lineTo(w / 2 - r, 0);
  s.absarc(w / 2 - r, r, r, -Math.PI / 2, Math.PI / 2, false);
  // bumps along the top, the middle one tallest
  const span = w - 2 * r;
  for (let i = bumps - 1; i >= 0; i--) {
    const cx = -span / 2 + (span * (i + 0.5)) / bumps;
    const mid = 1 - Math.abs(i - (bumps - 1) / 2) / bumps;
    const br = Math.max(r, (span / bumps) * 0.62) * (0.85 + 0.35 * mid);
    const cy = h - br;
    s.absarc(cx, cy, br, 0.12, Math.PI - 0.12, false);
  }
  s.absarc(-w / 2 + r, r, r, Math.PI / 2, Math.PI * 1.5, false);
  s.closePath();
  return s;
}

/** Points along a rounded-rectangle room outline (x right, z back), front edge left open. */
export function roomOutline(halfW: number, zFront: number, zBack: number, rc: number, arcSeg = 8): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  pts.push(new THREE.Vector2(-halfW, zFront));
  pts.push(new THREE.Vector2(-halfW, zBack + rc));
  for (let i = 1; i < arcSeg; i++) {
    const a = Math.PI + (i / arcSeg) * (Math.PI / 2); // from -x round to -z
    pts.push(new THREE.Vector2(-halfW + rc + Math.cos(a) * rc, zBack + rc + Math.sin(a) * rc));
  }
  pts.push(new THREE.Vector2(-halfW + rc, zBack));
  pts.push(new THREE.Vector2(halfW - rc, zBack));
  for (let i = 1; i < arcSeg; i++) {
    const a = Math.PI * 1.5 + (i / arcSeg) * (Math.PI / 2);
    pts.push(new THREE.Vector2(halfW - rc + Math.cos(a) * rc, zBack + rc + Math.sin(a) * rc));
  }
  pts.push(new THREE.Vector2(halfW, zBack + rc));
  pts.push(new THREE.Vector2(halfW, zFront));
  return pts;
}

/**
 * A vertical band along a floor outline (x, z points), from y0 to y1, facing the room's inside (to the left of the
 * walking direction when the outline runs front-left -> back -> front-right). UVs in metres (u along, v up).
 * `inset` pulls it into the room.
 */
export function ribbon(pts: THREE.Vector2[], y0: number, y1: number, inset = 0): THREE.BufferGeometry {
  const n = pts.length;
  const nrm: THREE.Vector2[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const dx = b.x - a.x, dz = b.y - a.y, l = Math.hypot(dx, dz) || 1;
    nrm.push(new THREE.Vector2(-dz / l, dx / l)); // inward
  }
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  let u = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) u += pts[i].distanceTo(pts[i - 1]);
    const p = pts[i], q = nrm[i];
    const x = p.x + q.x * inset, z = p.y + q.y * inset;
    pos.push(x, y0, z, x, y1, z);
    nor.push(q.x, 0, q.y, q.x, 0, q.y);
    uv.push(u, y0, u, y1);
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  // make sure the front faces look inward
  const p0 = new THREE.Vector3(pos[0], pos[1], pos[2]), p1 = new THREE.Vector3(pos[6], pos[7], pos[8]), p2 = new THREE.Vector3(pos[3], pos[4], pos[5]);
  const fn = p1.sub(p0).cross(p2.sub(p0));
  if (fn.x * nrm[0].x + fn.z * nrm[0].y < 0) {
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    g.setIndex(idx);
  }
  return g;
}

/** A flat-colour canvas texture (no mipmaps: small, uploads fast, sharp). */
export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
  } else {
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
  }
  return t;
}

export const hex = (n: number): string => '#' + n.toString(16).padStart(6, '0');

/** Draw a heart path on a 2D canvas (centre cx, cy; width w). */
export function canvasHeart(g: CanvasRenderingContext2D, cx: number, cy: number, w: number): void {
  const pts = heartUnit();
  g.beginPath();
  g.moveTo(cx + pts[0].x * w, cy - pts[0].y * w);
  for (let i = 1; i < pts.length; i++) g.lineTo(cx + pts[i].x * w, cy - pts[i].y * w);
  g.closePath();
}
export function canvasStar(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, n = 5, inner = 0.45): void {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i * Math.PI) / n - Math.PI / 2, rr = i % 2 ? r * inner : r;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
}
