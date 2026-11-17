// Bobo Booth: an EVADE selfie photo booth on the open-source 8th Wall engine's FACE tracking (MIT, self-hosted with
// Off the Chain in /evade/keychain-ar/vendor/xr, face chunk + models vendored there too).
//
// Put on Bobo: the Bobo cat hat (a tiny 3D Bobo sits on top) or the BOBO visor, Bobo shades (frame tips shaped like
// Bobo's ears), face paint drawn on the live face mesh, earrings that hang from your real ear lobes and swing as you move (the real Eclipse can GLB, gold hoops,
// Bobo's collar bell, star studs) and nose rings. Face tricks: open your mouth (cola fizz), raise your eyebrows (next
// look), wink (Bobo waves). Up to 2 faces at once. Photo, video (hold) or a 4-shot photo strip.
//
// Face local units (see wearables.js): ~139 mm per unit, x = wearer's left, y up, z = back of the head. The face's
// anchor gets the engine's transform (position, rotation, scale) so everything under it is in those units.
// No user-facing generative AI (EVADE rule); every wearable is built in code or from EVADE's real GLBs.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ColaCapture } from '/evade/cola-run-lab/assets/capture-core.js';
import * as W from './wearables.js';

window.THREE = THREE;                         // XR8.Threejs.pipelineModule() looks for a global THREE
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const PAGE = 'bobo-booth';
const LIVE_SITE = /(^|\.)medialife\.ai$/i.test(location.hostname);
const TOUCH = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = THREE.MathUtils.clamp;
const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* no haptics */ } };
const store = { get(k, d) { try { const v = localStorage.getItem(PAGE + '-' + k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(PAGE + '-' + k, String(v)); } catch (e) { /* none */ } } };

// ---------------------------------------------------------------- sound (made here, no files)
const sound = {
  ctx: null, on: store.get('sound', '1') === '1', master: null,
  init() { try { this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)(); this.ctx.resume(); if (!this.master) { this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination); } } catch (e) { /* no audio */ } },
  tone(f0, f1, dur, vol = 0.2, type = 'sine', when = 0) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime + when, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, vol, hp, lp, when = 0) {
    if (!this.ctx || !this.on) return;
    const n = Math.floor(this.ctx.sampleRate * dur), b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.6);
    const s = this.ctx.createBufferSource(); s.buffer = b; const g = this.ctx.createGain(); g.gain.value = vol;
    const f1 = this.ctx.createBiquadFilter(); f1.type = 'highpass'; f1.frequency.value = hp;
    const f2 = this.ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = lp;
    s.connect(f1).connect(f2).connect(g).connect(this.master); s.start(this.ctx.currentTime + when);
  },
  pick() { this.tone(900, 1400, 0.08, 0.05, 'triangle'); },
  pop() { this.tone(500, 1100, 0.1, 0.07, 'triangle'); this.noise(0.08, 0.03, 2000, 8000); },
  tick() { this.tone(1320, 1320, 0.07, 0.06, 'square'); },
  shutter() { this.noise(0.05, 0.22, 2000, 9000); this.noise(0.07, 0.16, 1200, 6000, 0.08); },
  mew() { this.tone(620, 880, 0.14, 0.08, 'triangle'); this.tone(880, 560, 0.22, 0.08, 'triangle', 0.13); },
  fizz() { this.noise(0.6, 0.12, 3000, 12000); this.tone(1400, 2600, 0.12, 0.03, 'sine', 0.05); this.tone(1900, 3200, 0.1, 0.025, 'sine', 0.2); },
  jingle() { [2637, 3136, 2637].forEach((f, i) => this.tone(f, f * 0.98, 0.18, 0.03, 'sine', i * 0.06)); },
};

// ---------------------------------------------------------------- what you can wear
// Each category holds one item at a time. `make` builds it (FU units, under the face anchor); earrings are per ear.
const CATS = [
  { k: 'looks', label: 'Looks' },
  { k: 'hat', label: 'Hat' },
  { k: 'shades', label: 'Shades' },
  { k: 'ears', label: 'Earrings' },
  { k: 'nose', label: 'Nose' },
  { k: 'paint', label: 'Face paint' },
];
const ITEMS = {
  hat: [
    { id: 'none', name: 'No hat' },
    { id: 'cathat', name: 'Bobo cat hat', make: () => W.buildCatHat(A.mini()) },
    { id: 'visor', name: 'BOBO visor', make: () => W.buildVisor() },
  ],
  shades: [
    { id: 'none', name: 'No shades' },
    { id: 'bobo', name: 'Bobo shades', make: () => W.buildShades({ frame: 'gold', tint: 'rgba(63,155,230,0.58)', ears: 'bobo' }) },
    { id: 'night', name: 'Night shades', make: () => W.buildShades({ frame: 'blue', tint: 'rgba(15,21,25,0.72)', ears: 'bobo' }) },
    { id: 'gold', name: 'Gold cat-eyes', make: () => W.buildShades({ frame: 'gold', tint: 'rgba(246,195,68,0.42)', ears: 'spike' }) },
  ],
  ears: [
    { id: 'none', name: 'No earrings' },
    { id: 'cans', name: 'Eclipse cans', l: 'can', r: 'can' },
    { id: 'canhoop', name: 'Can + hoop', l: 'can', r: 'hoop' },
    { id: 'hoops', name: 'Gold hoops', l: 'hoop', r: 'hoop' },
    { id: 'bells', name: 'Bobo bells', l: 'bell', r: 'bell' },
    { id: 'studs', name: 'Star studs', l: 'stud', r: 'stud' },
  ],
  nose: [
    { id: 'none', name: 'No nose ring' },
    { id: 'septum', name: 'Septum ring', make: () => W.buildNose('septum') },
    { id: 'hoop', name: 'Nose hoop', make: () => W.buildNose('hoop') },
    { id: 'stud', name: 'Star stud', make: () => W.buildNose('stud') },
  ],
  // drawn on the live face mesh (standard face UVs), so it follows every expression
  paint: [
    { id: 'none', name: 'No face paint' },
    { id: 'whiskers', name: 'Bobo whiskers' },
    { id: 'tabby', name: 'Tabby Bobo' },
    { id: 'eclipse', name: 'Eclipse game day' },
  ],
};
const LOOKS = [
  { id: 'full', name: 'Full Bobo', set: { hat: 'cathat', shades: 'bobo', ears: 'canhoop', nose: 'septum', paint: 'none' } },
  { id: 'fizz', name: 'Eclipse fizz', set: { hat: 'visor', shades: 'night', ears: 'cans', nose: 'stud', paint: 'eclipse' } },
  { id: 'gold', name: 'Gold rush', set: { hat: 'none', shades: 'gold', ears: 'hoops', nose: 'hoop', paint: 'none' } },
  { id: 'cat', name: 'Be Bobo', set: { hat: 'cathat', shades: 'none', ears: 'bells', nose: 'none', paint: 'tabby' } },
  { id: 'clear', name: 'Clear all', set: { hat: 'none', shades: 'none', ears: 'none', nose: 'none', paint: 'none' } },
];
const wear = { hat: 'cathat', shades: 'bobo', ears: 'canhoop', nose: 'septum', paint: 'none' };
try { Object.assign(wear, JSON.parse(store.get('wear', '{}'))); } catch (e) { /* defaults */ }
for (const k of Object.keys(wear)) if (!ITEMS[k] || !ITEMS[k].some((i) => i.id === wear[k])) wear[k] = 'none';
let cat = 'looks';

// ---------------------------------------------------------------- loading
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
const gl = new GLTFLoader();
const A = { bobo: null, can: null, decal: null, mini: null };
const assets = Promise.all([
  gl.loadAsync('/evade/keychain/ar/bobo-keychain.glb'),
  gl.loadAsync('/evade/keychain/ar/eclipse-can.glb'),
  loadImg('/evade/keychain/src/charm-bobo.png'),
  document.fonts ? document.fonts.load('900 italic 40px "Exo 2"').catch(() => {}) : null,
]).then(([bobo, can, charm]) => {
  A.bobo = bobo; A.can = can.scene; A.decal = W.boboFaceDecal(charm);
  A.mini = () => W.miniBobo(A.bobo, 64);
});
const xrReady = new Promise((res) => (window.XR8 ? res() : window.addEventListener('xrloaded', () => res(), { once: true })));
let loaded = false;
Promise.all([assets, xrReady]).then(() => {
  loaded = true; $('load').hidden = true; $('b-start').disabled = false; $('b-start').textContent = 'Open the booth';
  hero.init(); prerenderThumbs(); buildTray(); hero.start();
}).catch((e) => { console.error(e); showError('Could not load the booth', 'Check your connection and reload the page.'); });

// ---------------------------------------------------------------- splash hero + item thumbnails (one small renderer)
// Renders the wearables on their own (a turntable on the splash, a still per item for the tray). It is disposed when
// the camera starts so it never competes with the face tracker for the GPU.
const hero = {
  r: null, scene: null, cam: null, rig: null, raf: 0,
  init() {
    if (this.r) return true;
    try { this.r = new THREE.WebGLRenderer({ canvas: $('hero3d'), antialias: true, alpha: true, preserveDrawingBuffer: true }); } catch (e) { return false; }
    this.r.outputColorSpace = THREE.SRGBColorSpace; this.r.toneMapping = THREE.NeutralToneMapping; this.r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(this.r); this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    const dl = new THREE.DirectionalLight(0xffffff, 1.4); dl.position.set(-1, 2, -3); this.scene.add(dl);
    this.cam = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
    return true;
  },
  // a clean "display head" (flat slate) so the pieces read as worn
  bust() {
    const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: '#26323b', roughness: 0.75 });
    const h = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 30), m); h.scale.set(0.57, 0.84, 0.66); h.position.set(0, 0.0, 0.05); g.add(h);
    const n = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.42, 0.9, 30), m); n.position.set(0, -0.95, 0.12); g.add(n);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 16), m); nose.rotation.x = -Math.PI / 2 - 0.3; nose.position.set(0, -0.2, -0.66); g.add(nose);
    return g;
  },
  start() {
    if (!this.init()) return;
    this.rig = new THREE.Group(); this.scene.add(this.rig);
    this.rig.add(this.bust());
    const hat = W.buildCatHat(A.mini()), sh = ITEMS.shades[1].make(), sep = W.buildNose('septum');
    sep.position.set(0, -0.26, -0.74);
    this.rig.add(hat, sh, sep);
    for (const s of [1, -1]) { const e = W.buildEarring(s > 0 ? 'can' : 'hoop', A.can); e.position.set(s * 0.6, -0.22, 0.1); this.rig.add(e); }
    this.mini = sh.getObjectByName('shades') ? null : null;
    hat.traverse((o) => { if (o.userData && o.userData.mixer) this.mix = o.userData; });
    if (this.mix && this.mix.clips.Sit) this.mix.clips.Sit.play();
    const resize = () => {
      const c = $('hero3d'), w = c.clientWidth || 300, h = c.clientHeight || 300; this.r.setSize(w, h, false);
      this.cam.aspect = w / h; this.cam.position.set(0, 0.25, -4.6); this.cam.lookAt(0, 0.05, 0); this.cam.updateProjectionMatrix();
    };
    resize(); addEventListener('resize', resize);
    let t = 0, user = 0, ry = 0; const clock = new THREE.Clock();
    addEventListener('pointermove', (e) => { if ($('splash').hidden) return; user = performance.now(); ry = (e.clientX / innerWidth - 0.5) * 1.6; });
    const loop = () => {
      if (!this.r) return;
      const dt = Math.min(clock.getDelta(), 0.05); t += dt;
      const target = performance.now() - user < 2500 ? ry : Math.sin(t * 0.5) * (REDUCED ? 0.25 : 0.7);
      this.rig.rotation.y += (target - this.rig.rotation.y) * 0.06; this.rig.position.y = REDUCED ? 0 : Math.sin(t * 1.4) * 0.03;
      if (this.mix) this.mix.mixer.update(dt);
      this.r.render(this.scene, this.cam); this.raf = requestAnimationFrame(loop);
    };
    loop();
  },
  // a still of one item on the bust, framed on what it is
  thumb(cat, item) {
    if (!this.init()) return '';
    const prevRig = this.rig; if (prevRig) prevRig.visible = false;
    const g = new THREE.Group(); g.add(this.bust());
    const view = { hat: [0, 0.45, 2.3, 0, 0.42], shades: [0, 0.05, 1.9, 0, 0.02], ears: [0, -0.22, 0.95, 0.6, -0.26], nose: [0, -0.28, 0.75, 0.04, -0.3], looks: [0, 0.1, 3.4, 0, 0.0] }[cat];
    if (cat === 'looks') { for (const [c, id] of Object.entries(item.set)) addTo(g, c, id); }
    else if (item.id !== 'none') addTo(g, cat, item.id);
    this.scene.add(g);
    const c = this.r.domElement, keep = [c.width, c.height]; this.r.setSize(160, 160, false);
    this.cam.aspect = 1; this.cam.position.set(view[0] + (cat === 'ears' ? 0.9 : 0), view[1], -view[2]); this.cam.lookAt(view[3], view[4], 0); this.cam.updateProjectionMatrix();
    g.rotation.y = cat === 'ears' ? 0.5 : 0.35;
    this.r.render(this.scene, this.cam);
    const url = c.toDataURL('image/png');
    this.scene.remove(g); g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.r.setSize(keep[0] / this.r.getPixelRatio(), keep[1] / this.r.getPixelRatio(), false);
    if (prevRig) prevRig.visible = true;
    const resizeBack = () => { const cc = $('hero3d'), w = cc.clientWidth || 300, h = cc.clientHeight || 300; this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.position.set(0, 0.25, -4.6); this.cam.lookAt(0, 0.05, 0); this.cam.updateProjectionMatrix(); };
    resizeBack();
    return url;
  },
  stop() { cancelAnimationFrame(this.raf); if (this.r) { this.r.dispose(); this.r.forceContextLoss(); this.r = null; } },
};
function addTo(g, c, id) {   // for the thumbnails: put an item on the display bust at rest positions
  const it = ITEMS[c].find((i) => i.id === id); if (!it || it.id === 'none') return;
  if (c === 'ears') { for (const s of [1, -1]) { const e = W.buildEarring(s > 0 ? it.l : it.r, A.can); e.position.set(s * 0.6, -0.22, 0.1); g.add(e); } return; }
  if (!it.make) return;
  const o = it.make(); if (c === 'nose') o.position.set(0, -0.26, -0.74); g.add(o);
}

// ---------------------------------------------------------------- the lens carousel (Snapchat / Instagram style)
// Category chips on top; below them one row of round thumbnails that scrolls sideways and snaps. Whatever sits in the
// gold circle is what you wear, applied as it snaps into place; tap a thumbnail to glide it there. The camera button is
// its own control below the row (Dapo, round 2: always there, never the carousel): tap = photo (or strip), hold = video.
const thumbs = {};
let carouselLock = false, settleT = 0, centred = -1;
function buildTray() {
  const tabs = $('tabs'); tabs.innerHTML = '';
  for (const c of CATS) {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.c = c.k; b.textContent = c.label;
    b.onclick = () => { if (cat === c.k) return; cat = c.k; sound.pick(); buzz(6); renderTray(); };
    tabs.appendChild(b);
  }
  const car = $('carousel');
  car.addEventListener('scroll', () => { if (carouselLock) return; markCentre(false); clearTimeout(settleT); settleT = setTimeout(() => markCentre(true), 110); }, { passive: true });
  if ('onscrollend' in window) car.addEventListener('scrollend', () => { if (!carouselLock) { clearTimeout(settleT); markCentre(true); } });
  renderTray();
}
function prerenderThumbs() {   // every thumbnail now, while the splash renderer exists (it is freed at Start)
  for (const c of CATS) for (const it of (c.k === 'looks' ? LOOKS : ITEMS[c.k])) if (it.id !== 'none' && it.id !== 'clear') thumbFor(c.k, it);
}
function thumbFor(c, item) { const key = c + ':' + item.id; if (!(key in thumbs)) thumbs[key] = c === 'paint' ? paintThumb(item.id) : hero.r ? hero.thumb(c, item) : ''; return thumbs[key]; }
function list() { return cat === 'looks' ? LOOKS : ITEMS[cat]; }
function isOn(it) { return cat === 'looks' ? Object.entries(it.set).every(([k, v]) => wear[k] === v) : wear[cat] === it.id; }
function renderTray() {
  document.querySelectorAll('#tabs button').forEach((b) => { const on = b.dataset.c === cat; b.setAttribute('aria-selected', String(on)); if (on) b.scrollIntoView({ block: 'nearest', inline: 'center' }); });
  const car = $('carousel'), row = $('lenses'); row.innerHTML = '';
  list().forEach((it, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'lens'; b.dataset.i = i;
    b.setAttribute('aria-label', it.name);
    if (it.id === 'none' || it.id === 'clear') b.innerHTML = '<i class="none" aria-hidden="true"></i>';
    else { const src = thumbFor(cat, it); b.innerHTML = src ? `<img src="${src}" alt="" draggable="false">` : '<i class="dot" aria-hidden="true"></i>'; }
    b.onclick = () => { scrollToLens(i, true); };
    row.appendChild(b);
  });
  // start on what you are wearing now (no animation, no re-apply)
  let at = list().findIndex(isOn); if (at < 0) at = cat === 'looks' ? -1 : 0;
  carouselLock = true; centred = at;
  requestAnimationFrame(() => { if (at >= 0) scrollToLens(at, false); else car.scrollLeft = 0; paintCentre(at); setTimeout(() => { carouselLock = false; }, 60); });
}
function scrollToLens(i, smooth) {
  const car = $('carousel'), el = car.querySelector(`.lens[data-i="${i}"]`); if (!el) return;
  const x = el.offsetLeft + el.offsetWidth / 2 - car.clientWidth / 2;
  car.scrollTo({ left: x, behavior: smooth && !REDUCED ? 'smooth' : 'auto' });
  if (!smooth) { centred = i; paintCentre(i); }
}
function centreIndex() {
  const car = $('carousel'), mid = car.scrollLeft + car.clientWidth / 2; let best = -1, bd = 1e9;
  car.querySelectorAll('.lens').forEach((el) => { const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid); if (d < bd) { bd = d; best = +el.dataset.i; } });
  return best;
}
function paintCentre(i) {
  $('carousel').querySelectorAll('.lens').forEach((el) => el.classList.toggle('on', +el.dataset.i === i));
  const it = list()[i], name = it ? it.name : (cat === 'looks' ? 'Pick a look' : '');
  const lab = $('lens-name'); if (lab.textContent !== name) { lab.textContent = name; lab.classList.remove('show'); void lab.offsetWidth; lab.classList.add('show'); }
}
function markCentre(settled) {
  const i = centreIndex(); if (i < 0) return;
  if (i !== centred) { centred = i; paintCentre(i); buzz(4); sound.tick(); choose(i); }
  else if (settled) paintCentre(i);
}
function choose(i) {
  const it = list()[i]; if (!it) return;
  if (cat === 'looks') { Object.assign(wear, it.set); postEvent('custom', { what: 'look', id: it.id }); }
  else wear[cat] = it.id;
  store.set('wear', JSON.stringify(wear)); applyWear(true);
}

// ---------------------------------------------------------------- the scene
// One "rig" per tracked face (friends mode: up to MAX_FACES faces, each wearing the same look).
let scene, camera, renderer;
let faceIdx = null, faceUvs = null, paintUV = null;
const MAX_FACES = clamp(Math.round(+params.get('faces') || 2), 1, 3);
const rigs = new Map();
const AP_DEFAULT = {
  leftLobe: [0.636, -0.212, 0.123], rightLobe: [-0.636, -0.212, 0.123], noseTip: [0, -0.256, -0.744], noseBridge: [0, -0.034, -0.626],
  forehead: [0, 0.278, -0.615], mouth: [0, -0.518, -0.551], leftEye: [0.227, 0.017, -0.486], rightEye: [-0.226, 0.016, -0.487],
};
const tmpV = new THREE.Vector3();
function ap(d, n) { const p = d.attachmentPoints && d.attachmentPoints[n]; return p && p.position ? tmpV.set(p.position.x, p.position.y, p.position.z) : tmpV.set(...AP_DEFAULT[n]); }
function buildScene(xr) {
  ({ scene, camera, renderer } = xr);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping;
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.85;
  const dl = new THREE.DirectionalLight(0xffffff, 1.1); dl.position.set(0.3, 1, 1); scene.add(dl);
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));
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
    this.anchor.add(W.buildHeadOccluder());
    this.slots = { hat: new THREE.Group(), shades: new THREE.Group(), nose: new THREE.Group() };
    for (const s of Object.values(this.slots)) this.anchor.add(s);
    this.ears = { l: null, r: null }; this.leaving = [];
    this.sm = {}; for (const [k, n] of Object.entries({ bridge: 'noseBridge', tip: 'noseTip', forehead: 'forehead', lobeL: 'leftLobe', lobeR: 'rightLobe', mouth: 'mouth', eyeL: 'leftEye', eyeR: 'rightEye' })) this.sm[k] = new THREE.Vector3(...AP_DEFAULT[n]);
    this.mini = null; this.miniNext = 0; this.paintId = null;
    this.trig = { mouth: false, brows: 0, mouthT: 0 };
    this.makeMeshes(); this.apply(false);
  }
  makeMeshes() {
    if (this.occ || !faceIdx) return;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(faceIdx.n * 3), 3)); geo.setIndex(faceIdx.idx);
    this.occ = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ colorWrite: false })); this.occ.renderOrder = -10; this.occ.frustumCulled = false; this.anchor.add(this.occ);
    // face paint: the same mesh, drawn with a texture in the face's standard UVs
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
    const sm = this.sm;   // attachment points, smoothed a little (they jitter by a millimetre or two)
    sm.bridge.lerp(ap(d, 'noseBridge'), 0.5); sm.tip.lerp(ap(d, 'noseTip'), 0.5); sm.forehead.lerp(ap(d, 'forehead'), 0.4);
    sm.mouth.lerp(ap(d, 'mouth'), 0.6); sm.eyeL.lerp(ap(d, 'leftEye'), 0.5); sm.eyeR.lerp(ap(d, 'rightEye'), 0.5);
    const ok = (n, found) => found || !(d.attachmentPoints && d.attachmentPoints[n]);
    sm.lobeL.lerp(ok('leftLobe', d.leftLobeFound) ? ap(d, 'leftLobe') : tmpV.set(...AP_DEFAULT.leftLobe), 0.5);
    sm.lobeR.lerp(ok('rightLobe', d.rightLobeFound) ? ap(d, 'rightLobe') : tmpV.set(...AP_DEFAULT.rightLobe), 0.5);
    this.earL = !!d.leftEarFound; this.earR = !!d.rightEarFound;
    if (d.vertices && this.occ) {
      const a = this.occ.geometry.attributes.position, b = this.paint.geometry.attributes.position, n = Math.min(a.count, d.vertices.length);
      for (let i = 0; i < n; i++) { const v = d.vertices[i]; a.setXYZ(i, v.x, v.y, v.z + 0.012); b.setXYZ(i, v.x, v.y, v.z); }   // occluder a hair back: studs on the skin stay visible
      a.needsUpdate = true; b.needsUpdate = true;
      if (!paintUV && faceUvs) { paintUV = measurePaintUV(d); for (const r of rigs.values()) r.apply(false); }   // paint can be drawn now
    }
    if (!this.tracked) { this.tracked = true; diag.found++; if (!diag.firstFoundS) diag.firstFoundS = +((performance.now() - camStartAt) / 1000).toFixed(1); arrived(this); }
    this.at = performance.now();
    triggers.face(this, d);
  }
  get live() { return this.tracked && performance.now() - this.at < 400; }
  apply(anim) {
    for (const k of ['hat', 'shades', 'nose']) {
      const slot = this.slots[k], it = ITEMS[k].find((i) => i.id === wear[k]);
      if (slot.userData.id === wear[k]) continue;
      slot.userData.id = wear[k];
      for (const old of slot.children.filter((c) => !c.userData.leaving)) {   // out with its own exit
        old.userData.leaving = true;
        if (anim) animate(old, old.userData.anim, -1, () => { slot.remove(old); disposeTree(old); });
        else { slot.remove(old); disposeTree(old); }
      }
      if (it && it.make) {
        const w = W.wrap(it.make(), k, it.id); slot.add(w);
        if (anim) animate(w, w.userData.anim, 1); else W.animFrame(w, w.userData.anim, 1, 1, REDUCED);
      }
    }
    this.mini = null; this.slots.hat.traverse((o) => { if (o.userData && o.userData.mixer && !leavingUp(o)) this.mini = o.userData; });
    if (this.mini && this.mini.clips.Sit) { this.mini.clips.Sit.reset().play(); this.miniNext = performance.now() + 3500; }
    // earrings (world space, they swing): the wrapper inside each one animates
    const e = ITEMS.ears.find((i) => i.id === wear.ears);
    for (const side of ['l', 'r']) {
      const kind = e && e.id !== 'none' ? e[side] : null, cur = this.ears[side];
      if (cur && cur.kind === kind) continue;
      if (cur) {
        const obj = cur.obj; this.ears[side] = null; this.leaving.push(cur);
        const done = () => { scene.remove(obj); disposeTree(obj); this.leaving.splice(this.leaving.indexOf(cur), 1); };
        if (anim) animate(obj.userData.w, obj.userData.w.userData.anim, -1, done); else done();
      }
      if (kind) {
        const w = W.wrap(W.buildEarring(kind, A.can), 'ears', kind), obj = new THREE.Group(); obj.add(w);
        obj.userData = { w, len: w.userData.len, fixed: w.userData.fixed }; obj.visible = false; scene.add(obj);
        this.ears[side] = { kind, obj, side, bob: null, prev: null, kick: anim ? (side === 'l' ? 1 : -1) : 0 };
        if (anim) animate(w, w.userData.anim, 1); else W.animFrame(w, w.userData.anim, 1, 1, REDUCED);
      }
    }
    // face paint: fades in / out
    if (this.paint && paintUV && this.paintId !== wear.paint) {
      this.paintId = wear.paint; const tex = paintTexture(wear.paint);
      if (tex) { this.paint.material.map = tex; this.paint.material.needsUpdate = true; this.paint.visible = true; }
      this.paintFade = { to: tex ? 1 : 0, anim };
      if (!anim) { this.paint.material.opacity = tex ? 1 : 0; this.paint.visible = !!tex; }
      else if (tex) sparkles.burst(this.paint, ['#f4a3a8', '#ffffff', '#f3ab5e']);
    }
  }
  tick(dt, now) {
    const live = this.live; this.anchor.visible = live;
    const sm = this.sm;
    this.slots.hat.position.set(0, sm.forehead.y - AP_DEFAULT.forehead[1], sm.forehead.z - AP_DEFAULT.forehead[2]);
    this.slots.shades.position.set(sm.bridge.x, sm.bridge.y - AP_DEFAULT.noseBridge[1], sm.bridge.z - AP_DEFAULT.noseBridge[2]);
    this.slots.nose.position.copy(sm.tip);
    if (this.paintFade && this.paint) {
      const m = this.paint.material, f = this.paintFade; m.opacity += Math.sign(f.to - m.opacity) * Math.min(Math.abs(f.to - m.opacity), dt / (REDUCED ? 0.15 : 0.45));
      if (m.opacity === f.to) { this.paint.visible = f.to > 0; this.paintFade = null; }
    }
    const mini = this.mini;
    if (mini) {
      mini.mixer.update(dt);
      if (now > this.miniNext && !REDUCED) { this.miniDo(Math.random() < 0.5 ? 'TailWag' : 'PawRaise'); this.miniNext = now + 6000 + Math.random() * 5000; }
    }
    // earrings: verlet pendulum in world metres from the lobe
    this.anchor.updateMatrixWorld(true); this.anchor.getWorldQuaternion(qA);
    const list = [[sm.lobeL, this.ears.l], [sm.lobeR, this.ears.r], ...this.leaving.map((e) => [e.side === 'l' ? sm.lobeL : sm.lobeR, e])];
    for (const [lobe, e] of list) {
      if (!e) continue;
      e.obj.visible = live;
      if (!live) { e.bob = null; continue; }
      const pivot = this.anchor.localToWorld(vA.copy(lobe));
      const len = (e.obj.userData.len || 0) * this.s;
      e.obj.position.copy(pivot); e.obj.scale.setScalar(this.s);
      if (e.obj.userData.fixed || len <= 0) { e.obj.quaternion.copy(qA); continue; }
      if (!e.bob) { e.bob = pivot.clone().addScaledVector(down, len); e.prev = e.bob.clone(); }
      if (e.kick) { e.prev.addScaledVector(vB.set(1, 0, 0).applyQuaternion(qA), -e.kick * len * 0.09); e.kick = 0; }   // a swing
      const h = Math.min(dt, 1 / 30), vel = vB.copy(e.bob).sub(e.prev).multiplyScalar(REDUCED ? 0.9 : 0.975);
      e.prev.copy(e.bob); e.bob.add(vel).addScaledVector(down, 9.8 * h * h);
      const dir = vB.copy(e.bob).sub(pivot); if (dir.lengthSq() < 1e-10) dir.copy(down);
      dir.normalize(); e.bob.copy(pivot).addScaledVector(dir, len);
      const headDown = vA.copy(down).applyQuaternion(qA);   // the head's rotation, swung onto the pendulum
      qTmp.setFromUnitVectors(headDown, dir); e.obj.quaternion.copy(qTmp).multiply(qA);
    }
  }
  miniDo(name) {   // the tiny Bobo on the hat: play a clip once, then back to sitting
    const mini = this.mini, a = mini && mini.clips[name]; if (!a || !mini.clips.Sit) return false;
    a.reset().setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = false; mini.clips.Sit.crossFadeTo(a, 0.2, false); a.play();
    clearTimeout(this.miniT); this.miniT = setTimeout(() => { if (this.mini === mini) { mini.clips.Sit.reset().play(); a.crossFadeTo(mini.clips.Sit, 0.3, false); } }, (a.getClip().duration || 1.5) * 1000 - 300);
    return true;
  }
  kickEars(k = 1) { for (const e of [this.ears.l, this.ears.r]) if (e) e.kick = (Math.random() < 0.5 ? -1 : 1) * k; }
  worldOf(v) { this.anchor.updateMatrixWorld(true); return this.anchor.localToWorld(v.clone()); }
  dispose() {
    for (const e of [this.ears.l, this.ears.r, ...this.leaving]) if (e) { scene.remove(e.obj); disposeTree(e.obj); }
    scene.remove(this.anchor); disposeTree(this.anchor);
  }
}
function leavingUp(o) { for (let p = o; p; p = p.parent) if (p.userData && p.userData.leaving) return true; return false; }
function disposeTree(o) { o.traverse((x) => { if (x.geometry) x.geometry.dispose(); }); }
function rigFor(id) { let r = rigs.get(id); if (!r && scene) { if (rigs.size >= MAX_FACES) return null; r = new Rig(id); rigs.set(id, r); } return r; }
function onFace(d) { const r = rigFor(d.id); if (r) r.update(d); }
function onFaceLost(d) { const r = rigs.get(d && d.id); if (r && r.tracked) { r.tracked = false; diag.lost++; } }
function applyWear(anim) { if (!scene) return; for (const r of rigs.values()) r.apply(anim); }

// Every piece arrives and leaves in its own way (W.ANIM in wearables.js); a sparkle burst lands with it.
const live = [];                              // { w: wrapper, a: anim spec, dir: 1 in / -1 out, t, dur, onDone, burst }
function animate(w, spec, dir, onDone) {
  const dur = REDUCED ? 0.2 : (dir > 0 ? spec.inS : spec.outS);
  for (let i = live.length - 1; i >= 0; i--) if (live[i].w === w) live.splice(i, 1);
  live.push({ w, spec, dir, t: 0, dur, onDone, burst: dir > 0 && !REDUCED });
  W.animFrame(w, spec, dir, 0, REDUCED);
}
function tickAnims(dt) {
  for (let i = live.length - 1; i >= 0; i--) {
    const L = live[i]; L.t = Math.min(1, L.t + dt / L.dur);
    W.animFrame(L.w, L.spec, L.dir, L.t, REDUCED);
    if (L.burst && L.t > (L.spec.burstAt || 0.6)) { L.burst = false; sparkles.burst(L.w, L.spec.colors); if (L.spec.sfx) sound[L.spec.sfx] && sound[L.spec.sfx](); }
    if (L.t >= 1) { live.splice(i, 1); if (L.onDone) L.onDone(); }
  }
}

// ---------------------------------------------------------------- face paint (on the live face mesh, standard UVs)
// Where the nose, cheeks, eyes and mouth sit in the face's UV layout is measured once from the first tracked frame
// (nearest mesh vertex to each attachment point), so the art follows the real UV layout without hand-tuned numbers.
function measurePaintUV(d) {
  const want = ['noseTip', 'leftCheek', 'rightCheek', 'leftEye', 'rightEye', 'forehead', 'mouthLeftCorner', 'mouthRightCorner', 'upperLip', 'chin', 'leftEyebrowOuter', 'rightEyebrowOuter'];
  const out = {};
  for (const n of want) {
    const p = d.attachmentPoints && d.attachmentPoints[n] && d.attachmentPoints[n].position; if (!p) continue;
    let best = -1, bd = 1e9;
    const nUv = faceUvs.length / 2;   // the iris points come after the mesh: their UVs are a (1, 0) placeholder
    d.vertices.forEach((v, i) => { if (i >= nUv || (faceUvs[i * 2] >= 0.999 && faceUvs[i * 2 + 1] <= 0.001)) return; const dd = (v.x - p.x) ** 2 + (v.y - p.y) ** 2 + (v.z - p.z) ** 2; if (dd < bd) { bd = dd; best = i; } });
    if (best >= 0) out[n] = [faceUvs[best * 2], faceUvs[best * 2 + 1]];
  }
  // the UV layout is symmetric: average each left/right pair so the art comes out even
  for (const [L, R] of [['leftEye', 'rightEye'], ['leftCheek', 'rightCheek'], ['mouthLeftCorner', 'mouthRightCorner'], ['leftEyebrowOuter', 'rightEyebrowOuter']]) {
    const l = out[L], r = out[R]; if (!l || !r) continue;
    const du = (Math.abs(l[0] - 0.5) + Math.abs(r[0] - 0.5)) / 2, v = (l[1] + r[1]) / 2;
    out[L] = [0.5 + Math.sign(l[0] - 0.5) * du, v]; out[R] = [0.5 + Math.sign(r[0] - 0.5) * du, v];
  }
  diag.paintUV = Object.keys(out).length;
  return out;
}
const paintCache = {};
function paintTexture(id) {
  if (!id || id === 'none' || !paintUV || !paintUV.noseTip) return null;
  if (paintCache[id]) return paintCache[id];
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const P = (n) => { const t = paintUV[n]; return t ? [t[0] * S, (1 - t[1]) * S] : null; };
  const nose = P('noseTip'), cl = P('leftCheek'), cr = P('rightCheek'), fh = P('forehead'), el = P('leftEye'), er = P('rightEye');
  let eyeD = el && er ? Math.hypot(el[0] - er[0], el[1] - er[1]) : 0;   // the art's unit
  if (!(eyeD > S * 0.08)) eyeD = cl && cr ? Math.hypot(cl[0] - cr[0], cl[1] - cr[1]) * 0.6 : S * 0.25;
  const line = (x0, y0, x1, y1, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
  const dot = (x, y, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  if (id === 'whiskers' || id === 'tabby') {
    // Bobo: pink nose, whiskers, blush; tabby adds his forehead stripes and cheek stripes
    for (const [ch, sgn] of [[cl, 1], [cr, -1]]) {
      if (!ch) continue;
      const dirx = Math.sign(ch[0] - nose[0]) || sgn;
      dot(ch[0], ch[1] + eyeD * 0.02, eyeD * 0.16, 'rgba(244,163,168,0.55)');
      for (let k = -1; k <= 1; k++) {
        const y = ch[1] + eyeD * (0.04 + k * 0.1);
        line(ch[0] - dirx * eyeD * 0.12, y, ch[0] + dirx * eyeD * 0.62, y + k * eyeD * 0.14 - eyeD * 0.04, eyeD * 0.028, '#15131a');
      }
      if (id === 'tabby') for (let k = 0; k < 3; k++) {
        const x = ch[0] + dirx * eyeD * (0.32 + k * 0.12), y = ch[1] - eyeD * 0.2;
        g.fillStyle = '#d8762c'; g.beginPath(); g.moveTo(x, y - eyeD * 0.16); g.lineTo(x + dirx * eyeD * 0.05, y); g.lineTo(x - dirx * eyeD * 0.05, y); g.closePath(); g.fill();
      }
    }
    // the pink nose (a rounded triangle) and the little mouth line under it
    g.fillStyle = '#f4a3a8'; g.strokeStyle = '#15131a'; g.lineWidth = eyeD * 0.025;
    const nw = eyeD * 0.13, nh = eyeD * 0.09; g.beginPath(); g.moveTo(nose[0] - nw, nose[1] - nh * 0.6); g.quadraticCurveTo(nose[0], nose[1] - nh * 1.0, nose[0] + nw, nose[1] - nh * 0.6); g.quadraticCurveTo(nose[0] + nw * 0.4, nose[1] + nh * 0.7, nose[0], nose[1] + nh * 0.8); g.quadraticCurveTo(nose[0] - nw * 0.4, nose[1] + nh * 0.7, nose[0] - nw, nose[1] - nh * 0.6); g.fill(); g.stroke();
    if (id === 'tabby' && fh) {   // the "M" on the forehead
      g.strokeStyle = '#d8762c'; g.lineWidth = eyeD * 0.07; g.lineJoin = 'round'; g.lineCap = 'round';
      const w = eyeD * 0.36, top = fh[1] - eyeD * 0.1, bot = fh[1] + eyeD * 0.18;
      g.beginPath(); g.moveTo(fh[0] - w, bot); g.lineTo(fh[0] - w * 0.55, top); g.lineTo(fh[0], bot - eyeD * 0.06); g.lineTo(fh[0] + w * 0.55, top); g.lineTo(fh[0] + w, bot); g.stroke();
    }
  } else if (id === 'eclipse') {
    // EVADE game-day paint: gold eye-black stripes under each eye and a blue crescent (the Eclipse) on one cheek
    for (const e of [el, er]) if (e) { g.fillStyle = '#f6c344'; g.fillRect(e[0] - eyeD * 0.17, e[1] + eyeD * 0.15, eyeD * 0.34, eyeD * 0.06); g.fillRect(e[0] - eyeD * 0.13, e[1] + eyeD * 0.25, eyeD * 0.26, eyeD * 0.045); }
    if (cl) { const r = eyeD * 0.16; dot(cl[0], cl[1], r, '#3f9be6'); g.globalCompositeOperation = 'destination-out'; dot(cl[0] + r * 0.45, cl[1] - r * 0.25, r * 0.85, '#000'); g.globalCompositeOperation = 'source-over'; }
    if (cr) { g.fillStyle = '#ffffff'; g.font = `900 italic ${Math.round(eyeD * 0.14)}px "Exo 2", sans-serif`; g.textAlign = 'center'; g.fillText('EVADE', cr[0], cr[1]); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  paintCache[id] = t; return t;
}
// a 2D thumbnail for paint (no face mesh exists before the camera starts)
function paintThumb(id) {
  const c = document.createElement('canvas'); c.width = c.height = 160; const g = c.getContext('2d');
  g.fillStyle = '#26323b'; g.beginPath(); g.ellipse(80, 84, 52, 66, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#0f1519'; g.beginPath(); g.ellipse(60, 70, 7, 9, 0, 0, Math.PI * 2); g.ellipse(100, 70, 7, 9, 0, 0, Math.PI * 2); g.fill();
  const line = (a, b, cc, d, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(a, b); g.lineTo(cc, d); g.stroke(); };
  if (id === 'whiskers' || id === 'tabby') {
    g.fillStyle = 'rgba(244,163,168,0.6)'; g.beginPath(); g.arc(52, 100, 11, 0, 7); g.arc(108, 100, 11, 0, 7); g.fill();
    for (const k of [-1, 0, 1]) { line(60, 104 + k * 6, 24, 98 + k * 12, 3, '#fff'); line(100, 104 + k * 6, 136, 98 + k * 12, 3, '#fff'); }
    g.fillStyle = '#f4a3a8'; g.beginPath(); g.moveTo(70, 90); g.lineTo(90, 90); g.lineTo(80, 101); g.closePath(); g.fill();
    if (id === 'tabby') { g.strokeStyle = '#f3ab5e'; g.lineWidth = 5; g.lineJoin = 'round'; g.beginPath(); g.moveTo(64, 50); g.lineTo(70, 34); g.lineTo(80, 46); g.lineTo(90, 34); g.lineTo(96, 50); g.stroke(); }
  } else if (id === 'eclipse') {
    g.fillStyle = '#f6c344'; g.fillRect(48, 84, 24, 5); g.fillRect(88, 84, 24, 5); g.fillRect(51, 92, 18, 4); g.fillRect(91, 92, 18, 4);
    g.fillStyle = '#3f9be6'; g.beginPath(); g.arc(112, 110, 10, 0, 7); g.fill(); g.fillStyle = '#26323b'; g.beginPath(); g.arc(116, 107, 8.5, 0, 7); g.fill();
  }
  return c.toDataURL('image/png');
}

// ---------------------------------------------------------------- face triggers (round 2)
// Open your mouth: cola fizz pours out. Raise both eyebrows: next look. Wink: the tiny Bobo waves (or a sparkle).
const triggers = {
  on: store.get('triggers', '1') === '1', lookAt: 0, mewAt: 0, coachShown: false,
  face(r, d) {
    if (!this.on) { r.trig.mouth = false; return; }
    const now = performance.now(), T = r.trig;
    const mouth = !!d.mouthOpen;
    if (mouth && !T.mouth) { T.mouthT = now; fizz.burst(r); sound.fizz(); buzz(12); r.kickEars(1.5); if (now - this.mewAt > 4000 && r.miniDo('PawRaise')) { this.mewAt = now; } postEvent('custom', { what: 'trigger', id: 'mouth' }); diag.trig.mouth = (diag.trig.mouth || 0) + 1; }
    T.mouth = mouth;
    const brows = !!(d.leftEyebrowRaised && d.rightEyebrowRaised);
    if (brows) { if (!T.brows) T.brows = now; else if (now - T.brows > 250 && now - this.lookAt > 2200 && !busy && !strip) { this.lookAt = now; T.brows = now + 1e9; nextLook(); diag.trig.brows = (diag.trig.brows || 0) + 1; } }
    else T.brows = 0;
  },
  wink(id) {
    if (!this.on) return; const r = rigs.get(id); if (!r || !r.live) return;
    diag.trig.wink = (diag.trig.wink || 0) + 1;
    if (!r.miniDo('PawRaise')) { const e = r.worldOf(r.sm.eyeL); sparkles.burstAt(e, r.s * 0.4, ['#f6c344', '#ffffff', '#f4a3a8']); }
    else sparkles.burstAt(r.worldOf(new THREE.Vector3(0, 1.05, 0.1)), r.s * 0.5, ['#f6c344', '#ffffff', '#f4a3a8']);
    sound.mew(); buzz(8);
  },
};
function nextLook() {
  const i = (LOOKS.findIndex((L) => Object.entries(L.set).every(([k, v]) => wear[k] === v)) + 1) % (LOOKS.length - 1);   // skip "Clear all"
  Object.assign(wear, LOOKS[i].set); store.set('wear', JSON.stringify(wear)); applyWear(true); renderTray();
  toast(`Eyebrows up: ${LOOKS[i].name}`); sound.pop(); buzz([10, 40, 10]); postEvent('custom', { what: 'trigger', id: 'brows', look: LOOKS[i].id });
}
let toastT = 0;
function toast(text) { const el = $('toast'); el.textContent = text; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 1800); }
// cola fizz: flat round bubbles (one colour each) pour from the mouth, drift forward and up, then pop
const fizz = {
  pool: [], tex: null,
  init() { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(24, 22, 8, 0, 7); g.fill(); this.tex = new THREE.CanvasTexture(c); this.tex.colorSpace = THREE.SRGBColorSpace; },
  spawn(r, n, speed) {
    if (!this.tex) this.init();
    r.anchor.updateMatrixWorld(true);
    const o = r.anchor.localToWorld(r.sm.mouth.clone().add(tmpV.set(0, 0, -0.05)));
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(r.anchor.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const cols = ['#3f9be6', '#ffffff', '#8cc8f8', '#f6c344', '#ffffff'];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, color: cols[(Math.random() * cols.length) | 0], transparent: true, depthWrite: false }));
      m.position.copy(o).add(tmpV.set((Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.01, 0)); m.renderOrder = 15; scene.add(m);
      const v = fwd.clone().multiplyScalar(speed * (0.5 + Math.random() * 0.6)).add(tmpV.set((Math.random() - 0.5) * 0.1, 0.03 + Math.random() * 0.08, 0));
      this.pool.push({ m, v, t: 0, life: 0.8 + Math.random() * 0.7, s: 0.0025 + Math.random() * 0.005 });
    }
  },
  burst(r) { this.spawn(r, REDUCED ? 6 : 18, 0.2); },
  tick(dt) {
    for (const r of rigs.values()) if (r.live && r.trig.mouth && this.on()) { r.fizzAcc = (r.fizzAcc || 0) + dt * (REDUCED ? 4 : 14); while (r.fizzAcc >= 1) { r.fizzAcc--; this.spawn(r, 1, 0.14); } }
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const p = this.pool[i]; p.t += dt; const k = p.t / p.life;
      if (k >= 1) { scene.remove(p.m); p.m.material.dispose(); this.pool.splice(i, 1); continue; }
      p.v.y += 0.12 * dt; p.v.multiplyScalar(1 - 1.4 * dt); p.m.position.addScaledVector(p.v, dt);
      p.m.scale.setScalar(p.s * (0.5 + k) * (k > 0.88 ? 1 + (k - 0.88) * 6 : 1)); p.m.material.opacity = k > 0.88 ? 1 - (k - 0.88) / 0.12 : 1;
    }
  },
  on: () => triggers.on,
};

// sparkles: flat four-point stars (one colour each, no gradient) bursting from where a piece lands
const sparkles = {
  pool: [], tex: null,
  init() {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(32, 0); g.lineTo(38, 26); g.lineTo(64, 32); g.lineTo(38, 38); g.lineTo(32, 64); g.lineTo(26, 38); g.lineTo(0, 32); g.lineTo(26, 26); g.closePath(); g.fill();
    this.tex = new THREE.CanvasTexture(c); this.tex.colorSpace = THREE.SRGBColorSpace;
  },
  burst(w, colors) {
    const box = new THREE.Box3().setFromObject(w, true); if (box.isEmpty()) return;
    this.burstAt(box.getCenter(new THREE.Vector3()), box.getSize(new THREE.Vector3()).length() * 0.45, colors);
  },
  burstAt(c, r, colors = ['#f6c344', '#ffffff', '#8cc8f8']) {
    if (!this.tex) this.init();
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, color: colors[i % colors.length], transparent: true, depthTest: false, depthWrite: false }));
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, (Math.random() - 0.5) * 0.4).normalize();
      m.position.copy(c).addScaledVector(d, r * 0.5); m.renderOrder = 20; scene.add(m);
      this.pool.push({ m, v: d.multiplyScalar(r * (1.2 + Math.random())), t: 0, life: 0.55 + Math.random() * 0.3, s: r * (0.12 + Math.random() * 0.1), spin: (Math.random() - 0.5) * 8 });
    }
  },
  tick(dt) {
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const p = this.pool[i]; p.t += dt; const k = p.t / p.life;
      if (k >= 1) { scene.remove(p.m); p.m.material.dispose(); this.pool.splice(i, 1); continue; }
      p.m.position.addScaledVector(p.v, dt * (1 - k)); p.m.material.rotation += p.spin * dt;
      p.m.scale.setScalar(p.s * Math.sin(Math.min(k * 2.2, 1) * Math.PI * 0.5) * (1 - k * k));
    }
  },
};

// ---------------------------------------------------------------- per frame
const qTmp = new THREE.Quaternion(), qA = new THREE.Quaternion(), vA = new THREE.Vector3(), vB = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
function tick(dt) {
  const now = performance.now();
  diag.fpsN++;
  let any = false, n = 0; for (const r of rigs.values()) if (r.live) { any = true; n++; }
  diag.maxFaces = Math.max(diag.maxFaces || 0, n);
  setMode(any ? 'wear' : 'find');
  hint(any ? '' : (camStartAt && now - camStartAt > 1200 ? 'Look straight at the camera' : ''));
  tickAnims(dt); sparkles.tick(dt); fizz.tick(dt);
  for (const r of rigs.values()) r.tick(dt, now);
  recTick(); stripTick();
}
let mode = 'find';
function setMode(m) { if (mode !== m) { mode = m; $('hud').dataset.mode = m; } }
let arrivedOnce = false;
function arrived(r) {
  if (!arrivedOnce) {
    arrivedOnce = true; sound.mew(); postEvent('play', { look: JSON.stringify(wear) });
    if (triggers.on && store.get('coach', '0') !== '1') setTimeout(() => { $('coach').hidden = false; setTimeout(() => { $('coach').hidden = true; store.set('coach', '1'); }, 7000); }, 1500);
  } else if (rigs.size > 1) toast('Friend joined the booth');
  buzz(8);
}
function hint(text) { if ($('hint').textContent !== text) $('hint').textContent = text || ''; }

// ---------------------------------------------------------------- UI
const optsEl = $('opts');
function openOpts() { optsEl.hidden = false; $('b-opts').setAttribute('aria-expanded', 'true'); optsEl.querySelector('.x').focus(); }
function closeOpts() { optsEl.hidden = true; $('b-opts').setAttribute('aria-expanded', 'false'); $('b-opts').focus(); }
$('b-opts').onclick = openOpts;
optsEl.querySelectorAll('[data-close]').forEach((el) => { el.onclick = closeOpts; });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !optsEl.hidden) closeOpts(); });
const soundBtn = $('o-sound'); soundBtn.setAttribute('aria-checked', String(sound.on));
soundBtn.onclick = () => { sound.on = !sound.on; store.set('sound', sound.on ? '1' : '0'); soundBtn.setAttribute('aria-checked', String(sound.on)); };
let stripMode = store.get('strip', '0') === '1';
function setStrip(on) { stripMode = on; store.set('strip', on ? '1' : '0'); $('b-strip').setAttribute('aria-pressed', String(on)); $('b-shutter').classList.toggle('strip', on); $('shoot-hint').textContent = on ? 'Tap: 4-shot strip · Hold: video' : 'Tap: photo · Hold: video'; }
$('b-strip').onclick = () => { setStrip(!stripMode); sound.pick(); buzz(8); };
setStrip(stripMode);
$('b-shuffle').onclick = () => {
  for (const k of Object.keys(wear)) { const opts = ITEMS[k].filter((i) => i.id !== 'none'); wear[k] = opts[Math.floor(Math.random() * opts.length)].id; }
  if (Math.random() < 0.3) wear.hat = 'none';
  if (Math.random() < 0.5) wear.paint = 'none';
  store.set('wear', JSON.stringify(wear)); applyWear(true); renderTray(); sound.pop(); buzz(12);
};
const trigBtn = $('o-triggers'); trigBtn.setAttribute('aria-checked', String(triggers.on));
trigBtn.onclick = () => { triggers.on = !triggers.on; store.set('triggers', triggers.on ? '1' : '0'); trigBtn.setAttribute('aria-checked', String(triggers.on)); if (!triggers.on) $('coach').hidden = true; };
$('b-coach').onclick = () => { $('coach').hidden = true; store.set('coach', '1'); };
$('o-how').onclick = () => { closeOpts(); $('how').hidden = false; $('b-go').focus(); };
$('b-go').onclick = () => { $('how').hidden = true; store.set('how', '1'); };
$('err-retry').onclick = () => location.reload();
function showError(title, body) { $('err-title').textContent = title; $('err-body').textContent = body; $('error').hidden = false; }

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
    { event: 'facecontroller.lefteyewinked', process: ({ detail }) => triggers.wink(detail && detail.id) },
    { event: 'facecontroller.righteyewinked', process: ({ detail }) => triggers.wink(detail && detail.id) },
    { event: 'facecontroller.earfound', process: ({ detail }) => { diag.ears[detail.ear] = (diag.ears[detail.ear] || 0) + 1; } },
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
    coordinates: { mirroredDisplay: true },   // a selfie looks like a mirror; photos are saved as seen
    enableEars: true, maxDetections: MAX_FACES,   // friends can squeeze in: each face gets its own set
  });
  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(), XR8.Threejs.pipelineModule(), XR8.FaceController.pipelineModule(), XR8.CanvasScreenshot.pipelineModule(),
    appModule(),
    { name: 'booth-capture', onRender: () => { if (capture) capture.frame(); } },
  ]);
  camLog('run'); postEvent('scan', {});
  setTimeout(() => { if (!camStartAt && !tapCamShown) camFailed('no video after 12 s'); }, 12000);
  XR8.run({ canvas, allowedDevices: XR8.XrConfig.device().ANY, cameraConfig: { direction: XR8.XrConfig.camera().FRONT } });
}
$('b-start').onclick = start;

// camera trouble (the same handling as the other EVADE pages, front camera so no iPhone macro lens)
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

// ---------------------------------------------------------------- photo, strip and video (the Cola Run recorder)
const LOGO = { evade: new Image(), act: new Image() };
LOGO.evade.src = '/brand/evade-logo.webp'; LOGO.act.src = '/activated-merch/media/ar/activated-by.webp';
function drawWatermark(c, Wd, Hd) {
  const u = Math.min(Wd, Hd) / 720, pad = 26 * u;
  if (LOGO.evade.complete && LOGO.evade.naturalWidth) { const h = 44 * u, w = h * LOGO.evade.naturalWidth / LOGO.evade.naturalHeight; c.drawImage(LOGO.evade, pad, pad, w, h); }
  if (LOGO.act.complete && LOGO.act.naturalWidth) { const h = 50 * u, w = h * LOGO.act.naturalWidth / LOGO.act.naturalHeight; c.drawImage(LOGO.act, Wd - pad - w, Hd - pad - h, w, h); }
}
let capture = null, recFrom = 0, shots = 0;
try {
  capture = new ColaCapture({
    canvas, host: document.body, endpoint: location.origin, globeUrl: '/evade/where-is-bobo/', source: PAGE, audioContext: null,
    connectAudio: (dest) => { const m = sound.master; if (!m) return () => {}; m.connect(dest); return () => { try { m.disconnect(dest); } catch (e) { /* gone */ } }; },
    overlay: (c, Wd, Hd) => drawWatermark(c, Wd, Hd),
    on: (name) => { if (name === 'recordStart') { buzz(25); recUi(true); } if (name === 'recordStop' || name === 'error') recUi(false); },
  });
  Object.assign(capture.settings, {
    corner: 'topRight', offsetX: -5, offsetY: -6, accent: '#f6c344', maxSeconds: 30,
    hintText: 'Film your Bobo look and send it to the globe', sendLabel: 'Send to Where is Bobo?',
    sheetTitle: 'Send your clip to the Bobo globe?', keepTitle: 'Keep your clip?', clipTitle: 'Bobo Booth clip', filePrefix: 'bobo-booth', backLabel: 'Back to the booth',
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
async function grab() {   // one frame of camera + wearables as an Image
  const b64 = await XR8.CanvasScreenshot.takeScreenshot();
  const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode(); return img;
}
async function showResult(c, name, title, what) {
  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92));
  const file = new File([blob], name, { type: 'image/jpeg' }), url = URL.createObjectURL(blob);
  $('shot-t').textContent = title; $('shot-img').src = url; $('shot').classList.toggle('strip', what === 'strip');
  $('shot-save').href = url; $('shot-save').download = file.name; $('shot-save').hidden = false;
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
  $('shot-share').hidden = !canShare; $('shot-share').onclick = () => navigator.share({ files: [file], title: 'Bobo Booth' }).catch(() => {});
  $('shot').hidden = false; $('shot-close').focus(); postEvent('share', { what, look: JSON.stringify(wear) });
}
let busy = false;
async function takePhoto() {
  if (busy) return; busy = true;
  try {
    sound.shutter(); buzz(20); flash();
    const img = await grab(), c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0); drawWatermark(g, c.width, c.height);
    await showResult(c, `bobo-booth-${++shots}.jpg`, 'Your Bobo look', 'booth-photo');
  } catch (e) { console.error(e); diag.errors.push('photo: ' + String(e).slice(0, 120)); }
  busy = false;
}
// the photo strip: a 3-2-1 countdown, four shots about 1.6 s apart, laid out like a booth strip
const STRIP_N = 4;
let strip = null;
function stripTick() {
  if (!strip) return;
  const now = performance.now(), left = strip.next - now, n = Math.ceil(left / 1000);
  const label = left > 0 ? String(n) : '';
  if ($('count').textContent !== label) { $('count').textContent = label; if (label) { sound.tick(); buzz(6); } }
  $('strip-dots').innerHTML = Array.from({ length: STRIP_N }, (_, i) => `<i class="${i < strip.frames.length ? 'on' : ''}"></i>`).join('');
  if (left <= 0 && !strip.taking) {
    strip.taking = true; sound.shutter(); buzz(18); flash();
    grab().then((img) => {
      strip.frames.push(img); strip.taking = false;
      if (strip.frames.length >= STRIP_N) finishStrip(); else strip.next = performance.now() + 1600;
    }).catch((e) => { console.error(e); endStrip(); });
  }
}
function startStrip() {
  if (busy || strip) return; busy = true;
  strip = { frames: [], next: performance.now() + 3000, taking: false };
  $('countdown').hidden = false; $('hud').classList.add('counting');
}
function endStrip() { strip = null; busy = false; $('countdown').hidden = true; $('count').textContent = ''; $('hud').classList.remove('counting'); }
async function finishStrip() {
  const frames = strip.frames; endStrip(); busy = true;
  try {
    // 720 wide: four square frames (centre crop of the screen shots), then the EVADE footer. Flat colours only.
    const Wd = 720, M = 28, FW = Wd - M * 2, FH = FW, GAP = 18, FOOT = 230;
    const c = document.createElement('canvas'); c.width = Wd; c.height = M + STRIP_N * FH + (STRIP_N - 1) * GAP + FOOT;
    const g = c.getContext('2d');
    g.fillStyle = '#0f1519'; g.fillRect(0, 0, c.width, c.height);
    frames.forEach((img, i) => {
      const iw = img.naturalWidth, ih = img.naturalHeight, ar = FW / FH;
      let sw = iw, sh = iw / ar; if (sh > ih) { sh = ih; sw = ih * ar; }
      const sx = (iw - sw) / 2, sy = Math.max(0, (ih - sh) * 0.4), y = M + i * (FH + GAP);
      g.fillStyle = '#f6c344'; g.fillRect(M - 4, y - 4, FW + 8, FH + 8);
      g.drawImage(img, sx, sy, sw, sh, M, y, FW, FH);
    });
    const fy = M + STRIP_N * FH + (STRIP_N - 1) * GAP;
    if (LOGO.evade.naturalWidth) { const h = 54, w = h * LOGO.evade.naturalWidth / LOGO.evade.naturalHeight; g.drawImage(LOGO.evade, M, fy + 40, w, h); }
    g.fillStyle = '#f6c344'; g.font = '900 italic 58px "Exo 2", sans-serif'; g.textBaseline = 'top'; g.fillText('BOBO BOOTH', M, fy + 108);
    g.fillStyle = '#b8c2cc'; g.font = '700 22px "Space Grotesk", sans-serif';
    g.fillText(new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }), M, fy + 178);
    if (LOGO.act.naturalWidth) { const h = 70, w = h * LOGO.act.naturalWidth / LOGO.act.naturalHeight; g.drawImage(LOGO.act, Wd - M - w, fy + 130, w, h); }
    busy = false;
    await showResult(c, `bobo-booth-strip-${++shots}.jpg`, 'Your Bobo strip', 'strip');
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

// ---------------------------------------------------------------- Where is Bobo? events (city level, anonymous)
const SID = 'bb-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
function postEvent(type, props) {
  if (params.has('nolog')) return;
  try { fetch('/api/bobo/events', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, source: PAGE, sessionId: SID, props }) }).catch(() => {}); } catch (e) { /* offline */ }
}

// ---------------------------------------------------------------- test log (previews and local dev only, or ?diag)
// Read back with GET /api/ar/kc-diag on a deploy preview (records carry page: 'bobo-booth').
const diag = { page: PAGE, sid: SID, found: 0, lost: 0, fpsN: 0, errors: [], steps: [], ears: {}, trig: {} };
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

// automated tests (?test)
if (params.has('test')) window.__bb = {
  get rig() { return [...rigs.values()][0] || null; },
  get face() { const r = this.rig; return r ? { tracked: r.tracked, live: r.live, s: r.s, earL: r.earL, earR: r.earR, mouth: r.trig.mouth, faces: rigs.size } : { tracked: false }; },
  get mode() { return mode; }, get wear() { return { ...wear }; }, diag, triggers, paintUV: () => paintUV,
  setWear(o) { Object.assign(wear, o); applyWear(false); renderTray(); },
  fire(name) { const r = this.rig; if (!r) return; if (name === 'wink') triggers.wink(r.id); else if (name === 'brows') nextLook(); else if (name === 'mouth') { fizz.burst(r); sound.fizz(); } },
  // screen positions of key points (to check the pieces sit on the face)
  screen() {
    const r = this.rig; if (!r || !r.anchor.visible) return null;
    const pr = (v) => { const p = v.clone().project(camera); return [Math.round((p.x + 1) / 2 * innerWidth), Math.round((1 - p.y) / 2 * innerHeight)]; };
    const out = { bridge: pr(r.worldOf(r.sm.bridge)), tip: pr(r.worldOf(r.sm.tip)), mouth: pr(r.worldOf(r.sm.mouth)), forehead: pr(r.worldOf(r.sm.forehead)) };
    for (const sd of ['l', 'r']) if (r.ears[sd]) out['ear_' + sd] = pr(r.ears[sd].obj.position.clone());
    return out;
  },
  photo: () => takePhoto(), strip: () => startStrip(),
};

// desktop: the webcam works too; a QR offers the phone
if (!TOUCH) {
  $('desk').hidden = false;
  try { window.QRCode && QRCode.toString(location.href, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }, (err, svg) => { if (!err) $('qr').innerHTML = svg; }); } catch (e) { /* no QR */ }
}
