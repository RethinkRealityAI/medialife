// Fanatics Booth hats: one Meshy 7 model per product (meshy-7.1 geometry, meshy-7 PBR textures from 4K, packed by
// scripts/build-fanatics/pack_hq.py), so every stitch, eyelet and patch is the product's own. Models load on demand:
// the worn hat first, the rest in the background. Units: the 8th Wall face's own units ("FU", ~139 mm); x = wearer's
// left, y up, z = back of the head (the face looks down -z). Flat colours only.
import * as THREE from 'three';

export const MM = 1 / 139;
const BASE = './models/';
// how each style sits on a head. `width` = the crown's width across the head (FU, a real cap is ~1.45 FU wide on an
// average head); y/z = where the crown's bottom centre sits; tilt = front up the forehead, back down to the nape.
// The crown's own centre and bottom are measured from each model when it loads (fitOf).
export const FIT = {
  flat:   { width: 1.44, y: 0.17, z: 0.0,  tilt: 0.0 },
  curved: { width: 1.40, y: 0.04, z: 0.0,  tilt: -0.06 },
  beanie: { width: 1.42, y: 0.12, z: 0.0,  tilt: 0.24 },
};
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
// measure the crown in the model's own space (front = +z): width across, its bottom, and the centre of its top half
// front to back (the brim stays out of it: it is low)
function fitOf(scene) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene), v = new THREE.Vector3();
  const yMid = box.min.y + (box.max.y - box.min.y) * 0.55; let z0 = Infinity, z1 = -Infinity;
  scene.traverse((o) => {
    if (!o.isMesh) return; const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 3) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); if (v.y > yMid) { if (v.z < z0) z0 = v.z; if (v.z > z1) z1 = v.z; } }
  });
  return { half: (box.max.x - box.min.x) / 2, bottom: box.min.y, zc: (z0 + z1) / 2 };
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
  const k = f.width / (fit.half * 2);
  const inner = new THREE.Group(); inner.add(model);
  model.rotation.y = Math.PI;                         // brim to the face's front (-z)
  model.scale.setScalar(k);
  model.position.set(0, -fit.bottom * k, fit.zc * k); // crown centre over the origin, bottom of the crown at y 0
  const frame = new THREE.Group(); frame.position.set(0, f.y, f.z); frame.rotation.x = f.tilt; frame.add(inner);
  const root = new THREE.Group(); root.name = 'hat:' + id; root.add(frame);
  root.userData = { id, inner, base: h.style };
  return root;
}

// ---------------------------------------------------------------- head occluder (no stencil: depth only)
export function buildHeadOccluder() {
  const mat = new THREE.MeshBasicMaterial({ colorWrite: false });
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), mat); head.scale.set(0.56, 0.82, 0.62); head.position.set(0, 0.06, 0.06);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.44, 1.6, 24), mat); neck.position.set(0, -1.1, 0.16);
  g.add(head, neck); g.traverse((o) => { o.renderOrder = -10; });
  return g;
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
