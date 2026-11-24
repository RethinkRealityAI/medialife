// Spray Bobo Enhanced: place 3D pieces in your room (world tracking, 8th Wall engine binary) and paint them in 3D.
//
//   floor  ->  pick (the library)  ->  place (hover on the floor, pinch to size, twist/drag to turn, Place)  ->  paint
//   paint tools: Spray (your phone is the can: aim the ring, hold the screen), Brush + Erase (finger), Fill (tap a
//   part), Stickers (tap to stick). Move (always bottom right once placed) picks the piece up again, paint and all.
//   Undo, nozzle size, colours, paint finish (gloss / matte / chrome / glow), pose for animated pieces, turntable spin.
//   Paint jobs are kept on the phone (IndexedDB, per piece) and come back when you place that piece again.
// Painting is projective and on the GPU (paint.js); the library and paint atlases are in library.js.
// ?nocam = desk test without a camera (own renderer, mouse = finger, arrow keys/drag to look), ?test = window.__se.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ColaCapture } from '/evade/cola-run-lab/assets/capture-core.js';
import { worldHealth } from '/evade/xr/world-health.js';
import { createPainter } from '/evade/spray-bobo-enhanced/paint.js';
import { ASSETS, instance, preload, partName } from '/evade/spray-bobo-enhanced/library.js';

window.THREE = THREE;                          // XR8.Threejs.pipelineModule() looks for a global THREE
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const BRAND = document.documentElement.dataset.brand;
const EVADE = BRAND === 'evade';
const NOCAM = params.has('nocam');
const TEST = params.has('test');
const LIVE_SITE = /(^|\.)medialife\.ai$/i.test(location.hostname);
const SHOW_DIAG = params.has('diag') || /^(localhost$|127\.|deploy-preview-)/.test(location.hostname);
const PHONE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const HERE = '/evade/spray-bobo-enhanced/';
const SOURCE = EVADE ? 'spray-bobo-enhanced' : 'spray-enhanced';
const clamp = THREE.MathUtils.clamp;
const easeOut = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* no haptics */ } };
const store = { get(k, d) { try { const v = localStorage.getItem('sbe-' + k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('sbe-' + k, String(v)); } catch (e) { /* none */ } } };
const CAM_H = 1.3;                             // camera start height: ~1 unit = 1 m on a floor (responsive scale)
const MAX_PIECES = 6;

// ---------------------------------------------------------------- paint settings
const CAPS = EVADE
  ? [['#f6c344', 'EVADE yellow'], ['#3f9be6', 'Bobo blue'], ['#8cc8f8', 'Sky'], ['#e85bd8', 'Magenta'], ['#ff3b4e', 'Red'], ['#ff8a2a', 'Orange'], ['#3ddc84', 'Green'], ['#7a5cff', 'Purple'], ['#ffffff', 'White'], ['#15131a', 'Black']]
  : [['#19afff', 'MEDIALIFE blue'], ['#ff37ae', 'Magenta'], ['#f6c344', 'Yellow'], ['#ff3b4e', 'Red'], ['#ff8a2a', 'Orange'], ['#3ddc84', 'Green'], ['#7a5cff', 'Purple'], ['#8cc8f8', 'Sky'], ['#ffffff', 'White'], ['#15131a', 'Black']];
// nozzle tips: spray half-angle (deg; at 1 m: ~4 / 9 / 18 cm wide), brush radius (m), sticker width (m)
const TIPS = [{ n: 'Skinny', spray: 1.2, brush: 0.006, decal: 0.06, dot: 3 }, { n: 'Medium', spray: 2.6, brush: 0.014, decal: 0.12, dot: 5 }, { n: 'Fat', spray: 5.2, brush: 0.03, decal: 0.22, dot: 8 }];
const FINISH = { gloss: [0.22, 0, 0], matte: [0.92, 0, 0], chrome: [0.1, 1, 0], glow: [0.5, 0, 0.9] };
let tool = 'spray', tip = clamp(+store.get('tip', 1) | 0, 0, 2), cap = clamp(+store.get('cap', 0) | 0, 0, CAPS.length), custom = store.get('custom', '#4fd6e8');
const capHex = () => (cap === CAPS.length ? custom : CAPS[cap][0]);

// ---------------------------------------------------------------- sound (made here, no files)
const sound = {
  ctx: null, on: store.get('sound', '1') === '1', master: null, hiss: null,
  init() {
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)(); this.ctx.resume();
      if (this.master) return;
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      const n = this.ctx.sampleRate * 2, b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const s = this.ctx.createBufferSource(); s.buffer = b; s.loop = true;
      const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2200;
      const bp = this.ctx.createBiquadFilter(); bp.type = 'peaking'; bp.frequency.value = 6500; bp.gain.value = 8;
      const g = this.ctx.createGain(); g.gain.value = 0;
      s.connect(hp).connect(bp).connect(g).connect(this.master); s.start(); this.hiss = g;
    } catch (e) { /* no audio */ }
  },
  spray(level) { if (!this.hiss) return; this.hiss.gain.setTargetAtTime(this.on ? level * 0.16 : 0, this.ctx.currentTime, level ? 0.025 : 0.06); },
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
  click() { this.tone(900, 700, 0.05, 0.06, 'square'); },
  pick() { this.tone(500, 900, 0.1, 0.08, 'triangle'); },
  rattle() { for (let i = 0; i < 3; i++) { const w = i * 0.075; this.tone(2600, 1700, 0.035, 0.06, 'square', w); this.noise(0.04, 0.1, 2000, 7000, w); } },
  thunk() { this.tone(140, 60, 0.12, 0.32, 'triangle'); this.noise(0.06, 0.22, 600, 4000); },
  whoosh() { this.noise(0.3, 0.07, 900, 5000); },
  splat() { this.noise(0.14, 0.2, 200, 2500); this.tone(220, 90, 0.1, 0.12); },
  pour() { this.noise(0.5, 0.12, 300, 2200); this.tone(300, 520, 0.4, 0.05, 'sine'); },
  shutter() { this.noise(0.05, 0.22, 2000, 9000); this.noise(0.07, 0.16, 1200, 6000, 0.08); },
  undo() { this.tone(700, 420, 0.12, 0.08, 'triangle'); },
  rub() { this.noise(0.08, 0.06, 800, 3000); },
};

// ---------------------------------------------------------------- loading
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
const LIB = ASSETS.filter((a) => a.brands.includes(BRAND));
const params0 = params.get('only');                         // ?only=bobo,can for tests
const DECALS = { cats: [], list: [], sel: null };
async function loadDecals() {
  const d = await fetch('/evade/spray-bobo/decals/decals.json').then((r) => r.json());
  DECALS.cats = d.cats.filter((c) => EVADE || c.k !== 'game');
  DECALS.list = d.decals.filter((x) => DECALS.cats.some((c) => c.k === x.cat));
  DECALS.cat = DECALS.cats.find((c) => c.k === 'fun') ? 'fun' : DECALS.cats[0].k;
}
// a sticker as a die-cut texture: a white border all round (like Spray Bobo's stickers)
const decalTex = new Map();
async function stickerTexture(d) {
  if (decalTex.has(d.id)) return decalTex.get(d.id);
  const img = await loadImg('/evade/spray-bobo/decals/' + d.file);
  const iw = img.naturalWidth || 256, ih = img.naturalHeight || 256, k = 440 / Math.max(iw, ih);
  const w = Math.round(iw * k), h = Math.round(ih * k), pad = d.border === false ? 6 : Math.round(Math.max(w, h) * 0.05);
  const c = document.createElement('canvas'); c.width = w + pad * 2; c.height = h + pad * 2; const g = c.getContext('2d');
  if (d.border !== false) {
    const t = document.createElement('canvas'); t.width = w; t.height = h; const tg = t.getContext('2d');
    tg.drawImage(img, 0, 0, w, h); tg.globalCompositeOperation = 'source-in'; tg.fillStyle = '#ffffff'; tg.fillRect(0, 0, w, h);
    for (let a = 0; a < 16; a++) g.drawImage(t, pad + Math.cos(a * 0.3927) * pad * 0.9, pad + Math.sin(a * 0.3927) * pad * 0.9);
  }
  g.drawImage(img, pad, pad, w, h);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = true;
  const out = { tex, aspect: c.width / c.height }; decalTex.set(d.id, out); return out;
}
const xrReady = NOCAM ? Promise.resolve() : new Promise((res) => (window.XR8 ? res() : window.addEventListener('xrloaded', () => res(), { once: true })));
const firstPiece = LIB[0];
const ready = Promise.all([xrReady, loadDecals().catch(() => {}), preload(firstPiece)]);
let loaded = false;
ready.then(() => { loaded = true; $('b-start').disabled = false; $('b-start').textContent = 'Start'; $('load').hidden = true; })
  .catch((e) => showError('Couldn\'t load', String((e && e.message) || e)));
setTimeout(() => { if (!NOCAM && !window.XR8) showError('The AR engine didn\'t load', 'Check your connection and try again.'); }, 30000);
// the rest of the library loads quietly behind the splash (one at a time, so nothing stalls tracking later)
ready.then(async () => { for (const d of LIB) await preload(d); });

// ---------------------------------------------------------------- paint jobs kept on this phone
const DB = { db: null };
function idb() {
  if (DB.db) return Promise.resolve(DB.db);
  return new Promise((res, rej) => {
    try { const r = indexedDB.open('spray-bobo-enhanced', 1); r.onupgradeneeded = () => r.result.createObjectStore('paint'); r.onsuccess = () => { DB.db = r.result; res(r.result); }; r.onerror = () => rej(r.error); } catch (e) { rej(e); }
  });
}
const dbKey = (def) => BRAND + ':' + def.id;
async function dbGet(k) { try { const db = await idb(); return await new Promise((res) => { const q = db.transaction('paint').objectStore('paint').get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); } catch (e) { return null; } }
async function dbPut(k, v) { try { const db = await idb(); db.transaction('paint', 'readwrite').objectStore('paint').put(v, k); } catch (e) { /* private mode */ } }
async function dbDel(k) { try { const db = await idb(); db.transaction('paint', 'readwrite').objectStore('paint').delete(k); } catch (e) { /* none */ } }
const savedIds = new Set();
idb().then((db) => { const q = db.transaction('paint').objectStore('paint').getAllKeys(); q.onsuccess = () => { for (const k of q.result || []) if (String(k).startsWith(BRAND + ':')) savedIds.add(String(k).slice(BRAND.length + 1)); renderLib(); }; }).catch(() => {});

// ---------------------------------------------------------------- scene
let scene, camera, renderer, painter;
const shadows = new THREE.Group();            // contact shadows (never painted, never occlude paint)
const reticle = new THREE.Group();            // where a piece will land
const pieces = [];                            // { def, inst, P, pos, yaw, h, spin, finish, pose, shadow }
let active = null;                            // the piece Move / Options act on
function buildScene(sc, cam, rend) {
  scene = sc; camera = cam; renderer = rend;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping;
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.8;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x5d544a, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(1.5, 4, 2.5); scene.add(sun);
  painter = createPainter(renderer, { res: clamp(+params.get('res') || 1024, 256, 2048) });
  scene.add(painter.world); scene.add(shadows);
  const ringM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 64), ringM), dot = new THREE.Mesh(new THREE.CircleGeometry(0.06, 24), ringM);
  for (const m of [ring, dot]) { m.rotation.x = -Math.PI / 2; m.renderOrder = 3; reticle.add(m); }
  reticle.visible = false; scene.add(reticle);
}
const shadowGeo = new THREE.CircleGeometry(1, 40);
function makeShadow() {
  const m = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 1; shadows.add(m); return m;
}
function setFinish(pc, f) {
  pc.finish = f; const v = FINISH[f] || FINISH.gloss;
  pc.P.u.rough.value = v[0]; pc.P.u.metal.value = v[1]; pc.P.u.glow.value = v[2];
}
function setPose(pc, name) {
  pc.pose = name; const m = pc.inst.mixer; if (!m) return;
  const clip = pc.inst.clips[name];
  const next = clip ? m.clipAction(clip) : null;
  if (pc.act && pc.act !== next) pc.act.fadeOut(0.35);
  if (next) { next.reset().fadeIn(0.35).play(); }
  pc.act = next;
}
function applyTransform(pc, hover = 0) {
  const r = pc.inst.root; r.position.set(pc.pos.x, hover, pc.pos.z); r.rotation.set(0, pc.yaw, 0); r.scale.setScalar(pc.h);
  pc.shadow.position.set(pc.pos.x, 0.002, pc.pos.z); pc.shadow.scale.setScalar(Math.max(0.05, pc.inst.foot * pc.h * 0.95));
  pc.shadow.material.opacity = 0.32 * (1 - clamp(hover / 0.4, 0, 0.7));
}
const busy = { loading: false };
async function newPiece(def) {
  if (busy.loading) return null; busy.loading = true; wh && wh.busy('load ' + def.id);
  try {
    const inst = await instance(def);
    const pc = { def, inst, P: null, pos: new THREE.Vector3(), yaw: 0, h: +store.get('h-' + def.id, def.h) || def.h, spin: false, finish: 'gloss', pose: def.pose || null, act: inst.action, shadow: makeShadow(), saveGen: 0 };
    pc.h = clamp(pc.h, def.range[0], def.range[1]);
    pc.P = painter.makePaintable(inst.root, inst.parts);
    pc.P.piece = pc;
    inst.root.traverse((o) => { o.userData.piece = pc; });
    painter.warm(pc.P, camera);
    const saved = await dbGet(dbKey(def));
    if (saved && saved.png) { try { await painter.fromBlob(pc.P, saved.png); pc.P.gen = 1; pc.saveGen = pc.P.gen; setFinish(pc, saved.finish || 'gloss'); pc.restored = true; } catch (e) { console.warn('restore', e); } }
    else setFinish(pc, 'gloss');
    painter.update();
    return pc;
  } finally { busy.loading = false; wh && wh.busy(false); }
}
function removePiece(pc) {
  savePiece(pc);
  painter.dispose(pc.P); shadows.remove(pc.shadow);
  const i = pieces.indexOf(pc); if (i >= 0) pieces.splice(i, 1);
  strokes.forEach((s) => { s.Ps = s.Ps.filter((P) => P !== pc.P); });
  if (active === pc) active = pieces[pieces.length - 1] || null;
}

// ---------------------------------------------------------------- modes
let mode = 'boot';
function setMode(m) {
  mode = m; $('hud').dataset.mode = m;
  const placed = pieces.length > 0;
  $('b-place').hidden = m !== 'place';
  $('b-cancel').hidden = !(m === 'place' && (placing && (placing.moving || pieces.length)));
  $('b-move').hidden = !(m === 'paint' && placed);
  $('b-remove').hidden = !(m === 'place' && placing && placing.moving);
  $('size').hidden = m !== 'place';
  $('lib-x').hidden = !placed;
  if (m !== 'paint') { endStroke(); }
  if (m === 'pick') { renderLib(); hint(''); }
  if (m === 'paint') { hint(''); syncSpin(); }
  diag.steps.push([m, Math.round(performance.now())]); if (diag.steps.length > 60) diag.steps.shift();
}
function hint(text) { if ($('hint').textContent !== (text || '')) $('hint').textContent = text || ''; }
let toastT = 0;
function toast(text, ms = 1800) { const t = $('toast'); t.textContent = text; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms); }

// ---------------------------------------------------------------- the library tray
function renderLib() {
  const box = $('cards'); box.innerHTML = '';
  for (const def of LIB) {
    if (params0 && !params0.split(',').includes(def.id)) continue;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'card';
    b.setAttribute('aria-label', `${def.name}: ${def.blurb}`);
    b.innerHTML = `<img src="${HERE}thumbs/${def.id}.webp" alt="" width="112" height="112" loading="lazy"><b>${def.name}</b><small>${def.blurb}</small>` + (savedIds.has(def.id) ? '<span class="saved">Your paint</span>' : '');
    b.onclick = () => pickPiece(def);
    box.appendChild(b);
  }
}
$('lib-x').onclick = () => { sound.click(); setMode('paint'); };
let placing = null;                           // { pc, moving, from: {pos, yaw, h} }
async function pickPiece(def) {
  if (pieces.length >= MAX_PIECES) { toast(`Room's full: ${MAX_PIECES} pieces. Remove one first`); return; }
  sound.pick(); hint('Getting it ready…');
  const pc = await newPiece(def);
  if (!pc) return;
  hint('');
  placing = { pc, moving: false };
  pc.pos.copy(reticle.visible ? reticle.position : aheadOnFloor());
  pc.yaw = faceCamYaw(pc.pos);
  setMode('place');
  if (pc.restored) toast('Your last paint job is back');
}
function startMove(pc) {
  if (!pc) return;
  sound.whoosh();
  placing = { pc, moving: true, from: { pos: pc.pos.clone(), yaw: pc.yaw, h: pc.h } };
  setMode('place');
}
function aheadOnFloor() { const d = new THREE.Vector3(); camera.getWorldDirection(d); d.y = 0; d.normalize(); return camera.position.clone().addScaledVector(d, 1.2).setY(0); }
function faceCamYaw(p) { return Math.atan2(camera.position.x - p.x, camera.position.z - p.z); }
const drop = { pc: null, t: -1 };
function placeIt() {
  if (mode !== 'place' || !placing) return;
  const pc = placing.pc;
  if (!reticle.visible && !NOCAM && !TEST_FLOOR.on) return;
  sound.thunk(); buzz(18);
  store.set('h-' + pc.def.id, pc.h.toFixed(3));
  if (!placing.moving) { pieces.push(pc); postEvent('place', { piece: pc.def.id }); }
  active = pc; drop.pc = pc; drop.t = 0; placing = null;
  setMode('paint');
  if (!store.get('how', '')) { store.set('how', '1'); setTimeout(() => { if (mode === 'paint') toast(tool === 'spray' ? 'Aim the ring at it and hold the screen to spray' : 'Paint away', 3200); }, 700); }
}
function cancelPlace() {
  if (!placing) return;
  const pc = placing.pc;
  if (placing.moving) { pc.pos.copy(placing.from.pos); pc.yaw = placing.from.yaw; pc.h = placing.from.h; applyTransform(pc); }
  else { painter.dispose(pc.P); shadows.remove(pc.shadow); }
  placing = null; sound.click();
  setMode(pieces.length ? 'paint' : 'pick');
}
$('b-place').onclick = placeIt;
$('b-cancel').onclick = cancelPlace;
$('b-move').onclick = () => { if (mode === 'paint') startMove(active || pieces[pieces.length - 1]); };
$('b-remove').onclick = () => { if (!placing || !placing.moving) return; const pc = placing.pc; placing = null; removePiece(pc); sound.whoosh(); toast(`${pc.def.name} removed. Its paint is kept`); setMode(pieces.length ? 'paint' : 'pick'); };
$('b-add').onclick = () => { sound.click(); setMode('pick'); };

// ---------------------------------------------------------------- floor (ray from the screen to y = 0, as Bobo Hoops)
const ray = new THREE.Raycaster(), floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3();
const TEST_FLOOR = { on: false };
function tickFloor(dt) {
  const want = mode === 'place' || mode === 'floor' || mode === 'pick';
  if (!want) { reticle.visible = false; return; }
  if (TEST_FLOOR.on) { reticle.visible = true; return; }
  ray.setFromCamera(new THREE.Vector2(0, -0.12), camera);
  let ok = false;
  if (ray.ray.intersectPlane(floorPlane, hitP)) { const d = hitP.distanceTo(camera.position); ok = d > 0.35 && d < 6; }
  if (ok) { if (!reticle.visible) reticle.position.copy(hitP); else reticle.position.lerp(hitP, 1 - Math.exp(-14 * dt)); reticle.position.y = 0.003; }
  reticle.visible = ok && mode === 'place';
  reticle.userData.ok = ok;
}
const settled = () => NOCAM || TEST_FLOOR.on || !wh || wh.settled();
function tickModes(dt, now) {
  if (mode === 'floor') {
    if (!settled()) hint('Hold still a moment…');
    else if (!reticle.userData.ok) hint('Point at the floor');
    else { hint(''); setMode('pick'); }
  }
  if (mode === 'place' && placing) {
    const pc = placing.pc;
    if (reticle.visible) pc.pos.lerp(reticle.position, 1 - Math.exp(-18 * dt));
    pc.pos.y = 0;
    const hover = 0.06 + Math.sin(now / 320) * 0.015;
    applyTransform(pc, hover);
    const r = pc.inst.foot * pc.h * 1.15; reticle.scale.setScalar(Math.max(0.06, r));
    const cm = pc.def.label === 'long' ? Math.round(pc.inst.long * pc.h * 100) + ' cm long' : Math.round(pc.h * 100) + ' cm tall';
    $('size').textContent = `${pc.def.name} · ${cm} · pinch to size, twist to turn`;
    $('b-place').disabled = !(reticle.visible || NOCAM || TEST_FLOOR.on);
    hint(reticle.visible || NOCAM || TEST_FLOOR.on ? '' : 'Point at the floor');
  }
  if (drop.pc) {                              // the landing: a quick drop and squash
    drop.t += dt; const pc = drop.pc, t = drop.t;
    const y = t < 0.18 ? 0.06 * (1 - easeOut(t / 0.18)) : 0;
    applyTransform(pc, y);
    const sq = t < 0.18 ? 1 : 1 - Math.sin(clamp((t - 0.18) / 0.22, 0, 1) * Math.PI) * 0.08;
    pc.inst.root.scale.set(pc.h * (2 - sq), pc.h * sq, pc.h * (2 - sq));
    if (t > 0.42) { applyTransform(pc); drop.pc = null; }
  }
  for (const pc of pieces) {
    if (pc.spin && pc !== drop.pc && (!placing || placing.pc !== pc)) { pc.yaw += dt * 0.7; applyTransform(pc); }
    if (pc.inst.mixer) pc.inst.mixer.update(dt);
  }
  if (placing && placing.pc.inst.mixer && !pieces.includes(placing.pc)) placing.pc.inst.mixer.update(dt);
}

// ---------------------------------------------------------------- painting input
const canvas = $('cam');
const pointers = new Map();
const stroke = { on: false, id: -1, last: null, Ps: null, moved: 0 };
const strokes = [];                           // undo: [{ Ps: [paintables snapshotted] }]
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _up = new THREE.Vector3(), _ndc = new THREE.Vector2();
function ndcOf(x, y) { const r = canvas.getBoundingClientRect(); return _ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1); }
function partsAll() { const a = []; for (const pc of pieces) a.push(...pc.inst.parts); return a; }
function castAt(ndc) {
  ray.setFromCamera(ndc, camera);
  const h = ray.intersectObjects(partsAll(), false)[0];
  return h ? { point: h.point, dist: h.distance, mesh: h.object, pc: h.object.userData.piece } : null;
}
function beginStroke() {
  if (stroke.on) return;
  stroke.on = true; stroke.last = null; stroke.moved = 0;
  const Ps = pieces.map((pc) => pc.P);
  for (const P of Ps) painter.snapshot(P);
  stroke.Ps = Ps; stroke.gen = Ps.map((P) => P.gen);
}
function endStroke() {
  if (!stroke.on) return;
  stroke.on = false; sound.spray(0); $('reticle').classList.remove('on');
  // keep only the pieces this stroke changed (the rest give their snapshot back)
  const changed = [];
  stroke.Ps.forEach((P, i) => { if (P.gen !== stroke.gen[i]) changed.push(P); else { const t = P.undo.pop(); t && t.dispose(); } });
  if (changed.length) { strokes.push({ Ps: changed }); if (strokes.length > 8) strokes.shift(); scheduleSave(); diag.strokes++; }
  syncUndo();
}
function syncUndo() { $('b-undo').disabled = !strokes.length; }
$('b-undo').onclick = () => {
  const s = strokes.pop(); if (!s) return;
  for (const P of s.Ps) painter.undo(P);
  painter.update(); sound.undo(); syncUndo(); scheduleSave();
};
// one stamp along the camera (spray) or through a screen point (brush/erase)
function stampAt(ndc, kind, dt) {
  const h = castAt(ndc);
  if (kind === 'spray') updateReticle(h);
  if (!h) return null;
  if (h.pc) active = h.pc;
  _o.copy(ray.ray.origin); _d.copy(ray.ray.direction);
  _up.set(0, 1, 0).applyQuaternion(camera.quaternion);
  const col = new THREE.Color(capHex());
  if (kind === 'spray') {
    const half = THREE.MathUtils.degToRad(TIPS[tip].spray);
    const rate = 5.5 * clamp(Math.pow(0.55 / Math.max(h.dist, 0.05), 2), 0.35, 6);
    const amt = 1 - Math.exp(-dt * rate);
    // the can's hand wobble: the cone sways a little, so paint builds up softly
    _d.x += (Math.random() - 0.5) * half * 0.25; _d.y += (Math.random() - 0.5) * half * 0.25; _d.normalize();
    painter.stamp({ origin: _o, dir: _d, up: _up, half, mode: tool === 'erase' ? 'eraseSpray' : 'spray', color: col, amt });
  } else {
    const r = TIPS[tip].brush, half = Math.atan(r / Math.max(h.dist, 0.05));
    painter.stamp({ origin: _o, dir: _d, up: _up, half, mode: kind === 'erase' ? 'erase' : 'marker', color: col, amt: 1, hard: 0.18 });
  }
  return h;
}
function updateReticle(h) {
  const el = $('reticle');
  el.classList.toggle('miss', !h);
  if (h) {
    // the ring shows the spray's real footprint where it lands
    const half = THREE.MathUtils.degToRad(TIPS[tip].spray), rM = Math.tan(half) * h.dist;
    const px = (rM / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * h.dist)) * innerHeight * 2;
    el.style.setProperty('--r', clamp(px, 14, 260).toFixed(0) + 'px');
    $('dist').textContent = Math.round(h.dist * 100) + ' cm';
  } else $('dist').textContent = '';
}
let sprayHeld = false;
function onDown(e) {
  if (mode === 'place') { pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); gesture.start(); return; }
  if (mode !== 'paint') return;
  sound.init();
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* old Safari */ }
  if (tool === 'spray') { sprayHeld = true; beginStroke(); sound.rattle(); $('reticle').classList.add('on'); return; }
  if (tool === 'fill') { fillAt(ndcOf(e.clientX, e.clientY)); return; }
  if (tool === 'decal') { decalAt(ndcOf(e.clientX, e.clientY)); return; }
  beginStroke(); stroke.id = e.pointerId; stroke.last = { x: e.clientX, y: e.clientY }; stroke.queue = [[e.clientX, e.clientY]];
}
function onMove(e) {
  const p = pointers.get(e.pointerId); if (!p) return;
  p.x = e.clientX; p.y = e.clientY;
  if (mode === 'place') { gesture.move(); return; }
  if (stroke.on && stroke.id === e.pointerId && (tool === 'brush' || tool === 'erase')) stroke.queue.push([e.clientX, e.clientY]);
}
function onUp(e) {
  pointers.delete(e.pointerId);
  if (mode === 'place') { gesture.start(); return; }
  if (tool === 'spray') { if (!pointers.size) { sprayHeld = false; endStroke(); } return; }
  if (stroke.id === e.pointerId) { flushBrush(1 / 60); endStroke(); stroke.id = -1; }
}
canvas.addEventListener('pointerdown', onDown);
addEventListener('pointermove', onMove);
addEventListener('pointerup', onUp);
addEventListener('pointercancel', onUp);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
// brush: fill the path between finger samples (every ~5 px), a few per frame
function flushBrush(dt) {
  if (!stroke.on || !stroke.queue || !stroke.queue.length) return;
  let n = 0; const steps = [];
  while (stroke.queue.length) {
    const [x, y] = stroke.queue.shift(), l = stroke.last || { x, y };
    const dx = x - l.x, dy = y - l.y, len = Math.hypot(dx, dy), k = Math.max(1, Math.ceil(len / 3));
    for (let i = 1; i <= k; i++) steps.push([l.x + dx * i / k, l.y + dy * i / k]);
    stroke.last = { x, y };
  }
  if (!steps.length && stroke.last) steps.push([stroke.last.x, stroke.last.y]);
  const every = Math.max(1, Math.ceil(steps.length / 32));      // at most ~32 stamps a frame (a stamp is two small passes)
  for (let i = 0; i < steps.length; i += every) { stampAt(ndcOf(steps[i][0], steps[i][1]), tool, dt); n++; }
  if (n) { if (tool === 'erase') { if (Math.random() < 0.3) sound.rub(); } }
}
function fillAt(ndc) {
  const h = castAt(ndc); if (!h) { toast('Tap a piece to fill a part of it'); return; }
  beginStroke();
  painter.fill(h.pc.P, h.mesh, new THREE.Color(capHex()));
  endStroke(); active = h.pc; sound.pour(); buzz(15);
  toast(`Filled ${h.pc.def.name}${/s$/.test(h.pc.def.name) ? '\'' : '\'s'} ${partName(h.mesh)}`);
}
async function decalAt(ndc0) {
  const ndc = ndc0.clone();                   // ndcOf() hands back a shared vector: keep ours across the await
  const d = DECALS.sel; if (!d) { toast('Pick a sticker first'); return; }
  const h = castAt(ndc); if (!h) { toast('Tap a piece to stick it on'); return; }
  const t = await stickerTexture(d);
  ray.setFromCamera(ndc, camera);
  _up.set(0, 1, 0).applyQuaternion(camera.quaternion);
  const w = TIPS[tip].decal * (t.aspect >= 1 ? 1 : t.aspect), half = Math.atan((TIPS[tip].decal / 2) / Math.max(h.dist, 0.05));
  void w;
  beginStroke();
  painter.stamp({ origin: ray.ray.origin.clone(), dir: ray.ray.direction.clone(), up: _up.clone(), half, mode: 'decal', decal: t });
  endStroke(); active = h.pc; sound.splat(); buzz(12);
}
// place mode: pinch = size, twist or one-finger drag = turn
const gesture = {
  base: null,
  start() {
    const pc = placing && placing.pc; if (!pc) return;
    const ps = [...pointers.values()];
    this.base = { h: pc.h, yaw: pc.yaw, ps: ps.map((p) => ({ ...p })), d: ps.length > 1 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0, a: ps.length > 1 ? Math.atan2(ps[1].y - ps[0].y, ps[1].x - ps[0].x) : 0 };
  },
  move() {
    const pc = placing && placing.pc; if (!pc || !this.base) return;
    const ps = [...pointers.values()];
    if (ps.length > 1 && this.base.ps.length > 1) {
      const d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y), a = Math.atan2(ps[1].y - ps[0].y, ps[1].x - ps[0].x);
      pc.h = clamp(this.base.h * d / Math.max(this.base.d, 1), pc.def.range[0], pc.def.range[1]);
      pc.yaw = this.base.yaw - (a - this.base.a);
    } else if (ps.length === 1 && this.base.ps.length === 1) {
      pc.yaw = this.base.yaw + (ps[0].x - this.base.ps[0].x) * 0.012;
    }
  },
};

// tools, tips, colours, stickers
const toolBtns = [...document.querySelectorAll('#tools [data-tool]')];
function setTool(t) {
  endStroke(); tool = t; $('hud').dataset.tool = t;
  for (const b of toolBtns) b.setAttribute('aria-checked', String(b.dataset.tool === t));
  syncTip();
  if (t === 'decal') renderShelf();
}
toolBtns.forEach((b) => (b.onclick = () => { sound.click(); setTool(b.dataset.tool); }));
function syncTip() {
  const T = TIPS[tip]; $('tip-t').textContent = tool === 'decal' ? ['Small', 'Medium', 'Large'][tip] : T.n;
  $('tip-dot').setAttribute('r', String(T.dot));
  $('b-tip').setAttribute('aria-label', `${tool === 'decal' ? 'Sticker size' : 'Nozzle size'}: ${$('tip-t').textContent}. Tap to change`);
  $('b-tip').hidden = tool === 'fill';
}
$('b-tip').onclick = () => { tip = (tip + 1) % TIPS.length; store.set('tip', tip); sound.click(); syncTip(); };
function renderCaps() {
  const box = $('caps'); box.innerHTML = '';
  CAPS.forEach(([c, n], i) => {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', n);
    b.style.setProperty('--cc', c); b.setAttribute('aria-checked', String(i === cap));
    b.onclick = () => { cap = i; store.set('cap', i); sound.click(); renderCaps(); };
    box.appendChild(b);
  });
  // your own colour: the phone's colour picker
  const b = document.createElement('button'); b.type = 'button'; b.className = 'pick'; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', 'Your own colour');
  b.setAttribute('aria-checked', String(cap === CAPS.length)); b.style.setProperty('--cc', custom); b.textContent = '+';
  const inp = document.createElement('input'); inp.type = 'color'; inp.value = custom; inp.setAttribute('aria-label', 'Pick your own colour');
  inp.oninput = () => { custom = inp.value; store.set('custom', custom); cap = CAPS.length; b.style.setProperty('--cc', custom); document.documentElement.style.setProperty('--cap', custom); };
  inp.onchange = () => renderCaps();
  b.onclick = () => { cap = CAPS.length; store.set('cap', cap); };
  b.appendChild(inp); box.appendChild(b);
  document.documentElement.style.setProperty('--cap', capHex());
}
function renderShelf() {
  const cats = $('shelf').querySelector('.scats'), list = $('shelf').querySelector('.slist');
  cats.innerHTML = ''; list.innerHTML = '';
  for (const c of DECALS.cats) {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.textContent = c.n; b.setAttribute('aria-selected', String(c.k === DECALS.cat));
    b.onclick = () => { DECALS.cat = c.k; renderShelf(); }; cats.appendChild(b);
  }
  for (const d of DECALS.list.filter((x) => x.cat === DECALS.cat)) {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', d.name); b.setAttribute('aria-pressed', String(DECALS.sel === d));
    b.innerHTML = `<img src="/evade/spray-bobo/decals/${d.file}" alt="">`;
    b.onclick = () => { DECALS.sel = d; sound.click(); stickerTexture(d); renderShelf(); toast(`Tap a piece to stick on the ${d.name.toLowerCase()}`); };
    list.appendChild(b);
  }
  if (!DECALS.sel) DECALS.sel = DECALS.list.find((x) => x.cat === DECALS.cat) || null;
}
// spin (turntable) for the active piece
function syncSpin() { const pc = active; $('b-spin').setAttribute('aria-pressed', String(!!(pc && pc.spin))); }
$('b-spin').onclick = () => { const pc = active || pieces[pieces.length - 1]; if (!pc) return; pc.spin = !pc.spin; sound.click(); syncSpin(); toast(pc.spin ? `${pc.def.name} is spinning. Paint as it turns` : 'Spin off'); };

// ---------------------------------------------------------------- saving paint jobs (debounced, never mid-stroke)
let saveT = 0;
function scheduleSave() { clearTimeout(saveT); saveT = setTimeout(saveAll, 1600); }
async function savePiece(pc) {
  if (!pc || pc.P.gen === pc.saveGen) return;
  pc.saveGen = pc.P.gen;
  try {
    const png = await painter.toBlob(pc.P);
    await dbPut(dbKey(pc.def), { png, finish: pc.finish, at: Date.now() }); savedIds.add(pc.def.id);
  } catch (e) { console.warn('save', e); }
}
async function saveAll() { if (stroke.on) { scheduleSave(); return; } for (const pc of pieces) await savePiece(pc); }
document.addEventListener('visibilitychange', () => { if (document.hidden) saveAll(); });

// ---------------------------------------------------------------- the frame
const clock = { last: 0 };
let lastTrack = '', limitedSince = 0;
function tick(dt, now) {
  camera.updateMatrixWorld();
  tickFloor(dt); tickModes(dt, now);
  if (mode === 'paint') {
    if (tool === 'spray') {
      const h = sprayHeld ? stampAt(_ndc.set(0, 0), 'spray', dt) : (updateReticle(castAt(_ndc.set(0, 0))), null);
      sound.spray(sprayHeld ? (h ? 1 : 0.6) : 0);
      if (sprayHeld && h) buzz(4);
      if (!sprayHeld) { const hh = castAt(_ndc.set(0, 0)); if (hh && hh.pc) active = hh.pc; }
    } else if (tool === 'brush' || tool === 'erase') flushBrush(dt);
    syncSpin();
  }
  painter.update();
  // world tracking lost for a while: say how to get it back
  if (mode !== 'boot') {
    if (lastTrack === 'LIMITED') { if (!limitedSince) limitedSince = now; if (now - limitedSince > 1500 && mode !== 'floor') hint('Move your phone slowly so it can see the floor again'); }
    else if (limitedSince) { limitedSince = 0; if (/slowly/.test($('hint').textContent)) hint(''); }
  }
  if (SHOW_DIAG && now - (diag.drawAt || 0) > 500) drawDiag(now);
}

// ---------------------------------------------------------------- options
function segInit(id, cur, fn) {
  const el = $(id), bs = [...el.querySelectorAll('button')];
  const set = (v) => { for (const b of bs) b.setAttribute('aria-checked', String(b.dataset.v === v)); };
  set(cur); bs.forEach((b) => (b.onclick = () => { set(b.dataset.v); fn(b.dataset.v); sound.click(); }));
  return set;
}
const setFinishSeg = segInit('seg-finish', 'gloss', (v) => { const pc = active; if (!pc) return; setFinish(pc, v); pc.saveGen = -1; scheduleSave(); });
const optsEl = $('opts');
function openOpts() {
  const pc = active || pieces[pieces.length - 1];
  $('o-for').innerHTML = pc ? `For <b>${pc.def.name}</b> (the piece you last aimed at)` : 'Place a piece to see its options';
  $('row-finish').hidden = !pc; $('o-fresh').hidden = !pc;
  if (pc) setFinishSeg(pc.finish);
  const poses = pc && pc.inst.mixer ? (pc.def.poses || []).filter((n) => pc.inst.clips[n]) : [];
  $('row-pose').hidden = !poses.length;
  if (poses.length) {
    const seg = $('seg-pose'); seg.innerHTML = '';
    for (const n of ['Still', ...poses]) { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.v = n; b.textContent = n.replace(/([a-z])([A-Z])/g, '$1 $2'); seg.appendChild(b); }
    segInit('seg-pose', pc.pose || 'Still', (v) => setPose(pc, v === 'Still' ? null : v));
  }
  optsEl.hidden = false; $('b-opts').setAttribute('aria-expanded', 'true'); optsEl.querySelector('.x').focus();
}
function closeOpts() { optsEl.hidden = true; $('b-opts').setAttribute('aria-expanded', 'false'); $('b-opts').focus(); }
$('b-opts').onclick = openOpts;
optsEl.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeOpts));
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !optsEl.hidden) closeOpts(); });
const soundBtn = $('o-sound'); soundBtn.setAttribute('aria-checked', String(sound.on));
soundBtn.onclick = () => { sound.on = !sound.on; store.set('sound', sound.on ? '1' : '0'); soundBtn.setAttribute('aria-checked', String(sound.on)); sound.click(); };
$('o-fresh').onclick = () => {
  const pc = active; if (!pc) return; closeOpts();
  painter.snapshot(pc.P); strokes.push({ Ps: [pc.P] }); painter.clear(pc.P); painter.update(); syncUndo();
  pc.saveGen = -1; dbDel(dbKey(pc.def)); savedIds.delete(pc.def.id); sound.whoosh(); toast(`Fresh coat on ${pc.def.name}. Undo brings it back`);
};
$('o-clear').onclick = () => { closeOpts(); for (const pc of [...pieces]) removePiece(pc); strokes.length = 0; syncUndo(); setMode('pick'); };
$('o-how').onclick = () => { closeOpts(); $('how').hidden = false; $('b-go').focus(); };
$('b-go').onclick = () => { $('how').hidden = true; };
function showError(title, body) { $('err-title').textContent = title; $('err-body').textContent = body; $('error').hidden = false; diag.errors.push(`${title}: ${body}`.slice(0, 200)); }
$('err-retry').onclick = () => location.reload();

// ---------------------------------------------------------------- photo + video (shutter bottom centre)
const LOGO = {}; loadImg(EVADE ? '/brand/evade-logo.webp' : '/brand/medialife-wordmark.webp').then((i) => (LOGO.brand = i)).catch(() => {}); loadImg('/activated-merch/media/ar/activated-by.webp').then((i) => (LOGO.act = i)).catch(() => {});
function drawWatermark(c, W, H) {
  const pad = Math.round(Math.min(W, H) * 0.035);
  if (LOGO.brand) { const h = Math.round(Math.min(W, H) * (EVADE ? 0.06 : 0.04)), w = h * LOGO.brand.naturalWidth / LOGO.brand.naturalHeight; c.drawImage(LOGO.brand, pad, pad, w, h); }
  if (LOGO.act) { const h = Math.round(Math.min(W, H) * 0.07), w = h * LOGO.act.naturalWidth / LOGO.act.naturalHeight; c.drawImage(LOGO.act, W - pad - w, H - pad - h, w, h); }
}
let capture = null, recFrom = 0, shots = 0;
try {
  capture = new ColaCapture({
    canvas, host: document.body, endpoint: location.origin, globeUrl: '/evade/where-is-bobo/', source: SOURCE, audioContext: null,
    connectAudio: (dest) => { const m = sound.master; if (!m) return () => {}; m.connect(dest); return () => { try { m.disconnect(dest); } catch (e) { /* gone */ } }; },
    overlay: (c, W, H) => drawWatermark(c, W, H),
    on: (name) => { if (name === 'recordStart') { buzz(25); recUi(true); } if (name === 'recordStop' || name === 'error') recUi(false); },
  });
  Object.assign(capture.settings, {
    corner: 'topRight', accent: EVADE ? '#f6c344' : '#19afff', maxSeconds: 30, sendEnabled: EVADE,
    hintText: 'Film your paint job', sendLabel: 'Send to Where is Bobo?', sheetTitle: 'Send your clip to the Bobo globe?', keepTitle: 'Keep your clip?',
    clipTitle: EVADE ? 'Spray Bobo Enhanced clip' : 'Spray Enhanced clip', filePrefix: SOURCE, backLabel: 'Back to painting',
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
async function takePhoto() {
  try {
    sound.shutter(); buzz(20);
    const fl = $('flashw'); fl.classList.add('on'); setTimeout(() => fl.classList.remove('on'), 60);
    let src;
    if (NOCAM) { renderNocam(); src = canvas.toDataURL('image/jpeg', 0.92); }
    else src = 'data:image/jpeg;base64,' + await XR8.CanvasScreenshot.takeScreenshot();
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext('2d');
    g.drawImage(img, 0, 0); drawWatermark(g, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92));
    const name = `${SOURCE}-${++shots}.jpg`, file = new File([blob], name, { type: 'image/jpeg' }), url = URL.createObjectURL(blob);
    $('shot-img').src = url; $('shot-save').href = url; $('shot-save').download = name;
    const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
    $('shot-share').hidden = !canShare; $('shot-share').onclick = () => navigator.share({ files: [file], title: 'My paint job' }).catch(() => {});
    $('shot').hidden = false; postEvent('photo', {});
  } catch (e) { console.error(e); }
}
const HOLD_MS = 320; let holding = false, holdT = 0;
const sh = $('b-shutter');
sh.addEventListener('contextmenu', (e) => e.preventDefault());
sh.addEventListener('pointerdown', (e) => {
  if (e.button > 0) return; if (capture && capture.status === 'recording') { holding = false; return; }
  holding = true; try { sh.setPointerCapture(e.pointerId); } catch (err) { /* old Safari */ }
  clearTimeout(holdT); holdT = setTimeout(() => { if (holding && capture && !NOCAM) capture.start(); }, HOLD_MS);
});
sh.addEventListener('pointerup', () => {
  if (capture && capture.status === 'recording') { holding = false; clearTimeout(holdT); capture.stop(); return; }
  if (!holding) return; holding = false; clearTimeout(holdT); takePhoto();
});
sh.addEventListener('pointercancel', () => { holding = false; clearTimeout(holdT); if (capture && capture.status === 'recording') capture.stop(); });
sh.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); takePhoto(); } });
$('shot-close').onclick = () => { $('shot').hidden = true; };

// ---------------------------------------------------------------- 8th Wall pipeline
let wh = null, camStartAt = 0, built = false;
const appModule = () => ({
  name: 'spray-bobo-enhanced',
  onStart: () => {
    const { scene: s, camera: c, renderer: r } = XR8.Threejs.xrScene();
    c.position.set(0, CAM_H, 0); c.quaternion.identity();
    XR8.XrController.updateCameraProjectionMatrix({ origin: c.position, facing: c.quaternion });
    buildScene(s, c, r); built = true; $('hud').hidden = false; setMode('floor');
  },
  onUpdate: ({ processCpuResult }) => {
    const now = performance.now(); const dt = Math.min((now - (clock.last || now)) / 1000, 0.05); clock.last = now;
    const rr = processCpuResult && processCpuResult.reality; if (rr && rr.trackingStatus) noteTracking(rr.trackingStatus, rr.trackingReason);
    if (built) { diag.fpsN++; tick(dt, now); } recTick();
  },
  onCameraStatusChange: ({ status }) => {
    diag.steps.push(['cam:' + status, Math.round(performance.now())]);
    if (status === 'hasVideo') { camStartAt = performance.now(); $('splash').classList.add('gone'); setTimeout(() => { $('splash').hidden = true; }, 600); }
    if (status === 'requesting') hint('Allow camera and motion access to begin');
    if (status === 'failed') camFailed('failed');
  },
  onException: (e) => {
    const msg = String((e && e.message) || (typeof e === 'object' ? JSON.stringify(e) : e));
    diag.errors.push('XR: ' + msg.slice(0, 200));
    if (!camStartAt && /session manager|not supported|unsupported|device/i.test(msg)) return openOnPhone();
    if (e && e.type === 'permission') return showError('Motion access is needed', 'This uses your phone\'s motion sensors to keep your pieces on the floor. Allow motion and orientation access (on iPhone, tap Allow when asked), then try again.');
    showError('Something went wrong', msg);
  },
  listeners: [{ event: 'reality.trackingstatus', process: ({ detail }) => noteTracking(detail.status, detail.reason) }],
});
function noteTracking(st, why) { if (st !== lastTrack) { lastTrack = st; diag.tracking.push([st + (why && why !== 'UNSPECIFIED' ? ' ' + why : ''), Math.round(performance.now())]); if (diag.tracking.length > 30) diag.tracking.shift(); } }
async function askMotion() {   // iOS: motion permission must be asked inside the tap
  try { if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') await DeviceMotionEvent.requestPermission(); } catch (e) { /* the engine asks again */ }
}
async function start() {
  if (!loaded) return;
  $('b-start').disabled = true; $('b-start').textContent = 'Starting…';
  sound.init(); capture && capture.configure({ audioContext: sound.ctx });
  renderCaps(); syncTip(); setTool('spray');
  if (NOCAM) return startNocam();
  await askMotion();
  wh = worldHealth({ page: SOURCE, canvas, baseDpr: 1.5, post: SHOW_DIAG && !params.has('nolog') && !LIVE_SITE, extra: () => ({ mode, pieces: pieces.map((p) => p.def.id), strokes: diag.strokes, errors: diag.errors.slice(-5), steps: diag.steps.slice(-20), note: params.get('note') || '' }) });
  wh.sizeCanvas(); addEventListener('resize', () => wh.sizeCanvas()); addEventListener('orientationchange', () => setTimeout(() => wh.sizeCanvas(), 300));
  XR8.XrController.configure({ disableWorldTracking: false, scale: 'responsive' });
  XR8.addCameraPipelineModules([XR8.GlTextureRenderer.pipelineModule(), XR8.Threejs.pipelineModule(), XR8.XrController.pipelineModule(), XR8.CanvasScreenshot.pipelineModule(), wh.module, appModule(), { name: 'sbe-capture', onRender: () => { if (capture) capture.frame(); } }]);
  postEvent('scan', {});
  setTimeout(() => { if (!camStartAt) camFailed('no video after 15 s'); }, 15000);
  XR8.run({ canvas, allowedDevices: params.has('desktop') ? XR8.XrConfig.device().ANY : XR8.XrConfig.device().MOBILE_AND_HEADSETS, cameraConfig: { direction: XR8.XrConfig.camera().BACK }, verbose: params.has('verbose') });
}
$('b-start').onclick = start;
function camFailed(why) {
  if (camStartAt || diag.camFailed) return; diag.camFailed = why;
  showError('The camera didn\'t start', 'Allow camera and motion access for this site, close the Camera app or other tabs that use the camera, then tap Try again. A laptop can\'t run this one: open it on your phone.');
}

// ---------------------------------------------------------------- desk test (?nocam): no camera, a floor, the mouse is your finger
let nocamR = null;
function renderNocam() { nocamR.render(scene, camera); }
function startNocam() {
  const STUDIO = params.has('studio');        // thumbnails and splash renders: no floor, transparent
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: STUDIO });
  const sc = new THREE.Scene(); if (!STUDIO) sc.background = new THREE.Color(0x3a4048);
  const cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.02, 50);
  cam.position.set(0, 1.05, 0.15); cam.lookAt(0, 0.28, -1.1);
  const size = () => { r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); };
  size(); addEventListener('resize', size);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ color: 0x8b8478, roughness: 0.95 })); floor.rotation.x = -Math.PI / 2; if (!STUDIO) sc.add(floor);
  const grid = new THREE.GridHelper(12, 24, 0x6f6a61, 0x6f6a61); grid.position.y = 0.001; if (!STUDIO) sc.add(grid);
  buildScene(sc, cam, r); nocamR = r; built = true; if (STUDIO) { shadows.visible = false; document.body.style.background = 'transparent'; document.documentElement.style.background = 'transparent'; }
  $('splash').classList.add('gone'); setTimeout(() => { $('splash').hidden = true; }, 600);
  $('hud').hidden = false; setMode('floor');
  // look around: arrow keys, or drag with the right mouse button
  const look = { yaw: 0, pitch: -0.55 };
  const applyLook = () => { cam.quaternion.setFromEuler(new THREE.Euler(look.pitch, look.yaw, 0, 'YXZ')); };
  applyLook();
  addEventListener('keydown', (e) => {
    const k = { ArrowLeft: [0.05, 0], ArrowRight: [-0.05, 0], ArrowUp: [0, 0.04], ArrowDown: [0, -0.04] }[e.key];
    if (k) { look.yaw += k[0]; look.pitch = clamp(look.pitch + k[1], -1.4, 0.6); applyLook(); }
    if (e.key === 'w' || e.key === 's') { const d = new THREE.Vector3(); cam.getWorldDirection(d); d.y = 0; d.normalize(); cam.position.addScaledVector(d, e.key === 'w' ? 0.08 : -0.08); }
  });
  canvas.addEventListener('mousemove', (e) => { if (e.buttons & 2) { look.yaw -= e.movementX * 0.004; look.pitch = clamp(look.pitch - e.movementY * 0.004, -1.4, 0.6); applyLook(); } });
  window.__look = look; window.__applyLook = applyLook;
  const loop = (t) => { const dt = Math.min((t - (clock.last || t)) / 1000, 0.05); clock.last = t; diag.fpsN++; tick(dt, t); r.render(sc, cam); recTick(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- events (EVADE: the Where is Bobo? globe, city level, anonymous)
const SID = 'sbe-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
function postEvent(type, props) {
  if (params.has('nolog') || NOCAM || !EVADE) return;
  try { fetch('/api/bobo/events', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, source: SOURCE, sessionId: SID, props }) }).catch(() => {}); } catch (e) { /* offline */ }
}
const diag = { page: SOURCE, fpsN: 0, strokes: 0, errors: [], steps: [], tracking: [] };
addEventListener('error', (e) => { diag.errors.push(String(e.message).slice(0, 200)); });
function drawDiag(now) {
  diag.drawAt = now; const el = $('diagp'); el.hidden = false;
  const fps = wh ? wh.fps : 0;
  el.textContent = `${mode} · ${tool} · track ${lastTrack || '-'} · fps ${Math.round(fps)} · dpr ${wh ? wh.dpr : '-'}\npieces ${pieces.map((p) => p.def.id).join(',') || '-'} · strokes ${diag.strokes}` + (diag.errors.length ? `\nerr: ${diag.errors.slice(-1)[0].slice(0, 60)}` : '');
}

// desktop: a QR to open it on the phone
function qrInto(el) { try { window.QRCode && QRCode.toString(location.href, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }, (err, svg) => { if (!err) el.innerHTML = svg; }); } catch (e) { /* no QR */ } }
if (!PHONE && !NOCAM) { $('desk').hidden = false; qrInto($('qr')); }
function openOnPhone() {
  try { window.XR8 && XR8.stop(); } catch (e) { /* already stopped */ }
  $('err-title').textContent = 'Open it on your phone';
  $('err-body').textContent = 'This device can\'t put things in your room. Scan the code with your phone\'s camera to paint there.';
  $('err-qr').hidden = false; qrInto($('err-qr')); $('err-retry').hidden = true; $('error').hidden = false;
  $('splash').hidden = false; $('splash').classList.remove('gone');
}

// ---------------------------------------------------------------- test hooks (?test)
if (TEST) window.__se = {
  get mode() { return mode; }, get tool() { return tool; }, get pieces() { return pieces.map((p) => ({ id: p.def.id, gen: p.P.gen, h: p.h, pos: p.pos.toArray() })); },
  diag, painter: () => painter, camera: () => camera, scene: () => scene, renderer: () => renderer,
  floor() { TEST_FLOOR.on = true; reticle.visible = true; if (mode === 'floor') setMode('pick'); },
  floorAt(dx, dz) { TEST_FLOOR.on = true; const d = new THREE.Vector3(); camera.getWorldDirection(d); d.y = 0; d.normalize(); reticle.position.set(camera.position.x + d.x * dz - d.z * dx, 0.003, camera.position.z + d.z * dz + d.x * dx); reticle.visible = true; if (placing) placing.pc.pos.copy(reticle.position).setY(0); },
  pick: (id) => pickPiece(LIB.find((d) => d.id === id) || ASSETS.find((d) => d.id === id)),
  place: placeIt, setTool, setTip: (i) => { tip = i; syncTip(); }, setCap: (i) => { cap = i; renderCaps(); },
  setH(h) { if (placing) placing.pc.h = h; }, setYaw(y) { if (placing) placing.pc.yaw = y; },
  lookAt(x, y, z) { camera.lookAt(x, y, z); camera.updateMatrixWorld(); if (window.__look) { const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ'); window.__look.pitch = e.x; window.__look.yaw = e.y; } },
  camAt(x, y, z) { camera.position.set(x, y, z); camera.updateMatrixWorld(); },
  sprayStart() { sprayHeld = true; beginStroke(); }, sprayStop() { sprayHeld = false; endStroke(); },
  async fillScreen(x, y) { fillAt(ndcOf(x, y)); }, async decalScreen(x, y, id) { DECALS.sel = DECALS.list.find((d) => d.id === id) || DECALS.list[0]; await decalAt(ndcOf(x, y)); },
  brush(points) { beginStroke(); stroke.id = 99; stroke.last = null; stroke.queue = points.slice(); flushBrush(1 / 60); endStroke(); stroke.id = -1; },
  undo: () => $('b-undo').click(), pose: (n) => active && setPose(active, n), finish: (f) => active && setFinish(active, f), spin: () => $('b-spin').click(),
  move: () => $('b-move').click(), cancel: cancelPlace, save: saveAll, clear: () => $('o-clear').click(), pc: (i) => pieces[i], THREE, get active() { return active && active.def.id; },
};
