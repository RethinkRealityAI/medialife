// Fanatics Booth: a pitch demo for Fanatics. Try 76ers headwear on your own head with the open-source 8th Wall
// engine's FACE tracking (MIT, self-hosted in /evade/keychain-ar/vendor/xr with the face chunk + models), add
// game-day face paint, shoot a photo / video / 4-shot strip, and Shop the hat you are wearing.
//
// Built from the Bobo Booth (/evade/bobo-booth/), trimmed for a retail try-on:
// - six hats on four Meshy models (hats.js); face paint on the live face mesh; up to 2 faces.
// - no face-gesture tricks and no beeps (Dapo 2026-11-17: Bobo Booth's fizz + beep fired on ordinary head moves).
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
  loaded = true; $('load').hidden = true; $('b-start').disabled = false; $('b-start').textContent = 'Open the booth';
  hero.init(); buildTray(); hero.start();
}).catch((e) => { console.error(e); showError('Could not load the booth', 'Check your connection and reload the page.'); });

// ---------------------------------------------------------------- splash hero + item thumbnails (one small renderer)
// A display head that changes hats every few seconds; stills for the carousel. The canvas is HIDDEN first, then the
// renderer is freed when the camera starts (freeing it while visible left a white box on some phones).
const hero = {
  r: null, scene: null, cam: null, rig: null, raf: 0, hat: null, hatI: 0,
  init() {
    if (this.r) return true;
    try { this.r = new THREE.WebGLRenderer({ canvas: $('hero3d'), antialias: true, alpha: true, preserveDrawingBuffer: true }); } catch (e) { return false; }
    this.r.outputColorSpace = THREE.SRGBColorSpace; this.r.toneMapping = THREE.NeutralToneMapping; this.r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.r.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(this.r); this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(-1, 2, -3); this.scene.add(dl);
    this.cam = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
    return true;
  },
  bust() {
    const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: '#1c2f4f', roughness: 0.75 });
    const h = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 30), m); h.scale.set(0.57, 0.84, 0.66); h.position.set(0, 0.0, 0.05); g.add(h);
    const n = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.42, 0.9, 30), m); n.position.set(0, -0.95, 0.12); g.add(n);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 16), m); nose.rotation.x = -Math.PI / 2 - 0.3; nose.position.set(0, -0.2, -0.66); g.add(nose);
    return g;
  },
  frame(w, h) { this.cam.aspect = w / h; this.cam.position.set(0, 0.55, -4.9); this.cam.lookAt(0, 0.22, 0); this.cam.updateProjectionMatrix(); },
  resize() { const c = $('hero3d'), w = c.clientWidth || 300, h = c.clientHeight || 300; this.r.setSize(w, h, false); this.frame(w, h); },
  swap() {
    const ready = H.HATS.filter((h) => H.isLoaded(h.id));   // they stream in after the first
    if (!ready.length || (this.hat && ready.length === 1)) return;
    const id = ready[this.hatI++ % ready.length].id;
    if (this.hat && this.hat.userData.id === id) return;
    const old = this.hat; if (old) { this.anim.push({ o: old, dir: -1, t: 0 }); }
    this.hat = H.buildHat(id); this.rig.add(this.hat); this.anim.push({ o: this.hat, dir: 1, t: 0 }); H.animFrame(this.hat, 1, 0, REDUCED);
  },
  start() {
    if (!this.init()) return;
    this.rig = new THREE.Group(); this.scene.add(this.rig); this.rig.add(this.bust()); this.anim = [];
    this.swap(); this.resize(); this.onResize = () => this.r && this.resize(); addEventListener('resize', this.onResize);
    let t = 0, next = 2.6; const clock = new THREE.Clock();
    const loop = () => {
      if (!this.r) return;
      const dt = Math.min(clock.getDelta(), 0.05); t += dt;
      if (t > next) { next = t + 2.6; this.swap(); }
      for (let i = this.anim.length - 1; i >= 0; i--) {
        const a = this.anim[i]; a.t = Math.min(1, a.t + dt / (a.dir > 0 ? H.DUR.in : H.DUR.out)); H.animFrame(a.o, a.dir, a.t, REDUCED);
        if (a.t >= 1) { this.anim.splice(i, 1); if (a.dir < 0) this.rig.remove(a.o); }
      }
      this.rig.rotation.y = Math.PI * 0.18 + Math.sin(t * 0.5) * (REDUCED ? 0.15 : 0.55);
      this.r.render(this.scene, this.cam); this.raf = requestAnimationFrame(loop);
    };
    loop();
  },
  thumb(item) {
    if (!this.init()) return '';
    const prevRig = this.rig; if (prevRig) prevRig.visible = false;
    const g = new THREE.Group(); g.add(this.bust()); const hat = H.buildHat(item.id); g.add(hat); this.scene.add(g);
    const c = this.r.domElement, keep = [c.clientWidth || 300, c.clientHeight || 300]; this.r.setSize(160, 160, false);
    this.cam.aspect = 1; this.cam.position.set(0, 0.75, -3.0); this.cam.lookAt(0, 0.42, 0); this.cam.updateProjectionMatrix();
    g.rotation.y = 0.55;
    this.r.render(this.scene, this.cam);
    const url = c.toDataURL('image/png');
    this.scene.remove(g);
    this.r.setSize(keep[0], keep[1], false); this.frame(keep[0], keep[1]);
    if (prevRig) prevRig.visible = true;
    return url;
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
function ap(d, n) { const p = d.attachmentPoints && d.attachmentPoints[n]; return p && p.position ? tmpV.set(p.position.x, p.position.y, p.position.z) : tmpV.set(...AP_DEFAULT[n]); }
// ?fit=y,z,tilt,width nudges every hat's fit (simulator / phone tuning without a redeploy)
if (params.get('fit')) { const [y, z, t, w] = params.get('fit').split(',').map(Number); for (const f of Object.values(H.FIT)) { if (isFinite(y)) f.y += y; if (isFinite(z)) f.z += z; if (isFinite(t)) f.tilt += t; if (isFinite(w)) f.width *= w; } }
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
    this.anchor.add(H.buildHeadOccluder());
    this.slot = new THREE.Group(); this.anchor.add(this.slot);
    this.forehead = new THREE.Vector3(...AP_DEFAULT.forehead);
    this.paintId = null;
    this.makeMeshes(); this.apply(false);
  }
  makeMeshes() {
    if (this.occ || !faceIdx) return;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(faceIdx.n * 3), 3)); geo.setIndex(faceIdx.idx);
    this.occ = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ colorWrite: false })); this.occ.renderOrder = -10; this.occ.frustumCulled = false; this.anchor.add(this.occ);
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(faceIdx.n * 3), 3)); pg.setIndex(faceIdx.idx);
    if (faceUvs) pg.setAttribute('uv', new THREE.BufferAttribute(faceUvs, 2));
    this.paint = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, opacity: 0 }));
    this.paint.renderOrder = 1; this.paint.frustumCulled = false; this.paint.visible = false; this.anchor.add(this.paint);
  }
  update(d) {
    const t = d.transform; if (!t) return;
    this.anchor.position.set(t.position.x, t.position.y, t.position.z);
    this.anchor.quaternion.set(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w);
    this.anchor.scale.setScalar(t.scale); this.s = t.scale;
    this.forehead.lerp(ap(d, 'forehead'), 0.4);
    if (d.vertices && this.occ) {
      const a = this.occ.geometry.attributes.position, b = this.paint.geometry.attributes.position, n = Math.min(a.count, d.vertices.length);
      for (let i = 0; i < n; i++) { const v = d.vertices[i]; a.setXYZ(i, v.x, v.y, v.z + 0.012); b.setXYZ(i, v.x, v.y, v.z); }
      a.needsUpdate = true; b.needsUpdate = true;
      if (!paintUV && faceUvs) { paintUV = measurePaintUV(d); for (const r of rigs.values()) r.apply(false); }
    }
    if (!this.tracked) { this.tracked = true; diag.found++; if (!diag.firstFoundS) diag.firstFoundS = +((performance.now() - camStartAt) / 1000).toFixed(1); arrived(this); }
    this.at = performance.now();
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
    // the hat follows the measured forehead (smoothed) so it sits on this face's hairline, not an average one
    this.slot.position.set(0, this.forehead.y - AP_DEFAULT.forehead[1], this.forehead.z - AP_DEFAULT.forehead[2]);
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
function arrived() { if (arrivedOnce && rigs.size > 1) toast('Friend joined the booth'); arrivedOnce = true; buzz(8); }
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
      if (store.get('how', '0') !== '1') { $('how').hidden = false; $('b-go').focus(); }
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
  c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 8 * u; c.fillText('FANATICS BOOTH', pad, pad); c.restore();
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
    brandTitle: 'FANATICS BOOTH', brandTagline: 'Philadelphia 76ers', hintText: 'Film your game-day look',
    keepTitle: 'Keep your clip?', clipTitle: 'Fanatics Booth clip', filePrefix: 'fanatics-booth', backLabel: 'Back to the booth',
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
  $('shot-share').hidden = !canShare; $('shot-share').onclick = () => navigator.share({ files: [file], title: 'Fanatics Booth' }).catch(() => {});
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
    await showResult(c, `fanatics-booth-${++shots}.jpg`, 'Your game-day look', 'photo');
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
    g.fillStyle = '#ffffff'; g.font = '900 italic 58px "Exo 2", sans-serif'; g.textBaseline = 'top'; g.fillText('FANATICS BOOTH', M, fy + 50);
    g.fillStyle = '#ed174c'; g.font = '700 26px "Space Grotesk", sans-serif'; g.fillText('PHILADELPHIA 76ERS · GAME DAY', M, fy + 122);
    g.fillStyle = '#b8c2cc'; g.font = '700 22px "Space Grotesk", sans-serif';
    g.fillText(new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }), M, fy + 166);
    if (LOGO.act.naturalWidth) { const h = 70, w = h * LOGO.act.naturalWidth / LOGO.act.naturalHeight; g.drawImage(LOGO.act, Wd - M - w, fy + 130, w, h); }
    busy = false;
    await showResult(c, `fanatics-booth-strip-${++shots}.jpg`, 'Your game-day strip', 'strip');
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
  setWear(o) { Object.assign(wear, o); applyWear(false); renderTray(); shopState(); },
  screen() {
    const r = this.rig; if (!r || !r.anchor.visible) return null;
    const pr = (v) => { const p = v.clone().project(camera); return [Math.round((p.x + 1) / 2 * innerWidth), Math.round((1 - p.y) / 2 * innerHeight)]; };
    return { forehead: pr(r.worldOf(r.forehead)), chin: pr(r.worldOf(new THREE.Vector3(0, -0.95, -0.45))) };
  },
  photo: () => takePhoto(), strip: () => startStrip(), shop: () => openShop(),
};

if (!TOUCH) {
  $('desk').hidden = false;
  try { window.QRCode && QRCode.toString(location.href, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }, (err, svg) => { if (!err) $('qr').innerHTML = svg; }); } catch (e) { /* no QR */ }
}
