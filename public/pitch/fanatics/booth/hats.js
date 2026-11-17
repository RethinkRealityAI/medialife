// Fanatics Booth hats: one Meshy 7 model per product (meshy-7.1 geometry, meshy-7 PBR textures from 4K, packed by
// scripts/build-fanatics/pack_hq.py), so every stitch, eyelet and patch is the product's own. Models load on demand:
// the worn hat first, the rest in the background. Units: the 8th Wall face's own units ("FU", ~139 mm); x = wearer's
// left, y up, z = back of the head (the face looks down -z). Flat colours only.
import * as THREE from 'three';

export const MM = 1 / 139;
const BASE = './models/';
// How each style sits on a head (Dapo round 3: caps sat short at the back and hair showed behind them on a side
// turn). The crown is fitted on its own measured band, not the model's box:
// - width / depth: the crown's inside at the band, across and front to back (FU). Heads are longer than wide
//   (about 1.25:1 with hair) but Meshy crowns are almost round, so depth is scaled on its own.
// - height: extra stretch of the crown upwards, so hair can't poke over the top.
// - y: the band's height over the face's forehead point; the band's FRONT sits on the forehead skin (measured from
//   the live face mesh every frame), so the crown reaches as far back as the head does.
// - tilt: the back of the band drops toward the nape (positive = back down), like a real cap.
// All of it is for a reference face 1.18 FU wide (cheek to cheek); each wearer's face scales it (main.js).
export const FIT = {
  flat:   { width: 1.42, depth: 1.66, height: 1.10, y: 0.16, tilt: 0.05 },
  curved: { width: 1.38, depth: 1.64, height: 1.10, y: 0.08, tilt: 0.08 },
  beanie: { width: 1.36, depth: 1.60, height: 1.00, y: 0.12, tilt: 0.26 },
};
// the reference head that FIT is tuned on, in FU: face width (vertices 234-454) and the skull the occluder stands for
export const HEAD = { faceW: 1.18, rx: 0.62, ry: 0.86, rz: 0.72, cy: 0.06, inset: 0.1 };
// the six products (photos from the Fanatics 76ers headwear page)
export const HATS = [
  { id: 'blue76',  style: 'flat',   img: 'hat5', name: '76ers Blue 59FIFTY',          sub: 'Flat brim · Fitted' },
  { id: 'black76', style: 'flat',   img: 'hat3', name: '76ers Black 59FIFTY',         sub: 'Flat brim · Fitted' },
  { id: 'sixers',  style: 'flat',   img: 'hat2', name: 'Sixers Black/Red 9FIFTY',      sub: 'Flat brim · Snapback' },
  { id: 'ball',    style: 'curved', img: 'hat1', name: '76ers Blue/Red A-Frame',       sub: 'Curved brim · Snapback' },
  { id: 'script',  style: 'curved', img: 'hat4', name: 'Sixers Red Script',            sub: 'Curved brim · Snapback' },
  { id: 'beanie',  style: 'beanie', img: 'hat6', name: '76ers Striped Pom Knit',       sub: 'Cuffed knit with pom' },
];

const gltfs = {}, pending = {};
let loader = null;
export const isLoaded = (id) => !!gltfs[id];
// load one hat (once); resolves to true when it can be built
export function loadHat(id) {
  if (gltfs[id]) return Promise.resolve(true);
  if (!pending[id]) pending[id] = loader.loadAsync(BASE + id + '.glb').then((g) => { noMips(g.scene); gltfs[id] = { scene: g.scene, fit: fitOf(g.scene) }; return true; });
  return pending[id];
}
// Meshy packs UV islands edge to edge with no gutter, so mipmaps average neighbouring islands and draw white "lint"
// lines along every seam. A hat on a face is shown near full texture size, so plain linear filtering looks sharp.
function noMips(scene) {
  scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) { const t = o.material[k]; if (t) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; } }
  });
}
// first the hats needed now, then the rest one at a time (keeps the first try-on fast on mobile data)
export async function loadHats(gltfLoader, first = []) {
  loader = gltfLoader;
  await Promise.all(first.map(loadHat));
  (async () => { for (const h of HATS) await loadHat(h.id).catch((e) => console.warn('hat', h.id, e)); })();
}
// Measure the crown in the model's own space (front = +z, the brim side). The brim is kept out of it: the bottom is
// taken from the back half, the width and back from a band slice, the front from a slice above any brim.
function fitOf(scene) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene), v = new THREE.Vector3(), pts = [];
  scene.traverse((o) => {
    if (!o.isMesh) return; const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 2) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); pts.push(v.x, v.y, v.z); }
  });
  let bottom = Infinity; for (let i = 0; i < pts.length; i += 3) if (pts[i + 2] < 0 && pts[i + 1] < bottom) bottom = pts[i + 1];
  const H = box.max.y - bottom; let half = 0, back = Infinity, front = -Infinity;
  for (let i = 0; i < pts.length; i += 3) {
    const x = pts[i], y = (pts[i + 1] - bottom) / H, z = pts[i + 2];
    if (y > 0.12 && y < 0.45) { half = Math.max(half, Math.abs(x)); back = Math.min(back, z); }
    if (y > 0.38 && y < 0.52) front = Math.max(front, z);
  }
  return { half, bottom, back, front, height: H };
}
// One hat, ready to wear: a frame on the head with the model inside, fitted to FIT. Returned group's userData has
// `inner` (the part the entrance animation moves). Null if the model hasn't loaded yet.
export function buildHat(id) {
  const h = HATS.find((x) => x.id === id); if (!h || !gltfs[id]) return null;
  const f = FIT[h.style], m0 = gltfs[id], src = m0.scene, fit = m0.fit;
  const model = src.clone(true);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    const m = o.material.clone();
    // fabric is matt; keep Meshy's normal + roughness maps (they carry the stitching), cap the shine
    m.metalness = 0; m.metalnessMap = null; if (m.emissive) m.emissive.setRGB(0, 0, 0); m.emissiveMap = null;
    if (!m.roughnessMap) m.roughness = 0.85;
    m.side = THREE.FrontSide; o.material = m;
  });
  const kx = f.width / (fit.half * 2), kz = f.depth / (fit.front - fit.back), ky = kx * f.height;
  const inner = new THREE.Group(); inner.add(model);
  model.rotation.y = Math.PI;                              // brim to the face's front (-z)
  model.scale.set(kx, ky, kz);
  model.position.set(0, -fit.bottom * ky, fit.front * kz); // the band's front-bottom on the frame's origin
  const frame = new THREE.Group(); frame.position.set(0, f.y, 0); frame.rotation.x = f.tilt; frame.add(inner);
  const root = new THREE.Group(); root.name = 'hat:' + id; root.add(frame);
  root.userData = { id, inner, base: h.style };
  return root;
}

// ---------------------------------------------------------------- head occluder (no stencil: depth only)
// The engine tracks the face only (no full-head mesh), so the rest of the head is an ellipsoid sized from the
// wearer's face and kept INSIDE the hat's crown (an occluder poking out of the crown cuts the hat's back off on a
// side turn). It hides what the real head would: the hat's inside and anything behind the head. `debug` paints it.
export function buildHeadOccluder(debug) {
  const mat = debug ? new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true }) : new THREE.MeshBasicMaterial({ colorWrite: false });
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), mat); head.name = 'skull';
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.44, 1.6, 24), mat); neck.position.set(0, -1.1, 0.16);
  g.add(head, neck); g.traverse((o) => { o.renderOrder = -10; o.frustumCulled = false; });
  g.userData.head = head; fitHeadOccluder(g, 1, -0.6);
  return g;
}
// r = this face's size over the reference face; frontZ = the forehead skin (FU)
export function fitHeadOccluder(g, r, frontZ) {
  const h = g.userData.head;
  h.scale.set(HEAD.rx * r, HEAD.ry * r, HEAD.rz * r);
  h.position.set(0, HEAD.cy, frontZ + HEAD.inset + HEAD.rz * r);
}
// ---------------------------------------------------------------- entrance and exit
// Caps drop onto the head and settle with a small bounce; the beanie pulls down over the head. Exit: a flick up.
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const easeInCubic = (x) => x * x * x;
const bounce = (x) => { const n = 7.5625, d = 2.75; if (x < 1 / d) return n * x * x; if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75; if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375; return n * (x -= 2.625 / d) * x + 0.984375; };
export const DUR = { in: 0.75, out: 0.35 };
export function animFrame(root, dir, t, reduced) {
  const g = root.userData.inner; g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.setScalar(1);
  if (reduced) { const s = dir > 0 ? easeOutCubic(t) : 1 - t; g.scale.setScalar(Math.max(s, 0.0001)); root.visible = s > 0.001; return; }
  if (dir > 0) {
    if (root.userData.base === 'beanie') {   // pulled down over the head
      const k = easeOutCubic(t); g.position.y = (1 - k) * 0.55; g.scale.set(1 - (1 - k) * 0.12, 1 + (1 - k) * 0.25, 1 - (1 - k) * 0.12);
    } else {                                   // dropped on, a little spin, a bounce
      const k = bounce(Math.min(t / 0.85, 1)); g.position.y = (1 - k) * 1.1; g.rotation.y = (1 - easeOutCubic(t)) * -0.6; g.rotation.x = (1 - k) * -0.25;
    }
    root.visible = true;
  } else {
    const k = easeInCubic(t); g.position.y = k * 1.2; g.position.z = k * -0.3; g.rotation.x = -k * 0.9; g.scale.setScalar(Math.max(1 - k * 0.6, 0.0001));
    root.visible = t < 1;
  }
}
