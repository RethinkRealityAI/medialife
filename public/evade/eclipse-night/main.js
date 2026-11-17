// Eclipse Night: hold up the EVADE Eclipse can charm, then point the phone at the sky. The REAL sky (and only the
// sky: buildings, trees and people stay) turns into EVADE's night, the giant Eclipse can slides over the moon, and
// Bobo's constellation appears. Hold the aiming ring over each star to join them; when the last one lights, Bobo
// made of starlight walks across your sky. Tap the sky for fizz fireworks. Photo and video like every EVADE page.
//
// Engine: the open-source 8th Wall engine (MIT), self-hosted with Off the Chain in /evade/keychain-ar/vendor/xr:
//  - image targets (kc-can, kc-can-back: the real can charm, both sides) for the "charge" step;
//  - 8th Wall's SKY SEGMENTATION MODEL (resources/semantics-model.tflite + semantics-worker.js, both in the same
//    MIT package), run by this page in its own worker. We do not use XR8.LayersController for it: in the simulator
//    its built-in compositor fed the model a rotated frame and drew blocks of sky in the wrong places. Here we
//    feed the model exactly what is on screen (upright, 144x256), get a 144x256 sky probability back, and composite
//    the night ourselves in a three.js shader, re-projected with the phone's orientation so the mask stays on the
//    real sky while the phone turns between model results (it runs ~4-10 times a second).
//  - The sky scene (stars, moon, can, constellation) has its own camera driven by the phone's orientation sensors
//    (no world tracking in the open engine: the sky only needs rotation).
// Flat colours only (Dapo's platform rule): every shape is one flat colour; the soft edge of the sky mask is the
// only blend, and it is the edge of the real sky, not a design gradient.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ColaCapture } from '/evade/cola-run-lab/assets/capture-core.js';

window.THREE = THREE;                         // XR8.Threejs.pipelineModule() looks for a global THREE
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const canvas = $('cam');
const KC = '/evade/keychain-ar/';             // Off the Chain: engine + image targets
const XR_BASE = new URL(KC + 'vendor/xr/', location.href).href;
const LIVE_SITE = /(^|\.)medialife\.ai$/i.test(location.hostname);
const TOUCH = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp, deg = THREE.MathUtils.degToRad;
const easeOut = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
const easeInOut = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const backOut = (x) => { x = clamp(x, 0, 1); const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* no haptics */ } };
const store = { get(k, d) { try { const v = localStorage.getItem('eclipse-night-' + k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('eclipse-night-' + k, String(v)); } catch (e) { /* none */ } } };

const SID = 'en-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
// test log record (sent to /api/ar/kc-diag on previews; see the end of the file)
const diag = { page: 'eclipse-night', sid: SID, fpsN: 0, errors: [], steps: [], targets: {} };

// ---------------------------------------------------------------- the look (flat colours)
const COL = {
  night: 0x0d0b2b, star: 0xffffff, gold: 0xf6c344, red: 0xff4d5e, blue: 0x3d6bff, moon: 0xf3ead0, dim: 0x9b97c9,
};
const TARGETS = ['kc-can', 'kc-can-back'];   // the real can charm, front (photo) and back (QR side)
const AIM_DEG = 3.4;                         // the ring is "on" a star inside this angle
const DWELL_S = 0.38;                        // hold this long to light it
const SKY_R = 80;                            // where the sky things sit (any distance: only rotation matters)

// Bobo's constellation: points picked on the outline of the real Bobo silhouette (silhouette-bobo.png, 809x923 px),
// in the order you join them: left ear, crown, right ear, right whisker, right hip, right foot, left foot, left hip,
// tail root, tail tip, left whisker, then back to the left ear. CHEST is where the eclipse sits inside him.
const BOBO_PX = [[300, 78], [462, 112], [612, 78], [772, 332], [708, 680], [640, 876], [330, 876], [222, 700], [262, 540], [40, 380], [132, 344]];
const BOBO_CHEST = [465, 560];
const CON_H = 36;                            // constellation height in sky units at SKY_R (~25 degrees of sky)

// ---------------------------------------------------------------- sound (made here, no files)
const sound = {
  ctx: null, on: store.get('sound', '1') === '1', master: null, hum: null,
  init() {
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)(); this.ctx.resume();
      if (!this.master) { this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination); }
      if (!this.hum) {   // the eclipse drone: a low fifth, opened while the night is up
        const g = this.ctx.createGain(); g.gain.value = 0; g.connect(this.master);
        for (const [f, v] of [[55, 1], [82.4, 0.5], [110, 0.25]]) { const o = this.ctx.createOscillator(); o.frequency.value = f; const og = this.ctx.createGain(); og.gain.value = v; o.connect(og).connect(g); o.start(); }
        this.hum = g;
      }
    } catch (e) { /* no audio */ }
  },
  humTo(v) { if (!this.hum) return; this.hum.gain.setTargetAtTime(this.on ? v * 0.06 : 0, this.ctx.currentTime, 0.4); },
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
  charge() { this.noise(1.2, 0.05, 2500, 11000); this.tone(220, 880, 1.4, 0.06, 'triangle'); this.tone(1320, 1320, 0.2, 0.04, 'sine', 1.4); },
  reveal() { this.tone(110, 55, 2.4, 0.12, 'sine'); this.noise(2.2, 0.03, 200, 1200); },
  total() { [262, 330, 392, 523].forEach((f, i) => this.tone(f, f, 2.6, 0.05, 'triangle', i * 0.05)); this.tone(2093, 2093, 0.5, 0.04, 'sine', 0.6); },
  ping(i) { const f = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760, 2093, 2349][i % 12]; this.tone(f, f, 0.5, 0.07, 'triangle'); this.tone(f * 2, f * 2, 0.25, 0.02, 'sine', 0.03); },
  done() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, f, 0.9, 0.06, 'triangle', i * 0.09)); },
  mew() { this.tone(620, 880, 0.14, 0.07, 'triangle'); this.tone(880, 560, 0.22, 0.07, 'triangle', 0.13); },
  pop() { this.noise(0.5, 0.1, 2500, 12000); this.tone(300, 1400, 0.12, 0.05, 'sine'); this.tone(1800, 900, 0.3, 0.03, 'triangle', 0.08); },
  shutter() { this.noise(0.05, 0.22, 2000, 9000); this.noise(0.07, 0.16, 1200, 6000, 0.08); },
};

// ---------------------------------------------------------------- loading
const getJson = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(r.status + ' ' + u); return r.json(); });
const gl = new GLTFLoader();
const assets = Promise.all([
  getJson(KC + 'image-targets/layout.json'),
  Promise.all(TARGETS.map((n) => getJson(KC + `image-targets/${n}.json`))),
  gl.loadAsync('/evade/keychain/ar/eclipse-can.glb'),
  gl.loadAsync('/evade/keychain/ar/bobo-keychain.glb'),
]).then(([layout, tdata, can, bobo]) => ({ layout, tdata, can, bobo }));
const xrReady = new Promise((res) => (window.XR8 ? res() : window.addEventListener('xrloaded', () => res(), { once: true })));
let loaded = false;
Promise.all([assets, xrReady]).then(() => {
  loaded = true; $('load').hidden = true; $('b-start').disabled = false; $('b-start').textContent = 'Start';
}).catch((e) => { console.error(e); showError('Could not load the experience', 'Check your connection and reload the page.'); });

// ---------------------------------------------------------------- phone orientation -> the sky camera
// The standard deviceorientation -> camera quaternion (as three.js's old DeviceOrientationControls): y is up,
// the camera looks down its -z. alpha is not true north on most phones; we only need it to be steady.
const devQ = new THREE.Quaternion(), skyQ = new THREE.Quaternion();
let haveOri = false, lastBeta = 90, oriN = 0;
const _e = new THREE.Euler(), _q0 = new THREE.Quaternion(), _q1 = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2), _z = new THREE.Vector3(0, 0, 1);
function onOri(ev) {
  if (ev.beta == null || ev.gamma == null) return;
  const orient = deg((screen.orientation && screen.orientation.angle) || window.orientation || 0);
  _e.set(deg(ev.beta), deg(ev.alpha || 0), -deg(ev.gamma), 'YXZ');
  devQ.setFromEuler(_e).multiply(_q1).multiply(_q0.setFromAxisAngle(_z, -orient));
  if (!haveOri) skyQ.copy(devQ);
  haveOri = true; lastBeta = ev.beta; oriN++;
}
// no sensors (laptop, or motion access refused): drag to look, starting a little above the horizon
const look = { yaw: 0, pitch: deg(28) };
function lookQ() { _e.set(look.pitch, look.yaw, 0, 'YXZ'); return _q0.setFromEuler(_e); }
const _fwd = new THREE.Vector3();
function forward(q = skyQ) { return _fwd.set(0, 0, -1).applyQuaternion(q); }

// ---------------------------------------------------------------- sky segmentation (8th Wall's model, our worker)
const SEG_W = 144, SEG_H = 256;
const seg = {
  worker: null, ready: false, busy: false, video: null, has: false, pct: 0, n: 0, ms: 0, sentAt: 0, err: null,
  cv: null, g: null, prob: new Float32Array(SEG_W * SEG_H), bytes: new Uint8Array(SEG_W * SEG_H), tex: null,
  qSent: new THREE.Quaternion(), qMask: new THREE.Quaternion(), pctAvg: 0, pctMax: 0,
};
seg.tex = new THREE.DataTexture(seg.bytes, SEG_W, SEG_H, THREE.RedFormat, THREE.UnsignedByteType);
seg.tex.minFilter = seg.tex.magFilter = THREE.LinearFilter; seg.tex.wrapS = seg.tex.wrapT = THREE.ClampToEdgeWrapping; seg.tex.needsUpdate = true;
function segInit() {
  if (seg.worker || !window.Worker) return;
  try {
    const src = `importScripts(${JSON.stringify(XR_BASE + 'resources/semantics-worker.js')})\nSEMANTICSMODULE().then(() => self.initWorker())`;
    seg.worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'application/javascript' })));
    seg.worker.onmessage = (e) => {
      const d = e.data || {};
      if (d.type === 'loaded') seg.worker.postMessage({ type: 'start', config: { baseUrl: XR_BASE } });
      else if (d.type === 'started') { seg.ready = true; diag.segReadyS = secs(); }
      else if (d.type === 'invoke' && d.output) segResult(d.output);
    };
    seg.worker.onerror = (e) => { seg.err = String(e.message || e); diag.errors.push('seg: ' + seg.err.slice(0, 160)); };
    seg.cv = document.createElement('canvas'); seg.cv.width = SEG_W; seg.cv.height = SEG_H;
    seg.g = seg.cv.getContext('2d', { willReadFrequently: true });
  } catch (e) { seg.err = String(e); diag.errors.push('seg init: ' + seg.err.slice(0, 160)); }
}
// what is on screen: the engine draws the camera "cover" cropped, centred. The model gets exactly that crop,
// stretched to 144x256 (a phone screen is a bit taller than 9:16; the model does not mind), so mask uv = screen uv.
function segPump() {
  const v = seg.video;
  if (!seg.ready || seg.busy || !v || v.readyState < 2 || !v.videoWidth) return;
  const cw = canvas.clientWidth || innerWidth, ch = canvas.clientHeight || innerHeight, vw = v.videoWidth, vh = v.videoHeight;
  const s = Math.max(cw / vw, ch / vh), sw = cw / s, sh = ch / s;
  try {
    seg.g.drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, SEG_W, SEG_H);
    const px = seg.g.getImageData(0, 0, SEG_W, SEG_H).data;
    const b = deg(lastBeta) / 2;
    seg.busy = true; seg.sentAt = performance.now(); seg.qSent.copy(skyQ);
    seg.worker.postMessage({ type: 'invoke', img: px.buffer, position: { x: 0, y: 0, z: 0 }, rotation: { x: Math.sin(b), y: 0, z: 0, w: Math.cos(b) } }, [px.buffer]);
  } catch (e) { seg.busy = false; diag.errors.push('seg pump: ' + String(e).slice(0, 120)); }
}
function segResult(out) {
  seg.busy = false;
  const f = new Float32Array(out.data), k = seg.has ? 0.6 : 1;   // a little smoothing between results
  for (let i = 0; i < f.length; i++) { const p = seg.prob[i] = seg.prob[i] + (f[i] - seg.prob[i]) * k; seg.bytes[i] = p <= 0 ? 0 : p >= 1 ? 255 : (p * 255) | 0; }
  seg.tex.needsUpdate = true; seg.qMask.copy(seg.qSent); seg.has = true;
  seg.pct = out.percentage || 0; seg.n++; seg.ms += (performance.now() - seg.sentAt - seg.ms) * (seg.n === 1 ? 1 : 0.1);
  seg.pctAvg += (seg.pct - seg.pctAvg) * 0.1; seg.pctMax = Math.max(seg.pctMax, seg.pct);
}

// ---------------------------------------------------------------- scenes
let scene, camera, renderer, skyRT, comp;
const skyScene = new THREE.Scene(), skyCam = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
const skyRoot = new THREE.Group(); skyScene.add(skyRoot);   // placed where you first look up
let stars, moon, canPivot, canModel, corona = [], rays, diamond, con, conStars = [], conLines = [], boboRoot, boboModel, boboMixer, boboClips = {}, trail, fw;
let anchor, charmFx;                          // the charm (main scene)
let skyMode = store.get('sky', 'real') === 'dome' ? 'dome' : 'real';

const compMat = new THREE.ShaderMaterial({
  uniforms: {
    tSky: { value: null }, tMask: { value: seg.tex }, uM: { value: new THREE.Matrix4() }, uW: { value: new THREE.Matrix4() },
    uMode: { value: 0 }, uReveal: { value: 0 }, uHas: { value: 0 },
  },
  vertexShader: 'varying vec2 vN; void main(){ vN = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    uniform sampler2D tSky; uniform sampler2D tMask; uniform mat4 uM; uniform mat4 uW;
    uniform float uMode; uniform float uReveal; uniform float uHas;
    varying vec2 vN;
    void main(){
      vec4 sky = texture2D(tSky, vN * 0.5 + 0.5);
      vec4 d = uW * vec4(vN, 1.0, 1.0); vec3 dir = normalize(d.xyz / d.w);   // this pixel's direction in the sky
      float m;
      if (uMode < 0.5) {
        // the sky probability where this direction was when the model last looked (phone turned since)
        vec4 p = uM * vec4(vN, 1.0, 1.0); vec2 uv = p.xy / p.w * 0.5 + 0.5;
        float k = texture2D(tMask, vec2(uv.x, 1.0 - uv.y)).r;
        m = smoothstep(0.38, 0.72, k) * smoothstep(-0.14, 0.04, dir.y) * uHas;   // never below the horizon (desks, floors)
      } else {
        m = smoothstep(0.10, 0.20, dir.y);   // everything well above you: the ceiling becomes the sky
      }
      float thr = 1.02 - uReveal * 1.4;      // the night pours down from overhead
      m *= smoothstep(thr, thr + 0.04, dir.y);
      gl_FragColor = vec4(sky.rgb, m);
      #include <colorspace_fragment>
    }`,
  transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
});

function flat(color, opts = {}) { return new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, depthWrite: false, ...opts }); }

function buildSky(data) {
  skyScene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(0.3, 0.4, 1); skyScene.add(key);   // front fill toward the can
  // stars: flat round dots on the upper sky, a few gold ones; they twinkle
  const N = 900, pos = new Float32Array(N * 3), size = new Float32Array(N), ph = new Float32Array(N), col = new Float32Array(N * 3);
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const y = -0.12 + Math.random() * 1.12, r = Math.sqrt(1 - y * y), a = Math.random() * Math.PI * 2;
    pos.set([Math.cos(a) * r * 120, y * 120, Math.sin(a) * r * 120], i * 3);
    size[i] = 1.2 + Math.pow(Math.random(), 3) * 3.2; ph[i] = Math.random() * 6.28;
    c.set(Math.random() < 0.12 ? COL.gold : COL.star); col.set([c.r, c.g, c.b], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('size', new THREE.BufferAttribute(size, 1));
  sg.setAttribute('ph', new THREE.BufferAttribute(ph, 1)); sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  stars = new THREE.Points(sg, new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uA: { value: 0 }, uPx: { value: 1 } },
    vertexShader: 'attribute float size; attribute float ph; attribute vec3 color; uniform float uT; uniform float uPx; varying float vA; varying vec3 vC; void main(){ vC = color; vA = 0.55 + 0.45 * sin(uT * 2.2 + ph * 3.0); gl_PointSize = size * uPx * (0.8 + 0.2 * vA); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uA; varying float vA; varying vec3 vC; void main(){ vec2 q = gl_PointCoord - 0.5; if (dot(q, q) > 0.25) discard; gl_FragColor = vec4(vC, vA * uA); }',
    transparent: true, depthWrite: false,
  }));
  stars.frustumCulled = false; skyScene.add(stars);

  // the eclipse, built in a plane facing you (local +z toward you, x right, y up), 1 unit ~ 0.7 degrees
  moon = new THREE.Mesh(new THREE.CircleGeometry(4.1, 64), flat(COL.moon)); moon.position.z = -2; skyRoot.add(moon);
  const ringDef = [[4.7, 5.4, COL.star], [6.0, 7.1, COL.gold], [7.8, 8.6, COL.red]];
  for (const [a, b, cc] of ringDef) { const m = new THREE.Mesh(new THREE.RingGeometry(a, b, 96), flat(cc, { opacity: 0 })); m.position.z = -3; m.scale.setScalar(0.6); skyRoot.add(m); corona.push(m); }
  // corona rays: thin flat triangles in gold, turning slowly
  const rg = new THREE.BufferGeometry(), rv = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2, w = 0.08, r0 = 5.2, r1 = i % 2 ? 12 : 16;
    rv.push(Math.cos(a - w) * r0, Math.sin(a - w) * r0, 0, Math.cos(a + w) * r0, Math.sin(a + w) * r0, 0, Math.cos(a) * r1, Math.sin(a) * r1, 0);
  }
  rg.setAttribute('position', new THREE.Float32BufferAttribute(rv, 3));
  rays = new THREE.Mesh(rg, flat(COL.gold, { opacity: 0 })); rays.position.z = -4; skyRoot.add(rays);
  // the "diamond ring": a four-point white star on the moon's rim at totality
  const sh = new THREE.Shape(); const pts = 8;
  for (let i = 0; i < pts; i++) { const a = (i / pts) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.5 : 3.2; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? sh.lineTo(x, y) : sh.moveTo(x, y); }
  diamond = new THREE.Mesh(new THREE.ShapeGeometry(sh), flat(COL.star, { opacity: 0 })); diamond.position.set(-2.9, 2.9, 4); skyRoot.add(diamond);

  // the giant Eclipse can (the same model as Off the Chain), slides across the moon
  canPivot = new THREE.Group(); skyRoot.add(canPivot);
  canModel = data.can.scene;
  canModel.traverse((o) => { if (o.name === 'Silhouette') o.visible = false; });
  const bb = new THREE.Box3().setFromObject(canModel), sz = bb.getSize(new THREE.Vector3()), ctr = bb.getCenter(new THREE.Vector3());
  const k = 15 / sz.y; canModel.scale.setScalar(k); canModel.position.copy(ctr).multiplyScalar(-k);
  canPivot.add(canModel); canPivot.visible = false;

  // Bobo's constellation: stars (flat discs), a pulsing ring on the next one, flat bars between joined stars
  con = new THREE.Group(); skyRoot.add(con); con.visible = false;
  const s = CON_H / 923, cx = BOBO_CHEST[0], cy = BOBO_CHEST[1];
  for (const [px, py] of BOBO_PX) {
    const g = new THREE.Group(); g.position.set((px - cx) * s, -(py - cy) * s, 1);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.62, 24), flat(COL.dim)); g.add(dot);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.55, 40), flat(COL.gold, { opacity: 0 })); g.add(ring);
    con.add(g); conStars.push({ g, dot, ring, lit: false, at: 0 });
  }
  for (let i = 0; i < conStars.length; i++) {
    const a = conStars[i].g.position, b = conStars[(i + 1) % conStars.length].g.position;
    const len = a.distanceTo(b), bar = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.22), flat(COL.gold, { opacity: 0 }));
    bar.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, 0.5); bar.rotation.z = Math.atan2(b.y - a.y, b.x - a.x); bar.scale.x = 0.001; bar.userData.len = len;
    con.add(bar); conLines.push(bar);
  }
  $('stars-t').textContent = String(conStars.length);

  // Bobo comes out of his stars: the real Bobo model (its own materials) inside a flat gold glow shell, so he
  // reads as Bobo and as starlight at the same time
  boboRoot = new THREE.Group(); boboRoot.visible = false; skyRoot.add(boboRoot);
  boboModel = data.bobo.scene;
  const shells = [];
  boboModel.traverse((o) => {
    if (o.name === 'Silhouette') o.visible = false;
    if ((o.isMesh || o.isSkinnedMesh) && o.visible && o.name !== 'Silhouette') { o.frustumCulled = false; shells.push(o); }
  });
  const bb2 = new THREE.Box3().setFromObject(boboModel), sz2 = bb2.getSize(new THREE.Vector3()), c2 = bb2.getCenter(new THREE.Vector3());
  const k2 = 13 / sz2.y; boboModel.scale.setScalar(k2); boboModel.position.set(-c2.x * k2, -bb2.min.y * k2, -c2.z * k2);
  boboRoot.add(boboModel);
  // the glow: each mesh again, pushed out along its normals, back faces only, one flat gold
  const out = 0.045 * sz2.y;   // in the model's own units
  const glowMat = new THREE.MeshBasicMaterial({ color: COL.gold, side: THREE.BackSide });
  glowMat.onBeforeCompile = (sh) => { sh.uniforms.uOut = { value: out }; sh.vertexShader = 'uniform float uOut;\n' + sh.vertexShader.replace('#include <project_vertex>', 'transformed += normalize(objectNormal) * uOut;\n#include <project_vertex>'); };
  for (const m of shells) {
    const g = m.isSkinnedMesh ? new THREE.SkinnedMesh(m.geometry, glowMat) : new THREE.Mesh(m.geometry, glowMat);
    if (m.isSkinnedMesh) g.bind(m.skeleton, m.bindMatrix);
    g.frustumCulled = false; g.renderOrder = -1; m.parent.add(g); g.position.copy(m.position); g.quaternion.copy(m.quaternion); g.scale.copy(m.scale);
  }
  boboMixer = new THREE.AnimationMixer(boboModel);
  for (const clip of data.bobo.animations) boboClips[clip.name] = boboMixer.clipAction(clip);

  // a trail of little stars behind Bobo, and the fizz fireworks: one pool of flat dots each
  trail = particles(260, 2.2); fw = particles(900, 3.4);
  skyScene.add(trail.points); skyScene.add(fw.points);
}

function particles(n, px) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), al = new Float32Array(n), sz = new Float32Array(n);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('alpha', new THREE.BufferAttribute(al, 1)); g.setAttribute('size', new THREE.BufferAttribute(sz, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uPx: { value: 1 } },
    vertexShader: 'attribute vec3 color; attribute float alpha; attribute float size; uniform float uPx; varying vec3 vC; varying float vA; void main(){ vC = color; vA = alpha; gl_PointSize = size * uPx; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vC; varying float vA; void main(){ vec2 q = gl_PointCoord - 0.5; if (dot(q, q) > 0.25 || vA <= 0.0) discard; gl_FragColor = vec4(vC, vA); }',
    transparent: true, depthWrite: false,
  });
  const points = new THREE.Points(g, m); points.frustumCulled = false;
  const P = Array.from({ length: n }, () => ({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), size: px }));
  let next = 0;
  return {
    points, mat: m,
    emit(p, v, color, life, size) { const i = next, q = P[i]; next = (next + 1) % n; q.p.copy(p); q.v.copy(v); q.life = q.max = life; q.size = size; col.set([color.r, color.g, color.b], i * 3); },
    update(dt) {
      for (let i = 0; i < n; i++) {
        const q = P[i];
        if (q.life > 0) { q.life -= dt; q.v.multiplyScalar(Math.pow(0.35, dt)); q.v.y -= 2.5 * dt; q.p.addScaledVector(q.v, dt); }
        const a = q.life > 0 ? clamp(q.life / q.max * 1.6, 0, 1) : 0;
        pos.set([q.p.x, q.p.y, q.p.z], i * 3); al[i] = a; sz[i] = q.size;
      }
      g.attributes.position.needsUpdate = g.attributes.alpha.needsUpdate = g.attributes.size.needsUpdate = g.attributes.color.needsUpdate = true;
    },
  };
}

// the charm in the camera (metres of the real charm): a gold ring and bubbles that rise off the top of the can
function buildCharm(layout) {
  const L = layout.targets['kc-can'], W = L.widthM, H = L.heightM;
  anchor = new THREE.Group(); anchor.visible = false; scene.add(anchor);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.031, 0.0335, 64), flat(COL.gold, { opacity: 0 })); anchor.add(ring);
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(0.036, 0.0375, 64), flat(COL.red, { opacity: 0 })); anchor.add(ring2);
  const bubbles = [];
  for (let i = 0; i < 34; i++) {
    const b = new THREE.Mesh(new THREE.CircleGeometry(0.0007 + Math.random() * 0.0014, 16), flat([COL.gold, COL.star, COL.red, COL.blue][i % 4], { opacity: 0 }));
    b.userData = { x: (Math.random() - 0.5) * W * 0.7, ph: Math.random(), sp: 0.6 + Math.random() * 0.6 }; anchor.add(b); bubbles.push(b);
  }
  charmFx = { ring, ring2, bubbles, W, H, t: 0 };
}

function buildScene({ scene: s, camera: c, renderer: r }, data) {
  scene = s; camera = c; renderer = r;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.5));
  camera.position.set(0, 0, 0); camera.quaternion.identity();
  XR8.XrController.updateCameraProjectionMatrix({ origin: camera.position, facing: camera.quaternion });
  skyRT = new THREE.WebGLRenderTarget(Math.max(canvas.width, 2), Math.max(canvas.height, 2), { depthBuffer: true });
  compMat.uniforms.tSky.value = skyRT.texture;
  comp = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), compMat); comp.frustumCulled = false; comp.renderOrder = -100; scene.add(comp);
  buildSky(data); buildCharm(data.layout);
}

// ---------------------------------------------------------------- tracking the charm
const GRACE_MS = 120, STALE_MIN = 120, STALE_MAX = 300;
const TS = {}; for (const n of TARGETS) TS[n] = { tracked: false, at: 0, gap: 40, lostAt: -1e9, p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1, snap: true };
let tHeight = {};
function onTarget(d) {
  const t = TS[d.name]; if (!t) return;
  t.p.set(d.position.x, d.position.y, d.position.z); t.q.set(d.rotation.x, d.rotation.y, d.rotation.z, d.rotation.w);
  t.s = d.scale * (d.scaledHeight || 1) / tHeight[d.name];
  const now = performance.now();
  if (!t.tracked) { t.snap = true; const g = tDiag(d.name); g.found++; if (g.firstS == null) g.firstS = secs(); onCharm(); }
  else t.gap += (Math.min(Math.max(now - t.at, 8), 400) - t.gap) * 0.2;
  t.tracked = true; t.at = now;
}
function onLost(d) { const t = TS[d.name]; if (t && t.tracked) { t.tracked = false; t.lostAt = performance.now(); tDiag(d.name).lost++; } }
function follow(t) {
  const a = anchor;
  const aP = t.snap ? 1 : clamp(a.position.distanceTo(t.p) / t.s / 0.0015, 0.5, 1);
  const aR = t.snap ? 1 : clamp(a.quaternion.angleTo(t.q) / 0.03, 0.5, 1);
  t.snap = false;
  a.position.lerp(t.p, aP); a.quaternion.slerp(t.q, aR); a.scale.setScalar(lerp(a.scale.x, t.s, aP));
}

// ---------------------------------------------------------------- the story
// charge: find the can charm -> look: point at the sky -> show: night pours in, the can eclipses the moon ->
// trace: join Bobo's stars (only once the charm charged it) -> free: Bobo is out, fizz fireworks.
let mode = 'charge', charged = false, chargeT = -1, showT = 0, lookT = 0, skyUpT = 0, placed = false, traceN = 0, aimT = 0, won = false, boboT = -1, nightShown = false;
function setMode(m) {
  mode = m; $('hud').dataset.mode = m; $('hud').classList.remove('charging'); camLog('mode:' + m);
  $('b-skip').hidden = m !== 'charge';
  if (m !== 'look') $('b-night').hidden = true;
  $('stars-n').hidden = !(m === 'trace' || (m === 'free' && won));
  $('b-fizz').hidden = !(m === 'free' || m === 'trace');
  if (m === 'charge') hint('Hold your Eclipse can charm up to the camera');
  if (m === 'look') hint(charged ? 'Charged! Now point your phone at the sky' : 'Point your phone at the sky');
  if (m === 'trace') hint('Hold the ring on the glowing star');
  if (m === 'free') hint(won ? 'Tap the sky for fizz fireworks' : 'Scan your Eclipse can charm to wake Bobo\'s stars');
}
function onCharm() {
  if (!diag.charmS) diag.charmS = secs();
  if (charged) return;
  if (mode === 'charge') { chargeT = 0; sound.charge(); buzz([20, 40, 20]); postEvent('sighting', { charm: 'can' }); hint('Charging the can…'); $('hud').classList.add('charging'); $('b-skip').hidden = true; }
  else { charged = true; postEvent('sighting', { charm: 'can', late: true }); if (mode === 'free' && placed && !won) startConstellation(); }
}
$('b-skip').onclick = () => { setMode('look'); diag.skipped = true; };
$('b-night').onclick = () => { setSkyMode('dome'); $('b-night').hidden = true; };

function placeSky() {
  // the eclipse goes where you are looking (kept between 18 and 58 degrees up so you can still see it comfortably)
  const f = forward().clone(); let el = Math.asin(clamp(f.y, -1, 1)); const az = Math.atan2(f.x, -f.z);
  el = clamp(el, deg(18), deg(58));
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  skyRoot.position.copy(dir).multiplyScalar(SKY_R); skyRoot.lookAt(0, 0, 0);
  placed = true;
}
function startShow() {
  placeSky(); setMode('show'); showT = 0; sound.reveal(); sound.humTo(1); buzz(30);
  canPivot.visible = true; corona.forEach((m) => { m.material.opacity = 0; m.scale.setScalar(0.6); }); rays.material.opacity = 0; diamond.material.opacity = 0;
  con.visible = false; boboRoot.visible = won; hint(null);
  if (!nightShown) { nightShown = true; postEvent('play', { sky: skyMode, seg: +seg.pct.toFixed(2) }); diag.showS = secs(); diag.showMode = skyMode; }
}
function startConstellation() {
  con.visible = true; traceN = conStars.findIndex((s) => !s.lit); if (traceN < 0) traceN = 0;
  conStars.forEach((s, i) => { s.at = performance.now() / 1000 + i * 0.08; });
  setMode('trace'); updateStarsN();
}
function updateStarsN() { $('stars-k').textContent = String(conStars.filter((s) => s.lit).length); }
function lightStar(i) {
  const s = conStars[i]; s.lit = true; s.at = performance.now() / 1000; s.dot.material.color.set(COL.gold); s.ring.material.opacity = 0;
  sound.ping(i); buzz(18); updateStarsN();
  burstAt(s.g.getWorldPosition(new THREE.Vector3()), 14, [COL.gold, COL.star], 0.8);
  if (i > 0) growLine(i - 1);
  const nxt = conStars.findIndex((x) => !x.lit);
  if (nxt < 0) { growLine(conStars.length - 1); setTimeout(complete, 650); traceN = -1; }
  else traceN = nxt;
}
function growLine(i) { conLines[i].userData.grow = performance.now() / 1000; }
function complete() {
  won = true; sound.done(); buzz([30, 60, 30, 60, 80]); postEvent('reward', { what: 'bobo-constellation' }); diag.wonS = secs();
  boboRoot.visible = true; boboT = 0; setMode('free');
  setTimeout(() => { if (mode === 'free') { $('won').hidden = false; $('b-won').focus(); } }, 4200);
}
$('b-won').onclick = () => { $('won').hidden = true; };

// ---------------------------------------------------------------- fireworks
const _c = new THREE.Color(), _v = new THREE.Vector3();
function burstAt(p, n, colors, speed = 1) {
  for (let i = 0; i < n; i++) {
    _v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar((6 + Math.random() * 8) * speed);
    fw.emit(p, _v, _c.set(colors[i % colors.length]), 0.9 + Math.random() * 0.8, 2.5 + Math.random() * 3);
  }
}
function firework(dir) {
  const p = dir.clone().normalize().multiplyScalar(SKY_R * 0.9);
  const cols = [COL.gold, COL.red, COL.star, COL.blue];
  for (let i = 0; i < 70; i++) {   // a ring of fizz bubbles, then a few slow sparkles
    const a = (i / 70) * Math.PI * 2, r = 1;
    _v.set(Math.cos(a) * r, Math.sin(a) * r, (Math.random() - 0.5) * 0.4);
    _v.applyQuaternion(skyQ).multiplyScalar(16 + Math.random() * 6);
    fw.emit(p, _v, _c.set(cols[i % 4]), 1.6 + Math.random() * 0.6, 3 + Math.random() * 3.5);
  }
  burstAt(p, 24, [COL.star, COL.gold], 0.5);
  sound.pop(); buzz(15); fireworks++;
}
let fireworks = 0;
function fizzAtScreen(x, y) {
  const r = canvas.getBoundingClientRect(), ndc = new THREE.Vector3(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1, 0.5);
  skyCam.updateMatrixWorld(); ndc.unproject(skyCam); firework(ndc.sub(skyCam.position));
}
$('b-fizz').onclick = () => { const r = canvas.getBoundingClientRect(); fizzAtScreen(r.left + r.width * (0.3 + Math.random() * 0.4), r.top + r.height * (0.2 + Math.random() * 0.25)); };
// tap the sky for a firework; with no motion sensors, drag to look around
let down = null;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, yaw: look.yaw, pitch: look.pitch, moved: false }; });
canvas.addEventListener('pointermove', (e) => {
  if (!down) return; const dx = e.clientX - down.x, dy = e.clientY - down.y;
  if (Math.hypot(dx, dy) > 8) down.moved = true;
  if (!haveOri && down.moved) { look.yaw = down.yaw + dx * 0.004; look.pitch = clamp(down.pitch + dy * 0.004, deg(-30), deg(85)); }
});
canvas.addEventListener('pointerup', (e) => { if (down && !down.moved && (mode === 'free' || mode === 'trace')) fizzAtScreen(e.clientX, e.clientY); down = null; });

// ---------------------------------------------------------------- every frame
const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _rq = new THREE.Quaternion(), _p = new THREE.Vector3();
function tick(dt) {
  const now = performance.now(), time = now / 1000;
  diag.fpsN++;
  // the sky camera: the phone's orientation (or drag-to-look), same lens as the camera picture
  if (haveOri) skyQ.slerp(devQ, 0.65); else skyQ.copy(lookQ());
  skyCam.quaternion.copy(skyQ); skyCam.projectionMatrix.copy(camera.projectionMatrix); skyCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
  skyCam.updateMatrixWorld(true);
  const f = forward(), el = f.y;

  // the charm
  let tr = null;
  for (const n of TARGETS) {
    const t = TS[n];
    if (t.tracked && now - t.at > clamp(t.gap * 3, STALE_MIN, STALE_MAX)) { t.tracked = false; t.lostAt = now; }
    if (t.tracked) { tr = t; } else if (!tr && now - t.lostAt < GRACE_MS) tr = t;
    if (!t.tracked && now - t.lostAt >= GRACE_MS) t.snap = true;
  }
  anchor.visible = !!tr && (mode === 'charge' || mode === 'look');   // once the night is up, the sky is the show
  if (tr && tr.tracked) follow(tr);
  updateCharm(dt, time, !!tr);

  // the story
  if (mode === 'charge' && chargeT >= 0) {
    chargeT += dt;
    if (chargeT > 1.7) { charged = true; chargeT = -1; setMode('look'); }
  }
  if (mode === 'look') {
    lookT += dt;
    const up = haveOri ? el > 0.3 : true;
    const skyHere = skyMode === 'dome' ? (haveOri ? el > 0.25 : true) : (seg.has && seg.pct > 0.05 && el > -0.05);
    if (skyHere) startShow();
    else { skyUpT = up ? skyUpT + dt : 0; if (skyMode === 'real' && skyUpT > 6) $('b-night').hidden = false; }
  }
  if (mode === 'show') {
    showT += dt; const T = REDUCED ? showT * 1.4 : showT;
    // the can slides in from the right, stops on the moon at 4.6 s
    const k = easeInOut((T - 1.2) / 3.4);
    canPivot.position.set(lerp(34, 0, k), lerp(-6, 0, k) + Math.sin(time * 1.3) * 0.25 * k, 3);
    canPivot.rotation.set(0, lerp(-1.2, 0.35, k) + time * 0.25, lerp(-0.4, 0.06, k));
    if (T > 4.6 && !corona.done) { corona.done = true; sound.total(); buzz([40, 30, 60]); }
    corona.forEach((m, i) => { const q = easeOut((T - 4.6 - i * 0.12) / 0.6); m.material.opacity = q; m.scale.setScalar(lerp(0.6, 1, backOut(q))); });
    rays.material.opacity = easeOut((T - 4.9) / 0.8) * 0.9;
    const dq = clamp((T - 5.2) / 0.9, 0, 1); diamond.material.opacity = Math.sin(dq * Math.PI); diamond.scale.setScalar(0.4 + Math.sin(dq * Math.PI) * 0.9); diamond.rotation.z = dq * 1.5;
    if (T > 6.6) { corona.done = false; if (charged && !won) startConstellation(); else { setMode('free'); } }
  } else if (placed) {
    canPivot.rotation.y += dt * 0.25; canPivot.position.y = Math.sin(time * 1.3) * 0.25;
  }
  rays.rotation.z += dt * 0.05;
  const reveal = placed ? clamp(mode === 'show' ? showT / 2.2 : 1, 0, 1) : 0;
  stars.material.uniforms.uA.value = easeOut(reveal * 1.2 - 0.2); stars.material.uniforms.uT.value = time;

  // the constellation
  if (con.visible) {
    for (let i = 0; i < conStars.length; i++) {
      const s = conStars[i], since = time - s.at;
      const pop = easeOut(since / 0.4);
      s.g.scale.setScalar(s.lit ? 1 + Math.max(0, 0.8 - since * 2) : Math.max(0.001, pop) * (i === traceN ? 1.35 : 1));
      if (!s.lit) s.ring.material.opacity = i === traceN ? 0.55 + 0.45 * Math.sin(time * 6) : 0;
      if (!s.lit) s.dot.material.color.set(i === traceN ? COL.star : COL.dim);
    }
    for (const bar of conLines) {
      const g = bar.userData.grow; if (g == null) continue;
      const q = easeOut((time - g) / 0.35); bar.scale.x = Math.max(0.001, bar.userData.len * q); bar.material.opacity = 0.9;
      if (won) bar.material.color.set(Math.sin(time * 3 + bar.id) > 0.92 ? COL.star : COL.gold);
    }
    // aiming: the screen centre is the phone's forward direction
    if (mode === 'trace' && traceN >= 0) {
      const sp = conStars[traceN].g.getWorldPosition(_p).normalize();
      const ang = THREE.MathUtils.radToDeg(f.angleTo(sp));
      const on = ang < AIM_DEG;
      aimT = on ? aimT + dt : Math.max(0, aimT - dt * 2);
      $('reticle').classList.toggle('on', on);
      $('ret-p').style.strokeDashoffset = String(163.4 * (1 - clamp(aimT / DWELL_S, 0, 1)));
      if (aimT >= DWELL_S) { aimT = 0; lightStar(traceN); }
      // which way to the next star, when it is off screen
      if (!on && ang > 25) hint(arrowTo(sp) + ' Find the glowing star'); else if ($('hint').textContent.includes('Find the')) hint('Hold the ring on the glowing star');
    }
  }

  // Bobo walks out of his stars, across the sky, then sits beside the eclipse
  if (boboRoot.visible) {
    if (boboT >= 0) boboT += dt;
    const T = boboT < 0 ? 99 : boboT;
    let x, y = -CON_H * 0.32, facing, act;
    if (T < 0.8) { x = 0; boboRoot.scale.setScalar(Math.max(0.001, backOut(T / 0.8))); facing = 0; act = 'ClassicExcited'; }
    else if (T < 4.8) { const q = (T - 0.8) / 4; x = lerp(0, 12, q); y += Math.sin(q * Math.PI) * 7; facing = Math.PI / 2; act = 'ClassicWalk'; boboRoot.scale.setScalar(1); }
    else if (T < 10) { const q = (T - 4.8) / 5.2; x = lerp(12, -7.5, q); y += Math.sin(q * Math.PI) * 10; facing = -Math.PI / 2; act = 'ClassicWalk'; }
    else { x = -7.5; facing = 0.5; act = T < 12.5 ? 'Sit' : 'TailWag'; }
    if (T >= 10 && T - dt < 10) sound.mew();
    boboRoot.position.set(x, y, 2); boboRoot.rotation.y = lerp(boboRoot.rotation.y, facing, 1 - Math.pow(0.002, dt));
    playBobo(act);
    if (act === 'ClassicWalk' && Math.random() < dt * 22) {
      const wp = boboRoot.getWorldPosition(new THREE.Vector3());
      trail.emit(wp, _v.set((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2), _c.set(Math.random() < 0.7 ? COL.gold : COL.star), 1.6, 2 + Math.random() * 2.5);
    }
    boboMixer.update(dt);
  }
  trail.update(dt); fw.update(dt);

  // sky segmentation + the composite
  if (mode !== 'charge') { segInit(); if (skyMode === 'real') segPump(); }
  compMat.uniforms.uMode.value = skyMode === 'dome' ? 1 : 0;
  compMat.uniforms.uHas.value = seg.has ? 1 : 0;
  compMat.uniforms.uReveal.value = reveal;
  _rq.copy(skyQ); _r.makeRotationFromQuaternion(_rq);
  compMat.uniforms.uW.value.multiplyMatrices(_r, camera.projectionMatrixInverse);
  _m.makeRotationFromQuaternion(_rq.copy(seg.qMask).invert());
  compMat.uniforms.uM.value.multiplyMatrices(camera.projectionMatrix, _m).multiply(_r).multiply(camera.projectionMatrixInverse);
  comp.visible = placed;
  if (placed) renderSky();
  sound.humTo(placed ? (mode === 'show' ? 1 : 0.5) : 0);
  recTick();
}
function renderSky() {
  if (skyRT.width !== canvas.width || skyRT.height !== canvas.height) skyRT.setSize(canvas.width, canvas.height);
  const px = canvas.width / Math.max(canvas.clientWidth, 1) * Math.max(1, Math.min(devicePixelRatio, 2));
  stars.material.uniforms.uPx.value = px; trail.mat.uniforms.uPx.value = px; fw.mat.uniforms.uPx.value = px;
  const prevC = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
  renderer.setRenderTarget(skyRT); renderer.setClearColor(COL.night, 1); renderer.clear(true, true, false);
  renderer.render(skyScene, skyCam);
  renderer.setRenderTarget(null); renderer.setClearColor(prevC, prevA);
}
let boboAct = null;
function playBobo(name) {
  const a = boboClips[name] || boboClips.ClassicWalk; if (!a || boboAct === a) return;
  a.reset().fadeIn(0.3).play(); if (boboAct) boboAct.fadeOut(0.3); boboAct = a;
}
function arrowTo(dir) {
  const v = dir.clone().applyQuaternion(_rq.copy(skyQ).invert());   // in the phone's frame: x right, y up
  const a = Math.atan2(v.y, v.x) * 180 / Math.PI;
  return a > 45 && a < 135 ? '↑' : a < -45 && a > -135 ? '↓' : Math.abs(a) <= 45 ? '→' : '←';
}
function updateCharm(dt, time, vis) {
  const fx = charmFx; if (!vis) return;
  const k = chargeT >= 0 ? clamp(chargeT / 1.7, 0, 1) : (charged ? 1 : 0.3);
  fx.ring.material.opacity = 0.9; fx.ring2.material.opacity = 0.75 * k;
  fx.ring.scale.setScalar(1 + Math.sin(time * 4) * 0.03); fx.ring2.scale.setScalar(1 + k * 0.15 + Math.sin(time * 4 + 1) * 0.03);
  for (const b of fx.bubbles) {   // rise off the top of the can, faster while it charges
    const u = b.userData, q = (time * u.sp * (0.35 + k * 0.9) + u.ph) % 1;
    b.position.set(u.x + Math.sin(q * 9 + u.ph * 6) * 0.002, fx.H * 0.35 + q * fx.H * (0.6 + k * 1.2), 0.004);
    b.material.opacity = (charged || chargeT >= 0) ? Math.sin(q * Math.PI) : 0;
  }
}

// ---------------------------------------------------------------- UI
function hint(text) { const el = $('hint'); el.textContent = text || ''; }
function setSkyMode(m) {
  skyMode = m; store.set('sky', m); diag.skyMode = m;
  document.querySelectorAll('#seg-sky button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === m)));
}
setSkyMode(skyMode);
document.querySelectorAll('#seg-sky button').forEach((b) => { b.onclick = () => setSkyMode(b.dataset.v); });
$('o-replay').onclick = () => { closeOpts(); if (mode === 'charge' || mode === 'look') { setMode('look'); return; } startShow(); };
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

// ---------------------------------------------------------------- 8th Wall pipeline
const DPR = clamp(+params.get('dpr') || 1, 1, 3);
function sizeCanvas() {
  const dpr = Math.min(devicePixelRatio || 1, DPR), w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}
let last = 0, camStartAt = 0, built = false;
const secs = () => +((performance.now() - (camStartAt || performance.now())) / 1000).toFixed(1);
const appModule = (data) => ({
  name: 'eclipse-night',
  onStart: () => { buildScene(XR8.Threejs.xrScene(), data); built = true; $('hud').hidden = false; setMode(params.has('nocharm') ? 'look' : 'charge'); },
  onUpdate: () => { const now = performance.now(); const dt = Math.min((now - (last || now)) / 1000, 0.05); last = now; if (built) tick(dt); flushDiag(false); },
  onCameraStatusChange: ({ status, video, stream }) => {
    camLog(status);
    if (status === 'hasStream') { kickVideo(); noteStream(stream); }
    if (status === 'hasVideo') {
      hideTapCam(); camStartAt = performance.now(); seg.video = video || engineVideo(); tuneCamera(seg.video);
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
  // iPhone: orientation access has to be asked inside the Start tap (the first await below still is). Motion is
  // asked too so the engine does not show its own prompt; the listener goes on whatever the answers were.
  for (const E of [window.DeviceOrientationEvent, window.DeviceMotionEvent]) {
    try { if (E && E.requestPermission) { const r = await E.requestPermission(); diag.motion = (diag.motion ? diag.motion + ',' : '') + r; } } catch (e) { diag.motion = 'error:' + (e && e.name); }
  }
  addEventListener('deviceorientation', onOri);
}
async function start() {
  if (!loaded) return;
  $('b-start').disabled = true; $('b-start').textContent = 'Starting…';
  sound.init(); capture && capture.configure({ audioContext: sound.ctx }); await askMotion();
  const data = await assets;
  for (const n of TARGETS) tHeight[n] = data.layout.targets[n].heightM;
  segInit();   // load the sky model now so it is ready by the time you look up
  sizeCanvas(); addEventListener('resize', sizeCanvas); addEventListener('orientationchange', () => setTimeout(sizeCanvas, 300));
  XR8.XrController.configure({ disableWorldTracking: true, imageTargetData: data.tdata });
  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(), XR8.Threejs.pipelineModule(), XR8.XrController.pipelineModule(), XR8.CanvasScreenshot.pipelineModule(),
    appModule(data),
    { name: 'en-capture', onRender: () => { if (capture) capture.frame(); } },
  ]);
  camLog('run'); postEvent('scan', {});
  setTimeout(() => { if (!camStartAt && !tapCamShown) camFailed('no video after 12 s'); }, 12000);
  XR8.run({ canvas, allowedDevices: XR8.XrConfig.device().ANY, cameraConfig: { direction: XR8.XrConfig.camera().BACK } });
}
$('b-start').onclick = start;

// ---------------------------------------------------------------- camera (the same handling as Bobo X-Ray)
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function engineVideo() { return [...document.querySelectorAll('video')].find((v) => v.srcObject) || null; }
function tuneCamera(video) {
  try {
    const tr = video && video.srcObject && video.srcObject.getVideoTracks()[0]; if (!tr) return;
    const caps = tr.getCapabilities ? tr.getCapabilities() : {};
    if (caps.focusMode && caps.focusMode.includes('continuous')) tr.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
    const st = tr.getSettings ? tr.getSettings() : {};
    diag.camera = { label: tr.label, width: st.width || video.videoWidth, height: st.height || video.videoHeight, frameRate: st.frameRate, ios: IOS };
  } catch (e) { diag.errors.push('tune: ' + String(e).slice(0, 120)); }
}
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
    canvas, host: document.body, endpoint: location.origin, globeUrl: '/evade/where-is-bobo/', source: 'eclipse-night', audioContext: null,
    connectAudio: (dest) => { const m = sound.master; if (!m) return () => {}; m.connect(dest); return () => { try { m.disconnect(dest); } catch (e) { /* gone */ } }; },
    overlay: (c, Wd, Hd) => drawWatermark(c, Wd, Hd),
    on: (name) => { if (name === 'recordStart') { buzz(25); recUi(true); } if (name === 'recordStop' || name === 'error') recUi(false); },
  });
  Object.assign(capture.settings, {
    corner: 'topRight', offsetX: -5, offsetY: -6, accent: '#f6c344', maxSeconds: 30,
    hintText: 'Film your Eclipse Night sky and send it to the globe', sendLabel: 'Send to Where is Bobo?',
    sheetTitle: 'Send your clip to the Bobo globe?', keepTitle: 'Keep your clip?', clipTitle: 'Eclipse Night clip', filePrefix: 'eclipse-night', backLabel: 'Back to the sky',
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
    const file = new File([blob], `eclipse-night-${++shots}.jpg`, { type: 'image/jpeg' }), url = URL.createObjectURL(blob);
    $('shot-img').src = url; $('shot-save').href = url; $('shot-save').download = file.name; $('shot-save').hidden = false;
    const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
    $('shot-share').hidden = !canShare; $('shot-share').onclick = () => navigator.share({ files: [file], title: 'Eclipse Night' }).catch(() => {});
    $('shot').hidden = false; postEvent('share', { what: 'eclipse-photo', won });
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

// ---------------------------------------------------------------- Where is Bobo? events (city level, anonymous)
function postEvent(type, props) {
  if (params.has('nolog')) return;
  try { fetch('/api/bobo/events', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, source: 'eclipse-night', sessionId: SID, props }) }).catch(() => {}); } catch (e) { /* offline */ }
}

// ---------------------------------------------------------------- test log (previews and local dev only, or ?diag)
// Read back with GET /api/ar/kc-diag on a deploy preview (records carry page: 'eclipse-night').
function tDiag(n) { return diag.targets[n] || (diag.targets[n] = { found: 0, lost: 0 }); }
function camLog(s) { diag.steps.push([s, Math.round(performance.now())]); if (diag.steps.length > 40) diag.steps.shift(); }
let flushAt = 0;
function flushDiag(force, always = false) {
  const now = performance.now(); if (!force && now - flushAt < 10000) return; flushAt = now;
  if ((!camStartAt && !always) || params.has('nolog') || (LIVE_SITE && !params.has('diag'))) return;
  const body = JSON.stringify({
    ...diag, note: params.get('note') || '', secs: secs(), fps: camStartAt ? +(diag.fpsN / Math.max((now - camStartAt) / 1000, 1)).toFixed(1) : 0, mode, charged, won, fireworks,
    sky: { mode: skyMode, ready: seg.ready, results: seg.n, ms: Math.round(seg.ms), pct: +seg.pct.toFixed(3), pctAvg: +seg.pctAvg.toFixed(3), pctMax: +seg.pctMax.toFixed(3), err: seg.err },
    ori: { have: haveOri, events: oriN, beta: Math.round(lastBeta) }, screen: [innerWidth, innerHeight, devicePixelRatio],
  });
  try { if (!(navigator.sendBeacon && navigator.sendBeacon('/api/ar/kc-diag', new Blob([body], { type: 'application/json' })))) fetch('/api/ar/kc-diag', { method: 'POST', body, keepalive: true }); } catch (e) { /* offline */ }
}
addEventListener('pagehide', () => flushDiag(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) flushDiag(true); });
addEventListener('error', (e) => { diag.errors.push(String(e.message).slice(0, 200)); });

// automated tests (?test)
if (params.has('test')) window.__en = {
  get mode() { return mode; }, get charged() { return charged; }, get won() { return won; }, get seg() { return { ready: seg.ready, n: seg.n, pct: seg.pct, ms: seg.ms, err: seg.err }; },
  get stars() { return conStars.map((s) => s.lit); }, get traceN() { return traceN; }, diag, TS,
  // aim the phone at the next star (sets the drag-to-look angles, or the fake sensor via the page's own events)
  aimNext() { if (traceN < 0) return false; const d = conStars[traceN].g.getWorldPosition(new THREE.Vector3()).normalize(); look.yaw = Math.atan2(-d.x, -d.z); look.pitch = Math.asin(d.y); return true; },
  aimCenter(dy = 0) { const d = skyRoot.position.clone().normalize(); look.yaw = Math.atan2(-d.x, -d.z); look.pitch = Math.asin(d.y) + dy; },
  boboInfo() { const v = boboRoot.getWorldPosition(new THREE.Vector3()).project(skyCam); const bb = new THREE.Box3().setFromObject(boboModel, true); return { vis: boboRoot.visible, scr: [v.x, v.y, v.z], act: boboAct && boboAct.getClip().name, size: bb.getSize(new THREE.Vector3()).toArray(), sc: boboRoot.scale.x }; },
  forceCharge() { charged = true; if (placed) startConstellation(); },
  light: (i) => lightStar(i), get showT() { return showT; }, get boboT() { return boboT; }, setSkyMode, startShow, firework: () => firework(forward().clone()),
};

// desktop: a QR to open it on the phone
if (!TOUCH) {
  $('desk').hidden = false;
  try { window.QRCode && QRCode.toString(location.href, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }, (err, svg) => { if (!err) $('qr').innerHTML = svg; }); } catch (e) { /* no QR */ }
}
