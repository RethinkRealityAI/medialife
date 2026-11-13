// Spray Bobo: the phone is the spray can. Point it at a charm on the EVADE keychain (the Bobo cat or the
// Eclipse can, each with a canvas and a painting of its own); once the charm is
// found a spray can slides onto the screen. Tap it and a canvas (Bobo as a colouring-book stencil) is laid
// over the charm; aim the phone like a can and hold the can to spray. Save, and the painting peels off the
// charm as a 3D die-cut sticker of your Bobo that lives on the keychain from then on (kept on this phone).
//
// Image tracking is the open-source 8th Wall engine (MIT), self-hosted with the Off the Chain page in
// /evade/keychain-ar/vendor/xr, using the same two cat targets (kc-bobo, kc-bobo-l: the charm's two sides).
// Rendering is plain three.js through XR8.Threejs.pipelineModule().
//
// How painting lines up: the paint texture is the kc-bobo target picture itself (768x1024 for 1682x2244,
// the same 3:4), so a point on the tracked picture is a point on the canvas. The nozzle is the middle of the
// screen: a ray from the camera through it hits the picture's plane, and the hit (in the picture's own
// frame) is where the paint lands. The spray's width grows with the distance, like a real can.
//
// Keeping the pose through shaky hands (tracking): the pose follows the engine without lag and only smooths
// sub-millimetre jitter; when the engine drops the charm for a moment the phone's gyroscope carries the
// pose on (it is checked against the tracking first, see `gyro`), so a stroke does not break off.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ColaCapture } from '/evade/cola-run-lab/assets/capture-core.js';

window.THREE = THREE;                         // XR8.Threejs.pipelineModule() looks for a global THREE
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const ENDLESS = params.has('endless');        // no paint level (testing)
const KC = '/evade/keychain-ar/';             // the Off the Chain page: engine, image targets
const HERE = '/evade/spray-bobo/';
const LIVE_SITE = /(^|\.)medialife\.ai$/i.test(location.hostname);
const TOUCH = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const clamp = THREE.MathUtils.clamp;
const easeOut = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
const easeInOut = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* no haptics */ } };

// ---------------------------------------------------------------- paint setup
const TW = 768, TH = 1024;                    // paint texture (the kc-bobo picture at 768 px wide)
const CAPS = [                                // the colours ("caps"), EVADE yellow first
  { c: '#f6c344', n: 'EVADE yellow' }, { c: '#3f9be6', n: 'Bobo blue' }, { c: '#8cc8f8', n: 'Sky' }, { c: '#e85bd8', n: 'Magenta' },
  { c: '#ff3b4e', n: 'Red' }, { c: '#ff8a2a', n: 'Orange' }, { c: '#3ddc84', n: 'Green' }, { c: '#7a5cff', n: 'Purple' },
  { c: '#ffffff', n: 'White' }, { c: '#15131a', n: 'Black' },
];
// nozzles: the spray's half-angle. At a hand's distance (15 cm) skinny is about 3 mm wide, fat about 1.5 cm.
const NOZZLES = [{ n: 'Skinny', a: 0.6, dot: 3 }, { n: 'Medium', a: 1.4, dot: 5 }, { n: 'Fat', a: 2.8, dot: 8 }];
const CAN_SECONDS = 24;                       // seconds of spraying in a full can
const BRIDGE_GYRO_MS = 1500, BRIDGE_HOLD_MS = 400;
// The charms you can paint. Each has its own image targets (both sides; the back is the mirror shape, so the
// canvas is flipped there), stencil art cut from its front picture, and its own saved painting.
const PIECES = {
  bobo: { k: 'bobo', name: 'Bobo', title: 'MY BOBO', art: 'cat', print: 'kc-bobo.jpg', targets: ['kc-bobo', 'kc-bobo-l'], flip: { 'kc-bobo-l': -1 }, mirrorPair: true, key: 'current', found: 'Found Bobo! Tap the spray can', back: 'Your Bobo is back', line: 'Sprayed on my EVADE keychain' },
  can: { k: 'can', name: 'the can', title: 'MY CAN', art: 'can', print: 'kc-can.jpg', targets: ['kc-can', 'kc-can-back'], flip: { 'kc-can-back': -1 }, mirrorPair: false, key: 'can', found: 'Found the can! Tap the spray can', back: 'Your can is back', line: 'Sprayed on my EVADE keychain' },
};
const PIECE_OF = {}; for (const P of Object.values(PIECES)) for (const n of P.targets) PIECE_OF[n] = P.k;

// ---------------------------------------------------------------- sound (made here, no files)
const sound = {
  ctx: null, on: true, master: null, hiss: null,
  init() {
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)(); this.ctx.resume();
      if (!this.master) { this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination); }
      if (!this.hiss) {   // the spray: a looping hiss, opened and closed by a gain
        const n = this.ctx.sampleRate * 2, b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
        const s = this.ctx.createBufferSource(); s.buffer = b; s.loop = true;
        const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2200;
        const bp = this.ctx.createBiquadFilter(); bp.type = 'peaking'; bp.frequency.value = 6500; bp.gain.value = 8;
        const g = this.ctx.createGain(); g.gain.value = 0;
        s.connect(hp).connect(bp).connect(g).connect(this.master); s.start();
        this.hiss = g;
      }
    } catch (e) { /* no audio */ }
  },
  spray(level) {   // 0..1, eased so it doesn't click
    if (!this.hiss) return; const t = this.ctx.currentTime;
    this.hiss.gain.setTargetAtTime(this.on ? level * 0.16 : 0, t, level ? 0.025 : 0.06);
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
  rattle(n = 4) { for (let i = 0; i < n; i++) { const w = i * 0.075 + Math.random() * 0.02; this.tone(2600, 1700, 0.035, 0.07, 'square', w); this.noise(0.04, 0.12, 2000, 7000, w); } },
  found() { this.tone(520, 1560, 0.5, 0.07, 'triangle'); this.tone(1040, 2080, 0.3, 0.04, 'sine', 0.12); },
  pssh() { this.noise(0.7, 0.16, 2500, 11000); },
  pop() { this.tone(260, 900, 0.16, 0.24); this.noise(0.12, 0.1, 900, 6000); },
  whoosh() { this.noise(0.35, 0.08, 900, 5000); this.tone(320, 760, 0.3, 0.035); },
  sparkle() { [1568, 2093, 2637, 3136, 3951, 4699].forEach((f, i) => this.tone(f, f * 1.01, 0.3, 0.04, 'sine', i * 0.055)); },
  mew() { this.tone(620, 880, 0.14, 0.08, 'triangle'); this.tone(880, 560, 0.22, 0.08, 'triangle', 0.13); },
  sputter() { for (let i = 0; i < 3; i++) this.noise(0.05, 0.12, 1500, 6000, i * 0.09); },
  shutter() { this.noise(0.05, 0.22, 2000, 9000); this.noise(0.07, 0.16, 1200, 6000, 0.08); },
  undo() { this.tone(700, 420, 0.12, 0.08, 'triangle'); },
};

// ---------------------------------------------------------------- loading
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
const getJson = (u) => fetch(u).then((r) => r.json());
const assets = Promise.all([
  getJson(KC + 'image-targets/layout.json'),
  loadImg(KC + 'image-targets/kc-bobo_luminance.jpg').catch(() => null),   // for telling the cat's two sides apart
  Promise.all(Object.values(PIECES).flatMap((P) => P.targets).map((n) => getJson(KC + `image-targets/${n}.json`))),
  Promise.all(Object.values(PIECES).map((P) => Promise.all([loadImg(HERE + `art/${P.art}-mask.png`), loadImg(HERE + `art/${P.art}-lines.png`), getJson(HERE + `art/${P.art}-outline.json`)]))),
]);
const xrReady = new Promise((res) => (window.XR8 ? res() : window.addEventListener('xrloaded', () => res(), { once: true })));
let loaded = false;
Promise.all([assets, xrReady, loadSaved()]).then(() => { loaded = true; $('b-start').disabled = false; $('b-start').textContent = Object.values(PIECES).some((P) => P.saved) ? 'Find my charms' : 'Start painting'; $('load').hidden = true; })
  .catch((e) => { console.error(e); showError('Could not load the experience', 'Check your connection and reload the page.'); });

// ---------------------------------------------------------------- the paint (a 2D canvas the AR plane shows)
const makePaint = () => ({
  P: null, pg: null,            // the paint layer (what was sprayed)
  D: null, dg: null,            // what is shown: base coat + paint + outline, cut to the cat
  mask: null, lines: null, maskSmall: null,
  primer: true, linesOn: true, dirty: true,
  undo: [], drips: [], wet: new Float32Array(48 * 64), wetCells: new Set(), brushes: new Map(), used: new Map(),
  coverage: 0,
  init(maskImg, linesImg) {
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    this.P = mk(TW, TH); this.pg = this.P.getContext('2d', { willReadFrequently: true });
    this.D = mk(TW, TH); this.dg = this.D.getContext('2d');
    this.mask = maskImg; this.lines = linesImg;
    const s = mk(48, 64), sg = s.getContext('2d', { willReadFrequently: true }); sg.drawImage(maskImg, 0, 0, 48, 64);
    const md = sg.getImageData(0, 0, 48, 64).data; this.maskSmall = new Uint8Array(48 * 64); for (let i = 0; i < this.maskSmall.length; i++) this.maskSmall[i] = md[i * 4 + 3] > 127 ? 1 : 0;
    this.covC = mk(48, 64); this.covG = this.covC.getContext('2d', { willReadFrequently: true });
  },
  brush(col) {                   // a soft dot in one colour, the spray's core
    let b = this.brushes.get(col); if (b) return b;
    b = document.createElement('canvas'); b.width = b.height = 64; const g = b.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); const c = new THREE.Color(col);
    const rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
    gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.45, `rgba(${rgb},.55)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); this.brushes.set(col, b); return b;
  },
  // one frame of spray at (u, v) (0..1, v down), r = footprint radius in texture px
  spray(u, v, r, col, dt) {
    const x = u * TW, y = v * TH, f = clamp(dt * 60, 0.3, 3), g = this.pg;
    g.globalAlpha = Math.min(1, 0.46 * f * clamp(16 / r, 0.4, 1.4)); g.drawImage(this.brush(col), x - r, y - r, 2 * r, 2 * r);
    g.globalAlpha = 0.9; g.fillStyle = col;
    const n = Math.round((18 + r * 1.5) * f), dotS = Math.max(1, r / 26);
    for (let i = 0; i < n; i++) {
      const dx = gauss() * r * 0.5, dy = gauss() * r * 0.5, s = (0.6 + Math.random() * 1.3) * dotS;
      g.fillRect(x + dx - s / 2, y + dy - s / 2, s, s);
    }
    g.globalAlpha = 0.55;                          // overspray: a few fine flecks further out, like a real can
    for (let i = 0, m = Math.round((3 + r * 0.35) * f); i < m; i++) { const s = dotS * (0.5 + Math.random() * 0.7); g.fillRect(x + gauss() * r * 1.05 - s / 2, y + gauss() * r * 1.05 - s / 2, s, s); }
    g.globalAlpha = 1;
    this.used.set(col, (this.used.get(col) || 0) + dt);
    // wet paint: a spot sprayed long and close starts to run
    const cx = clamp(Math.floor(x / 16), 0, 47), cy = clamp(Math.floor(y / 16), 0, 63), ci = cy * 48 + cx;
    this.wet[ci] += f * 0.05 * clamp(18 / r, 0.4, 2.5); this.wetCells.add(ci);
    if (this.wet[ci] > 1.2 && Math.random() < 0.07 * f && this.drips.length < 24) {
      this.wet[ci] *= 0.55;
      this.drips.push({ x: x + gauss() * r * 0.25, y: y + r * 0.35, w: 2 + r * 0.1, len: 24 + Math.random() * 80, sp: 40 + Math.random() * 40, col });
    }
    this.dirty = true;
  },
  // runs the drips down (the direction comes from the phone's gravity, projected onto the charm)
  tick(dt, down) {
    for (const ci of this.wetCells) { this.wet[ci] *= Math.pow(0.4, dt); if (this.wet[ci] < 0.02) { this.wet[ci] = 0; this.wetCells.delete(ci); } }
    if (!this.drips.length) return;
    const g = this.pg;
    for (let i = this.drips.length - 1; i >= 0; i--) {
      const d = this.drips[i]; const step = d.sp * dt * (down ? down.k : 1);
      if (step < 0.05) continue;                              // the charm is lying flat: the paint pools
      g.fillStyle = d.col; g.globalAlpha = 0.95;
      const dx = down ? down.x : 0, dy = down ? down.y : 1;
      for (let s = 0; s < step; s += 1) { g.beginPath(); g.arc(d.x, d.y, d.w, 0, 7); g.fill(); d.x += dx; d.y += dy; }
      d.len -= step; d.sp *= Math.pow(0.55, dt); d.w = Math.max(0.8, d.w * Math.pow(0.85, dt));
      if (d.len <= 0 || d.sp < 6) { g.beginPath(); g.arc(d.x, d.y, d.w * 1.7, 0, 7); g.fill(); this.drips.splice(i, 1); }
      this.dirty = true;
    }
    g.globalAlpha = 1;
  },
  composite() {
    if (!this.dirty) return false; this.dirty = false;
    const g = this.dg; g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, TW, TH);
    if (this.primer) { g.fillStyle = '#fbfaf5'; g.fillRect(0, 0, TW, TH); }
    g.drawImage(this.P, 0, 0);
    if (this.linesOn) g.drawImage(this.lines, 0, 0, TW, TH);
    g.globalCompositeOperation = 'destination-in'; g.drawImage(this.mask, 0, 0, TW, TH); g.globalCompositeOperation = 'source-over';
    return true;
  },
  measure() {                     // share of the cat that has paint on it
    this.covG.clearRect(0, 0, 48, 64); this.covG.drawImage(this.P, 0, 0, 48, 64);
    const d = this.covG.getImageData(0, 0, 48, 64).data; let n = 0, t = 0;
    for (let i = 0; i < this.maskSmall.length; i++) if (this.maskSmall[i]) { t++; if (d[i * 4 + 3] > 60) n++; }
    this.coverage = t ? n / t : 0; return this.coverage;
  },
  pushUndo() { try { this.undo.push(this.pg.getImageData(0, 0, TW, TH)); if (this.undo.length > 12) this.undo.shift(); } catch (e) { /* memory */ } },
  popUndo() { const d = this.undo.pop(); if (!d) return false; this.pg.putImageData(d, 0, 0); this.drips.length = 0; this.dirty = true; return true; },
  clear() { this.pg.clearRect(0, 0, TW, TH); this.drips.length = 0; this.used.clear(); this.undo.length = 0; this.dirty = true; },
  topColours(n = 5) { const a = [...this.used.entries()].sort((x, y) => y[1] - x[1]).map((e) => e[0]); return a.length ? a.slice(0, n) : ['#f6c344', '#3f9be6', '#e85bd8']; },
});

// ---------------------------------------------------------------- saved painting (IndexedDB, on this phone only)
let saved = null;     // the current charm's: { paint: Blob, primer, linesOn, colours, at } (each charm keeps its own, PIECES[k].saved)
function idb() {
  return new Promise((res, rej) => {
    try { const r = indexedDB.open('spray-bobo', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); }
  });
}
async function loadSaved() {
  try {
    const db = await idb();
    for (const P of Object.values(PIECES)) P.saved = await new Promise((res) => { const q = db.transaction('kv').objectStore('kv').get(P.key); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); });
  } catch (e) { /* none saved */ }
}
async function storeSaved(rec) {
  cp.saved = rec;
  try { const db = await idb(); await new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(rec, cp.key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); return true; } catch (e) { console.warn('save', e); return false; }
}
async function dropSaved() { try { const db = await idb(); db.transaction('kv', 'readwrite').objectStore('kv').delete(cp.key); } catch (e) { /* none */ } saved = cp.saved = null; }

// ---------------------------------------------------------------- three.js scene
let scene, camera, renderer;
const A = new THREE.Group();                  // follows the charm (world units per metre in its scale)
// The current charm's things (each charm has its own set, see usePiece): its picture in metres, its frame
// (x flipped on the charm's other side), its paint, the canvas on it, its outline, sticker, shadow, splats.
let cp = null, W = 0.0601, H = 0.0801, F = null, paint = null;
let paintTex, paintMesh, previewMesh, stickerPivot, sticker, shadow, splats, debugFrame, orbit, shine;
let stickerTex, stickerCanvas;
const clock = { t: 0 };
function buildScene(xr, [layout, lumImg, , arts]) {
  ({ scene, camera, renderer } = xr);
  probes = lumImg ? buildProbes(lumImg) : null;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.7;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x5a5560, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(1.2, 2.5, 4); scene.add(key);
  camera.position.set(0, 0, 0); camera.quaternion.identity();
  XR8.XrController.updateCameraProjectionMatrix({ origin: camera.position, facing: camera.quaternion });
  scene.add(A); A.visible = false; A.matrixAutoUpdate = true;
  Object.values(PIECES).forEach((P, i) => buildPiece(P, layout.targets[P.targets[0]], arts[i]));
  usePiece('bobo');
}
function buildPiece(P, L, [maskImg, linesImg, outline]) {
  const W = P.W = L.widthM, H = P.H = L.heightM;
  const F = P.F = new THREE.Group(); F.visible = false; A.add(F);
  const paint = P.paint = makePaint(); paint.init(maskImg, linesImg);
  P.centre = maskCentre(paint.maskSmall);                  // the middle of the stencil (uv, y down): the canvas spreads from here
  // the canvas on the charm. It spreads out from the middle of the charm with a ragged wet edge in EVADE
  // yellow (uReveal), flashes white when saved (uFlash), and fades as the sticker lifts off (uOpacity)
  P.paintTex = new THREE.CanvasTexture(paint.D); P.paintTex.colorSpace = THREE.SRGBColorSpace; P.paintTex.anisotropy = 4;
  const maskTex = new THREE.Texture(maskImg); maskTex.needsUpdate = true;
  P.paintMesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.ShaderMaterial({
    uniforms: { map: { value: P.paintTex }, mask: { value: maskTex }, uReveal: { value: 0 }, uFlash: { value: 0 }, uOpacity: { value: 1 }, uTime: { value: 0 },
      uEdge: { value: new THREE.Color('#f6c344') }, uInk: { value: new THREE.Color('#15131a') }, uC: { value: new THREE.Vector2(P.centre[0], 1 - P.centre[1]) }, uAsp: { value: W / H } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      precision highp float; varying vec2 vUv;
      uniform sampler2D map, mask; uniform float uReveal, uFlash, uOpacity, uTime, uAsp; uniform vec3 uEdge, uInk; uniform vec2 uC;
      float hs(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hs(i), hs(i + vec2(1.0, 0.0)), f.x), mix(hs(i + vec2(0.0, 1.0)), hs(i + vec2(1.0, 1.0)), f.x), f.y); }
      void main() {
        vec4 c = texture2D(map, vUv); float m = texture2D(mask, vUv).a;
        vec2 d = (vUv - uC) * vec2(uAsp, 1.0);
        float an = atan(d.y, d.x);
        // a wet, splashy edge: wobbles around the circle, with little runs
        float r = length(d) + (vn(vec2(an * 2.6 + 9.0, uTime * 1.3)) - 0.5) * 0.10 + (vn(vUv * 22.0) - 0.5) * 0.025;
        float R = uReveal * 0.82, going = step(0.001, uReveal) * step(uReveal, 0.999);
        float shown = step(r, R);
        float band = step(R, r) * step(r, R + 0.03) * going;
        float ink = step(R + 0.03, r) * step(r, R + 0.042) * going;
        vec3 col = mix(c.rgb, vec3(1.0), uFlash * 0.85);
        col = mix(col, uEdge, band); col = mix(col, uInk, ink);
        float a = max(c.a * shown, (band + ink) * m) * uOpacity;
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }));
  P.paintMesh.position.z = 0.0003; P.paintMesh.renderOrder = 10; P.paintMesh.visible = false; F.add(P.paintMesh);
  // "found you": the charm's outline lights up in EVADE yellow
  P.previewMesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: outlineTexture(linesImg), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  P.previewMesh.position.z = 0.0004; P.previewMesh.renderOrder = 11; P.previewMesh.visible = false; F.add(P.previewMesh);
  // the finished painting as a 3D die-cut sticker, with a flat shine band that sweeps over it now and then
  P.stickerCanvas = document.createElement('canvas'); P.stickerCanvas.width = TW; P.stickerCanvas.height = TH;
  P.stickerTex = new THREE.CanvasTexture(P.stickerCanvas); P.stickerTex.colorSpace = THREE.SRGBColorSpace; P.stickerTex.anisotropy = 4;
  P.stickerPivot = new THREE.Group(); F.add(P.stickerPivot); P.stickerPivot.visible = false;
  P.shine = { value: -1 };
  const face = new THREE.MeshPhysicalMaterial({ map: P.stickerTex, roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.12, side: THREE.DoubleSide });
  face.onBeforeCompile = (sh) => {
    sh.uniforms.uShine = P.shine;
    sh.fragmentShader = 'uniform float uShine;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n{ float sb = vMapUv.x * 0.55 + (1.0 - vMapUv.y); totalEmissiveRadiance += vec3(0.6) * (step(abs(sb - uShine), 0.045) + 0.7 * step(abs(sb - uShine + 0.12), 0.014)); }');
  };
  P.sticker = new THREE.Mesh(stickerGeometry(outline.points, W, H), [face, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 })]);
  P.sticker.renderOrder = 12; P.stickerPivot.add(P.sticker);
  P.shadow = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.95, H * 0.95), new THREE.MeshBasicMaterial({ map: shadowTexture(maskImg), transparent: true, depthWrite: false, opacity: 0 }));
  P.shadow.position.z = 0.0002; P.shadow.renderOrder = 9; F.add(P.shadow);
  P.splats = makeSplats(); F.add(P.splats.points);
  P.orbit = makeOrbit(); F.add(P.orbit.mesh);
  if (DEBUG) F.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(W, H)), new THREE.LineBasicMaterial({ color: 0xff00ff })));
  if (P.saved) restorePaint(P.saved, P);
}
// make a charm the current one: the globals the rest of the page uses point at its things
function usePiece(k) {
  const P = PIECES[k]; if (cp === P && P.F.visible) return;
  if (cp) cp.F.visible = false;
  cp = P; ({ W, H, F, paint, paintTex, paintMesh, previewMesh, stickerPivot, sticker, shadow, splats, orbit, shine, stickerTex, stickerCanvas } = P);
  saved = P.saved || null; F.visible = true; document.documentElement.dataset.piece = k;
}
function maskCentre(m) {   // the centroid of the 48x64 stencil, in uv (y down)
  let x = 0, y = 0, n = 0; for (let i = 0; i < m.length; i++) if (m[i]) { x += i % 48; y += Math.floor(i / 48); n++; }
  return n ? [(x / n + 0.5) / 48, (y / n + 0.5) / 64] : [0.5, 0.5];
}
// paint drops in your colours, orbiting the finished sticker (they pass behind him)
function makeOrbit() {
  const N = 7, mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshPhysicalMaterial({ roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 }), N);
  mesh.visible = false; mesh.renderOrder = 13; mesh.frustumCulled = false;
  const c = new THREE.Color('#f6c344'); for (let i = 0; i < N; i++) mesh.setColorAt(i, c);
  return { mesh, N, on: 0 };
}
const _om = new THREE.Matrix4(), _oq = new THREE.Quaternion(), _op = new THREE.Vector3(), _os = new THREE.Vector3();
function tickOrbit(dt, zc) {
  const o = orbit; if (!o) return;
  const want = mode === 'alive' && life.phase === 'idle' ? 1 : 0;
  o.on += (want - o.on) * Math.min(1, dt * 3); o.mesh.visible = o.on > 0.02; if (!o.mesh.visible) return;
  const t = clock.t, R = W * 0.62;
  for (let i = 0; i < o.N; i++) {
    const a = t * 0.9 + (i / o.N) * Math.PI * 2, r = 0.0016 + 0.0008 * Math.sin(i * 2.3) ;
    _op.set(Math.cos(a) * R, -H * 0.08 + Math.sin(a * 2 + i) * H * 0.06, zc + Math.sin(a) * R * 0.55);
    _os.setScalar(r * o.on * (1 + 0.15 * Math.sin(t * 6 + i)));
    o.mesh.setMatrixAt(i, _om.compose(_op, _oq, _os));
  }
  o.mesh.instanceMatrix.needsUpdate = true;
}
function colourOrbit(cols) { const c = new THREE.Color(); for (let i = 0; i < orbit.N; i++) { c.set(cols[i % cols.length]); orbit.mesh.setColorAt(i, c); } orbit.mesh.instanceColor.needsUpdate = true; }
function outlineTexture(linesImg) {   // flat: an ink rim, then the lines in EVADE yellow
  const c = document.createElement('canvas'); c.width = TW; c.height = TH; const g = c.getContext('2d');
  const tint = (col) => { const t = document.createElement('canvas'); t.width = TW; t.height = TH; const tg = t.getContext('2d'); tg.drawImage(linesImg, 0, 0, TW, TH); tg.globalCompositeOperation = 'source-in'; tg.fillStyle = col; tg.fillRect(0, 0, TW, TH); return t; };
  const ink = tint('#15131a'), yel = tint('#f6c344');
  for (let a = 0; a < 8; a++) g.drawImage(ink, Math.cos(a * 0.785) * 3, Math.sin(a * 0.785) * 3);
  g.drawImage(yel, 0, 0); g.drawImage(yel, 1, 0); g.drawImage(yel, 0, 1);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function shadowTexture(maskImg) {   // the sticker's soft shadow on the print: the cat's shape, blurred, in black
  const c = document.createElement('canvas'); c.width = 192; c.height = 256; const g = c.getContext('2d');
  g.filter = 'blur(10px)'; g.drawImage(maskImg, 16, 20, 160, 214); g.filter = 'none';
  g.globalCompositeOperation = 'source-in'; g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 0, 192, 256);
  return new THREE.CanvasTexture(c);
}
function stickerGeometry(points, W, H) {
  const shape = new THREE.Shape(points.map(([u, v]) => new THREE.Vector2((u - 0.5) * W, (0.5 - v) * H)));
  const depth = 0.0022;
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.0005, bevelSize: 0.0006, bevelSegments: 3, curveSegments: 2 });
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / W + 0.5, pos.getY(i) / H + 0.5);
  uv.needsUpdate = true; geo.translate(0, 0, -depth / 2); geo.computeVertexNormals();
  return geo;
}
// paint splats: a burst in the colours you used
function makeSplats() {
  const N = 160, geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 26, 0, 7); g.fill();
  for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.3; g.beginPath(); g.arc(32 + Math.cos(a) * 26, 32 + Math.sin(a) * 26, 6, 0, 7); g.fill(); }
  const points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1, map: new THREE.CanvasTexture(c), vertexColors: true, transparent: true, alphaTest: 0.4, depthWrite: false }));
  points.renderOrder = 14; points.frustumCulled = false;
  return { points, N, vel: new Float32Array(N * 3), life: new Float32Array(N), next: 0 };
}
function burstSplats(colours, n = 70, at = new THREE.Vector3(0, 0, 0.004), speed = 0.09) {
  const pos = splats.points.geometry.attributes.position, col = splats.points.geometry.attributes.color, cc = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const j = splats.next; splats.next = (splats.next + 1) % splats.N;
    const a = Math.random() * Math.PI * 2, e = Math.random() * 0.9 + 0.2, s = speed * (0.4 + Math.random());
    pos.setXYZ(j, at.x + (Math.random() - 0.5) * W * 0.6, at.y + (Math.random() - 0.5) * H * 0.6, at.z);
    splats.vel[j * 3] = Math.cos(a) * Math.cos(e) * s; splats.vel[j * 3 + 1] = Math.sin(a) * Math.cos(e) * s; splats.vel[j * 3 + 2] = Math.sin(e) * s;
    splats.life[j] = 0.6 + Math.random() * 0.7;
    cc.set(colours[i % colours.length]); col.setXYZ(j, cc.r, cc.g, cc.b);
  }
  pos.needsUpdate = col.needsUpdate = true;
}
function tickSplats(dt, scale) {
  const pos = splats.points.geometry.attributes.position; let alive = 0;
  for (let i = 0; i < splats.N; i++) {
    if (splats.life[i] <= 0) continue; splats.life[i] -= dt; alive++;
    splats.vel[i * 3 + 2] -= 0.25 * dt;                      // falls back toward the charm
    pos.setXYZ(i, pos.getX(i) + splats.vel[i * 3] * dt, pos.getY(i) + splats.vel[i * 3 + 1] * dt, Math.max(0.0005, pos.getZ(i) + splats.vel[i * 3 + 2] * dt));
    if (splats.life[i] <= 0) pos.setXYZ(i, 0, 0, -10);
  }
  pos.needsUpdate = true; splats.points.visible = alive > 0;
  splats.points.material.size = 0.0032 * scale;
}

// ---------------------------------------------------------------- tracking: the charm's pose, both sides, gyro bridge
const TS = {};                               // per image target: last pose from the engine
let probes = null;
function initTargets(targets) { for (const t of targets) TS[t.name] = { name: t.name, piece: PIECE_OF[t.name], pr: t.properties, tracked: false, at: 0, seen: -1e9, foundAt: 0, p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1, upp: 0 }; }
function onTarget(d) {
  const t = TS[d.name]; if (!t) return;
  const upp = d.scale * (d.scaledHeight || 1) / t.pr.height;          // world units per target pixel
  t.q.set(d.rotation.x, d.rotation.y, d.rotation.z, d.rotation.w);
  t.p.set(d.position.x, d.position.y, d.position.z);
  t.s = t.pr.height * upp / PIECES[t.piece].H; t.upp = upp;
  if (!t.tracked) { t.foundAt = performance.now(); diag.found++; tDiag(t.name).found++; }
  t.tracked = true; t.at = performance.now();
}
function onLost(d) { const t = TS[d.name]; if (t && t.tracked) { t.tracked = false; diag.lost++; tDiag(d.name).lost++; } }

// Which side of the charm: the print and its mirror (seen through the clear acrylic). The cat's face is
// nearly symmetric, so both pictures often lock onto one charm. The camera picture decides: under each
// picture's own pose, how well does that picture match the camera (blurred, 160 px)? The true side lines up
// everywhere; the mirror match is off at the tail. (Tested in the simulator: the own-fit test picked the right
// side in every sample, where the mirror-about-the-middle test of Off the Chain flipped with the tilt.)
let side = null, sideLead = 0, sideAt = 0, sampler = null;
const _pv = new THREE.Vector3();
function engineVideo() { return [...document.querySelectorAll('video')].find((v) => v.srcObject) || null; }
function camLuma() {
  const v = engineVideo(); if (!v || !v.videoWidth) return null;
  const k = 160 / Math.max(v.videoWidth, v.videoHeight), w = Math.round(v.videoWidth * k), h = Math.round(v.videoHeight * k);
  if (!sampler) { const c = document.createElement('canvas'); sampler = { c, g: c.getContext('2d', { willReadFrequently: true }) }; }
  if (sampler.c.width !== w || sampler.c.height !== h) { sampler.c.width = w; sampler.c.height = h; }
  sampler.g.drawImage(v, 0, 0, w, h);
  const d = sampler.g.getImageData(0, 0, w, h).data, L = new Float32Array(w * h), T = new Float32Array(w * h);
  for (let i = 0; i < L.length; i++) L[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; T[i] = (L[i - (x > 0)] + L[i] + L[i + (x < w - 1)]) / 3; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; L[i] = (T[i - (y > 0) * w] + T[i] + T[i + (y < h - 1) * w]) / 3; }
  }
  return { L, w, h, vw: v.videoWidth, vh: v.videoHeight };
}
// The probe: the kc-bobo picture at 30x40, and per cell how much it differs from the cat mirrored about its
// own middle (axis 0.4425 of the width, from Off the Chain's probe.json). Only cells that differ say which side
// is in view (the tail, the visor lettering), so the fit is weighted by that. kc-bobo-l is the exact mirror.
function buildProbes(img) {
  const cols = 30, rows = 40, axis = 0.4425, c = document.createElement('canvas'); c.width = cols; c.height = rows;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, cols, rows);
  const d = g.getImageData(0, 0, cols, rows).data, L = new Float32Array(cols * rows);
  for (let i = 0; i < L.length; i++) L[i] = d[i * 4];
  const wt = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let cc = 0; cc < cols; cc++) {
    const cm = Math.floor((2 * axis - (cc + 0.5) / cols) * cols);
    wt[r * cols + cc] = cm >= 0 && cm < cols ? Math.abs(L[r * cols + cc] - L[r * cols + cm]) : 40;
  }
  const mir = (a) => { const o = new Float32Array(a.length); for (let r = 0; r < rows; r++) for (let cc = 0; cc < cols; cc++) o[r * cols + cc] = a[r * cols + cols - 1 - cc]; return o; };
  return { 'kc-bobo': { cols, rows, lum: L, wt }, 'kc-bobo-l': { cols, rows, lum: mir(L), wt: mir(wt) } };
}
// how well a picture, placed by its own pose, matches the camera (weighted correlation, -1..1)
function sideScore(t, cam) {
  const pb = probes && probes[t.name]; if (!pb || !t.upp) return null;
  const cw = canvas.clientWidth, chh = canvas.clientHeight;
  const sc = Math.max(cw / cam.vw, chh / cam.vh), hw = cw / sc / 2, hh = chh / sc / 2;
  const Wp = t.pr.width * t.upp, Hp = t.pr.height * t.upp, k = cam.w / cam.vw;
  let sw = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, n = 0;
  for (let r = 0; r < pb.rows; r++) for (let c = 0; c < pb.cols; c++) {
    const i = r * pb.cols + c, w = pb.wt[i]; if (w < 12) continue;
    _pv.set(((c + 0.5) / pb.cols - 0.5) * Wp, (0.5 - (r + 0.5) / pb.rows) * Hp, 0).applyQuaternion(t.q).add(t.p).project(camera);
    const x = (cam.vw / 2 + _pv.x * hw) * k, y = (cam.vh / 2 - _pv.y * hh) * k;
    if (!(x >= 0 && y >= 0 && x < cam.w - 1 && y < cam.h - 1)) continue;
    const a = pb.lum[i], b = cam.L[(y | 0) * cam.w + (x | 0)];
    n++; sw += w; sa += w * a; sb += w * b; saa += w * a * a; sbb += w * b * b; sab += w * a * b;
  }
  if (n < 80) return null;
  const ma = sa / sw, mb = sb / sw, va = saa / sw - ma * ma, vb = sbb / sw - mb * mb;
  return va > 0 && vb > 0 ? (sab / sw - ma * mb) / Math.sqrt(va * vb) : null;
}
let soleSince = 0;
const onT = (n) => (TS[n] && TS[n].tracked ? TS[n] : null);
const pieceInView = (k) => PIECES[k].targets.some(onT);
const pieceSeen = (k) => Math.max(...PIECES[k].targets.map((n) => (TS[n] ? TS[n].seen : -1e9)));
// which charm: while painting, the one being painted; otherwise whichever is in view (the current one first)
function pickPiece(now) {
  if (!cp || mode === 'paint' || pieceInView(cp.k)) return;
  if (cp.F.visible && now - pieceSeen(cp.k) < 700) return;
  const k = Object.keys(PIECES).find(pieceInView); if (!k || k === cp.k) return;
  switchPiece(k);
}
function switchPiece(k) {
  usePiece(k); syncToggles(); side = null; sideLead = 0; soleSince = 0; pose.last = null; pose.snap = true;
  for (const P of Object.values(PIECES)) { P.stickerPivot.visible = false; P.paintMesh.visible = false; P.previewMesh.visible = false; P.shadow.material.opacity = 0; }
  life.phase = 'off'; setMode('find');                          // tick() then offers the can, or brings back its painting
  diag.pieces = (diag.pieces || 0) + 1;
}
function pickSide(now) {
  pickPiece(now);
  const [na, nb] = cp.targets, other = (n) => (n === na ? nb : na);
  const a = onT(na), b = onT(nb);
  if (side && !onT(side) && onT(other(side))) {
    // only the other side's picture is in view. For the cat, while painting, that is usually a mirror match on
    // the same charm, so the canvas stays put (the pose is bridged) unless it lasts: then the keychain was
    // turned over. The can's two sides are different prints, so that is a turn straight away.
    soleSince = soleSince || now;
    if (mode !== 'paint' || now - soleSince > (cp.mirrorPair ? 1500 : 250)) { side = other(side); sideLead = 0; diag.sides++; }
  } else soleSince = 0;
  if (side && !onT(side) && now - TS[side].seen > 700 && mode !== 'paint') side = null;
  if (!a && !b) return side;
  if (!side) side = a && b ? (a.foundAt <= b.foundAt ? na : nb) : a ? na : nb;
  if (cp.mirrorPair && a && b && now - sideAt > 120) {
    sideAt = now; const cam = camLuma();
    const sa = cam ? sideScore(a, cam) : null, sb = cam ? sideScore(b, cam) : null;
    if (sa != null && sb != null) sideLead = sideLead * 0.9 + (sa - sb) * 0.1;
    const need = mode === 'paint' ? 0.15 : 0.05;             // while painting it takes a clear, lasting lead to turn the canvas over
    const want = sideLead > need ? na : sideLead < -need ? nb : side;
    if (want !== side) { diag.sides++; side = want; }
  }
  return side;
}

// The gyroscope carries the pose through short dropouts. The browsers don't agree on rotationRate's axes,
// so four readings are tried side by side, and each is checked against the real tracking: every 0.3 s, the
// charm's turn on screen is predicted from each reading and compared with what the engine saw. One is only
// used once it predicts clearly better than holding still; with none, the pose is held for a moment only.
const gyro = {
  ok: false, best: -1, last: 0, maps: [
    (r) => [r.beta, r.gamma, r.alpha], (r) => [-r.beta, -r.gamma, -r.alpha],
    (r) => [r.alpha, r.beta, r.gamma], (r) => [-r.alpha, -r.beta, -r.gamma],
  ],
  acc: [0, 1, 2, 3].map(() => new THREE.Quaternion()),   // camera turn since the last tracked frame
  win: [0, 1, 2, 3].map(() => new THREE.Quaternion()),   // camera turn since the last check
  err: [0, 0, 0, 0], hold: 0, n: 0, ref: null, refAt: 0,
};
const _gq = new THREE.Quaternion(), _gv = new THREE.Vector3();
const gravity = { up: null };
function onMotion(e) {
  const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
  const rot = (x, y) => (ang === 90 ? [-y, x] : ang === 270 || ang === -90 ? [y, -x] : ang === 180 ? [-x, -y] : [x, y]);
  const a = e.accelerationIncludingGravity;
  if (a && a.x != null) {   // gravity, for which way the paint runs; and shakes, which refill the can
    let [x, y] = rot(a.x, a.y); const v = new THREE.Vector3(x, y, a.z); const m = v.length();
    if (m > 1) { v.normalize(); if (v.y + v.z < 0) v.negate(); gravity.up = gravity.up ? gravity.up.lerp(v, 0.15).normalize() : v; }
    if (m > 22) shakeKick(m);
  }
  const r = e.rotationRate; const now = performance.now();
  if (r && r.alpha != null && gyro.last) {
    const dt = Math.min((now - gyro.last) / 1000, 0.1);
    for (let k = 0; k < 4; k++) {
      const w = gyro.maps[k](r); const [wx, wy] = rot(w[0], w[1]);
      _gv.set(wx, wy, w[2]).multiplyScalar(Math.PI / 180); const an = _gv.length() * dt; if (an < 1e-6) continue;
      _gq.setFromAxisAngle(_gv.normalize(), an);
      gyro.acc[k].multiply(_gq); gyro.win[k].multiply(_gq);
    }
  }
  gyro.last = now;
}
const _qa = new THREE.Quaternion(), _qc = new THREE.Quaternion(), _qr = new THREE.Quaternion();
// the charm's turn as the phone sees it (the engine's camera is not always at rest in the scene)
const camRel = (q, out) => out.copy(camera.quaternion).invert().multiply(q);
function gyroCheck(t, now) {     // called on tracked frames
  for (const q of gyro.acc) q.identity();
  if (!gyro.last) return;
  camRel(t.q, _qr);
  if (!gyro.ref) { gyro.ref = _qr.clone(); gyro.refAt = now; for (const q of gyro.win) q.identity(); return; }
  if (now - gyro.refAt < 300) return;
  const hold = gyro.ref.angleTo(_qr);
  if (hold > 0.035 && hold < 0.8) {
    gyro.hold = gyro.hold * 0.8 + hold * 0.2; gyro.n++;
    for (let k = 0; k < 4; k++) { _qa.copy(gyro.win[k]).invert().multiply(gyro.ref); gyro.err[k] = gyro.err[k] * 0.8 + _qa.angleTo(_qr) * 0.2; }
    let best = -1; for (let k = 0; k < 4; k++) if (best < 0 || gyro.err[k] < gyro.err[best]) best = k;
    const ok = gyro.n >= 3 && gyro.err[best] < gyro.hold * 0.55;
    if (ok !== gyro.ok || best !== gyro.best) { gyro.ok = ok; gyro.best = best; diag.gyro = { ok, map: best, err: +gyro.err[best].toFixed(3), hold: +gyro.hold.toFixed(3), n: gyro.n }; }
  }
  gyro.ref.copy(_qr); gyro.refAt = now; for (const q of gyro.win) q.identity();
}

// the pose the scene uses this frame: 'track', 'gyro' (carried by the gyroscope), 'hold', or 'none'
const pose = { state: 'none', p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1, lostAt: 0, snap: true, last: null, valid: false, since: 0 };
function updatePose(now) {
  const n = pickSide(now), t = n && TS[n];
  for (const x of Object.values(TS)) { if (x.tracked && now - x.at > 500) x.tracked = false; if (x.tracked) x.seen = now; }
  let st;
  if (t && t.tracked) {
    st = 'track'; gyroCheck(t, now);
    pose.last = { p: t.p.clone(), q: t.q.clone(), s: t.s, side: n }; pose.lostAt = now;
    follow(t.p, t.q, t.s);
  } else if (pose.last) {
    const gone = now - pose.lostAt;
    if (gyro.ok && gone < BRIDGE_GYRO_MS) {
      // in the phone's frame: undo the phone's turn since the last tracked frame (C · gyro⁻¹ · C⁻¹)
      st = 'gyro'; _qc.copy(camera.quaternion); _qa.copy(_qc).multiply(_qr.copy(gyro.acc[gyro.best]).invert()).multiply(_qr.copy(_qc).invert());
      follow(pose.last.p.clone().sub(camera.position).applyQuaternion(_qa).add(camera.position), _qa.clone().multiply(pose.last.q), pose.last.s, true);
    } else if (gone < BRIDGE_HOLD_MS) st = 'hold';
    else st = 'none';
  } else st = 'none';
  if (st !== 'track' && st !== pose.state) { if (st === 'gyro') diag.bridges++; }
  if (st === 'gyro' || st === 'hold') diag.bridgeS += 1 / 60;
  if (st === 'none') pose.snap = true;
  pose.state = st; pose.valid = st !== 'none';
  A.visible = pose.valid;
  const flip = (pose.last && cp.flip[pose.last.side]) || 1;
  if (F.scale.x !== flip) { F.scale.x = flip; pose.snap = true; }
}
// Stick to the print: follow real movement at once, only smooth the sub-millimetre jitter of a charm held still
function follow(p, q, s, raw = false) {
  const aP = pose.snap || raw ? 1 : clamp(A.position.distanceTo(p) / s / 0.0025, 0.3, 1);
  const aR = pose.snap || raw ? 1 : clamp(A.quaternion.angleTo(q) / 0.04, 0.3, 1);
  const aS = pose.snap || raw ? 1 : clamp(Math.abs(A.scale.x - s) / s / 0.03, 0.3, 1);
  pose.snap = false;
  A.position.lerp(p, aP); A.quaternion.slerp(q, aR); A.scale.setScalar(THREE.MathUtils.lerp(A.scale.x, s, aS));
  A.updateMatrixWorld(true);
}

// ---------------------------------------------------------------- aiming: where the nozzle hits the canvas
const ray = new THREE.Raycaster(), _ndc = new THREE.Vector2(), _plane = new THREE.Plane(), _n = new THREE.Vector3(), _hit = new THREE.Vector3(), _loc = new THREE.Vector3(), _sc = new THREE.Vector3(), _sc2 = new THREE.Vector3();
// screen px -> the camera canvas's NDC (the canvas, not the window: on iPhones the two can differ in height)
function toNdc(px, py, out) { const r = canvas.getBoundingClientRect(); return out.set((px - r.left) / r.width * 2 - 1, -((py - r.top) / r.height) * 2 + 1); }
function nozzle0() { const r = canvas.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }
const aim = { finger: !TOUCH, x: 0, y: 0, has: false, u: 0, v: 0, on: false, dist: 0, rPx: 10, rScreen: 30, cos: 1 };
function aimAt(px, py) {
  aim.has = false; if (!pose.valid || !camera) return aim;
  toNdc(px, py, _ndc); camera.updateMatrixWorld(true); A.updateMatrixWorld(true);
  ray.setFromCamera(_ndc, camera);
  _n.set(0, 0, 1).applyQuaternion(A.quaternion); _plane.setFromNormalAndCoplanarPoint(_n, A.position);
  if (!ray.ray.intersectPlane(_plane, _hit)) return aim;
  _loc.copy(_hit); F.worldToLocal(_loc);
  aim.u = _loc.x / W + 0.5; aim.v = 0.5 - _loc.y / H;
  aim.on = aim.u > -0.05 && aim.u < 1.05 && aim.v > -0.05 && aim.v < 1.05;
  aim.dist = _hit.distanceTo(camera.position) / A.scale.x;   // metres
  aim.cos = Math.abs(ray.ray.direction.dot(_n));
  const rM = aim.dist * Math.tan(NOZZLES[nozzle].a * Math.PI / 180) / Math.sqrt(Math.max(aim.cos, 0.3));
  aim.rPx = clamp(rM / W * TW, 2.5, 150);
  // the footprint on screen: project a point one radius along the charm's x
  _sc.copy(_hit).project(camera); _sc2.set(1, 0, 0).applyQuaternion(A.quaternion).multiplyScalar(rM * A.scale.x).add(_hit).project(camera);
  const cr = canvas.getBoundingClientRect();
  aim.rScreen = clamp(Math.hypot((_sc2.x - _sc.x) * cr.width / 2, (_sc2.y - _sc.y) * cr.height / 2), 6, 220);
  aim.sx = cr.left + (_sc.x + 1) / 2 * cr.width; aim.sy = cr.top + (1 - _sc.y) / 2 * cr.height;   // where the hit shows on screen (should be the nozzle)
  aim.has = true; return aim;
}
// which way is down on the canvas (texture px per px of drip), from gravity; k = how steep the charm stands
const _dn = new THREE.Vector3(), _iq = new THREE.Quaternion();
function dripDown() {
  if (!gravity.up) return { x: 0, y: 1, k: 1 };
  _iq.copy(A.quaternion).invert(); _dn.copy(gravity.up).negate().applyQuaternion(camera.quaternion).applyQuaternion(_iq);   // phone -> world -> charm
  const k = Math.hypot(_dn.x, _dn.y); if (k < 0.15) return { x: 0, y: 0, k: 0 };
  return { x: _dn.x / k * F.scale.x, y: -_dn.y / k, k };
}

// ---------------------------------------------------------------- modes and UI
// find -> ready (charm found, can offered) -> paint -> alive (saved: the sticker lives on the charm)
let mode = 'find', capIdx = 0, nozzle = 1, level = 1, spraying = false, strokeOpen = false, everFound = false, lostFor = 0, flying = false;
const hud = $('hud');
function setMode(m) {
  mode = m; hud.dataset.mode = m;
  $('can').dataset.state = m === 'ready' ? 'offer' : m === 'paint' ? 'idle' : 'away';
  $('can').setAttribute('aria-label', m === 'ready' ? 'Spray can. Tap to start painting' : 'Spray can. Hold to spray');
  $('meter').hidden = m !== 'paint';
  previewMesh && (previewMesh.visible = m === 'ready');
  if (m !== 'paint') { stopSpray(); setCamMode(false); }
  syncRec();
}
// camera mode while painting: the tools step aside and the shutter takes the bottom centre; the can stays,
// so you can film yourself spraying
function setCamMode(on) {
  hud.classList.toggle('cam', on); toggle('b-cam', on, on ? 'Back to the paint tools' : 'Camera: take a photo or film');
  if (on) hint('Tap the shutter for a photo, hold it to film. Keep spraying', 2600);
}
$('b-cam').onclick = () => { setCamMode(!hud.classList.contains('cam')); buzz(6); };
$('b-back').onclick = () => { setCamMode(false); buzz(6); };
let hintT = 0;
function hint(text, ms = 0) { $('hint').textContent = text || ''; clearTimeout(hintT); if (ms) hintT = setTimeout(() => { if ($('hint').textContent === text) $('hint').textContent = ''; }, ms); }
let toastT = 0;
function toast(text, ms = 1400) { const t = $('toast'); t.textContent = text; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms); }
function setCap(i) {
  capIdx = i; document.documentElement.style.setProperty('--cap', CAPS[i].c);
  for (const b of document.querySelectorAll('.cap')) b.setAttribute('aria-checked', String(+b.dataset.i === i));
}
for (const [i, c] of CAPS.entries()) {
  const b = document.createElement('button'); b.className = 'cap'; b.type = 'button'; b.role = 'radio'; b.dataset.i = i; b.style.setProperty('--c', c.c); b.setAttribute('aria-label', c.n);
  b.onclick = () => { setCap(i); buzz(6); sound.tone(900 + i * 60, 1100 + i * 60, 0.06, 0.05, 'triangle'); };
  $('caps').appendChild(b);
}
setCap(0);
function setNozzle(i) {
  nozzle = i; $('size-t').textContent = NOZZLES[i].n; $('size-dot').setAttribute('r', NOZZLES[i].dot);
  $('b-size').setAttribute('aria-label', `Nozzle: ${NOZZLES[i].n.toLowerCase()}. Tap to change`);
}
setNozzle(1);
$('b-size').onclick = () => { setNozzle((nozzle + 1) % NOZZLES.length); buzz(6); sound.tone(500, 700, 0.06, 0.05, 'triangle'); };
function setLevel(l) { level = clamp(l, 0, 1); $('lvl').style.transform = `scaleY(${level.toFixed(3)})`; }
setLevel(1);
const toggle = (id, on, label) => { $(id).setAttribute('aria-pressed', String(on)); $(id).setAttribute('aria-label', label); };
$('b-lines').onclick = () => { paint.linesOn = !paint.linesOn; paint.dirty = true; toggle('b-lines', paint.linesOn, paint.linesOn ? 'Outline on' : 'Outline off'); toast(paint.linesOn ? 'Outline on' : 'Outline off', 900); };
$('b-primer').onclick = () => { paint.primer = !paint.primer; paint.dirty = true; toggle('b-primer', paint.primer, paint.primer ? 'White base coat on' : 'White base coat off: paint over the print'); toast(paint.primer ? 'White base' : 'Over the print', 900); };
$('b-aim').onclick = () => { aim.finger = !aim.finger; toggle('b-aim', aim.finger, aim.finger ? 'Paint with your finger. Tap to aim with your phone instead' : 'Aim with your phone. Tap to paint with your finger instead'); hint(aim.finger ? 'Paint with your finger on the screen' : 'Aim your phone like a can and hold the can to spray', 2600); };
toggle('b-aim', aim.finger, aim.finger ? 'Paint with your finger. Tap to aim with your phone instead' : 'Aim with your phone. Tap to paint with your finger instead');
let clearArmed = 0;
$('b-clear').onclick = () => {
  if (performance.now() - clearArmed > 2500) { clearArmed = performance.now(); hint('Tap the bin again to clear your painting', 2500); return; }
  clearArmed = 0; paint.pushUndo(); paint.clear(); sound.whoosh(); hint('Clean canvas. Undo brings it back', 2200); updateUndo();
};
$('b-undo').onclick = () => { if (paint.popUndo()) { sound.undo(); buzz(8); } updateUndo(); };
function updateUndo() { $('b-undo').disabled = !paint.undo.length; }
$('b-sound').onclick = () => { sound.on = !sound.on; sound.spray(0); toggle('b-sound', sound.on, sound.on ? 'Sound on' : 'Sound off'); };


// ---------------------------------------------------------------- the can: tap (ready), hold to spray (paint), shake to refill
const can = $('can');
can.addEventListener('contextmenu', (e) => e.preventDefault());
can.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (flying) return;
  if (mode === 'ready') { startPainting(false, true); return; }
  if (mode !== 'paint') return;
  try { can.setPointerCapture(e.pointerId); } catch (err) { /* old Safari */ }
  if (level <= 0.001 && !ENDLESS) { refill(0.16); return; }   // no motion sensor: tapping the empty can shakes it
  startSpray(null);
});
can.addEventListener('pointerup', () => stopSpray());
can.addEventListener('pointercancel', () => stopSpray());
// the screen: while painting, holding it also sprays (aim mode: at the nozzle in the middle; finger mode: under
// the finger). Once saved: tap him to make him hop, hold him and let go for a big jump, swipe to spin him.
const cv = $('cam');
const gest = { id: null, x: 0, lx: 0, t: 0, lt: 0, on: false, drag: false };
cv.addEventListener('pointerdown', (e) => {
  if (mode === 'alive') {
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* old Safari */ }
    Object.assign(gest, { id: e.pointerId, x: e.clientX, lx: e.clientX, t: performance.now(), lt: performance.now(), on: hitSticker(e.clientX, e.clientY), drag: false });
    if (gest.on && life.phase === 'idle') { life.press = true; buzz(6); }
    return;
  }
  if (mode !== 'paint') return;
  try { cv.setPointerCapture(e.pointerId); } catch (err) { /* old Safari */ }
  startSpray(aim.finger ? { x: e.clientX, y: e.clientY } : null);
});
cv.addEventListener('pointermove', (e) => {
  if (spraying && fingerAt) { fingerAt.x = e.clientX; fingerAt.y = e.clientY; }
  if (mode === 'alive' && gest.id === e.pointerId && life.phase === 'idle') {
    const now = performance.now(), dx = e.clientX - gest.lx;
    if (!gest.drag && Math.abs(e.clientX - gest.x) > 14) { gest.drag = true; life.press = false; }
    if (gest.drag) { const k = 0.014; life.uy += dx * k; life.uv = (dx * k) / Math.max((now - gest.lt) / 1000, 0.008); life.dragging = true; }
    gest.lx = e.clientX; gest.lt = now;
  }
});
function endGesture(e) {
  if (mode !== 'alive' || gest.id !== e.pointerId) return;
  const held = performance.now() - gest.t; gest.id = null; life.dragging = false;
  if (gest.drag) { if (performance.now() - gest.lt > 90) life.uv = 0; if (Math.abs(life.uv) > 6) { sound.whoosh(); buzz(8); } }
  else if (gest.on && life.phase === 'idle') { const sq = life.squish; life.press = false; jump(held > 260 ? 2 : 1, sq); }
  else life.press = false;
}
cv.addEventListener('pointerup', (e) => { stopSpray(); endGesture(e); });
cv.addEventListener('pointercancel', (e) => { stopSpray(); endGesture(e); });
addEventListener('keydown', (e) => { if (e.code === 'Space' && mode === 'paint' && !e.repeat && document.activeElement === document.body) { e.preventDefault(); startSpray(null); } });
addEventListener('keyup', (e) => { if (e.code === 'Space') stopSpray(); });
let fingerAt = null, buzzT = 0, emptyNag = 0;
function startSpray(at) {
  if (flying) return;
  fingerAt = at; spraying = true; strokeOpen = false; can.dataset.state = 'spray';
  if (!at) fingerAt = null;
}
function stopSpray() {
  if (!spraying) return; spraying = false; fingerAt = null; sound.spray(0);
  if (mode === 'paint') can.dataset.state = level <= 0.001 && !ENDLESS ? 'empty' : 'idle';
  strokeOpen = false; paint.measure(); updateMeter(); updateUndo(); milestone();
}
let lastShake = 0;
function shakeKick() {
  const now = performance.now(); if (now - lastShake < 160) return; lastShake = now;
  if (mode === 'ready' || mode === 'paint') refill(0.14);
  if (mode === 'alive') shakeOff();
}
let shakeT = 0;
function refill(k) {
  if (level >= 1) { sound.rattle(2); return; }
  setLevel(level + k); sound.rattle(3); buzz(15);
  if (!spraying) { can.dataset.state = 'shake'; clearTimeout(shakeT); shakeT = setTimeout(() => { if (!spraying && mode === 'paint') can.dataset.state = 'idle'; }, 260); }
  if (level >= 1) hint('Full can. Spray away', 1400);
}
function updateMeter() { const p = Math.round(paint.coverage * 100); $('meter').querySelector('i').style.width = p + '%'; $('meter-t').textContent = `Painted ${p}%`; }
// little cheers as the charm fills up (once each per painting)
const MILESTONES = [[0.25, 'Nice!'], [0.5, 'Fresh!'], [0.8, 'Masterpiece!']];
function milestone() {
  const i = cp.mile || 0; if (i >= MILESTONES.length || paint.coverage < MILESTONES[i][0]) return;
  cp.mile = i + 1; toast(MILESTONES[i][1], 1300); sound.sparkle(); buzz([10, 30, 10]);
  burstSplats(paint.topColours(), 26, centreLocal(0.004), 0.06);
}

// ---------------------------------------------------------------- the flow
// Tapping the offered can: it flies onto the charm and bursts, and the blank canvas spreads out from the
// charm's middle with a wet yellow edge.
function startPainting(fresh = false, fly = false) {
  if (fresh) paint.clear();
  setMode('paint'); syncToggles();
  stickerPivot.visible = false; shadow.material.opacity = 0; orbit.mesh.visible = false; orbit.on = 0;
  const u = paintMesh.material.uniforms; u.uOpacity.value = 1; u.uFlash.value = 0; u.uReveal.value = 0;
  paintMesh.visible = true; paint.dirty = true; reveal = null;
  paint.measure(); cp.mile = MILESTONES.filter(([k]) => paint.coverage >= k).length;
  if (fly) {
    previewMesh.visible = true; previewMesh.material.opacity = 1;
    flying = true; can.dataset.state = 'away'; can.style.visibility = 'hidden';
    sound.rattle(5); buzz([10, 40, 10]);
    flyCan(() => { flying = false; beginReveal(); setTimeout(() => { can.style.visibility = ''; if (mode === 'paint') can.dataset.state = 'idle'; }, 350); });
  } else { sound.rattle(3); beginReveal(); }
  hint(aim.finger ? `Paint ${cp.name} with your finger` : `Aim at ${cp.name} and hold the can to spray`, 4200);
  updateMeter(); updateUndo();
  postEvent('play', { step: 'paint', piece: cp.k });
}
let reveal = null;
function beginReveal() {
  reveal = { t: 0, dur: 1.25 }; sound.pssh(); buzz(30);
  burstSplats([CAPS[capIdx].c, '#ffffff', '#f6c344'], 46, centreLocal(0.003), 0.07);
  const at = pieceScreen(); if (at) popWord('PSSHT!', at[0], at[1]);
}
const _cl = new THREE.Vector3();
function centreLocal(z) { return new THREE.Vector3((cp.centre[0] - 0.5) * W, (0.5 - cp.centre[1]) * H, z); }
function pieceScreen() {   // the charm's middle on screen (px), or null
  if (!pose.valid || !camera) return null;
  _cl.copy(centreLocal(0)); F.localToWorld(_cl); _cl.project(camera); const r = canvas.getBoundingClientRect();
  return [r.left + (_cl.x + 1) / 2 * r.width, r.top + (1 - _cl.y) / 2 * r.height];
}
function flyCan(done) {
  const r = can.getBoundingClientRect(), [tx, ty] = pieceScreen() || nozzle0();
  const el = document.createElement('div'); el.className = 'can-fly'; el.setAttribute('aria-hidden', 'true');
  el.innerHTML = can.querySelector('svg').outerHTML.replace(/id="[^"]*"/g, '');
  Object.assign(el.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  hud.appendChild(el);
  const dx = tx - (r.left + r.width / 2), dy = ty - (r.top + r.height * 0.06);
  let fin = false; const end = () => { if (fin) return; fin = true; el.remove(); done(); };
  if (!el.animate) { setTimeout(end, 50); return; }
  el.animate([
    { transform: 'translate(0,0) rotate(0deg) scale(1)' },
    { transform: `translate(${dx * 0.5}px,${dy * 0.5 - 70}px) rotate(-30deg) scale(.75)`, offset: 0.5 },
    { transform: `translate(${dx}px,${dy}px) rotate(-48deg) scale(.42)`, opacity: 1, offset: 0.86 },
    { transform: `translate(${dx}px,${dy}px) rotate(-48deg) scale(.15)`, opacity: 0 },
  ], { duration: 560, easing: 'cubic-bezier(.35,.05,.35,1)', fill: 'forwards' }).onfinish = end;
  setTimeout(end, 900);
}
function popWord(text, x, y) {
  const el = document.createElement('div'); el.className = 'pop-word'; el.textContent = text; el.setAttribute('aria-hidden', 'true');
  el.style.left = clamp(x, 80, innerWidth - 80) + 'px'; el.style.top = clamp(y - 30, 90, innerHeight - 200) + 'px'; el.style.setProperty('--c', CAPS[capIdx].c);
  hud.appendChild(el); setTimeout(() => el.remove(), 1000);
}
$('b-done').onclick = async () => {
  paint.measure();
  if (paint.coverage < 0.015) { toast('Spray some paint first'); return; }
  await savePainting();
  startAlive(true);
};
async function savePainting() {
  const blob = await new Promise((res) => paint.P.toBlob(res, 'image/png'));
  saved = { paint: blob, primer: paint.primer, linesOn: paint.linesOn, colours: paint.topColours(), at: Date.now() };
  const ok = await storeSaved(saved);
  diag.saves++; postEvent('custom', { action: 'spray-save', piece: cp.k, painted: Math.round(paint.coverage * 100), colours: saved.colours.length });
  if (!ok) hint('Saved for this visit (this browser would not keep it)', 2600);
}
async function restorePaint(rec, P) {
  const pt = P.paint; pt.primer = rec.primer !== false; pt.linesOn = rec.linesOn !== false;
  try { const bmp = await createImageBitmap(rec.paint); pt.pg.clearRect(0, 0, TW, TH); pt.pg.drawImage(bmp, 0, 0); pt.dirty = true; pt.measure(); } catch (e) { console.warn('restore', e); }
  for (const c of rec.colours || []) pt.used.set(c, 1);
}
function syncToggles() {   // the outline and base coat buttons show the current charm's paint
  toggle('b-lines', paint.linesOn, paint.linesOn ? 'Outline on' : 'Outline off'); toggle('b-primer', paint.primer, paint.primer ? 'White base coat on' : 'White base coat off: paint over the print');
}

async function bakeSticker() {   // the sticker's face: the painting; without the base coat, the print shows under the paint
  const g = stickerCanvas.getContext('2d'); g.clearRect(0, 0, TW, TH);
  if (!paint.primer) { try { cp.printImg = cp.printImg || await loadImg(KC + 'image-targets/' + cp.print); g.drawImage(cp.printImg, 0, 0, TW, TH); } catch (e) { g.fillStyle = '#fbfaf5'; g.fillRect(0, 0, TW, TH); } }
  paint.dirty = true; paint.composite(); g.drawImage(paint.D, 0, 0);
  // the cut: outside the stencil stays clear, the edge of the sticker is white
  g.globalCompositeOperation = 'destination-in'; g.drawImage(paint.mask, 0, 0, TW, TH); g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#ffffff'; g.fillRect(0, 0, TW, TH);
  g.globalCompositeOperation = 'source-over';
  stickerTex.needsUpdate = true;
}
// Once saved: the painting flashes, peels off the charm as a 3D sticker, spins and settles above the print.
// Then he lives there: he turns to look at the phone, paint drops in his colours orbit him, a shine sweeps
// over the gloss now and then. Tap him (hop), hold and let go (big jump), swipe (spin), shake the phone (he
// shakes the wet paint off).
const life = { t: 0, phase: 'off', hopAt: 4, hop: null, spin: null, lx: 0, ly: 0, uy: 0, uv: 0, dragging: false, press: false, squish: 0, wig: null, shineAt: 2.5, tipAt: 0, tip: 0 };
const TIPS = ['Tap him to make him hop', 'Swipe to spin him', 'Hold him, then let go', 'Shake your phone', 'Tap the shutter for a photo, hold it to film'];
async function startAlive(justSaved) {
  await bakeSticker();
  setMode('alive');
  Object.assign(life, { t: 0, phase: justSaved ? 'flash' : 'lift', hop: null, spin: null, hopAt: 5 + Math.random() * 3, uy: 0, uv: 0, press: false, squish: 0, wig: null, shineAt: 2.5, tipAt: justSaved ? 3.2 : 2.4, tip: 0, burst: false });
  colourOrbit(paint.topColours(7));
  paintMesh.visible = justSaved; paintMesh.material.uniforms.uOpacity.value = 1; paintMesh.material.uniforms.uReveal.value = 1;
  stickerPivot.visible = false;
  if (justSaved) { toast('Fresh!'); sound.pssh(); buzz([20, 60, 20]); } else hint(cp.back, 2200);
}
function jump(kind, power = 0) {   // 1: a hop; 2: the big one (after holding him), with a spin and a burst
  const big = kind === 2;
  life.hop = { t: 0, big, k: big ? 1 + power * 0.6 : 1 }; sound.mew(); buzz(big ? [15, 30, 25] : 12);
  burstSplats(paint.topColours(), big ? 50 : 22, new THREE.Vector3(0, -H * 0.3, 0.004), big ? 0.08 : 0.05);
}
function shakeOff() {
  if (life.phase !== 'idle') return;
  life.wig = { t: 0 }; sound.rattle(4); buzz([12, 30, 12]);
  burstSplats(paint.topColours(), 18, new THREE.Vector3(0, 0, stickerPivot.position.z), 0.1);
}
function tickAlive(dt) {
  if (mode !== 'alive') return;
  life.t += dt; const u = paintMesh.material.uniforms;
  const HOVER = 0.016;
  if (life.phase === 'flash') {
    const k = life.t / 0.7; u.uFlash.value = Math.sin(clamp(k, 0, 1) * Math.PI);
    if (k >= 0.55 && !life.burst) { life.burst = true; burstSplats(paint.topColours(), 70); sound.pop(); }
    if (k >= 1) { life.phase = 'lift'; life.t = 0; life.burst = false; }
  }
  if (life.phase === 'lift') {
    if (!stickerPivot.visible) { stickerPivot.visible = true; sound.whoosh(); setTimeout(() => sound.sparkle(), 500); }
    const k = clamp(life.t / 1.3, 0, 1), e = easeInOut(k);
    u.uOpacity.value = 1 - easeOut(k * 3); paintMesh.visible = u.uOpacity.value > 0.01;
    stickerPivot.position.set(0, 0, 0.0012 + HOVER * e + Math.sin(k * Math.PI) * 0.012);
    sticker.rotation.set(0, e * Math.PI * 2, 0);
    const sq = k > 0.85 ? 1 + Math.sin((k - 0.85) / 0.15 * Math.PI) * 0.06 : 1;
    sticker.scale.set(1 / sq, sq, 1);
    if (k >= 1) { life.phase = 'idle'; life.t = 0; sticker.rotation.set(0, 0, 0); sticker.scale.set(1, 1, 1); burstSplats(paint.topColours(), 30, new THREE.Vector3(0, -H * 0.35, 0.002), 0.05); }
  }
  if (life.phase === 'idle') {
    const t = life.t;
    let z = HOVER + Math.sin(t * 1.7) * 0.0018, ry = Math.sin(t * 0.7) * 0.16, rx = Math.sin(t * 0.9 + 1) * 0.07, rz = 0, sy = 1 + Math.sin(t * 2.2) * 0.012;
    // he looks at the phone: turn the face part of the way toward the camera
    _cl.copy(camera.position); F.worldToLocal(_cl);
    const yaw = clamp(Math.atan2(_cl.x, _cl.z), -0.7, 0.7) * 0.5, pitch = clamp(Math.atan2(-_cl.y, _cl.z), -0.7, 0.7) * 0.4, f = Math.min(1, dt * 4);
    life.ly += (yaw - life.ly) * f; life.lx += (pitch - life.lx) * f; ry += life.ly; rx += life.lx;
    // swipe to spin: coasts, then settles face-front on the nearest full turn
    if (!life.dragging) {
      life.uy += life.uv * dt; life.uv *= Math.pow(0.12, dt);
      if (Math.abs(life.uv) < 1.5) { const tgt = Math.round(life.uy / (Math.PI * 2)) * Math.PI * 2; life.uy += (tgt - life.uy) * Math.min(1, dt * 5); life.uv *= Math.pow(0.02, dt); }
    }
    ry += life.uy;
    // pressed: he squashes down, ready to jump
    life.squish += ((life.press ? 1 : 0) - life.squish) * Math.min(1, dt * (life.press ? 3 : 12));
    sy *= 1 - life.squish * 0.16; z -= life.squish * 0.004;
    if (t > life.hopAt && !life.hop && !life.press && !life.dragging) { life.hop = { t: 0, big: false, k: 0.8 }; life.hopAt = t + 6 + Math.random() * 4; }
    if (life.hop) {                                   // a hop and a wiggle; the big one spins too
      const h = life.hop; h.t += dt; const k = h.t / (h.big ? 0.95 : 0.6);
      z += Math.sin(clamp(k, 0, 1) * Math.PI) * (h.big ? 0.022 : 0.009) * h.k;
      rz = Math.sin(k * Math.PI * 4) * 0.16 * (1 - clamp(k, 0, 1));
      sy *= k < 0.15 ? 1 - Math.sin(k / 0.15 * Math.PI) * 0.1 : 1;
      if (h.big && k > 0.15 && !h.spun) { h.spun = true; life.spin = { t: 0 }; }
      if (k >= 1) { life.hop = null; if (h.big) { burstSplats(paint.topColours(), 24, new THREE.Vector3(0, -H * 0.35, 0.002), 0.04); sound.pop(); } }
    }
    if (life.wig) { life.wig.t += dt; const k = clamp(life.wig.t / 0.7, 0, 1); rz += Math.sin(k * Math.PI * 9) * 0.22 * (1 - k); if (k >= 1) life.wig = null; }
    if (life.spin) { life.spin.t += dt; const k = clamp(life.spin.t / 0.8, 0, 1); ry += easeInOut(k) * Math.PI * 2; if (k >= 1) life.spin = null; }
    stickerPivot.position.set(0, 0, z); sticker.rotation.set(rx, ry, rz); sticker.scale.set(1 / Math.sqrt(sy), sy, 1);
    // the shine: a flat white band across the gloss every few seconds
    if (t > life.shineAt) { const k = (t - life.shineAt) / 0.9; shine.value = -0.4 + k * 2.2; if (k >= 1) { shine.value = -1; life.shineAt = t + 3.5 + Math.random() * 2; } }
    if (t > life.tipAt) { hint(TIPS[life.tip % TIPS.length], 2600); life.tip++; life.tipAt = t + (life.tip < TIPS.length ? 5 : 22); }
  }
  shadow.material.opacity = stickerPivot.visible ? clamp(0.85 - stickerPivot.position.z * 18, 0.25, 0.8) : 0;
  const ss = 1 + stickerPivot.position.z * 6; shadow.scale.set(ss, ss, 1);
}
function hitSticker(x, y) {
  if (!pose.valid || !stickerPivot.visible) return false;
  toNdc(x, y, _ndc); camera.updateMatrixWorld(true); A.updateMatrixWorld(true); ray.setFromCamera(_ndc, camera);
  return ray.intersectObject(sticker, false).length > 0;
}
$('b-spin').onclick = () => { if (life.phase === 'idle') { life.uv = (life.uv >= 0 ? 1 : -1) * 22; sound.whoosh(); buzz(8); } };
$('b-repaint').onclick = () => { stickerPivot.visible = false; shadow.material.opacity = 0; startPainting(); };
let newArmed = 0;
$('b-new').onclick = async () => {
  if (performance.now() - newArmed > 2500) { newArmed = performance.now(); hint(`Tap New again to start ${cp.name} fresh`, 2500); return; }
  newArmed = 0; await dropSaved(); stickerPivot.visible = false; shadow.material.opacity = 0; startPainting(true);
};

// ---------------------------------------------------------------- per frame
const mist = { c: $('mist'), g: null, parts: [] };
let coverT = 0, aimLogAt = 0;
function tick(dt) {
  const now = performance.now(); clock.t += dt;
  updatePose(now);
  if (pose.valid && pose.state === 'track') {
    lostFor = 0;
    if (!everFound) { everFound = true; diag.firstFoundS = +((now - camStartAt) / 1000).toFixed(1); postEvent('sighting', { piece: cp.k }); }
    if (mode === 'find') {
      if (saved) startAlive(false);
      else { setMode('ready'); sound.found(); buzz([12, 50, 12]); hint(cp.found); }
    }
  } else if (!pose.valid) lostFor += dt;
  hud.classList.toggle('lost', !pose.valid && lostFor > 1.2);
  const again = `Point at ${cp.name} again`;
  if (mode === 'find' && !pose.valid) hint(everFound ? 'Point at Bobo or the can' : 'Point your camera at the Bobo or the can charm');
  else if (mode !== 'find' && !pose.valid && lostFor > 1.2) hint(again);
  else if (pose.valid && $('hint').textContent === again) hint('');
  paintMesh.material.uniforms.uTime.value = clock.t;
  if (mode === 'ready' && previewMesh) previewMesh.material.opacity = 0.65 + Math.sin(now / 260) * 0.35;

  // the canvas spreading out over the charm; the yellow outline fades as it goes
  if (reveal) {
    reveal.t += dt; const k = clamp(reveal.t / reveal.dur, 0, 1); paintMesh.material.uniforms.uReveal.value = easeOut(k);
    if (previewMesh.visible) { previewMesh.material.opacity = 1 - k; if (k >= 1) previewMesh.visible = false; }
    if (k >= 1) reveal = null;
  }

  // aim + spray
  let [ax, ay] = nozzle0();
  if (aim.finger && fingerAt) { ax = fingerAt.x; ay = fingerAt.y; }
  if (mode === 'paint') {
    aimAt(ax, ay);
    const ret = $('reticle'); ret.style.left = ax + 'px'; ret.style.top = ay + 'px';
    if (aim.has && now - aimLogAt > 1000) {   // test log: how far the paint's spot shows from the nozzle, and how far the engine turns the camera
      aimLogAt = now; const e = Math.hypot(aim.sx - ax, aim.sy - ay); diag.aim = { errPx: +e.toFixed(1), maxPx: Math.max((diag.aim && diag.aim.maxPx) || 0, +e.toFixed(1)), camDeg: +(camera.quaternion.angleTo(new THREE.Quaternion()) * 57.3).toFixed(1), canvas: [Math.round(canvas.clientWidth), Math.round(canvas.clientHeight)], win: [innerWidth, innerHeight], dpr: devicePixelRatio };
    }
    ret.classList.toggle('on', aim.has && (!aim.finger || spraying));
    ret.classList.toggle('off', !aim.on);
    ret.classList.toggle('spray', spraying && aim.on);
    ret.style.setProperty('--r2', (aim.rScreen * 2).toFixed(0) + 'px');
    const cm = Math.round(aim.dist * 100), dTxt = aim.has ? (cm > 40 ? `${cm} cm · come closer` : `${cm} cm`) : '';
    if ($('dist').textContent !== dTxt) $('dist').textContent = dTxt;
    const empty = level <= 0.001 && !ENDLESS;
    if (spraying && !empty) {
      sound.spray(1);
      if (now - buzzT > 140) { buzzT = now; buzz(6); }
      if (!ENDLESS) setLevel(level - dt / CAN_SECONDS);
      if (aim.has && aim.on && pose.valid) {
        if (!strokeOpen) { paint.pushUndo(); strokeOpen = true; updateUndo(); }
        // fill the gap since the last frame so a fast sweep stays a line
        const lu = aim.lu, lv = aim.lv; const steps = lu == null ? 1 : clamp(Math.ceil(Math.hypot((aim.u - lu) * TW, (aim.v - lv) * TH) / Math.max(aim.rPx * 0.5, 2)), 1, 12);
        for (let i = 1; i <= steps; i++) { const k = i / steps; paint.spray(lu == null ? aim.u : lu + (aim.u - lu) * k, lv == null ? aim.v : lv + (aim.v - lv) * k, aim.rPx, CAPS[capIdx].c, dt / steps); }
        aim.lu = aim.u; aim.lv = aim.v; diag.sprayS += dt; if (pose.state !== 'track') diag.bridgeSprayS += dt;
      } else { aim.lu = aim.lv = null; }
      emitMist(ax, ay, aim.has ? aim.rScreen : 40, dt);
      if (level <= 0.001 && !ENDLESS) { can.dataset.state = 'empty'; sound.spray(0); sound.sputter(); hint(gravity.up ? 'Out of paint! Shake your phone to refill' : 'Out of paint! Tap the can to shake it', 3000); }
    } else {
      sound.spray(0); aim.lu = aim.lv = null;
      if (spraying && empty && now - emptyNag > 900) { emptyNag = now; sound.sputter(); }
    }
    coverT += dt; if (coverT > 0.5 && spraying) { coverT = 0; paint.measure(); updateMeter(); milestone(); }
  } else $('reticle').classList.remove('on');
  paint.tick(dt, pose.valid ? dripDown() : null);
  if (paint.composite() && paintTex) paintTex.needsUpdate = true;
  tickAlive(dt);
  tickOrbit(dt, stickerPivot.position.z);
  if (splats) tickSplats(dt, A.scale.x);
  tickMist(dt);
  recTick();
  diag.fpsN++;
}
// The spray on screen (flat dots, no gradients): a jet from the can's nozzle to the spot, a cloud puffing out
// where it hits, and flecks of overspray around it.
function mistFrom() {
  if (aim.finger && fingerAt) return [innerWidth / 2, innerHeight + 30];
  const r = can.getBoundingClientRect(); return r.width ? [r.left + r.width * 0.5, r.top + r.height * 0.05] : [innerWidth, innerHeight];
}
function emitMist(x, y, r, dt) {
  const col = CAPS[capIdx].c, f = clamp(dt * 60, 0.5, 2.5), [nx, ny] = mistFrom(), P = mist.parts;
  if (P.length > 420) P.splice(0, P.length - 420);
  for (let i = 0; i < Math.round(5 * f); i++) P.push({ k: 0, x0: nx + gauss() * 3, y0: ny + gauss() * 3, x1: x + gauss() * r * 0.4, y1: y + gauss() * r * 0.4, t: -Math.random() * 0.05, life: 0.15 + Math.random() * 0.08, s: 1.4 + Math.random() * 2.6, col });
  for (let i = 0; i < Math.round(2 * f); i++) P.push({ k: 1, x0: x + gauss() * r * 0.3, y0: y + gauss() * r * 0.3, vx: gauss() * r * 1.3, vy: gauss() * r * 1.3 - r * 0.5, t: 0, life: 0.4 + Math.random() * 0.3, s: r * (0.1 + Math.random() * 0.16) + 2, col });
  for (let i = 0; i < Math.round(3 * f); i++) P.push({ k: 2, x0: x + gauss() * r * 0.85, y0: y + gauss() * r * 0.85, vx: gauss() * 12, vy: 14 + Math.random() * 20, t: 0, life: 0.35 + Math.random() * 0.3, s: 0.8 + Math.random() * 1.6, col });
}
function tickMist(dt) {
  const c = mist.c; if (!mist.g) mist.g = c.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2), w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const g = mist.g; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, innerWidth, innerHeight);
  if (!mist.parts.length) return;
  for (let i = mist.parts.length - 1; i >= 0; i--) {
    const p = mist.parts[i]; p.t += dt; if (p.t < 0) continue;
    const k = p.t / p.life; if (k >= 1) { mist.parts.splice(i, 1); continue; }
    let x, y, s, a;
    if (p.k === 0) { const e = easeOut(k); x = p.x0 + (p.x1 - p.x0) * e; y = p.y0 + (p.y1 - p.y0) * e; s = p.s * (0.6 + k * 0.8); a = 0.75 * (1 - k * k); }
    else if (p.k === 1) { const e = easeOut(k); x = p.x0 + p.vx * e; y = p.y0 + p.vy * e; s = p.s * (1 + k * 1.4); a = 0.2 * (1 - k); }
    else { x = p.x0 + p.vx * p.t; y = p.y0 + p.vy * p.t; s = p.s; a = 0.85 * (1 - k); }
    g.globalAlpha = a; g.fillStyle = p.col; g.beginPath(); g.arc(x, y, s, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
}

// ---------------------------------------------------------------- 8th Wall pipeline
const canvas = $('cam');
// The engine's renderer.setSize() writes the drawing size into the canvas's inline style, so with a pixel ratio
// above 1 the canvas was drawn twice the size of the screen and its middle (where the paint went) sat at the
// bottom right. The stylesheet now pins the canvas to the screen (!important), and it draws at 1x by default,
// like Off the Chain (fastest, and quickest to pick up the charm in Dapo's tests); ?dpr=2 for a sharper picture.
const DPR = clamp(+params.get('dpr') || 1, 1, 3);
function sizeCanvas() {
  const dpr = Math.min(devicePixelRatio || 1, DPR);
  const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}
let last = 0, camStartAt = 0, runAt = 0;
const appModule = (data) => ({
  name: 'spray-bobo',
  onStart: () => { buildScene(XR8.Threejs.xrScene(), data); hud.hidden = false; setMode('find'); },
  onUpdate: () => { const now = performance.now(); const dt = Math.min((now - (last || now)) / 1000, 0.05); last = now; if (scene) tick(dt); flushDiag(false); },
  onCameraStatusChange: ({ status, video, stream }) => {
    camLog(status);
    if (status === 'hasStream') { kickVideo(); noteStream(stream); }
    if (status === 'hasVideo') {
      hideTapCam(); camStartAt = performance.now(); tuneCamera(video);
      $('splash').classList.add('gone'); setTimeout(() => { $('splash').hidden = true; }, 600);
      let seen = false; try { seen = localStorage.getItem('spray-bobo-how') === '1'; } catch (e) { /* none */ }
      if (!seen) { $('how').hidden = false; $('b-go').focus(); }
      syncRec();
    }
    if (status === 'requesting') hint('Allow camera access to begin');
    if (status === 'failed') camFailed('failed');
  },
  onException: (e) => { console.error('XR', e); diag.errors.push('XR: ' + String((e && e.message) || e).slice(0, 200)); flushDiag(true, true); showError('Something went wrong', String((e && e.message) || e)); },
  listeners: [
    { event: 'reality.imagefound', process: ({ detail }) => onTarget(detail) },
    { event: 'reality.imageupdated', process: ({ detail }) => onTarget(detail) },
    { event: 'reality.imagelost', process: ({ detail }) => onLost(detail) },
  ],
});

async function askMotion() {
  try {
    if (typeof DeviceMotionEvent !== 'undefined' && DeviceMotionEvent.requestPermission) { const r = await DeviceMotionEvent.requestPermission(); diag.motion = r; if (r !== 'granted') return; }
    addEventListener('devicemotion', onMotion);
  } catch (e) { diag.motion = 'error:' + (e && e.name); }
}
async function start() {
  if (!loaded) return;
  $('b-start').disabled = true; $('b-start').textContent = 'Starting…';
  sound.init(); capture && capture.configure({ audioContext: sound.ctx }); await askMotion();
  const data = await assets;
  sizeCanvas(); addEventListener('resize', sizeCanvas); addEventListener('orientationchange', () => setTimeout(sizeCanvas, 300));
  const targets = data[2].filter((t) => !params.get('only') || t.name === params.get('only'));
  initTargets(targets);
  XR8.XrController.configure({ disableWorldTracking: true, imageTargetData: targets });
  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(), XR8.Threejs.pipelineModule(), XR8.XrController.pipelineModule(), XR8.CanvasScreenshot.pipelineModule(),
    appModule(data),
    { name: 'sb-capture', onRender: () => { if (capture) capture.frame(); } },
  ]);
  runAt = performance.now(); camLog('run'); postEvent('scan', {});
  setTimeout(() => { if (!camStartAt && !tapCamShown) camFailed('no video after 12 s'); }, 12000);
  XR8.run({ canvas, allowedDevices: XR8.XrConfig.device().ANY, cameraConfig: { direction: XR8.XrConfig.camera().BACK } });
}
$('b-start').onclick = start;
$('b-go').onclick = () => { $('how').hidden = true; try { localStorage.setItem('spray-bobo-how', '1'); } catch (e) { /* none */ } syncRec(); };
$('err-retry').onclick = () => location.reload();
function showError(title, body) { $('err-title').textContent = title; $('err-body').textContent = body; $('error').hidden = false; }

// ---------------------------------------------------------------- camera (the same handling as Off the Chain)
// iPhones: the plain wide camera can't focus closer than about 20 cm, and a spray can is used up close, so
// ask for the multi-lens camera (it switches to the close-focus lens by itself) at 1920x1440, zoomed to 1x.
// If it gives no picture within 4 s the page reloads once with the standard camera.
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const MACRO_LENSES = ['Back Triple Camera', 'Back Dual Wide Camera'];
let iosStd = false; try { iosStd = sessionStorage.getItem('sb-ios-std') === '1'; } catch (e) { /* none */ }
const IOS_MACRO = IOS && params.get('macro') !== '0' && !iosStd;
if (IOS && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
  const md = navigator.mediaDevices, orig = md.getUserMedia.bind(md);
  const lensId = () => (IOS_MACRO ? md.enumerateDevices().then((ds) => { for (const n of MACRO_LENSES) { const d = ds.find((x) => x.kind === 'videoinput' && x.label === n); if (d) return d.deviceId; } return null; }).catch(() => null) : Promise.resolve(null));
  md.getUserMedia = (c) => {
    const v = c && c.video; if (!v || v === true) return orig(c);
    return lensId().then((id) => {
      const nv = { ...v, width: { ...(v.width || {}), ideal: 1920 }, height: { ...(v.height || {}), ideal: 1440 } };
      if (id) { nv.deviceId = { exact: id }; delete nv.facingMode; }
      diag.asked = nv; return orig({ ...c, video: nv }).catch((e) => { diag.askFailed = String(e && e.name || e); return orig(c); });
    });
  };
}
function tuneCamera(video) {
  try {
    const tr = video && video.srcObject && video.srcObject.getVideoTracks()[0]; if (!tr) return;
    const caps = tr.getCapabilities ? tr.getCapabilities() : {};
    if (caps.focusMode && caps.focusMode.includes('continuous')) tr.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
    if (IOS_MACRO && /Triple|Dual Wide/.test(tr.label) && caps.zoom) { const z = Math.min(Math.max(caps.zoom.min < 1 ? 1 : 2, caps.zoom.min), caps.zoom.max); tr.applyConstraints({ advanced: [{ zoom: z }] }).catch(() => {}); }
    const st = tr.getSettings ? tr.getSettings() : {};
    diag.camera = { label: tr.label, width: st.width || video.videoWidth, height: st.height || video.videoHeight, frameRate: st.frameRate, focusMode: st.focusMode, zoom: st.zoom };
  } catch (e) { diag.errors.push('tune: ' + String(e).slice(0, 120)); }
}
let tapCamShown = false;
function kickVideo() {
  setTimeout(() => {
    if (camStartAt) return; camLog('notPlaying');
    if (IOS_MACRO) { try { sessionStorage.setItem('sb-ios-std', '1'); } catch (e) { /* none */ } flushDiag(true, true); location.reload(); return; }
    showTapCam();
  }, 4000);
}
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
  if (IOS_MACRO) try { sessionStorage.setItem('sb-ios-std', '1'); } catch (e) { /* none */ }
  showError('The camera didn\'t start', 'Another app or tab may be using it. Close the Camera app and other tabs that use the camera, then tap Try again. If it still won\'t start, allow camera access for this site in your browser settings.');
}

// ---------------------------------------------------------------- photo, video (the Cola Run recorder), artwork
const LOGO = { evade: new Image(), act: new Image() };
LOGO.evade.src = '/brand/evade-logo.webp'; LOGO.act.src = '/activated-merch/media/ar/activated-by.webp';
function drawMist(c, Wd, Hd) { if (mist.parts.length && mist.c.width) try { c.drawImage(mist.c, 0, 0, Wd, Hd); } catch (e) { /* none */ } }   // the spray shows in photos and clips too
function drawWatermark(c, Wd, Hd) {
  const u = Math.min(Wd, Hd) / 720, pad = 26 * u;
  if (LOGO.evade.complete && LOGO.evade.naturalWidth) { const h = 44 * u, w = h * LOGO.evade.naturalWidth / LOGO.evade.naturalHeight; c.drawImage(LOGO.evade, pad, pad, w, h); }
  if (LOGO.act.complete && LOGO.act.naturalWidth) { const h = 50 * u, w = h * LOGO.act.naturalWidth / LOGO.act.naturalHeight; c.drawImage(LOGO.act, Wd - pad - w, Hd - pad - h, w, h); }
}
let capture = null, recFrom = 0, shots = 0;
try {
  capture = new ColaCapture({
    canvas, host: document.body, endpoint: location.origin, globeUrl: '/evade/where-is-bobo/', source: 'spray-bobo', audioContext: null,
    connectAudio: (dest) => { const m = sound.master; if (!m) return () => {}; m.connect(dest); return () => { try { m.disconnect(dest); } catch (e) { /* gone */ } }; },
    overlay: (c, Wd, Hd) => { drawMist(c, Wd, Hd); drawWatermark(c, Wd, Hd); },
    on: (name) => { if (name === 'recordStart') { buzz(25); recUi(true); } if (name === 'recordStop' || name === 'error') recUi(false); },
  });
  Object.assign(capture.settings, {
    corner: 'topRight', offsetX: -5, offsetY: -6, accent: '#f6c344', maxSeconds: 30,
    hintText: 'Film your Bobo and send him to the globe', sendLabel: 'Send to Where is Bobo?',
    sheetTitle: 'Send your clip to the Bobo globe?', keepTitle: 'Keep your clip?', clipTitle: 'Spray Bobo clip', filePrefix: 'spray-bobo', backLabel: 'Back to the camera',
  });
  capture.apply(); capture.setVisible(false);
} catch (e) { console.warn('recorder', e); capture = null; }
function syncRec() { capture && capture.setVisible(false); }
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
    sound.shutter(); buzz(20); const fl = $('flashw'); fl.classList.add('on'); setTimeout(() => fl.classList.remove('on'), 60);
    const b64 = await XR8.CanvasScreenshot.takeScreenshot();
    const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0); drawMist(g, c.width, c.height); drawWatermark(g, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92));
    showFile('shot', blob, `spray-bobo-${++shots}.jpg`, 'My Bobo, sprayed');
  } catch (e) { console.error(e); }
}
function showFile(id, blob, name, title) {
  const file = new File([blob], name, { type: blob.type }), url = URL.createObjectURL(blob);
  $(id + '-img').src = url; $(id + '-save').href = url; $(id + '-save').download = name; $(id + '-save').hidden = false;
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
  $(id + '-share').hidden = !canShare; $(id + '-share').onclick = () => navigator.share({ files: [file], title }).catch(() => {});
  $(id === 'shot' ? 'shot' : 'artsheet').hidden = false;
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
$('art-close').onclick = () => { $('artsheet').hidden = true; };
// the artwork: your Bobo as a die-cut sticker on EVADE yellow, ready to post
$('b-art').onclick = async () => {
  try {
    await document.fonts.load('80px "Permanent Marker"').catch(() => {});
    const Wc = 1080, Hc = 1350, c = document.createElement('canvas'); c.width = Wc; c.height = Hc; const g = c.getContext('2d');
    g.fillStyle = '#f6c344'; g.fillRect(0, 0, Wc, Hc);
    const aw = 760, ah = aw * TH / TW, ax = (Wc - aw) / 2, ay = 230;
    const sil = (col, r) => { const t = document.createElement('canvas'); t.width = TW; t.height = TH; const tg = t.getContext('2d'); tg.drawImage(paint.mask, 0, 0, TW, TH); tg.globalCompositeOperation = 'source-in'; tg.fillStyle = col; tg.fillRect(0, 0, TW, TH); for (let a = 0; a < 16; a++) g.drawImage(t, ax + Math.cos(a * 0.3927) * r, ay + Math.sin(a * 0.3927) * r, aw, ah); };
    g.save(); g.translate(Wc / 2, ay + ah / 2); g.rotate(-0.05); g.translate(-Wc / 2, -(ay + ah / 2));
    sil('#15131a', 30); sil('#ffffff', 22);
    g.drawImage(stickerCanvas, ax, ay, aw, ah); g.restore();
    g.fillStyle = '#15131a'; g.font = '400 92px "Permanent Marker", cursive'; g.textAlign = 'center';
    g.save(); g.translate(Wc / 2, 168); g.rotate(-0.04); g.fillText(cp.title, 0, 0); g.restore();
    if (LOGO.evade.complete && LOGO.evade.naturalWidth) { const h = 46, w = h * LOGO.evade.naturalWidth / LOGO.evade.naturalHeight; g.filter = 'brightness(0)'; g.drawImage(LOGO.evade, 54, 50, w, h); g.filter = 'none'; }
    if (LOGO.act.complete && LOGO.act.naturalWidth) { const h = 58, w = h * LOGO.act.naturalWidth / LOGO.act.naturalHeight; g.fillStyle = '#15131a'; g.beginPath(); g.roundRect(Wc - w - 74, Hc - h - 74, w + 40, h + 30, 20); g.fill(); g.drawImage(LOGO.act, Wc - w - 54, Hc - h - 59, w, h); }
    g.fillStyle = '#15131a'; g.font = '700 28px "Space Grotesk", sans-serif'; g.textAlign = 'left'; g.fillText(cp.line, 54, Hc - 86);
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    showFile('art', blob, `my-${cp.k}.png`, cp.k === 'can' ? 'My can' : 'My Bobo');
    postEvent('share', { what: 'spray-art', piece: cp.k });
  } catch (e) { console.error(e); }
};

// ---------------------------------------------------------------- Where is Bobo? events (city level, anonymous)
const SID = 'sb-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
function postEvent(type, props) {
  if (params.has('nolog')) return;
  try { fetch('/api/bobo/events', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, source: 'spray-bobo', sessionId: SID, props }) }).catch(() => {}); } catch (e) { /* offline */ }
}

// ---------------------------------------------------------------- test log (previews and local dev only, or ?diag)
// Read back with GET /api/ar/kc-diag on a deploy preview (records carry page: 'spray-bobo').
const diag = { page: 'spray-bobo', sid: SID, found: 0, lost: 0, sides: 0, bridges: 0, bridgeS: 0, sprayS: 0, bridgeSprayS: 0, saves: 0, fpsN: 0, errors: [], steps: [], targets: {} };
function tDiag(n) { return diag.targets[n] || (diag.targets[n] = { found: 0, lost: 0 }); }
function camLog(s) { diag.steps.push([s, Math.round(performance.now())]); if (diag.steps.length > 40) diag.steps.shift(); }
let flushAt = 0;
function flushDiag(force, always = false) {
  const now = performance.now(); if (!force && now - flushAt < 10000) return; flushAt = now;
  if ((!camStartAt && !always) || params.has('nolog') || (LIVE_SITE && !params.has('diag'))) return;
  const body = JSON.stringify({ ...diag, secs: Math.round((now - (camStartAt || now)) / 1000), fps: camStartAt ? +(diag.fpsN / Math.max((now - camStartAt) / 1000, 1)).toFixed(1) : 0, painted: Math.round(paint.coverage * 100), mode, screen: [innerWidth, innerHeight, devicePixelRatio], bridgeS: +diag.bridgeS.toFixed(1), sprayS: +diag.sprayS.toFixed(1), bridgeSprayS: +diag.bridgeSprayS.toFixed(1) });
  try { if (!(navigator.sendBeacon && navigator.sendBeacon('/api/ar/kc-diag', new Blob([body], { type: 'application/json' })))) fetch('/api/ar/kc-diag', { method: 'POST', body, keepalive: true }); } catch (e) { /* offline */ }
}
addEventListener('pagehide', () => flushDiag(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) { flushDiag(true); stopSpray(); } });
addEventListener('error', (e) => { diag.errors.push(String(e.message).slice(0, 200)); });

// automated tests (?test): read the state from outside
if (params.has('test')) window.__sb = { get side() { return side; }, get lead() { return sideLead; }, get pose() { return pose.state; }, get mode() { return mode; }, rt: () => { const a = aimAt(innerWidth / 2, innerHeight / 2); if (!a.has) return null; const p = new THREE.Vector3((a.u - 0.5) * W, (0.5 - a.v) * H, 0); F.localToWorld(p); p.project(camera); const inv = camera.projectionMatrixInverse.clone().multiply(camera.projectionMatrix); return { u: a.u, v: a.v, sx: (p.x + 1) / 2 * innerWidth, sy: (1 - p.y) / 2 * innerHeight, invErr: inv.elements.reduce((s, e, i) => s + Math.abs(e - (i % 5 === 0 ? 1 : 0)), 0) }; }, ts: () => Object.fromEntries(Object.entries(TS).map(([k, t]) => [k, { tracked: t.tracked, foundAt: Math.round(t.foundAt) }])), get flip() { return F.scale.x; }, paint, diag };

// desktop: a QR to open it on the phone
if (!TOUCH) {
  $('desk').hidden = false;
  try { window.QRCode && QRCode.toString(location.href, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }, (err, svg) => { if (!err) $('qr').innerHTML = svg; }); } catch (e) { /* no QR */ }
}
