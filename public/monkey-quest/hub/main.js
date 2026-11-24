// Hypergalactic Monkey Quest Hub: one experience on the Monkey Quest enamel pin, two modes chosen from a
// "Choose Your Experience" menu inside the same camera session (no page change, no engine restart):
//
//   spray   Spray the Pin. The pin is found (image target), a scan line sweeps it, the real pin turns into a dark
//           cut-out and the 3D pin (Blender, traced from Dapo's photo) pops off it and hovers, with the 3D logo beside
//           the monkey's head. Aim the middle of the screen, hold anywhere to spray (phone = spray can). Paint goes
//           onto the 3D pin itself (projective GPU painter, paint.js from Spray Bobo Enhanced).
//   launch  Launch It. Same pop-out, then "Launch It": the pin leaves the print, grows, you point at the floor, pinch
//           to size, Place: a giant pin hovers over your floor with the 3D logo beside the head. Tap the monkey (hop
//           and spin) or the logo (spin + stars). Move is always on screen once placed and keeps the paint.
//
// ONE ENGINE: 8th Wall's distributed engine binary runs the image target and SLAM together (Bobo Hoops pattern), so
// the handoff is "take the pin's world transform off the print and keep animating it in world space".
// The painted pin lives in the painter's own scene (painter.world, added to the AR scene); a proxy Object3D carries
// its pose (on the print or in the room) and the pin copies the proxy's world matrix every frame. Paint stays on the
// pin across modes: spray it, then launch it.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createPainter } from './paint.js?v=1';
import { ColaCapture } from '/evade/cola-run-lab/assets/capture-core.js';

window.THREE = THREE;                         // XR8.Threejs.pipelineModule() looks for a global THREE

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const BASE = '/monkey-quest/hub/';
const LIVE_SITE = /(^|\.)medialife\.ai$/i.test(location.hostname);
const SHOW_DIAG = params.has('diag') || /^(localhost$|127\.|deploy-preview-)/.test(location.hostname);
// phones and tablets only: a touchscreen laptop is NOT a phone (the engine refuses it with "No valid session manager")
const PHONE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const easeOut = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
const easeInOut = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const easeOutBack = (x) => { x = clamp(x, 0, 1); const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* no haptics */ } };
const store = { get(k, d) { try { const v = localStorage.getItem('mq-hub-' + k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('mq-hub-' + k, String(v)); } catch (e) { /* none */ } } };
const track = (n, p) => { try { if (window.ARTrack && !params.has('nolog')) ARTrack.event(n, p); } catch (e) { /* none */ } };

// ---------------------------------------------------------------- the pin (metres of the real pin)
// Traced from Dapo's photo (scripts/build-monkey-quest/). ASSUMED 50 mm tall (43.3 mm wide): confirm with the real pin.
const PIN = { w: 0.04325, h: 0.050 };
const FRAME_H = 0.05767;                      // the target picture's 3:4 frame (pin padded top and bottom), metres
const LOGO_W = 0.062;                         // the 3D logo beside the head, in pin metres
const LOGO_AT = new THREE.Vector3(-0.05, 0.02, 0.012);
const NOZZLES = [{ id: 'fine', label: 'Fine', r: 0.0022, dot: 3 }, { id: 'medium', label: 'Medium', r: 0.0045, dot: 5 }, { id: 'wide', label: 'Wide', r: 0.008, dot: 8 }];
const CAPS = [
  { n: 'Monkey red', c: '#e3283a' }, { n: 'Quest gold', c: '#ffc21f' }, { n: 'Peach', c: '#f2a27a' }, { n: 'Galaxy blue', c: '#2f80e0' },
  { n: 'Nebula purple', c: '#7a4ae0' }, { n: 'Alien green', c: '#38d16a' }, { n: 'Cosmic pink', c: '#ff6fb3' }, { n: 'White', c: '#ffffff' }, { n: 'Black', c: '#16141c' },
];
const SIZE_MIN = 0.25, SIZE_MAX = 1.5;        // world mode: the pin's height on your floor
let worldH = clamp(+store.get('size', 0.6) || 0.6, SIZE_MIN, SIZE_MAX);
const CAM_H = 1.3;

// ---------------------------------------------------------------- sound (made here, no files)
const sound = {
  ctx: null, on: store.get('sound', '1') === '1', master: null, hiss: null,
  init() {
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)(); this.ctx.resume();
      if (!this.master) { this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination); }
    } catch (e) { /* no audio */ }
  },
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
  // the spray can: a looping hiss while you hold
  spray(on) {
    if (!this.ctx) return;
    if (on && this.on && !this.hiss) {
      const n = this.ctx.sampleRate, b = this.ctx.createBuffer(1, n, n), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const s = this.ctx.createBufferSource(); s.buffer = b; s.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 5200; f.Q.value = 0.7;
      const g = this.ctx.createGain(); g.gain.value = 0.0001; g.gain.exponentialRampToValueAtTime(0.09, this.ctx.currentTime + 0.05);
      s.connect(f).connect(g).connect(this.master); s.start(); this.hiss = { s, g };
    } else if (!on && this.hiss) {
      const h = this.hiss; this.hiss = null;
      try { h.g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.08); h.s.stop(this.ctx.currentTime + 0.1); } catch (e) { /* gone */ }
    }
  },
  scan() { for (let i = 0; i < 6; i++) this.tone(1500 + i * 120, 1500 + i * 120, 0.05, 0.03, 'square', i * 0.11); },
  pop() { this.tone(240, 900, 0.16, 0.12, 'triangle'); this.noise(0.12, 0.08, 1500, 8000); },
  zing() { this.tone(660, 1320, 0.18, 0.06, 'triangle'); this.tone(990, 1980, 0.18, 0.04, 'sine', 0.08); },
  grow() { this.tone(160, 640, 1.1, 0.09, 'sawtooth'); this.noise(1.1, 0.05, 400, 3000); },
  thud() { this.tone(120, 40, 0.35, 0.3, 'sine'); this.noise(0.25, 0.14, 60, 900); },
  boing() { this.tone(180, 520, 0.12, 0.12, 'sine'); this.tone(520, 260, 0.3, 0.08, 'sine', 0.12); },
  stars() { [1047, 1319, 1568, 2093].forEach((f, i) => this.tone(f, f, 0.12, 0.05, 'triangle', i * 0.06)); },
  shake() { for (let i = 0; i < 3; i++) this.tone(900, 700, 0.04, 0.05, 'square', i * 0.07); },
  click() { this.tone(1200, 900, 0.05, 0.05, 'triangle'); },
  shutter() { this.noise(0.05, 0.22, 2000, 9000); this.noise(0.07, 0.16, 1200, 6000, 0.08); },
};

// ---------------------------------------------------------------- loading
const getJson = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(r.status + ' ' + u); return r.json(); });
const gl = new GLTFLoader();
const assets = Promise.all([
  getJson(BASE + 'targets/mq-pin.json'),
  gl.loadAsync(BASE + 'models/pin.glb'),
  gl.loadAsync(BASE + 'models/logo.glb'),
  new Promise((res, rej) => new THREE.TextureLoader().load(BASE + 'art/pin-silhouette.png', res, undefined, rej)),
]).then(([tdata, pin, logo, silTex]) => ({ tdata, pin, logo, silTex }));
const xrReady = new Promise((res) => (window.XR8 ? res() : window.addEventListener('xrloaded', () => res(), { once: true })));
let loaded = false;
Promise.all([assets, xrReady]).then(() => { loaded = true; $('b-start').disabled = false; $('b-start').textContent = 'Start'; $('load').hidden = true; })
  .catch((e) => showError('Couldn\'t load the Monkey Quest Hub', String((e && e.message) || e)));
setTimeout(() => { if (!window.XR8) showError('The AR engine didn\'t load', 'Check your connection and try again.'); }, 30000);

// ---------------------------------------------------------------- the splash: the 3D logo and pin, live
const hero = { r: null, raf: 0 };
assets.then(({ pin, logo }) => {
  if (!$('splash') || $('splash').hidden) return;
  try {
    const cv = $('hero3d'), r = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.NeutralToneMapping;
    const sc = new THREE.Scene(), pm = new THREE.PMREMGenerator(r);
    sc.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; sc.environmentIntensity = 0.9;
    const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(1, 2, 3); sc.add(sun, new THREE.HemisphereLight(0xffffff, 0x223366, 0.8));
    const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
    const L = logo.scene.clone(true), P = pin.scene.clone(true);
    const lg = new THREE.Group(), pg = new THREE.Group(); lg.add(L); pg.add(P); sc.add(lg, pg);
    L.scale.setScalar(1 / 0.108); P.scale.setScalar(0.62 / 0.0507);        // logo 1 unit wide, pin 0.62 tall
    const LY = innerWidth < innerHeight ? -0.36 : 0.32, PY = innerWidth < innerHeight ? 0.3 : -0.33;   // phones: the logo sits right above "Hub"
    lg.position.set(0, LY, 0); pg.position.set(0.02, PY, -0.1);
    const fit = () => {
      const w = cv.clientWidth || 300, h = cv.clientHeight || 300; r.setSize(w, h, false); cam.aspect = w / h;
      const need = Math.max(1.15 / (2 * Math.tan(THREE.MathUtils.degToRad(15)) * cam.aspect), 1.35 / (2 * Math.tan(THREE.MathUtils.degToRad(15))));
      cam.position.set(0, 0, need); cam.updateProjectionMatrix();
    };
    fit(); addEventListener('resize', fit);
    const t0 = performance.now();
    const loop = () => {
      const t = (performance.now() - t0) / 1000;
      lg.rotation.y = Math.sin(t * 0.7) * 0.28; lg.rotation.x = Math.sin(t * 0.5) * 0.06; lg.position.y = LY + Math.sin(t * 1.3) * 0.015;
      pg.rotation.y = REDUCED ? 0.3 : Math.sin(t * 0.9) * 0.6; pg.rotation.z = Math.sin(t * 1.1) * 0.06; pg.position.y = PY + Math.sin(t * 1.6 + 1) * 0.02;
      r.render(sc, cam); hero.raf = requestAnimationFrame(loop);
    };
    loop(); hero.r = r;
    setTimeout(() => { cv.classList.add('on'); $('hero-flat').classList.add('off'); }, 60);
  } catch (e) { console.warn('hero', e); }
}).catch(() => {});
function stopHero() {
  cancelAnimationFrame(hero.raf);
  if (hero.r) { try { hero.r.dispose(); hero.r.forceContextLoss(); } catch (e) { /* gone */ } hero.r = null; }
}

// ---------------------------------------------------------------- scene
let scene, camera, renderer, painter = null, paintP = null;
const A = new THREE.Group();                  // follows the pin picture (children in metres of the real pin)
const proxy = new THREE.Object3D();           // the 3D pin's pose: in A on the print, in the scene in the room
const pinRoot = new THREE.Group();            // the painted pin (in painter.world), copies proxy.matrixWorld
const logoG = new THREE.Group();              // the 3D logo beside the head (child of the proxy)
let pinModel = null, logoModel = null, sil = null, silRim = null, scanBar = null, pinMeshes = [], logoMeshes = [];
const reticle = new THREE.Group();
const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
const dust = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffc21f, transparent: true, opacity: 0, depthWrite: false }));
const starsFx = [];
const placed = { pos: new THREE.Vector3(), yaw: 0, s: 1 };   // world mode: floor point, facing, world units per pin metre

const scanClip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
const _m3 = new THREE.Matrix3();
function setScanCut(k) {                       // k: 0 = nothing of the cut-out, 1 = all of it (fraction of the pin's height)
  const local = new THREE.Plane(new THREE.Vector3(0, -1, 0), (k - 0.5) * PIN.h + (k >= 1 ? 1 : 0));
  A.updateMatrixWorld(true); scanClip.copy(local).applyMatrix4(A.matrixWorld, _m3.getNormalMatrix(A.matrixWorld));
}

function buildScene(xr, data) {
  ({ scene, camera, renderer } = xr);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.localClippingEnabled = true;
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.85;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x44506a, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(1.5, 4, 3); scene.add(sun);
  camera.position.set(0, CAM_H, 0); camera.quaternion.identity();
  XR8.XrController.updateCameraProjectionMatrix({ origin: camera.position, facing: camera.quaternion });
  scene.add(A); A.visible = false;
  // the cut-out the pin leaves in the print: navy silhouette + a pulsing gold rim, revealed under the scan line
  const silM = (col) => new THREE.MeshBasicMaterial({ map: data.silTex, color: col, transparent: true, alphaTest: 0.5, depthWrite: false, clippingPlanes: [scanClip] });
  data.silTex.colorSpace = THREE.SRGBColorSpace;
  const q = new THREE.PlaneGeometry(1, 1);
  sil = new THREE.Mesh(q, silM(0x0b1630)); sil.scale.set(PIN.w, PIN.h, 1); sil.position.z = 0.0004; sil.renderOrder = 3;
  silRim = new THREE.Mesh(q, silM(0xffc21f)); silRim.scale.set(PIN.w * 1.08, PIN.h * 1.07, 1); silRim.position.z = 0.0002; silRim.renderOrder = 2;
  scanBar = new THREE.Mesh(new THREE.PlaneGeometry(PIN.w * 1.3, PIN.h * 0.025), new THREE.MeshBasicMaterial({ color: 0xffc21f, transparent: true, depthWrite: false }));
  scanBar.position.z = 0.0008; scanBar.renderOrder = 4;
  A.add(silRim, sil, scanBar);
  // the pin: paint layer on its own atlas (the GLB's only UV set, unique per face: Blender smart project)
  pinModel = data.pin.scene;
  pinModel.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.geometry.setAttribute('paintUv', o.geometry.attributes.uv); pinMeshes.push(o); } });
  pinRoot.add(pinModel); pinRoot.matrixAutoUpdate = false; pinRoot.visible = false;
  painter = createPainter(renderer, { res: 1024, undoDepth: 10 });
  scene.add(painter.world);
  paintP = painter.makePaintable(pinRoot, pinMeshes);
  painter.warm(paintP, camera);
  // the logo, beside the monkey's head
  logoModel = data.logo.scene; logoModel.scale.setScalar(LOGO_W / 0.108);
  logoModel.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; logoMeshes.push(o); } });
  logoG.add(logoModel); logoG.position.copy(LOGO_AT); logoG.rotation.y = 0.28; logoG.visible = false;
  proxy.add(logoG); A.add(proxy); proxy.visible = false;
  // the floor (room mode): reticle ring, shadow, landing ring
  const ringM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 56), ringM), dot = new THREE.Mesh(new THREE.CircleGeometry(0.08, 24), ringM);
  for (const m of [ring, dot]) { m.rotation.x = -Math.PI / 2; reticle.add(m); }
  reticle.visible = false; scene.add(reticle);
  for (const m of [shadow, dust]) { m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 1; scene.add(m); }
  // stars that burst off the logo (flat, gold and white)
  const starShape = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.42 : 1; starShape[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
  const sg = new THREE.ShapeGeometry(starShape);
  for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: i % 3 ? 0xffc21f : 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide })); m.visible = false; m.renderOrder = 6; scene.add(m); starsFx.push(m); }
  // compile everything now (a shader compile mid-session stalls the engine: immersive Top pitfall 13)
  proxy.visible = true; logoG.visible = true; pinRoot.visible = true;
  try { renderer.compile(scene, camera); } catch (e) { /* older three */ }
  proxy.visible = false; logoG.visible = false; pinRoot.visible = false;
}

// ---------------------------------------------------------------- tracking (image target)
const T = { name: 'mq-pin', pr: null, tracked: false, at: 0, gap: 40, p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1 };
function onTarget(d) {
  if (d.name !== T.name) return;
  const upp = d.scale * (d.scaledHeight || 1) / T.pr.height;          // world units per target pixel
  T.q.set(d.rotation.x, d.rotation.y, d.rotation.z, d.rotation.w); T.p.set(d.position.x, d.position.y, d.position.z);
  T.s = T.pr.height * upp / FRAME_H;                                   // world units per metre of the pin
  const now = performance.now();
  if (!T.tracked) diag.found++; else T.gap += (clamp(now - T.at, 8, 400) - T.gap) * 0.2;
  T.tracked = true; T.at = now;
}
function onLost(d) { if (d.name === T.name && T.tracked) { T.tracked = false; diag.lost++; } }
const pose = { state: 'none', lostAt: 0, snap: true, goneAt: 0 };
function updatePose(now) {
  if (T.tracked && now - T.at > clamp(T.gap * 3, 120, 300)) T.tracked = false;   // the engine went quiet
  let st;
  if (T.tracked) { st = 'track'; pose.lostAt = now; follow(); }
  else st = pose.state !== 'none' && now - pose.lostAt < 150 ? 'hold' : 'none';   // a blink only: nothing shows unless tracked now
  if (st === 'none' && pose.state !== 'none') pose.goneAt = now;
  if (st === 'none') pose.snap = true;
  const fresh = st !== 'none' && pose.state === 'none';
  pose.state = st; A.visible = st !== 'none';
  if (fresh) arrived(now);
}
function follow() {
  const s = T.s;
  const aP = pose.snap ? 1 : clamp(A.position.distanceTo(T.p) / s / 0.0015, 0.5, 1);
  const aR = pose.snap ? 1 : clamp(A.quaternion.angleTo(T.q) / 0.03, 0.5, 1);
  A.position.lerp(T.p, aP); A.quaternion.slerp(T.q, aR); A.scale.setScalar(pose.snap ? s : lerp(A.scale.x, s, 0.6));
  pose.snap = false; A.updateMatrixWorld(true);
}

// ---------------------------------------------------------------- the flow
// exp: 'spray' | 'launch'. mode: find -> reveal -> ready (spray: painting) | (launch) grow -> placing -> drop -> play
let exp = ['spray', 'launch'].includes(params.get('mode')) ? params.get('mode') : (store.get('exp', 'spray') === 'launch' ? 'launch' : 'spray');
let mode = 'find';
let onPrint = true;                           // the pin is on the print (proxy in A) rather than in the room
function setMode(m) {
  mode = m; $('hud').dataset.mode = m; diag.steps.push([exp + ':' + m, Math.round(performance.now())]); if (diag.steps.length > 60) diag.steps.shift();
  syncUi();
}
function syncUi() {
  const hud = $('hud'); hud.dataset.exp = exp; $('tag').textContent = exp === 'spray' ? 'SPRAY' : 'LAUNCH';
  const paintOn = exp === 'spray' && mode === 'ready';
  hud.classList.toggle('painting', paintOn && A.visible);
  $('caps').hidden = !paintOn; $('b-undo').hidden = !paintOn; $('b-nozzle').hidden = !paintOn;
  $('b-move').hidden = !(exp === 'launch' && (mode === 'play' || mode === 'drop'));
  const act = $('b-action');
  if (exp === 'launch' && mode === 'ready') { act.hidden = !A.visible; act.textContent = 'Launch It'; act.disabled = false; }
  else if (exp === 'launch' && mode === 'placing') { act.hidden = false; act.textContent = 'Place it'; act.disabled = !reticle.visible; }
  else act.hidden = true;
  $('size').hidden = mode !== 'placing';
}
const reveal = { t: -1, popped: false, logoT: -1 };
function arrived(now) {
  if (!onPrint) return;
  if (mode === 'find' || (mode === 'ready' && now - pose.goneAt > 2500)) {
    if (mode === 'find' && !diag.firstFoundS) { diag.firstFoundS = +((now - camStartAt) / 1000).toFixed(1); track('mq_found', { exp }); }
    setMode('reveal'); reveal.t = 0; reveal.popped = false; reveal.logoT = -1; hint(''); sound.scan(); buzz([10, 40, 18]);
    logoG.visible = false;
  }
}
// reveal: 0..0.9 s scan line up the pin (the cut-out fills in behind it), 0.9..1.3 s shiver, then a spinning hop off
const SCAN_S = 0.9, SHIVER_S = 0.4, POP_S = 0.95, REST_LIFT = 0.012, _dimRim = new THREE.Color(0x8a5a00);
let revealCut = 0;
function tickReveal(dt) {
  if (!onPrint || (mode !== 'reveal' && mode !== 'ready')) return;
  if (mode === 'reveal') {
    reveal.t += dt; const t = reveal.t;
    const k = clamp(t / SCAN_S, 0, 1); revealCut = k;
    scanBar.visible = k < 1; scanBar.position.y = (k - 0.5) * PIN.h;
    proxy.visible = t > SCAN_S;
    if (t > SCAN_S && t < SCAN_S + SHIVER_S) {
      const w = (t - SCAN_S) / SHIVER_S; lieOnPrint(Math.sin((t - SCAN_S) * 42) * 0.05 * w, 0.0006);
    } else if (t >= SCAN_S + SHIVER_S) {
      if (!reveal.popped) { reveal.popped = true; sound.pop(); buzz(20); }
      const k2 = clamp((t - SCAN_S - SHIVER_S) / POP_S, 0, 1);
      const lift = REST_LIFT * easeOutBack(k2) + Math.sin(k2 * Math.PI) * 0.018;      // a hop: up and forward, settles in front
      lieOnPrint(0, 0.0006 + lift, REDUCED ? 0 : easeInOut(k2) * Math.PI * 2, -0.18 * easeOut(k2));
      if (k2 >= 1) { setMode('ready'); reveal.logoT = 0; sound.zing(); if (exp === 'spray') hint('Hold anywhere to spray'); }
    }
  } else {
    const t = clock.t;
    lieOnPrint(0, REST_LIFT + Math.sin(t * 2.2) * 0.0015, Math.sin(t * 0.9) * 0.12, -0.18);
  }
  if (reveal.logoT >= 0) {                   // the logo pops in beside the head
    reveal.logoT += dt; const k = clamp(reveal.logoT / 0.45, 0, 1);
    logoG.visible = true; logoG.scale.setScalar(REDUCED ? 1 : Math.max(0.001, easeOutBack(k)));
    logoG.position.set(LOGO_AT.x, LOGO_AT.y + Math.sin(clock.t * 1.7 + 1) * 0.0015, LOGO_AT.z);
    logoG.rotation.y = 0.28 + Math.sin(clock.t * 0.8) * 0.08;
  }
  silRim.material.color.setHex(0xffc21f).lerp(_dimRim, 0.5 + 0.5 * Math.sin(clock.t * 4));
  if (A.visible) setScanCut(mode === 'reveal' ? revealCut : 1);
  syncUi();
  if (mode === 'ready' && !A.visible) hint('Point at your pin again');
  else if (mode === 'ready' && exp === 'launch' && /again/.test($('hint').textContent)) hint('');
  else if (mode === 'ready' && exp === 'spray' && /again/.test($('hint').textContent)) hint('Hold anywhere to spray');
}
function lieOnPrint(wiggle, lift, spin = 0, tilt = 0) {
  proxy.position.set(0, 0, lift); proxy.rotation.set(tilt, spin, wiggle); proxy.scale.setScalar(1);
}

// ---------------------------------------------------------------- spray (exp 'spray')
let capIdx = clamp(+store.get('cap', 1) || 0, 0, CAPS.length - 1), nozIdx = clamp(+store.get('noz', 1) || 1, 0, 2);
const paintCol = new THREE.Color();
const spray = { on: false, id: null, strokes: 0, stamps: 0, t0: 0 };
function setCap(i) {
  capIdx = i; store.set('cap', i); paintCol.set(CAPS[i].c).convertSRGBToLinear();
  document.documentElement.style.setProperty('--paint', CAPS[i].c);
  [...$('caps').children].forEach((b, j) => b.setAttribute('aria-checked', String(j === i)));
}
function setNozzle(i) {
  nozIdx = i; store.set('noz', i); const n = NOZZLES[i];
  $('nz-t').textContent = n.label; $('nz-dot').setAttribute('r', String(n.dot)); $('b-nozzle').setAttribute('aria-label', `Nozzle: ${n.label.toLowerCase()}. Tap to change`);
}
CAPS.forEach((c, i) => {
  const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', c.n); b.style.setProperty('--c', c.c);
  b.onclick = () => { setCap(i); sound.click(); }; $('caps').appendChild(b);
});
setCap(capIdx); setNozzle(nozIdx);
$('b-nozzle').onclick = () => { setNozzle((nozIdx + 1) % NOZZLES.length); sound.click(); };
$('b-undo').onclick = () => { if (paintP && painter.undo(paintP)) { painter.update(); sound.click(); } syncUndo(); };
function syncUndo() { $('b-undo').disabled = !(paintP && paintP.undo.length); }
const canSpray = () => exp === 'spray' && mode === 'ready' && onPrint && A.visible && proxy.visible;
function sprayStart(e) {
  if (!canSpray() || spray.on) return false;
  spray.on = true; spray.id = e ? e.pointerId : null; spray.t0 = performance.now();
  painter.snapshot(paintP); syncUndo(); spray.strokes++; diag.strokes++;
  sound.spray(true); $('hud').classList.add('spraying'); hint('');
  if (spray.strokes === 1) track('mq_spray', { colour: CAPS[capIdx].n });
  return true;
}
function sprayEnd() { if (!spray.on) return; spray.on = false; sound.spray(false); $('hud').classList.remove('spraying'); }
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3(), _ws = new THREE.Vector3();
function tickSpray() {
  if (!spray.on) return;
  if (!canSpray()) { sprayEnd(); return; }
  camera.getWorldPosition(_o); camera.getWorldDirection(_d); _u.set(0, 1, 0).applyQuaternion(camera.quaternion);
  proxy.getWorldPosition(_w); proxy.getWorldScale(_ws);
  const dist = Math.max(_w.distanceTo(_o), 1e-4), r = NOZZLES[nozIdx].r * _ws.x;
  const half = clamp(Math.atan(r / dist), 0.003, 0.35);
  painter.stamp({ origin: _o, dir: _d, up: _u, half, mode: 'spray', color: paintCol, amt: 0.32, only: paintP });
  spray.stamps++;
}

// ---------------------------------------------------------------- launch (exp 'launch'): off the print, into the room
const grow = { t: -1, p0: new THREE.Vector3(), q0: new THREE.Quaternion(), s0: 1 };
function launch() {
  if (mode !== 'ready' || !A.visible) return;
  sound.click(); sound.grow(); buzz(15);
  scene.attach(proxy); onPrint = false;     // keeps its world transform
  const cam = camera.position, d0 = proxy.position.distanceTo(cam), k = 0.3 / Math.max(d0, 1e-3);
  grow.p0.copy(cam).addScaledVector(proxy.position.clone().sub(cam), k);
  grow.q0.copy(proxy.quaternion); grow.s0 = proxy.scale.y * k;
  proxy.position.copy(grow.p0); proxy.scale.setScalar(grow.s0);
  grow.t = 0; setMode('grow'); hint('');
  track('mq_launch', {});
}
const GROW_S = 1.3;
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const hv = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1, yaw: 0 };
function hoverPose(out) {                      // where the pin floats while you place it (centre of the pin)
  const s = worldH / PIN.h;
  if (reticle.visible) { out.p.copy(reticle.position); out.p.y += worldH * (0.62 + 0.03 * Math.sin(clock.t * 3)); }
  else { camera.getWorldDirection(_v); out.p.copy(camera.position).addScaledVector(_v, 1.3); out.p.y -= 0.2; }
  const yaw = Math.atan2(camera.position.x - out.p.x, camera.position.z - out.p.z);
  out.q.setFromEuler(_e.set(0, yaw, 0)); out.s = s; out.yaw = yaw;
}
function tickGrow(dt) {
  if (mode === 'grow') {
    grow.t += dt; const k = clamp(grow.t / GROW_S, 0, 1);
    hoverPose(hv);
    const e = easeOutBack(k), spin = REDUCED ? 0 : (1 - easeOut(k)) * Math.PI * 3;
    proxy.position.lerpVectors(grow.p0, hv.p, easeInOut(k)); proxy.position.y += Math.sin(k * Math.PI) * 0.25;
    _q.slerpQuaternions(grow.q0, hv.q, easeInOut(k)); proxy.quaternion.copy(_q); proxy.rotateY(spin);
    proxy.scale.setScalar(lerp(grow.s0, hv.s, e));
    if (k >= 1) { setMode('placing'); hint('Point at the floor or a table'); }
  } else if (mode === 'placing') {
    hoverPose(hv);
    const a = 1 - Math.exp(-8 * dt);
    proxy.position.lerp(hv.p, a); proxy.quaternion.slerp(hv.q, a); proxy.scale.setScalar(lerp(proxy.scale.x, hv.s, a));
    $('size').textContent = `Monkey ${Math.round(worldH * 100)} cm tall · pinch to size`;
    if (!trackingBad()) hint(reticle.visible ? 'Tap Place it when the ring is right' : 'Point at the floor or a table');
    syncUi();
  }
}
// the floor: a ray from just below the middle of the screen to the plane y = 0 (8th Wall's world-effects approach)
const ray = new THREE.Raycaster(), floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
let testFloor = false;
function tickFloor(dt) {
  const placing = mode === 'grow' || mode === 'placing';
  if (!placing) { reticle.visible = false; return; }
  const footR = worldH * 0.42;
  if (testFloor) { reticle.visible = true; reticle.scale.setScalar(footR); shadow.visible = true; shadow.position.copy(reticle.position); shadow.scale.set(footR, footR * 0.45, 1); return; }
  ray.setFromCamera(new THREE.Vector2(0, -0.15), camera);
  let ok = false;
  if (ray.ray.intersectPlane(floorPlane, hit)) { const d = hit.distanceTo(camera.position); ok = d > 0.45 && d < 7; }
  if (ok) {
    if (!reticle.visible) reticle.position.copy(hit); else reticle.position.lerp(hit, 1 - Math.exp(-16 * dt));
    reticle.position.y = 0.002; reticle.scale.setScalar(footR);
  }
  reticle.visible = ok;
  shadow.visible = ok; if (ok) { shadow.position.copy(reticle.position); shadow.position.y = 0.001; shadow.scale.set(footR, footR * 0.45, 1); }
}
const drop = { t: -1, from: new THREE.Vector3(), q0: new THREE.Quaternion() };
function placeIt() {
  if (!reticle.visible || mode !== 'placing') return;
  sound.click(); store.set('size', worldH.toFixed(2));
  placed.pos.copy(reticle.position); placed.pos.y = 0; placed.s = worldH / PIN.h;
  placed.yaw = Math.atan2(camera.position.x - placed.pos.x, camera.position.z - placed.pos.z);
  drop.from.copy(proxy.position); drop.q0.copy(proxy.quaternion); drop.t = 0; drop.landed = false;
  hint(''); setMode('drop'); track('mq_place', { cm: Math.round(worldH * 100) });
}
const HOVER = 0.6;                             // the pin's centre hovers this many heights above the floor
const DROP_S = 0.42;
function tickDrop(dt) {
  if (mode !== 'drop') return;
  drop.t += dt; const t = drop.t;
  const q = new THREE.Quaternion().setFromEuler(_e.set(0, placed.yaw, 0));
  const target = _v.copy(placed.pos); target.y = worldH * HOVER;
  if (t < DROP_S) {
    const k = t / DROP_S;
    proxy.position.lerpVectors(drop.from, target, k * k); proxy.quaternion.slerpQuaternions(drop.q0, q, easeOut(k)); proxy.scale.setScalar(placed.s);
  } else {
    if (!drop.landed) {
      drop.landed = true; sound.thud(); buzz([30, 30, 20]);
      dust.visible = true; dust.position.copy(placed.pos); dust.position.y = 0.003; dust.userData.t = 0;
    }
    const k = clamp((t - DROP_S) / 0.35, 0, 1), sq = 1 - 0.12 * Math.sin(k * Math.PI);
    proxy.position.copy(target); proxy.position.y -= worldH * 0.06 * Math.sin(k * Math.PI); proxy.quaternion.copy(q);
    proxy.scale.set(placed.s * (2 - sq), placed.s * sq, placed.s * (2 - sq));
    if (k >= 1) { proxy.scale.setScalar(placed.s); setMode('play'); hint('Tap the monkey or the logo'); setTimeout(() => { if (/Tap the/.test($('hint').textContent)) hint(''); }, 5000); }
  }
}
// play: hover and sway; taps make it hop and spin, or spin the logo with a burst of stars
const fun = { hop: -1, logoSpin: -1 };
function tickPlay(dt) {
  if (mode !== 'play') { shadow.visible = shadow.visible && (mode === 'grow' || mode === 'placing'); return; }
  const t = clock.t, base = worldH * HOVER;
  let y = base + Math.sin(t * 1.6) * worldH * 0.025, spin = Math.sin(t * 0.7) * 0.18;
  if (fun.hop >= 0) {
    fun.hop += dt; const k = clamp(fun.hop / 0.9, 0, 1);
    y += Math.sin(k * Math.PI) * worldH * 0.45; spin += REDUCED ? 0 : easeInOut(k) * Math.PI * 2;
    if (k >= 1) fun.hop = -1;
  }
  proxy.position.set(placed.pos.x, y, placed.pos.z);
  proxy.quaternion.setFromEuler(_e.set(0, placed.yaw + spin, Math.sin(t * 1.1) * 0.05));
  proxy.scale.setScalar(placed.s);
  logoG.position.set(LOGO_AT.x, LOGO_AT.y + Math.sin(t * 1.7 + 1) * 0.0015, LOGO_AT.z);
  logoG.rotation.y = 0.28 + Math.sin(t * 0.8) * 0.08;
  if (fun.logoSpin >= 0) {
    fun.logoSpin += dt; const k = clamp(fun.logoSpin / 0.8, 0, 1);
    logoG.rotation.y += REDUCED ? 0 : easeInOut(k) * Math.PI * 2; logoG.scale.setScalar(1 + 0.18 * Math.sin(k * Math.PI));
    if (k >= 1) { fun.logoSpin = -1; logoG.scale.setScalar(1); }
  }
  shadow.visible = true; shadow.position.set(placed.pos.x, 0.001, placed.pos.z);
  const sk = worldH * 0.42 * (1 - 0.35 * (y - base) / (worldH * 0.45 + 1e-6));
  shadow.scale.set(sk, sk * 0.45, 1); shadow.material.opacity = 0.28 * clamp(1 - (y - base) / worldH, 0.3, 1);
}
const tapRay = new THREE.Raycaster();
function tapAt(x, y) {
  if (mode !== 'play') return false;
  tapRay.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
  pinRoot.updateMatrixWorld(true); logoG.updateMatrixWorld(true);
  const hl = tapRay.intersectObjects(logoMeshes, false)[0], hp = tapRay.intersectObjects(pinMeshes, false)[0];
  if (hl && (!hp || hl.distance <= hp.distance)) { fun.logoSpin = 0; burstStars(); sound.stars(); buzz(15); popWord('Hypergalactic!', hl.point); track('mq_tap', { what: 'logo' }); return true; }
  if (hp) { fun.hop = 0; sound.boing(); buzz(20); popWord(['Boing!', 'Woo-hoo!', 'Monkey Quest!'][diag.taps++ % 3], hp.point); track('mq_tap', { what: 'monkey' }); return true; }
  return false;
}
function burstStars() {
  logoG.updateMatrixWorld(true); const c = new THREE.Vector3(); logoG.getWorldPosition(c);
  const s = worldH * 0.07;
  starsFx.forEach((m, i) => {
    const a = i / starsFx.length * Math.PI * 2;
    m.visible = true; m.position.copy(c); m.scale.setScalar(s * (0.6 + Math.random() * 0.6));
    m.userData = { t: 0, v: new THREE.Vector3(Math.cos(a), Math.sin(a) * 0.8 + 0.6, Math.random() * 0.4 - 0.2).multiplyScalar(worldH * 1.4), r: (Math.random() - 0.5) * 8 };
  });
}
function tickFx(dt) {
  if (dust.visible) {
    const u = dust.userData; u.t += dt; const k = u.t / 0.6;
    dust.scale.setScalar(worldH * 0.42 * (1.1 + 1.4 * easeOut(k))); dust.material.opacity = 0.75 * (1 - k);
    if (k >= 1) dust.visible = false;
  }
  for (const m of starsFx) {
    if (!m.visible) continue; const u = m.userData; u.t += dt;
    u.v.y -= worldH * 2.2 * dt; m.position.addScaledVector(u.v, dt); m.rotation.z += u.r * dt; m.lookAt(camera.position);
    m.material.opacity = clamp(1 - u.t / 1.1, 0, 1); if (u.t > 1.1) m.visible = false;
  }
}
function toPlacing() {                          // Move: back to placing; the paint and the logo come along as they are
  if (onPrint) return;
  fun.hop = fun.logoSpin = -1; logoG.scale.setScalar(1);
  setMode('placing'); sound.click();
}
$('b-action').onclick = () => { if (mode === 'ready') launch(); else if (mode === 'placing') placeIt(); };
$('b-move').onclick = toPlacing;

// pinch to size while placing
const pinch = { pts: new Map(), d0: 0, h0: worldH };
function pinchDist() { const p = [...pinch.pts.values()]; return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); }

// ---------------------------------------------------------------- the canvas: hold to spray, tap, pinch
const cv = $('cam');
cv.addEventListener('pointerdown', (e) => {
  sound.init();
  pinch.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (mode === 'placing' && pinch.pts.size === 2) { pinch.d0 = pinchDist(); pinch.h0 = worldH; sprayEnd(); return; }
  if (exp === 'spray' && sprayStart(e)) { try { cv.setPointerCapture(e.pointerId); } catch (err) { /* old Safari */ } return; }
  if (mode === 'play') tapAt(e.clientX, e.clientY);
});
cv.addEventListener('pointermove', (e) => {
  if (!pinch.pts.has(e.pointerId)) return;
  pinch.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (mode === 'placing' && pinch.pts.size === 2 && pinch.d0 > 0) worldH = clamp(pinch.h0 * pinchDist() / pinch.d0, SIZE_MIN, SIZE_MAX);
});
const up = (e) => { pinch.pts.delete(e.pointerId); if (pinch.pts.size < 2) pinch.d0 = 0; if (spray.on && (spray.id == null || spray.id === e.pointerId)) sprayEnd(); };
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
cv.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------------------------------------------------------------- choose your experience (same session)
let started = false;
function openMenu(over) {
  const m = $('menu'); m.hidden = false; m.classList.toggle('over', !!over);
  $('menu-close').hidden = !over; $('menu-note').hidden = !!over;
  m.querySelectorAll('.card').forEach((c) => c.setAttribute('aria-current', String(over && c.dataset.mode === exp)));
  sprayEnd(); m.querySelector('.card').focus({ preventScroll: true });
}
function closeMenu() { $('menu').hidden = true; }
function setExp(e) {
  const changed = e !== exp; exp = e; store.set('exp', e); track('mode', { exp: e });
  if (!started) return;
  sprayEnd();
  if (!onPrint) {                              // back onto the print: the room pin goes, the paint stays
    A.add(proxy); onPrint = true; shadow.visible = false; dust.visible = false; reticle.visible = false;
    fun.hop = fun.logoSpin = -1; logoG.scale.setScalar(1);
  }
  if (changed || mode !== 'ready') {
    lieOnPrint(0, 0.0006); proxy.visible = false; logoG.visible = false; reveal.logoT = -1;
    pose.state = 'none'; pose.snap = true;      // the next tracked frame runs the reveal again
    setMode('find'); hint('Point at your Monkey Quest pin');
  } else syncUi();
}
$('menu').querySelectorAll('.card').forEach((c) => (c.onclick = () => {
  sound.init(); sound.click(); setExp(c.dataset.mode); closeMenu();
  if (!started) start();
}));
$('menu-close').onclick = closeMenu;
$('b-menu').onclick = () => openMenu(true);
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('menu').hidden && started) closeMenu(); });

// ---------------------------------------------------------------- frame
const clock = { t: 0 };
let lastTrack = '', limitedSince = 0;
function tick(dt) {
  const now = performance.now(); clock.t += dt; diag.fpsN++; camera.updateMatrixWorld();
  if (onPrint) updatePose(now); else A.visible = false;
  tickReveal(dt); tickSpray(); tickFloor(dt); tickGrow(dt); tickDrop(dt); tickPlay(dt); tickFx(dt);
  // the painted pin copies the proxy's world pose
  proxy.updateMatrixWorld(true);
  pinRoot.visible = proxy.visible && (onPrint ? A.visible : true);
  if (pinRoot.visible) pinRoot.matrix.copy(proxy.matrixWorld);
  if (painter) painter.update();
  if (!onPrint) {
    if (lastTrack === 'LIMITED') { if (!limitedSince) limitedSince = now; if (now - limitedSince > 1500) hint('Move your phone slowly so it can see the floor again'); }
    else if (limitedSince) { limitedSince = 0; if (/slowly/.test($('hint').textContent)) hint(''); }
  }
  if (SHOW_DIAG && now - (diag.drawAt || 0) > 500) drawDiag(now);
}
function hint(text) { if ($('hint').textContent !== (text || '')) $('hint').textContent = text || ''; }
const trackingBad = () => lastTrack === 'LIMITED' && limitedSince && performance.now() - limitedSince > 1500;
function popWord(text, at) {
  const p = at.clone().project(camera); if (p.z > 1) return;
  const el = document.createElement('div'); el.className = 'pop-word'; el.textContent = text;
  el.style.left = clamp((p.x + 1) / 2 * innerWidth, 90, innerWidth - 90) + 'px'; el.style.top = clamp((1 - p.y) / 2 * innerHeight, 100, innerHeight - 200) + 'px';
  $('pops').appendChild(el); setTimeout(() => el.remove(), 1300);
}

// ---------------------------------------------------------------- options
const optsEl = $('opts');
function openOpts() { optsEl.hidden = false; $('b-opts').setAttribute('aria-expanded', 'true'); optsEl.querySelector('.x').focus(); sprayEnd(); }
function closeOpts() { optsEl.hidden = true; $('b-opts').setAttribute('aria-expanded', 'false'); $('b-opts').focus(); }
$('b-opts').onclick = openOpts;
optsEl.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeOpts));
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !optsEl.hidden) closeOpts(); });
const soundBtn = $('o-sound'); soundBtn.setAttribute('aria-checked', String(sound.on));
soundBtn.onclick = () => { sound.on = !sound.on; store.set('sound', sound.on ? '1' : '0'); soundBtn.setAttribute('aria-checked', String(sound.on)); if (!sound.on) sound.spray(false); sound.click(); };
$('o-exp').onclick = () => { closeOpts(); openMenu(true); };
$('o-clear').onclick = () => { if (paintP) { painter.snapshot(paintP); painter.clear(paintP); painter.update(); syncUndo(); sound.shake(); } closeOpts(); };
$('o-how').onclick = () => { closeOpts(); $('how').hidden = false; $('b-go').focus(); };
$('b-go').onclick = () => { $('how').hidden = true; store.set('how', '1'); };
function showError(title, body) { $('err-title').textContent = title; $('err-body').textContent = body; $('error').hidden = false; diag.errors.push(`${title}: ${body}`.slice(0, 200)); }
$('err-retry').onclick = () => location.reload();

// ---------------------------------------------------------------- photo and video (the Cola Run recorder)
const LOGO = { mq: new Image(), act: new Image() };
LOGO.mq.src = '/monkey-quest/activated-retail/assets/mq_logo.webp'; LOGO.act.src = '/activated-merch/media/ar/activated-by.webp';
function drawWatermark(c, Wd, Hd) {
  const u = Math.min(Wd, Hd) / 720, pad = 24 * u;
  if (LOGO.mq.complete && LOGO.mq.naturalWidth) { const h = 92 * u, w = h * LOGO.mq.naturalWidth / LOGO.mq.naturalHeight; c.drawImage(LOGO.mq, pad, pad, w, h); }
  if (LOGO.act.complete && LOGO.act.naturalWidth) { const h = 50 * u, w = h * LOGO.act.naturalWidth / LOGO.act.naturalHeight; c.drawImage(LOGO.act, Wd - pad - w, Hd - pad - h, w, h); }
}
let capture = null, recFrom = 0, shots = 0;
try {
  capture = new ColaCapture({
    canvas: cv, host: document.body, endpoint: location.origin, globeUrl: '', source: 'monkey-quest-hub', audioContext: null,
    connectAudio: (dest) => { const m = sound.master; if (!m) return () => {}; m.connect(dest); return () => { try { m.disconnect(dest); } catch (e) { /* gone */ } }; },
    overlay: (c, Wd, Hd) => drawWatermark(c, Wd, Hd),
    on: (name) => { if (name === 'recordStart') { buzz(25); recUi(true); track('mq_video', { exp }); } if (name === 'recordStop' || name === 'error') recUi(false); },
  });
  Object.assign(capture.settings, {
    corner: 'topRight', offsetX: -5, offsetY: -6, accent: '#ffc21f', maxSeconds: 30, sendEnabled: false,
    hintText: 'Film your Monkey Quest pin', keepTitle: 'Keep your clip?', clipTitle: 'Monkey Quest clip', filePrefix: 'monkey-quest', backLabel: 'Back to the camera',
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
    sound.init(); sound.shutter(); buzz(20); const fl = $('flashw'); fl.classList.add('on'); setTimeout(() => fl.classList.remove('on'), 60);
    const b64 = await XR8.CanvasScreenshot.takeScreenshot();
    const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0); drawWatermark(g, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92));
    const file = new File([blob], `monkey-quest-${++shots}.jpg`, { type: 'image/jpeg' }), url = URL.createObjectURL(blob);
    $('shot-img').src = url; $('shot-save').href = url; $('shot-save').download = file.name; $('shot-save').hidden = false;
    const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
    $('shot-share').hidden = !canShare; $('shot-share').onclick = () => navigator.share({ files: [file], title: 'Monkey Quest' }).catch(() => {});
    $('shot').hidden = false; diag.photos++; track('mq_photo', { exp });
  } catch (e) { console.error(e); }
}
const HOLD_MS = 320; let holding = false, holdT = 0;
const sh = $('b-shutter');
sh.addEventListener('contextmenu', (e) => e.preventDefault());
sh.addEventListener('pointerdown', (e) => {
  if (e.button > 0) return;
  if (capture && capture.status === 'recording') { holding = false; return; }
  holding = true; try { sh.setPointerCapture(e.pointerId); } catch (err) { /* old Safari */ }
  clearTimeout(holdT); holdT = setTimeout(() => { if (holding && capture) capture.start(); }, HOLD_MS);
});
sh.addEventListener('pointerup', () => {
  if (capture && capture.status === 'recording') { holding = false; clearTimeout(holdT); capture.stop(); return; }
  if (!holding) return; holding = false; clearTimeout(holdT); takePhoto();
});
sh.addEventListener('pointercancel', () => { holding = false; clearTimeout(holdT); if (capture && capture.status === 'recording') capture.stop(); });
sh.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); takePhoto(); } });
$('shot-close').onclick = () => { $('shot').hidden = true; };

// ---------------------------------------------------------------- 8th Wall pipeline
const DPR = clamp(+params.get('dpr') || 1.5, 1, 3);
function sizeCanvas() {
  const dpr = Math.min(devicePixelRatio || 1, DPR), w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
}
let last = 0, camStartAt = 0, built = false;
const appModule = (data) => ({
  name: 'monkey-quest-hub',
  onStart: () => { buildScene(XR8.Threejs.xrScene(), data); built = true; $('hud').hidden = false; setMode('find'); hint('Point at your Monkey Quest pin'); },
  onUpdate: ({ processCpuResult }) => {
    const now = performance.now(); const dt = Math.min((now - (last || now)) / 1000, 0.05); last = now;
    const r = processCpuResult && processCpuResult.reality; if (r && r.trackingStatus) noteTracking(r.trackingStatus, r.trackingReason);
    if (built) tick(dt); recTick(); flushDiag(false);
  },
  onRender: () => { if (capture) capture.frame(); },
  onCameraStatusChange: ({ status }) => {
    diag.steps.push(['cam:' + status, Math.round(performance.now())]);
    if (status === 'hasVideo') {
      camStartAt = performance.now(); track('ar_open', { exp });
      $('splash').classList.add('gone'); setTimeout(() => { $('splash').hidden = true; }, 500);
      if (capture) capture.setVisible(false);
    }
    if (status === 'requesting') hint('Allow camera and motion access to begin');
    if (status === 'failed') camFailed('failed');
  },
  onException: (e) => {
    diag.errors.push('XR: ' + (typeof e === 'object' ? JSON.stringify(e) : String(e)).slice(0, 200)); flushDiag(true, true);
    const msg = String((e && e.message) || (typeof e === 'object' ? JSON.stringify(e) : e));
    if (!camStartAt && /session manager|not supported|unsupported|device/i.test(msg)) return openOnPhone();
    if (e && e.type === 'permission') return showError('Motion access is needed', 'The Monkey Quest Hub uses your phone\'s motion sensors to keep the monkey in your room. Allow motion and orientation access (on iPhone, tap Allow when asked), then try again.');
    showError('Something went wrong', msg);
  },
  listeners: [
    { event: 'reality.imagefound', process: ({ detail }) => onTarget(detail) },
    { event: 'reality.imageupdated', process: ({ detail }) => onTarget(detail) },
    { event: 'reality.imagelost', process: ({ detail }) => onLost(detail) },
    { event: 'reality.trackingstatus', process: ({ detail }) => noteTracking(detail.status, detail.reason) },
  ],
});
function noteTracking(st, why) { if (st !== lastTrack) { lastTrack = st; diag.tracking.push([st + (why && why !== 'UNSPECIFIED' ? ' ' + why : ''), Math.round(performance.now())]); if (diag.tracking.length > 30) diag.tracking.shift(); } }
function start() {
  if (!loaded || started) return;
  if (!PHONE && !params.has('desktop')) { openOnPhone(); return; }
  started = true;
  sound.init(); stopHero();
  sizeCanvas(); addEventListener('resize', sizeCanvas); addEventListener('orientationchange', () => setTimeout(sizeCanvas, 300));
  assets.then((data) => {
    T.pr = data.tdata.properties;
    XR8.XrController.configure({ disableWorldTracking: false, scale: 'responsive', imageTargetData: [data.tdata] });
    XR8.addCameraPipelineModules([XR8.GlTextureRenderer.pipelineModule(), XR8.Threejs.pipelineModule(), XR8.XrController.pipelineModule(), appModule(data)]);
    setTimeout(() => { if (!camStartAt) camFailed('no video after 15 s'); }, 15000);
    XR8.run({
      canvas: cv,
      allowedDevices: params.has('desktop') ? XR8.XrConfig.device().ANY : XR8.XrConfig.device().MOBILE_AND_HEADSETS,
      cameraConfig: { direction: XR8.XrConfig.camera().BACK }, verbose: params.has('verbose'),
    });
  });
}
// Start: the menu ("Choose Your Experience"); picking a card opens the camera in that same tap
$('b-start').onclick = () => { if (!loaded) return; sound.init(); sound.click(); openMenu(false); };
function camFailed(why) {
  if (camStartAt || diag.camFailed) return; diag.camFailed = why; flushDiag(true, true);
  showError('The camera didn\'t start', 'Allow camera and motion access for this site, and close the Camera app or other tabs that use the camera, then tap Try again.');
}
function qrInto(el) { try { window.QRCode && QRCode.toString(location.href.replace(/[?&]desktop\b/, ''), { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }, (err, svg) => { if (!err) el.innerHTML = svg; }); } catch (e) { /* no QR */ } }
if (!PHONE) { $('desk').hidden = false; qrInto($('qr')); track('ar_qr', {}); }
function openOnPhone() {
  try { window.XR8 && started && XR8.stop(); } catch (e) { /* already stopped */ }
  closeMenu();
  $('err-title').textContent = 'Open it on your phone';
  $('err-body').textContent = 'The Monkey Quest Hub needs your phone\'s camera to find your pin. Scan the code with your phone to play there.';
  $('err-qr').hidden = false; qrInto($('err-qr')); $('err-retry').hidden = true; $('error').hidden = false;
  $('error').onclick = (e) => { if (e.target === $('error')) $('error').hidden = true; };
  $('splash').hidden = false; $('splash').classList.remove('gone');
}

// ---------------------------------------------------------------- test log (previews and local dev only, or ?diag)
const SID = 'mq-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
const diag = { page: 'monkey-quest-hub', sid: SID, found: 0, lost: 0, fpsN: 0, strokes: 0, taps: 0, photos: 0, errors: [], steps: [], tracking: [], note: params.get('note') || '' };
let flushAt = 0;
function flushDiag(force, always = false) {
  const now = performance.now(); if (!force && now - flushAt < 10000) return; flushAt = now;
  if ((!camStartAt && !always) || params.has('nolog') || (LIVE_SITE && !params.has('diag'))) return;
  const body = JSON.stringify({ ...diag, exp, mode, sizeCm: Math.round(worldH * 100), stamps: spray.stamps, secs: Math.round((now - (camStartAt || now)) / 1000), fps: camStartAt ? +(diag.fpsN / Math.max((now - camStartAt) / 1000, 1)).toFixed(1) : 0, screen: [innerWidth, innerHeight, devicePixelRatio], ua: navigator.userAgent });
  try { if (!(navigator.sendBeacon && navigator.sendBeacon('/api/ar/kc-diag', new Blob([body], { type: 'application/json' })))) fetch('/api/ar/kc-diag', { method: 'POST', body, keepalive: true }); } catch (e) { /* offline */ }
}
addEventListener('pagehide', () => flushDiag(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) { flushDiag(true); sprayEnd(); } });
addEventListener('error', (e) => { diag.errors.push(String(e.message).slice(0, 200)); });
function drawDiag(now) {
  diag.drawAt = now; const el = $('diagp'); el.hidden = false;
  const fps = camStartAt ? diag.fpsN / Math.max((now - camStartAt) / 1000, 1) : 0;
  el.textContent = `${exp}/${mode} · track ${lastTrack || '-'} · target ${pose.state} · fps ${fps.toFixed(0)}` + (spray.stamps ? ` · ${spray.stamps} stamps` : '') + (diag.errors.length ? `\nerr: ${diag.errors.slice(-1)[0].slice(0, 60)}` : '');
}

// automated tests (?test)
if (params.has('test')) window.__mq = {
  get state() { return { exp, mode, pose: pose.state, onPrint, track: lastTrack, proxy: proxy.visible, logo: logoG.visible, pin: pinRoot.visible, stamps: spray.stamps, undo: paintP ? paintP.undo.length : 0, worldH, menu: !$('menu').hidden }; },
  setExp: (e) => setExp(e), launch: () => launch(), place: () => placeIt(), move: () => toPlacing(),
  floorAt: (dx = 0, dz = -1.2) => { testFloor = true; camera.getWorldDirection(_v); _v.y = 0; _v.normalize(); reticle.position.set(camera.position.x + _v.x * -dz - _v.z * dx, 0.002, camera.position.z + _v.z * -dz + _v.x * dx); },
  sprayFor: (ms = 800, cap = null) => new Promise((res) => { if (cap != null) setCap(cap); if (!sprayStart(null)) return res(false); setTimeout(() => { sprayEnd(); res(true); }, ms); }),
  tapPin: () => { const p = new THREE.Vector3(); pinRoot.updateMatrixWorld(true); new THREE.Box3().setFromObject(pinModel).getCenter(p); p.project(camera); return tapAt((p.x + 1) / 2 * innerWidth, (1 - p.y) / 2 * innerHeight); },
  tapLogo: () => { const p = new THREE.Vector3(); logoG.updateMatrixWorld(true); new THREE.Box3().setFromObject(logoModel).getCenter(p); p.project(camera); return tapAt((p.x + 1) / 2 * innerWidth, (1 - p.y) / 2 * innerHeight); },
  screen: () => { const p = new THREE.Vector3(); proxy.getWorldPosition(p); const q = p.clone().project(camera); return { world: p.toArray(), screen: [(q.x + 1) / 2 * innerWidth, (1 - q.y) / 2 * innerHeight] }; },
  programs: () => renderer && renderer.info.programs.length,
  diag,
};
