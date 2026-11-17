// Fanatics Booth hats: four Meshy models (flat brim, curved brim, the A-frame ball cap, cuffed pom beanie), six products.
// Each product is a texture on one of the three bases (scripts/build-fanatics: texel_map.py + recolor.py + pack.py),
// so the page loads 4 meshes, not 6 (the A-frame got its own: the curved model carries the Sixers script
// embroidery as raised geometry, which shows through any other texture). Units: the 8th Wall face's own units ("FU", ~139 mm); x = wearer's left, y up,
// z = back of the head (the face looks down -z). Flat colours only.
import * as THREE from 'three';

export const MM = 1 / 139;
const BASE = './models/';
// how each base sits on a head. The Meshy models face +z with y up; `zc` = the crown's centre (model units),
// `bottom` = the bottom of the crown wall, `width` = the crown's target width across the head (FU).
// The band is tilted so the front rides up the forehead and the back drops to the nape, like a cap is worn.
export const FIT = {
  flat:   { file: 'flat.glb',   zc: -0.28, bottom: -0.43, half: 0.72, width: 1.30, y: 0.25, z: -0.02, tilt: 0.06 },
  curved: { file: 'curved.glb', zc: -0.21, bottom: -0.43, half: 0.59, width: 1.26, y: 0.06, z: -0.02, tilt: -0.04 },
  ball:   { file: 'ball.glb',   zc: -0.21, bottom: -0.41, half: 0.59, width: 1.26, y: 0.06, z: -0.02, tilt: -0.04 },
  beanie: { file: 'beanie.glb', zc: 0.0,   bottom: -0.95, half: 0.75, width: 1.30, y: 0.15, z: -0.01, tilt: 0.26 },
};
// the six products. `tex` null = the base model's own texture (the photo Meshy built it from).
export const HATS = [
  { id: 'blue76',  base: 'flat',   tex: null,      img: 'hat5', name: '76ers Blue 59FIFTY',          sub: 'Flat brim · Fitted' },
  { id: 'black76', base: 'flat',   tex: 'black76', img: 'hat3', name: '76ers Black 59FIFTY',         sub: 'Flat brim · Fitted' },
  { id: 'sixers',  base: 'flat',   tex: 'sixers',  img: 'hat2', name: 'Sixers Black/Red 9FIFTY',      sub: 'Flat brim · Snapback' },
  { id: 'ball',    base: 'ball',   tex: null,     img: 'hat1', name: '76ers Blue/Red A-Frame',       sub: 'Curved brim · Snapback' },
  { id: 'script',  base: 'curved', tex: null,      img: 'hat4', name: 'Sixers Red Script',            sub: 'Curved brim · Snapback' },
  { id: 'beanie',  base: 'beanie', tex: null,      img: 'hat6', name: '76ers Striped Pom Knit',       sub: 'Cuffed knit with pom' },
];

const gltfs = {}, texs = {};
export async function loadHats(loader) {
  const tl = new THREE.TextureLoader();
  await Promise.all([
    ...Object.entries(FIT).map(async ([k, f]) => { gltfs[k] = await loader.loadAsync(BASE + f.file); }),
    ...HATS.filter((h) => h.tex).map(async (h) => {
      const t = await tl.loadAsync(BASE + 'tex/' + h.tex + '.jpg'); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; texs[h.tex] = t;
    }),
  ]);
}

// One hat, ready to wear: a frame on the head with the model inside, fitted to FIT. Returned group's userData has
// `inner` (the part the entrance animation moves).
export function buildHat(id) {
  const h = HATS.find((x) => x.id === id); if (!h) return null;
  const f = FIT[h.base], src = gltfs[h.base].scene;
  const model = src.clone(true);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    const m = o.material.clone();
    if (h.tex) m.map = texs[h.tex];
    // Meshy materials can come in shiny or with emission: fabric is matt
    m.roughness = 0.88; m.metalness = 0; if (m.emissive) m.emissive.setRGB(0, 0, 0); m.emissiveMap = null;
    m.side = THREE.FrontSide; o.material = m;
  });
  const k = f.width / (f.half * 2);
  const inner = new THREE.Group(); inner.add(model);
  model.rotation.y = Math.PI;                       // brim to the face's front (-z)
  model.scale.setScalar(k);
  model.position.set(0, -f.bottom * k, f.zc * k);   // crown centre over the origin, bottom of the crown at y 0
  const frame = new THREE.Group(); frame.position.set(0, f.y, f.z); frame.rotation.x = f.tilt; frame.add(inner);
  const root = new THREE.Group(); root.name = 'hat:' + id; root.add(frame);
  root.userData = { id, inner, base: h.base };
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
