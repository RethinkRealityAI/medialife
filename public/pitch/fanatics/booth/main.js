// Fanatics Merch Try-On (folder booth/): a pitch demo for Fanatics. Try 76ers headwear on your own head with the open-source 8th Wall
// engine's FACE tracking (MIT, self-hosted in /evade/keychain-ar/vendor/xr with the face chunk + models), add
// game-day face paint, shoot a photo / video / 4-shot strip, and Shop the hat you are wearing.
//
// Built from the Bobo Booth (/evade/bobo-booth/), trimmed for a retail try-on:
// - six hats on four Meshy models (hats.js); face paint on the live face mesh; up to 2 faces.
// - one face gesture only, a deliberate eyebrow raise for the next hat; no beeps (Dapo 2026-11-17: Bobo Booth's fizz
//   + beep fired on ordinary head moves).
// - the splash 3D canvas is hidden BEFORE its renderer is freed (Bobo Booth showed a white box while "Starting").
// - no EVADE globe events; test logs (kc-diag, page 'fanatics-booth') on previews only.
// Pitch only: unlisted, noindex. The team marks need licensing before any public use.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ColaCapture } from '/evade/cola-run-lab/assets/capture-core.js';
import * as H from './hats.js';

window.THREE = THREE;                         // XR8.Threejs.pipelineModule() looks for a global THREE
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const PAGE = 'fanatics-booth';
const SHOP_URL = 'https://www.fanatics.com/nba/philadelphia-76ers/o-2414+t-70705312+z-98669-1218515703';
const LIVE_SITE = /(^|\.)medialife\.ai$/i.test(location.hostname);
const TOUCH = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = THREE.MathUtils.clamp;
const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* no haptics */ } };
const store = { get(k, d) { try { const v = localStorage.getItem(PAGE + '-' + k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(PAGE + '-' + k, String(v)); } catch (e) { /* none */ } } };

// ---------------------------------------------------------------- sound: only the shutter and the countdown
const sound = {
  ctx: null, on: store.get('sound', '1') === '1', master: null,
  init() { try { this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)(); this.ctx.resume(); if (!this.master) { this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination); } } catch (e) { /* no audio */ } },
  noise(dur, vol, hp, lp, when = 0) {
    if (!this.ctx || !this.on) return;
    const n = Math.floor(this.ctx.sampleRate * dur), b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.6);
    const s = this.ctx.createBufferSource(); s.buffer = b; const g = this.ctx.createGain(); g.gain.value = vol;
    const f1 = this.ctx.createBiquadFilter(); f1.type = 'highpass'; f1.frequency.value = hp;
    const f2 = this.ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = lp;
    s.connect(f1).connect(f2).connect(g).connect(this.master); s.start(this.ctx.currentTime + when);
  },
  shutter() { this.noise(0.05, 0.22, 2000, 9000); this.noise(0.07, 0.16, 1200, 6000, 0.08); },
  count() { this.noise(0.03, 0.08, 3000, 7000); },
};

// ---------------------------------------------------------------- what you can wear
const CATS = [{ k: 'hat', label: 'Headwear' }, { k: 'paint', label: 'Face paint' }];
const ITEMS = {
  hat: [{ id: 'none', name: 'No hat' }, ...H.HATS],
  paint: [
    { id: 'none', name: 'No face paint' },
    { id: 'gameday', name: 'Game day', sub: 'Eye black in 76ers blue and red' },
    { id: 'stars', name: 'Thirteen stars', sub: 'The 76ers star ring on your cheek' },
  ],
};
const wear = { hat: 'blue76', paint: 'none' };
try { Object.assign(wear, JSON.parse(store.get('wear', '{}'))); } catch (e) { /* defaults */ }
for (const k of Object.keys(wear)) if (!ITEMS[k].some((i) => i.id === wear[k])) wear[k] = ITEMS[k][k === 'hat' ? 1 : 0].id;
let cat = 'hat';

// ---------------------------------------------------------------- loading
const gl = new GLTFLoader();
const firstHats = [...new Set([wear.hat !== 'none' ? wear.hat : 'blue76', 'blue76'])];
const assets = Promise.all([H.loadHats(gl, firstHats), document.fonts ? document.fonts.load('900 italic 40px "Exo 2"').catch(() => {}) : null]);
const xrReady = new Promise((res) => (window.XR8 ? res() : window.addEventListener('xrloaded', () => res(), { once: true })));
let loaded = false;
Promise.all([assets, xrReady]).then(() => {
  loaded = true; $('load').hidden = true; $('b-start').disabled = false; $('b-start').textContent = 'Start the try-on';
  hero.init(); buildTray(); hero.start();
}).catch((e) => { console.error(e); showError('Could not load the try-on', 'Check your connection and reload the page.'); });

// ---------------------------------------------------------------- splash hero: the real 3D hats on a display stand
// No head (Dapo round 3): each hat sits on a flat retail puck and turns slowly; a new one drops on every few seconds.
// The canvas is HIDDEN first, then the renderer is freed when the camera starts (freeing it while visible left a white
// box on some phones).
const hero = {
  r: null, scene: null, cam: null, rig: null, raf: 0, hat: null, hatI: 0,
  init() {
    if (this.r) return true;
    try { this.r = new THREE.WebGLRenderer({ canvas: $('hero3d'), antialias: true, alpha: true }); } catch (e) { return false; }
    this.r.outputColorSpace = THREE.SRGBColorSpace; this.r.toneMapping = THREE.NeutralToneMapping; this.r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.r.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(this.r); this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(-1, 2, -3); this.scene.add(dl);
    this.cam = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
    return true;
  },
  stand() {   // a flat puck in Sixers navy with a red rim (flat colours)
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.1, 64), new THREE.MeshStandardMaterial({ color: '#14305a', roughness: 0.7 }));
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.08, 0.05, 64), new THREE.MeshStandardMaterial({ color: '#ed174c', roughness: 0.6 }));
    top.position.y = -0.05; rim.position.y = -0.125; g.add(top, rim); return g;
  },
  frame(w, h) { this.cam.aspect = w / h; const d = w / h < 0.95 ? 5.0 : 6.6; this.cam.position.set(0, d * 0.36, -d); this.cam.lookAt(0, 0.38, 0); this.cam.updateProjectionMatrix(); },
  resize() { const c = $('hero3d'), w = c.clientWidth || 300, h = c.clientHeight || 300; this.r.setSize(w, h, false); this.frame(w, h); },
  // a worn hat's origin is the band's front; on the stand the crown's middle sits over the centre
  place(hat) { const f = H.FIT[hat.userData.base]; hat.children[0].rotation.x = 0; hat.position.set(0, -f.y, -f.depth / 2); return hat; },
  swap() {
    const ready = H.HATS.filter((h) => H.isLoaded(h.id));   // they stream in after the first
    if (!ready.length || (this.hat && ready.length === 1)) return;
    const id = ready[this.hatI++ % ready.length].id;
    if (this.hat && this.hat.userData.id === id) return;
    const old = this.hat; if (old) { this.anim.push({ o: old, dir: -1, t: 0 }); }
    this.hat = this.place(H.buildHat(id)); this.spin.add(this.hat); this.anim.push({ o: this.hat, dir: 1, t: 0 }); H.animFrame(this.hat, 1, 0, REDUCED);
  },
  start() {
    if (!this.init()) return;
    this.rig = new THREE.Group(); this.scene.add(this.rig); this.rig.add(this.stand());
    this.spin = new THREE.Group(); this.rig.add(this.spin); this.anim = [];
    this.swap(); this.resize(); this.onResize = () => this.r && this.resize(); addEventListener('resize', this.onResize);
    let t = 0, next = 2.8; const clock = new THREE.Clock();
    const loop = () => {
      if (!this.r) return;
      const dt = Math.min(clock.getDelta(), 0.05); t += dt;
      if (t > next) { next = t + 2.8; this.swap(); }
      for (let i = this.anim.length - 1; i >= 0; i--) {
        const a = this.anim[i]; a.t = Math.min(1, a.t + dt / (a.dir > 0 ? H.DUR.in : H.DUR.out)); H.animFrame(a.o, a.dir, a.t, REDUCED);
        if (a.t >= 1) { this.anim.splice(i, 1); if (a.dir < 0) this.spin.remove(a.o); }
      }
      this.spin.rotation.y = REDUCED ? Math.PI * 0.15 + Math.sin(t * 0.4) * 0.2 : Math.PI * 0.15 + t * 0.45;
      this.r.render(this.scene, this.cam); this.raf = requestAnimationFrame(loop);
    };
    loop();
  },
  stop() {
    $('hero3d').style.visibility = 'hidden';   // hide first: freeing a visible WebGL canvas can flash white
    cancelAnimationFrame(this.raf); removeEventListener('resize', this.onResize);
    const r = this.r; this.r = null;
    if (r) setTimeout(() => { r.dispose(); r.forceContextLoss(); }, 50);
  },
};

// ---------------------------------------------------------------- the lens carousel (Snapchat / Instagram style)
// Whatever sits in the circle is worn; tap a thumbnail to glide it in. No tick sound (Dapo: no beeps).
const thumbs = {};
let carouselLock = false, settleT = 0, centred = -1;
function buildTray() {
  const tabs = $('tabs'); tabs.innerHTML = '';
  for (const c of CATS) {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.c = c.k; b.textContent = c.label;
    b.onclick = () => { if (cat === c.k) return; cat = c.k; buzz(6); renderTray(); };
    tabs.appendChild(b);
  }
  const car = $('carousel');
  car.addEventListener('scroll', () => { if (carouselLock) return; markCentre(false); clearTimeout(settleT); settleT = setTimeout(() => markCentre(true), 110); }, { passive: true });
  if ('onscrollend' in window) car.addEventListener('scrollend', () => { if (!carouselLock) { clearTimeout(settleT); markCentre(true); } });
  renderTray();
}
function thumbFor(c, item) { const key = c + ':' + item.id; if (!(key in thumbs)) thumbs[key] = c === 'paint' ? paintThumb(item.id) : `img/${item.img}.webp`; return thumbs[key]; }   // hats: the product photo, like a shop swatch
const list = () => ITEMS[cat];
function renderTray() {
  document.querySelectorAll('#tabs button').forEach((b) => { const on = b.dataset.c === cat; b.setAttribute('aria-selected', String(on)); });
  const car = $('carousel'), row = $('lenses'); row.innerHTML = '';
  list().forEach((it, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'lens'; b.dataset.i = i;
    b.setAttribute('aria-label', it.name);
    if (it.id === 'none') b.innerHTML = '<i class="none" aria-hidden="true"></i>';
    else { const src = thumbFor(cat, it); b.innerHTML = src ? `<img src="${src}" alt="" draggable="false"${cat === 'hat' ? ' class="photo"' : ''}>` : '<i class="dot" aria-hidden="true"></i>'; }
    b.onclick = () => { scrollToLens(i, true); };
    row.appendChild(b);
  });
  let at = list().findIndex((it) => wear[cat] === it.id); if (at < 0) at = 0;
  carouselLock = true; centred = at;
  requestAnimationFrame(() => { scrollToLens(at, false); paintCentre(at); setTimeout(() => { carouselLock = false; }, 60); });
}
function scrollToLens(i, smooth) {
  const car = $('carousel'), el = car.querySelector(`.lens[data-i="${i}"]`); if (!el) return;
  car.scrollTo({ left: el.offsetLeft + el.offsetWidth / 2 - car.clientWidth / 2, behavior: smooth && !REDUCED ? 'smooth' : 'auto' });
  if (!smooth) { centred = i; paintCentre(i); }
}
function centreIndex() {
  const car = $('carousel'), mid = car.scrollLeft + car.clientWidth / 2; let best = -1, bd = 1e9;
  car.querySelectorAll('.lens').forEach((el) => { const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid); if (d < bd) { bd = d; best = +el.dataset.i; } });
  return best;
}
function paintCentre(i) {
  $('carousel').querySelectorAll('.lens').forEach((el) => el.classList.toggle('on', +el.dataset.i === i));
  const it = list()[i], name = it ? it.name : '';
  const lab = $('lens-name'); if (lab.textContent !== name) { lab.textContent = name; lab.classList.remove('show'); void lab.offsetWidth; lab.classList.add('show'); }
  $('lens-sub').textContent = it && it.sub ? it.sub : '';
}
function markCentre(settled) {
  const i = centreIndex(); if (i < 0) return;
  if (i !== centred) { centred = i; paintCentre(i); buzz(4); choose(i); }
  else if (settled) paintCentre(i);
}
function choose(i) {
  const it = list()[i]; if (!it) return;
  wear[cat] = it.id; store.set('wear', JSON.stringify(wear)); applyWear(true); shopState();
}
function shopState() { $('b-shop').disabled = wear.hat === 'none'; }

// ---------------------------------------------------------------- the scene
let scene, camera, renderer;
let faceIdx = null, faceUvs = null, paintUV = null;
const MAX_FACES = clamp(Math.round(+params.get('faces') || 2), 1, 3);
const rigs = new Map();
const AP_DEFAULT = { forehead: [0, 0.278, -0.615] };
const tmpV = new THREE.Vector3();
// test hooks: ?occ=show paints the occluders; ?yaw=0.9 (or __fb.setYaw) turns the tracked head to check side views;
// ?smooth=0 turns the pose filter off (its still-head cut-off in Hz, default 4)
const OCC_SHOW = params.get('occ') === 'show';
let testYaw = +params.get('yaw') || 0; const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), testYaw);
const SMOOTH = params.has('smooth') ? Math.max(0, +params.get('smooth') || 0) : 4;
function ap(d, n) { const p = d.attachmentPoints && d.attachmentPoints[n]; return p && p.position ? tmpV.set(p.position.x, p.position.y, p.position.z) : tmpV.set(...AP_DEFAULT[n]); }
// ?fit=y,tilt,width,depth nudges every hat's fit (y/tilt added, width/depth multiplied) for tuning without a redeploy
if (params.get('fit')) { const [y, t, w, dp] = params.get('fit').split(',').map(Number); for (const f of Object.values(H.FIT)) { if (isFinite(y)) f.y += y; if (isFinite(t)) f.tilt += t; if (isFinite(w) && w) f.width *= w; if (isFinite(dp) && dp) f.depth *= dp; } }
function buildScene(xr) {
  ({ scene, camera, renderer } = xr);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping;
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.9;
  const dl = new THREE.DirectionalLight(0xffffff, 1.2); dl.position.set(0.3, 1, 1); scene.add(dl);
  scene.add(new THREE.AmbientLight(0xffffff, 0.3));
  camera.position.set(0, 0, 0); camera.quaternion.identity();
}
function onFaceLoading(d) {
  const idx = []; for (const t of d.indices) { if (typeof t === 'number') idx.push(t); else idx.push(t.a, t.b, t.c); }
  faceIdx = { idx, n: d.pointsPerDetection };
  if (d.uvs && d.uvs.length) { faceUvs = new Float32Array(d.uvs.length * 2); d.uvs.forEach((t, i) => { faceUvs[i * 2] = t.u; faceUvs[i * 2 + 1] = t.v; }); }
  for (const r of rigs.values()) r.makeMeshes();
}

class Rig {
  constructor(id) {
    this.id = id; this.tracked = false; this.at = 0; this.s = 0.139;
    this.anchor = new THREE.Group(); this.anchor.visible = false; scene.add(this.anchor);
    this.skull = H.buildHeadOccluder(OCC_SHOW); this.anchor.add(this.skull);
    this.r = 1; this.frontZ = -0.6;   // this face's size over the reference face; the forehead skin (FU)
    this.P = new THREE.Vector3(); this.Q = new THREE.Quaternion();
    this.slot = new THREE.Group(); this.anchor.add(this.slot);
    this.forehead = new THREE.Vector3(...AP_DEFAULT.forehead);
    this.paintId = null;
    this.makeMeshes(); this.apply(false);
  }
  makeMeshes() {
    if (this.occ || !faceIdx) return;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(faceIdx.n * 3), 3)); geo.setIndex(faceIdx.idx);
    this.occ = new THREE.Mesh(geo, OCC_SHOW ? new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true }) : new THREE.MeshBasicMaterial({ colorWrite: false })); this.occ.renderOrder = -10; this.occ.frustumCulled = false; this.anchor.add(this.occ);
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(faceIdx.n * 3), 3)); pg.setIndex(faceIdx.idx);
    if (faceUvs) pg.setAttribute('uv', new THREE.BufferAttribute(faceUvs, 2));
    this.paint = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, opacity: 0 }));
    this.paint.renderOrder = 1; this.paint.frustumCulled = false; this.paint.visible = false; this.anchor.add(this.paint);
  }
  update(d) {
    const t = d.transform; if (!t) return;
    // Steady but not laggy: adaptive smoothing (One Euro style). Still: a light filter takes out jitter; moving:
    // the cut-off rises with speed so the hat stays on the head (the pose already arrives ~2 frames late).
    const now = performance.now(), dt = clamp((now - (this.at || now)) / 1000, 1 / 120, 0.1);
    const P = this.P.set(t.position.x, t.position.y, t.position.z), Q = this.Q.set(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w);
    if (testYaw) Q.multiply(yawQ);
    const a = this.anchor;
    if (!this.live || SMOOTH === 0) { a.position.copy(P); a.quaternion.copy(Q); a.scale.setScalar(t.scale); }
    else {
      const k = (fc) => 1 - Math.exp(-2 * Math.PI * fc * dt);
      const v = a.position.distanceTo(P) / dt / Math.max(t.scale, 0.05);   // face widths per second
      const w = a.quaternion.angleTo(Q) / dt;                              // radians per second
      a.position.lerp(P, k(SMOOTH + 6 * v)); a.quaternion.slerp(Q, k(SMOOTH + 5 * w));
      a.scale.setScalar(a.scale.x + (t.scale - a.scale.x) * k(SMOOTH + 6 * v));
    }
    this.s = t.scale;
    this.forehead.lerp(ap(d, 'forehead'), 0.4);
    if (d.vertices) { this.v = d.vertices; this.measureHead(d.vertices); }
    brows.check(this, d, now);
    if (d.vertices && this.occ) {
      const a = this.occ.geometry.attributes.position, b = this.paint.geometry.attributes.position, n = Math.min(a.count, d.vertices.length);
      for (let i = 0; i < n; i++) { const v = d.vertices[i]; a.setXYZ(i, v.x, v.y, v.z + 0.012); b.setXYZ(i, v.x, v.y, v.z); }
      a.needsUpdate = true; b.needsUpdate = true;
      if (!paintUV && faceUvs) { paintUV = measurePaintUV(d); for (const r of rigs.values()) r.apply(false); }
    }
    if (!this.tracked) { this.tracked = true; diag.found++; if (!diag.firstFoundS) diag.firstFoundS = +((performance.now() - camStartAt) / 1000).toFixed(1); arrived(this); }
    this.at = performance.now();
  }
  // Size and place the hat from THIS face: its width cheek to cheek (vertices 234-454) against the reference face,
  // and where the forehead skin is at the hat band's height (midline vertices 10, 151, 9). Both smoothed.
  measureHead(v) {
    const L = v[234], R = v[454], top = v[10], mid = v[151], low = v[9]; if (!L || !R || !top || !mid || !low) return;
    const fw = Math.hypot(L.x - R.x, L.y - R.y, L.z - R.z);
    const r = clamp(fw / H.HEAD.faceW, 0.9, 1.12);
    const y = this.forehead.y + 0.12, A = y > mid.y ? mid : low, B = y > mid.y ? top : mid;
    const z = A.z + (B.z - A.z) * (y - A.y) / ((B.y - A.y) || 1);
    const first = !this.measured; this.measured = true;
    this.r += (r - this.r) * (first ? 1 : 0.05); this.frontZ += (z - this.frontZ) * (first ? 1 : 0.2);
  }
  get live() { return this.tracked && performance.now() - this.at < 400; }
  apply(anim) {
    const slot = this.slot;
    if (slot.userData.id !== wear.hat) {
      slot.userData.id = wear.hat;
      for (const old of slot.children.filter((c) => !c.userData.leaving)) {
        old.userData.leaving = true;
        if (anim) animate(old, -1, () => slot.remove(old)); else slot.remove(old);
      }
      if (wear.hat !== 'none' && !H.isLoaded(wear.hat)) {   // still streaming in: wear it as soon as it lands
        slot.userData.id = null; const want = wear.hat;
        H.loadHat(want).then(() => { if (wear.hat === want) applyWear(true); }).catch(() => toast('That hat didn\'t load. Check your connection.'));
      } else {
        const hat = wear.hat !== 'none' ? H.buildHat(wear.hat) : null;
        if (hat) { slot.add(hat); if (anim) animate(hat, 1); else H.animFrame(hat, 1, 1, REDUCED); }
      }
    }
    if (this.paint && paintUV && this.paintId !== wear.paint) {
      this.paintId = wear.paint; const tex = paintTexture(wear.paint);
      if (tex) { this.paint.material.map = tex; this.paint.material.needsUpdate = true; this.paint.visible = true; }
      this.paintFade = { to: tex ? 1 : 0 };
      if (!anim) { this.paint.material.opacity = tex ? 1 : 0; this.paint.visible = !!tex; }
    }
  }
  tick(dt) {
    this.anchor.visible = this.live;
    // the band's front sits on this face's forehead (a few mm of fabric off the skin); sized to this face
    this.slot.position.set(0, this.forehead.y, this.frontZ - 0.035); this.slot.scale.setScalar(this.r);
    H.fitHeadOccluder(this.skull, this.r, this.frontZ);
    if (this.paintFade && this.paint) {
      const m = this.paint.material, f = this.paintFade; m.opacity += Math.sign(f.to - m.opacity) * Math.min(Math.abs(f.to - m.opacity), dt / (REDUCED ? 0.15 : 0.45));
      if (m.opacity === f.to) { this.paint.visible = f.to > 0; this.paintFade = null; }
    }
  }
  worldOf(v) { this.anchor.updateMatrixWorld(true); return this.anchor.localToWorld(v.clone()); }
}
function rigFor(id) { let r = rigs.get(id); if (!r && scene) { if (rigs.size >= MAX_FACES) return null; r = new Rig(id); rigs.set(id, r); } return r; }
function onFace(d) { const r = rigFor(d.id); if (r) r.update(d); }
function onFaceLost(d) { const r = rigs.get(d && d.id); if (r && r.tracked) { r.tracked = false; diag.lost++; } }
function applyWear(anim) { if (!scene) return; for (const r of rigs.values()) r.apply(anim); }

const anims = [];
function animate(o, dir, onDone) {
  for (let i = anims.length - 1; i >= 0; i--) if (anims[i].o === o) anims.splice(i, 1);
  anims.push({ o, dir, t: 0, dur: REDUCED ? 0.2 : (dir > 0 ? H.DUR.in : H.DUR.out), onDone });
  H.animFrame(o, dir, 0, REDUCED);
}
function tickAnims(dt) {
  for (let i = anims.length - 1; i >= 0; i--) {
    const A = anims[i]; A.t = Math.min(1, A.t + dt / A.dur); H.animFrame(A.o, A.dir, A.t, REDUCED);
    if (A.t >= 1) { anims.splice(i, 1); if (A.onDone) A.onDone(); }
  }
}

// ---------------------------------------------------------------- face paint (on the live face mesh, standard UVs)
// Feature positions in UV space are measured once from the first tracked frame (as in the Bobo Booth).
function measurePaintUV(d) {
  const want = ['noseTip', 'leftCheek', 'rightCheek', 'leftEye', 'rightEye', 'forehead'];
  const out = {}, nUv = faceUvs.length / 2;
  for (const n of want) {
    const p = d.attachmentPoints && d.attachmentPoints[n] && d.attachmentPoints[n].position; if (!p) continue;
    let best = -1, bd = 1e9;
    d.vertices.forEach((v, i) => { if (i >= nUv || (faceUvs[i * 2] >= 0.999 && faceUvs[i * 2 + 1] <= 0.001)) return; const dd = (v.x - p.x) ** 2 + (v.y - p.y) ** 2 + (v.z - p.z) ** 2; if (dd < bd) { bd = dd; best = i; } });
    if (best >= 0) out[n] = [faceUvs[best * 2], faceUvs[best * 2 + 1]];
  }
  for (const [L, R] of [['leftEye', 'rightEye'], ['leftCheek', 'rightCheek']]) {
    const l = out[L], r = out[R]; if (!l || !r) continue;
    const du = (Math.abs(l[0] - 0.5) + Math.abs(r[0] - 0.5)) / 2, v = (l[1] + r[1]) / 2;
    out[L] = [0.5 + Math.sign(l[0] - 0.5) * du, v]; out[R] = [0.5 + Math.sign(r[0] - 0.5) * du, v];
  }
  diag.paintUV = Object.keys(out).length;
  return out;
}
const BLUE = '#006bb6', RED = '#ed174c', NAVY = '#002b5c', WHITE = '#ffffff';
function star(g, x, y, R, col) {
  g.fillStyle = col; g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? R * 0.42 : R; i ? g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  g.closePath(); g.fill();
}
const paintCache = {};
function paintTexture(id) {
  if (!id || id === 'none' || !paintUV || !paintUV.noseTip) return null;
  if (paintCache[id]) return paintCache[id];
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const P = (n) => { const t = paintUV[n]; return t ? [t[0] * S, (1 - t[1]) * S] : null; };
  const cl = P('leftCheek'), cr = P('rightCheek'), el = P('leftEye'), er = P('rightEye');
  let eyeD = el && er ? Math.hypot(el[0] - er[0], el[1] - er[1]) : 0;
  if (!(eyeD > S * 0.08)) eyeD = cl && cr ? Math.hypot(cl[0] - cr[0], cl[1] - cr[1]) * 0.6 : S * 0.25;
  if (id === 'gameday') {
    // two stripes under each eye: blue over red, with a thin white keyline (flat colours)
    for (const e of [el, er]) if (e) {
      const w = eyeD * 0.36, x = e[0] - w / 2, y = e[1] + eyeD * 0.17;
      g.fillStyle = WHITE; g.fillRect(x - eyeD * 0.012, y - eyeD * 0.012, w + eyeD * 0.024, eyeD * 0.15);
      g.fillStyle = BLUE; g.fillRect(x, y, w, eyeD * 0.06); g.fillStyle = RED; g.fillRect(x, y + eyeD * 0.066, w, eyeD * 0.06);
    }
  } else if (id === 'stars') {
    // the ring of 13 stars on one cheek, a small "76" in the middle
    const ch = cr || cl; if (ch) {
      const R = eyeD * 0.2;
      g.fillStyle = NAVY; g.beginPath(); g.arc(ch[0], ch[1], R * 1.35, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 13; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / 13; star(g, ch[0] + Math.cos(a) * R, ch[1] + Math.sin(a) * R, R * 0.17, WHITE); }
      g.fillStyle = RED; g.font = `900 italic ${Math.round(R * 0.8)}px "Exo 2", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('76', ch[0], ch[1] + R * 0.05);
    }
    const other = cr ? cl : null; if (other) { g.fillStyle = BLUE; g.fillRect(other[0] - eyeD * 0.12, other[1] - eyeD * 0.03, eyeD * 0.24, eyeD * 0.05); g.fillStyle = RED; g.fillRect(other[0] - eyeD * 0.12, other[1] + eyeD * 0.03, eyeD * 0.24, eyeD * 0.05); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  paintCache[id] = t; return t;
}
function paintThumb(id) {
  const c = document.createElement('canvas'); c.width = c.height = 160; const g = c.getContext('2d');
  g.fillStyle = '#1c2f4f'; g.beginPath(); g.ellipse(80, 84, 52, 66, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#0b1a33'; g.beginPath(); g.ellipse(60, 70, 7, 9, 0, 0, Math.PI * 2); g.ellipse(100, 70, 7, 9, 0, 0, Math.PI * 2); g.fill();
  if (id === 'gameday') { for (const x of [48, 88]) { g.fillStyle = BLUE; g.fillRect(x, 84, 24, 5); g.fillStyle = RED; g.fillRect(x, 90, 24, 5); } }
  else if (id === 'stars') { g.fillStyle = NAVY; g.beginPath(); g.arc(106, 104, 15, 0, 7); g.fill(); for (let i = 0; i < 13; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / 13; star(g, 106 + Math.cos(a) * 10, 104 + Math.sin(a) * 10, 2.2, WHITE); } }
  return c.toDataURL('image/png');
}

// ---------------------------------------------------------------- eyebrow raise: next hat
// Only a deliberate raise counts (Dapo: Bobo Booth's tricks fired on ordinary head moves): BOTH brows up and held for
// 400 ms, then it re-arms only after the brows come back down, with a 2.5 s rest between changes. Not during a strip
// countdown or with a sheet open. Can be switched off in Options.
const brows = {
  on: store.get('brows', '1') === '1', at: 0,
  check(rig, d, now) {
    if (!this.on || !d || d.leftEyebrowRaised === undefined) return;
    const up = !!(d.leftEyebrowRaised && d.rightEyebrowRaised), T = rig.brow || (rig.brow = { since: 0, armed: true });
    if (!up) { if (!T.down) T.down = now; if (now - T.down >= 250) T.armed = true; T.since = 0; return; }
    T.down = 0; if (!T.since) T.since = now;
    const open = !$('shot').hidden || !$('shop').hidden || !optsEl.hidden || !$('how').hidden;
    if (T.armed && now - T.since >= 400 && now - this.at > 2500 && !strip && !open) { T.armed = false; this.at = now; nextHat(); }
  },
};
function nextHat() {
  const hats = ITEMS.hat.filter((h) => h.id !== 'none');
  let i = hats.findIndex((h) => h.id === wear.hat);
  for (let k = 1; k <= hats.length; k++) { const h = hats[(i + k) % hats.length]; if (H.isLoaded(h.id)) { i = (i + k) % hats.length; break; } }
  const h = hats[i]; if (!h || h.id === wear.hat) return;
  wear.hat = h.id; store.set('wear', JSON.stringify(wear)); applyWear(true); shopState();
  if (cat === 'hat') { const at = ITEMS.hat.indexOf(h); carouselLock = true; centred = at; scrollToLens(at, true); paintCentre(at); setTimeout(() => { carouselLock = false; }, 600); }
  toast(`Eyebrows up: ${h.name}`); buzz([10, 40, 10]); diag.brows = (diag.brows || 0) + 1;
}
// the tips card: every time the booth opens (a demo phone gets handed round), gone after 8 s or on Got it
function showCoach() {
  const c = $('coach'); c.querySelector('li').hidden = !brows.on;
  setTimeout(() => { c.hidden = false; clearTimeout(c._t); c._t = setTimeout(() => { c.hidden = true; }, 8000); }, 1200);
}
$('b-coach').onclick = () => { $('coach').hidden = true; };

// ---------------------------------------------------------------- per frame
function tick(dt) {
  diag.fpsN++;
  let n = 0; for (const r of rigs.values()) if (r.live) n++;
  diag.maxFaces = Math.max(diag.maxFaces || 0, n);
  setMode(n ? 'wear' : 'find');
  hint(n ? '' : (camStartAt && performance.now() - camStartAt > 1200 ? 'Look straight at the camera' : ''));
  tickAnims(dt);
  for (const r of rigs.values()) r.tick(dt);
  recTick(); stripTick();
}
let mode = 'find';
function setMode(m) { if (mode !== m) { mode = m; $('hud').dataset.mode = m; } }
let arrivedOnce = false;
function arrived() { if (arrivedOnce && rigs.size > 1) toast('Friend joined the try-on'); arrivedOnce = true; buzz(8); }
function hint(text) { if ($('hint').textContent !== text) $('hint').textContent = text || ''; }
let toastT = 0;
function toast(text) { const el = $('toast'); el.textContent = text; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 1800); }

// ---------------------------------------------------------------- UI
const optsEl = $('opts');
function openOpts() { optsEl.hidden = false; $('b-opts').setAttribute('aria-expanded', 'true'); optsEl.querySelector('.x').focus(); }
function closeOpts() { optsEl.hidden = true; $('b-opts').setAttribute('aria-expanded', 'false'); $('b-opts').focus(); }
$('b-opts').onclick = openOpts;
optsEl.querySelectorAll('[data-close]').forEach((el) => { el.onclick = closeOpts; });
addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; if (!optsEl.hidden) closeOpts(); if (!$('shop').hidden) $('shop').hidden = true; });
const soundBtn = $('o-sound'); soundBtn.setAttribute('aria-checked', String(sound.on));
soundBtn.onclick = () => { sound.on = !sound.on; store.set('sound', sound.on ? '1' : '0'); soundBtn.setAttribute('aria-checked', String(sound.on)); };
let stripMode = store.get('strip', '0') === '1';
function setStrip(on) { stripMode = on; store.set('strip', on ? '1' : '0'); $('b-strip').setAttribute('aria-pressed', String(on)); $('b-shutter').classList.toggle('strip', on); $('shoot-hint').textContent = on ? 'Tap: 4-shot strip · Hold: video' : 'Tap: photo · Hold: video'; }
$('b-strip').onclick = () => { setStrip(!stripMode); buzz(8); };
setStrip(stripMode);
const browsBtn = $('o-brows'); browsBtn.setAttribute('aria-checked', String(brows.on));
browsBtn.onclick = () => { brows.on = !brows.on; store.set('brows', brows.on ? '1' : '0'); browsBtn.setAttribute('aria-checked', String(brows.on)); if (!brows.on) $('coach').hidden = true; };
$('o-how').onclick = () => { closeOpts(); $('how').hidden = false; $('b-go').focus(); };
$('b-go').onclick = () => { $('how').hidden = true; store.set('how', '1'); };
$('err-retry').onclick = () => location.reload();
function showError(title, body) { $('err-title').textContent = title; $('err-body').textContent = body; $('error').hidden = false; }
// Shop: the hat you are wearing. In the pitch every hat goes to the 76ers headwear page Dapo shared.
function openShop() {
  const h = H.HATS.find((x) => x.id === wear.hat); if (!h) return;
  $('shop-t').textContent = h.name; $('shop-sub').textContent = h.sub; $('shop-img').src = `./img/${h.img}.webp`; $('shop-img').alt = h.name;
  $('shop-go').href = SHOP_URL; $('shop').hidden = false; $('shop-close').focus(); diag.shop = (diag.shop || 0) + 1;
}
$('b-shop').onclick = openShop;
$('shop-close').onclick = () => { $('shop').hidden = true; };
$('shop-go').onclick = () => { diag.shopOut = (diag.shopOut || 0) + 1; flushDiag(true); };
$('shot-shop').onclick = () => { $('shot').hidden = true; openShop(); };
shopState();

// ---------------------------------------------------------------- 8th Wall pipeline (front camera, face effects)
const canvas = $('cam');
const DPR = clamp(+params.get('dpr') || 1, 1, 3);
function sizeCanvas() { const dpr = Math.min(devicePixelRatio || 1, DPR), w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr); if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; } }
let last = 0, camStartAt = 0, built = false;
const appModule = () => ({
  name: PAGE,
  onStart: () => { buildScene(XR8.Threejs.xrScene()); built = true; $('hud').hidden = false; setMode('find'); },
  onUpdate: () => { const now = performance.now(); const dt = Math.min((now - (last || now)) / 1000, 0.05); last = now; if (built) tick(dt); flushDiag(false); },
  onCameraStatusChange: ({ status, video, stream }) => {
    camLog(status);
    if (status === 'hasStream') { kickVideo(); noteStream(stream); }
    if (status === 'hasVideo') {
      hideTapCam(); camStartAt = performance.now(); noteVideo(video);
      $('splash').classList.add('gone'); setTimeout(() => { $('splash').hidden = true; }, 600);
      showCoach();
    }
    if (status === 'requesting') hint('Allow camera access to begin');
    if (status === 'failed') camFailed('failed');
  },
  onException: (e) => { console.error('XR', e); diag.errors.push('XR: ' + String((e && e.message) || e).slice(0, 200)); flushDiag(true, true); showError('Something went wrong', String((e && e.message) || e)); },
  listeners: [
    { event: 'facecontroller.faceloading', process: ({ detail }) => onFaceLoading(detail) },
    { event: 'facecontroller.facefound', process: ({ detail }) => onFace(detail) },
    { event: 'facecontroller.faceupdated', process: ({ detail }) => onFace(detail) },
    { event: 'facecontroller.facelost', process: ({ detail }) => onFaceLost(detail) },
  ],
});
async function start() {
  if (!loaded) return;
  $('b-start').disabled = true; $('b-start').textContent = 'Starting…';
  sound.init(); capture && capture.configure({ audioContext: sound.ctx });
  hero.stop();
  sizeCanvas(); addEventListener('resize', sizeCanvas); addEventListener('orientationchange', () => setTimeout(sizeCanvas, 300));
  XR8.FaceController.configure({
    meshGeometry: [XR8.FaceController.MeshGeometry.FACE],
    coordinates: { mirroredDisplay: true },
    maxDetections: MAX_FACES,
  });
  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(), XR8.Threejs.pipelineModule(), XR8.FaceController.pipelineModule(), XR8.CanvasScreenshot.pipelineModule(),
    appModule(),
    { name: 'booth-capture', onRender: () => { if (capture) capture.frame(); } },
  ]);
  camLog('run');
  setTimeout(() => { if (!camStartAt && !tapCamShown) camFailed('no video after 12 s'); }, 12000);
  XR8.run({ canvas, allowedDevices: XR8.XrConfig.device().ANY, cameraConfig: { direction: XR8.XrConfig.camera().FRONT } });
}
$('b-start').onclick = start;

function engineVideo() { return [...document.querySelectorAll('video')].find((v) => v.srcObject) || null; }
function noteVideo(video) { try { const tr = video && video.srcObject && video.srcObject.getVideoTracks()[0]; const st = tr && tr.getSettings ? tr.getSettings() : {}; diag.camera = { label: tr && tr.label, width: st.width || video.videoWidth, height: st.height || video.videoHeight, frameRate: st.frameRate }; } catch (e) { /* none */ } }
let tapCamShown = false;
function kickVideo() { setTimeout(() => { if (camStartAt) return; camLog('notPlaying'); showTapCam(); }, 4000); }
function noteStream(stream) { try { const t = stream && stream.getVideoTracks()[0]; diag.stream = t ? { label: t.label, state: t.readyState } : null; } catch (e) { /* none */ } }
function showTapCam() {
  if (camStartAt || tapCamShown) return; tapCamShown = true;
  const card = document.createElement('div'); card.id = 'tap-cam'; card.setAttribute('role', 'alert');
  card.innerHTML = '<h2>Waiting for the camera</h2><p>Another app or tab may be using it. Close the Camera app, any video call and other tabs that use the camera, then tap Try again.</p><div class="row"><button type="button" class="primary" data-a="reload">Try again</button><button type="button" data-a="play">Start camera here</button></div>';
  card.querySelector('[data-a=reload]').onclick = () => location.reload();
  card.querySelector('[data-a=play]').onclick = () => { const v = engineVideo(); if (v) { v.muted = true; v.play().catch(() => {}); } setTimeout(() => { if (!camStartAt) camFailed('no video after tap'); }, 8000); };
  document.body.appendChild(card); card.querySelector('button').focus();
}
function hideTapCam() { const el = $('tap-cam'); if (el) el.remove(); }
function camFailed(why) {
  if (camStartAt || diag.camFailed) return; diag.camFailed = why; flushDiag(true, true); hideTapCam();
  showError('The camera didn\'t start', 'Another app or tab may be using it. Close the Camera app and other tabs that use the camera, then tap Try again. If it still won\'t start, allow camera access for this site in your browser settings.');
}

// ---------------------------------------------------------------- photo, strip and video (the shared recorder)
const LOGO = { act: new Image() };
LOGO.act.src = '/activated-merch/media/ar/activated-by.webp';
function drawWatermark(c, Wd, Hd) {
  const u = Math.min(Wd, Hd) / 720, pad = 26 * u;
  c.save(); c.font = `900 italic ${Math.round(30 * u)}px "Exo 2", sans-serif`; c.textBaseline = 'top'; c.fillStyle = '#ffffff';
  c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 8 * u; c.fillText('FANATICS MERCH TRY-ON', pad, pad); c.restore();
  if (LOGO.act.complete && LOGO.act.naturalWidth) { const h = 50 * u, w = h * LOGO.act.naturalWidth / LOGO.act.naturalHeight; c.drawImage(LOGO.act, Wd - pad - w, Hd - pad - h, w, h); }
}
let capture = null, recFrom = 0, shots = 0;
try {
  capture = new ColaCapture({
    canvas, host: document.body, endpoint: location.origin, globeUrl: '/', source: PAGE, audioContext: null,
    connectAudio: (dest) => { const m = sound.master; if (!m) return () => {}; m.connect(dest); return () => { try { m.disconnect(dest); } catch (e) { /* gone */ } }; },
    overlay: (c, Wd, Hd) => drawWatermark(c, Wd, Hd),
    on: (name) => { if (name === 'recordStart') { buzz(25); recUi(true); } if (name === 'recordStop' || name === 'error') recUi(false); },
  });
  Object.assign(capture.settings, {
    corner: 'topRight', offsetX: -5, offsetY: -6, accent: '#ed174c', maxSeconds: 30, sendEnabled: false,
    brandTitle: 'FANATICS MERCH TRY-ON', brandTagline: 'Philadelphia 76ers', hintText: 'Film your game-day look',
    keepTitle: 'Keep your clip?', clipTitle: 'Fanatics Merch Try-On clip', filePrefix: 'fanatics-try-on', backLabel: 'Back to the try-on',
  });
  capture.apply(); capture.setVisible(false);
} catch (e) { console.warn('recorder', e); capture = null; }
function recUi(on) {
  $('b-shutter').classList.toggle('rec', on); $('rec-time').hidden = !on;
  $('b-shutter').setAttribute('aria-label', on ? 'Stop recording' : 'Take a photo. Press and hold to film');
  recFrom = on ? performance.now() : 0; if (!on) $('rec-prog').style.strokeDashoffset = '207';
}
function recTick() {
  if (!recFrom) return;
  const sec = (performance.now() - recFrom) / 1000, max = (capture && capture.settings.maxSeconds) || 30;
  $('rec-prog').style.strokeDashoffset = String(207 * (1 - Math.min(sec / max, 1)));
  const t = `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`; if ($('rec-time').textContent !== t) $('rec-time').textContent = t;
}
function flash() { const fl = $('flashw'); fl.classList.add('on'); setTimeout(() => fl.classList.remove('on'), 60); }
async function grab() {
  const b64 = await XR8.CanvasScreenshot.takeScreenshot();
  const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode(); return img;
}
async function showResult(c, name, title, what) {
  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92));
  const file = new File([blob], name, { type: 'image/jpeg' }), url = URL.createObjectURL(blob);
  $('shot-t').textContent = title; $('shot-img').src = url; $('shot').classList.toggle('strip', what === 'strip');
  $('shot-save').href = url; $('shot-save').download = file.name; $('shot-save').hidden = false;
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
  $('shot-share').hidden = !canShare; $('shot-share').onclick = () => navigator.share({ files: [file], title: 'Fanatics Merch Try-On' }).catch(() => {});
  $('shot-shop').hidden = wear.hat === 'none';
  $('shot').hidden = false; $('shot-close').focus(); diag.shots = (diag.shots || 0) + 1;
}
let busy = false;
async function takePhoto() {
  if (busy) return; busy = true;
  try {
    sound.shutter(); buzz(20); flash();
    const img = await grab(), c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0); drawWatermark(g, c.width, c.height);
    await showResult(c, `fanatics-try-on-${++shots}.jpg`, 'Your game-day look', 'photo');
  } catch (e) { console.error(e); diag.errors.push('photo: ' + String(e).slice(0, 120)); }
  busy = false;
}
const STRIP_N = 4;
let strip = null;
function stripTick() {
  if (!strip) return;
  const left = strip.next - performance.now(), n = Math.ceil(left / 1000);
  const label = left > 0 ? String(n) : '';
  if ($('count').textContent !== label) { $('count').textContent = label; if (label) { sound.count(); buzz(6); } }
  $('strip-dots').innerHTML = Array.from({ length: STRIP_N }, (_, i) => `<i class="${i < strip.frames.length ? 'on' : ''}"></i>`).join('');
  if (left <= 0 && !strip.taking) {
    strip.taking = true; sound.shutter(); buzz(18); flash();
    grab().then((img) => {
      strip.frames.push(img); strip.taking = false;
      if (strip.frames.length >= STRIP_N) finishStrip(); else strip.next = performance.now() + 1600;
    }).catch((e) => { console.error(e); endStrip(); });
  }
}
function startStrip() { if (busy || strip) return; busy = true; strip = { frames: [], next: performance.now() + 3000, taking: false }; $('countdown').hidden = false; $('hud').classList.add('counting'); }
function endStrip() { strip = null; busy = false; $('countdown').hidden = true; $('count').textContent = ''; $('hud').classList.remove('counting'); }
async function finishStrip() {
  const frames = strip.frames; endStrip(); busy = true;
  try {
    const Wd = 720, M = 28, FW = Wd - M * 2, FH = FW, GAP = 18, FOOT = 230;
    const c = document.createElement('canvas'); c.width = Wd; c.height = M + STRIP_N * FH + (STRIP_N - 1) * GAP + FOOT;
    const g = c.getContext('2d');
    g.fillStyle = '#0b1a33'; g.fillRect(0, 0, c.width, c.height);
    frames.forEach((img, i) => {
      const iw = img.naturalWidth, ih = img.naturalHeight;
      let sw = iw, sh = iw; if (sh > ih) { sh = ih; sw = ih; }
      const sx = (iw - sw) / 2, sy = Math.max(0, (ih - sh) * 0.4), y = M + i * (FH + GAP);
      g.fillStyle = i % 2 ? '#006bb6' : '#ed174c'; g.fillRect(M - 4, y - 4, FW + 8, FH + 8);
      g.drawImage(img, sx, sy, sw, sh, M, y, FW, FH);
    });
    const fy = M + STRIP_N * FH + (STRIP_N - 1) * GAP;
    g.fillStyle = '#ffffff'; g.font = '900 italic 44px "Exo 2", sans-serif'; g.textBaseline = 'top'; g.fillText('FANATICS MERCH TRY-ON', M, fy + 50);
    g.fillStyle = '#ed174c'; g.font = '700 26px "Space Grotesk", sans-serif'; g.fillText('PHILADELPHIA 76ERS · GAME DAY', M, fy + 122);
    g.fillStyle = '#b8c2cc'; g.font = '700 22px "Space Grotesk", sans-serif';
    g.fillText(new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }), M, fy + 166);
    if (LOGO.act.naturalWidth) { const h = 70, w = h * LOGO.act.naturalWidth / LOGO.act.naturalHeight; g.drawImage(LOGO.act, Wd - M - w, fy + 130, w, h); }
    busy = false;
    await showResult(c, `fanatics-try-on-strip-${++shots}.jpg`, 'Your game-day strip', 'strip');
  } catch (e) { console.error(e); diag.errors.push('strip: ' + String(e).slice(0, 120)); }
  busy = false;
}
$('b-cancel').onclick = () => { endStrip(); };
const HOLD_MS = 320; let holding = false, holdT = 0;
const sh = $('b-shutter');
sh.addEventListener('contextmenu', (e) => e.preventDefault());
sh.addEventListener('pointerdown', (e) => {
  if (e.button > 0 || strip) return;
  if (capture && capture.status === 'recording') { holding = false; return; }
  holding = true; try { sh.setPointerCapture(e.pointerId); } catch (err) { /* old Safari */ }
  clearTimeout(holdT); holdT = setTimeout(() => { if (holding && capture) capture.start(); }, HOLD_MS);
});
sh.addEventListener('pointerup', () => {
  if (capture && capture.status === 'recording') { holding = false; clearTimeout(holdT); capture.stop(); return; }
  if (!holding) return; holding = false; clearTimeout(holdT); stripMode ? startStrip() : takePhoto();
});
sh.addEventListener('pointercancel', () => { holding = false; clearTimeout(holdT); if (capture && capture.status === 'recording') capture.stop(); });
sh.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stripMode ? startStrip() : takePhoto(); } });
$('shot-close').onclick = () => { $('shot').hidden = true; };

// ---------------------------------------------------------------- test log (previews and local dev only, or ?diag)
const SID = 'fb-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
const diag = { page: PAGE, sid: SID, found: 0, lost: 0, fpsN: 0, errors: [], steps: [] };
function camLog(s) { diag.steps.push([s, Math.round(performance.now())]); if (diag.steps.length > 40) diag.steps.shift(); }
let flushAt = 0;
function flushDiag(force, always = false) {
  const now = performance.now(); if (!force && now - flushAt < 10000) return; flushAt = now;
  if ((!camStartAt && !always) || params.has('nolog') || (LIVE_SITE && !params.has('diag'))) return;
  const body = JSON.stringify({ ...diag, secs: Math.round((now - (camStartAt || now)) / 1000), fps: camStartAt ? +(diag.fpsN / Math.max((now - camStartAt) / 1000, 1)).toFixed(1) : 0, wear, strip: stripMode, screen: [innerWidth, innerHeight, devicePixelRatio], note: params.get('note') || undefined });
  try { if (!(navigator.sendBeacon && navigator.sendBeacon('/api/ar/kc-diag', new Blob([body], { type: 'application/json' })))) fetch('/api/ar/kc-diag', { method: 'POST', body, keepalive: true }); } catch (e) { /* offline */ }
}
addEventListener('pagehide', () => flushDiag(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) flushDiag(true); });
addEventListener('error', (e) => { diag.errors.push(String(e.message).slice(0, 200)); });

if (params.has('test')) window.__fb = {
  get rig() { return [...rigs.values()][0] || null; },
  get face() { const r = this.rig; return r ? { tracked: r.tracked, live: r.live, s: r.s, faces: rigs.size } : { tracked: false }; },
  get mode() { return mode; }, get wear() { return { ...wear }; }, diag, paintUV: () => paintUV,
  setYaw(a) { testYaw = a; yawQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a); },
  setWear(o) { Object.assign(wear, o); applyWear(false); renderTray(); shopState(); },
  screen() {
    const r = this.rig; if (!r || !r.anchor.visible) return null;
    const pr = (v) => { const p = v.clone().project(camera); return [Math.round((p.x + 1) / 2 * innerWidth), Math.round((1 - p.y) / 2 * innerHeight)]; };
    return { forehead: pr(r.worldOf(r.forehead)), chin: pr(r.worldOf(new THREE.Vector3(0, -0.95, -0.45))) };
  },
  measure() { const r = this.rig; if (!r || !r.v) return null; const o = {}; for (const i of [10, 151, 9, 8, 168, 6, 234, 454, 127, 356, 162, 389, 21, 251, 103, 332, 152]) { const v = r.v[i]; o[i] = [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)]; } let zx = -9, zn = 9, yx = -9; for (const v of r.v) { zx = Math.max(zx, v.z); zn = Math.min(zn, v.z); yx = Math.max(yx, v.y); } o.range = { zmin: zn, zmax: zx, ymax: yx }; o.fh = r.forehead.toArray(); o.s = r.s; return o; },
  brows: () => nextHat(),
  photo: () => takePhoto(), strip: () => startStrip(), shop: () => openShop(),
};

if (!TOUCH) {
  $('desk').hidden = false;
  try { window.QRCode && QRCode.toString(location.href, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }, (err, svg) => { if (!err) $('qr').innerHTML = svg; }); } catch (e) { /* no QR */ }
}
