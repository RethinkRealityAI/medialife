// EVADE keychain AR: point the camera at the keychain and Bobo and the Eclipse can jump off their
// charms, leaving a swirling portal behind on each charm. Image tracking by the open-source 8th Wall engine
// (github.com/8thwall/8thwall, MIT), self-hosted in ./vendor/xr. Rendering is plain three.js.
//
// How the alignment works: the image target is the Bobo charm and the can charm together as they sit on
// the keychain (only used with ?pair=1). The two charms are separate keychains on one ring, so each has a
// target of its own and its own pop-out; one more target recognises the earlier design's Bobo charm. image-targets/layout.json says where each picture
// sits relative to its charm (metres), which fixes each charm's frame. The silhouette quad that ships inside each GLB covers exactly its
// charm frame, and the model starts at (charm frame) x (Silhouette node matrix)^-1, i.e. over its print.
// Nothing is drawn unless the target is being tracked right now.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
// the Cola Run recorder (mattercraft/cola-run/CaptureCore.ts, built for the browser): record, review, save,
// and send the clip to the Where is Bobo? globe
import { ColaCapture } from '/evade/cola-run-lab/assets/capture-core.js';

window.THREE = THREE;                       // XR8.Threejs.pipelineModule() looks for a global THREE
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const DEV = params.has('tune') || params.has('dev');   // the Tune panel is a preview tool: only with ?tune (Dapo, 2026-11-11)
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const BASE = '/evade/keychain/';
const HERE = '/evade/keychain-ar/';

// ---------------------------------------------------------------- the physical keychain (metres)
// Charm pictures are 14 px per mm. Where each charm sits on the keychain comes from the 3D keychain
// model (public/evade/keychain/README.md); scripts/build-keychain-ar/build_targets.py uses the same numbers.
const PXM = 14000;
const CHARMS = {
  bobo: { w: 809 / PXM, h: 923 / PXM },
  can: { w: 434 / PXM, h: 805 / PXM },
  old: { w: 0.0585, h: 0.078 },       // the earlier design's Bobo charm picture: the acrylic piece is about 75 mm tall, framed with a 4% margin
};
// landed sizes and spots (metres), in the "ground frame": x right, y up (gravity), z toward the viewer
// Landed characters are the size of their printed art on the charms (art height in the charm pictures / 14 px per mm).
const SIZE = { bobo: 825 / PXM, can: 679 / PXM, old: 0.078 * 645 / 720 };
// Size and spacing can be tuned live from the Size panel; the chosen numbers are remembered on the device.
const TUNE_DEFAULT = { size: 1, gap: 1, hover: 0.012, tilt: 0, away: 0, portal: 3, stagger: 0.55, fly: 1 };   // portal build-up, wait between the two pops, flight to the landing spot (seconds)
const tune = { ...TUNE_DEFAULT };
try { Object.assign(tune, JSON.parse(localStorage.getItem('kc-ar-tune') || '{}')); } catch (e) { /* defaults */ }
for (const k of Object.keys(TUNE_DEFAULT)) if (params.has(k) && isFinite(parseFloat(params.get(k)))) tune[k] = Math.min(Math.max(parseFloat(params.get(k)), 0), 8);
const HALF_GAP = 0.01225;   // half the distance between Bobo and the can when they stand together (Spacing 100%)

// ---------------------------------------------------------------- small helpers
const easeOut = (x) => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3);
const easeInOut = (x) => { x = Math.min(Math.max(x, 0), 1); return x * x * (3 - 2 * x); };
function radialTexture(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const glowTex = radialTexture([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(160,210,255,.8)'], [0.6, 'rgba(232,91,216,.25)'], [1, 'rgba(0,0,0,0)']]);
const padTex = radialTexture([[0, 'rgba(79,180,255,0)'], [0.62, 'rgba(79,180,255,0)'], [0.7, 'rgba(79,180,255,.9)'], [0.78, 'rgba(232,91,216,.55)'], [1, 'rgba(0,0,0,0)']]);
const shadowTex = radialTexture([[0, 'rgba(0,0,0,.32)'], [0.6, 'rgba(0,0,0,.12)'], [1, 'rgba(0,0,0,0)']]);
function bubbleTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const body = g.createRadialGradient(64, 64, 20, 64, 64, 60);
  body.addColorStop(0, 'rgba(190,230,255,.06)'); body.addColorStop(0.72, 'rgba(170,220,255,.2)'); body.addColorStop(0.93, 'rgba(235,160,255,.95)'); body.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = body; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 3; g.beginPath(); g.arc(64, 64, 56, 0, 7); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.ellipse(44, 40, 13, 7, -0.7, 0, 7); g.fill();
  g.beginPath(); g.arc(84, 88, 4, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const bubbleTex = bubbleTexture();
function canvasTex(size, draw) { const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
const fishTex = canvasTex(128, (g) => {          // a cartoon fish, drawn here (no image files)
  g.translate(64, 64); g.rotate(-0.25);
  const body = g.createLinearGradient(0, -26, 0, 26); body.addColorStop(0, '#9fe3ff'); body.addColorStop(0.5, '#4fb4ff'); body.addColorStop(1, '#2a6fd6');
  g.lineJoin = 'round'; g.lineWidth = 5; g.strokeStyle = '#123a6b';
  g.beginPath(); g.moveTo(26, 0); g.lineTo(52, -22); g.lineTo(48, 0); g.lineTo(52, 22); g.closePath(); g.fillStyle = '#ff9f43'; g.fill(); g.stroke();
  g.beginPath(); g.ellipse(-6, 0, 38, 25, 0, 0, 7); g.fillStyle = body; g.fill(); g.stroke();
  g.beginPath(); g.moveTo(-4, -22); g.quadraticCurveTo(8, -38, 18, -20); g.fillStyle = '#ff9f43'; g.fill(); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(-12, -10, 16, 6, -0.3, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(-26, -4, 7, 0, 7); g.fill(); g.fillStyle = '#123a6b'; g.beginPath(); g.arc(-27, -4, 3.6, 0, 7); g.fill();
  g.strokeStyle = '#123a6b'; g.lineWidth = 3; g.beginPath(); g.arc(-38, 6, 5, 0.2, 1.6); g.stroke();
});
const heartTex = canvasTex(128, (g) => {
  const gr = g.createLinearGradient(0, 20, 0, 110); gr.addColorStop(0, '#ff8ad8'); gr.addColorStop(1, '#ff3d7f');
  g.beginPath(); g.moveTo(64, 108); g.bezierCurveTo(10, 72, 8, 26, 40, 22); g.bezierCurveTo(54, 20, 62, 30, 64, 40); g.bezierCurveTo(66, 30, 74, 20, 88, 22); g.bezierCurveTo(120, 26, 118, 72, 64, 108); g.closePath();
  g.fillStyle = gr; g.fill(); g.lineWidth = 5; g.strokeStyle = '#fff'; g.stroke();
  g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.ellipse(42, 42, 9, 5, -0.7, 0, 7); g.fill();
});
const zzzTex = canvasTex(128, (g) => { g.font = '900 96px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 10; g.strokeStyle = '#1b2240'; g.strokeText('z', 64, 66); g.fillStyle = '#cfe6ff'; g.fillText('z', 64, 66); });
const auraTex = radialTexture([[0, 'rgba(255,236,170,.95)'], [0.35, 'rgba(255,196,70,.55)'], [0.7, 'rgba(255,140,40,.15)'], [1, 'rgba(0,0,0,0)']]);
const sparkTex = radialTexture([[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,255,255,.9)'], [0.5, 'rgba(160,220,255,.35)'], [1, 'rgba(0,0,0,0)']]);

// ---------------------------------------------------------------- the charm mask: glow, portal, black
// One quad per charm, cut by the silhouette picture. uGlow lights a border around the cut-out, uPortal
// fills it with a swirling portal in that charm's colours, uBlack is the plain black mask behind it.
// The soft halo round the cut-out is worked out once when the page loads (bakeMask: red = the mask, green =
// the halo), so the live shader reads one texel per pixel instead of 25. The swirl's noise repeats exactly
// once round the circle, so there is no seam where the angle wraps from -pi to pi (that seam was the line
// running from the middle of the portal to its edge).
const HALO_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D map; uniform float uAspect;
  void main() {
    float halo = 0.0;
    for (int i = 0; i < 12; i++) {
      float an = float(i) * 0.5236; vec2 d = vec2(cos(an), sin(an) * uAspect);
      halo += texture2D(map, vUv + d * 0.022).a + texture2D(map, vUv + d * 0.05).a * 0.7;
    }
    gl_FragColor = vec4(texture2D(map, vUv).a, halo / 20.4, 0.0, 1.0);
  }`;
const PORTAL_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D map; uniform float uTime, uGlow, uPortal, uBlack, uAspect;
  uniform vec3 uA, uB, uC;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  // value noise that repeats every P cells across (and every 256 down, which also keeps the hash inputs small)
  float noise(vec2 p, float P) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float x0 = mod(i.x, P), x1 = mod(i.x + 1.0, P), y0 = mod(i.y, 256.0), y1 = mod(i.y + 1.0, 256.0);
    return mix(mix(hash(vec2(x0, y0)), hash(vec2(x1, y0)), f.x), mix(hash(vec2(x0, y1)), hash(vec2(x1, y1)), f.x), f.y); }
  float fbm(vec2 p, float P) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p, P); p = p * 2.0 + 7.1; P *= 2.0; a *= 0.5; } return v; }
  void main() {
    vec2 m = texture2D(map, vUv).rg; float a = m.r, halo = m.g;
    vec2 q = (vUv - 0.5) * vec2(1.0, 1.0 / uAspect); float r = length(q), ang = atan(q.y, q.x);
    float rim = smoothstep(0.0, 0.55, halo) * (1.0 - a);                    // outside the cut-out
    float edge = a * (1.0 - smoothstep(0.55, 1.0, halo));                   // just inside it
    float sweep = 0.5 + 0.5 * sin(ang * 2.0 - uTime * 3.2);
    vec3 rimCol = mix(uA, uC, sweep) * (1.1 + 0.5 * sin(uTime * 9.0 + ang * 5.0));
    // portal: a spiral falling into the middle (8 and 16 noise cells round the circle: seamless)
    float sw = ang + 1.6 / (r + 0.18) - uTime * 1.5;
    float n = fbm(vec2(sw * 1.27324, r * 5.0 - uTime * 0.9), 8.0);
    float n2 = fbm(vec2(sw * 2.54648 + 3.0, r * 9.0 + uTime * 0.6), 16.0);
    vec3 pc = mix(uB * 0.35, uA, smoothstep(0.25, 0.75, n));
    pc = mix(pc, uC, smoothstep(0.55, 0.9, n2) * 0.8);
    pc += vec3(1.0) * pow(n * n2 * 2.2, 3.0) * 0.9;                         // sparks in the swirl
    pc *= mix(0.12, 1.25, smoothstep(0.0, 0.42, r));                        // dark at the centre: it has depth
    pc += rimCol * edge * 1.4;
    float inA = a * max(uBlack, uPortal);
    vec3 inside = pc * uPortal * a + rimCol * edge * uGlow * 0.9 * a;
    vec3 glow = rimCol * rim * uGlow * 1.5;
    gl_FragColor = vec4(inside + glow, inA);                                // premultiplied: the glow is additive
  }`;
// mask picture -> a small texture holding the mask (red) and its halo (green), rendered once on the GPU
function bakeMask(map, aspect) {
  const img = map.image || {}; const k = Math.min(1, 512 / Math.max(img.width || 512, img.height || 512));
  const rt = new THREE.WebGLRenderTarget(Math.max(2, Math.round((img.width || 512) * k)), Math.max(2, Math.round((img.height || 512) * k)), { depthBuffer: false });
  const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: map }, uAspect: { value: aspect } }, fragmentShader: HALO_FRAG,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', depthTest: false, depthWrite: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
  const sc = new THREE.Scene(); sc.add(quad);
  const prev = renderer.getRenderTarget(); renderer.setRenderTarget(rt); renderer.render(sc, new THREE.Camera()); renderer.setRenderTarget(prev);
  quad.geometry.dispose(); mat.dispose();
  return rt.texture;
}
function portalMaterial(baked, aspect, a, b, c) {
  const m = new THREE.ShaderMaterial({
    uniforms: { map: { value: baked }, uTime: { value: 0 }, uGlow: { value: 0 }, uPortal: { value: 0 }, uBlack: { value: 0 }, uAspect: { value: aspect },
      uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) }, uC: { value: new THREE.Color(c) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: PORTAL_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  return m;
}
const PORTAL_COLOURS = { bobo: [0xff9a3c, 0xffd28a, 0x6fb6ff], can: [0x4fc3ff, 0x8a1f6e, 0xff6ad5], old: [0xe2574a, 0xf4c5b2, 0x3a4ad0] };   // the cat's oranges and visor blue; the can's blue and magenta

// ---------------------------------------------------------------- sound (synthesised, no files)
const sound = {
  ctx: null, on: true,
  master: null,
  init() {
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)(); this.ctx.resume();
      if (!this.master) { this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination); }   // everything plays through here, so the recorder can listen in
    } catch (e) { /* no audio */ }
  },
  tone(f0, f1, dur, vol = 0.2, type = 'sine', when = 0) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime + when; const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master || this.ctx.destination); o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, vol, hp, lp, when = 0) {
    if (!this.ctx || !this.on) return;
    const n = Math.floor(this.ctx.sampleRate * dur); const b = this.ctx.createBuffer(1, n, this.ctx.sampleRate); const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.6);
    const s = this.ctx.createBufferSource(); s.buffer = b; const g = this.ctx.createGain(); g.gain.value = vol;
    const f1 = this.ctx.createBiquadFilter(); f1.type = 'highpass'; f1.frequency.value = hp;
    const f2 = this.ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = lp;
    s.connect(f1).connect(f2).connect(g).connect(this.master || this.ctx.destination); s.start(this.ctx.currentTime + when);
  },
  scan() { this.tone(500, 1500, 0.6, 0.06, 'triangle'); },
  rumble(d = 1.7) { this.tone(46, 96, d, 0.3, 'sawtooth'); this.tone(69, 150, d, 0.12, 'square'); this.noise(d, 0.05, 60, 420); this.tone(300, 2400, d * 0.92, 0.05, 'triangle', d * 0.08); },
  blip(n) { const f = 420 * Math.pow(1.09, n); this.tone(f, f * 1.9, 0.11, 0.13); },
  fanfare() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, f, 0.32, 0.12, 'triangle', i * 0.11)); this.noise(1.8, 0.11, 3500, 12000); },
  pop() { this.tone(260, 900, 0.16, 0.28); this.noise(0.12, 0.12, 900, 6000); },
  fizz() { this.noise(1.3, 0.09, 4500, 12000, 0.75); },
  land() { this.tone(180, 70, 0.18, 0.25); },
  bell() { for (const [f, w] of [[2093, 0], [2637, 0.09], [3136, 0.18]]) this.tone(f, f * 0.995, 0.5, 0.07, 'sine', w); },
  mew() { this.tone(620, 880, 0.14, 0.09, 'triangle'); this.tone(880, 560, 0.22, 0.09, 'triangle', 0.13); },
  whoosh() { this.noise(0.32, 0.07, 900, 5000); this.tone(320, 760, 0.28, 0.035); },
  chomp() { this.noise(0.05, 0.2, 400, 3000); this.noise(0.05, 0.17, 400, 3000, 0.13); this.tone(230, 150, 0.07, 0.1, 'square', 0.02); this.tone(220, 140, 0.07, 0.08, 'square', 0.15); },
  purr(d = 1.4) { const n = Math.round(d * 8); for (let i = 0; i < n; i++) { this.tone(54, 47, 0.1, 0.11, 'sawtooth', i * 0.12); this.noise(0.08, 0.025, 80, 300, i * 0.12); } },
  sparkle() { [1568, 2093, 2637, 3136, 3951, 4699].forEach((f, i) => this.tone(f, f * 1.01, 0.3, 0.045, 'sine', i * 0.055)); },
  shutter() { this.noise(0.05, 0.22, 2000, 9000); this.noise(0.07, 0.16, 1200, 6000, 0.08); },
};
const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* no haptics */ } };

// ---------------------------------------------------------------- UI
const ui = {
  hint(text) { const h = $('hint'); if (!text) { h.hidden = true; return; } if (h.textContent !== text) h.textContent = text; h.hidden = false; },
  guide(on) { $('guide').classList.toggle('on', on); },
  error(title, body, more = '') { $('err-title').textContent = title; $('err-body').textContent = body; $('err-more').textContent = more; $('err-more').hidden = !more; $('error').hidden = false; $('splash').hidden = true; $('err-retry').focus(); },
};

// ---------------------------------------------------------------- assets (loaded behind the splash)
const loader = new GLTFLoader();
const assets = Promise.all([
  loader.loadAsync(BASE + 'ar/bobo-keychain.glb'),
  loader.loadAsync(BASE + 'ar/eclipse-can.glb'),
  loader.loadAsync(BASE + 'ar/old-bobo.glb'),
  // layout.json, then the portal mask of each charm picture that has one (the whole acrylic piece)
  fetch(HERE + 'image-targets/layout.json').then((r) => r.json()).then(async (layout) => {
    layout.masks = {};
    layout.probes = await fetch(HERE + 'image-targets/probe.json').then((r) => r.json()).catch(() => null);   // for telling a charm's two sides apart
    await Promise.all(Object.entries(layout.targets).filter(([, t]) => t.mask).map(([n, t]) => new THREE.TextureLoader().loadAsync(HERE + 'image-targets/' + t.mask.src)
      .then((tex) => { tex.flipY = false; layout.masks[n] = tex; }).catch(() => { /* falls back to the model's silhouette */ })));   // flipY off: the glTF uv convention, like the models' own masks
    return layout;
  }),
  ...['kc-both', 'kc-bobo', 'kc-can', 'kc-can-art', 'kc-can-back', 'kc-old', 'kc-bobo-l', 'kc-old-l'].map((n) => fetch(HERE + `image-targets/${n}.json`).then((r) => r.json())),
]);
const xrReady = new Promise((res) => (window.XR8 ? res() : window.addEventListener('xrloaded', () => res(), { once: true })));
let loaded = false;
Promise.all([assets, xrReady]).then(() => { loaded = true; $('b-start').disabled = false; $('b-start').textContent = 'Start'; $('load').hidden = true; })
  .catch((e) => { console.error(e); ui.error('Could not load the experience', 'Check your connection and reload the page.'); });

// ---------------------------------------------------------------- gravity (so the characters stand upright)
// devicemotion gives gravity in screen axes (x right, y up, z out of the screen), which are the camera's
// axes too. Android and iOS disagree on the sign, so pick the sign that points "up" for a phone held
// in front of you or tilted down at a table.
const gravity = { up: null, t: 0 };
function onMotion(e) {
  const a = e.accelerationIncludingGravity; if (!a || a.x == null) return;
  let x = a.x, y = a.y, z = a.z;
  const ang = (screen.orientation && screen.orientation.angle) || 0;
  if (ang === 90) [x, y] = [-y, x]; else if (ang === 270 || ang === -90) [x, y] = [y, -x]; else if (ang === 180) [x, y] = [-x, -y];
  const v = new THREE.Vector3(x, y, z); if (v.lengthSq() < 1) return; v.normalize();
  if (v.y + v.z < 0) v.negate();
  if (!gravity.up) gravity.up = v; else gravity.up.lerp(v, 0.15).normalize();
  gravity.t = performance.now();
}
async function askMotion() {
  try {
    if (typeof DeviceMotionEvent !== 'undefined' && DeviceMotionEvent.requestPermission) {
      const r = await DeviceMotionEvent.requestPermission(); motionPerm = r;
      if (r !== 'granted') return;
    }
    window.addEventListener('devicemotion', onMotion);
  } catch (e) { motionPerm = 'error:' + (e && e.name); /* stay in keychain-relative mode */ }
}
let motionPerm = 'not asked';

// ---------------------------------------------------------------- scene state
let scene, camera, renderer;
const TS = {};               // per image target: raw pose from the engine + a smoothed group
const charm = {};            // per charm: a group in world space = that charm's frame (metres). Everything of that character lives in it.
const pres = { bobo: false, can: false }, goneFor = { bobo: 9, can: 9 }, driver = { bobo: null, can: null };
let present = false;         // is any charm in view right now
const bubbles = []; let taps = 0, tapIdle = 0, finaleOn = false;
let B, C, Bcat, Bold, ALL = [];   // B is whichever Bobo is in play: the cat (Bcat) or the earlier design's blocky Bobo (Bold)
const tweens = [];
// A tween can belong to one or more characters: it only runs while all of them are in view, so a pop-out
// never plays out (or makes its sounds) while its charm is off screen; it carries on when the charm is back.
const tween = (dur, fn, done, owner) => tweens.push({ t: 0, dur, fn, done, owner: owner ? [].concat(owner) : null });
const after = (delay, fn, owner) => tween(delay, () => {}, fn, owner);
const inView = (ch) => pres[ch.key] && (ch === B || ch === C);
let state = 'idle';          // idle -> looking -> popping -> ready/walking: a summary of the two characters, for the UI
let shots = 0, hinted = false;

function sprite(tex, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  s.scale.setScalar(size); s.renderOrder = 20; return s;
}
function pad(r) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.CircleGeometry(r, 64), new THREE.MeshBasicMaterial({ map: padTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const sh = new THREE.Mesh(new THREE.CircleGeometry(r * 0.8, 48), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  ring.rotation.x = sh.rotation.x = -Math.PI / 2; sh.position.y = 0.0004;
  g.add(sh, ring); g.userData.ring = ring; g.visible = false; return g;
}

// The cat model does not sit centred on the outline baked into its GLB: measured by rendering the model straight
// on in its keychain pose and matching it to that outline (and to the charm art: eyes, visor and collar line up),
// it needs moving 8.6% of the charm's width to the art's right, 2.1% down, and shrinking to 92%. In the outline's
// own units (the quad is 1 x 1). Without this it sat to one side of the print, and the charm's picture of the
// other side (mirrored) showed it to the right (Dapo, 2026-11-11). The can and the Roblox Bobo already match.
const MODEL_FIT = { bobo: { x: 0.0863, y: -0.0213, s: 0.92 } };
// While a character is still on its charm it is pressed flat into the print, so it lines up with it from any
// angle (a full-depth model stands proud of the print and slides off it in perspective); it fills out to its
// full depth as it jumps.
const FLAT = 0.12;
// Landed size relative to the printed art. The Roblox Bobo read as too small next to its charm (Dapo, 2026-11-11):
// his print is mostly the raised arm and big head, and out of the charm he stands with his arms down.
const LAND_SCALE = { old: 1.15 };
const landScale = (ch) => LAND_SCALE[ch.kind] || 1;
function prepCharacter(gltf, key, padR, kind = key) {
  const def = CHARMS[kind], height = SIZE[kind];
  const frame = charm[key] = new THREE.Group(); frame.visible = false; scene.add(frame);
  if (DEBUG) {
    const fr = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(def.w, def.h)), new THREE.LineBasicMaterial({ color: key === 'bobo' ? 0x4fb4ff : 0xe85bd8, depthTest: false }));
    fr.renderOrder = 30; frame.add(fr);
  }
  const root = new THREE.Group(); const m = gltf.scene;
  // the silhouette quad comes off the model and is pinned to the charm frame
  const sil = m.getObjectByName('Silhouette'); sil.updateMatrix(); const silLocal = sil.matrix.clone(); sil.removeFromParent();
  // the silhouette that ships in the model is the mask by default; a charm picture with a mask of its own
  // (the whole acrylic piece) swaps that in while it is the one in view (useMask)
  const map = sil.material.map; map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping; map.needsUpdate = true;
  const own = { tex: bakeMask(map, def.w / def.h), w: def.w, h: def.h };
  sil.material = portalMaterial(own.tex, def.w / def.h, ...PORTAL_COLOURS[kind]);
  sil.renderOrder = 5; sil.visible = false;
  sil.position.set(0, 0, 0.0004); sil.quaternion.identity(); sil.scale.set(def.w, def.h, 1);
  frame.add(sil);
  const mixer = new THREE.AnimationMixer(m);
  const clips = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
  const rest = clips.Sit || clips.Idle; mixer.clipAction(rest).play(); mixer.setTime(0); m.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(m, true); const h = box.max.y - box.min.y; mixer.stopAllAction();
  const baseScale = height / h; m.scale.setScalar(baseScale);
  m.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  root.add(m); root.visible = false; frame.add(root);
  // where the model lies exactly over its print, in the charm frame (a constant)
  const fit = MODEL_FIT[kind] || { x: 0, y: 0, s: 1 };
  const lie = new THREE.Matrix4().makeScale(def.w, def.h, 1).multiply(new THREE.Matrix4().makeTranslation(fit.x, fit.y, 0)).multiply(new THREE.Matrix4().makeScale(fit.s, fit.s, fit.s))
    .multiply(new THREE.Matrix4().makeScale(baseScale, baseScale, baseScale).multiply(silLocal).invert());
  const lp = new THREE.Vector3(), lq = new THREE.Quaternion(), ls = new THREE.Vector3(); lie.decompose(lp, lq, ls);
  lp.addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(lq), 0.0025);
  const pd = pad(padR), flash = sprite(glowTex, 0.001);
  const scan = new THREE.Mesh(new THREE.PlaneGeometry(def.w * 0.96, 0.0018), new THREE.MeshBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
  scan.position.z = 0.001;
  const N = 70, geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  const sparks = new THREE.Points(geo, new THREE.PointsMaterial({ map: sparkTex, size: 0.007, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, sizeAttenuation: true }));
  sparks.frustumCulled = false; sparks.userData = { vel: new Float32Array(N * 3), life: new Float32Array(N), next: 0 };
  // a soft shadow on the print under the hovering character, and a golden aura for Super Bobo
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, depthTest: false, opacity: 0 }));
  shadow.renderOrder = 6; shadow.visible = false;
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: auraTex, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, opacity: 0 }));
  aura.renderOrder = 8; aura.visible = false;                              // drawn behind him (depth tested), between him and the print
  frame.add(pd, flash, scan, sparks, shadow, aura);
  const head = m.getObjectByName('CatHead') || m.getObjectByName('Head') || null;   // Bobo watches the phone
  return { key, kind, def, frame, root, model: m, mixer, clips, current: null, baseScale, height, sil, lie: { pos: lp, quat: lq, s: ls.y },
    masks: { own }, maskOn: 'own', fx: { glow: 0, portal: 0, black: 0, shake: 0 }, G: { q: new THREE.Quaternion(), flat: 0 }, pad: pd, flash, scan, sparks,
    visor: kind === 'bobo' ? visorFlip(m) : null, mirrored: false,
    st: 'idle', steady: 0, landed: false, sils: true, shadow, aura, head, headRest: null, lookW: 0, lookDir: null, boost: 1, super: null };
}

function play(ch, name, { loop = true, fade = 0.25, onDone } = {}) {
  const clip = ch.clips[name]; if (!clip) return;
  const next = ch.mixer.clipAction(clip);
  next.reset(); next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
  next.clampWhenFinished = !loop; next.enabled = true; next.setEffectiveWeight(1);
  if (ch.current && ch.current !== next && fade > 0) next.crossFadeFrom(ch.current, fade, false);
  else if (ch.current && ch.current !== next) ch.current.stop();
  next.play(); ch.current = next;
  if (onDone) {
    const h = (e) => { if (e.action === next) { ch.mixer.removeEventListener('finished', h); onDone(); } };
    ch.mixer.addEventListener('finished', h);
  }
}

function buildScene(xr, [bobo, can, oldBobo, layout, ...targets]) {
  ({ scene, camera, renderer } = xr); probes = layout.probes;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.6;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x554a66, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(1.5, 3, 4); scene.add(key);
  camera.position.set(0, 0, 0); camera.quaternion.identity();
  XR8.XrController.updateCameraProjectionMatrix({ origin: camera.position, facing: camera.quaternion });

  for (const target of targets) {
    const lay = layout.targets[target.name]; const local = {};
    // "mirror": the picture shows the charm's other side, whose outline is the artwork's mirrored
    // s: the artwork frame's scale in a photo-based picture (the character fitted to the real print, fit_print.py)
    for (const [k, c] of Object.entries(lay.charms)) { const sc = c.s || 1; local[k] = new THREE.Matrix4().makeTranslation(c.x, c.y, 0).multiply(new THREE.Matrix4().makeRotationZ(c.rz)).multiply(new THREE.Matrix4().makeScale(c.mirror ? -sc : sc, sc, sc)); }
    TS[target.name] = { name: target.name, pr: target.properties, lay, local, tracked: false, at: 0, seen: -1e9, p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1, snap: true, g: new THREE.Group() };
  }
  Bcat = B = prepCharacter(bobo, 'bobo', 0.03);
  Bold = prepCharacter(oldBobo, 'bobo', 0.03, 'old');   // the earlier design's Bobo takes the Bobo slot when its charm is the one in view
  ALL = [Bcat, Bold, C = prepCharacter(can, 'can', 0.02)];
  // each charm picture with its own portal mask (the whole acrylic piece): baked once, swapped in by useMask
  for (const ch of [Bcat, Bold, C]) for (const t of Object.values(TS)) {
    const mk = t.lay.mask, tex = layout.masks[t.name];
    if (mk && tex && t.lay.charms[ch.key] && (ch === Bold) === t.name.startsWith('kc-old')) { tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; ch.masks[t.name] = { tex: bakeMask(tex, mk.widthM / mk.heightM), w: mk.widthM, h: mk.heightM }; }
  }
  for (let i = 0; i < 90; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTex, transparent: true, depthWrite: false, depthTest: false }));
    sp.visible = false; sp.renderOrder = 25; B.frame.add(sp); bubbles.push({ sp, life: 0, max: 1, vel: new THREE.Vector3(), size: 0.01, ph: 0 });
  }
}

function burst(ch, at, n = 40, speed = 0.16) {
  const pos = ch.sparks.geometry.attributes.position; const u = ch.sparks.userData;
  for (let i = 0; i < n; i++) {
    const j = u.next; u.next = (u.next + 1) % u.life.length;
    const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * Math.PI * 0.8, s = speed * (0.4 + Math.random());
    pos.setXYZ(j, at.x, at.y, at.z);
    u.vel[j * 3] = Math.cos(a) * Math.cos(e) * s; u.vel[j * 3 + 1] = Math.sin(e) * s + 0.05; u.vel[j * 3 + 2] = Math.sin(a) * Math.cos(e) * s * 0.6 + 0.04;
    u.life[j] = 0.7 + Math.random() * 0.6;
  }
  pos.needsUpdate = true;
}

// ---------------------------------------------------------------- tracking -> charm frames
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
function onTarget(d) {
  const t = TS[d.name]; if (!t) return;
  const upp = d.scale * (d.scaledHeight || 1) / t.pr.height;               // world units per target pixel
  t.q.set(d.rotation.x, d.rotation.y, d.rotation.z, d.rotation.w);
  t.p.set(d.position.x, d.position.y, d.position.z);                       // centre of the target picture
  t.s = t.pr.height * upp / t.lay.heightM;                                 // world units per metre
  t.upp = upp;
  if (!t.tracked) { t.snap = true; t.foundAt = performance.now(); if (camera) noteFound(t, measure(t)); } else if (camera && Math.random() < 0.1) measure(t);
  t.tracked = true; t.at = performance.now();
}
function onLost(d) { const t = TS[d.name]; if (t) { t.tracked = false; noteLost(d.name); } }

// Stick to the print: follow real movement at once, and only smooth out the sub-millimetre jitter of a
// charm that is being held still (any lag here shows up as the 3D sliding off the print).
function follow(t) {
  const g = t.g, clamp = THREE.MathUtils.clamp;
  const aP = t.snap ? 1 : clamp(g.position.distanceTo(t.p) / t.s / 0.0025, 0.3, 1);
  const aR = t.snap ? 1 : clamp(g.quaternion.angleTo(t.q) / 0.04, 0.3, 1);
  const aS = t.snap ? 1 : clamp(Math.abs(g.scale.x - t.s) / t.s / 0.03, 0.3, 1);
  t.snap = false;
  g.position.lerp(t.p, aP); g.quaternion.slerp(t.q, aR); g.scale.setScalar(THREE.MathUtils.lerp(g.scale.x, t.s, aS));
  g.updateMatrix();
}
// ground frame of a character, in its charm frame: up from gravity when the phone reports it, else the top
// of the screen; "forward" is toward the viewer along the ground (looking straight down: the bottom of the screen)
function groundFrame(ch) {
  const f0 = ch.frame;
  const toFrame = _q.copy(f0.quaternion).invert().multiply(camera.quaternion);       // camera space -> charm space
  const up = new THREE.Vector3(0, 1, 0);
  if (gravity.up && performance.now() - gravity.t < 1500) up.copy(gravity.up);
  const sx = Math.sign(f0.scale.x) || 1;                                          // a mirrored charm frame (the charm's other side)
  up.applyQuaternion(toFrame); up.x *= sx; up.normalize();
  const camL = f0.worldToLocal(_v.copy(camera.position)).normalize();
  const scrDown = new THREE.Vector3(0, -1, 0).applyQuaternion(toFrame); scrDown.x *= sx;
  const f = camL.clone().addScaledVector(up, -camL.dot(up)).add(scrDown.addScaledVector(up, -scrDown.dot(up)).multiplyScalar(0.6));
  if (f.lengthSq() < 1e-8) f.set(0, 0, 1); f.normalize();
  const r = new THREE.Vector3().crossVectors(up, f).normalize();
  ch.G.q.setFromRotationMatrix(_m.makeBasis(r, up, f)); ch.G.flat = Math.min(Math.abs(up.z) * 1.25, 1);
}
// Which image target places each charm this frame. Each charm runs from its own picture only: kc-bobo (or
// kc-old, the earlier design's Bobo) and kc-can (a photo of the real can charm, which is the same on both
// keychain designs). So a charm can never show up for the other one.
// With ?pair=1 the pair picture is loaded as well. It also locks onto a single charm (half of it is enough),
// so a charm still only counts once its own picture has been seen; with both confirmed the pair picture
// places them, as long as it agrees with each charm's own picture (charms held apart do not), and when only
// the pair picture holds (too far for the single ones) it is taken as both after a moment. It is not
// believed for a few seconds after the earlier design's Bobo was seen (its can matches the pair picture).
const PAIR = params.get('pair') === '1';   // the combined version: the pair picture is loaded too and the two pop as one sequence. Off by default (Dapo, 2026-11-11): each charm runs only from its own picture, so one never shows up for the other.
const conf = { bobo: false, can: false };
let bothFor = 0, noneFor = 0, pairMaybe = false, pairOff = 0;

// ---------------------------------------------------------------- which side of a two-sided charm is in view
// Cat Bobo and Roblox Bobo each have a picture of both sides: the print, and the print seen through the clear
// acrylic (its mirror image). Their faces are nearly symmetric, so both pictures often lock onto the same charm
// (Dapo's phone log, 2026-11-11: kc-bobo and kc-bobo-l found 0.6 s apart on one charm), and taking the one
// found first could bring Bobo out mirrored. So the camera picture decides. Under each tracked picture's pose,
// the camera image (small and blurred, so a pose that is a little off still lines up) is compared with that
// picture and with the picture mirrored about the character's own middle (probe.json). Where the picture wins,
// that side is in view; where its mirror wins, the other side is. Before he pops a small lead is enough; once
// he is out it takes a clear one to turn him round.
const SIDES = { cat: ['kc-bobo', 'kc-bobo-l'], old: ['kc-old', 'kc-old-l'] };
const sideOf = { cat: null, old: null }, sideLead = { cat: 0, old: 0 }, sideLast = {};
let probes = null, sampler = null;
const _pv = new THREE.Vector3();
function camLuma() {
  const v = engineVideo(); if (!v || !v.videoWidth) return null;
  const k = 160 / Math.max(v.videoWidth, v.videoHeight), w = Math.round(v.videoWidth * k), h = Math.round(v.videoHeight * k);
  if (!sampler) { const c = document.createElement('canvas'); sampler = { c, g: c.getContext('2d', { willReadFrequently: true }) }; }
  if (sampler.c.width !== w || sampler.c.height !== h) { sampler.c.width = w; sampler.c.height = h; }
  sampler.g.drawImage(v, 0, 0, w, h);
  const d = sampler.g.getImageData(0, 0, w, h).data; let L = new Float32Array(w * h), T = new Float32Array(w * h);
  for (let i = 0; i < L.length; i++) L[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  for (let pass = 0; pass < 2; pass++) {                                  // a small blur: 3x3 box, twice
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; T[i] = (L[i - (x > 0)] + L[i] + L[i + (x < w - 1)]) / 3; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; L[i] = (T[i - (y > 0) * w] + T[i] + T[i + (y < h - 1) * w]) / 3; }
  }
  return { L, w, h, vw: v.videoWidth, vh: v.videoHeight };
}
// > 0: the camera matches this picture better than its mirror image (this side is in view); < 0: the other side
function sideScore(t, cam) {
  const pb = probes && probes[t.name]; if (!pb || !t.upp) return null;
  const cw = canvas.clientWidth, chh = canvas.clientHeight;
  const sc = Math.max(cw / cam.vw, chh / cam.vh), hw = cw / sc / 2, hh = chh / sc / 2;   // the part of the video the screen shows (cover)
  const W = t.pr.width * t.upp, H = t.pr.height * t.upp, k = cam.w / cam.vw;
  const S = [0, 0, 0, 0, 0], M = [0, 0, 0, 0, 0];                       // sums for two correlations: n, a, b, aa, bb, ab (n shared)
  let n = 0, sb = 0, sbb = 0;
  const acc = (o, a, b) => { o[0] += a; o[1] += a * a; o[2] += a * b; };
  for (let r = 0; r < pb.rows; r++) for (let c = 0; c < pb.cols; c++) {
    const cm = Math.floor((2 * pb.axis - (c + 0.5) / pb.cols) * pb.cols); if (cm < 0 || cm >= pb.cols) continue;
    _pv.set(((c + 0.5) / pb.cols - 0.5) * W, (0.5 - (r + 0.5) / pb.rows) * H, 0).applyQuaternion(t.q).add(t.p).project(camera);
    const x = (cam.vw / 2 + _pv.x * hw) * k, y = (cam.vh / 2 - _pv.y * hh) * k;
    if (!(x >= 0 && y >= 0 && x < cam.w - 1 && y < cam.h - 1)) continue;
    const b = cam.L[(y | 0) * cam.w + (x | 0)];
    n++; sb += b; sbb += b * b; acc(S, pb.lum[r * pb.cols + c], b); acc(M, pb.lum[r * pb.cols + cm], b);
  }
  if (n < 60) return null;
  const vb = sbb - sb * sb / n; if (vb <= 0) return null;
  const corr = (o) => { const va = o[1] - o[0] * o[0] / n; return va > 0 ? (o[2] - o[0] * sb / n) / Math.sqrt(va * vb) : 0; };
  return corr(S) - corr(M);
}
function pickSides(on, now) {
  let cam;
  for (const key of ['cat', 'old']) {
    const [na, nb] = SIDES[key], A = on(na), Bb = on(nb), ch = key === 'cat' ? Bcat : Bold;
    let cur = sideOf[key];
    if (cur && !on(cur) && (now - TS[cur].seen > 700 || on(cur === na ? nb : na))) cur = null;   // gone: the other side (if it is there) takes over
    if (!A && !Bb) { sideLead[key] = 0; sideOf[key] = cur; continue; }
    if (!cur) cur = A && Bb ? (A.foundAt <= Bb.foundAt ? na : nb) : A ? na : nb;          // for now: the one found first
    if (now - (sideLast[key] ? sideLast[key].at : 0) > 120) {
      if (cam === undefined) cam = camLuma();
      const a = cam && A ? sideScore(A, cam) : null, b = cam && Bb ? sideScore(Bb, cam) : null;
      sideLast[key] = { at: now, a, b };
      if (a != null || b != null) sideLead[key] = sideLead[key] * 0.7 + ((a || 0) - (b || 0)) * 0.3;
    }
    let want = cur;
    if (A && Bb) { const need = ch.st === 'idle' ? 0.05 : 0.2, lead = sideLead[key]; want = lead > need ? na : lead < -need ? nb : cur; }
    if (want !== sideOf[key] && sideOf[key] && camStartAt) { diag.events.push({ t: +((now - camStartAt) / 1000).toFixed(1), n: want, e: 'side', lead: +sideLead[key].toFixed(3) }); if (diag.events.length > 300) diag.events.shift(); }
    sideOf[key] = want;
  }
}
const _v2 = new THREE.Vector3();
function updateFrames(dt) {
  const now = performance.now();
  for (const t of Object.values(TS)) { if (t.tracked && now - t.at > 500) t.tracked = false; if (t.tracked) { follow(t); t.seen = now; tDiag(t.name).trackedS = +(tDiag(t.name).trackedS + dt).toFixed(2); } }
  const on = (n) => (TS[n] && TS[n].tracked ? TS[n] : null), recent = (n, ms) => !!TS[n] && now - TS[n].seen < ms;
  const oldRecent = recent('kc-old', 5000) || recent('kc-old-l', 5000);
  const both = !PAIR || oldRecent ? null : on('kc-both'); pairMaybe = !!both;
  const canT = on('kc-can') || on('kc-can-back') || on('kc-can-art');        // the photo of the real can charm, its QR side, then the flat art
  // the cat charm (and the Roblox Bobo charm) from either side: the print seen through the clear acrylic is
  // mirrored (tail right on kc-bobo, tail left on kc-bobo-l); each picture's charm frame carries the matching
  // flip, so the 3D Bobo follows it. pickSides decides which side is really in view.
  pickSides(on, now);
  const catT = sideOf.cat ? on(sideOf.cat) : null, catRecent = (ms) => recent('kc-bobo', ms) || recent('kc-bobo-l', ms);
  const oldT = sideOf.old ? on(sideOf.old) : null;
  if (catT) conf.bobo = true; if (canT) conf.can = true;
  // one charm's own picture is in view and the other's has not been for a while: the other charm has left
  if (conf.bobo && canT && !catRecent(1500)) conf.bobo = false;
  if (conf.can && catT && !recent('kc-can', 1500) && !recent('kc-can-back', 1500) && !recent('kc-can-art', 1500)) conf.can = false;
  bothFor = both ? bothFor + dt : 0;
  if (bothFor > 1.5 && !conf.bobo && !conf.can) conf.bobo = conf.can = true;
  noneFor = Object.values(TS).some((t) => t.tracked) ? 0 : noneFor + dt; if (noneFor > 1) conf.bobo = conf.can = false;
  // the pair picture only places the charms while it agrees with each charm's own picture: two charms held
  // apart (not hanging together) still match it, but then it would put one of them in the wrong place
  let agree = true;
  if (both) for (const [k, n] of [['bobo', 'kc-bobo'], ['can', 'kc-can']]) {
    const t = on(n) || (k === 'can' ? canT : null); if (!t) continue;
    const a = _v.setFromMatrixPosition(_m.copy(both.g.matrix).multiply(both.local[k])), b = _v2.setFromMatrixPosition(_m.copy(t.g.matrix).multiply(t.local[k]));
    a.sub(camera.position); b.sub(camera.position);                          // compare where they appear, not how far away: the two pictures' depth estimates differ a little
    if (a.angleTo(b) * b.length() / t.s > 0.008) agree = false;
  }
  pairOff = agree ? Math.max(pairOff - dt, 0) : 0.6;                        // stay off it for a moment after a disagreement, so it does not flip back and forth
  const pair = conf.bobo && conf.can && pairOff === 0 ? both : null;
  // which Bobo is in play: it follows the charm in view, but never changes under a Bobo that is on screen
  const want = oldT && !catT ? Bold : catT && !oldT ? Bcat : B;
  if (want !== B && !pres.bobo) { B.frame.visible = false; B = want; driver.bobo = null; goneFor.bobo = 9; }
  const pick = !PAIR ? { bobo: B === Bold ? oldT : catT, can: canT } : {
    bobo: B === Bold ? oldT : conf.bobo ? pair || catT || (pairOff === 0 ? both : null) : null,
    can: conf.can ? pair || canT || (pairOff === 0 ? both : null) : null,
  };
  present = false;
  for (const ch of [B, C]) {
    const k = ch.key, t = pick[k], f = ch.frame;
    if (t) {
      _m.copy(t.g.matrix).multiply(t.local[k]).decompose(f.position, f.quaternion, f.scale);
      driver[k] = t; goneFor[k] = 0;
    } else { goneFor[k] += dt; if (goneFor[k] > 0.25) driver[k] = null; }
    pres[k] = !!t || (pres[k] && goneFor[k] < 0.25);                       // nothing is drawn unless it is tracked now (short grace against flicker)
    f.visible = pres[k]; f.updateMatrixWorld(true); present = present || pres[k];
    if (t) { useMask(ch, t); sideFix(ch, t); }
    if (t && ch.st === 'idle') { groundFrame(ch); ch.sils = t.lay.silhouettes; }   // once it pops, its ground frame is fixed to the charm
  }
}
// A target's own mask is drawn in that target's picture (centred, never mirrored), so in the charm frame it
// sits at (charm frame in the picture)^-1: this undoes the fit and the mirror, and the mask lies exactly on
// the acrylic in the picture whatever the 3D character's frame is.
// A charm picture of the other side flips the charm frame, and the 3D character with it. Two things must not
// read as a mirror image: the can, which instead turns round to show its back (the QR side, as on that
// picture: flipping its depth as well makes the whole thing a half turn), and the BOBO on the cat's visor,
// which is swapped for a copy of the head texture with the lettering flipped back (and Roblox Bobo's cap text).
function sideFix(ch, t) {
  const c = t.lay.charms[ch.key], mir = !!(c && c.mirror);
  if (ch.mirrored === mir) return; ch.mirrored = mir;
  if (ch.kind === 'can') ch.model.scale.z = Math.abs(ch.model.scale.z) * (mir ? -1 : 1);
  if (ch.visor) { ch.visor.mat.map = mir ? ch.visor.flipped : ch.visor.plain; ch.visor.mat.needsUpdate = true; }
  const cap = ch.model.getObjectByName('CapText');                          // Roblox Bobo's BOBO is its own little mesh: turn it to read the right way round
  if (cap) cap.scale.x = Math.abs(cap.scale.x) * (mir ? -1 : 1);
}
const VISOR_TEXT = [60, 150, 205, 490];   // the BOBO lettering in the cat's 2048 px head texture (x0, y0, x1, y1); it reads top to bottom
function visorFlip(m) {
  let mat = null; m.traverse((o) => { if (o.isMesh) for (const x of [].concat(o.material)) if (x.name === 'Bobo_Head') mat = x; });
  const tex = mat && mat.map, img = tex && tex.image; if (!img || !img.width) return null;
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const k = img.width / 2048, [x0, y0, x1, y1] = VISOR_TEXT.map((v) => Math.round(v * k));
  const part = g.getImageData(x0, y0, x1 - x0, y1 - y0), w = x1 - x0, h = y1 - y0, out = g.createImageData(w, h);
  for (let y = 0; y < h; y++) out.data.set(part.data.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  g.putImageData(out, x0, y0);
  const t = new THREE.CanvasTexture(c); t.flipY = tex.flipY; t.colorSpace = tex.colorSpace; t.wrapS = tex.wrapS; t.wrapT = tex.wrapT; t.channel = tex.channel;
  t.minFilter = tex.minFilter; t.magFilter = tex.magFilter; t.anisotropy = tex.anisotropy;
  return { mat, plain: tex, flipped: t };
}
const _mm = new THREE.Matrix4();
function useMask(ch, t) {
  const want = ch.masks[t.name] ? t.name : 'own'; if (ch.maskOn === want) return;
  const m = ch.masks[want], u = ch.sil.material.uniforms, sil = ch.sil; ch.maskOn = want;
  u.map.value = m.tex; u.uAspect.value = m.w / m.h;
  if (want === 'own') { sil.position.set(0, 0, 0.0004); sil.quaternion.identity(); sil.scale.set(m.w, m.h, 1); return; }
  _mm.copy(t.local[ch.key]).invert().multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.0004)).multiply(new THREE.Matrix4().makeScale(m.w, m.h, 1));
  _mm.decompose(sil.position, sil.quaternion, sil.scale);
}
const SPOTS = {
  bobo: (flat) => new THREE.Vector3(-0.004 - HALF_GAP * (tune.gap - 1), -0.066 * (1 - flat), 0.012 + 0.06 * flat),
  can: (flat) => new THREE.Vector3(-0.003 + HALF_GAP * (tune.gap - 1), -0.049 * (1 - flat), 0.022 + 0.06 * flat),
};
const groundSpot = (ch) => SPOTS[ch.key](ch.G.flat).applyQuaternion(ch.G.q);
// Where a character rests once it is out. By default it hovers just above its own print and faces the same
// way as the print (parallel to the charm), so it stays in view with the charm. Tilt turns it toward
// standing upright on the ground; Distance moves it from its print toward the standing spot beside the charm.
const restQ = (ch) => new THREE.Quaternion().slerpQuaternions(ch.lie.quat, ch.G.q, THREE.MathUtils.clamp(tune.tilt, 0, 1));
const spotOf = (ch) => new THREE.Vector3(ch.lie.pos.x, ch.lie.pos.y, ch.lie.pos.z + tune.hover).lerp(groundSpot(ch), THREE.MathUtils.clamp(tune.away, 0, 1));
const hopDir = (ch) => new THREE.Vector3(0, 0, 1).lerp(_v2.set(0, 1, 0).applyQuaternion(ch.G.q), THREE.MathUtils.clamp(tune.tilt, 0, 1)).normalize();

// ---------------------------------------------------------------- the pop-out
function resetScene() {
  tweens.length = 0; taps = 0; finaleOn = false; hinted = false; showFizz(); for (const b of bubbles) { b.life = 0; b.sp.visible = false; }
  fed = 0; fishBusy = false; closeBasket(); napping = false; idleT = 0; idleNext = 7; showFish(); for (const f of floaters) { f.life = 0; f.sp.visible = false; }
  for (const ch of ALL) {
    ch.mixer.stopAllAction(); ch.current = null; ch.root.visible = false; ch.landed = false; ch.st = 'idle'; ch.steady = 0; ch.spin = null; ch.walk = null; ch.go = null;
    ch.boost = 1; ch.super = null; ch.headRest = null; ch.lookW = 0; ch.shadow.visible = false; ch.aura.visible = false;
    ch.sil.visible = false; Object.assign(ch.fx, { glow: 0, portal: 0, black: 0, shake: 0 });
    ch.pad.visible = false; ch.flash.material.opacity = 0; ch.scan.material.opacity = 0; ch.sparks.userData.life.fill(0);
  }
}
// The build-up, for one charm or both: a border lights up around the cut-out, the mask rumbles, and it opens
// into a portal in that charm's colours. Then `go`. The earlier design has no masks: it gets a quick scan.
function charge(chs, go) {
  ui.hint(''); ui.guide(false);
  for (const ch of chs) { ch.st = 'charging'; ch.sil.visible = ch.sils; }
  const masked = chs.filter((ch) => ch.sils);
  if (masked.length) {
    const dur = Math.max(tune.portal, 0.2);
    sound.rumble(dur); try { navigator.vibrate && navigator.vibrate([70, 50, 70, 50, 90, 40, 160].map((x) => Math.round(x * dur / 1.7))); } catch (e) { /* no haptics */ }
    tween(dur, (k) => {
      for (const ch of masked) {
        ch.fx.glow = easeOut(k * 2.2) * (0.8 + 0.35 * k);
        ch.fx.portal = easeInOut((k - 0.22) / 0.55);
        ch.fx.shake = reduceMotion ? 0 : easeInOut(k * 1.5) * (0.4 + 0.9 * k);
      }
      for (const ch of chs) if (!ch.sils) { ch.scan.position.y = THREE.MathUtils.lerp(0.5, -0.5, (k * 3) % 1) * ch.def.h; ch.scan.material.opacity = Math.sin(k * Math.PI) * 0.9; }
    }, () => { for (const ch of chs) ch.scan.material.opacity = 0; go(); }, chs);
  } else {
    const dur = Math.max(tune.portal, 0.2), sweeps = Math.max(1, Math.round(dur / 0.75));   // the earlier design: scan lines for as long as the portal would take
    sound.scan();
    tween(dur, (k) => {
      for (const ch of chs) { ch.scan.position.y = THREE.MathUtils.lerp(0.5, -0.5, Math.min(k * sweeps, sweeps - 1e-4) % 1) * ch.def.h; ch.scan.material.opacity = Math.sin(k * Math.PI) * 0.9; }
    }, () => { for (const ch of chs) ch.scan.material.opacity = 0; go(); }, chs);
  }
}
const startPair = () => charge([C, B], () => { launch(C); after(Math.max(tune.stagger, 0.01), () => launch(B), B); });   // the can pops first, then Bobo
const startSolo = (ch) => { diag.pops.push({ t: camStartAt ? +((performance.now() - camStartAt) / 1000).toFixed(1) : null, who: ch.kind }); charge([ch], () => launch(ch)); };
// Once a character is out, the portal keeps swirling on its charm instead of turning black (Dapo, 2026-11-11).
// It costs little: the quad only covers the charm, the halo is baked, and nothing is drawn when the charm is out of view.
const PORTAL_REST = 1, GLOW_REST = 0.55;
// push the mask state into the shader
let fxTime = 0;
function updateMasks(dt) {
  fxTime += dt;
  for (const ch of ALL) {
    const u = ch.sil.material.uniforms, fx = ch.fx;
    // the build-up throbs in light rather than shaking the mask about: a jittering quad read as the whole
    // picture shaking on iPhone (Dapo, 2026-11-11)
    const throb = 1 + Math.min(fx.shake, 1.5) * 0.35 * Math.sin(fxTime * 22.0);
    u.uTime.value = fxTime; u.uGlow.value = fx.glow * (0.86 + 0.14 * Math.sin(fxTime * 5.0)) * throb; u.uPortal.value = fx.portal; u.uBlack.value = fx.black;
  }
}
function launch(ch) {
  const isBobo = ch === B, pd = ch.pad, flash = ch.flash, G = ch.G;
  ch.root.visible = true; ch.st = 'flying';
  const fx = ch.fx, glow0 = fx.glow, portal0 = fx.portal;
  play(ch, 'PopOut', { loop: false, fade: 0, onDone: () => {
    if (isBobo) { if (ch.kind === 'bobo') { sound.bell(); sound.mew(); } play(B, 'TailWag', { loop: false, fade: 0.25, onDone: () => play(B, 'Sit', { fade: 0.3 }) }); }
    else play(ch, 'Idle', { fade: 0.3 });
  } });
  const pop = ch.current; pop.paused = true; const flyT = Math.max(tune.fly, 0.1); pop.setEffectiveTimeScale(THREE.MathUtils.clamp(1 / flyT, 0.4, 2.5));   // the pop-out clip keeps pace with the Jump time
  const place = (wig) => {
    ch.root.position.copy(ch.lie.pos); ch.root.quaternion.copy(ch.lie.quat); ch.root.scale.setScalar(ch.lie.s); ch.root.scale.z *= FLAT;
    if (wig) ch.root.rotateZ(wig);
  };
  place(0); ch.mixer.update(0);
  tween(reduceMotion ? 0.01 : 0.38, (kk) => {                             // a shiver, still stuck to the charm
    if (ch.sils) fx.black = Math.max(fx.black, Math.min(kk * 4, 1)); fx.shake = 1 + kk;
    place(Math.sin(kk * Math.PI * 5) * 0.05 * kk);
  }, () => {
    place(0); const from = ch.lie; pop.paused = false; if (ch.sils) fx.black = 1; fx.shake = 0;
    sound.pop(); if (!isBobo) sound.fizz();
    pd.visible = true; flash.position.copy(from.pos); burst(ch, from.pos, isBobo ? 50 : 34);
    tween(flyT, (kk) => {         // it flies to its spot; the silhouette stays
      const e = easeOut(kk); const to = spotOf(ch);
      ch.root.position.lerpVectors(from.pos, to, e).addScaledVector(hopDir(ch), Math.sin(kk * Math.PI) * 0.03);
      ch.root.quaternion.slerpQuaternions(from.quat, restQ(ch), easeOut(kk * 2));
      ch.root.scale.setScalar(THREE.MathUtils.lerp(from.s, tune.size * landScale(ch), e)); ch.root.scale.z *= THREE.MathUtils.lerp(FLAT, 1, easeOut(Math.min(kk * 2.5, 1)));
      fx.portal = THREE.MathUtils.lerp(portal0, PORTAL_REST, easeInOut(kk)); fx.glow = THREE.MathUtils.lerp(Math.max(glow0, 1) * (1 + 0.8 * Math.sin(Math.min(kk * 3, 1) * Math.PI)), GLOW_REST, easeInOut(kk));   // the portal stays open behind the character, its rim softly lit
      const f = Math.sin(Math.min(kk * 1.6, 1) * Math.PI);
      flash.scale.setScalar(0.09 * f + 0.0001); flash.material.opacity = f;
      pd.scale.setScalar((0.2 + 0.8 * easeOut(kk * 1.3)) * tune.size); pd.userData.ring.material.opacity = easeOut(kk);
    }, () => {
      ch.landed = true; ch.st = 'out'; sound.land(); burst(ch, spotOf(ch), 14, 0.07);
      if (!ch.seenOut) { ch.seenOut = true; postEvent('sighting', { charm: ch.kind }); }   // a keychain sighting for the Where is Bobo? globe (city level)
      if (!hinted) {
        hinted = true; const t = live(B) ? 'Feed Bobo a fish, or tap him to pet him' : 'Tap the can for bubbles. Keep tapping!';
        ui.hint(t); after(5, () => { if (!finaleOn && $('hint').textContent === t) ui.hint(''); });
      }
    }, ch);
  }, ch);
}
// ---------------------------------------------------------------- bubbles
// Every tap blows bubbles; each tap in a row makes more of them and bigger. The tenth tap is the overflow:
// the can rockets up spinning on a geyser of bubbles and Bobo cheers (Bobo alone gets the geyser himself).
const FINALE = 10;
let bubbleNext = 0;
const upVec = (ch) => new THREE.Vector3(0, 1, 0).applyQuaternion(restQ(ch));
const scaleOf = (ch) => tune.size * landScale(ch) * (ch.boost || 1);
const topOf = (ch) => ch.root.position.clone().addScaledVector(upVec(ch), ch.height * 0.95 * scaleOf(ch));
const live = (ch) => ch.landed && pres[ch.key];
function blow(ch, n, size, speed = 0.05, spread = 0.5) {
  const up = upVec(ch), at = topOf(ch);
  for (let i = 0; i < n; i++) {
    const b = bubbles[bubbleNext]; bubbleNext = (bubbleNext + 1) % bubbles.length;
    if (b.sp.parent !== ch.frame) ch.frame.add(b.sp);
    b.sp.position.copy(at); b.size = size * (0.55 + Math.random() * 0.9); b.max = b.life = 1.1 + Math.random() * 1.1; b.ph = Math.random() * 6.28;
    b.vel.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(speed * spread).addScaledVector(up, speed * (0.6 + Math.random() * 0.8));
    b.sp.visible = true;
  }
}
function updateBubbles(dt) {
  for (const b of bubbles) {
    if (b.life <= 0) continue; b.life -= dt;
    if (b.life <= 0) { b.sp.visible = false; continue; }
    const age = 1 - b.life / b.max; b.vel.multiplyScalar(1 - dt * 0.9);
    b.sp.position.addScaledVector(b.vel, dt); b.sp.position.x += Math.sin(b.ph + age * 9) * 0.004 * dt;
    const pop = Math.max((age - 0.88) / 0.12, 0);                          // swell and vanish at the end
    b.sp.scale.setScalar(b.size * (Math.min(age * 6, 1) * 0.6 + 0.4) * (1 + pop * 0.7)); b.sp.material.opacity = 1 - pop;
  }
}
function showFizz() { const f = $('fizz'); f.hidden = taps === 0; f.firstElementChild.style.width = (Math.min(taps, FINALE) / FINALE * 100) + '%'; f.setAttribute('aria-valuenow', String(taps)); }
function tapBubbles(ch) {
  if (!live(ch)) ch = ch === B ? C : B;
  if (finaleOn || !live(ch)) return;
  taps++; diag.taps++; tapIdle = 0; showFizz();
  if (taps >= FINALE) { finale(); return; }
  sound.blip(taps);
  blow(ch, 2 + taps * 2, 0.005 + taps * 0.0016, 0.04 + taps * 0.004);
}
function finale() {
  const src = live(C) ? C : B, MSG = src === C ? 'Eclipse overflow!' : 'Bubble storm!';
  finaleOn = true; sound.fanfare(); sound.bell(); ui.hint(MSG);
  if (src === C) C.spin = { k: 0, turns: 4, lift: 0.05 };
  if (live(B)) play(B, 'PawRaise', { loop: false, fade: 0.2, onDone: () => play(B, 'TailWag', { loop: false, fade: 0.2, onDone: () => play(B, 'Sit', { fade: 0.3 }) }) });
  burst(src, topOf(src), 60, 0.2); src.flash.position.copy(topOf(src));
  tween(2.4, (k) => {
    if (C.spin) C.spin.k = Math.min(k * 1.15, 1);
    if (k < 0.85) { blow(src, 2, 0.012 + Math.random() * 0.016, 0.13, 0.35); if (src === C && live(B) && Math.random() < 0.3) blow(B, 1, 0.012, 0.06); }
    const f = Math.sin(Math.min(k * 3, 1) * Math.PI); src.flash.scale.setScalar(0.06 * f + 0.0001); src.flash.material.opacity = f;
  }, () => {
    C.spin = null; burst(src, topOf(src), 40, 0.14); sound.land();
    after(1.4, () => { finaleOn = false; taps = 0; showFizz(); if ($('hint').textContent === MSG) ui.hint(''); });
  });
}

const boboFree = () => live(B) && !B.walk && !B.go;
function wave() { if (!boboFree()) return; wake(); sound.mew(); play(B, 'PawRaise', { loop: false, fade: 0.2, onDone: () => play(B, 'Sit', { fade: 0.3 }) }); }
function wag() { if (!boboFree()) return; wake(); sound.bell(); play(B, 'TailWag', { loop: false, fade: 0.2, onDone: () => play(B, 'Sit', { fade: 0.3 }) }); }
function walk() {
  if (!boboFree() || fishBusy || B.super) return; wake();
  play(B, 'ClassicWalk', { fade: 0.35 }); B.walk = { a: 0, turn: 0 };
  const who = B;
  tween(4.2, (k) => { who.walk.a = k * Math.PI * 2; who.walk.turn = who.walk.a + Math.PI / 2; }, () => {
    tween(0.4, (k) => { who.walk.turn = THREE.MathUtils.lerp(Math.PI / 2, 0, easeInOut(k)); who.walk.a = 0; }, () => { who.walk = null; play(who, 'Sit', { fade: 0.4 }); }, who);
  }, who);
}
function spinCan() { if (!live(C) || C.spin) return; sound.pop(); C.spin = { k: 0 }; tween(0.9, (k) => { if (C.spin) C.spin.k = k; }, () => { C.spin = null; }, C); }
function replay() { resetScene(); }

// ---------------------------------------------------------------- floaters: fish, hearts, Zzz (sprites in a charm frame)
const floaters = [];
function floater(ch, tex, at, { size = 0.008, life = 1.2, vel = null, rise = 0.03, spin = 0 } = {}) {
  let f = floaters.find((x) => x.life <= 0);
  if (!f) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false })); sp.renderOrder = 26; f = { sp, vel: new THREE.Vector3() }; floaters.push(f); }
  if (f.sp.parent !== ch.frame) ch.frame.add(f.sp);
  f.sp.material.map = tex; f.sp.material.needsUpdate = true; f.sp.material.rotation = 0;
  f.sp.position.copy(at); f.size = size; f.life = f.max = life; f.spin = spin; f.ph = Math.random() * 6.28; f.ch = ch; f.free = true;
  if (vel) f.vel.copy(vel); else f.vel.copy(upVec(ch)).multiplyScalar(rise).add(_v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() * 0.4).multiplyScalar(rise * 0.6));
  f.sp.visible = true; return f;
}
function updateFloaters(dt) {
  for (const f of floaters) {
    if (f.life <= 0) continue;
    if (!f.free) continue;                                                    // a thrown fish is moved by its own tween
    f.life -= dt; if (f.life <= 0) { f.sp.visible = false; continue; }
    const age = 1 - f.life / f.max;
    f.sp.position.addScaledVector(f.vel, dt); f.sp.position.addScaledVector(_v.set(1, 0, 0), Math.sin(f.ph + age * 8) * 0.004 * dt);
    f.sp.material.rotation = Math.sin(f.ph + age * 6) * 0.25 + f.spin * age;
    f.sp.scale.setScalar(f.size * (0.4 + 0.6 * easeOut(age * 4)));
    f.sp.material.opacity = Math.min(age * 8, 1) * (1 - Math.max((age - 0.7) / 0.3, 0));
  }
}
const hearts = (ch, n) => { for (let i = 0; i < n; i++) floater(ch, heartTex, topOf(ch).addScaledVector(upVec(ch), -0.01 * Math.random()), { size: 0.007 + Math.random() * 0.005, life: 1.3 + Math.random() * 0.7, rise: 0.035 }); };

// ---------------------------------------------------------------- feed Bobo
// Feed throws a fish from the phone to Bobo, who catches it and eats it. Three fish make Super Bobo:
// he spins up, grows, glows gold with hearts and sparkles all round him, then settles back down.
const FISH_GOAL = 3;
let fed = 0, fishBusy = false;
const mouthOf = (ch) => ch.root.position.clone().addScaledVector(upVec(ch), ch.height * (ch.kind === 'old' ? 0.78 : 0.62) * scaleOf(ch));
function showFish() { const m = $('fish-m'); if (!m) return; m.hidden = fed === 0; m.firstElementChild.style.width = (fed / FISH_GOAL * 100) + '%'; $('fish-n').textContent = `${fed} / ${FISH_GOAL}`; m.setAttribute('aria-valuenow', String(fed)); }
function feed() {
  if (!boboFree() || fishBusy || B.super) return;
  wake(); fishBusy = true; sound.whoosh(); buzz(12);
  const ch = B; ch.frame.updateMatrixWorld(true);
  const cam = ch.frame.worldToLocal(_v2.copy(camera.position)), mouth = mouthOf(ch);
  const from = mouth.clone().lerp(cam, 0.6).addScaledVector(upVec(ch), -0.05);   // from just below the phone
  const f = floater(ch, fishTex, from, { size: 0.016, life: 99 }); f.free = false; f.sp.material.opacity = 0;
  const ctrl = new THREE.Vector3(), p = new THREE.Vector3();
  tween(0.8, (k) => {
    const to = mouthOf(ch), e = easeInOut(k);
    ctrl.copy(from).lerp(to, 0.5).addScaledVector(upVec(ch), 0.06);
    p.copy(from).multiplyScalar((1 - e) * (1 - e)).addScaledVector(ctrl, 2 * (1 - e) * e).addScaledVector(to, e * e);
    f.sp.position.copy(p); f.sp.material.rotation = -k * 7; f.sp.material.opacity = Math.min(k * 6, 1);
    f.sp.scale.setScalar(0.016 * (1 - 0.45 * e));
  }, () => { f.life = 0; f.sp.visible = false; eat(); }, ch);
  if (ch.kind !== 'old') after(0.45, () => play(ch, 'PawRaise', { loop: false, fade: 0.15 }), ch);   // he reaches for it
}
function eat(walking = false) {
  const ch = B; if (!walking) fishBusy = false; fed++; showFish(); sound.chomp(); buzz([18, 40, 18]);
  burst(ch, mouthOf(ch), 16, 0.06); hearts(ch, 2 + fed);
  if (fed >= FISH_GOAL) { if (basketOn) closeBasket(); if (!walking) after(0.3, superBobo, ch); return; }
  ui.hint(fed === 1 ? 'Yum! Bobo wants more' : 'One more fish…');
  if (ch.kind !== 'old') sound.mew();
  if (!walking) play(ch, 'TailWag', { loop: false, fade: 0.2, onDone: () => play(ch, 'Sit', { fade: 0.3 }) });
}
// ---------------------------------------------------------------- fish basket: flick a fish to Bobo
// Feed opens a basket with a fish in it. Flick the fish up toward Bobo: where you aim decides where it lands.
// A fish that lands beside him, he walks over to and eats, then walks back to his spot; one that lands at
// his feet he just leans down for; a hard, straight flick at him he catches in mid-air. Always within his
// reach, so every flick gets eaten. Three fish make Super Bobo, as before.
let basketOn = false, flickBusy = false;
function openBasket() { if (!live(B) || B.super) return; wake(); basketOn = true; resetFishDrag(); ui.hint('Flick the fish up to Bobo'); }
function closeBasket() { basketOn = false; const t = 'Flick the fish up to Bobo'; if ($('hint').textContent === t) ui.hint(''); }
function resetFishDrag(delay = 0) {
  const el = $('fish-drag'); el.style.transition = 'none'; el.style.transform = 'translate(0,0) scale(.4)'; el.style.opacity = '0';
  setTimeout(() => { el.style.transition = 'transform .35s cubic-bezier(.2,.9,.25,1.3),opacity .2s'; el.style.transform = ''; el.style.opacity = '1'; }, 30 + delay);
}
// where a screen point is, in Bobo's charm frame, part of the way from the phone to him
function screenToFrame(ch, x, y, part) {
  const r = canvas.getBoundingClientRect(), ndc = new THREE.Vector3(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1, 0.5).unproject(camera);
  const bw = ch.root.getWorldPosition(new THREE.Vector3()), d = camera.position.distanceTo(bw);
  const p = camera.position.clone().add(ndc.sub(camera.position).normalize().multiplyScalar(d * part));
  return ch.frame.worldToLocal(p);
}
function flick(vx, vy, x, y) {
  const ch = B;
  if (!live(ch) || fishBusy || flickBusy || !boboFree() || ch.super) { ui.hint(ch.super ? 'Bobo is full!' : 'Bobo is still busy, try again in a moment'); resetFishDrag(); return; }
  wake(); fishBusy = flickBusy = true; sound.whoosh(); buzz(12);
  if (/^(Flick|Swipe) the fish/.test($('hint').textContent)) ui.hint('');
  ch.frame.updateMatrixWorld(true);
  const sz = tune.size * landScale(ch), up = Math.max(400, -vy);
  const side = THREE.MathUtils.clamp(vx / up, -1, 1), power = THREE.MathUtils.clamp((up - 500) / 1700, 0, 1);
  const catchIt = power > 0.8 && Math.abs(side) < 0.22;
  const Q = restQ(ch), base = spotOf(ch);
  // landing spot in his own ground frame: sideways from the aim, a little in front of him
  const dx = Math.abs(side) < 0.2 ? 0 : Math.sign(side) * (0.014 + 0.022 * Math.min((Math.abs(side) - 0.2) / 0.6, 1)) * sz;
  const off = new THREE.Vector3(dx, 0, 0.011 * sz), land = base.clone().add(off.clone().applyQuaternion(Q));
  const from = screenToFrame(ch, x, y, 0.32);
  const to = catchIt ? mouthOf(ch) : land;
  const f = floater(ch, fishTex, from, { size: 0.016, life: 99 }); f.free = false;
  const ctrl = new THREE.Vector3(), p = new THREE.Vector3(), upv = upVec(ch), T = catchIt ? 0.55 : 0.75;
  tween(T, (k) => {
    const e = catchIt ? easeInOut(k) : k, tgt = catchIt ? mouthOf(ch) : to;
    ctrl.copy(from).lerp(tgt, 0.5).addScaledVector(upv, (catchIt ? 0.035 : 0.06) * sz);
    p.copy(from).multiplyScalar((1 - e) * (1 - e)).addScaledVector(ctrl, 2 * (1 - e) * e).addScaledVector(tgt, e * e);
    f.sp.position.copy(p); f.sp.material.rotation = -k * 9; f.sp.material.opacity = Math.min(k * 8, 1);
    f.sp.scale.setScalar(0.016 * (1 - 0.5 * k));
  }, () => {
    resetFishDrag(150);
    if (catchIt) { f.life = 0; f.sp.visible = false; flickBusy = false; burst(ch, mouthOf(ch), 10, 0.05); eat(); toast('Nice catch!'); return; }
    sound.land(); f.sp.scale.setScalar(0.008);
    fishOnGround(ch, f, off);
  }, ch);
  if (catchIt && ch.kind !== 'old') after(T * 0.45, () => play(ch, 'PawRaise', { loop: false, fade: 0.12 }), ch);
}
function fishOnGround(ch, f, off) {
  // the fish flops on the ground while he comes for it
  let flop = 0; const flopFn = (k) => { flop += 0.016; f.sp.material.rotation = Math.sin(flop * 18) * 0.5; };
  const walkTo = Math.abs(off.x) > 0.001;
  const reach = 0.007 * tune.size * landScale(ch);
  const goal = new THREE.Vector3(off.x - Math.sign(off.x) * reach, 0, walkTo ? off.z * 0.4 : 0);
  ch.go = { off: new THREE.Vector3(), yaw: 0 };
  const yawTo = (y0, y1, dur, then) => tween(dur, (k) => { flopFn(); ch.go.yaw = THREE.MathUtils.lerp(y0, y1, easeInOut(k)); }, then, ch);
  const move = (a, b, then) => { const dur = Math.max(0.45, a.distanceTo(b) / (0.04 * tune.size)); tween(dur, (k) => { flopFn(); ch.go.off.lerpVectors(a, b, easeInOut(k)); }, then, ch); };
  const eatIt = (then) => {
    play(ch, 'PawRaise', { loop: false, fade: 0.15 });
    tween(0.45, flopFn, () => { f.life = 0; f.sp.visible = false; eat(true); after(0.6, then, ch); }, ch);
  };
  const home = () => { ch.go = null; flickBusy = false; fishBusy = false; play(ch, 'Sit', { fade: 0.35 }); if (fed >= FISH_GOAL) after(0.2, superBobo, ch); };
  if (!walkTo) { eatIt(home); return; }
  const out = Math.atan2(goal.x, goal.z);
  play(ch, 'ClassicWalk', { fade: 0.25 });
  yawTo(0, out, 0.25, () => move(new THREE.Vector3(), goal, () => {
    yawTo(out, out * 0.35, 0.2, () => eatIt(() => {
      play(ch, 'ClassicWalk', { fade: 0.25 });
      const back = Math.atan2(-goal.x, -goal.z);
      yawTo(out * 0.35, back, 0.3, () => move(goal.clone(), new THREE.Vector3(), () => yawTo(back, 0, 0.3, home)));
    }));
  }));
}
function superBobo() {
  const ch = B; ch.super = { t: 0 };
  sound.fanfare(); sound.sparkle(); sound.purr(2.2); buzz([40, 60, 40, 60, 140]);
  toast('Super Bobo!'); ui.hint('Full, happy and glowing');
  postEvent('reward', { what: 'super-bobo', charm: ch.kind });
  ch.spin = { k: 0, turns: 2, lift: 0.035 }; ch.aura.visible = true;
  burst(ch, topOf(ch), 60, 0.18);
  tween(1.3, (k) => { if (ch.spin) ch.spin.k = k; ch.boost = 1 + 0.3 * easeOut(k); }, () => {
    ch.spin = null;
    play(ch, ch.clips.ClassicExcited ? 'ClassicExcited' : 'TailWag', { loop: false, fade: 0.25, onDone: () => play(ch, 'Sit', { fade: 0.35 }) });
  }, ch);
  tween(7.5, (k) => {
    ch.super.t = k;
    if (Math.random() < 0.45) { const a = Math.random() * 6.28, r = ch.height * 0.45 * scaleOf(ch); burst(ch, ch.root.position.clone().addScaledVector(upVec(ch), ch.height * 0.5 * scaleOf(ch)).add(_v.set(Math.cos(a) * r, 0, Math.sin(a) * r * 0.5)), 2, 0.03); }
    if (Math.random() < 0.08) hearts(ch, 1);
    if (k > 0.85) ch.boost = 1 + 0.3 * (1 - easeInOut((k - 0.85) / 0.15));
  }, () => { ch.super = null; ch.boost = 1; ch.aura.visible = false; fed = 0; showFish(); }, ch);
}
let toastT = 0;
function toast(text) { const t = $('toast'); t.textContent = text; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200); }
function pet() {
  if (!live(B)) return; wake(); hearts(B, 4); sound.purr(0.9); buzz(10);
  if (boboFree() && !fishBusy && !B.super) wave();
}

// ---------------------------------------------------------------- Bobo's own life while you watch
// Between your actions he does something now and then (a tail wag, a stretch, a wave), and after half a
// minute with nothing happening he curls up for a nap (Zzz). Anything you do wakes him.
let idleT = 0, idleNext = 7, napping = false;
const IDLES = { bobo: ['TailWag', 'ClassicChill', 'PawRaise', 'TailWag'], old: ['TailWag', 'PawRaise'] };
const resting = (ch) => ch.current && ch.current.getClip().name === 'Sit';
function wake() { idleT = 0; idleNext = 8 + Math.random() * 4; if (napping) { napping = false; play(B, 'Sit', { fade: 0.4 }); } }
function idleLife(dt) {
  if (!live(B) || !boboFree() || fishBusy || B.super || finaleOn) { if (!napping) idleT = 0; return; }
  idleT += dt;
  if (napping) { if (Math.random() < dt * 0.9) floater(B, zzzTex, topOf(B), { size: 0.006 + Math.random() * 0.004, life: 1.8, rise: 0.02, spin: 0.4 }); return; }
  if (!resting(B)) return;
  if (idleT > 30 && B.clips.ClassicSleep) { napping = true; play(B, 'ClassicSleep', { fade: 0.8 }); return; }
  if (idleT > idleNext) {
    const pool = (IDLES[B.kind] || IDLES.bobo).filter((n) => B.clips[n]); const n = pool[Math.floor(Math.random() * pool.length)];
    idleNext = idleT + 7 + Math.random() * 5;
    if (n) play(B, n, { loop: false, fade: 0.3, onDone: () => { if (!napping && boboFree()) play(B, 'Sit', { fade: 0.35 }); } });
  }
}

// ---------------------------------------------------------------- Bobo watches the phone
// After the animation has posed him, his head turns toward the camera (up to about 30 degrees), smoothly.
// Worked out in the head's parent space, so it is right on the mirrored (other side) charm frames too.
const _hp = new THREE.Vector3(), _hf = new THREE.Vector3(), _hq = new THREE.Quaternion(), _hm = new THREE.Matrix4(), _hI = new THREE.Quaternion();
function lookAtViewer(ch, dt) {
  const h = ch.head; if (!h) return;
  ch.headRest = (ch.headRest || new THREE.Quaternion()).copy(h.quaternion);
  const want = live(ch) && !ch.spin && !(napping && ch === B) && !ch.walk ? 1 : 0;
  ch.lookW += THREE.MathUtils.clamp(want - ch.lookW, -dt * 2.5, dt * 1.2);
  if (ch.lookW <= 0.001) return;
  const par = h.parent; par.updateWorldMatrix(true, false); _hm.copy(par.matrixWorld).invert();
  const to = _hp.copy(camera.position).applyMatrix4(_hm).sub(h.position).normalize();
  ch.model.updateWorldMatrix(true, false);
  const fwd = _hf.set(0, 0, 1).transformDirection(ch.model.matrixWorld).transformDirection(_hm);
  if (!ch.lookDir) ch.lookDir = to.clone(); ch.lookDir.lerp(to, Math.min(dt * 6, 1)).normalize();
  const ang = fwd.angleTo(ch.lookDir); if (ang < 1e-4) return;
  _hq.setFromUnitVectors(fwd, ch.lookDir);
  _hq.slerpQuaternions(_hI, _hq, Math.min(1, 0.52 / ang) * ch.lookW * 0.9);
  h.quaternion.premultiply(_hq);
}

// soft shadows on the print under the hovering characters
function shadows() {
  for (const ch of [B, C]) {
    const on = ch.landed && tune.tilt < 0.5; ch.shadow.visible = on; if (!on) continue;
    const sc = scaleOf(ch), w = ch.def.w * sc * 0.9, hh = ch.def.h * sc * 0.55;
    const bc = _v.copy(ch.root.position).addScaledVector(upVec(ch), ch.height * 0.45 * sc); ch.shadow.position.set(bc.x, bc.y, 0.0009);
    ch.shadow.scale.set(w, hh, 1);
    const lift = Math.max(ch.root.position.z, 0.002); ch.shadow.material.opacity = THREE.MathUtils.clamp(0.012 / lift, 0.25, 0.75);
    if (ch.aura.visible) {
      ch.aura.position.copy(ch.root.position).addScaledVector(upVec(ch), ch.height * 0.5 * sc); ch.aura.position.z = Math.min(ch.aura.position.z, 0.003);
      const k = ch.super ? ch.super.t : 0, pulse = 0.85 + 0.15 * Math.sin(performance.now() / 160);
      ch.aura.scale.setScalar(ch.height * sc * 1.6 * pulse); ch.aura.material.opacity = Math.min(k * 8, 1) * (1 - Math.max((k - 0.8) / 0.2, 0)) * 0.6;
    }
  }
}

// ---------------------------------------------------------------- Where is Bobo? events (city level, anonymous)
function postEvent(type, props) {
  if (params.has('nolog') || params.has('nopop')) return;
  try { fetch('/api/bobo/events', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, source: 'keychain-ar', sessionId: SID, props }) }).catch(() => {}); } catch (e) { /* offline */ }
}

// ---------------------------------------------------------------- logos on photos and videos
const LOGO = { evade: new Image(), act: new Image() };
LOGO.evade.src = '/brand/evade-logo.webp'; LOGO.act.src = '/activated-merch/media/ar/activated-by.webp';
function drawWatermark(c, W, H) {
  const u = Math.min(W, H) / 720, pad = 26 * u;
  c.save(); c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 12 * u;
  if (LOGO.evade.complete && LOGO.evade.naturalWidth) { const h = 44 * u, w = h * LOGO.evade.naturalWidth / LOGO.evade.naturalHeight; c.drawImage(LOGO.evade, pad, pad, w, h); }
  if (LOGO.act.complete && LOGO.act.naturalWidth) { const h = 50 * u, w = h * LOGO.act.naturalWidth / LOGO.act.naturalHeight; c.globalAlpha = 0.95; c.drawImage(LOGO.act, W - pad - w, H - pad - h, w, h); }
  c.restore();
}

// the dock shows what can be done right now: Bobo's actions when he is out, the can's when it is out
let dockOn = false;
function updateDock(out) {
  const bOut = live(B), cOut = live(C), busy = !boboFree() || fishBusy || !!B.super;
  const on = !!(out && present && (bOut || cOut));
  if (on !== dockOn) { dockOn = on; $('hud').classList.toggle('looking', !on); }
  if (basketOn && !B.landed) closeBasket();   // a tracking blip only hides it for a moment; it closes when Bobo is gone
  $('dock').classList.toggle('on', on && !basketOn); $('basket').classList.toggle('on', on && basketOn);
  for (const id of ['b-feed', 'b-wave', 'b-wag', 'b-walk']) $(id).hidden = !bOut;
  for (const id of ['b-fizz', 'b-spin']) $(id).hidden = !cOut;
  document.querySelector('#dock .sep').hidden = !(bOut && cOut);
  $('b-feed').disabled = busy; $('b-wave').disabled = $('b-wag').disabled = $('b-walk').disabled = busy;
  $('b-fizz').disabled = finaleOn; $('b-spin').disabled = !!C.spin;
  const wagLabel = B === Bold ? 'Dance' : 'Wag tail', sp = $('b-wag').querySelector('span'); if (sp.textContent !== wagLabel) sp.textContent = wagLabel;
  $('b-replay').disabled = !(out && present);
}

// landed characters stand on their spot in their charm's ground frame
function settle() {
  for (const ch of [B, C]) {
    const Q = restQ(ch), pd = ch.pad; pd.position.copy(spotOf(ch)); pd.quaternion.copy(Q); pd.userData.ring.rotation.z += 0.01;
    pd.traverse((o) => { if (o.material) o.material.visible = tune.tilt > 0.5; });   // the landing pad only makes sense when they stand on the ground
    if (!ch.landed) continue;
    ch.root.position.copy(pd.position); ch.root.quaternion.copy(Q); ch.root.scale.setScalar(scaleOf(ch)); pd.scale.setScalar(tune.size);
    if (ch.go) { ch.root.position.add(_v.copy(ch.go.off).applyQuaternion(Q)); ch.root.rotateY(ch.go.yaw); }   // off to get a fish
    if (ch.walk) {
      const R = 0.02 * tune.size; ch.root.position.add(_v.set(Math.sin(ch.walk.a) * R, 0, (Math.cos(ch.walk.a) - 1) * R).applyQuaternion(Q)); ch.root.rotateY(ch.walk.turn);
    }
    if (ch.spin) { ch.root.rotateY(Math.PI * 2 * (ch.spin.turns || 1) * easeInOut(ch.spin.k)); ch.root.position.addScaledVector(upVec(ch), Math.sin(ch.spin.k * Math.PI) * (ch.spin.lift || 0.02)); }
  }
}

const HINT_FIND = 'Point the camera at Bobo, the Eclipse can, or both together';
function onScreen(ch, m = 0.7) {
  const n = ch.frame.getWorldPosition(_v).project(camera);
  return n.z < 1 && Math.abs(n.x) < m && Math.abs(n.y) < m;
}
// Watchdog (opt-in, ?watchdog=1): hand the engine the same pictures again when nothing has been tracked
// for a while. Off by default: on Dapo's phone (2026-11-11) restarting the search every few seconds made
// recognition much worse, because a search from further away never got to finish.
let lastTrackedAt = 0, lastReset = 0, everTracked = false, activeTargets = [];
function watchdog() {
  const now = performance.now();
  if (Object.values(TS).some((t) => t.tracked)) { lastTrackedAt = now; everTracked = true; return; }
  if (!everTracked || !params.has('watchdog') || now - lastTrackedAt < 8000 || now - lastReset < 15000) return;
  lastReset = now; diag.resets++;
  try { XR8.XrController.configure({ imageTargetData: activeTargets }); } catch (e) { console.warn('watchdog', e); }
}
function showDiag() {
  const el = $('t-diag'); if (!el || $('tune').hidden) return;
  const on = Object.values(TS).filter((t) => t.tracked).map((t) => t.name).join(', ') || 'nothing';
  el.textContent = `Tracking: ${on}. Found ${diag.found}, lost ${diag.lost}, rescans ${diag.resets}.`;
}
function tick(dt) {
  watchdog(); showDiag(); recTick();
  updateFrames(dt);
  // each charm starts its own pop-out once it has been held steady for a moment; if both are in view they go together
  // a charm only counts as held steady while its middle is well inside the picture: the other charm on the
  // ring often peeks in at the edge of the screen, and it must not pop out there, out of sight
  for (const ch of [B, C]) ch.steady = driver[ch.key] && onScreen(ch) ? ch.steady + dt : 0;
  if (!params.has('nopop')) {
    const ripe = (ch) => ch.st === 'idle' && ch.steady > 0.6, coming = (ch) => ch.st === 'idle' && ch.steady > 0;
    if (!PAIR) { for (const ch of [C, B]) if (ripe(ch)) startSolo(ch); }
    else if (ripe(B) && ripe(C)) startPair();
    else if (ripe(C) && !coming(B) && (!pairMaybe || C.steady > 1.4)) startSolo(C);   // with the pair picture in play, give the other charm a moment to show up
    else if (ripe(B) && !coming(C) && (!pairMaybe || B.steady > 1.4)) startSolo(B);
  }
  const busy = [B, C].some((ch) => ch.st === 'charging' || ch.st === 'flying'), out = B.landed || C.landed;
  state = busy ? 'popping' : out ? (B.walk ? 'walking' : 'ready') : 'looking';
  if (!busy && !out) {
    const seen = !!(driver.bobo || driver.can); ui.guide(!seen);
    ui.hint(seen ? 'Found it. Hold still…' : HINT_FIND);
  } else {
    const PULL = 'Move back a little to see them', KEEP = 'Point at Bobo or the can to bring them back';
    ui.guide(!present);
    let off = false;
    for (const ch of [B, C]) if (live(ch) && !ch.super) { const n = ch.root.getWorldPosition(_v).project(camera); off = off || Math.abs(n.x) > 0.92 || n.y < -0.86 || n.y > 0.7; }
    const cur = $('hint').textContent;
    if (!present) ui.hint(KEEP); else if (off) ui.hint(PULL); else if (cur === KEEP || cur === PULL || cur === HINT_FIND || cur.startsWith('Found it')) ui.hint('');
  }
  updateDock(out);
  for (let i = tweens.length - 1; i >= 0; i--) {
    const w = tweens[i]; if (!w) continue; if (w.owner && !w.owner.every(inView)) continue; w.t += dt; const k = Math.min(w.t / w.dur, 1); w.fn(k);
    if (k >= 1) { const j = tweens.indexOf(w); if (j >= 0) tweens.splice(j, 1); w.done && w.done(); }
  }
  settle();
  for (const ch of [B, C]) if (pres[ch.key]) { if (ch.head && ch.headRest) ch.head.quaternion.copy(ch.headRest); ch.mixer.update(dt); lookAtViewer(ch, dt); }   // a character off screen holds still
  updateBubbles(dt); updateFloaters(dt); updateMasks(dt); idleLife(dt); shadows();
  if (taps && !finaleOn) { tapIdle += dt; if (tapIdle > 6) { taps = 0; showFizz(); } }   // the fizz goes flat if you stop tapping
  for (const ch of ALL) {                                                  // sparks
    const pos = ch.sparks.geometry.attributes.position, u = ch.sparks.userData; let alive = 0;
    const down = _v.set(0, -1, 0).applyQuaternion(ch.G.q);
    for (let i = 0; i < u.life.length; i++) {
      if (u.life[i] <= 0) continue; u.life[i] -= dt; alive++;
      u.vel[i * 3] += down.x * 0.25 * dt; u.vel[i * 3 + 1] += down.y * 0.25 * dt; u.vel[i * 3 + 2] += down.z * 0.25 * dt;
      pos.setXYZ(i, pos.getX(i) + u.vel[i * 3] * dt, pos.getY(i) + u.vel[i * 3 + 1] * dt, pos.getZ(i) + u.vel[i * 3 + 2] * dt);
      if (u.life[i] <= 0) pos.setXYZ(i, 0, 0, -1e4);
    }
    pos.needsUpdate = true; ch.sparks.material.opacity = alive ? 0.95 : 0;
  }
}

// ---------------------------------------------------------------- 8th Wall pipeline
const canvas = $('cam');
function sizeCanvas() {
  const dpr = Math.min(devicePixelRatio || 1, CAM.dpr);
  const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}
let last = 0;
const appModule = (data) => ({
  name: 'evade-keychain',
  onStart: () => { buildScene(XR8.Threejs.xrScene(), data); state = 'looking'; $('hud').hidden = false; ui.guide(true); },   // the scene exists from here on
  onUpdate: () => { const now = performance.now(); countFrame(now, Object.values(TS).some((t) => t.tracked)); flushDiag(false); const dt = Math.min((now - (last || now)) / 1000, 0.05); last = now; if (scene) tick(dt); },
  onCameraStatusChange: ({ status, video, stream }) => {
    camLog(status);
    if (status === 'hasStream') { kickVideo(video); noteStream(stream); }
    if (status === 'hasVideo') hideTapCam();
    if (status === 'requesting') ui.hint('Allow camera access to begin');
    if (status === 'hasVideo') {   // camera first, then the what-to-point-at card on top of it (Dapo, 2026-11-11)
      camStartAt = performance.now(); tuneCamera(video); $('splash').classList.add('gone'); setTimeout(() => { $('splash').hidden = true; }, 600);
      $('how').hidden = false; $('b-go').focus(); syncRec();
    }
    if (status === 'failed') camFailed('failed');
  },
  onException: (e) => { console.error('XR', e); (diag.errors = diag.errors || []).push('XR: ' + String((e && e.message) || e).slice(0, 200)); flushDiag(true, true); ui.error('Something went wrong', String((e && e.message) || e)); },
  listeners: [
    { event: 'reality.imagefound', process: ({ detail }) => { diag.found++; if (DEBUG) console.log('CAMPOSE', JSON.stringify(camera.position.toArray()), JSON.stringify(camera.quaternion.toArray()), 'proj', JSON.stringify(camera.projectionMatrix.elements.map((x) => +x.toFixed(3)))); onTarget(detail); } },
    { event: 'reality.imageupdated', process: ({ detail }) => onTarget(detail) },
    { event: 'reality.imagelost', process: ({ detail }) => { diag.lost++; onLost(detail); } },
    { event: 'reality.imageloading', process: ({ detail }) => DEBUG && console.log('imageloading', JSON.stringify(detail)) },
    { event: 'reality.imagescanning', process: ({ detail }) => DEBUG && console.log('imagescanning', JSON.stringify(detail)) },
  ],
});

// ---------------------------------------------------------------- camera profiles
// The engine picks its own camera constraints and tracks on a small greyscale copy of each frame. These
// settings sit around it, so they can be compared on real phones (Tune > Camera, saved on the device,
// applied by restarting the camera). Every choice can also be forced from the link, e.g. ?res=1080&lens=0.5x.
//  res   engine | 720 | 1080 | 1440      the stream size asked for (1440 = 1920x1440, 4:3)
//  fps   engine | 30 | 60
//  focus engine | continuous             where the browser exposes focus (mostly Android Chrome)
//  lens  '' | a camera's name            iPhones: "Back Dual Wide Camera" / "Back Triple Camera" switch to
//                                        the macro lens up close by themselves; the plain "Back Camera"
//                                        cannot focus closer than about 15-20 cm on recent Pro models
//  dpr   1 | 1.5 | 2 | 3                 how sharp the page draws; higher costs frame rate
const CAM_DEFAULT = { res: 'engine', fps: 'engine', focus: 'engine', lens: '', dpr: 1 };   // 1x drawing: fastest, and the charms are picked up quickest (Dapo's iPhone and Android tests, 2026-11-11)
const CAM = { ...CAM_DEFAULT };
try { Object.assign(CAM, JSON.parse(localStorage.getItem('kc-ar-cam') || '{}')); } catch (e) { /* defaults */ }
for (const k of Object.keys(CAM_DEFAULT)) if (params.has(k)) CAM[k] = k === 'dpr' ? +params.get(k) || 1 : params.get(k);
if (params.get('hd') === '0') { Object.assign(CAM, CAM_DEFAULT); try { localStorage.removeItem('kc-ar-cam'); } catch (e) { /* none */ } }
const RES = { 720: [1280, 720], 1080: [1920, 1080], 1440: [1920, 1440] };
// the chosen lens's deviceId, looked up by name (names only exist once the camera has been allowed, so a
// miss is not remembered: the engine's second open on iOS finds it)
function lensId() {
  const want = CAM.lens ? [CAM.lens] : IOS_MACRO ? MACRO_LENSES : [];
  if (!want.length) return Promise.resolve(null);
  return navigator.mediaDevices.enumerateDevices()
    .then((ds) => { for (const n of want) { const d = ds.find((x) => x.kind === 'videoinput' && x.label === n); if (d) return d.deviceId; } return null; }).catch(() => null);
}
// Only wrap getUserMedia when a non-default profile is chosen: with the engine's own choice the call goes
// straight to the browser, untouched (iOS Safari is sensitive to anything sitting in its camera start).
// iPhones (Dapo, 2026-11-11: the keychain goes soft up close on iPhone): the engine opens the plain "Back
// Camera" at 1024x768. On Pro iPhones that lens cannot focus closer than about 20 cm, and the test log shows
// people holding the charm 10-25 cm away. The multi-lens "Back Triple Camera" / "Back Dual Wide Camera"
// hands over to the macro lens up close by itself, like the Camera app does, so iPhones open that one, at
// 1920x1440, by default. If it shows no picture within 4 s the page reloads once with the standard camera
// (remembered for this tab). ?macro=0 turns it off; any lens picked in Tune > Camera test wins.
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const MACRO_LENSES = ['Back Triple Camera', 'Back Dual Wide Camera'];
let iosStd = false; try { iosStd = sessionStorage.getItem('kc-ios-std') === '1'; } catch (e) { /* none */ }
const IOS_MACRO = IOS && !CAM.lens && CAM.res === 'engine' && CAM.fps === 'engine' && params.get('hd') !== '0' && params.get('macro') !== '0' && !iosStd;
const CAM_CUSTOM = CAM.res !== 'engine' || CAM.fps !== 'engine' || !!CAM.lens || IOS_MACRO;
// iPhones: the standard camera is the request that worked on Dapo's iPhone up to 29bfcdc (ideal 1920x1440,
// falling back to the engine's own request). With the engine's request alone the stream opens on iOS but
// never delivers a frame (test log 2026-11-11), so iOS keeps this as its standard. Android keeps the
// engine's own choice, which Dapo rated perfect.
if (!CAM_CUSTOM && IOS && params.get('hd') !== '0' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
  const md = navigator.mediaDevices, orig = md.getUserMedia.bind(md);
  md.getUserMedia = (c) => {
    const v = c && c.video;
    if (!v || v === true || (v.width && v.width.exact) || (v.height && v.height.exact)) return orig(c);
    const sharp = { ...c, video: { ...v, width: { ...(v.width || {}), ideal: 1920 }, height: { ...(v.height || {}), ideal: 1440 } } };
    diag.asked = sharp.video;
    return orig(sharp).catch((e) => { diag.askFailed = String(e && e.name || e); return orig(c); });
  };
}
if (CAM_CUSTOM && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
  const md = navigator.mediaDevices, orig = md.getUserMedia.bind(md);
  const ask = (c, v, id) => {
    const nv = { ...v };
    if (CAM.res !== 'engine' && RES[CAM.res]) { const [w, h] = RES[CAM.res]; nv.width = { ideal: w }; nv.height = { ideal: h }; }
    else if (IOS_MACRO) { nv.width = { ideal: 1920 }; nv.height = { ideal: 1440 }; }
    if (CAM.fps !== 'engine') nv.frameRate = { ideal: +CAM.fps };
    if (id) { nv.deviceId = { exact: id }; delete nv.facingMode; }
    if (JSON.stringify(nv) === JSON.stringify(v)) return orig(c);
    diag.asked = nv;
    return orig({ ...c, video: nv }).catch((e) => { diag.askFailed = String(e && e.name || e); return orig(c); });
  };
  md.getUserMedia = (c) => {
    const v = c && c.video;
    if (!v || v === true) return orig(c);
    return CAM.lens || IOS_MACRO ? lensId().then((id) => ask(c, v, id)) : ask(c, v, null);
  };
}
let camTrack = null;
function tuneCamera(video) {
  try {
    camTrack = video && video.srcObject && video.srcObject.getVideoTracks()[0]; if (!camTrack) return;
    const caps = camTrack.getCapabilities ? camTrack.getCapabilities() : {};
    if (CAM.focus === 'continuous' && caps.focusMode && caps.focusMode.includes('continuous')) camTrack.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
    // the multi-lens camera can open at the ultra wide's view (0.5x): bring it to the normal 1x view, so the
    // charm is as big on screen as before. Where the browser counts the ultra wide as 0.5, 1 is already 1x;
    // where it counts it as 1, the 1x lens is 2.
    if ((IOS_MACRO || MACRO_LENSES.includes(CAM.lens)) && /Triple|Dual Wide/.test(camTrack.label) && caps.zoom) {
      const z = Math.min(Math.max(caps.zoom.min < 1 ? 1 : 2, caps.zoom.min), caps.zoom.max);
      diag.macro = { label: camTrack.label, zoomMin: caps.zoom.min, zoomMax: caps.zoom.max, zoomWas: (camTrack.getSettings() || {}).zoom, zoom: z };
      camTrack.applyConstraints({ advanced: [{ zoom: z }] }).catch((e) => { diag.macro.error = String(e && e.name); });
    }
    const st = camTrack.getSettings ? camTrack.getSettings() : {};
    diag.camera = { label: camTrack.label, width: st.width || video.videoWidth, height: st.height || video.videoHeight, frameRate: st.frameRate, focusMode: st.focusMode, zoom: st.zoom,
      caps: { focusMode: caps.focusMode, zoom: caps.zoom, width: caps.width, height: caps.height, frameRate: caps.frameRate } };
    $('t-cam').textContent = `Camera: ${camTrack.label || 'back camera'}, ${diag.camera.width}×${diag.camera.height}${st.frameRate ? ' at ' + Math.round(st.frameRate) + ' fps' : ''}`;
    if (caps.zoom && caps.zoom.max > caps.zoom.min) {
      const z = $('t-zoom'); z.min = caps.zoom.min; z.max = Math.min(caps.zoom.max, 4); z.step = caps.zoom.step || 0.1; z.value = st.zoom || caps.zoom.min;
      for (const el of document.querySelectorAll('.zoom')) el.hidden = false;
      const show = () => { $('t-zoom-v').textContent = (+z.value).toFixed(1) + '×'; }; show();
      z.oninput = () => { show(); diag.zoom = +z.value; camTrack.applyConstraints({ advanced: [{ zoom: +z.value }] }).catch(() => {}); };
    }
    // the camera menu: list this phone's back cameras by name (names only appear once the camera is allowed)
    navigator.mediaDevices.enumerateDevices().then((ds) => {
      const sel = $('c-lens'), names = ds.filter((d) => d.kind === 'videoinput' && d.label && !/front|user|facetime/i.test(d.label)).map((d) => d.label);
      diag.cameras = names;
      sel.innerHTML = '<option value="">Engine choice</option>' + names.map((n) => `<option>${n.replace(/</g, '')}</option>`).join('');
      sel.value = names.includes(CAM.lens) ? CAM.lens : '';
    }).catch(() => {});
  } catch (e) { diag.cameraError = String(e); }
}
function camMenu() {
  for (const k of ['res', 'fps', 'focus', 'dpr']) $('c-' + k).value = String(CAM[k]);
  $('c-apply').onclick = () => {
    const next = { res: $('c-res').value, fps: $('c-fps').value, focus: $('c-focus').value, lens: $('c-lens').value, dpr: +$('c-dpr').value };
    try { localStorage.setItem('kc-ar-cam', JSON.stringify(next)); localStorage.setItem('kc-ar-note', $('c-note').value || ''); } catch (e) { /* not saved */ }
    flushDiag(true);
    const u = new URL(location.href); for (const k of Object.keys(CAM_DEFAULT)) u.searchParams.delete(k); u.searchParams.delete('hd');
    location.replace(u.toString());
  };
  try { $('c-note').value = localStorage.getItem('kc-ar-note') || ''; } catch (e) { /* none */ }
  $('c-note').onchange = () => { diag.note = $('c-note').value; try { localStorage.setItem('kc-ar-note', diag.note); } catch (e) { /* none */ } };
}

// ---------------------------------------------------------------- test log
// One record per session, sent to /api/ar/kc-diag every 10 s and when the page is hidden, so results
// from real phones can be read back without the tester writing them down. No camera images, no IP.
const SID = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
const diag = { found: 0, lost: 0, resets: 0, asked: null, camera: null, events: [], targets: {}, fps: { all: [], tracking: [], idle: [] }, pops: [], taps: 0 };
try { diag.note = localStorage.getItem('kc-ar-note') || ''; } catch (e) { diag.note = ''; }
let camStartAt = 0;
const tDiag = (n) => (diag.targets[n] = diag.targets[n] || { firstFoundS: null, found: 0, lost: 0, trackedS: 0, distFirstCm: null, distMinCm: null, distMaxCm: null, angleMaxDeg: 0 });
function noteFound(t, d) {
  const td = tDiag(t.name); td.found++;
  const s = camStartAt ? +((performance.now() - camStartAt) / 1000).toFixed(1) : null;
  if (td.firstFoundS === null) { td.firstFoundS = s; td.distFirstCm = d.cm; }
  diag.events.push({ t: s, n: t.name, e: 'found', cm: d.cm, deg: d.deg }); if (diag.events.length > 300) diag.events.shift();
}
function noteLost(name) {
  const td = tDiag(name); td.lost++;
  diag.events.push({ t: camStartAt ? +((performance.now() - camStartAt) / 1000).toFixed(1) : null, n: name, e: 'lost' }); if (diag.events.length > 300) diag.events.shift();
}
function measure(t) {   // distance (cm) and viewing angle (degrees off straight-on) of a tracked picture
  const toCam = _v2.copy(camera.position).sub(t.p); const cm = Math.round(toCam.length() / t.s * 1000) / 10;
  const n = new THREE.Vector3(0, 0, 1).applyQuaternion(t.q); const deg = Math.round(THREE.MathUtils.radToDeg(n.angleTo(toCam.normalize())));
  const td = tDiag(t.name); td.distMinCm = td.distMinCm === null ? cm : Math.min(td.distMinCm, cm); td.distMaxCm = Math.max(td.distMaxCm || 0, cm); td.angleMaxDeg = Math.max(td.angleMaxDeg, deg);
  return { cm, deg };
}
let fpsFrames = 0, fpsT0 = 0, fpsTracking = 0;
function countFrame(now, anyTracked) {
  if (!fpsT0) fpsT0 = now; fpsFrames++; if (anyTracked) fpsTracking++;
  if (now - fpsT0 >= 1000) {
    const f = Math.round(fpsFrames * 1000 / (now - fpsT0));
    diag.fps.all.push(f); (fpsTracking > fpsFrames / 2 ? diag.fps.tracking : diag.fps.idle).push(f);
    for (const a of Object.values(diag.fps)) if (a.length > 600) a.shift();
    $('t-fps') && ($('t-fps').textContent = `${f} fps`);
    fpsFrames = 0; fpsTracking = 0; fpsT0 = now;
  }
}
const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
function diagRecord() {
  return {
    sid: SID, v: 1, page: location.pathname, params: location.search, note: diag.note, profile: { ...CAM }, tune: { ...tune },
    screen: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio, renderDpr: Math.min(devicePixelRatio || 1, CAM.dpr) },
    camSteps: diag.camSteps || [], camFailed: diag.camFailed || null, custom: CAM_CUSTOM, ios: IOS, iosMacro: IOS_MACRO, macro: diag.macro || null, motion: motionPerm, stream: diag.stream || null, visible: document.visibilityState,
    asked: diag.asked, askFailed: diag.askFailed || null, camera: diag.camera, cameras: diag.cameras || null, zoom: diag.zoom || null,
    targetsLoaded: activeTargets.map((t) => t.name), runS: camStartAt ? Math.round((performance.now() - camStartAt) / 1000) : 0,
    fps: { avg: avg(diag.fps.all), tracking: avg(diag.fps.tracking), idle: avg(diag.fps.idle), min: diag.fps.all.length ? Math.min(...diag.fps.all) : null, last30: diag.fps.all.slice(-30) },
    targets: diag.targets, found: diag.found, lost: diag.lost, pops: diag.pops, taps: diag.taps, events: diag.events, errors: diag.errors || [],
  };
}
let lastFlush = 0;
// the live site keeps no test logs (they can only be read on previews); ?diag turns them on there
const LIVE_SITE = /(^|\.)medialife\.ai$/i.test(location.hostname);
function flushDiag(force, always) {
  if ((!camStartAt && !always) || params.has('nolog') || (LIVE_SITE && !params.has('diag'))) return;
  const now = performance.now(); if (!force && now - lastFlush < 10000) return; lastFlush = now;
  const body = JSON.stringify(diagRecord());
  try { if (!(navigator.sendBeacon && navigator.sendBeacon('/api/ar/kc-diag', new Blob([body], { type: 'application/json' })))) fetch('/api/ar/kc-diag', { method: 'POST', body, keepalive: true }); } catch (e) { /* offline */ }
}
// camera start-up, logged step by step so a phone where the camera never starts still reports why
let runAt = 0;
function camLog(step) {
  (diag.camSteps = diag.camSteps || []).push({ step, ms: runAt ? Math.round(performance.now() - runAt) : 0 });
  if (step !== 'hasVideo') flushDiag(true, true);
}
// iOS Safari: the engine hands the stream to a hidden <video> and waits for it to play by itself. The engine
// only sets the muted *attribute*, which WebKit does not treat as muted once the element exists, and Low
// Power Mode blocks autoplay outright, so on iPhones the stream can arrive and never play (seen in the test
// log 2026-11-11: hasStream, then nothing). Make it muted and inline, play it, and if the phone still says
// no, ask for one tap: a play() from a tap is always allowed.
let tapCamShown = false;
function engineVideo() { return [...document.querySelectorAll('video')].find((v) => v.srcObject) || null; }
function kickVideo() {
  setTimeout(() => {
    if (camStartAt) return;
    camLog('notPlaying');
    if (IOS_MACRO) { camLog('iosMacroFallback'); flushDiag(true, true); try { sessionStorage.setItem('kc-ios-std', '1'); } catch (e) { /* none */ } location.reload(); return; }   // back to the standard iPhone camera, once
    showTapCam();
  }, 4000);
}
// what the phone handed over: a track that is "muted" or "ended" here means another tab or app holds the camera
function noteStream(stream) {
  try {
    const t = stream && stream.getVideoTracks()[0];
    diag.stream = t ? { label: t.label, muted: t.muted, state: t.readyState, enabled: t.enabled, settings: t.getSettings ? t.getSettings() : null } : null;
    if (t) { t.onmute = () => camLog('trackMuted'); t.onunmute = () => camLog('trackUnmuted'); t.onended = () => camLog('trackEnded'); }
  } catch (e) { diag.stream = { error: String(e) }; }
}
function showTapCam() {
  if (camStartAt || tapCamShown) return; tapCamShown = true;
  // the usual cause (seen on Dapo's iPhone, 2026-11-11): another app or tab already has the camera, so the
  // phone hands over a stream that never shows a picture
  const card = document.createElement('div'); card.id = 'tap-cam'; card.setAttribute('role', 'alert');
  card.innerHTML = '<h2>Waiting for the camera</h2><p>Another app or tab may be using it. Close the Camera app, any video call, and other browser tabs or browsers that use the camera, then tap Try again.</p><div class="row"><button type="button" class="primary" data-a="reload">Try again</button><button type="button" data-a="play">Start camera here</button></div>';
  card.querySelector('[data-a=reload]').onclick = () => { camLog('tapReload'); location.reload(); };
  card.querySelector('[data-a=play]').onclick = () => {
    camLog('tapPlay');
    const v = engineVideo(); if (v) { v.muted = true; v.play().catch((e) => camLog('tapPlayRejected:' + (e && e.name))); }
    setTimeout(() => { if (!camStartAt) camFailed('no video after tap'); }, 8000);
  };
  document.body.appendChild(card); card.querySelector('button').focus();
}
function hideTapCam() { const el = document.getElementById('tap-cam'); if (el) el.remove(); }
function camFailed(why) {
  if (camStartAt || diag.camFailed) return;
  diag.camFailed = why; flushDiag(true, true);
  hideTapCam();
  const test = CAM_CUSTOM && !IOS_MACRO;     // a profile picked in Tune > Camera test
  if (IOS_MACRO) try { sessionStorage.setItem('kc-ios-std', '1'); } catch (e) { /* none */ }   // Try again uses the standard iPhone camera
  ui.error('The camera didn\'t start', test
    ? 'The camera test settings on this phone may not suit it. Tap below to go back to the standard camera.'
    : 'Another app or tab may be using it. Close the Camera app, any video call, and other browser tabs or browsers that use the camera, then tap Try again.',
    test ? '' : 'Still stuck? Allow camera access for this site in your browser settings. On iPhone use Safari, on Android use Chrome.');
  if (test) addResetButton();
}
function addResetButton() {
  const host = document.querySelector('#error') || document.body;
  if (host.querySelector('.cam-reset')) return;
  const b = document.createElement('button'); b.className = 'primary cam-reset'; b.style.marginTop = '10px'; b.type = 'button'; b.textContent = 'Use the standard camera';
  b.onclick = () => { try { localStorage.removeItem('kc-ar-cam'); } catch (e) { /* none */ } const u = new URL(location.href); for (const k of Object.keys(CAM_DEFAULT)) u.searchParams.delete(k); location.replace(u.toString()); };
  host.appendChild(b);
}
addEventListener('pagehide', () => flushDiag(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) flushDiag(true); });
addEventListener('error', (e) => { (diag.errors = diag.errors || []).push(String(e.message).slice(0, 200)); });

async function start() {
  if (!loaded) return;
  $('b-start').disabled = true; $('b-start').textContent = 'Starting…';
  sound.init(); capture && capture.configure({ audioContext: sound.ctx }); await askMotion();
  const data = await assets;
  sizeCanvas(); addEventListener('resize', sizeCanvas); addEventListener('orientationchange', () => setTimeout(sizeCanvas, 300));
  // kc-can-art (the flat can art) only with ?canart=1: the photo target is what finds the real charm (test
// log), and a second picture of the same charm takes a tracking slot and detection time from the Bobos.
  activeTargets = data.slice(4).filter((t) => (PAIR || t.name !== 'kc-both') && (params.has('canart') || t.name !== 'kc-can-art') && (!params.get('only') || t.name === params.get('only')));
  XR8.XrController.configure({ disableWorldTracking: true, imageTargetData: activeTargets });
  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(),
    XR8.Threejs.pipelineModule(),
    XR8.XrController.pipelineModule(),
    XR8.CanvasScreenshot.pipelineModule(),
    appModule(data),
    { name: 'kc-capture', onRender: () => { if (capture) capture.frame(); } },   // after the scene is drawn: copy the frame into the recording
  ]);
  runAt = performance.now(); camLog('run');
  setTimeout(() => { if (!camStartAt && !tapCamShown) camFailed('no video after 12 s'); }, 12000);
  XR8.run({ canvas, allowedDevices: XR8.XrConfig.device().ANY, cameraConfig: { direction: XR8.XrConfig.camera().BACK } });
}

// ---------------------------------------------------------------- input
// Start goes straight to the camera, in the same tap (iOS only shows its permission prompts from a tap);
// the what-to-point-at card appears once the camera picture is up, and Got it closes it.
$('b-start').onclick = start;
$('b-go').onclick = () => { $('how').hidden = true; syncRec(); };
// the record button shows as soon as the camera runs, so the pop-out itself can be filmed
function syncRec() { capture && capture.setVisible(!$('hud').hidden && $('how').hidden && $('shot').hidden); }
$('b-feed').onclick = () => { buzz(8); if (basketOn) closeBasket(); else openBasket(); }; $('b-wave').onclick = () => { buzz(8); wave(); }; $('b-wag').onclick = () => { buzz(8); wag(); }; $('b-walk').onclick = () => { buzz(8); walk(); }; $('b-replay').onclick = () => { buzz(8); replay(); };
$('b-fizz').onclick = () => { buzz(8); tapBubbles(C); }; $('b-spin').onclick = () => { buzz(8); spinCan(); };
$('b-sound').onclick = () => { sound.on = !sound.on; $('b-sound').setAttribute('aria-pressed', String(sound.on)); $('b-sound').setAttribute('aria-label', sound.on ? 'Sound on' : 'Sound off'); };
$('b-tune').hidden = !DEV;

// ---------------------------------------------------------------- video (the Cola Run recorder, shared with Mattercraft)
// Records the camera picture with the characters (not the buttons), with the logos on it and the page's
// sounds; then the review sheet: save or share it, or send it to the Where is Bobo? globe (it lands in the
// Media Library as "Needs review", source keychain-ar, and shows as an "in review" pin at the city).
let capture = null;
try {
  capture = new ColaCapture({
    canvas, host: document.body, endpoint: location.origin, globeUrl: '/evade/where-is-bobo/', source: 'keychain-ar', audioContext: null,
    connectAudio: (dest) => { const m = sound.master; if (!m) return () => {}; m.connect(dest); return () => { try { m.disconnect(dest); } catch (e) { /* gone */ } }; },
    overlay: drawWatermark,
    on: (name) => {
      if (name === 'recordStart') { buzz(25); diag.recs = (diag.recs || 0) + 1; recUi(true); }
      if (name === 'recordStop' || name === 'error') recUi(false);
      if (name === 'sent') diag.sent = (diag.sent || 0) + 1;
    },
  });
  Object.assign(capture.settings, {
    corner: 'topRight', offsetX: -5, offsetY: -6, accent: '#ffc23a', maxSeconds: 30,
    hintText: 'Film Bobo and send him to the globe', sendLabel: 'Send to Where is Bobo?',
    sheetTitle: 'Send your clip to the Bobo globe?', keepTitle: 'Keep your clip?', clipTitle: 'Off the Chain clip', filePrefix: 'bobo-off-the-chain', backLabel: 'Back to the camera',
  });
  capture.apply(); capture.setVisible(false);
} catch (e) { console.warn('recorder', e); capture = null; }
async function takePhoto() {
  try {
    sound.shutter(); buzz(20); const fl = $('flashw'); fl.classList.add('on'); setTimeout(() => fl.classList.remove('on'), 60);
    const b64 = await XR8.CanvasScreenshot.takeScreenshot();
    const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode();
    const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0); drawWatermark(cx, cv.width, cv.height);   // EVADE and Activated by MEDIALIFE on the photo
    const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.92));
    const file = new File([blob], `bobo-keychain-${++shots}.jpg`, { type: 'image/jpeg' });
    const url = URL.createObjectURL(blob);
    $('shot-img').src = url; $('shot-save').href = url; $('shot-save').download = file.name;
    const canShare = navigator.canShare && navigator.canShare({ files: [file] });
    $('shot-share').hidden = !canShare;
    $('shot-share').onclick = () => navigator.share({ files: [file], title: 'Bobo went Off the Chain' }).catch(() => {});
    $('shot-save').hidden = false; $('shot').hidden = false; capture && capture.setVisible(false);
  } catch (e) { console.error(e); }
}
// ---------------------------------------------------------------- dragging and flicking the fish out of the basket
{
  const el = $('fish-drag'); let drag = null;
  el.src = fishTex.image.toDataURL();
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (err) { /* old Safari */ } drag = { x0: e.clientX, y0: e.clientY, pts: [[e.clientX, e.clientY, e.timeStamp]] }; el.style.transition = 'none'; });
  el.addEventListener('pointermove', (e) => {
    if (!drag) return; drag.pts.push([e.clientX, e.clientY, e.timeStamp]); if (drag.pts.length > 12) drag.pts.shift();
    el.style.transform = `translate(${e.clientX - drag.x0}px,${e.clientY - drag.y0}px) rotate(${(e.clientX - drag.x0) * 0.2}deg)`;
  });
  const end = (e) => {
    if (!drag) return; const d = drag; drag = null;
    // speed over the last bit of the swipe (measured up to the last move, so a slow frame before release
    // doesn't zero it). A slow but clear upward drag still throws, gently: forgiving for small hands.
    const last = d.pts[d.pts.length - 1], recent = d.pts.filter((q) => last[2] - q[2] < 110), a = recent[0] || d.pts[0], dt = Math.max((last[2] - a[2]) / 1000, 0.016);
    let vx = (last[0] - a[0]) / dt, vy = (last[1] - a[1]) / dt; const up = d.y0 - e.clientY;
    if (up > 60 && vy > -600) { vx = ((e.clientX - d.x0) / up) * 600; vy = -600; }
    if ((vy < -350 && up > 24) || up > 60) { el.style.opacity = '0'; flick(vx, vy, e.clientX, e.clientY); }
    else { el.style.transition = 'transform .35s cubic-bezier(.2,.9,.25,1.3)'; el.style.transform = ''; if (Math.abs(e.clientY - d.y0) < 8) ui.hint('Swipe the fish up toward Bobo'); }
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  $('basket-close').onclick = () => { buzz(8); closeBasket(); };
}
// ---------------------------------------------------------------- the shutter (bottom right, one thumb)
// Tap: a photo. Press and hold: a video for as long as the finger stays down (up to 30 s), the way camera
// apps do it. The recording itself is the Cola Run capture core; its own button is hidden.
const HOLD_MS = 320;
let holdT = 0, holding = false, recFrom = 0;
function recUi(on) {
  $('b-shutter').classList.toggle('rec', on); $('rec-time').hidden = !on; $('shoot-cap').hidden = on;
  $('b-shutter').setAttribute('aria-label', on ? 'Stop recording' : 'Take a photo. Press and hold to record a video.');
  recFrom = on ? performance.now() : 0; if (!on) $('b-shutter').querySelector('.prog').style.strokeDashoffset = '207';
}
function recTick() {   // the red ring and the timer while recording
  if (!recFrom) return;
  const sec = (performance.now() - recFrom) / 1000, max = (capture && capture.settings.maxSeconds) || 30;
  $('b-shutter').querySelector('.prog').style.strokeDashoffset = String(207 * (1 - Math.min(sec / max, 1)));
  const t = `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`; if ($('rec-time').textContent !== t) $('rec-time').textContent = t;
}
const sh = $('b-shutter');
sh.addEventListener('contextmenu', (e) => e.preventDefault());
sh.addEventListener('pointerdown', (e) => {
  if (sh.disabled || e.button > 0) return;
  if (capture && capture.status === 'recording') { holding = false; return; }        // a tap while recording (from a keyboard start) stops it on release
  holding = true; try { sh.setPointerCapture(e.pointerId); } catch (err) { /* old Safari */ }
  clearTimeout(holdT); holdT = setTimeout(() => { if (holding && capture) { capture.start(); } }, HOLD_MS);
});
const shutterUp = () => {
  if (capture && capture.status === 'recording') { holding = false; clearTimeout(holdT); capture.stop(); return; }
  if (!holding) return; holding = false; clearTimeout(holdT); takePhoto();
};
sh.addEventListener('pointerup', shutterUp);
sh.addEventListener('pointercancel', () => { holding = false; clearTimeout(holdT); if (capture && capture.status === 'recording') capture.stop(); });
sh.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (e.repeat) return; if (capture && capture.status === 'recording') capture.stop(); else takePhoto(); } });
sh.addEventListener('keydown', (e) => { if ((e.key === 'r' || e.key === 'R') && capture) capture.toggle(); });   // keyboard: R records
$('shot-close').onclick = () => { $('shot').hidden = true; syncRec(); };
$('err-retry').onclick = () => location.reload();

// size and spacing sliders (preview tool: find the numbers, then they become the defaults)
const TUNE_UI = { size: ['t-size', 100, '%'], gap: ['t-gap', 100, '%'], hover: ['t-hover', 1000, ' mm'], tilt: ['t-tilt', 100, '%'], away: ['t-away', 100, '%'], portal: ['t-portal', 1, ' s'], stagger: ['t-stagger', 1, ' s'], fly: ['t-fly', 1, ' s'] };
function showTune() {
  for (const [k, [id, mul, unit]] of Object.entries(TUNE_UI)) {
    $(id).value = tune[k] * mul; $(id + '-v').textContent = (mul >= 100 ? Math.round(tune[k] * mul) : (+tune[k]).toFixed(2).replace(/0$/, '')) + unit;
  }
}
function setTune(k, v) { tune[k] = v; showTune(); try { localStorage.setItem('kc-ar-tune', JSON.stringify(tune)); } catch (e) { /* not saved */ } }
for (const [k, [id, mul]] of Object.entries(TUNE_UI)) $(id).oninput = (e) => setTune(k, +e.target.value / mul);
$('t-reset').onclick = () => { for (const k of Object.keys(TUNE_DEFAULT)) setTune(k, TUNE_DEFAULT[k]); };
$('t-replay').onclick = replay;
for (const k of ['portal', 'stagger', 'fly']) $(TUNE_UI[k][0]).onchange = replay;   // let go of a timing slider and the pop plays again with it
$('b-tune').onclick = () => { const t = $('tune'); t.hidden = !t.hidden; $('b-tune').setAttribute('aria-expanded', String(!t.hidden)); };
showTune(); camMenu();

const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2(); let down = null;
canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', (e) => {
  if (!down || !camera || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 10) return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = (ch) => live(ch) && ray.ray.intersectsBox(new THREE.Box3().setFromObject(ch.root));
  if (!present) return;
  // tap Bobo to pet him (hearts, a purr, a wave); tap the can, or anywhere else, for bubbles from the can
  if (hit(B)) pet(); else if (hit(C)) { spinCan(); tapBubbles(C); } else if (live(C)) tapBubbles(C); else pet();
});

// desktop: offer the phone hand-off, but the webcam works too
const mobile = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900;
if (!mobile) {
  $('desk').hidden = false;
  try { window.QRCode && QRCode.toString(location.href, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }, (err, svg) => { if (!err) $('qr').innerHTML = svg; }); } catch (e) { /* no QR */ }
}

// the camera guide cycles through the three things to look for
{ const imgs = [...document.querySelectorAll('#guide img')]; let gi = 0; setInterval(() => { gi = (gi + 1) % imgs.length; imgs.forEach((im, i) => im.classList.toggle('show', i === gi)); }, 1700); }

window.__ar = { diag, feed, pet, flick, openBasket, get basketOn() { return basketOn; }, get fed() { return fed; }, get fishBusy() { return fishBusy; }, get dbg() { return { free: boboFree(), busy: fishBusy, sup: !!B.super, walk: !!B.walk, live: live(B), cur: B.current && B.current.getClip().name }; }, get capture() { return capture; }, get state() { return state; }, get old() { return B === Bold; }, conf, get pairOff() { return pairOff; }, TS, charm, pres, get drivers() { return { bobo: driver.bobo && driver.bobo.name, can: driver.can && driver.can.name }; }, replay, gravity, get B() { return B; }, get sides() { return { sideOf, sideLead, sideLast }; }, get C() { return C; }, get camera() { return camera; }, get present() { return present; }, tune, get taps() { return taps; }, tapBubbles, tick, get bubbles() { return bubbles.filter((b) => b.life > 0).length; } };
