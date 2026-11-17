// Fanatics Booth hats: one Meshy 7 model per product (meshy-7.1 geometry, meshy-7 PBR textures from 4K, packed by
// scripts/build-fanatics/pack_hq.py), so every stitch, eyelet and patch is the product's own. Models load on demand:
// the worn hat first, the rest in the background. Units: the 8th Wall face's own units ("FU", ~139 mm); x = wearer's
// left, y up, z = back of the head (the face looks down -z). Flat colours only.
import * as THREE from 'three';

export const MM = 1 / 139;
const BASE = './models/';
// How each style sits on a head. Sized from standard adult head measurements, not from one test face (round 4:
// on Dapo's head the round 3 hats sat ~1.5 cm high and stopped short of the back). In face units (FU): the face
// mesh is ~1.18 FU cheek to cheek (vertices 234-454), about 140 mm on an adult, so 1 FU is ~118 mm. An average
// adult head is ~195 mm long and ~153 mm wide (57 cm round) = 1.65 x 1.29 FU; a cap goes round that plus hair.
// - width / depth: the crown at the band, across and front to back. Meshy crowns are almost round, heads are not,
//   so each axis is scaled on its own (the brim keeps the width's scale, so it doesn't stretch).
// - height: extra stretch of the crown upwards.
// - y: the band's height over the face's forehead point (caps: ~2.5 cm above the brows; the beanie comes down to
//   the brows and the top of the ears). z: forward (-) / back (+) from the forehead skin.
// - tilt: the back of the band drops toward the nape (positive = back down).
// Every value can be changed live in Options > Adjust fit; values Dapo sends back get baked in here or in TUNED.
export const FIT = {
  flat:   { width: 1.48, depth: 1.84, height: 1.08, y: 0.10,  z: 0, tilt: 0.07 },
  curved: { width: 1.46, depth: 1.82, height: 1.08, y: 0.05,  z: 0, tilt: 0.08 },
  beanie: { width: 1.50, depth: 1.84, height: 1.00, y: -0.03, z: 0, tilt: 0.14 },
};
// per-hat values baked in from phone tuning (hat id -> any of the FIT keys)
export const TUNED = {};
// live overrides from the Adjust fit panel (kept on this phone); `head` scales the hidden head shape
export const TUNE = { hats: {}, head: 1 };
export const fitFor = (id) => { const h = HATS.find((x) => x.id === id); return h ? { ...FIT[h.style], ...(TUNED[id] || {}), ...(TUNE.hats[id] || {}) } : null; };
// the reference head, in FU: face width and the skull the occluder stands for (half width, half height, half length)
export const HEAD = { faceW: 1.18, rx: 0.645, ry: 0.92, rz: 0.835, cy: 0.06, inset: 0.08 };
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
  const box = new THREE.Box3().setFromObject(scene), v = new THREE.Vector3(), pts = [], I = new THREE.Matrix4(); let plain = true;
  scene.traverse((o) => {
    if (!o.isMesh) return; const p = o.geometry.attributes.position; if (!o.matrixWorld.equals(I)) plain = false;
    for (let i = 0; i < p.count; i += 2) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); pts.push(v.x, v.y, v.z); }
  });
  let bottom = Infinity; for (let i = 0; i < pts.length; i += 3) if (pts[i + 2] < 0 && pts[i + 1] < bottom) bottom = pts[i + 1];
  const H = box.max.y - bottom; let half = 0, back = Infinity, front = -Infinity;
  for (let i = 0; i < pts.length; i += 3) {
    const x = pts[i], y = (pts[i + 1] - bottom) / H, z = pts[i + 2];
    if (y > 0.12 && y < 0.45) { half = Math.max(half, Math.abs(x)); back = Math.min(back, z); }
    if (y > 0.38 && y < 0.52) front = Math.max(front, z);
  }
  return { half, bottom, back, front, height: H, plain };
}
// One hat, ready to wear: a frame on the head with the model inside, fitted to FIT. Returned group's userData has
// `inner` (the part the entrance animation moves). Null if the model hasn't loaded yet.
export function buildHat(id) {
  const h = HATS.find((x) => x.id === id); if (!h || !gltfs[id]) return null;
  const f = fitFor(id), m0 = gltfs[id], src = m0.scene, fit = m0.fit;
  const kx = f.width / (fit.half * 2), kz = f.depth / (fit.front - fit.back), ky = kx * f.height;
  const model = src.clone(true);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    const m = o.material.clone();
    // fabric is matt; keep Meshy's normal + roughness maps (they carry the stitching), cap the shine
    m.metalness = 0; m.metalnessMap = null; if (m.emissive) m.emissive.setRGB(0, 0, 0); m.emissiveMap = null;
    if (!m.roughnessMap) m.roughness = 0.85;
    m.side = THREE.FrontSide; o.material = m;
    if (fit.plain) o.geometry = brimGeo(id, o, fit.front, kx / kz);   // only when the mesh sits in the model's own space
  });
  const inner = new THREE.Group(); inner.add(model);
  model.rotation.y = Math.PI;                              // brim to the face's front (-z)
  model.scale.set(kx, ky, kz);
  model.position.set(0, -fit.bottom * ky, fit.front * kz); // the band's front-bottom on the frame's origin
  const frame = new THREE.Group(); frame.position.set(0, f.y, f.z || 0); frame.rotation.x = f.tilt; frame.add(inner);
  const root = new THREE.Group(); root.name = 'hat:' + id; root.add(frame);
  root.userData = { id, inner, base: h.style };
  return root;
}

// The crown is stretched front to back more than across; the brim (everything ahead of the crown's front) is pulled
// back by the same ratio so it keeps its real length. One geometry per hat mesh and ratio, cached.
const brimCache = new Map();
function brimGeo(id, mesh, front, ratio) {
  if (Math.abs(ratio - 1) < 0.01) return mesh.geometry;
  const src = mesh.geometry, key = id + ':' + src.uuid + ':' + ratio.toFixed(2);
  let g = brimCache.get(key);
  if (!g) {
    g = src.clone(); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const z = p.getZ(i); if (z > front) p.setZ(i, front + (z - front) * ratio); }
    p.needsUpdate = true; if (brimCache.size > 40) brimCache.clear(); brimCache.set(key, g);
  }
  return g;
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
  const k = r * TUNE.head;
  h.scale.set(HEAD.rx * k, HEAD.ry * k, HEAD.rz * k);
  h.position.set(0, HEAD.cy, frontZ + HEAD.inset + HEAD.rz * k);
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
