// Spray Bobo: things placed around the print (models, pictures, video), from the CMS's scene editor.
//
// The contract (src/lib/spray/model.ts, the same in the editor, the Studio, the share viewer and here): the origin is
// the centre of the 3:4 tracked picture, x right, y up, z out of the print, MILLIMETRES of the real print (the
// picture is heightMm tall), rotations in degrees, XYZ order. Models: uniform scale = size / bounding-box height,
// the box's centre on pos. Pictures and video: a plane `size` mm tall and size * aspect wide. Video is muted,
// loops and plays inline; it gets its sound after a tap, only if `sound`. Items with `visible: false` are skipped.
//
// In AR the items hang off the tracked picture (A in main.js), so they only show while the piece is tracked now,
// at its exact real size: a piece drawn H units tall gets H / heightMm units per millimetre. On the side that
// moves the canvas (the can's back) they move with it; on a mirrored side (the cat seen through the acrylic)
// they are placed mirrored but never drawn mirrored (a picture with words stays readable).
//
// While painting nothing here is hit-tested (the spray aims at the picture's plane, the decals and the sticker
// are picked by their own meshes), and items that stand in front of the print fade to a ghost, so they never
// hide the paint or the reticle's spot. A failed asset is skipped (console.warn), never the page.
import * as THREE from 'three';
import { sceneItems } from './cms.js';

const FADE = 0.22;                         // how much of an item in front of the print shows while painting
const ORDER = 15;                          // drawn after the sticker (12), the orbit (13) and the occluder (14)
let gltf = null;
const getGltf = () => gltf || (gltf = Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/libs/meshopt_decoder.module.js')])
  .then(([{ GLTFLoader }, { MeshoptDecoder }]) => { const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder); return l; })
  .catch((e) => { gltf = null; throw e; }));
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('image ' + src)); i.src = src; });
const num = (v, d) => (Number.isFinite(+v) ? +v : d);
const trio = (a) => [0, 1, 2].map((i) => num(Array.isArray(a) ? a[i] : 0, 0));

// One piece's scene. host: the group that follows the tracked picture (A). W, H: the picture in AR units.
// Returns null when there is nothing to show.
export function makeScene({ scene, heightMm, W, H, host, soundOn = () => true }) {
  const list = sceneItems(scene); if (!list.length || !(num(heightMm, 0) > 0)) return null;
  const root = new THREE.Group(); root.name = 'scene-root'; root.visible = false; host.add(root);
  const side = new THREE.Group(); side.name = 'scene-side'; root.add(side);      // the canvas's offset on the side in view
  const mm = new THREE.Group(); mm.name = 'scene-mm'; mm.scale.setScalar(H / heightMm); side.add(mm);
  const hmm = +heightMm, wmm = hmm * W / H;
  const S = { root, side, mm, items: [], mirror: false, shown: false, hiddenFor: 1e9, heard: false, occluder: null, W, H, heightMm: hmm };
  list.forEach((it, i) => {
    const h = new THREE.Group(); h.name = 'scene-' + (it.id || i); h.visible = false; mm.add(h);
    const e = { it, i, holder: h, pos: trio(it.pos), rot: trio(it.rot).map(THREE.MathUtils.degToRad), size: +it.size, ready: false, dead: false,
      mixer: null, video: null, mats: [], front: false, k: 1, pop: 1, sound: it.kind === 'video' && it.sound === true };
    S.items.push(e); place(e, false);
    const made = it.kind === 'model' ? getGltf().then((l) => l.loadAsync(it.file)).then((g) => model(g, e))
      : it.kind === 'image' ? loadImg(it.file).then((img) => { const t = new THREE.Texture(img); t.needsUpdate = true; plane(t, num(it.aspect, 0) > 0 ? +it.aspect : img.naturalWidth / img.naturalHeight, e); })
        : video(e);
    made.then(() => {
      // in front of the print (and over it)? Then it fades while painting. Behind it? The print hides it.
      h.updateMatrix(); const box = new THREE.Box3().setFromObject(h, true);   // in mm, about the print's centre (mm group is the parent)
      const inv = new THREE.Matrix4().copy(mm.matrixWorld).invert(); box.applyMatrix4(inv);
      e.front = box.max.z > 0.5 && box.max.x > -wmm / 2 && box.min.x < wmm / 2 && box.max.y > -hmm / 2 && box.min.y < hmm / 2;
      if (box.min.z < -0.5) needOccluder(S);
      e.box = box; e.ready = true; e.pop = 0; if (S.shown) play(e);
    }).catch((err) => { console.warn('scene: skipped', it.file, err); h.removeFromParent(); e.dead = true; });
  });
  S.listen = () => { if (S.heard) return; S.heard = true; sync(S, soundOn); for (const t of ['pointerup', 'keydown']) removeEventListener(t, S.listen, true); };
  for (const t of ['pointerup', 'keydown']) addEventListener(t, S.listen, true);
  document.addEventListener('visibilitychange', () => { for (const e of S.items) if (e.video) { if (document.hidden) e.video.pause(); else if (S.shown) play(e); } });
  return S;
}

// pos / rot as placed, or mirrored about the picture's vertical middle (x -> -x; the turn about y and z reverses)
function place(e, mirror) {
  const [x, y, z] = e.pos, [rx, ry, rz] = e.rot;
  e.holder.position.set(mirror ? -x : x, y, z);
  e.holder.rotation.set(rx, mirror ? -ry : ry, mirror ? -rz : rz, 'XYZ');
}
function model(g, e) {
  const m = g.scene, inner = new THREE.Group(); inner.add(m); inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner), h = box.max.y - box.min.y;
  if (!(h > 1e-9)) throw new Error('empty model');
  const s = e.size / h, c = box.getCenter(new THREE.Vector3());
  inner.scale.setScalar(s); inner.position.copy(c).multiplyScalar(-s);
  m.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.renderOrder = ORDER; o.raycast = () => {}; keep(e, o.material); } });
  if (e.it.clip) {
    const clip = THREE.AnimationClip.findByName(g.animations || [], e.it.clip);
    if (clip) { e.mixer = new THREE.AnimationMixer(m); e.mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play(); }
    else console.warn('scene: no clip', e.it.clip, 'in', e.it.file);
  }
  e.holder.add(inner);
}
function plane(tex, aspect, e) {
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.01, side: THREE.DoubleSide, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(e.size * a, e.size), mat);
  mesh.renderOrder = ORDER; mesh.frustumCulled = false; mesh.raycast = () => {}; keep(e, mat); e.holder.add(mesh);
}
function video(e) {
  return new Promise((res, rej) => {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous'; v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
    v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
    let done = false;
    const ok = () => {
      if (done) return; done = true;
      plane(new THREE.VideoTexture(v), num(e.it.aspect, 0) > 0 ? +e.it.aspect : (v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 16 / 9), e);
      e.video = v; v.pause(); res();
    };
    v.addEventListener('loadeddata', ok, { once: true });
    v.addEventListener('error', () => { if (!done) { done = true; rej(new Error('video ' + e.it.file)); } }, { once: true });
    setTimeout(() => { if (!done) { done = true; rej(new Error('video timed out ' + e.it.file)); } }, 20000);
    v.src = e.it.file; v.load();
  });
}
function keep(e, mat) {   // remember each material's own look, to fade it and bring it back exactly
  for (const m of Array.isArray(mat) ? mat : [mat]) if (m && !e.mats.some((x) => x.m === m)) e.mats.push({ m, opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite });
}
function play(e) { if (e.video && e.video.paused) e.video.play().catch(() => { /* after a tap */ }); }
function sync(S, soundOn) { for (const e of S.items) if (e.video) e.video.muted = !(e.sound && S.heard && soundOn()); }
// the print itself hides what is behind it (an invisible card the size of the tracked picture)
function needOccluder(S) {
  if (S.occluder) return;
  const o = new THREE.Mesh(new THREE.PlaneGeometry(S.W, S.H), new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }));
  o.renderOrder = ORDER - 1; o.raycast = () => {}; o.name = 'scene-occluder'; S.root.add(o); S.occluder = o;
}

// each frame. on: the piece is the current one and tracked now; painting: paint or decal mode;
// flip / xf: the side in view (as the canvas: F in main.js); dt in seconds.
export function tickScene(S, { on, painting, flip = 1, xf = null, dt, soundOn = () => true }) {
  if (!S) return;
  if (!on) {
    S.hiddenFor += dt;
    if (S.shown) { S.shown = false; S.root.visible = false; for (const e of S.items) if (e.video) e.video.pause(); }
    return;
  }
  if (!S.shown) {
    S.shown = true; S.root.visible = true;
    const again = S.hiddenFor > 0.6; S.hiddenFor = 0;
    for (const e of S.items) { if (again) e.pop = 0; if (e.ready) play(e); }
    sync(S, soundOn);
  }
  const x = xf || { x: 0, y: 0, rz: 0, s: 1 }, mirror = flip < 0;
  S.side.position.set(x.x, x.y, 0); S.side.rotation.set(0, 0, x.rz); S.side.scale.setScalar(x.s);
  if (mirror !== S.mirror) { S.mirror = mirror; for (const e of S.items) place(e, mirror); }
  for (const e of S.items) {
    if (e.dead || !e.ready) continue;
    e.holder.visible = true;
    if (e.mixer) e.mixer.update(dt);
    // pops in (a quick overshoot) when the piece is found; then exactly its size
    if (e.pop < 1) { e.pop = Math.min(1, e.pop + dt / 0.4); const k = e.pop, c = 1.7, q = k - 1; e.holder.scale.setScalar(Math.max(1e-3, 1 + (c + 1) * q * q * q + c * q * q)); }
    else e.holder.scale.setScalar(1);
    const want = painting && e.front ? FADE : 1;
    e.k += (want - e.k) * Math.min(1, dt * 8); if (Math.abs(want - e.k) < 0.004) e.k = want;
    for (const s of e.mats) {
      const faded = e.k < 0.999;
      s.m.opacity = s.opacity * e.k; s.m.depthWrite = faded ? false : s.depthWrite;
      if (s.m.transparent !== (faded || s.transparent)) { s.m.transparent = faded || s.transparent; s.m.needsUpdate = true; }
    }
  }
}

// for tests: where each item is and how big, as fractions of the picture's height (in the picture's own frame)
export function measureScene(S, A) {
  if (!S) return [];
  A.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(A.matrixWorld).invert();
  return S.items.filter((e) => e.ready && !e.dead).map((e) => {
    e.holder.updateMatrixWorld(true);
    const c = new THREE.Vector3(); e.holder.getWorldPosition(c); const lc = c.clone().applyMatrix4(inv);
    // the drawn geometry, in the item's own frame (its vertices through every transform below the holder)
    const hinv = new THREE.Matrix4().copy(e.holder.matrixWorld).invert(), g = new THREE.Box3(), m = new THREE.Matrix4(), v = new THREE.Vector3();
    e.holder.traverse((o) => {
      if (!o.isMesh || !o.geometry) return; const p = o.geometry.attributes.position; m.multiplyMatrices(hinv, o.matrixWorld);
      for (let i = 0; i < p.count; i++) g.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(m));
    });
    const ys = new THREE.Vector3().setFromMatrixColumn(e.holder.matrixWorld, 1).length();   // world units per mm along the item's up
    const gw = g.isEmpty() ? null : g.getCenter(new THREE.Vector3()).applyMatrix4(e.holder.matrixWorld), gc = gw && gw.clone().applyMatrix4(inv);
    return { id: e.it.id, kind: e.it.kind, localPos: lc.toArray(), worldPos: c.toArray(), geomWorld: gw && gw.toArray(), geomCentre: gc && gc.toArray(), geomHeightMm: g.isEmpty() ? 0 : g.max.y - g.min.y,
      geomWidthMm: g.isEmpty() ? 0 : g.max.x - g.min.x, worldHeight: (g.isEmpty() ? 0 : g.max.y - g.min.y) * ys, front: e.front, k: e.k, visible: e.holder.visible && S.root.visible };
  });
}
