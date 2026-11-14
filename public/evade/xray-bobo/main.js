// Bobo X-Ray: point the phone at Bobo (the EVADE cat charm, or the same picture on a tee). The print opens into a
// box that goes back INTO the surface, and Bobo floats in the middle of it. A scanner sweeps through the box and
// shows his bones where it has passed. On a tee it reads as an X-ray window into the wearer.
//
// How the hole works (no stencil buffer): an invisible "occluder" sheet lies on the print, with the window cut out
// of it. It is drawn first and writes only depth (colorWrite off), so the camera picture still shows through it, but
// anything behind the print plane is hidden everywhere except through the window. The box (five flat walls with a
// grid), the floating specks and Bobo all sit behind the print plane, so you only
// ever see them through the window, and they shift against its edge as the phone moves (that is the parallax).
// The 8th Wall engine creates the WebGL context itself (no stencil requested), which is why it is depth-only.
//
// Image tracking is the open-source 8th Wall engine (MIT), self-hosted with Off the Chain in
// /evade/keychain-ar/vendor/xr, with the same two cat targets (kc-bobo, kc-bobo-l: the charm's two sides).
// Tracking robustness is Spray Bobo's (PR #47): the scene is only drawn where the camera sees the print now; on a
// drop the last pose is held for a blink only while the phone is still, and a target the engine stops updating
// counts as lost after three of its usual update gaps.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ColaCapture } from '/evade/cola-run-lab/assets/capture-core.js';

window.THREE = THREE;                         // XR8.Threejs.pipelineModule() looks for a global THREE
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const KC = '/evade/keychain-ar/';             // Off the Chain: engine, image targets
const LIVE_SITE = /(^|\.)medialife\.ai$/i.test(location.hostname);
const TOUCH = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const easeOut = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
const easeInOut = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* no haptics */ } };
const store = { get(k, d) { try { const v = localStorage.getItem('xray-bobo-' + k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('xray-bobo-' + k, String(v)); } catch (e) { /* none */ } } };

// ---------------------------------------------------------------- what is tracked
// Each charm is a piece: its two pictures (front and back), its die-cut line (Spray Bobo's outline files, uv of the
// front picture; `sides` in the can's file places the window on the back picture), and what floats in its box.
// The cat's back picture is the print seen through the acrylic (mirrored); the can's back is a different print.
const PIECES = {
  bobo: { k: 'bobo', name: 'Bobo', targets: ['kc-bobo', 'kc-bobo-l'], flip: { 'kc-bobo-l': -1 }, outline: 'cat-outline.json', glb: 'bobo-keychain.glb' },
  can: { k: 'can', name: 'the can', targets: ['kc-can', 'kc-can-back'], flip: {}, outline: 'can-outline.json', glb: 'eclipse-can.glb' },
};
const PIECE_OF = {}; for (const P of Object.values(PIECES)) for (const n of P.targets) PIECE_OF[n] = P;
const TARGETS = Object.keys(PIECE_OF);
const FLIP = Object.assign({}, ...Object.values(PIECES).map((P) => P.flip));
// Losing the print: the last pose is held this long, and only while the phone is still (Spray Bobo's numbers)
const HOLD_STILL_MS = 250, HOLD_BLIND_MS = 120, STILL_DEG = 25, STILL_ACC = 1.2;
const REOPEN_AFTER_MS = 2500;                 // lost longer than this: the box opens again with its intro

// ---------------------------------------------------------------- the look (flat colours, no gradients)
const COL = {
  x: 0x4fd6e8,                                // the scanner cyan (rim, grid, scan line, specks, ghost)
  back: '#061019', side: '#0b2232', top: '#08192a', bottom: '#0e2a3d',   // the walls: one flat shade each
  bone: 0xeefcff, socket: 0x061019,
};
const BOX = { depthK: +store.get('depth', 1) || 1, shape: store.get('win', 'box') === 'cat' ? 'cat' : 'box' };
let view = ['scan', 'xray', 'skin'].includes(store.get('view', 'scan')) ? store.get('view', 'scan') : 'scan';

// ---------------------------------------------------------------- sound (made here, no files)
const sound = {
  ctx: null, on: store.get('sound', '1') === '1', master: null, hum: null,
  init() {
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)(); this.ctx.resume();
      if (!this.master) { this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination); }
      if (!this.hum) {   // the scanner hum: two low sines, opened while the box is open
        const g = this.ctx.createGain(); g.gain.value = 0; g.connect(this.master);
        for (const f of [55, 110.6]) { const o = this.ctx.createOscillator(); o.frequency.value = f; const og = this.ctx.createGain(); og.gain.value = f < 100 ? 1 : 0.35; o.connect(og).connect(g); o.start(); }
        this.hum = g;
      }
    } catch (e) { /* no audio */ }
  },
  humTo(v) { if (!this.hum) return; this.hum.gain.setTargetAtTime(this.on ? v * 0.05 : 0, this.ctx.currentTime, 0.2); },
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
  open() {   // spans the 3.6 s break-up: a low crack, digital blips as the tiles fly, a rising sweep as the box opens
    this.noise(0.9, 0.09, 200, 2200); this.tone(180, 60, 0.9, 0.14, 'sine');
    for (let i = 0; i < 10; i++) this.tone(1200 + Math.random() * 1400, 900 + Math.random() * 900, 0.05, 0.025, 'square', 0.4 + i * 0.22);
    this.noise(1.6, 0.04, 2500, 9000, 0.6); this.tone(220, 660, 1.4, 0.05, 'sine', 1.9); this.tone(900, 1800, 0.25, 0.03, 'triangle', 3.2);
  },
  beep() { this.tone(1760, 1760, 0.06, 0.035, 'square'); },
  mew() { this.tone(620, 880, 0.14, 0.08, 'triangle'); this.tone(880, 560, 0.22, 0.08, 'triangle', 0.13); },
  fizz() { this.noise(0.6, 0.12, 3000, 12000); this.tone(1400, 2600, 0.12, 0.03, 'sine', 0.05); },
  click() { this.tone(1200, 900, 0.05, 0.05, 'triangle'); },
  bounce(v) { if (v > 0.15) this.tone(520 + v * 500, 300 + v * 200, 0.07, Math.min(0.09, 0.02 + v * 0.05), 'triangle'); },
  throwIt() { this.noise(0.18, 0.05, 1500, 6000); },
  swat() { this.noise(0.22, 0.12, 700, 5000); this.tone(300, 900, 0.16, 0.06, 'triangle'); },
  whiff() { this.noise(0.2, 0.06, 900, 3000); },
  score(n) { [1047, 1319, 1568, 2093].slice(0, 2 + Math.min(n, 2)).forEach((f, i) => this.tone(f, f, 0.14, 0.06, 'triangle', i * 0.07)); },
  shutter() { this.noise(0.05, 0.22, 2000, 9000); this.noise(0.07, 0.16, 1200, 6000, 0.08); },
};

// ---------------------------------------------------------------- loading
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
const getJson = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(r.status + ' ' + u); return r.json(); });
const gl = new GLTFLoader();
const assets = Promise.all([
  getJson(KC + 'image-targets/layout.json'),
  Promise.all(TARGETS.map((n) => getJson(KC + `image-targets/${n}.json`))),
  ...Object.values(PIECES).map((P) => Promise.all([
    gl.loadAsync('/evade/keychain/ar/' + P.glb),
    getJson('/evade/spray-bobo/art/' + P.outline),            // the die-cut line, uv of the front picture (y down)
    Promise.all(P.targets.map((n) => loadImg(KC + `image-targets/${n}.jpg`))),   // each picture: the tiles that break away
  ]).then(([gltf, outline, prints]) => { P.gltf = gltf; P.outlineData = outline; P.prints = Object.fromEntries(P.targets.map((n, i) => [n, prints[i]])); })),
]).then(([layout, tdata]) => { for (const P of Object.values(PIECES)) { const L = layout.targets[P.targets[0]]; P.W = L.widthM; P.H = L.heightM; } return { tdata }; });
const xrReady = new Promise((res) => (window.XR8 ? res() : window.addEventListener('xrloaded', () => res(), { once: true })));
let loaded = false;
Promise.all([assets, xrReady]).then(() => {
  loaded = true; $('load').hidden = true; $('b-start').disabled = false; $('b-start').textContent = 'Start X-ray';
}).catch((e) => { console.error(e); showError('Could not load the experience', 'Check your connection and reload the page.'); });

// ---------------------------------------------------------------- the scene
let scene, camera, renderer;
const A = new THREE.Group();                  // follows the print (units: metres of the real print, see onTarget)
const F = new THREE.Group(); A.add(F);        // x flipped on the charm's other side
let W = 0.0601, H = 0.0801;                   // the kc-bobo picture in metres (layout.json)
let occluder, rim, box, walls = {}, lid, specks, scanBar, inside, bob, model, mixer, clips = {}, current = null, outlineData = null, root = null;
let cp = null;                                // the current piece (its things are in the variables above while it is current)
const KEYS = ['win', 'W', 'H', 'occluder', 'rim', 'box', 'walls', 'lid', 'specks', 'scanBar', 'inside', 'bob', 'model', 'mixer', 'clips', 'current', 'outlineData', 'root'];
function save(P) { const v = { win, W, H, occluder, rim, box, walls, lid, specks, scanBar, inside, bob, model, mixer, clips, current, outlineData, root }; for (const k of KEYS) P[k] = v[k]; }
function load(P) { ({ win, W, H, occluder, rim, box, walls, lid, specks, scanBar, inside, bob, model, mixer, clips, current, outlineData, root } = P); }
function usePiece(P) {
  if (cp === P) return; if (cp) { save(cp); cp.root.visible = false; }
  clearBalls(); cp = P; load(P); root.visible = true;
  $('b-swipe-t').textContent = P.k === 'can' ? 'Fizz' : 'Swipe'; open.dWant = H * BOX.depthK; open.k = 0; open.target = 1; open.depth = 0;
}
const skinPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);   // the skin shows below the scan line
const rayPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);     // the X-ray shows above it
const skinMats = [], rayMats = [];
const open = { k: 0, target: 0, depth: 0, dWant: 1 };   // k: how far the box has opened (0..1); depth: the box's depth now (m)

function buildScene(xr, data) {
  ({ scene, camera, renderer } = xr);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.localClippingEnabled = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.75;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a4050, 1.3));
  const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(1, 2.5, 4); scene.add(key);
  camera.position.set(0, 0, 0); camera.quaternion.identity();
  XR8.XrController.updateCameraProjectionMatrix({ origin: camera.position, facing: camera.quaternion });
  scene.add(A); A.visible = false;

  for (const P of Object.values(PIECES)) {
    W = P.W; H = P.H; outlineData = P.outlineData; walls = {}; win = null; current = null; clips = {}; occluder = rim = null;
    open.dWant = H * BOX.depthK;
    root = new THREE.Group(); F.add(root); root.visible = false;
    box = new THREE.Group(); root.add(box);     // walls are built one unit deep and scaled to the depth
    buildWalls();
    buildWindow(BOX.shape);
    buildLid(P);
    inside = new THREE.Group(); root.add(inside);   // what floats inside and the specks: not scaled with the box
    specks = makeSpecks(); inside.add(specks);
    if (P.k === 'bobo') buildBobo(P.gltf); else buildCan(P.gltf);
    scanBar = makeScanBar(); box.add(scanBar);
    save(P);
  }
  cp = null; usePiece(PIECES.bobo);
  setView(view, false);
}

// a grid tile in one flat wall colour (lines on two edges, so it repeats into a grid)
function gridTex(bg) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#4fd6e8'; g.globalAlpha = 0.55; g.fillRect(0, 0, 128, 3); g.fillRect(0, 0, 3, 128);
  g.globalAlpha = 0.18; g.fillRect(0, 63, 128, 2); g.fillRect(63, 0, 2, 128);   // a fainter half-cell line
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4; return t;
}
const CELL = () => H / 6;                      // grid cell: a sixth of the print's height
function buildWalls() {
  const mk = (bg) => new THREE.MeshBasicMaterial({ map: gridTex(bg), side: THREE.DoubleSide, toneMapped: false });
  const add = (k, geo, mat, fn) => { const m = new THREE.Mesh(geo, mat); fn(m); m.renderOrder = 1; box.add(m); walls[k] = m; };
  add('back', new THREE.PlaneGeometry(W, H), mk(COL.back), (m) => { m.position.z = -1; });
  add('left', new THREE.PlaneGeometry(1, H), mk(COL.side), (m) => { m.rotation.y = Math.PI / 2; m.position.set(-W / 2, 0, -0.5); });
  add('right', new THREE.PlaneGeometry(1, H), mk(COL.side), (m) => { m.rotation.y = -Math.PI / 2; m.position.set(W / 2, 0, -0.5); });
  add('top', new THREE.PlaneGeometry(W, 1), mk(COL.top), (m) => { m.rotation.x = Math.PI / 2; m.position.set(0, H / 2, -0.5); });
  add('bottom', new THREE.PlaneGeometry(W, 1), mk(COL.bottom), (m) => { m.rotation.x = -Math.PI / 2; m.position.set(0, -H / 2, -0.5); });
  repeatWalls();
}
function repeatWalls() {   // keep the cells square at the chosen depth
  const c = CELL(), D = open.dWant;
  walls.back.material.map.repeat.set(W / c, H / c);
  walls.left.material.map.repeat.set(D / c, H / c); walls.right.material.map.repeat.set(D / c, H / c);
  walls.top.material.map.repeat.set(W / c, D / c); walls.bottom.material.map.repeat.set(W / c, D / c);
}

// The window: its outline (a rectangle, or the cat's die-cut line), the occluder sheet with that hole, and a flat
// cyan rim on the print around it.
let win = null;                               // the occluder and rim (moved onto the can's back picture by its offset)
function windowPoints(shape) {
  if (shape === 'cat' && outlineData) return outlineData.points.map(([u, v]) => new THREE.Vector2((u - 0.5) * W, (0.5 - v) * H));
  const r = Math.min(W, H) * 0.035, pts = [], hw = W / 2, hh = H / 2;   // a rectangle with small rounded corners
  const corner = (cx, cy, a0) => { for (let i = 0; i <= 4; i++) { const a = a0 + i * Math.PI / 8; pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r)); } };
  corner(hw - r, hh - r, 0); corner(-hw + r, hh - r, Math.PI / 2); corner(-hw + r, -hh + r, Math.PI); corner(hw - r, -hh + r, Math.PI * 1.5);
  return pts;
}
function buildWindow(shape) {
  for (const o of [occluder, rim]) if (o) { win.remove(o); o.geometry.dispose(); }
  if (!win || win.parent !== root) { win = new THREE.Group(); root.add(win); root.userData.win = win; }
  let pts = windowPoints(shape);
  if (THREE.ShapeUtils.isClockWise(pts)) pts = pts.slice().reverse();
  // the occluder: a big sheet (20 prints across) with the window as a hole. Depth only, drawn before everything.
  const R = H * 10, outer = new THREE.Shape([new THREE.Vector2(-R, -R), new THREE.Vector2(R, -R), new THREE.Vector2(R, R), new THREE.Vector2(-R, R)]);
  outer.holes.push(new THREE.Path(pts.slice().reverse()));
  occluder = new THREE.Mesh(new THREE.ShapeGeometry(outer), new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }));
  occluder.renderOrder = -10; win.add(occluder);
  // the rim: a flat ribbon just outside the window's edge
  rim = new THREE.Mesh(ribbon(pts, H * 0.012), new THREE.MeshBasicMaterial({ color: COL.x, toneMapped: false, side: THREE.DoubleSide, transparent: true, depthWrite: false }));
  rim.position.z = 0.0004; rim.renderOrder = 30; win.add(rim);
  win.userData.side = null;
  BOX.shape = shape;
}
// a closed flat ribbon of width w on the outside of a counter-clockwise outline (mitred corners)
function ribbon(pts, w) {
  const n = pts.length, pos = [], idx = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const d1 = new THREE.Vector2().subVectors(p, a).normalize(), d2 = new THREE.Vector2().subVectors(b, p).normalize();
    const n1 = new THREE.Vector2(d1.y, -d1.x), n2 = new THREE.Vector2(d2.y, -d2.x);   // outward for counter-clockwise
    const m = n1.clone().add(n2); const ml = m.length(); if (ml < 1e-6) m.copy(n1); else m.divideScalar(ml);
    const k = Math.min(1 / Math.max(m.dot(n1), 0.35), 2.5);
    pos.push(p.x, p.y, 0, p.x + m.x * w * k, p.y + m.y * w * k, 0);
  }
  for (let i = 0; i < n; i++) { const j = (i + 1) % n, a = i * 2, b = j * 2; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
}

// The lid: each picture of this piece as a texture for the break-up tiles (makeShatter).
function buildLid(P) {
  P.lidTex = {};
  for (const [n, print] of Object.entries(P.prints)) { const t = new THREE.Texture(print); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; P.lidTex[n] = t; }
  const n0 = P.targets[0];
  lid = makeShatter(P.lidTex[n0]); root.add(lid);
}

// The break-up: the print as a grid of tiles over the real print (it looks identical at first). From the middle
// outwards each tile turns digital (pixelates down to a few blocks, posterises into scanner cyan, gets a cyan edge),
// lifts off the surface, flies outwards and turns, and dissolves block by block, uncovering the box behind it.
// One instanced plane, one draw call; uP (0..~1.25) is the whole animation.
const SHATTER_VS = `
uniform float uP, uW, uH, uCols, uRows;
attribute vec2 aCell; attribute vec4 aRnd;
varying vec2 vUv, vCell; varying float vT, vR;
void main() {
  vec2 c = (aCell + 0.5) / vec2(uCols, uRows);
  vec2 ctr = vec2((c.x - 0.5) * uW, (c.y - 0.5) * uH);
  float d = length(ctr) / (0.5 * length(vec2(uW, uH)));
  float t = clamp((uP - (d * 0.55 + aRnd.x * 0.15)) / 0.5, 0.0, 1.0);
  vT = t; vUv = uv; vCell = aCell; vR = aRnd.y;
  vec3 p = position * vec3(uW / uCols, uH / uRows, 1.0) * (1.0 - smoothstep(0.5, 1.0, t) * 0.75);
  float a = t * t * (aRnd.z - 0.5) * 7.0, b = t * t * (aRnd.w - 0.5) * 5.0;
  p = vec3(p.x, p.y * cos(a) - p.z * sin(a), p.y * sin(a) + p.z * cos(a));
  p = vec3(p.x * cos(b) + p.z * sin(b), p.y, -p.x * sin(b) + p.z * cos(b));
  vec2 dir = normalize(ctr + vec2(1e-5, 2e-5));
  vec3 off = vec3(ctr + dir * t * t * uW * 0.4 * (0.5 + aRnd.w), sin(t * 3.14159) * uH * 0.16 * (0.4 + aRnd.y) + 0.0003);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p + off, 1.0);
}`;
const SHATTER_FS = `
uniform sampler2D uMap; uniform vec3 uCyan, uInk; uniform float uCols, uRows;
varying vec2 vUv, vCell; varying float vT, vR;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  if (vT >= 1.0) discard;
  float steps = vT <= 0.0 ? 64.0 : floor(mix(14.0, 2.0, smoothstep(0.0, 0.6, vT)));
  vec2 q = (floor(vUv * steps) + 0.5) / steps;
  if (hash(floor(vUv * steps) + vCell * 7.13) < smoothstep(0.45, 0.95, vT)) discard;   // dissolves block by block
  vec3 col = texture2D(uMap, (vCell + (vT <= 0.0 ? vUv : q)) / vec2(uCols, uRows)).rgb;
  if (vT > 0.0) {
    float L = dot(col, vec3(0.299, 0.587, 0.114));
    vec3 dig = mix(uInk, uCyan, floor(L * 3.0 + 0.5) / 3.0);   // flat steps, no blends
    if (vT + vR * 0.15 > 0.12) col = dig;
    vec2 e = min(vUv, 1.0 - vUv);
    if (min(e.x, e.y) < 0.07) col = uCyan;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;
function makeShatter(tex) {
  const cols = 18, rows = Math.round(cols * H / W), n = cols * rows;
  const g = new THREE.InstancedBufferGeometry(); g.copy(new THREE.PlaneGeometry(1, 1)); g.instanceCount = n;
  const cell = new Float32Array(n * 2), rnd = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { cell[i * 2] = i % cols; cell[i * 2 + 1] = Math.floor(i / cols); for (let k = 0; k < 4; k++) rnd[i * 4 + k] = Math.random(); }
  g.setAttribute('aCell', new THREE.InstancedBufferAttribute(cell, 2)); g.setAttribute('aRnd', new THREE.InstancedBufferAttribute(rnd, 4));
  const m = new THREE.ShaderMaterial({
    uniforms: { uP: { value: 0 }, uW: { value: W }, uH: { value: H }, uCols: { value: cols }, uRows: { value: rows }, uMap: { value: tex }, uCyan: { value: new THREE.Color(COL.x) }, uInk: { value: new THREE.Color(COL.back) } },
    vertexShader: SHATTER_VS, fragmentShader: SHATTER_FS, side: THREE.DoubleSide, toneMapped: false,
  });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 2; return mesh;
}

// floating specks: depth cues that slide past each other as the phone moves
function makeSpecks() {
  const N = 42, geo = new THREE.BufferGeometry(), p = new Float32Array(N * 3), seed = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { seed[i * 3] = Math.random() - 0.5; seed[i * 3 + 1] = Math.random(); seed[i * 3 + 2] = 0.06 + Math.random() * 0.88; }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.beginPath(); g.arc(16, 16, 13, 0, 7); g.fill();
  const m = new THREE.PointsMaterial({ color: COL.x, map: new THREE.CanvasTexture(c), size: H * 0.018, sizeAttenuation: true, transparent: true, alphaTest: 0.5, depthWrite: true, toneMapped: false });
  const pts = new THREE.Points(geo, m); pts.frustumCulled = false; pts.renderOrder = 4; pts.userData.seed = seed; return pts;
}
function tickSpecks(dt) {
  const s = specks.userData.seed, p = specks.geometry.attributes.position.array, D = open.depth;
  for (let i = 0; i < s.length / 3; i++) {
    s[i * 3 + 1] = (s[i * 3 + 1] + dt * (0.025 + (i % 5) * 0.006)) % 1;
    p[i * 3] = s[i * 3] * W * 0.88; p[i * 3 + 1] = (s[i * 3 + 1] - 0.5) * H * 0.9; p[i * 3 + 2] = -s[i * 3 + 2] * D;
  }
  specks.geometry.attributes.position.needsUpdate = true;
  specks.material.opacity = 1; specks.visible = open.k > 0.4;
}

// the scan line: a bright band on the side and back walls, and a faint sheet across the box at the same height
function makeScanBar() {
  const g = new THREE.Group(), t = H * 0.008;
  const mat = new THREE.MeshBasicMaterial({ color: COL.x, toneMapped: false, side: THREE.DoubleSide });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, t), mat); back.position.z = -1 + 0.001; g.add(back);
  for (const sx of [-1, 1]) { const s = new THREE.Mesh(new THREE.PlaneGeometry(1, t), mat); s.rotation.y = Math.PI / 2; s.position.set(sx * (W / 2 - 0.0003), 0, -0.5); g.add(s); }
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(W, 1), new THREE.MeshBasicMaterial({ color: COL.x, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  sheet.rotation.x = -Math.PI / 2; sheet.position.z = -0.5; g.add(sheet);
  g.children.forEach((m) => { m.renderOrder = 5; });
  return g;
}

// ---------------------------------------------------------------- Bobo: skin, ghost and bones
// The skin is the Off the Chain Bobo (Blender, keychain look, original rig). In X-ray he is a see-through cyan
// ghost (the same skinned mesh, so it moves with him) with a skeleton inside: parts sized from the vertices each
// bone moves, parented to the bones, so the skeleton follows every animation clip.
function buildBobo(gltf) {
  model = gltf.scene;
  model.traverse((o) => { if (o.name === 'Silhouette') o.visible = false; if (o.isMesh) o.frustumCulled = false; });
  mixer = new THREE.AnimationMixer(model);
  clips = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
  mixer.clipAction(clips.Sit).play(); mixer.setTime(0); model.updateMatrixWorld(true);
  const body = model.getObjectByName('Bobo') || model;   // (not the flat Silhouette card that ships in the file)
  const bb = new THREE.Box3().setFromObject(body, true), size = bb.getSize(new THREE.Vector3()), mid = bb.getCenter(new THREE.Vector3());
  mixer.stopAllAction();
  const s = (H * 0.56) / size.y;               // Bobo stands a bit over half the box's height
  // mirrored: the keychain print shows Bobo with his tail on the right, the model has it on the left (Off the Chain
  // mirrors him the same way). On the charm's back picture the whole piece is flipped again, so it matches there too.
  model.scale.set(-s, s, s); model.position.set(mid.x * s, -mid.y * s, -mid.z * s);
  bob = new THREE.Group(); bob.add(model); inside.add(bob);

  const skinned = [];
  model.traverse((o) => {
    if (o.isSkinnedMesh) skinned.push(o);
    if (o.isMesh && o.name !== 'Silhouette') {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach((m) => { m.clippingPlanes = [skinPlane]; m.clipShadows = false; skinMats.push(m); });
      o.renderOrder = 6;
    }
  });
  if (!skinned.length) return;
  // the ghost: each skinned part again in flat see-through cyan (both faces, so folds read a little brighter)
  const ghostMat = new THREE.MeshBasicMaterial({ color: COL.x, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, clippingPlanes: [rayPlane] });
  for (const sk of skinned) {
    if (/Outline/.test(sk.material && sk.material.name)) continue;   // the ink hull: the ghost needs no outline
    const ghost = new THREE.SkinnedMesh(sk.geometry, ghostMat); ghost.bindMode = sk.bindMode;
    ghost.position.copy(sk.position); ghost.quaternion.copy(sk.quaternion); ghost.scale.copy(sk.scale);
    sk.parent.add(ghost); ghost.bind(sk.skeleton, sk.bindMatrix); ghost.frustumCulled = false; ghost.renderOrder = 8;
  }
  rayMats.push(ghostMat);
  buildBones(skinned);
  play('Sit');
}
function buildBones(list) {
  const boneMat = new THREE.MeshBasicMaterial({ color: COL.bone, toneMapped: false, clippingPlanes: [rayPlane] });
  const sockMat = new THREE.MeshBasicMaterial({ color: COL.socket, toneMapped: false, clippingPlanes: [rayPlane] });
  rayMats.push(boneMat, sockMat);
  const sk = list[0], bones = sk.skeleton.bones, boxes = bones.map(() => new THREE.Box3()), v = new THREE.Vector3();
  for (const m of list) {
    const geo = m.geometry, P = geo.attributes.position, SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight;
    for (let i = 0; i < P.count; i++) {        // each vertex goes to the bone that moves it most
      let bj = -1, bw = 0.4;
      for (let k = 0; k < 4; k++) { const w = SW.getComponent(i, k); if (w > bw) { bw = w; bj = SI.getComponent(i, k); } }
      if (bj < 0) continue;
      const b = bones.indexOf(m.skeleton.bones[bj]); if (b < 0) continue;
      v.fromBufferAttribute(P, i).applyMatrix4(m.bindMatrix); boxes[b].expandByPoint(v);   // model (bind) space
    }
  }
  const sphere = new THREE.SphereGeometry(1, 14, 10), cyl = new THREE.CylinderGeometry(1, 1, 1, 10), cone = new THREE.ConeGeometry(1, 1, 8);
  const part = (g, m, pos, scl, rot) => { const o = new THREE.Mesh(g, m); o.position.copy(pos); o.scale.copy(scl); if (rot) o.quaternion.copy(rot); o.renderOrder = 9; o.frustumCulled = false; return o; };
  const along = (a, b, r, out) => {             // a cylinder from a to b, radius r, with a knob at each end
    const d = new THREE.Vector3().subVectors(b, a), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    out.push(part(cyl, boneMat, a.clone().add(b).multiplyScalar(0.5), new THREE.Vector3(r, d.length(), r), q));
    out.push(part(sphere, boneMat, a, new THREE.Vector3(r * 1.6, r * 1.6, r * 1.6)), part(sphere, boneMat, b, new THREE.Vector3(r * 1.6, r * 1.6, r * 1.6)));
  };
  bones.forEach((bone, j) => {
    const b = boxes[j]; if (b.isEmpty()) return;
    const c = b.getCenter(new THREE.Vector3()), e = b.getSize(new THREE.Vector3()), out = [], n = bone.name;
    const ax = e.x >= e.y && e.x >= e.z ? 'x' : e.y >= e.z ? 'y' : 'z', L = e[ax];
    const lo = c.clone(), hi = c.clone(); lo[ax] -= L * 0.4; hi[ax] += L * 0.4;
    if (n === 'CatHead') {                      // a skull: dome, eye sockets, a little jaw
      out.push(part(sphere, boneMat, c.clone().add(new THREE.Vector3(0, e.y * 0.02, -e.z * 0.04)), new THREE.Vector3(e.x * 0.31, e.y * 0.3, e.z * 0.33)));
      for (const sx of [-1, 1]) out.push(part(sphere, sockMat, c.clone().add(new THREE.Vector3(sx * e.x * 0.12, e.y * 0.03, e.z * 0.26)), new THREE.Vector3(e.x * 0.075, e.y * 0.085, e.z * 0.06)));
      out.push(part(sphere, sockMat, c.clone().add(new THREE.Vector3(0, -e.y * 0.07, e.z * 0.3)), new THREE.Vector3(e.x * 0.03, e.y * 0.025, e.z * 0.03)));
      out.push(part(sphere, boneMat, c.clone().add(new THREE.Vector3(0, -e.y * 0.17, e.z * 0.13)), new THREE.Vector3(e.x * 0.17, e.y * 0.06, e.z * 0.15)));
    } else if (n === 'FakeTorso') {             // a spine along the body, ribs around its front half, a pelvis
      const sp = c.clone(), r = Math.min(e.x, e.y, e.z), top = 'y' === ax ? 'z' : 'y';
      sp[top] += e[top] * 0.18;
      const a = sp.clone(), z = sp.clone(); a[ax] -= L * 0.45; z[ax] += L * 0.45;
      for (let i = 0; i <= 9; i++) out.push(part(sphere, boneMat, a.clone().lerp(z, i / 9), new THREE.Vector3(r * 0.07, r * 0.07, r * 0.07)));
      along(a, z, r * 0.025, out);
      const ring = new THREE.TorusGeometry(1, 0.06, 6, 24, Math.PI * 1.4);
      for (let i = 0; i < 5; i++) {
        const at = a.clone().lerp(z, 0.42 + i * 0.1), q = new THREE.Quaternion();
        if (ax === 'z') q.setFromEuler(new THREE.Euler(0, 0, -Math.PI * 0.2));
        else q.setFromEuler(new THREE.Euler(Math.PI / 2, 0, -Math.PI * 0.2));
        const rs = 1 - Math.abs(i - 2) * 0.12, ext = (k) => e[k] * 0.36 * rs;
        const o = part(ring, boneMat, at.clone().add(new THREE.Vector3(0, ax === 'y' ? 0 : -e.y * 0.12, ax === 'y' ? e.z * 0.08 : 0)), new THREE.Vector3(ext('x'), ax === 'y' ? ext('z') : ext('y'), 1), q);
        out.push(o);
      }
      out.push(part(sphere, boneMat, a.clone(), new THREE.Vector3(e.x * 0.22, r * 0.12, r * 0.14)));
    } else if (/Leg/.test(n)) {                 // a long bone with knobs, and a paw
      const r = Math.min(e.x, e.z) * 0.09; along(lo, hi, r, out);
      const foot = lo.clone(); foot[ax] -= L * 0.06; out.push(part(sphere, boneMat, foot, new THREE.Vector3(r * 2.4, r * 1.3, r * 2.8)));
    } else if (/Tail/.test(n)) {                // vertebrae
      const r = Math.max(Math.min(e.x, e.y, e.z) * 0.18, 0.006); along(lo, hi, r * 0.45, out);
    } else if (/Ear/.test(n)) {
      out.push(part(cone, boneMat, c, new THREE.Vector3(e.x * 0.18, e.y * 0.55, e.z * 0.12)));
    } else return;
    // built in model (bind) space; this bone's inverse bind matrix takes it into the bone's own space
    const grp = new THREE.Group(); out.forEach((o) => grp.add(o));
    // (the skinned mesh draws a bind-space point at boneWorld x boneInverse, so the same matrix keeps them together)
    grp.matrixAutoUpdate = false; grp.matrix.copy(sk.skeleton.boneInverses[j]);
    bone.add(grp);
  });
}
// ---------------------------------------------------------------- the Eclipse can: skin, ghost, the soda inside
// The can from Off the Chain (Blender). In X-ray its body turns to a see-through cyan ghost and you see the soda
// inside: a liquid column with bubbles rising through it (the bubbles speed up when you tap the can).
function buildCan(gltf) {
  model = gltf.scene;
  // (not the Silhouette card, nor the fizz cloud Off the Chain sprays out of the opening)
  model.traverse((o) => { if (o.name === 'Silhouette' || /Fizz/.test(o.name)) o.visible = false; if (o.isMesh) o.frustumCulled = false; });
  mixer = new THREE.AnimationMixer(model);
  clips = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
  const body = model.getObjectByName('EclipseCan') || model;
  model.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(body, true), size = bb.getSize(new THREE.Vector3()), mid = bb.getCenter(new THREE.Vector3());
  const s = (H * 0.6) / size.y;
  model.scale.setScalar(s); model.position.set(-mid.x * s, -mid.y * s, -mid.z * s);
  bob = new THREE.Group(); bob.add(model); inside.add(bob);
  const ghostMat = new THREE.MeshBasicMaterial({ color: COL.x, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, clippingPlanes: [rayPlane] });
  const ghosts = [];
  model.traverse((o) => {
    if (!o.isMesh || !o.visible || o.name === 'Silhouette' || /Fizz/.test(o.name)) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    ms.forEach((m) => { m.clippingPlanes = [skinPlane]; skinMats.push(m); });
    o.renderOrder = 6;
    if (!/Outline/.test(ms[0].name)) ghosts.push(o);
  });
  for (const o of ghosts) { const g = new THREE.Mesh(o.geometry, ghostMat); g.renderOrder = 8; g.frustumCulled = false; o.add(g); }
  // the soda: a column inside the body, in can units (so it turns and floats with the can)
  const r = Math.min(size.x, size.z) * 0.42 * s, h = size.y * 0.72 * s, soda = new THREE.Group();
  const liq = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 28), new THREE.MeshBasicMaterial({ color: 0x2aa8c4, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false, clippingPlanes: [rayPlane] }));
  liq.renderOrder = 7; soda.add(liq);
  const top = new THREE.Mesh(new THREE.CircleGeometry(r, 28), new THREE.MeshBasicMaterial({ color: COL.bone, toneMapped: false, clippingPlanes: [rayPlane] }));
  top.rotation.x = -Math.PI / 2; top.position.y = h / 2; top.renderOrder = 9; soda.add(top);
  const bm = new THREE.MeshBasicMaterial({ color: COL.bone, toneMapped: false, clippingPlanes: [rayPlane] }), sph = new THREE.SphereGeometry(1, 10, 8);
  const bubbles = [];
  for (let i = 0; i < 26; i++) { const m = new THREE.Mesh(sph, bm); m.renderOrder = 9; m.userData = { a: Math.random() * 6.28, d: Math.sqrt(Math.random()) * r * 0.8, y: Math.random(), v: 0.18 + Math.random() * 0.25, s: r * (0.05 + Math.random() * 0.07) }; soda.add(m); bubbles.push(m); }
  soda.position.y = -size.y * s * 0.06; bob.add(soda);
  rayMats.push(ghostMat, liq.material, top.material, bm);
  bob.userData = { bubbles, h, boost: 0 };
  if (clips.Idle) play('Idle');
}
function fizzBurst() { if (bob.userData.bubbles) bob.userData.boost = 1.6; }
function tickBubbles(dt) {
  const u = bob.userData; if (!u.bubbles) return;
  u.boost = Math.max(0, u.boost - dt * 0.8);
  for (const b of u.bubbles) {
    const d = b.userData; d.y += dt * d.v * (1 + u.boost * 3); if (d.y > 1) { d.y -= 1; d.a = Math.random() * 6.28; }
    b.position.set(Math.cos(d.a + d.y * 2) * d.d, (d.y - 0.5) * u.h, Math.sin(d.a + d.y * 2) * d.d); b.scale.setScalar(d.s * (0.7 + d.y * 0.6));
  }
}
function play(name, { loop = true, fade = 0.3, onDone, speed = 1 } = {}) {
  const clip = clips[name]; if (!clip || !mixer) return;
  const next = mixer.clipAction(clip);
  next.reset(); next.timeScale = speed; next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
  next.clampWhenFinished = !loop; next.enabled = true; next.setEffectiveWeight(1);
  if (current && current !== next && fade > 0) next.crossFadeFrom(current, fade, false); else if (current && current !== next) current.stop();
  next.play(); current = next;
  if (onDone) { const h = (e) => { if (e.action === next) { mixer.removeEventListener('finished', h); onDone(); } }; mixer.addEventListener('finished', h); }
}

// ---------------------------------------------------------------- the view: scan sweep, full X-ray, skin only
const scan = { y: 1, t: 0, dir: -1, pause: 0, lastBeep: 0, ping: 0 };
function setView(v, say = true) {
  view = v; store.set('view', v);
  document.querySelectorAll('#views button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === v)));
  if (say) { sound.click(); buzz(8); }
  if (v === 'scan') { scan.y = 0.5; scan.dir = -1; scan.pause = 0; }
}
// the scan line's height in the box, -0.5 (bottom) .. 0.5 (top); above it: X-ray, below it: skin
function tickScan(dt) {
  let y;
  if (view === 'xray') y = -10; else if (view === 'skin') y = 10;
  else {
    if (scan.pause > 0) scan.pause -= dt;
    else {
      scan.y += scan.dir * dt / 2.6;           // top to bottom in 2.6 s, then back up
      if (scan.y < -0.56) { scan.y = -0.56; scan.dir = 1; scan.pause = 0.9; }
      if (scan.y > 0.56) { scan.y = 0.56; scan.dir = -1; scan.pause = 0.9; }
      if (Math.abs(scan.y) < 0.5 && clock.t - scan.lastBeep > 0.33) { scan.lastBeep = clock.t; if (A.visible && open.k > 0.9) sound.beep(); }
    }
    y = scan.y;
  }
  scanBar.visible = view === 'scan' && open.k > 0.6 && Math.abs(y) < 0.56;
  scanBar.position.y = clamp(y, -0.5, 0.5) * H;
  // the clipping planes live in world space: move them with the box
  const local = new THREE.Plane(new THREE.Vector3(0, -1, 0), y * H);
  skinPlane.copy(local).applyMatrix4(F.matrixWorld);
  rayPlane.copy(local).negate().applyMatrix4(F.matrixWorld);
}

// ---------------------------------------------------------------- tracking
const TS = {};
function initTargets(targets) { for (const t of targets) TS[t.name] = { name: t.name, pr: t.properties, tracked: false, at: 0, gap: 40, p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1 }; }
function onTarget(d) {
  const t = TS[d.name]; if (!t) return;
  const upp = d.scale * (d.scaledHeight || 1) / t.pr.height;          // world units per target pixel
  t.q.set(d.rotation.x, d.rotation.y, d.rotation.z, d.rotation.w);
  t.p.set(d.position.x, d.position.y, d.position.z);
  t.s = t.pr.height * upp / H;                                         // world units per metre of the print
  const now = performance.now();
  if (!t.tracked) { diag.found++; tDiag(t.name).found++; } else t.gap += (clamp(now - t.at, 8, 400) - t.gap) * 0.2;
  t.tracked = true; t.at = now;
}
function onLost(d) { const t = TS[d.name]; if (t && t.tracked) { t.tracked = false; diag.lost++; tDiag(d.name).lost++; } }

// the side in view: whichever is tracked; with both, keep the current one (the box is the same either way;
// only the cut-out window is mirrored)
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
  if (push != null && push > 14) shakeBox(push);
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
  pose.state = st; pose.valid = st !== 'none'; A.visible = pose.valid;
  const flip = (n && FLIP[n]) || 1; if (F.scale.x !== flip) F.scale.x = flip;
  if (n && PIECE_OF[n] !== cp) { usePiece(PIECE_OF[n]); if (!fresh) sound.open(); }   // the other charm: its own box opens
  if (n && win.userData.side !== n + BOX.shape) {   // this side's picture on the tiles; the cut-out moved onto it
    win.userData.side = n + BOX.shape;
    lid.material.uniforms.uMap.value = cp.lidTex[n];
    const xf = (BOX.shape === 'cat' && cp.outlineData.sides && cp.outlineData.sides[n]) || { x: 0, y: 0, rz: 0, s: 1 };
    win.position.set(xf.x, xf.y, 0); win.rotation.z = xf.rz; win.scale.setScalar(xf.s);
  }
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

// ---------------------------------------------------------------- what happens
let mode = 'find', everFound = false;
function setMode(m) { mode = m; $('hud').dataset.mode = m; }
function arrived(now) {
  const away = now - (pose.goneAt || 0);
  if (!everFound || away > REOPEN_AFTER_MS) { open.k = 0; open.target = 1; sound.open(); buzz([10, 40, 18]); if (!everFound) postEvent('found', {}); }
  everFound = true; setMode('seen'); hint('');
  diag.firstFoundS = diag.firstFoundS || +((now - camStartAt) / 1000).toFixed(1);
}
let lostFor = 0;
function hint(text) { if ($('hint').textContent !== text) $('hint').textContent = text || ''; }

// Bobo reacts to a tap; a sideways drag turns him (and he turns back)
const life = { yaw: 0, yawV: 0, drag: false, busy: false, t: 0 };
function poke() {
  if (!A.visible || open.k < 0.9 || life.busy) return;
  buzz(12);
  if (cp.k === 'can') { sound.fizz(); life.yawV += 260; fizzBurst(); }   // the can: a spin and a fizz
  else {
    life.busy = true; sound.mew();
    const pick = Math.random() < 0.5 ? 'PawRaise' : 'TailWag';
    play(pick, { loop: false, fade: 0.2, onDone: () => { life.busy = false; play('Sit', { fade: 0.35 }); } });
  }
  if (view === 'scan') { scan.y = 0.56; scan.dir = -1; scan.pause = 0; }   // a fresh sweep over him
}
const gest = { id: null, x: 0, lx: 0, t: 0, moved: 0 };
canvas_on('pointerdown', (e) => { gest.id = e.pointerId; gest.x = gest.lx = e.clientX; gest.t = performance.now(); gest.moved = 0; life.drag = true; });
canvas_on('pointermove', (e) => {
  if (e.pointerId !== gest.id) return;
  const dx = e.clientX - gest.lx; gest.lx = e.clientX; gest.moved += Math.abs(dx);
  life.yawV = dx / innerWidth * Math.PI * 2.4 / Math.max(1 / 60, 0.016); life.yaw += dx / innerWidth * Math.PI * 2.4;
});
canvas_on('pointerup', (e) => { if (e.pointerId !== gest.id) return; gest.id = null; life.drag = false; if (gest.moved < 12 && performance.now() - gest.t < 400) throwBall(e.clientX, e.clientY); });
canvas_on('pointercancel', () => { gest.id = null; life.drag = false; });
function canvas_on(ev, fn) { $('cam').addEventListener(ev, fn); }

const clock = { t: 0 };
function tick(dt) {
  clock.t += dt;
  const now = performance.now();
  updatePose(now);
  if (!pose.valid) {
    lostFor += dt;
    if (mode !== 'find' && lostFor > 0.6) setMode('find');
    if (mode === 'find') hint(everFound ? 'Find Bobo or the can again' : 'Point at Bobo or the can on your keychain');
    sound.humTo(0);
  } else { lostFor = 0; if (mode === 'find') setMode('seen'); }

  // the box opening: the print breaks up into digital tiles, the walls grow, then Bobo arrives
  if (open.k < open.target) open.k = Math.min(open.target, open.k + dt / (REDUCED ? 0.6 : OPEN_S));
  const k = open.k, ek = easeInOut(clamp(k / 0.7, 0, 1));
  open.depth += (open.dWant * ek - open.depth) * (k < 1 ? 1 : clamp(dt * 6, 0, 1));   // depth changes glide
  const D = Math.max(open.depth, 0.0005);
  box.scale.z = D;
  lid.material.uniforms.uP.value = k * 1.26;   // the print breaks up, from the middle out
  lid.visible = k < 1;
  const kb = easeOut(clamp((k - 0.5) / 0.5, 0, 1));
  inside.visible = k > 0.5;
  // Bobo floats in the middle of the box, rising from the back wall as it opens
  life.t += dt;
  if (!life.drag) { life.yawV *= Math.pow(0.04, dt); life.yaw += life.yawV * dt * 0.02; life.yaw *= Math.pow(0.35, dt); }
  bob.position.set(0, Math.sin(life.t * 1.4) * H * 0.025, -Math.min(D * lerp(0.92, 0.5, kb), D * 0.92 - H * 0.2, H * 0.6));   // the middle, but never so deep he hides behind the rim
  tickSwipe(dt); bob.position.add(swipe.lunge);
  const sway = Math.sin(life.t * 0.45) * 0.28 * (1 - swipe.face);
  bob.rotation.set(Math.sin(life.t * 0.7) * 0.05, life.yaw + sway + swipe.yaw * swipe.face, Math.sin(life.t * 0.9) * 0.03);
  bob.scale.setScalar(lerp(0.55, 1, kb) * Math.min(1, D / (H * 0.62)) || 0.001);   // a shallow box: a smaller Bobo, so he never pokes out
  mixer.update(dt); tickBubbles(dt); tickBalls(dt);
  tickSpecks(dt);
  F.updateMatrixWorld(true);
  tickScan(dt);
  sound.humTo(pose.valid && k > 0.8 && view !== 'skin' ? 1 : 0);
  recTick();
  diag.fpsN++;
}


// ---------------------------------------------------------------- balls: throw them in, bat them out
// A tiny sphere solver, in the box's own frame (metres of the print, y up, the box from z = 0 back to z = -D).
// The open-source 8th Wall engine has no physics, and a dozen balls in a box with one moving paw don't need a
// physics engine (Rapier's WASM would add a 2 MB download for what is ~150 lines here). Gravity is the print's
// "down" (-y): right for a charm held up or a tee on a standing person.
// - Tap the screen: a ball is thrown from the phone to where you tapped, in an arc. It drops into the box through
//   the window, or bounces off the print around it (a rim shot).
// - Swipe (Bobo) / Fizz (the can): Bobo turns to the nearest ball, lunges and swipes; a ball in reach is batted
//   out through the window into the room. The can blasts a fizz geyser that throws every ball up and out.
// - Shake the phone: the balls rattle around.
// Each ball knocked out scores; several from one swipe is a combo. The best score is kept on the phone.
const BALL_COLS = [0xf6c344, 0x4fd6e8, 0xe85bd8, 0xffffff, 0x3f9be6];
const OPEN_S = 3.6;   // the digital break-up and the box opening, in seconds (Dapo: at least 3 s)
const MAX_BALLS = 10, E_WALL = 0.62, E_LIP = 0.3, E_BOBO = 0.75;
const balls = [], ballGroup = new THREE.Group(); F.add(ballGroup);
let ballGeo = null, ballN = 0;
const game = { score: 0, best: +store.get('best', 0) || 0, combo: 0, comboT: 0, thrown: 0, swiped: 0 };
const G = () => H * 7;                         // toy gravity: a ball drops the box's height in about half a second
const R = () => H * 0.055;
function insideWindow(x, y) {                   // through the window? (the cut-out: point in the die-cut polygon)
  if (BOX.shape !== 'cat') return Math.abs(x) < W / 2 - R() * 0.6 && Math.abs(y) < H / 2 - R() * 0.6;
  const pts = windowPoints('cat'), w = win, c = Math.cos(-w.rotation.z), sn = Math.sin(-w.rotation.z);
  const lx = ((x - w.position.x) * c - (y - w.position.y) * sn) / w.scale.x, ly = ((x - w.position.x) * sn + (y - w.position.y) * c) / w.scale.x;
  let inn = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a.y > ly) !== (b.y > ly) && lx < (b.x - a.x) * (ly - a.y) / (b.y - a.y) + a.x) inn = !inn; }
  return inn;
}
function addBall(p, v) {
  if (!ballGeo) ballGeo = new THREE.SphereGeometry(1, 20, 14);
  if (balls.length >= MAX_BALLS) removeBall(balls[0]);
  const m = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ color: BALL_COLS[ballN++ % BALL_COLS.length], roughness: 0.35, metalness: 0, transparent: true }));
  m.scale.setScalar(R()); m.renderOrder = 6; m.frustumCulled = false; ballGroup.add(m);
  const b = { m, p: p.clone(), v: v.clone(), inside: p.z < 0, age: 0, outAt: 0, swatted: 0 };
  balls.push(b); return b;
}
function removeBall(b) { const i = balls.indexOf(b); if (i >= 0) balls.splice(i, 1); ballGroup.remove(b.m); b.m.material.dispose(); }
function clearBalls() { while (balls.length) removeBall(balls[0]); }
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _nd = new THREE.Vector2(), _ray = new THREE.Raycaster();
function throwBall(x, y) {
  if (!A.visible || open.k < 0.9) return;
  const r = canvas.getBoundingClientRect(); _nd.set((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  _ray.setFromCamera(_nd, camera); F.updateMatrixWorld(true);
  _o.copy(_ray.ray.origin); F.worldToLocal(_o);
  _d.copy(_ray.ray.origin).add(_ray.ray.direction); F.worldToLocal(_d); _d.sub(_o).normalize();
  if (_d.z > -0.05) return;                     // pointing away from the print
  const D = open.depth, t = (-D * 0.45 - _o.z) / _d.z, aim = _o.clone().addScaledVector(_d, t);   // where the tap points, mid-box
  const p0 = _o.clone().addScaledVector(_d, t * 0.45), T = 0.5;
  const v = aim.clone().sub(p0).divideScalar(T); v.y += 0.5 * G() * T;   // an arc that lands on the aim point
  addBall(p0, v); sound.throwIt(); buzz(6); game.thrown++;
  if (game.thrown === 1) setTimeout(() => hint(cp.k === 'can' ? 'Hit Fizz to blast it out!' : 'Hit Swipe and Bobo bats it out!'), 700);
}
function shakeBox(m) {
  if (!A.visible || performance.now() - (shakeBox.at || 0) < 300) return; shakeBox.at = performance.now();
  for (const b of balls) if (b.inside) b.v.add(new THREE.Vector3((Math.random() - 0.5) * H * 3, H * (1.5 + Math.random() * 2), (Math.random() - 0.3) * H * 2));
}
// Bobo's swipe: face the nearest ball, lunge at it, bat it out
const swipe = { t: -1, yaw: 0, face: 0, lunge: new THREE.Vector3(), aim: new THREE.Vector3(), hit: 0 };
function doSwipe() {
  if (!A.visible || open.k < 0.9 || swipe.t >= 0) return;
  buzz(10);
  if (cp.k === 'can') { fizzBlast(); return; }
  const c = bob.position, near = balls.filter((b) => b.inside).sort((a, b) => a.p.distanceToSquared(c) - b.p.distanceToSquared(c))[0];
  swipe.aim.copy(near ? near.p : c.clone().add(new THREE.Vector3(0, 0, H * 0.3)));
  swipe.yaw = clamp(Math.atan2(swipe.aim.x - c.x, Math.max(swipe.aim.z - c.z, H * 0.05)), -1.3, 1.3);
  swipe.t = 0; swipe.hit = 0; life.busy = true; game.swiped++; if (game.swiped === 1) hint('');
  play('PawRaise', { loop: false, fade: 0.1, speed: 1.8, onDone: () => { life.busy = false; play('Sit', { fade: 0.3 }); } });
}
function tickSwipe(dt) {
  if (swipe.t < 0) { swipe.face = Math.max(0, swipe.face - dt * 2.5); swipe.lunge.multiplyScalar(Math.pow(0.02, dt)); return; }
  swipe.t += dt; swipe.face = Math.min(1, swipe.face + dt * 8);
  const k = swipe.t / 0.6, reach = Math.sin(Math.min(k, 1) * Math.PI);   // out and back in 0.6 s
  const to = swipe.aim.clone().sub(bob.position); to.y *= 0.5; const len = Math.min(to.length(), H * 0.22);
  swipe.lunge.copy(to.setLength(len || 0.0001)).multiplyScalar(reach);
  if (k > 0.2 && k < 0.75) {                    // the paw is out: anything in reach gets batted
    const c = bob.position.clone().add(swipe.lunge), rr = H * 0.4 * bob.scale.x;   // round the paw, generous so a swipe feels fair
    for (const b of balls) {
      if (!b.inside || b.swatted > 0 || b.p.distanceTo(c) > rr + R()) continue;
      const dir = b.p.clone().sub(c).normalize();
      b.v.set(dir.x * H * 2 + (Math.random() - 0.5) * H, H * (2.2 + Math.random()), H * (3.6 + Math.random() * 0.8));
      b.swatted = 1.2; swipe.hit++;
      sound.swat(); buzz([14, 30, 14]);
    }
  }
  if (k >= 1) { if (!swipe.hit) sound.whiff(); swipe.t = -1; }
}
function fizzBlast() {
  sound.fizz(); fizzBurst(); life.yawV += 120; swipe.t = -1;
  let n = 0;
  for (const b of balls) if (b.inside) { b.v.set((Math.random() - 0.5) * H * 2, H * (3 + Math.random() * 1.2), H * (3 + Math.random())); b.swatted = 1.2; n++; }
  if (!n) hint('Tap to throw a ball in first');
}
function scored(b) {
  const now = clock.t;
  game.combo = now - game.comboT < 1.2 ? game.combo + 1 : 1; game.comboT = now;
  game.score++; if (game.score > game.best) { game.best = game.score; store.set('best', game.best); }
  sound.score(game.combo); updateScore();
  popWord(game.combo > 1 ? `x${game.combo} COMBO!` : 'OUT!', b);
  if ([5, 10, 25, 50].includes(game.score)) setTimeout(() => popWord(`${game.score} BOUNCED OUT!`, null), 500);
  postEvent('custom', { action: 'xray-ball-out', score: game.score });
}
function updateScore() {
  const el = $('score'); el.hidden = false;
  $('score-n').textContent = String(game.score); $('score-b').textContent = game.best > game.score ? `Best ${game.best}` : 'Best!';
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}
function popWord(text, b) {
  const el = document.createElement('div'); el.className = 'pop-word'; el.textContent = text;
  let x = innerWidth / 2, y = innerHeight * 0.3;
  if (b) { const w = b.m.getWorldPosition(new THREE.Vector3()).project(camera); x = clamp((w.x + 1) / 2 * innerWidth, 70, innerWidth - 70); y = clamp((1 - w.y) / 2 * innerHeight, 90, innerHeight - 220); }
  y -= document.querySelectorAll('#hud .pop-word').length * 30;   // several at once stack instead of overlapping
  el.style.left = x + 'px'; el.style.top = y + 'px'; $('hud').appendChild(el); setTimeout(() => el.remove(), 1000);
}
function tickBalls(dt) {
  if (!balls.length) return;
  const D = Math.max(open.depth, 0.001), r = R(), g = G(), hw = W / 2 - r, hh = H / 2 - r;
  const bc = bob.position.clone().add(new THREE.Vector3(0, H * 0.02, 0)), br = H * 0.21 * bob.scale.x;
  const n = 3, h = dt / n;
  for (let s = 0; s < n; s++) {
    for (const b of balls) {
      const pz = b.p.z; b.v.y -= g * h; b.p.addScaledVector(b.v, h);
      if (b.inside) {
        if (b.p.x < -hw) { b.p.x = -hw; if (b.v.x < 0) { sound.bounce(-b.v.x / H / 3); b.v.x *= -E_WALL; } }
        if (b.p.x > hw) { b.p.x = hw; if (b.v.x > 0) { sound.bounce(b.v.x / H / 3); b.v.x *= -E_WALL; } }
        if (b.p.y > hh) { b.p.y = hh; if (b.v.y > 0) b.v.y *= -E_WALL; }
        if (b.p.y < -hh) { b.p.y = -hh; if (b.v.y < 0) { sound.bounce(-b.v.y / H / 3); b.v.y *= -E_WALL; b.v.x *= 0.96; b.v.z *= 0.96; } }
        if (b.p.z < -D + r) { b.p.z = -D + r; if (b.v.z < 0) { sound.bounce(-b.v.z / H / 3); b.v.z *= -E_WALL; } }
        const dc = b.p.clone().sub(bc), dl = dc.length();   // Bobo (or the can) is a round bumper
        if (dl < br + r && dl > 1e-6) { dc.divideScalar(dl); b.p.copy(bc).addScaledVector(dc, br + r); const vn = b.v.dot(dc); if (vn < 0) { b.v.addScaledVector(dc, -(1 + E_BOBO) * vn); sound.bounce(-vn / H / 3); } }
        if (!b.swatted && b.p.z > -r) {             // the box keeps a loose ball: it rolls back off the lip of the window
          b.p.z = -r; if (b.v.z > 0) b.v.z *= -E_LIP;
        } else if (b.p.z > 0) {                     // a batted ball flies out through the window
          if (insideWindow(b.p.x, b.p.y)) { b.inside = false; b.outAt = clock.t; scored(b); }
          else { b.p.z = 0; if (b.v.z > 0) b.v.z *= -E_WALL; }   // it hit the inside of the rim
        }
      } else if (pz >= 0 && b.p.z < 0) {            // outside, crossing the print plane on the way in
        if (insideWindow(b.p.x, b.p.y)) { b.inside = true; b.outAt = 0; b.age = 0; }
        else { b.p.z = 0.0001; b.v.z *= -E_WALL; sound.bounce(-b.v.z / H / 3); }   // a rim shot off the print
      }
    }
    for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {   // ball against ball
      const a = balls[i], c = balls[j]; if (a.inside !== c.inside) continue;
      const d = c.p.clone().sub(a.p), l = d.length(); if (l >= 2 * r || l < 1e-6) continue;
      d.divideScalar(l); const push = (2 * r - l) / 2; a.p.addScaledVector(d, -push); c.p.addScaledVector(d, push);
      const rel = c.v.clone().sub(a.v).dot(d); if (rel < 0) { a.v.addScaledVector(d, rel * 0.9); c.v.addScaledVector(d, -rel * 0.9); }
    }
  }
  for (const b of [...balls]) {
    b.age += dt; b.swatted = Math.max(0, b.swatted - dt);
    b.m.position.copy(b.p);
    const gone = !b.inside && (b.outAt ? clock.t - b.outAt : b.age) > 2.2;
    b.m.material.opacity = b.inside ? 1 : clamp(1 - ((b.outAt ? clock.t - b.outAt : b.age) - 1.6) / 0.6, 0, 1);
    if (gone || b.p.length() > H * 12) removeBall(b);
  }
}

// ---------------------------------------------------------------- UI
document.querySelectorAll('#views button').forEach((b) => { b.onclick = () => setView(b.dataset.v); });
function segInit(id, cur, fn) {
  const btns = [...document.querySelectorAll(`#${id} button`)];
  const sync = (v) => btns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === String(v))));
  sync(cur); btns.forEach((b) => { b.onclick = () => { sync(b.dataset.v); fn(b.dataset.v); sound.click(); }; });
}
segInit('seg-win', BOX.shape, (v) => { store.set('win', v); BOX.shape = v; if (cp) eachPiece(() => buildWindow(v)); });
segInit('seg-depth', String(BOX.depthK), (v) => { BOX.depthK = +v; store.set('depth', v); if (cp) { eachPiece(() => { open.dWant = H * BOX.depthK; repeatWalls(); }); open.dWant = H * BOX.depthK; } });
function eachPiece(fn) { const keep = cp; save(cp); for (const P of Object.values(PIECES)) { load(P); fn(P); save(P); } load(keep); }
const optsEl = $('opts');
function openOpts() { optsEl.hidden = false; $('b-opts').setAttribute('aria-expanded', 'true'); optsEl.querySelector('.x').focus(); }
function closeOpts() { optsEl.hidden = true; $('b-opts').setAttribute('aria-expanded', 'false'); $('b-opts').focus(); }
$('b-opts').onclick = openOpts;
optsEl.querySelectorAll('[data-close]').forEach((el) => { el.onclick = closeOpts; });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !optsEl.hidden) closeOpts(); });
const soundBtn = $('o-sound'); soundBtn.setAttribute('aria-checked', String(sound.on));
soundBtn.onclick = () => { sound.on = !sound.on; store.set('sound', sound.on ? '1' : '0'); soundBtn.setAttribute('aria-checked', String(sound.on)); if (!sound.on) sound.humTo(0); };
$('o-how').onclick = () => { closeOpts(); $('how').hidden = false; $('b-go').focus(); };
$('b-go').onclick = () => { $('how').hidden = true; store.set('how', '1'); };
$('err-retry').onclick = () => location.reload();
function showError(title, body) { $('err-title').textContent = title; $('err-body').textContent = body; $('error').hidden = false; }

// the splash preview box tilts with the pointer (or slowly by itself)
(() => {
  const box = document.querySelector('#stage .box'); if (!box) return;
  let t = 0, raf = 0, user = 0;
  const set = (rx, ry) => { box.style.setProperty('--rx', rx.toFixed(1) + 'deg'); box.style.setProperty('--ry', ry.toFixed(1) + 'deg'); };
  addEventListener('pointermove', (e) => { if ($('splash').hidden) return; user = performance.now(); set(-(e.clientY / innerHeight - 0.5) * 18, (e.clientX / innerWidth - 0.5) * 28); });
  if (REDUCED) return;
  const loop = () => { if ($('splash').hidden) return; t += 0.012; if (performance.now() - user > 2500) set(6 + Math.sin(t * 0.8) * 4, Math.sin(t) * 14); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
})();

// ---------------------------------------------------------------- 8th Wall pipeline
const canvas = $('cam');
const DPR = clamp(+params.get('dpr') || 1, 1, 3);   // 1x by default like Off the Chain (fastest pickup); ?dpr=2 sharper
function sizeCanvas() {
  const dpr = Math.min(devicePixelRatio || 1, DPR), w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}
let last = 0, camStartAt = 0, built = false;
const appModule = (data) => ({
  name: 'xray-bobo',
  onStart: () => { buildScene(XR8.Threejs.xrScene(), data); built = true; $('hud').hidden = false; setMode('find'); },
  onUpdate: () => { const now = performance.now(); const dt = Math.min((now - (last || now)) / 1000, 0.05); last = now; if (built) tick(dt); flushDiag(false); },
  onCameraStatusChange: ({ status, video, stream }) => {
    camLog(status);
    if (status === 'hasStream') { kickVideo(); noteStream(stream); }
    if (status === 'hasVideo') {
      hideTapCam(); camStartAt = performance.now(); tuneCamera(video);
      $('splash').classList.add('gone'); setTimeout(() => { $('splash').hidden = true; }, 600);
      if (store.get('how', '0') !== '1') { $('how').hidden = false; $('b-go').focus(); }
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
  initTargets(data.tdata);
  XR8.XrController.configure({ disableWorldTracking: true, imageTargetData: data.tdata });
  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(), XR8.Threejs.pipelineModule(), XR8.XrController.pipelineModule(), XR8.CanvasScreenshot.pipelineModule(),
    appModule(data),
    { name: 'xr-capture', onRender: () => { if (capture) capture.frame(); } },
  ]);
  camLog('run'); postEvent('scan', {});
  setTimeout(() => { if (!camStartAt && !tapCamShown) camFailed('no video after 12 s'); }, 12000);
  XR8.run({ canvas, allowedDevices: XR8.XrConfig.device().ANY, cameraConfig: { direction: XR8.XrConfig.camera().BACK } });
}
$('b-start').onclick = start;

// ---------------------------------------------------------------- camera (the same handling as Off the Chain / Spray Bobo)
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
    canvas, host: document.body, endpoint: location.origin, globeUrl: '/evade/where-is-bobo/', source: 'xray-bobo', audioContext: null,
    connectAudio: (dest) => { const m = sound.master; if (!m) return () => {}; m.connect(dest); return () => { try { m.disconnect(dest); } catch (e) { /* gone */ } }; },
    overlay: (c, Wd, Hd) => drawWatermark(c, Wd, Hd),
    on: (name) => { if (name === 'recordStart') { buzz(25); recUi(true); } if (name === 'recordStop' || name === 'error') recUi(false); },
  });
  Object.assign(capture.settings, {
    corner: 'topRight', offsetX: -5, offsetY: -6, accent: '#4fd6e8', maxSeconds: 30,
    hintText: 'Film Bobo inside the box and send him to the globe', sendLabel: 'Send to Where is Bobo?',
    sheetTitle: 'Send your clip to the Bobo globe?', keepTitle: 'Keep your clip?', clipTitle: 'Bobo X-Ray clip', filePrefix: 'bobo-xray', backLabel: 'Back to the camera',
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
    const file = new File([blob], `bobo-xray-${++shots}.jpg`, { type: 'image/jpeg' }), url = URL.createObjectURL(blob);
    $('shot-img').src = url; $('shot-save').href = url; $('shot-save').download = file.name; $('shot-save').hidden = false;
    const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
    $('shot-share').hidden = !canShare; $('shot-share').onclick = () => navigator.share({ files: [file], title: 'Bobo X-Ray' }).catch(() => {});
    $('shot').hidden = false; postEvent('share', { what: 'xray-photo', view });
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
$('b-swipe').onclick = () => doSwipe();
$('b-ball').onclick = () => { const r = canvas.getBoundingClientRect(); throwBall(r.left + r.width / 2 + (Math.random() - 0.5) * 40, r.top + r.height * 0.44); };

// ---------------------------------------------------------------- Where is Bobo? events (city level, anonymous)
const SID = 'xr-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
function postEvent(type, props) {
  if (params.has('nolog')) return;
  try { fetch('/api/bobo/events', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, source: 'xray-bobo', sessionId: SID, props }) }).catch(() => {}); } catch (e) { /* offline */ }
}

// ---------------------------------------------------------------- test log (previews and local dev only, or ?diag)
// Read back with GET /api/ar/kc-diag on a deploy preview (records carry page: 'xray-bobo').
const diag = { page: 'xray-bobo', sid: SID, found: 0, lost: 0, fpsN: 0, errors: [], steps: [], targets: {} };
function tDiag(n) { return diag.targets[n] || (diag.targets[n] = { found: 0, lost: 0 }); }
function camLog(s) { diag.steps.push([s, Math.round(performance.now())]); if (diag.steps.length > 40) diag.steps.shift(); }
let flushAt = 0;
function flushDiag(force, always = false) {
  const now = performance.now(); if (!force && now - flushAt < 10000) return; flushAt = now;
  if ((!camStartAt && !always) || params.has('nolog') || (LIVE_SITE && !params.has('diag'))) return;
  const body = JSON.stringify({ ...diag, secs: Math.round((now - (camStartAt || now)) / 1000), fps: camStartAt ? +(diag.fpsN / Math.max((now - camStartAt) / 1000, 1)).toFixed(1) : 0, view, shape: BOX.shape, depthK: BOX.depthK, screen: [innerWidth, innerHeight, devicePixelRatio] });
  try { if (!(navigator.sendBeacon && navigator.sendBeacon('/api/ar/kc-diag', new Blob([body], { type: 'application/json' })))) fetch('/api/ar/kc-diag', { method: 'POST', body, keepalive: true }); } catch (e) { /* offline */ }
}
addEventListener('pagehide', () => flushDiag(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) flushDiag(true); });
addEventListener('error', (e) => { diag.errors.push(String(e.message).slice(0, 200)); });

// automated tests (?test)
if (params.has('test')) window.__xr = {
  get pose() { return pose.state; }, get mode() { return mode; }, get open() { return open.k; }, get depth() { return open.depth; }, get side() { return side; },
  get view() { return view; }, setView, poke, diag,
  get game() { return { ...game, balls: balls.length, inside: balls.filter((b) => b.inside).length }; }, throwBall, doSwipe,
  replay: (k = 0, hold = false) => { open.k = k; if (!k) open.depth = 0; open.target = hold ? k : 1; },
  target: () => { const t = side && TS[side]; return t ? { name: side, tracked: t.tracked, p: t.p.toArray(), s: t.s } : null; },
  // the screen box of the window's corners and of Bobo (to check he stays inside the window)
  screen: () => {
    if (!A.visible) return null;
    const pr = (v) => { const p = v.clone().project(camera); return [(p.x + 1) / 2 * innerWidth, (1 - p.y) / 2 * innerHeight]; };
    const win = [[-W / 2, -H / 2], [W / 2, -H / 2], [W / 2, H / 2], [-W / 2, H / 2]].map(([x, y]) => pr(F.localToWorld(new THREE.Vector3(x, y, 0))));
    const bb = new THREE.Box3().setFromObject(model.getObjectByName('Bobo') || model, true), c = bb.getCenter(new THREE.Vector3());
    return { win, bobo: pr(c), boboBox: [pr(bb.min), pr(bb.max)] };
  },
  fake: (name, d) => onTarget({ name, position: d.position, rotation: d.rotation, scale: d.scale, scaledHeight: d.scaledHeight || 1 }),
};

// desktop: a QR to open it on the phone
if (!TOUCH) {
  $('desk').hidden = false;
  try { window.QRCode && QRCode.toString(location.href, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }, (err, svg) => { if (!err) $('qr').innerHTML = svg; }); } catch (e) { /* no QR */ }
}
