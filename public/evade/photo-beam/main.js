// Photo Beam: take a picture and beam it onto the EVADE keychain. Point the phone at a charm, tap its glowing "photo
// slot" (Bobo's visor, the Eclipse can's label, Roblox Bobo's cap), snap or choose a picture, give it a style, and
// press Beam it: the photo shrinks into a glowing card, a beam of light shoots from the phone to the charm, the photo
// breaks into a few thousand pixels that stream down the beam and land on their own spot, and a materialise sweep
// prints it on. The photo then stays on that charm (this phone only, IndexedDB) and re-materialises when it is found.
//
// The slots are measured from the target pictures (scripts/build-photo-beam/build_slots.py -> slots/slots.json):
// each picture has its own slot in its own uv, so a photo reads the right way round on both sides of a charm.
// The visor and cap are a grid that bulges gently out of the print (fabric round a head); the can's label is the front
// half of a cylinder whose silhouette is the drawn can (X-Ray's lathe idea), standing proud of the print, and it spins.
// The printed photo is multiplied by the print's own shading (slots/*-shade.png) so it looks printed on the merch.
//
// Base: Bobo X-Ray (public/evade/xray-bobo): engine, tracking rules (Spray Bobo PR #47), camera handling, recorder,
// sound, options, logs. Nothing is uploaded: the photo never leaves the phone (the recorder's globe send is off).
import * as THREE from 'three';
import { ColaCapture } from '/evade/cola-run-lab/assets/capture-core.js';

window.THREE = THREE;                         // XR8.Threejs.pipelineModule() looks for a global THREE
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const KC = '/evade/keychain-ar/';             // Off the Chain: engine, image targets
const HERE = '/evade/photo-beam/';
const LIVE_SITE = /(^|\.)medialife\.ai$/i.test(location.hostname);
const TOUCH = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const easeInOut = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* no haptics */ } };
const store = { get(k, d) { try { const v = localStorage.getItem('photo-beam-' + k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('photo-beam-' + k, String(v)); } catch (e) { /* none */ } } };

// ---------------------------------------------------------------- what is tracked
// Each charm is a piece with its two pictures; each picture has its own slot. pal: whose palette Screen print uses.
const PIECES = {
  bobo: { k: 'bobo', name: 'Bobo', where: "Bobo's visor", targets: ['kc-bobo', 'kc-bobo-l'], pal: 'kc-bobo' },
  can: { k: 'can', name: 'the can', where: "the can's label", targets: ['kc-can', 'kc-can-back'], pal: 'kc-can-back' },
  old: { k: 'old', name: 'Roblox Bobo', where: "Bobo's cap", targets: ['kc-old', 'kc-old-l'], pal: 'kc-old' },
};
const PIECE_OF = {}; for (const P of Object.values(PIECES)) { for (const n of P.targets) PIECE_OF[n] = P; Object.assign(P, { status: 'empty', src: null, params: null, label: null, tex: null, spin: 0, spinV: 0 }); }
const TARGETS = Object.keys(PIECE_OF);
// Losing the print: the last pose is held this long, and only while the phone is still (Spray Bobo's numbers)
const HOLD_STILL_MS = 250, HOLD_BLIND_MS = 120, STILL_DEG = 25, STILL_ACC = 1.2;
const REOPEN_AFTER_MS = 2500;                 // lost longer than this: the photo re-materialises when found
const COL = { x: 0x4fd6e8, xs: '#4fd6e8', ink: '#0f1519' };
const LOOKS = { soft: 0.35, printed: 0.7, bold: 1 };
let look = LOOKS[store.get('look', 'printed')] != null ? store.get('look', 'printed') : 'printed';
const BULGE = 0.09;                           // the visor's bulge out of the print, a share of its width
const CAN_Z = 0.5;                            // the can's label stands this share of its radius proud of the print
const CAN_WRAP = 1.25;                        // the label's width over the can's drawn width (it wraps round)
const LABEL_MAX = 1024;                       // the printed photo's long side, px
const N_PART = 4500;                          // pixels that fly down the beam
// the beam (seconds after launch); the card shrink before it. Reduced motion: shorter and softer, same steps.
const BT = REDUCED
  ? { card: 0.25, grow: 0.18, launch: 0.1, spread: 0.4, fly: 0.35, sweep0: 0.42, sweep1: 1.1, retract0: 0.85, retract1: 1.05, end: 1.2, swirl: 0.25 }
  : { card: 0.38, grow: 0.25, launch: 0.15, spread: 0.75, fly: 0.5, sweep0: 0.72, sweep1: 1.82, retract0: 1.3, retract1: 1.6, end: 1.86, swirl: 1 };
const REMAT_S = 0.6;                          // found again: the short sweep

// ---------------------------------------------------------------- sound (made here, no files)
const sound = {
  ctx: null, on: store.get('sound', '1') === '1', master: null,
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
  // the beam leaving the phone: an airy rush with a rising sweep under it
  whoosh() {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime, n = Math.floor(this.ctx.sampleRate * 0.8), b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / n);
    const s = this.ctx.createBufferSource(); s.buffer = b; const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(5200, t + 0.7);
    const g = this.ctx.createGain(); g.gain.value = 0.16; s.connect(f).connect(g).connect(this.master); s.start(t);
    this.tone(180, 1500, 0.6, 0.05, 'triangle'); this.tone(360, 2600, 0.55, 0.025, 'sine', 0.05);
  },
  shimmer(n = 12) { for (let i = 0; i < n; i++) { const f = 2200 + Math.random() * 2600; this.tone(f, f * 1.03, 0.09, 0.016, 'triangle', i * 0.045); } },
  land() { this.tone(240, 70, 0.32, 0.12, 'sine'); this.noise(0.16, 0.07, 900, 5000); },
  chime() { [1047, 1319, 1568, 2093].forEach((f, i) => this.tone(f, f, 0.55, 0.045, 'triangle', i * 0.07)); },
  pop() { this.tone(900, 1800, 0.14, 0.035, 'triangle'); this.shimmer(4); },
  click() { this.tone(1200, 900, 0.05, 0.05, 'triangle'); },
  shutter() { this.noise(0.05, 0.22, 2000, 9000); this.noise(0.07, 0.16, 1200, 6000, 0.08); },
};

// ---------------------------------------------------------------- loading
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
const getJson = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(r.status + ' ' + u); return r.json(); });
const texLoader = new THREE.TextureLoader();
const loadTex = (u) => new Promise((res, rej) => texLoader.load(u, res, undefined, rej));
let SL = null, LAYOUT = null;
const assets = Promise.all([
  getJson(KC + 'image-targets/layout.json'),
  Promise.all(TARGETS.map((n) => getJson(KC + `image-targets/${n}.json`))),
  getJson(HERE + 'slots/slots.json'),
]).then(async ([layout, tdata, slots]) => {
  LAYOUT = layout; SL = slots;
  const tex = await Promise.all(TARGETS.map((n) => Promise.all([loadTex(HERE + 'slots/' + slots.targets[n].mask), loadTex(HERE + 'slots/' + slots.targets[n].shade)])));
  TARGETS.forEach((n, i) => { slots.targets[n].maskTex = tex[i][0]; slots.targets[n].shadeTex = tex[i][1]; });
  for (const P of Object.values(PIECES)) {
    const rec = slots.targets[P.targets[0]], L = layout.targets[P.targets[0]];
    P.aspect = labelAspect(rec, L.widthM, L.heightM);
    P.palette = slots.targets[P.pal].palette;
  }
  return { tdata };
});
const xrReady = new Promise((res) => (window.XR8 ? res() : window.addEventListener('xrloaded', () => res(), { once: true })));
let loaded = false;
Promise.all([assets, xrReady]).then(() => {
  loaded = true; $('load').hidden = true; $('b-start').disabled = false; $('b-start').textContent = 'Start';
}).catch((e) => { console.error(e); showError('Could not load the experience', 'Check your connection and reload the page.'); });
const savedReady = assets.then(loadSaved).catch(() => {});

// ---------------------------------------------------------------- slot geometry (metres of the print, y up, z out)
// band: the label (photo) covers the band's bounding box and the band's shape cuts it; can: the label wraps the front
// half of the can, s round it (left to right), t down it.
function labelBox(rec) {
  const g = rec.geo;
  if (rec.kind === 'band') return { ua: g[0][0], ub: g[g.length - 1][0], va: Math.min(...g.map((c) => c[1])), vb: Math.max(...g.map((c) => c[2])) };
  return { va: g[0][0], vb: g[g.length - 1][0], ua: Math.min(...g.map((r) => r[1])), ub: Math.max(...g.map((r) => r[2])) };
}
function labelAspect(rec, W, H) {
  const b = labelBox(rec);
  if (rec.kind === 'band') return ((b.ub - b.ua) * W) / ((b.vb - b.va) * H);
  const hw = rec.geo.reduce((a, r) => a + (r[2] - r[1]) / 2, 0) / rec.geo.length;
  return (2 * hw * W * CAN_WRAP) / ((b.vb - b.va) * H);
}
function interp(arr, key, x, cols) {   // linear in a sorted table: arr rows, key column, value columns
  if (x <= arr[0][key]) return cols.map((c) => arr[0][c]);
  for (let i = 1; i < arr.length; i++) if (x <= arr[i][key]) { const a = arr[i - 1], b = arr[i], k = (x - a[key]) / Math.max(b[key] - a[key], 1e-9); return cols.map((c) => lerp(a[c], b[c], k)); }
  return cols.map((c) => arr[arr.length - 1][c]);
}
// a point of the print's picture (u, v) on the slot's surface
function surf(S, u, v, out = new THREE.Vector3()) {
  const { W, H, rec, lb } = S;
  if (rec.kind === 'band') {
    const x = clamp((u - (lb.ua + lb.ub) / 2) / ((lb.ub - lb.ua) / 2), -1, 1);
    return out.set((u - 0.5) * W, (0.5 - v) * H, BULGE * (lb.ub - lb.ua) * W * (1 - x * x) + 0.0004);
  }
  return out.set((u - 0.5) * W, (0.5 - v) * H, 0.0004);
}
// a point of the label (s across, t down) on the slot
function fromLabel(S, s, t, out = new THREE.Vector3()) {
  const { W, H, rec, lb } = S;
  if (rec.kind === 'band') return surf(S, lerp(lb.ua, lb.ub, s), lerp(lb.va, lb.vb, t), out);
  const v = lerp(lb.va, lb.vb, t), [uL, uR] = interp(rec.geo, 0, v, [1, 2]), c = (uL + uR) / 2, hw = (uR - uL) / 2, th = (s - 0.5) * Math.PI;
  return out.set((c + hw * Math.sin(th) - 0.5) * W, (0.5 - v) * H, hw * W * Math.cos(th) * CAN_Z + 0.0004);
}
function inLabel(S, s, t) {
  if (S.rec.kind !== 'band') return true;
  const { lb, rec } = S, u = lerp(lb.ua, lb.ub, s), v = lerp(lb.va, lb.vb, t), [a, b] = interp(rec.geo, 0, u, [1, 2]);
  return v >= a && v <= b;
}
function slotGeometry(S) {
  const { rec, lb } = S, pos = [], uv = [], box = [], idx = [], p = new THREE.Vector3();
  const bx = rec.box, boxUv = (u, v) => [(u - bx[0]) / (bx[2] - bx[0]), 1 - (v - bx[1]) / (bx[3] - bx[1])];
  let NI, NJ;
  if (rec.kind === 'band') {
    NI = rec.geo.length; NJ = 14;
    for (const [u, a, b] of rec.geo) for (let j = 0; j <= NJ; j++) {
      const v = lerp(a, b, j / NJ); surf(S, u, v, p); pos.push(p.x, p.y, p.z);
      uv.push((u - lb.ua) / (lb.ub - lb.ua), 1 - (v - lb.va) / (lb.vb - lb.va)); box.push(...boxUv(u, v));
    }
  } else {
    NI = rec.geo.length; NJ = 40;
    for (let i = 0; i < NI; i++) for (let j = 0; j <= NJ; j++) {
      const s = j / NJ, t = (rec.geo[i][0] - lb.va) / (lb.vb - lb.va); fromLabel(S, s, t, p); pos.push(p.x, p.y, p.z);
      uv.push(s, 1 - t); box.push(...boxUv(p.x / S.W + 0.5, 0.5 - p.y / S.H));
    }
  }
  // counter-clockwise seen from the front: the band's grid runs across then down, the can's down then across
  const band = rec.kind === 'band';
  for (let i = 0; i < NI - 1; i++) for (let j = 0; j < NJ; j++) { const a = i * (NJ + 1) + j, b = a + NJ + 1; if (band) idx.push(a, a + 1, b, a + 1, b + 1, b); else idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aBox', new THREE.Float32BufferAttribute(box, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// the slot's edge in 3D (counter-clockwise seen from the front)
function slotEdge(S) {
  const { rec, lb } = S, pts = [];
  if (rec.kind === 'band') {
    for (const [u, a] of rec.geo) pts.push(surf(S, u, a));
    for (const [u, , b] of rec.geo.slice().reverse()) pts.push(surf(S, u, b));
  } else {
    const N = 24, ts = rec.geo.map((r) => (r[0] - lb.va) / (lb.vb - lb.va));
    for (const t of ts) pts.push(fromLabel(S, 0, t));
    for (let i = 1; i < N; i++) pts.push(fromLabel(S, i / N, 1));
    for (const t of ts.slice().reverse()) pts.push(fromLabel(S, 1, t));
    for (let i = N - 1; i > 0; i--) pts.push(fromLabel(S, i / N, 0));
  }
  let area = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a.x * b.y - b.x * a.y; }
  return area < 0 ? pts.reverse() : pts;
}
// a closed flat ribbon of width w on the outside of a counter-clockwise outline (X-Ray's ribbon, keeping each point's z)
function ribbon(pts, w) {
  const n = pts.length, pos = [], idx = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const d1 = new THREE.Vector2(p.x - a.x, p.y - a.y).normalize(), d2 = new THREE.Vector2(b.x - p.x, b.y - p.y).normalize();
    const n1 = new THREE.Vector2(d1.y, -d1.x), n2 = new THREE.Vector2(d2.y, -d2.x);
    const m = n1.clone().add(n2); const ml = m.length(); if (ml < 1e-6) m.copy(n1); else m.divideScalar(ml);
    const k = Math.min(1 / Math.max(m.dot(n1), 0.35), 2.5);
    pos.push(p.x, p.y, p.z + 0.0002, p.x + m.x * w * k, p.y + m.y * w * k, p.z + 0.0002);
  }
  for (let i = 0; i < n; i++) { const j = (i + 1) % n, a = i * 2, b = j * 2; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
}

// ---------------------------------------------------------------- the printed photo: one shader per slot
// Empty: a flat see-through cyan fill that pulses (the glowing spot). With a photo: the photo times the print's own
// shading, a stepped gloss band on the can that moves with the view, and the materialise sweep (X-Ray's makeBurn:
// a front from the landing point out, white-hot edge, cyan rim, one flat tint band, then the photo). Flat steps only.
const SLOT_VS = `
attribute vec2 aBox;
varying vec2 vUv, vBox; varying vec3 vN, vV;
void main() {
  vUv = uv; vBox = aBox;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = -mv.xyz; vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}`;
const SLOT_FS = `
uniform sampler2D uMap, uShade, uMask; uniform vec3 uCyan; uniform float uHas, uP, uStr, uPulse, uSpin, uCan, uAsp, uUseMask;
varying vec2 vUv, vBox; varying vec3 vN, vV;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { return vnoise(p) * 0.55 + vnoise(p * 2.1 + 7.3) * 0.3 + vnoise(p * 4.3 + 1.7) * 0.15; }
void main() {
  if (uUseMask > 0.5 && texture2D(uMask, vBox).r < 0.5) discard;
  if (uHas < 0.5) {
    gl_FragColor = vec4(uCyan, 0.16 + 0.2 * uPulse);
    #include <colorspace_fragment>
    return;
  }
  vec2 d = (vUv - 0.5) * vec2(uAsp, 1.0);
  float r = length(d) / (0.5 * length(vec2(uAsp, 1.0)));
  float n = fbm(vUv * vec2(uAsp, 1.0) * 5.0);
  float e = uP * 1.35 - 0.1 - (r * 0.85 + n * 0.25);   // > 0: printed
  if (e < 0.0) discard;
  vec3 col = texture2D(uMap, vec2(vUv.x + uSpin, vUv.y)).rgb;
  float sh = texture2D(uShade, vBox).r * 2.0;
  col *= mix(1.0, sh, uStr);
  if (uCan > 0.5) {                                     // gloss: a narrow band where the label faces the light's mirror
    vec3 N = normalize(vN), V = normalize(vV), Hh = normalize(normalize(vec3(-0.35, 0.55, 1.0)) + V);
    float sp = dot(N, Hh);
    if (sp > 0.992) col = mix(col, vec3(1.0), 0.45);
    else if (sp > 0.97) col = mix(col, vec3(1.0), 0.16);
  }
  if (!gl_FrontFacing) col = vec3(0.04, 0.07, 0.09);   // the inside of the label sleeve
  if (e < 0.03) col = vec3(1.0);                        // white-hot edge
  else if (e < 0.07) col = uCyan;                       // its cyan rim
  else if (e < 0.11) col = mix(col, uCyan, 0.4);        // one flat tint band
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;
const blankTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); blankTex.needsUpdate = true;
function slotMaterial(S) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: blankTex }, uShade: { value: S.rec.shadeTex }, uMask: { value: S.rec.maskTex }, uCyan: { value: new THREE.Color(COL.x) },
      uHas: { value: 0 }, uP: { value: 0 }, uStr: { value: LOOKS[look] }, uPulse: { value: 0 }, uSpin: { value: 0 },
      uCan: { value: S.rec.kind === 'can' ? 1 : 0 }, uAsp: { value: S.aspect }, uUseMask: { value: S.rec.kind === 'band' ? 1 : 0 },
    },
    vertexShader: SLOT_VS, fragmentShader: SLOT_FS, side: THREE.DoubleSide, transparent: true, toneMapped: false,
  });
}

// ---------------------------------------------------------------- the scene
let scene, camera, renderer;
const A = new THREE.Group();                  // follows the print (units: metres of the real print)
const SLOT = {};                              // per target picture: its slot
const fx = { beamG: null, pts: null, layers: [] };
function buildScene(xr) {
  ({ scene, camera, renderer } = xr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  camera.position.set(0, 0, 0); camera.quaternion.identity();
  XR8.XrController.updateCameraProjectionMatrix({ origin: camera.position, facing: camera.quaternion });
  scene.add(A); A.visible = false;
  for (const n of TARGETS) {
    const L = LAYOUT.targets[n], rec = SL.targets[n], P = PIECE_OF[n];
    const S = { name: n, P, W: L.widthM, H: L.heightM, rec, lb: labelBox(rec), aspect: labelAspect(rec, L.widthM, L.heightM), matP: 0, g: new THREE.Group() };
    S.g.visible = false; A.add(S.g);
    S.mat = slotMaterial(S);
    S.mesh = new THREE.Mesh(slotGeometry(S), S.mat); S.mesh.renderOrder = 4; S.mesh.frustumCulled = false; S.g.add(S.mesh);
    S.outline = new THREE.Mesh(ribbon(slotEdge(S), S.H * 0.008), new THREE.MeshBasicMaterial({ color: COL.x, toneMapped: false, side: THREE.DoubleSide, transparent: true, depthWrite: false }));
    S.outline.renderOrder = 6; S.g.add(S.outline);
    S.land = fromLabel(S, 0.5, 0.5);
    S.size = Math.max((S.lb.ub - S.lb.ua) * S.W, (S.lb.vb - S.lb.va) * S.H);
    // the landing ring and the sparkle burst
    S.ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48), new THREE.MeshBasicMaterial({ color: COL.x, toneMapped: false, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    S.ring.position.copy(S.land).setZ(S.land.z + 0.0008); S.ring.visible = false; S.ring.renderOrder = 8; S.g.add(S.ring);
    S.sparks = makeSparks(); S.sparks.position.copy(S.land); S.g.add(S.sparks);
    SLOT[n] = S;
    if (P.tex) bindTex(P);
  }
  buildBeam();
}
// sparkles: 70 flat squares (white and cyan) bursting from the landing point
function makeSparks() {
  const N = 70, geo = new THREE.BufferGeometry(), p = new Float32Array(N * 3), c = new Float32Array(N * 3), dir = [];
  const w = new THREE.Color(0xffffff), cy = new THREE.Color(COL.x);
  for (let i = 0; i < N; i++) { const a = Math.random() * Math.PI * 2, s = 0.4 + Math.random(); dir.push(new THREE.Vector3(Math.cos(a) * s, Math.sin(a) * s * 0.8, 0.3 + Math.random() * 0.8)); (i % 3 ? cy : w).toArray(c, i * 3); }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3)); geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const m = new THREE.PointsMaterial({ size: 0.001, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false });
  const pts = new THREE.Points(geo, m); pts.frustumCulled = false; pts.renderOrder = 9; pts.visible = false; pts.userData = { dir, t: -1 };
  return pts;
}
// the beam: three open cylinders (wide at the phone, narrow at the charm), a white core and two flat see-through cyan sleeves (stepped, no blends)
function buildBeam() {
  fx.beamG = new THREE.Group(); fx.beamG.visible = false; scene.add(fx.beamG);
  fx.layers = [[0.3, 0xffffff, 0.95], [0.6, COL.x, 0.42], [1, COL.x, 0.16]].map(([k, c, o]) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 1, 1, 14, 1, true).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    m.userData.k = k; m.renderOrder = 20; m.frustumCulled = false; fx.beamG.add(m); return m;
  });
}
function bindTex(P) { for (const n of P.targets) { const S = SLOT[n]; if (S) S.mat.uniforms.uMap.value = P.tex || blankTex; } }

// ---------------------------------------------------------------- the pixels that fly (one Points draw)
// Each pixel starts at its spot on the card (at the bottom of the screen, a little in front of the phone), streams
// down the beam in a loose spiral, and lands on its own spot on the slot. The centre goes first, so the picture
// assembles from the middle out, ahead of the materialise sweep; a landed pixel hides once the sweep passes it.
const PART_VS = `
uniform float uT, uLaunch, uSpread, uFly, uSwirl, uCardW, uCardH, uCardSize, uSize, uPx, uP;
uniform vec3 uOrigin, uRight, uUp; uniform mat4 uSlot;
attribute vec2 aST; attribute vec3 aLocal, aCol; attribute vec4 aRnd; attribute float aSweep;
varying vec3 vCol; varying float vFly;
void main() {
  vec3 tgt = (uSlot * vec4(aLocal, 1.0)).xyz;
  vec3 card = uOrigin + uRight * (aST.x - 0.5) * uCardW + uUp * (0.5 - aST.y) * uCardH;
  float delay = (aSweep * 0.75 + aRnd.x * 0.25) * uSpread;
  float k = clamp((uT - uLaunch - delay) / uFly, 0.0, 1.0);
  float ke = k * k * (3.0 - 2.0 * k);
  vec3 dir = tgt - card, a = normalize(cross(dir, uUp + vec3(1e-4))), b = normalize(cross(dir, a));
  float ang = aRnd.y * 6.2832 + k * 9.0, rad = sin(3.14159 * k) * length(dir) * 0.06 * uSwirl * (0.3 + aRnd.z * 0.7);
  vec3 p = mix(card, tgt, ke) + (a * cos(ang) + b * sin(ang)) * rad;
  vCol = aCol; vFly = k;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float sz = mix(uCardSize, uSize, ke) * (1.0 + sin(3.14159 * k) * 0.7);
  bool passed = k >= 1.0 && (uP * 1.35 - 0.1) > (aSweep * 0.85 + 0.3);
  gl_PointSize = passed ? 0.0 : min(sz * uPx / max(-mv.z, 1e-4), 48.0);
  gl_Position = projectionMatrix * mv;
}`;
const PART_FS = `
varying vec3 vCol; varying float vFly;
void main() {
  vec2 c = gl_PointCoord - 0.5; if (dot(c, c) > 0.25) discard;
  vec3 col = vCol; if (vFly > 0.0 && vFly < 1.0) col = mix(col, vec3(1.0), 0.3);   // lit while flying (one flat step)
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;
function buildParticles(P, S) {
  if (fx.pts) { scene.remove(fx.pts); fx.pts.geometry.dispose(); }
  const asp = P.aspect, cols = Math.max(8, Math.round(Math.sqrt(N_PART * asp))), rows = Math.max(4, Math.round(N_PART / cols));
  const c = document.createElement('canvas'); c.width = cols; c.height = rows; const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(P.label, 0, 0, cols, rows); const px = g.getImageData(0, 0, cols, rows).data;
  const st = [], col = [], rnd = [], sw = [], tmp = new THREE.Color(), half = 0.5 * Math.hypot(asp, 1);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const s = (i + 0.5) / cols, t = (j + 0.5) / rows; if (!inLabel(S, s, t)) continue;
    const o = (j * cols + i) * 4; tmp.setRGB(px[o] / 255, px[o + 1] / 255, px[o + 2] / 255, THREE.SRGBColorSpace);
    st.push(s, t); col.push(tmp.r, tmp.g, tmp.b); rnd.push(Math.random(), Math.random(), Math.random(), Math.random());
    sw.push(Math.hypot((s - 0.5) * asp, 0.5 - t) / half);
  }
  const n = st.length / 2, geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('aST', new THREE.Float32BufferAttribute(st, 2)); geo.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aRnd', new THREE.Float32BufferAttribute(rnd, 4)); geo.setAttribute('aSweep', new THREE.Float32BufferAttribute(sw, 1));
  geo.setAttribute('aLocal', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  const m = fx.pmat || (fx.pmat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uLaunch: { value: BT.launch }, uSpread: { value: BT.spread }, uFly: { value: BT.fly }, uSwirl: { value: BT.swirl }, uCardW: { value: 0.01 }, uCardH: { value: 0.01 }, uCardSize: { value: 0.0005 }, uSize: { value: 0.0005 }, uPx: { value: 500 }, uP: { value: 0 }, uOrigin: { value: new THREE.Vector3() }, uRight: { value: new THREE.Vector3(1, 0, 0) }, uUp: { value: new THREE.Vector3(0, 1, 0) }, uSlot: { value: new THREE.Matrix4() } },
    vertexShader: PART_VS, fragmentShader: PART_FS, transparent: true, depthWrite: false, toneMapped: false,
  }));
  fx.pts = new THREE.Points(geo, m); fx.pts.frustumCulled = false; fx.pts.renderOrder = 12; fx.pts.userData = { cols, rows, n }; scene.add(fx.pts);
  aimParticles(S);
}
function aimParticles(S) {   // where each pixel lands on this picture's slot
  const a = fx.pts.geometry.attributes, st = a.aST.array, out = a.aLocal.array, p = new THREE.Vector3();
  for (let i = 0; i < st.length / 2; i++) { fromLabel(S, st[i * 2], st[i * 2 + 1], p); out[i * 3] = p.x; out[i * 3 + 1] = p.y; out[i * 3 + 2] = p.z + 0.0005; }
  a.aLocal.needsUpdate = true; fx.pts.userData.S = S;
}

// ---------------------------------------------------------------- tracking (Spray Bobo PR #47, as in Bobo X-Ray)
const TS = {};
function initTargets(targets) { for (const t of targets) TS[t.name] = { name: t.name, pr: t.properties, H: LAYOUT.targets[t.name].heightM, tracked: false, at: 0, gap: 40, p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1 }; }
let testBlind = false;                        // ?test only: pretend the camera lost every print
function onTarget(d) {
  const t = TS[d.name]; if (!t || testBlind) return;
  const upp = d.scale * (d.scaledHeight || 1) / t.pr.height;          // world units per target pixel
  t.q.set(d.rotation.x, d.rotation.y, d.rotation.z, d.rotation.w);
  t.p.set(d.position.x, d.position.y, d.position.z);
  t.s = t.pr.height * upp / t.H;                                       // world units per metre of the print
  const now = performance.now();
  if (!t.tracked) { diag.found++; tDiag(t.name).found++; } else t.gap += (clamp(now - t.at, 8, 400) - t.gap) * 0.2;
  t.tracked = true; t.at = now;
}
function onLost(d) { const t = TS[d.name]; if (t && t.tracked) { t.tracked = false; diag.lost++; tDiag(d.name).lost++; } }
// the side in view: whichever is tracked; with both, keep the current one
let side = null;
function pickSide() {
  const on = Object.values(TS).filter((t) => t.tracked);
  if (!on.length) return side;
  if (!side || !TS[side].tracked) side = on[0].name;
  return side;
}
const motion = { seen: 0, moved: 0 };
function onMotion(e) {
  const r = e.rotationRate, l = e.acceleration, a = e.accelerationIncludingGravity;
  const turn = r && r.alpha != null ? Math.hypot(r.alpha, r.beta, r.gamma) : null;
  const push = l && l.x != null ? Math.hypot(l.x, l.y, l.z) : a && a.x != null ? Math.abs(Math.hypot(a.x, a.y, a.z) - 9.81) : null;
  if (turn == null && push == null) return;
  const now = performance.now(); motion.seen = now;
  if ((turn != null && turn > STILL_DEG) || (push != null && push > STILL_ACC)) motion.moved = now;
}
const pose = { state: 'none', lostAt: 0, snap: true, last: null, valid: false, goneAt: 0 };
function updatePose(now) {
  for (const x of Object.values(TS)) if (x.tracked && now - x.at > clamp(x.gap * 3, 120, 300)) x.tracked = false;   // the engine went quiet
  const n = pickSide(), t = n && TS[n];
  let st;
  if (t && t.tracked) { st = 'track'; pose.last = n; pose.lostAt = now; follow(t.p, t.q, t.s); }
  else if (pose.last) {
    const gone = now - pose.lostAt, sensed = now - motion.seen < 400, still = sensed ? now - motion.moved > 150 : true;
    st = still && gone < (sensed ? HOLD_STILL_MS : HOLD_BLIND_MS) ? 'hold' : 'none';
  } else st = 'none';
  if (st === 'none' && pose.state !== 'none') pose.goneAt = now;
  if (st === 'none') pose.snap = true;
  const fresh = st !== 'none' && pose.state === 'none';
  if (fresh) arrived(now);
  pose.state = st; pose.valid = st !== 'none';
  A.visible = pose.valid && mode !== 'snap';
  for (const S of Object.values(SLOT)) S.g.visible = S.name === n;
}
// follow real movement at once, only smooth sub-millimetre jitter (Spray Bobo's follow)
function follow(p, q, s) {
  const aP = pose.snap ? 1 : clamp(A.position.distanceTo(p) / s / 0.0015, 0.5, 1);
  const aR = pose.snap ? 1 : clamp(A.quaternion.angleTo(q) / 0.03, 0.5, 1);
  const aS = pose.snap ? 1 : clamp(Math.abs(A.scale.x - s) / s / 0.02, 0.5, 1);
  pose.snap = false;
  A.position.lerp(p, aP); A.quaternion.slerp(q, aR); A.scale.setScalar(lerp(A.scale.x, s, aS));
  A.updateMatrixWorld(true);
}
const cur = () => (pose.valid && side && SLOT[side]) || null;

// ---------------------------------------------------------------- what happens
let mode = 'find', everFound = false, lastP = null;
function setMode(m) { mode = m; $('hud').dataset.mode = m; }
function arrived(now) {
  const away = now - (pose.goneAt || 0);
  if (!everFound || away > REOPEN_AFTER_MS) for (const S of Object.values(SLOT)) S.matP = 0;   // the photo re-materialises
  if (!everFound) { postEvent('found', {}); buzz([10, 40, 18]); }
  everFound = true; if (mode === 'find') setMode('seen');
  diag.firstFoundS = diag.firstFoundS || +((now - camStartAt) / 1000).toFixed(1);
}
let lostFor = 0, toastT = 0;
function hint(text) { if ($('hint').textContent !== text) $('hint').textContent = text || ''; }
function toast(text, ms = 2600) { const el = $('toast'); el.textContent = text; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, ms); }
const sheetOpen = () => !$('add').hidden || !$('edit').hidden || !$('opts').hidden || !$('how').hidden || !$('shot').hidden;

const clock = { t: 0 };
function tick(dt) {
  clock.t += dt;
  const now = performance.now();
  updatePose(now);
  const S = cur(), P = S && S.P;
  if (P) lastP = P;
  if (!pose.valid) {
    lostFor += dt;
    if (mode === 'seen' && lostFor > 0.6) setMode('find');
    if (mode === 'find') hint(everFound ? 'Find a charm again' : 'Point at Bobo or the can on your keychain');
  } else { lostFor = 0; if (mode === 'find') setMode('seen'); }

  // the slot in view
  const pulse = 0.5 + 0.5 * Math.sin(clock.t * (REDUCED ? 2.2 : 4.2));
  if (S) {
    const m = S.mat.uniforms, inBeam = beam && beam.P === P && beam.t >= 0;
    if (P.status === 'shown' && !inBeam) {
      if (S.matP === 0) sound.pop();
      S.matP = Math.min(1, S.matP + dt / REMAT_S);
      m.uHas.value = 1; m.uP.value = S.matP;
    } else if (!inBeam) { m.uHas.value = 0; m.uP.value = 0; }
    m.uPulse.value = pulse; m.uStr.value = LOOKS[look];
    S.outline.visible = m.uHas.value < 0.5;
    S.outline.material.opacity = 0.55 + 0.45 * pulse;
    // the can's label spins with inertia
    if (P.k === 'can') {
      if (!spin.drag) { P.spin += P.spinV * dt; P.spinV *= Math.pow(0.12, dt); }
      m.uSpin.value = P.spin;
    }
    if (mode === 'seen' && !beam) {
      if (P.status === 'shown') hint(P.k === 'can' ? 'Drag across the can to spin your photo' : 'Press the shutter to keep a picture');
      else hint('Tap the glowing spot to add your photo');
    }
    // a photo beamed to this charm from another one: it flies in now
    if (P.status === 'pending' && !beam && !sheetOpen() && mode === 'seen') startBeam(P, false);
  }
  tickBeam(dt, S);
  tickFx(dt);
  // chips and the Photo button
  const showChips = !!(S && P.status === 'shown' && !beam && mode === 'seen');
  if ($('chips').hidden === showChips) $('chips').hidden = !showChips;
  const pt = (S ? P : lastP) && (S ? P : lastP).status === 'shown' ? 'Change' : 'Photo';
  if ($('b-photo-t').textContent !== pt) $('b-photo-t').textContent = pt;
  recTick();
  diag.fpsN++;
}

// ---------------------------------------------------------------- THE BEAM
let beam = null;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _nd = new THREE.Vector2(), _ray = new THREE.Raycaster(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);
function startBeam(P, fromEditor) {
  if (beam) endBeam(true);
  P.spin = 0; P.spinV = 0; P.status = 'beaming';
  const card = $('beamcard'), cv = $('beamcard-cv'), w = 320, h = Math.max(24, Math.round(w / P.aspect));
  cv.width = w; cv.height = h; cv.getContext('2d').drawImage(P.label, 0, 0, w, h);
  card.classList.remove('go', 'wait'); card.hidden = false;
  if (fromEditor) { void card.offsetWidth; requestAnimationFrame(() => card.classList.add('go')); } else card.classList.add('go');
  beam = { P, pending: !fromEditor, t: -1, armAt: performance.now() + BT.card * 1000 + (fromEditor ? 60 : 0), S: null, landed: false, retracted: false, sx: 0, sy: 0, cw: 96, ch: 30 };
  setMode('beam'); hint('');
  diag.beams++;
}
function launch(S) {
  const r = $('beamcard').getBoundingClientRect();
  beam.sx = r.left + r.width / 2; beam.sy = r.top + r.height / 2; beam.cw = r.width; beam.ch = r.height;
  $('beamcard').hidden = true; $('beamcard').classList.remove('wait');
  buildParticles(beam.P, S); beam.S = S; beam.t = 0;
  sound.whoosh(); buzz(15);
}
function tickBeam(dt, S) {
  if (!beam) { if (fx.beamG) fx.beamG.visible = false; return; }
  const ok = !!(S && S.P === beam.P && mode !== 'snap');
  if (beam.t < 0) {                           // the card is shrinking, or waiting for the charm
    const ready = performance.now() >= beam.armAt;
    if (!ready || !ok) {
      if (ready) { $('beamcard').classList.add('wait'); hint(`Point at ${beam.P.name} to beam it`); }
      return;
    }
    launch(S);
  }
  if (!ok) {                                  // tracking lost: everything waits, hidden; resumes where it was
    fx.pts.visible = false; fx.beamG.visible = false;
    hint(`Find ${beam.P.name} again to finish`);
    return;
  }
  if (beam.S !== S) { aimParticles(S); beam.S = S; }
  hint('');
  beam.t += dt; const t = beam.t;
  // where the phone end is: the card's spot on the screen, a little in front of the camera
  camera.updateMatrixWorld();
  const land = S.g.localToWorld(_w.copy(S.land));
  const camPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld), dist = camPos.distanceTo(land);
  const D = Math.max(dist * 0.32, 1e-4), P5 = camera.projectionMatrix.elements[5], wpp = 2 * D / (P5 * innerHeight);
  _nd.set(beam.sx / innerWidth * 2 - 1, -(beam.sy / innerHeight * 2 - 1)); _ray.setFromCamera(_nd, camera);
  const origin = _ray.ray.origin.clone().addScaledVector(_ray.ray.direction, D);
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize(), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  // the pixels
  const u = fx.pts.material.uniforms, s = A.scale.x, cols = fx.pts.userData.cols;
  u.uT.value = t; u.uOrigin.value.copy(origin); u.uRight.value.copy(right); u.uUp.value.copy(up);
  u.uCardW.value = beam.cw * wpp; u.uCardH.value = beam.ch * wpp; u.uCardSize.value = beam.cw * wpp / cols * 1.6;
  u.uSize.value = (S.lb.ub - S.lb.ua) * S.W * (S.rec.kind === 'can' ? CAN_WRAP : 1) / cols * s * 1.05;
  u.uPx.value = P5 * renderer.domElement.height / 2; u.uSlot.value.copy(S.g.matrixWorld);
  const sweep = clamp((t - BT.sweep0) / (BT.sweep1 - BT.sweep0), 0, 1);
  u.uP.value = sweep; fx.pts.visible = true;
  const m = S.mat.uniforms; m.uHas.value = 1; m.uP.value = sweep; S.outline.visible = t < BT.launch + BT.fly;
  // the beam of light: grows from the phone to the charm, then pulls in after the last pixel
  const grow = easeInOut(t / BT.grow), back = easeInOut((t - BT.retract0) / (BT.retract1 - BT.retract0));
  const a = origin.clone().lerp(land, back), b = origin.clone().lerp(land, grow), len = a.distanceTo(b);
  fx.beamG.visible = len > 1e-6 && t < BT.retract1;
  if (fx.beamG.visible) {
    _v.subVectors(b, a).normalize(); _q.setFromUnitVectors(_up, _v);
    const r0 = beam.cw * wpp * 0.2 * (1 - back * 0.7), flick = REDUCED ? 1 : 1 + Math.sin(t * 47) * 0.08;
    for (const L of fx.layers) { L.position.copy(a); L.quaternion.copy(_q); L.scale.set(r0 * L.userData.k * flick, len, r0 * L.userData.k * flick); }
  }
  // the first pixels land: a ring shockwave and a sparkle burst on the slot
  if (!beam.landed && t >= BT.launch + BT.fly) { beam.landed = true; sound.land(); sound.shimmer(); buzz(18); S.ring.userData.t = 0; S.sparks.userData.t = 0; }
  if (beam.landed && !beam.chimed && t >= BT.sweep0 + 0.2) { beam.chimed = true; sound.shimmer(8); }
  if (t >= BT.end) endBeam(false);
}
function endBeam(abort) {
  const b = beam; beam = null;
  if (fx.pts) { scene.remove(fx.pts); fx.pts.geometry.dispose(); fx.pts = null; }
  if (fx.beamG) fx.beamG.visible = false;
  $('beamcard').hidden = true;
  if (!b) return;
  if (b.P.status === 'beaming') b.P.status = b.P.src ? 'shown' : 'empty';
  if (abort) return;
  if (b.S) b.S.matP = 1;
  if (b.pending) savePhoto(b.P, false);
  sound.chime(); buzz([12, 40, 22]); setMode(pose.valid ? 'seen' : 'find');
  postEvent('custom', { action: 'photo-beam-beamed', piece: b.P.k, style: b.P.params && b.P.params.style });
  diag.beamsDone++;
}
function tickFx(dt) {
  for (const S of Object.values(SLOT)) {
    const R = S.ring, k = R.userData.t;
    if (k != null && k >= 0) {
      R.userData.t += dt / (REDUCED ? 0.4 : 0.6); const x = R.userData.t;
      R.visible = x < 1; R.scale.setScalar(S.size * lerp(0.12, REDUCED ? 0.5 : 0.75, x)); R.material.opacity = 1 - x;
      if (x >= 1) R.userData.t = -1;
    }
    const sp = S.sparks, d = sp.userData;
    if (d.t >= 0) {
      d.t += dt / (REDUCED ? 0.5 : 0.8); const x = d.t, p = sp.geometry.attributes.position.array, r = S.size * 0.55 * (1 - Math.pow(1 - Math.min(x, 1), 3));
      d.dir.forEach((v, i) => { p[i * 3] = v.x * r; p[i * 3 + 1] = v.y * r; p[i * 3 + 2] = v.z * r * 0.6; });
      sp.geometry.attributes.position.needsUpdate = true;
      sp.material.size = S.H * 0.012 * A.scale.x; sp.material.opacity = x < 0.6 ? 1 : 1 - (x - 0.6) / 0.4;
      sp.visible = x < 1 && !REDUCED; if (x >= 1) d.t = -1;
    }
  }
}

// ---------------------------------------------------------------- taps and the can's spin
const spin = { id: null, x: 0, lx: 0, t: 0, moved: 0, drag: false };
const canvas = $('cam');
canvas.addEventListener('pointerdown', (e) => { spin.id = e.pointerId; spin.x = spin.lx = e.clientX; spin.t = performance.now(); spin.moved = 0; });
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== spin.id) return;
  const dx = e.clientX - spin.lx; spin.lx = e.clientX; spin.moved += Math.abs(dx);
  const S = cur(); if (!S || S.P.k !== 'can' || S.P.status !== 'shown' || spin.moved < 8) return;
  spin.drag = true; const d = -dx / innerWidth * 0.9; S.P.spin += d; S.P.spinV = d / (1 / 60);
});
canvas.addEventListener('pointerup', (e) => {
  if (e.pointerId !== spin.id) return; spin.id = null;
  const was = spin.drag; spin.drag = false;
  if (!was && spin.moved < 12 && performance.now() - spin.t < 450) tapAt(e.clientX, e.clientY);
});
canvas.addEventListener('pointercancel', () => { spin.id = null; spin.drag = false; });
function tapAt(x, y) {
  const S = cur(); if (!S || beam || mode === 'snap' || sheetOpen()) return;
  if (hitSlot(S, x, y)) { sound.click(); buzz(8); openAdd(S.P); }
  else if (S.P.status !== 'shown') { hint('Tap the glowing spot to add your photo'); }
}
function hitSlot(S, x, y) {
  const r = canvas.getBoundingClientRect(); _nd.set((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  _ray.setFromCamera(_nd, camera); A.updateMatrixWorld(true);
  if (_ray.intersectObject(S.mesh, false).length) return true;
  // a forgiving fallback: anywhere in the slot's box (grown a quarter) on the print plane
  const o = S.g.worldToLocal(_ray.ray.origin.clone()), d = S.g.worldToLocal(_ray.ray.origin.clone().add(_ray.ray.direction)).sub(o);
  if (Math.abs(d.z) < 1e-9) return false;
  const k = -o.z / d.z; if (k < 0) return false;
  const p = o.addScaledVector(d, k), u = p.x / S.W + 0.5, v = 0.5 - p.y / S.H, b = S.rec.box, gu = (b[2] - b[0]) * 0.25, gv = (b[3] - b[1]) * 0.25;
  return u > b[0] - gu && u < b[2] + gu && v > b[1] - gv && v < b[3] + gv;
}

// ---------------------------------------------------------------- the photo: decode, style, label
function fitCanvas(src, max) {
  const w0 = src.naturalWidth || src.videoWidth || src.width, h0 = src.naturalHeight || src.videoHeight || src.height, k = Math.min(1, max / Math.max(w0, h0));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); return c;
}
// any picture the phone gives us (HEIC included where the browser can decode it), capped at 1024 px
async function decodeImage(blob) {
  let bmp = null;
  try {
    const probe = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    const big = Math.max(probe.width, probe.height);
    if (big > 2 * LABEL_MAX) {               // very large: let the decoder shrink it (less memory on phones)
      const k = LABEL_MAX / big; probe.close && probe.close();
      bmp = await createImageBitmap(blob, { imageOrientation: 'from-image', resizeWidth: Math.round(probe.width * k) || 1, resizeHeight: Math.round(probe.height * k) || 1, resizeQuality: 'high' }).catch(() => createImageBitmap(blob));
    } else bmp = probe;
  } catch (e) { bmp = null; }
  if (!bmp) { const url = URL.createObjectURL(blob); try { bmp = await loadImg(url); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); } }
  const c = fitCanvas(bmp, LABEL_MAX); try { bmp.close && bmp.close(); } catch (e) { /* none */ }
  return c;
}
const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
// the photo cut to the slot's aspect (pan and zoom), in a style, with a sticker on top
function renderLabel(src, prm, aspect, pal, maxSide, out) {
  const Lw = aspect >= 1 ? maxSide : Math.round(maxSide * aspect), Lh = aspect >= 1 ? Math.round(maxSide / aspect) : maxSide;
  const c = out || document.createElement('canvas'); if (c.width !== Lw) c.width = Lw; if (c.height !== Lh) c.height = Lh;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, Lw, Lh);
  const sw = src.width, sh = src.height, sc = Math.max(Lw / sw, Lh / sh) * prm.zoom, dw = sw * sc, dh = sh * sc;
  const fx = dw - Lw, fy = dh - Lh;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, -fx / 2 + prm.px * fx / 2, -fy / 2 + prm.py * fy / 2, dw, dh);
  stylise(g, Lw, Lh, prm.style, pal);
  if (prm.sticker && STK.art[prm.sticker.id]) {
    const a = STK.art[prm.sticker.id], h = Math.min(Lw, Lh) * prm.sticker.s, w = h * a.width / a.height;
    g.drawImage(a, prm.sticker.u * Lw - w / 2, prm.sticker.v * Lh - h / 2, w, h);
  }
  return c;
}
// pixel filters only: Screen print (3 flat colours from the slot), Halftone dots, Mono. No generative anything.
function stylise(g, w, h, style, pal) {
  if (style === 'photo') return;
  const img = g.getImageData(0, 0, w, h), d = img.data, n = w * h;
  if (style === 'mono' || style === 'print') {
    const L = new Float32Array(n); let lo = 1, hi = 0;
    const hist = new Uint32Array(256);
    for (let i = 0; i < n; i++) { const l = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255; L[i] = l; hist[Math.round(l * 255)]++; }
    let acc = 0; for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > n * 0.02 && lo === 1) lo = i / 255; if (acc > n * 0.98) { hi = i / 255; break; } }
    const span = Math.max(hi - lo, 0.05), P = pal.map(hexRgb);
    for (let i = 0; i < n; i++) {
      const l = clamp((L[i] - lo) / span, 0, 1);
      if (style === 'mono') { const v = clamp((l - 0.5) * 1.15 + 0.5, 0, 1) * 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; }
      else { const c = l < 0.36 ? P[0] : l < 0.7 ? P[1] : P[2]; d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; }
    }
    g.putImageData(img, 0, 0); return;
  }
  if (style === 'dots') {                   // halftone: a dot per cell in that cell's own colour, sized by its darkness
    const cell = Math.max(5, Math.round(Math.max(w, h) / 64)), cw = Math.ceil(w / cell), ch = Math.ceil(h / cell);
    const t = document.createElement('canvas'); t.width = cw; t.height = ch; const tg = t.getContext('2d', { willReadFrequently: true });
    tg.drawImage(g.canvas, 0, 0, cw, ch); const s = tg.getImageData(0, 0, cw, ch).data;
    g.fillStyle = '#f7f3ea'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const o = (y * cw + x) * 4, l = (s[o] * 0.299 + s[o + 1] * 0.587 + s[o + 2] * 0.114) / 255, r = cell * 0.5 * Math.sqrt(clamp(1.08 - l, 0.06, 1)) * 1.3;
      const k = 0.85;   // the ink a touch deeper than the photo
      g.fillStyle = `rgb(${s[o] * k | 0},${s[o + 1] * k | 0},${s[o + 2] * k | 0})`;
      g.beginPath(); g.arc((x + 0.5) * cell + (y % 2 ? cell / 2 : 0), (y + 0.5) * cell, r, 0, Math.PI * 2); g.fill();
    }
  }
}
function setLabel(P) {
  P.label = renderLabel(P.src, P.params, P.aspect, P.palette, LABEL_MAX, P.label);
  if (!P.tex) { P.tex = new THREE.CanvasTexture(P.label); P.tex.colorSpace = THREE.SRGBColorSpace; P.tex.wrapS = THREE.RepeatWrapping; P.tex.anisotropy = 4; }
  P.tex.image = P.label; P.tex.needsUpdate = true; bindTex(P);
}
const defaultParams = () => ({ zoom: 1, px: 0, py: 0, style: 'photo', sticker: null });

// ---------------------------------------------------------------- saved photos (IndexedDB, on this phone only)
function idb() {
  return new Promise((res, rej) => {
    try { const r = indexedDB.open('photo-beam', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); }
  });
}
async function loadSaved() {
  try {
    const db = await idb();
    for (const P of Object.values(PIECES)) {
      const rec = await new Promise((res) => { const q = db.transaction('kv').objectStore('kv').get(P.k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); });
      if (!rec || !rec.src) continue;
      try {
        if (rec.params && rec.params.sticker) await stickerArt(rec.params.sticker.id);
        P.src = await decodeImage(rec.src); P.params = { ...defaultParams(), ...rec.params }; setLabel(P); P.status = rec.pending ? 'pending' : 'shown';
      } catch (e) { console.warn('saved photo', e); }
    }
  } catch (e) { /* none saved */ }
}
async function savePhoto(P, pending = false) {
  try {
    const blob = await new Promise((res) => P.src.toBlob(res, 'image/jpeg', 0.9));
    const db = await idb();
    await new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put({ src: blob, params: P.params, pending, at: Date.now() }, P.k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    return true;
  } catch (e) { console.warn('save', e); return false; }
}
async function markShown(P) { if (P.src) savePhoto(P, false); }
async function removePhoto(P) {
  if (!P) return;
  if (beam && beam.P === P) endBeam(true);
  try { const db = await idb(); db.transaction('kv', 'readwrite').objectStore('kv').delete(P.k); } catch (e) { /* none */ }
  P.status = 'empty'; P.src = null; P.params = null; P.spin = P.spinV = 0;
  for (const n of P.targets) if (SLOT[n]) { SLOT[n].mat.uniforms.uHas.value = 0; SLOT[n].matP = 0; }
  syncRemove(); toast(`Photo removed from ${P.name}`); sound.click();
}
function syncRemove() {
  const P = lastP && lastP.status !== 'empty' ? lastP : Object.values(PIECES).find((x) => x.status !== 'empty');
  $('o-remove').disabled = !P; $('o-remove-s').textContent = P ? `Take it off ${P.name}` : 'Nothing to remove yet';
  $('o-remove').dataset.k = P ? P.k : '';
}

// ---------------------------------------------------------------- stickers (Spray Bobo's decal library)
const STK = { lib: null, art: {}, ready: null };
STK.ready = getJson('/evade/spray-bobo/decals/decals.json').then((m) => { STK.lib = m.decals.filter((d) => d.cat !== 'wear'); buildStickers(); }).catch(() => { STK.lib = []; });
function stickerArt(id) {   // the decal with a white die-cut edge, drawn once
  if (STK.art[id]) return Promise.resolve(STK.art[id]);
  const d = (STK.lib || []).find((x) => x.id === id) || { file: id + '.svg' };
  return loadImg('/evade/spray-bobo/decals/' + d.file).then((img) => {
    const iw = img.naturalWidth || 256, ih = img.naturalHeight || 256, k = 256 / Math.max(iw, ih), w = Math.round(iw * k), h = Math.round(ih * k), pad = 10;
    const c = document.createElement('canvas'); c.width = w + pad * 2; c.height = h + pad * 2; const g = c.getContext('2d');
    const t = document.createElement('canvas'); t.width = w; t.height = h; const tg = t.getContext('2d');
    tg.drawImage(img, 0, 0, w, h); tg.globalCompositeOperation = 'source-in'; tg.fillStyle = '#ffffff'; tg.fillRect(0, 0, w, h);
    for (let a = 0; a < 16; a++) g.drawImage(t, pad + Math.cos(a * 0.3927) * pad * 0.9, pad + Math.sin(a * 0.3927) * pad * 0.9);
    g.drawImage(img, pad, pad, w, h); STK.art[id] = c; return c;
  });
}
function buildStickers() {
  const el = $('ed-stickers'); el.innerHTML = '';
  const mk = (id, html, label) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.id = id; b.setAttribute('aria-label', label); b.setAttribute('aria-checked', 'false'); b.innerHTML = html; el.appendChild(b); return b; };
  mk('', '<span>None</span>', 'No sticker').classList.add('none');
  for (const d of STK.lib) mk(d.id, `<img src="/evade/spray-bobo/decals/${d.file}" alt="" loading="lazy">`, d.name + ' sticker');
  el.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b || !ED.P) return;
    const id = b.dataset.id; sound.click();
    if (!id) ED.params.sticker = null;
    else { await stickerArt(id).catch(() => null); ED.params.sticker = { id, u: 0.78, v: 0.62, s: ED.P.aspect > 2 ? 0.8 : 0.42 }; }
    syncStickers(); drawEditor();
  };
}
function syncStickers() { const id = (ED.params && ED.params.sticker && ED.params.sticker.id) || ''; document.querySelectorAll('#ed-stickers button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.id === id))); }

// ---------------------------------------------------------------- sheets: add (Snap / Choose) and the editor
function openSheet(id) { $(id).hidden = false; const f = $(id).querySelector('.x, button'); if (f) f.focus(); }
function closeSheet(id) { $(id).hidden = true; }
let addFor = null;
function openAdd(P) {
  if (!P) { toast('Point at a charm first'); return; }
  if (beam) return;
  addFor = P;
  $('add-t').textContent = P.status === 'shown' ? 'Change your photo' : 'Add your photo';
  $('add-sub').textContent = `It lands on ${P.where}.`;
  openSheet('add');
}
document.querySelectorAll('[data-close]').forEach((el) => { el.addEventListener('click', () => { const bs = el.closest('.bs'); if (bs) { bs.hidden = true; if (bs.id === 'opts') $('b-opts').setAttribute('aria-expanded', 'false'); } }); });
addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; for (const id of ['opts', 'add']) if (!$(id).hidden) closeSheet(id); if (!$('edit').hidden) closeEditor(); if (mode === 'snap') stopSnap(); });

// Snap: the live AR camera frame, through a viewfinder in the slot's shape
let snapFor = null;
function startSnap(P) {
  snapFor = P; closeSheet('add'); setMode('snap'); diag.snaps++;
  const asp = P.aspect, maxW = Math.min(innerWidth * 0.88, 520), maxH = innerHeight * 0.42, w = Math.min(maxW, maxH * asp), h = w / asp;
  const win = $('finder-win'); win.style.width = w + 'px'; win.style.height = h + 'px';
  $('finder').style.setProperty('--fh', h + 'px');
  win.style.borderRadius = P.k === 'can' ? '22px' : (h / 2.2) + 'px ' + (h / 2.2) + 'px 12px 12px';
  $('finder-freeze').hidden = true; $('finder').hidden = false;
  $('shoot-t').textContent = 'Tap to take it'; $('b-shutter').setAttribute('aria-label', 'Take the picture for your charm');
}
function stopSnap() {
  $('finder').hidden = true; snapFor = null; setMode(pose.valid ? 'seen' : 'find');
  $('shoot-t').textContent = 'Tap: photo · Hold: video'; $('b-shutter').setAttribute('aria-label', 'Take a photo. Press and hold to film');
}
async function snapFrame() {
  const P = snapFor, v = engineVideo(); if (!P) return;
  const fl = $('flashw'); fl.classList.add('on'); setTimeout(() => fl.classList.remove('on'), 60); sound.shutter(); buzz(20);
  try {
    if (!v || !v.videoWidth) throw new Error('no video');
    const cr = canvas.getBoundingClientRect(), wr = $('finder-win').getBoundingClientRect(), vw = v.videoWidth, vh = v.videoHeight;
    const sc = Math.max(cr.width / vw, cr.height / vh), ox = cr.left + (cr.width - vw * sc) / 2, oy = cr.top + (cr.height - vh * sc) / 2;
    const sx = (wr.left - ox) / sc, sy = (wr.top - oy) / sc, sw = wr.width / sc, sh = wr.height / sc, k = Math.min(1, LABEL_MAX / Math.max(sw, sh));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
    c.getContext('2d').drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height);
    const fz = $('finder-freeze'); fz.width = c.width; fz.height = c.height; fz.getContext('2d').drawImage(c, 0, 0); fz.hidden = false;
    await wait(420);
    stopSnap(); openEditor(P, c);
  } catch (e) { console.warn('snap', e); stopSnap(); toast('Couldn\'t grab the camera picture. Try Choose instead.'); }
}

// Choose: the phone's picker. Phones can pause or drop our camera while it is open, so check it after.
let picking = false;
$('a-snap').onclick = () => { if (addFor) startSnap(addFor); };
$('a-choose').onclick = () => { closeSheet('add'); picking = true; diag.picks++; $('file').value = ''; $('file').click(); };
$('file').addEventListener('change', async () => {
  const f = $('file').files && $('file').files[0]; picking = false; ensureCamera('picker');
  if (!f || !addFor) return;
  try { const c = await decodeImage(f); openEditor(addFor, c); }
  catch (e) { console.warn('decode', e); diag.errors.push('decode: ' + String(e).slice(0, 80)); toast('Couldn\'t open that photo. Try another one.'); }
});
$('file').addEventListener('cancel', () => { picking = false; ensureCamera('cancel'); });
addEventListener('focus', () => { if (picking) setTimeout(() => { if (picking) { picking = false; ensureCamera('focus'); } }, 600); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && camStartAt) setTimeout(() => ensureCamera('visible'), 400); });

// The editor: drag to pan, pinch / wheel to zoom, a style, a sticker. Its preview is the label itself with the
// slot's shape cut out of a flat dark surround.
const ED = { P: null, src: null, params: null, ptrs: new Map(), pinch: 0, mode: null, raf: 0 };
function openEditor(P, src, prm) {
  ED.P = P; ED.src = src; ED.params = prm ? { ...prm } : defaultParams();
  document.querySelectorAll('#ed-style button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === ED.params.style)));
  syncStickers(); drawThumb(P);
  $('edit').hidden = false; drawEditor(); $('ed-go').focus();
}
function closeEditor() { $('edit').hidden = true; ED.P = null; ED.src = null; }
function edSlot(P) { return SLOT[side] && SLOT[side].P === P ? SLOT[side] : SLOT[P.targets[0]] || { rec: SL.targets[P.targets[0]], lb: labelBox(SL.targets[P.targets[0]]) }; }
function drawEditor() {
  if (!ED.P) return;
  cancelAnimationFrame(ED.raf);
  ED.raf = requestAnimationFrame(() => {
    if (!ED.P) return;
    const P = ED.P, cv = $('ed-cv');
    renderLabel(ED.src, ED.params, P.aspect, P.palette, 640, cv);
    const g = cv.getContext('2d'), w = cv.width, h = cv.height, S = edSlot(P);
    // the slot's shape: for a band, its outline in label space; the can's label is the whole rectangle
    g.save(); g.beginPath();
    if (S.rec.kind === 'band') {
      const lb = S.lb, X = (u) => (u - lb.ua) / (lb.ub - lb.ua) * w, Y = (v) => (v - lb.va) / (lb.vb - lb.va) * h;
      S.rec.poly.forEach(([u, v], i) => (i ? g.lineTo(X(u), Y(v)) : g.moveTo(X(u), Y(v)))); g.closePath();
      g.rect(0, 0, w, h); g.fillStyle = 'rgba(11,18,22,.78)'; g.fill('evenodd');
      g.beginPath(); S.rec.poly.forEach(([u, v], i) => (i ? g.lineTo(X(u), Y(v)) : g.moveTo(X(u), Y(v)))); g.closePath();
    } else { const r = Math.min(w, h) * 0.06; g.roundRect ? g.roundRect(2, 2, w - 4, h - 4, r) : g.rect(2, 2, w - 4, h - 4); }
    g.lineWidth = Math.max(3, w / 160); g.strokeStyle = COL.xs; g.stroke(); g.restore();
  });
}
function drawThumb(P) {
  const c = $('ed-thumb'), g = c.getContext('2d'), n = SLOT[side] && SLOT[side].P === P ? side : P.targets[0], rec = SL.targets[n];
  g.fillStyle = '#0b1216'; g.fillRect(0, 0, c.width, c.height);
  loadImg(KC + `image-targets/${n}_thumbnail.jpg`).then((img) => {
    const k = Math.min(c.width / img.width, c.height / img.height), w = img.width * k, h = img.height * k, x = (c.width - w) / 2, y = (c.height - h) / 2;
    g.drawImage(img, x, y, w, h); g.beginPath(); rec.poly.forEach(([u, v], i) => (i ? g.lineTo(x + u * w, y + v * h) : g.moveTo(x + u * w, y + v * h))); g.closePath();
    g.fillStyle = COL.xs; g.fill();
  }).catch(() => {});
}
const edCv = $('ed-cv');
function edLocal(e) { const r = edCv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, r]; }
function onSticker(u, v) {
  const s = ED.params.sticker; if (!s || !STK.art[s.id]) return false;
  const a = STK.art[s.id], cw = edCv.width, ch = edCv.height, h = Math.min(cw, ch) * s.s, w = h * a.width / a.height;
  return Math.abs(u * cw - s.u * cw) < w / 2 && Math.abs(v * ch - s.v * ch) < h / 2;
}
edCv.addEventListener('pointerdown', (e) => {
  edCv.setPointerCapture(e.pointerId); const [u, v] = edLocal(e); ED.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  ED.mode = ED.ptrs.size === 1 && onSticker(u, v) ? 'sticker' : 'pan';
  if (ED.ptrs.size === 2) { const [a, b] = [...ED.ptrs.values()]; ED.pinch = Math.hypot(a.x - b.x, a.y - b.y); ED.mode = 'pinch'; }
});
edCv.addEventListener('pointermove', (e) => {
  const p = ED.ptrs.get(e.pointerId); if (!p || !ED.P) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  const r = edCv.getBoundingClientRect(), prm = ED.params;
  if (ED.mode === 'pinch' && ED.ptrs.size >= 2) {
    const [a, b] = [...ED.ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    if (ED.pinch > 0) prm.zoom = clamp(prm.zoom * d / ED.pinch, 1, 5); ED.pinch = d;
  } else if (ED.mode === 'sticker') {
    prm.sticker.u = clamp(prm.sticker.u + dx / r.width, 0, 1); prm.sticker.v = clamp(prm.sticker.v + dy / r.height, 0, 1);
  } else {                                     // pan: the free space the zoomed photo has beyond the label, each way
    const src = ED.src, Lw = edCv.width, Lh = edCv.height, sc = Math.max(Lw / src.width, Lh / src.height) * prm.zoom;
    const fxp = src.width * sc - Lw, fyp = src.height * sc - Lh, kx = Lw / r.width, ky = Lh / r.height;
    if (fxp > 0.5) prm.px = clamp(prm.px + 2 * dx * kx / fxp, -1, 1);
    if (fyp > 0.5) prm.py = clamp(prm.py + 2 * dy * ky / fyp, -1, 1);
  }
  drawEditor();
});
const edUp = (e) => { ED.ptrs.delete(e.pointerId); if (ED.ptrs.size < 2) ED.pinch = 0; if (!ED.ptrs.size) ED.mode = null; };
edCv.addEventListener('pointerup', edUp); edCv.addEventListener('pointercancel', edUp);
edCv.addEventListener('wheel', (e) => { e.preventDefault(); if (!ED.P) return; ED.params.zoom = clamp(ED.params.zoom * Math.exp(-e.deltaY * 0.0015), 1, 5); drawEditor(); }, { passive: false });
document.querySelectorAll('#ed-style button').forEach((b) => { b.onclick = () => { ED.params.style = b.dataset.v; document.querySelectorAll('#ed-style button').forEach((x) => x.setAttribute('aria-checked', String(x === b))); sound.click(); drawEditor(); }; });
$('ed-x').onclick = closeEditor;
$('ed-back').onclick = () => { const P = ED.P; closeEditor(); openAdd(P); };
$('ed-go').onclick = () => beamIt();
async function beamIt() {
  const P = ED.P; if (!P) return;
  sound.init();
  P.src = ED.src; P.params = { ...ED.params }; setLabel(P); closeEditor();
  savePhoto(P).then(syncRemove);
  for (const n of P.targets) if (SLOT[n]) SLOT[n].matP = 0;
  startBeam(P, true);
}

// ---------------------------------------------------------------- HUD buttons and options
$('b-photo').onclick = () => { sound.init(); const S = cur(); openAdd(S ? S.P : lastP); };
$('c-change').onclick = () => { const S = cur(); if (S) openAdd(S.P); };
$('c-remove').onclick = () => { const S = cur(); if (S) removePhoto(S.P); };
$('c-other').onclick = () => {
  const S = cur(); if (!S || !S.P.src) return;
  const others = Object.values(PIECES).filter((Q) => Q !== S.P);
  for (const Q of others) { Q.src = S.P.src; Q.params = { ...S.P.params, zoom: 1, px: 0, py: 0 }; setLabel(Q); Q.status = 'pending'; for (const n of Q.targets) if (SLOT[n]) SLOT[n].matP = 0; savePhoto(Q, true); }
  sound.click(); buzz(10); toast(`Point at ${others.map((Q) => Q.name).join(' or ')} and it beams over`, 3200); syncRemove();
};
function segInit(id, curV, fn) {
  const btns = [...document.querySelectorAll(`#${id} button`)];
  const sync = (v) => btns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === String(v))));
  sync(curV); btns.forEach((b) => { b.onclick = () => { sync(b.dataset.v); fn(b.dataset.v); sound.click(); }; });
}
segInit('seg-look', look, (v) => { look = v; store.set('look', v); });
function openOpts() { syncRemove(); $('opts').hidden = false; $('b-opts').setAttribute('aria-expanded', 'true'); $('opts').querySelector('.x').focus(); }
$('b-opts').onclick = openOpts;
const soundBtn = $('o-sound'); soundBtn.setAttribute('aria-checked', String(sound.on));
soundBtn.onclick = () => { sound.on = !sound.on; store.set('sound', sound.on ? '1' : '0'); soundBtn.setAttribute('aria-checked', String(sound.on)); };
$('o-remove').onclick = () => { const P = PIECES[$('o-remove').dataset.k]; closeSheet('opts'); removePhoto(P); };
$('o-how').onclick = () => { closeSheet('opts'); $('how').hidden = false; $('b-go').focus(); };
$('b-go').onclick = () => { $('how').hidden = true; store.set('how', '1'); };
$('err-retry').onclick = () => location.reload();
$('finder-x').onclick = () => { stopSnap(); };
function showError(title, body) { $('err-title').textContent = title; $('err-body').textContent = body; $('error').hidden = false; }

// ---------------------------------------------------------------- 8th Wall pipeline
const DPR = clamp(+params.get('dpr') || 1, 1, 3);   // 1x by default like Off the Chain (fastest pickup); ?dpr=2 sharper
function sizeCanvas() {
  const dpr = Math.min(devicePixelRatio || 1, DPR), w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}
let last = 0, camStartAt = 0, built = false;
// after a camera restart the engine may hand us a new three.js scene: move our things into it
function rebind() {
  const xr = XR8.Threejs.xrScene(); if (!xr || xr.scene === scene) return;
  const old = scene; ({ scene, camera, renderer } = xr); renderer.outputColorSpace = THREE.SRGBColorSpace;
  for (const o of [A, fx.beamG, fx.pts]) if (o) { old.remove(o); scene.add(o); }
  diag.rebinds++;
}
const appModule = () => ({
  name: 'photo-beam',
  onStart: () => { if (built) { rebind(); return; } buildScene(XR8.Threejs.xrScene()); built = true; $('hud').hidden = false; setMode('find'); },
  onUpdate: () => { const now = performance.now(); const dt = Math.min((now - (last || now)) / 1000, 0.05); last = now; if (built) tick(dt); flushDiag(false); },
  onCameraStatusChange: ({ status, video, stream }) => {
    camLog(status);
    if (status === 'hasStream') { kickVideo(); noteStream(stream); }
    if (status === 'hasVideo') {
      hideTapCam(); if (!camStartAt) camStartAt = performance.now(); tuneCamera(video);
      $('splash').classList.add('gone'); setTimeout(() => { $('splash').hidden = true; }, 600);
      if (store.get('how', '0') !== '1' && !params.has('test')) { $('how').hidden = false; $('b-go').focus(); }
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
const runConfig = () => ({ canvas, allowedDevices: XR8.XrConfig.device().ANY, cameraConfig: { direction: XR8.XrConfig.camera().BACK } });
async function start() {
  if (!loaded) return;
  $('b-start').disabled = true; $('b-start').textContent = 'Starting…';
  sound.init(); capture && capture.configure({ audioContext: sound.ctx }); await askMotion();
  const data = await assets;
  sizeCanvas(); addEventListener('resize', sizeCanvas); addEventListener('orientationchange', () => setTimeout(sizeCanvas, 300));
  initTargets(data.tdata);
  XR8.XrController.configure({ disableWorldTracking: true, imageTargetData: data.tdata });
  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(), XR8.Threejs.pipelineModule(), XR8.XrController.pipelineModule(), XR8.CanvasScreenshot.pipelineModule(),
    appModule(),
    { name: 'pb-capture', onRender: () => { if (capture) capture.frame(); } },
  ]);
  camLog('run'); postEvent('scan', {});
  setTimeout(() => { if (!camStartAt && !tapCamShown) camFailed('no video after 12 s'); }, 12000);
  XR8.run(runConfig());
}
$('b-start').onclick = start;

// After the photo picker (or a trip to another app) the camera may be paused or gone: if the engine's video is not
// advancing, play it; if that does not help, pause and resume the engine (its resume re-opens the camera when the
// stream's tracks are no longer live; XR8.stop() + XR8.run() throws "No valid session manager" in this build).
let restarting = false;
async function ensureCamera(why) {
  if (!camStartAt || restarting) return;
  const v = engineVideo(); if (!v) return;
  const t0 = v.currentTime; await wait(900);
  const v2 = engineVideo(); if (v2 && v2 === v && v.currentTime !== t0 && !v.paused) return;
  camLog('stalled:' + why);
  try { v.muted = true; await v.play(); } catch (e) { /* blocked */ }
  const t1 = v.currentTime; await wait(900);
  if (v.currentTime !== t1 && !v.paused) { camLog('resumed'); return; }
  restartCamera(why);
}
async function restartCamera(why) {
  if (restarting) return; restarting = true; diag.restarts++; camLog('restart:' + why);
  try { if (!XR8.isPaused()) XR8.pause(); } catch (e) { /* not running */ }
  await wait(300);
  try { XR8.resume(); } catch (e) { diag.errors.push('resume: ' + String(e).slice(0, 120)); }
  // the new stream's video can sit paused (no gesture since): play it until frames flow
  for (let i = 0; i < 12; i++) {
    await wait(350);
    const v = engineVideo();
    if (v && v.srcObject && v.paused) { v.muted = true; v.play().catch(() => {}); }
    if (v && !v.paused && v.currentTime > 0) { camLog('restarted'); break; }
  }
  restarting = false;
}

// ---------------------------------------------------------------- camera (the same handling as Off the Chain / Spray Bobo / X-Ray)
// iPhones: ask for the multi-lens camera (close focus for a keychain) at 1920x1440; no picture in 4 s: reload once
// with the standard camera.
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const MACRO_LENSES = ['Back Triple Camera', 'Back Dual Wide Camera'];
let iosStd = false; try { iosStd = sessionStorage.getItem('xr-ios-std') === '1'; } catch (e) { /* none */ }
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
function engineVideo() { return [...document.querySelectorAll('video')].find((v) => v.srcObject) || null; }
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
    if (IOS_MACRO) { try { sessionStorage.setItem('xr-ios-std', '1'); } catch (e) { /* none */ } flushDiag(true, true); location.reload(); return; }
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
  if (IOS_MACRO) try { sessionStorage.setItem('xr-ios-std', '1'); } catch (e) { /* none */ }
  showError('The camera didn\'t start', 'Another app or tab may be using it. Close the Camera app and other tabs that use the camera, then tap Try again. If it still won\'t start, allow camera access for this site in your browser settings.');
}

// ---------------------------------------------------------------- photo and video (the Cola Run recorder)
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
    canvas, host: document.body, endpoint: location.origin, globeUrl: '/evade/where-is-bobo/', source: 'photo-beam', audioContext: null,
    connectAudio: (dest) => { const m = sound.master; if (!m) return () => {}; m.connect(dest); return () => { try { m.disconnect(dest); } catch (e) { /* gone */ } }; },
    overlay: (c, Wd, Hd) => drawWatermark(c, Wd, Hd),
    on: (name) => { if (name === 'recordStart') { buzz(25); recUi(true); } if (name === 'recordStop' || name === 'error') recUi(false); },
  });
  // the clip shows the user's own photo: save and share only, never sent anywhere
  Object.assign(capture.settings, {
    corner: 'topRight', offsetX: -5, offsetY: -6, accent: '#4fd6e8', maxSeconds: 30, sendEnabled: false,
    hintText: 'Film your charm wearing your photo', keepTitle: 'Keep your clip?', clipTitle: 'Photo Beam clip', filePrefix: 'photo-beam', backLabel: 'Back to the camera',
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
    sound.shutter(); buzz(20); const fl = $('flashw'); fl.classList.add('on'); setTimeout(() => fl.classList.remove('on'), 60);
    const b64 = await XR8.CanvasScreenshot.takeScreenshot();
    const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0); drawWatermark(g, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92));
    const file = new File([blob], `photo-beam-${++shots}.jpg`, { type: 'image/jpeg' }), url = URL.createObjectURL(blob);
    $('shot-img').src = url; $('shot-save').href = url; $('shot-save').download = file.name; $('shot-save').hidden = false;
    const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
    $('shot-share').hidden = !canShare; $('shot-share').onclick = () => navigator.share({ files: [file], title: 'Photo Beam' }).catch(() => {});
    $('shot').hidden = false; postEvent('share', { what: 'photo-beam-photo' });
  } catch (e) { console.error(e); }
}
const HOLD_MS = 320; let holding = false, holdT = 0;
const sh = $('b-shutter');
sh.addEventListener('contextmenu', (e) => e.preventDefault());
sh.addEventListener('pointerdown', (e) => {
  if (e.button > 0) return;
  if (mode === 'snap') { holding = false; return; }
  if (capture && capture.status === 'recording') { holding = false; return; }
  holding = true; try { sh.setPointerCapture(e.pointerId); } catch (err) { /* old Safari */ }
  clearTimeout(holdT); holdT = setTimeout(() => { if (holding && capture) capture.start(); }, HOLD_MS);
});
sh.addEventListener('pointerup', () => {
  if (mode === 'snap') { snapFrame(); return; }
  if (capture && capture.status === 'recording') { holding = false; clearTimeout(holdT); capture.stop(); return; }
  if (!holding) return; holding = false; clearTimeout(holdT); takePhoto();
});
sh.addEventListener('pointercancel', () => { holding = false; clearTimeout(holdT); if (capture && capture.status === 'recording') capture.stop(); });
sh.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (mode === 'snap') snapFrame(); else takePhoto(); } });
$('shot-close').onclick = () => { $('shot').hidden = true; };

// ---------------------------------------------------------------- Where is Bobo? events (city level, anonymous; never the photo)
const SID = 'pb-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
function postEvent(type, props) {
  if (params.has('nolog')) return;
  try { fetch('/api/bobo/events', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, source: 'photo-beam', sessionId: SID, props }) }).catch(() => {}); } catch (e) { /* offline */ }
}

// ---------------------------------------------------------------- test log (previews and local dev only, or ?diag)
// Read back with GET /api/ar/kc-diag on a deploy preview (records carry page: 'photo-beam').
const diag = { page: 'photo-beam', sid: SID, found: 0, lost: 0, fpsN: 0, beams: 0, beamsDone: 0, snaps: 0, picks: 0, restarts: 0, rebinds: 0, errors: [], steps: [], targets: {} };
function tDiag(n) { return diag.targets[n] || (diag.targets[n] = { found: 0, lost: 0 }); }
function camLog(s) { diag.steps.push([s, Math.round(performance.now())]); if (diag.steps.length > 40) diag.steps.shift(); }
let flushAt = 0;
function flushDiag(force, always = false) {
  const now = performance.now(); if (!force && now - flushAt < 10000) return; flushAt = now;
  if ((!camStartAt && !always) || params.has('nolog') || (LIVE_SITE && !params.has('diag'))) return;
  const body = JSON.stringify({ ...diag, secs: Math.round((now - (camStartAt || now)) / 1000), fps: camStartAt ? +(diag.fpsN / Math.max((now - camStartAt) / 1000, 1)).toFixed(1) : 0, look, photos: Object.values(PIECES).filter((P) => P.status !== 'empty').map((P) => P.k), screen: [innerWidth, innerHeight, devicePixelRatio] });
  try { if (!(navigator.sendBeacon && navigator.sendBeacon('/api/ar/kc-diag', new Blob([body], { type: 'application/json' })))) fetch('/api/ar/kc-diag', { method: 'POST', body, keepalive: true }); } catch (e) { /* offline */ }
}
addEventListener('pagehide', () => flushDiag(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) flushDiag(true); });
addEventListener('error', (e) => { diag.errors.push(String(e.message).slice(0, 200)); });

// automated tests (?test): inject a photo without the picker, run the beam, read the state
if (params.has('test')) window.__pb = {
  TS, diag, PIECES, SLOT,
  state: () => ({
    pose: pose.state, mode, side, piece: side && PIECE_OF[side] ? PIECE_OF[side].k : null,
    pieces: Object.fromEntries(Object.values(PIECES).map((P) => [P.k, { status: P.status, spin: +P.spin.toFixed(3), aspect: +(P.aspect || 0).toFixed(3) }])),
    beam: beam ? { piece: beam.P.k, t: +beam.t.toFixed(3), landed: beam.landed, particles: fx.pts ? fx.pts.userData.n : 0 } : null,
    slots: Object.fromEntries(Object.values(SLOT).map((S) => [S.name, { has: S.mat.uniforms.uHas.value, p: +S.mat.uniforms.uP.value.toFixed(3), outline: S.outline.visible, visible: S.g.visible }])),
    sheets: { add: !$('add').hidden, edit: !$('edit').hidden, opts: !$('opts').hidden },
  }),
  // decode a picture (data URL) and beam it onto a piece, as if "Beam it" was pressed in the editor
  async setPhoto(k, url, prm = {}) {
    const P = PIECES[k], blob = await (await fetch(url)).blob(), src = await decodeImage(blob);
    if (prm.sticker) await stickerArt(prm.sticker.id);
    ED.P = P; ED.src = src; ED.params = { ...defaultParams(), ...prm };
    await beamIt(); return true;
  },
  beam(k) { const P = PIECES[k]; if (!P.src) return false; startBeam(P, false); return true; },
  async openEditor(k, url, prm = {}) { const P = PIECES[k], src = await decodeImage(await (await fetch(url)).blob()); if (prm.sticker) await stickerArt(prm.sticker.id); openEditor(P, src, { ...defaultParams(), ...prm }); return true; },
  openAdd: (k) => openAdd(PIECES[k]), startSnap: (k) => startSnap(PIECES[k]), snap: () => snapFrame(),
  remove: (k) => removePhoto(PIECES[k]), restartCamera: () => restartCamera('test'), ensureCamera: () => ensureCamera('test'),
  // the slot's box corners on the screen (to aim taps in tests)
  slotScreen(n) {
    const S = SLOT[n || side]; if (!S || !A.visible) return null;
    const pr = (v) => { const p = S.g.localToWorld(v.clone()).project(camera); return [(p.x + 1) / 2 * innerWidth, (1 - p.y) / 2 * innerHeight]; };
    return { centre: pr(S.land), corners: [[0, 0], [1, 0], [1, 1], [0, 1]].map(([s, t]) => pr(fromLabel(S, s, t))) };
  },
  tap: (x, y) => tapAt(x, y), blind: (on) => { testBlind = !!on; },
  fake: (name, d) => onTarget({ name, position: d.position, rotation: d.rotation, scale: d.scale, scaledHeight: d.scaledHeight || 1 }),
};

// desktop: a QR to open it on the phone
if (!TOUCH) {
  $('desk').hidden = false;
  try { window.QRCode && QRCode.toString(location.href, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }, (err, svg) => { if (!err) $('qr').innerHTML = svg; }); } catch (e) { /* no QR */ }
}
