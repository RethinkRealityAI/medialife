// The 3D library: what you can place and paint. Plain data + one loader.
// EVADE pieces are the exact files the other EVADE experiences use (Bobo = Cola Run's catrun.glb, the Blender
// Eclipse can, the classic Roblox Bobo). Nothing here was made with a generative or image-to-3D tool (EVADE rule):
// the blank toy, skate deck, art block and spray can are scripted geometry (scripts/build-spray-enhanced/props.py),
// the robot is three.js's CC0 RobotExpressive (Tomás Laulhé), already used by our Labs demos.
// The paint atlas: `atlas` = a sidecar made by scripts/build-spray-enhanced/atlas.py (the model's own UVs overlap),
// or null = the model carries its atlas as TEXCOORD_1 (our procedural props).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const HERE = '/evade/spray-bobo-enhanced/';
// h: default height on the floor (m), [min, max] for pinch. poses: animation clips offered under Options > Pose.
export const ASSETS = [
  { id: 'bobo', name: 'Bobo', brands: ['evade'], url: '/roblox/activated-retail/models/catrun.glb?v=2', atlas: 'catrun', h: 0.42, range: [0.15, 1.6], poses: ['Idle', 'Alert', 'Purr', 'Sleep', 'Run'], pose: 'Idle', blurb: 'From Cola Run' },
  { id: 'can', name: 'Eclipse can', brands: ['evade'], url: '/evade/keychain/ar/eclipse-can.glb', atlas: 'eclipse-can', h: 0.5, range: [0.12, 2.0], hide: ['Can_Fizz', 'Silhouette'], keep: ['Can_Body_Line'], blurb: 'The can off your keychain' },
  { id: 'classic', name: 'Classic Bobo', brands: ['evade'], url: '/evade/keychain/ar/old-bobo.glb', atlas: 'old-bobo', h: 0.5, range: [0.15, 1.8], hide: ['Silhouette'], poses: ['Sit', 'PawRaise', 'TailWag', 'ClassicWalk'], pose: 'Sit', blurb: 'The original' },
  { id: 'figure', name: 'MEDIALIFE figure', brands: ['medialife'], url: '/medialife/activated-retail/models/ml_figure.glb', atlas: 'ml_figure', h: 0.4, range: [0.12, 1.8], blurb: 'Our collectible' },
  { id: 'toy', name: 'Blank toy', brands: ['evade', 'medialife'], url: HERE + 'models/toy.glb', atlas: null, h: 0.32, range: [0.1, 1.5], blurb: 'Designer vinyl blank' },
  { id: 'deck', name: 'Skate deck', brands: ['evade', 'medialife'], url: HERE + 'models/deck.glb', atlas: null, h: 0.125, range: [0.05, 0.4], label: 'long', blurb: 'Full size, 80 cm' },
  { id: 'block', name: 'Art block', brands: ['evade', 'medialife'], url: HERE + 'models/block.glb', atlas: null, h: 0.4, range: [0.12, 1.6], blurb: 'Six sides to fill' },
  { id: 'spraycan', name: 'Giant spray can', brands: ['medialife'], url: HERE + 'models/spraycan.glb', atlas: null, h: 1.0, range: [0.2, 2.2], blurb: 'A can to paint, for once' },
  { id: 'robot', name: 'Robot', brands: ['evade', 'medialife'], url: '/labs/demos/media/robot.glb', atlas: 'robot', h: 0.5, range: [0.15, 2.0], poses: ['Idle', 'Dance', 'ThumbsUp', 'Jump', 'Walking'], pose: 'Idle', blurb: 'Dances while you paint' },
];
// friendly part names for the Fill tool ("Filled Bobo's ear")
const PART_NAMES = [
  [/head/i, 'head'], [/ear/i, 'ear'], [/torso|body(?!_line)/i, 'body'], [/backleg|leg/i, 'leg'], [/frontleg|arm/i, 'arm'], [/tail/i, 'tail'],
  [/clothes1/i, 'hoodie'], [/clothes/i, 'hood strings'], [/cap/i, 'cap'], [/brim/i, 'brim'], [/label|can_body_1/i, 'label'], [/alumin|can_body_2|rivet|tab/i, 'metal'],
  [/opening/i, 'top'], [/deck/i, 'deck'], [/truck/i, 'truck'], [/wheel/i, 'wheel'], [/plinth/i, 'plinth'], [/block/i, 'block'],
  [/shoulder/i, 'shoulder'], [/nozzle/i, 'nozzle'], [/hand/i, 'hand'], [/foot/i, 'foot'], [/eye/i, 'eye'], [/smile/i, 'smile'], [/shirt/i, 'shirt'], [/pants/i, 'trousers'],
];
export function partName(mesh) {
  const n = (mesh.name || '') + ' ' + ((mesh.material && mesh.material.name) || '');
  for (const [re, w] of PART_NAMES) if (re.test(n)) return w;
  return 'part';
}

const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();
async function loadAtlas(name) {
  const buf = await fetch(HERE + 'models/atlas/' + name + '.atlas.bin').then((r) => { if (!r.ok) throw new Error('atlas ' + name); return r.arrayBuffer(); });
  const n = new DataView(buf).getUint32(0, true), head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, n))), body = 4 + n;
  const map = new Map();
  for (const p of head.prims) map.set(p.key, {
    xref: new Uint32Array(buf, body + p.xref, p.n),
    index: p.wide ? new Uint32Array(buf, body + p.index, p.t * 3) : new Uint16Array(buf, body + p.index, p.t * 3),
    uv: new Uint16Array(buf, body + p.uv, p.n * 2),
  });
  return map;
}
// re-index a geometry onto the atlas (xatlas splits vertices on chart seams) and give it `paintUv`
function remap(geo, a) {
  const g = new THREE.BufferGeometry(), n = a.xref.length;
  for (const [k, attr] of Object.entries(geo.attributes)) {
    const is = attr.itemSize, Arr = (attr.isInterleavedBufferAttribute ? attr.data.array : attr.array).constructor, dst = new Arr(n * is);
    // raw values (getComponent would de-normalise quantised data into an integer array)
    const src = attr.isInterleavedBufferAttribute ? attr.data.array : attr.array, stride = attr.isInterleavedBufferAttribute ? attr.data.stride : is, off = attr.isInterleavedBufferAttribute ? attr.offset : 0;
    for (let i = 0; i < n; i++) { const b = a.xref[i] * stride + off; for (let c = 0; c < is; c++) dst[i * is + c] = src[b + c]; }
    g.setAttribute(k, new THREE.BufferAttribute(dst, is, attr.normalized));
  }
  g.setIndex(new THREE.BufferAttribute(a.index, 1));
  const uv = new Float32Array(n * 2); for (let i = 0; i < n * 2; i++) uv[i] = a.uv[i] / 65535;
  g.setAttribute('paintUv', new THREE.BufferAttribute(uv, 2));
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}
async function loadSource(def) {
  if (cache.has(def.id)) return cache.get(def.id);
  const p = (async () => {
    const [gltf, atlas] = await Promise.all([loader.loadAsync(def.url), def.atlas ? loadAtlas(def.atlas) : null]);
    const parts = new Set();
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      if ((def.hide || []).some((h) => o.name.startsWith(h))) { o.visible = false; return; }
      if ((def.keep || []).some((h) => o.name.startsWith(h))) return;        // shown, not painted (outline hull)
      if (atlas) {
        const as = gltf.parser.associations.get(o); const key = as && as.meshes !== undefined ? 'm' + as.meshes + 'p' + (as.primitives || 0) : null;
        const a = key && atlas.get(key); if (!a) return;
        if (!o.geometry.userData.atlased) { const g = remap(o.geometry, a); g.userData.atlased = true; o.geometry = g; }
      } else if (o.geometry.attributes.uv1) o.geometry.setAttribute('paintUv', o.geometry.attributes.uv1);
      if (o.geometry.attributes.paintUv) { o.userData.paintable = true; parts.add(o); }
    });
    return { gltf, def };
  })();
  cache.set(def.id, p);
  p.catch(() => cache.delete(def.id));
  return p;
}
export function preload(def) { return loadSource(def).catch(() => null); }

/** a fresh copy ready to place: { def, root (Group: put it where it goes), model, parts, mixer, clips, h0 } */
export async function instance(def) {
  const { gltf } = await loadSource(def);
  const model = SkeletonUtils.clone(gltf.scene);
  model.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
  const parts = []; model.traverse((o) => { if (o.isMesh && o.userData.paintable) parts.push(o); });
  // stand it on y = 0, centred, facing +z; unit height (the page scales `root`)
  const holder = new THREE.Group(); holder.add(model);
  let mixer = null; const clips = {};
  if (gltf.animations.length) {
    mixer = new THREE.AnimationMixer(model);
    for (const c of gltf.animations) clips[c.name] = c;
  }
  const pose0 = def.pose && clips[def.pose];
  if (pose0) { const a = mixer.clipAction(pose0); a.play(); mixer.update(0); }
  model.updateMatrixWorld(true);
  const box = new THREE.Box3();
  model.traverse((o) => { if (o.isMesh && o.visible) { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); box.union(b); } });
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const k = 1 / size.y;
  model.position.set(-c.x * k, -box.min.y * k, -c.z * k); model.scale.multiplyScalar(k);
  const root = new THREE.Group(); root.add(holder);
  const foot = Math.max(size.x, size.z) * k / 2;           // footprint radius per unit height
  const long = Math.max(size.x, size.z) * k;               // length per unit height (decks are sized by length)
  return { def, root, holder, model, parts, mixer, clips, foot, long, action: pose0 ? mixer.existingAction(pose0) : null };
}
