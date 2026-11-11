// EVADE keychain AR: point the camera at the keychain and Bobo and the Eclipse can jump off their
// charms, leaving black silhouettes behind. Image tracking by the open-source 8th Wall engine
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

window.THREE = THREE;                       // XR8.Threejs.pipelineModule() looks for a global THREE
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
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
  old: { w: 0.058, h: 0.0775 },       // the earlier design's Bobo charm picture (sizes from a phone photo, taking the can charm as 55 mm tall)
};
// landed sizes and spots (metres), in the "ground frame": x right, y up (gravity), z toward the viewer
// Landed characters are the size of their printed art on the charms (art height in the charm pictures / 14 px per mm).
const SIZE = { bobo: 825 / PXM, can: 679 / PXM, old: 0.0775 * 619 / 720 };
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
const sparkTex = radialTexture([[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,255,255,.9)'], [0.5, 'rgba(160,220,255,.35)'], [1, 'rgba(0,0,0,0)']]);

// ---------------------------------------------------------------- the charm mask: glow, portal, black
// One quad per charm, cut by the silhouette picture. uGlow lights a border around the cut-out, uPortal
// fills it with a swirling portal in that charm's colours, uBlack is the plain black mask left behind.
const PORTAL_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D map; uniform float uTime, uGlow, uPortal, uBlack, uAspect;
  uniform vec3 uA, uB, uC;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; } return v; }
  void main() {
    float a = texture2D(map, vUv).a;
    // soft halo: average of the mask around this pixel, at two radii
    float halo = 0.0;
    for (int i = 0; i < 12; i++) {
      float an = float(i) * 0.5236; vec2 d = vec2(cos(an), sin(an) * uAspect);
      halo += texture2D(map, vUv + d * 0.022).a + texture2D(map, vUv + d * 0.05).a * 0.7;
    }
    halo /= 20.4;
    vec2 q = (vUv - 0.5) * vec2(1.0, 1.0 / uAspect); float r = length(q), ang = atan(q.y, q.x);
    float rim = smoothstep(0.0, 0.55, halo) * (1.0 - a);                    // outside the cut-out
    float edge = a * (1.0 - smoothstep(0.55, 1.0, halo));                   // just inside it
    float sweep = 0.5 + 0.5 * sin(ang * 2.0 - uTime * 3.2);
    vec3 rimCol = mix(uA, uC, sweep) * (1.1 + 0.5 * sin(uTime * 9.0 + ang * 5.0));
    // portal: a spiral falling into the middle
    float sw = ang + 1.6 / (r + 0.18) - uTime * 1.5;
    float n = fbm(vec2(sw * 1.3, r * 5.0 - uTime * 0.9));
    float n2 = fbm(vec2(sw * 2.6 + 3.0, r * 9.0 + uTime * 0.6));
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
function portalMaterial(map, aspect, a, b, c) {
  const m = new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, uTime: { value: 0 }, uGlow: { value: 0 }, uPortal: { value: 0 }, uBlack: { value: 0 }, uAspect: { value: aspect },
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
  init() { try { this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)(); this.ctx.resume(); } catch (e) { /* no audio */ } },
  tone(f0, f1, dur, vol = 0.2, type = 'sine', when = 0) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime + when; const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, vol, hp, lp, when = 0) {
    if (!this.ctx || !this.on) return;
    const n = Math.floor(this.ctx.sampleRate * dur); const b = this.ctx.createBuffer(1, n, this.ctx.sampleRate); const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.6);
    const s = this.ctx.createBufferSource(); s.buffer = b; const g = this.ctx.createGain(); g.gain.value = vol;
    const f1 = this.ctx.createBiquadFilter(); f1.type = 'highpass'; f1.frequency.value = hp;
    const f2 = this.ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = lp;
    s.connect(f1).connect(f2).connect(g).connect(this.ctx.destination); s.start(this.ctx.currentTime + when);
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
};

// ---------------------------------------------------------------- UI
const ui = {
  hint(text) { const h = $('hint'); if (!text) { h.hidden = true; return; } if (h.textContent !== text) h.textContent = text; h.hidden = false; },
  guide(on) { $('guide').classList.toggle('on', on); },
  error(title, body) { $('err-title').textContent = title; $('err-body').textContent = body; $('error').hidden = false; $('splash').hidden = true; },
};

// ---------------------------------------------------------------- assets (loaded behind the splash)
const loader = new GLTFLoader();
const assets = Promise.all([
  loader.loadAsync(BASE + 'ar/bobo-keychain.glb'),
  loader.loadAsync(BASE + 'ar/eclipse-can.glb'),
  loader.loadAsync(BASE + 'ar/old-bobo.glb'),
  fetch(HERE + 'image-targets/layout.json').then((r) => r.json()),
  ...['kc-both', 'kc-bobo', 'kc-can', 'kc-can-art', 'kc-old'].map((n) => fetch(HERE + `image-targets/${n}.json`).then((r) => r.json())),
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
      if ((await DeviceMotionEvent.requestPermission()) !== 'granted') return;
    }
    window.addEventListener('devicemotion', onMotion);
  } catch (e) { /* stay in keychain-relative mode */ }
}

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
  sil.material.map.wrapS = sil.material.map.wrapT = THREE.ClampToEdgeWrapping; sil.material.map.needsUpdate = true;
  sil.material = portalMaterial(sil.material.map, def.w / def.h, ...PORTAL_COLOURS[kind]);
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
  const lie = new THREE.Matrix4().makeScale(def.w, def.h, 1).multiply(new THREE.Matrix4().makeScale(baseScale, baseScale, baseScale).multiply(silLocal).invert());
  const lp = new THREE.Vector3(), lq = new THREE.Quaternion(), ls = new THREE.Vector3(); lie.decompose(lp, lq, ls);
  lp.addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(lq), 0.0025);
  const pd = pad(padR), flash = sprite(glowTex, 0.001);
  const scan = new THREE.Mesh(new THREE.PlaneGeometry(def.w * 0.96, 0.0018), new THREE.MeshBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
  scan.position.z = 0.001;
  const N = 70, geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  const sparks = new THREE.Points(geo, new THREE.PointsMaterial({ map: sparkTex, size: 0.007, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, sizeAttenuation: true }));
  sparks.frustumCulled = false; sparks.userData = { vel: new Float32Array(N * 3), life: new Float32Array(N), next: 0 };
  frame.add(pd, flash, scan, sparks);
  return { key, kind, def, frame, root, model: m, mixer, clips, current: null, baseScale, height, sil, lie: { pos: lp, quat: lq, s: ls.y },
    fx: { glow: 0, portal: 0, black: 0, shake: 0 }, G: { q: new THREE.Quaternion(), flat: 0 }, pad: pd, flash, scan, sparks,
    st: 'idle', steady: 0, landed: false, sils: true };
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
  ({ scene, camera, renderer } = xr);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.6;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x554a66, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(1.5, 3, 4); scene.add(key);
  camera.position.set(0, 0, 0); camera.quaternion.identity();
  XR8.XrController.updateCameraProjectionMatrix({ origin: camera.position, facing: camera.quaternion });

  for (const target of targets) {
    const lay = layout.targets[target.name]; const local = {};
    for (const [k, c] of Object.entries(lay.charms)) local[k] = new THREE.Matrix4().makeTranslation(c.x, c.y, 0).multiply(new THREE.Matrix4().makeRotationZ(c.rz));
    TS[target.name] = { name: target.name, pr: target.properties, lay, local, tracked: false, at: 0, seen: -1e9, p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1, snap: true, g: new THREE.Group() };
  }
  Bcat = B = prepCharacter(bobo, 'bobo', 0.03);
  Bold = prepCharacter(oldBobo, 'bobo', 0.03, 'old');   // the earlier design's Bobo takes the Bobo slot when its charm is the one in view
  ALL = [Bcat, Bold, C = prepCharacter(can, 'can', 0.02)];
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
  if (!t.tracked) t.snap = true;
  t.tracked = true; t.at = performance.now();
}
function onLost(d) { const t = TS[d.name]; if (t) t.tracked = false; }

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
  up.applyQuaternion(toFrame).normalize();
  const camL = f0.worldToLocal(_v.copy(camera.position)).normalize();
  const scrDown = new THREE.Vector3(0, -1, 0).applyQuaternion(toFrame);
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
const _v2 = new THREE.Vector3();
function updateFrames(dt) {
  const now = performance.now();
  for (const t of Object.values(TS)) { if (t.tracked && now - t.at > 500) t.tracked = false; if (t.tracked) { follow(t); t.seen = now; } }
  const on = (n) => (TS[n] && TS[n].tracked ? TS[n] : null), recent = (n, ms) => !!TS[n] && now - TS[n].seen < ms;
  const oldRecent = recent('kc-old', 5000);
  const both = !PAIR || oldRecent ? null : on('kc-both'); pairMaybe = !!both;
  const canT = on('kc-can') || on('kc-can-art');                             // the photo of the real can charm first, the flat art as a second opinion
  if (on('kc-bobo')) conf.bobo = true; if (canT) conf.can = true;
  // one charm's own picture is in view and the other's has not been for a while: the other charm has left
  if (conf.bobo && canT && !recent('kc-bobo', 1500)) conf.bobo = false;
  if (conf.can && on('kc-bobo') && !recent('kc-can', 1500) && !recent('kc-can-art', 1500)) conf.can = false;
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
  const want = on('kc-old') && !on('kc-bobo') ? Bold : on('kc-bobo') && !on('kc-old') ? Bcat : B;
  if (want !== B && !pres.bobo) { B.frame.visible = false; B = want; driver.bobo = null; goneFor.bobo = 9; }
  const pick = !PAIR ? { bobo: B === Bold ? on('kc-old') : on('kc-bobo'), can: canT } : {
    bobo: B === Bold ? on('kc-old') : conf.bobo ? pair || on('kc-bobo') || (pairOff === 0 ? both : null) : null,
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
    if (t && ch.st === 'idle') { groundFrame(ch); ch.sils = t.lay.silhouettes; }   // once it pops, its ground frame is fixed to the charm
  }
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
  for (const ch of ALL) {
    ch.mixer.stopAllAction(); ch.current = null; ch.root.visible = false; ch.landed = false; ch.st = 'idle'; ch.steady = 0; ch.spin = null; ch.walk = null;
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
const startSolo = (ch) => charge([ch], () => launch(ch));
// push the mask state into the shader, and rumble the masks on the charms
let fxTime = 0;
function updateMasks(dt) {
  fxTime += dt;
  for (const ch of ALL) {
    const u = ch.sil.material.uniforms, fx = ch.fx;
    u.uTime.value = fxTime; u.uGlow.value = fx.glow * (0.86 + 0.14 * Math.sin(fxTime * 5.0)); u.uPortal.value = fx.portal; u.uBlack.value = fx.black;
    const s = fx.shake * 0.0007;
    ch.sil.position.set((Math.random() - 0.5) * 2 * s, (Math.random() - 0.5) * 2 * s, 0.0004); ch.sil.rotation.z = (Math.random() - 0.5) * fx.shake * 0.03;
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
    ch.root.position.copy(ch.lie.pos); ch.root.quaternion.copy(ch.lie.quat); ch.root.scale.setScalar(ch.lie.s);
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
      ch.root.scale.setScalar(THREE.MathUtils.lerp(from.s, tune.size, e));
      fx.portal = portal0 * (1 - easeOut(kk * 1.2)); fx.glow = THREE.MathUtils.lerp(Math.max(glow0, 1) * (1 + 0.8 * Math.sin(Math.min(kk * 3, 1) * Math.PI)), 0.28, easeInOut(kk));   // the portal closes to black, the rim stays faintly lit
      const f = Math.sin(Math.min(kk * 1.6, 1) * Math.PI);
      flash.scale.setScalar(0.09 * f + 0.0001); flash.material.opacity = f;
      pd.scale.setScalar((0.2 + 0.8 * easeOut(kk * 1.3)) * tune.size); pd.userData.ring.material.opacity = easeOut(kk);
    }, () => {
      ch.landed = true; ch.st = 'out'; sound.land(); burst(ch, spotOf(ch), 14, 0.07);
      if (!hinted) { hinted = true; ui.hint('Tap for bubbles. Keep tapping!'); after(5, () => { if (!finaleOn && $('hint').textContent.startsWith('Tap for')) ui.hint(''); }); }
    }, ch);
  }, ch);
}
// ---------------------------------------------------------------- bubbles
// Every tap blows bubbles; each tap in a row makes more of them and bigger. The tenth tap is the overflow:
// the can rockets up spinning on a geyser of bubbles and Bobo cheers (Bobo alone gets the geyser himself).
const FINALE = 10;
let bubbleNext = 0;
const upVec = (ch) => new THREE.Vector3(0, 1, 0).applyQuaternion(restQ(ch));
const topOf = (ch) => ch.root.position.clone().addScaledVector(upVec(ch), ch.height * 0.95 * tune.size);
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
  taps++; tapIdle = 0; showFizz();
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

const boboFree = () => live(B) && !B.walk;
function wave() { if (!boboFree()) return; sound.mew(); play(B, 'PawRaise', { loop: false, fade: 0.2, onDone: () => play(B, 'Sit', { fade: 0.3 }) }); }
function wag() { if (!boboFree()) return; sound.bell(); play(B, 'TailWag', { loop: false, fade: 0.2, onDone: () => play(B, 'Sit', { fade: 0.3 }) }); }
function walk() {
  if (!boboFree()) return;
  play(B, 'ClassicWalk', { fade: 0.35 }); B.walk = { a: 0, turn: 0 };
  const who = B;
  tween(4.2, (k) => { who.walk.a = k * Math.PI * 2; who.walk.turn = who.walk.a + Math.PI / 2; }, () => {
    tween(0.4, (k) => { who.walk.turn = THREE.MathUtils.lerp(Math.PI / 2, 0, easeInOut(k)); who.walk.a = 0; }, () => { who.walk = null; play(who, 'Sit', { fade: 0.4 }); }, who);
  }, who);
}
function spinCan() { if (!live(C) || C.spin) return; sound.pop(); C.spin = { k: 0 }; tween(0.9, (k) => { if (C.spin) C.spin.k = k; }, () => { C.spin = null; }, C); }
function replay() { resetScene(); }

// landed characters stand on their spot in their charm's ground frame
function settle() {
  for (const ch of [B, C]) {
    const Q = restQ(ch), pd = ch.pad; pd.position.copy(spotOf(ch)); pd.quaternion.copy(Q); pd.userData.ring.rotation.z += 0.01;
    pd.traverse((o) => { if (o.material) o.material.visible = tune.tilt > 0.5; });   // the landing pad only makes sense when they stand on the ground
    if (!ch.landed) continue;
    ch.root.position.copy(pd.position); ch.root.quaternion.copy(Q); ch.root.scale.setScalar(tune.size); pd.scale.setScalar(tune.size);
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
// Watchdog: on some phones the engine stops looking for pictures after it has lost one. When nothing has
// been tracked for 4 s, hand it the same pictures again (that restarts its search), at most every 5 s.
const diag = { found: 0, lost: 0, resets: 0, last: '', lastAt: 0 };
let lastTrackedAt = 0, lastReset = 0, everTracked = false, activeTargets = [];
function watchdog() {
  const now = performance.now();
  if (Object.values(TS).some((t) => t.tracked)) { lastTrackedAt = now; everTracked = true; return; }
  if (!everTracked || params.has('nowatchdog') || now - lastTrackedAt < 4000 || now - lastReset < 5000) return;
  lastReset = now; diag.resets++;
  try { XR8.XrController.configure({ imageTargetData: activeTargets }); } catch (e) { console.warn('watchdog', e); }
}
function showDiag() {
  const el = $('t-diag'); if (!el || $('tune').hidden) return;
  const on = Object.values(TS).filter((t) => t.tracked).map((t) => t.name).join(', ') || 'nothing';
  el.textContent = `Tracking: ${on}. Found ${diag.found}, lost ${diag.lost}, rescans ${diag.resets}.`;
}
function tick(dt) {
  watchdog(); showDiag();
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
    for (const ch of [B, C]) if (live(ch)) { const n = ch.root.getWorldPosition(_v).project(camera); off = off || Math.abs(n.x) > 0.92 || n.y < -0.86 || n.y > 0.7; }
    const cur = $('hint').textContent;
    if (!present) ui.hint(KEEP); else if (off) ui.hint(PULL); else if (cur === KEEP || cur === PULL || cur === HINT_FIND || cur.startsWith('Found it')) ui.hint('');
  }
  const bo = !boboFree(); for (const id of ['b-wave', 'b-wag', 'b-walk']) $(id).disabled = bo;
  const wagLabel = B === Bold ? 'Dance' : 'Wag tail'; if ($('b-wag').textContent !== wagLabel) $('b-wag').textContent = wagLabel;
  $('b-replay').disabled = $('b-photo').disabled = !(out && present);
  for (let i = tweens.length - 1; i >= 0; i--) {
    const w = tweens[i]; if (!w) continue; if (w.owner && !w.owner.every(inView)) continue; w.t += dt; const k = Math.min(w.t / w.dur, 1); w.fn(k);
    if (k >= 1) { const j = tweens.indexOf(w); if (j >= 0) tweens.splice(j, 1); w.done && w.done(); }
  }
  settle();
  for (const ch of [B, C]) if (pres[ch.key]) ch.mixer.update(dt);           // a character off screen holds still
  updateBubbles(dt); updateMasks(dt);
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
  const dpr = Math.min(devicePixelRatio || 1, HD ? 3 : 2);
  const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}
let last = 0;
const appModule = (data) => ({
  name: 'evade-keychain',
  onStart: () => { buildScene(XR8.Threejs.xrScene(), data); state = 'looking'; $('hud').hidden = false; ui.guide(true); },   // the scene exists from here on
  onUpdate: () => { const now = performance.now(); const dt = Math.min((now - (last || now)) / 1000, 0.05); last = now; if (scene) tick(dt); },
  onCameraStatusChange: ({ status, video }) => {
    if (status === 'requesting') ui.hint('Allow camera access to begin');
    if (status === 'hasVideo') { tuneCamera(video); $('how').hidden = true; $('splash').classList.add('gone'); setTimeout(() => { $('splash').hidden = true; }, 600); }
    if (status === 'failed') ui.error('Camera not available', 'Allow camera access for this site in your browser settings, then reload. On iPhone use Safari; on Android use Chrome.');
  },
  onException: (e) => { console.error('XR', e); ui.error('Something went wrong', String((e && e.message) || e)); },
  listeners: [
    { event: 'reality.imagefound', process: ({ detail }) => { diag.found++; if (DEBUG) console.log('CAMPOSE', JSON.stringify(camera.position.toArray()), JSON.stringify(camera.quaternion.toArray()), 'proj', JSON.stringify(camera.projectionMatrix.elements.map((x) => +x.toFixed(3)))); onTarget(detail); } },
    { event: 'reality.imageupdated', process: ({ detail }) => onTarget(detail) },
    { event: 'reality.imagelost', process: ({ detail }) => { diag.lost++; onLost(detail); } },
    { event: 'reality.imageloading', process: ({ detail }) => DEBUG && console.log('imageloading', JSON.stringify(detail)) },
    { event: 'reality.imagescanning', process: ({ detail }) => DEBUG && console.log('imagescanning', JSON.stringify(detail)) },
  ],
});

// ---------------------------------------------------------------- camera quality
// The engine picks its own camera constraints (high resolution on Android Chrome, a modest minimum elsewhere)
// and tracks on a small greyscale copy of the frame. What we can add from outside:
//  - ask for the sharpest 4:3 stream the phone offers (ideal 1920x1440), falling back to the engine's request;
//  - keep the lens refocusing (a keychain is a close-up subject), where the browser exposes focus;
//  - draw at the screen's full pixel density;
//  - optical/digital zoom where the browser exposes it (Tune > Zoom): more pixels on a far-away charm.
// `?hd=0` turns all of it off, to compare.
const HD = params.get('hd') !== '0';
if (HD && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
  const md = navigator.mediaDevices, orig = md.getUserMedia.bind(md);
  md.getUserMedia = (c) => {
    const v = c && c.video;
    if (!v || v === true || (v.width && v.width.exact) || (v.height && v.height.exact)) return orig(c);
    const sharp = { ...c, video: { ...v, width: { ...(v.width || {}), ideal: 1920 }, height: { ...(v.height || {}), ideal: 1440 } } };
    return orig(sharp).catch(() => orig(c));
  };
}
let camTrack = null;
function tuneCamera(video) {
  try {
    camTrack = video && video.srcObject && video.srcObject.getVideoTracks()[0]; if (!camTrack) return;
    const st = camTrack.getSettings ? camTrack.getSettings() : {}, caps = camTrack.getCapabilities ? camTrack.getCapabilities() : {};
    $('t-cam').textContent = `Camera ${st.width || video.videoWidth}×${st.height || video.videoHeight}${st.frameRate ? ' at ' + Math.round(st.frameRate) + ' fps' : ''}`;
    if (!HD) return;
    if (caps.focusMode && caps.focusMode.includes('continuous')) camTrack.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
    if (caps.zoom && caps.zoom.max > caps.zoom.min) {
      const z = $('t-zoom'); z.min = caps.zoom.min; z.max = Math.min(caps.zoom.max, 4); z.step = caps.zoom.step || 0.1; z.value = st.zoom || caps.zoom.min;
      for (const el of document.querySelectorAll('.zoom')) el.hidden = false;
      const show = () => { $('t-zoom-v').textContent = (+z.value).toFixed(1) + '×'; }; show();
      z.oninput = () => { show(); camTrack.applyConstraints({ advanced: [{ zoom: +z.value }] }).catch(() => {}); };
    }
  } catch (e) { /* the camera still works without these */ }
}

async function start() {
  if (!loaded) return;
  $('b-go').disabled = true; $('b-go').textContent = 'Starting…';
  sound.init(); await askMotion();
  const data = await assets;
  sizeCanvas(); addEventListener('resize', sizeCanvas); addEventListener('orientationchange', () => setTimeout(sizeCanvas, 300));
  activeTargets = data.slice(4).filter((t) => (PAIR || t.name !== 'kc-both') && (!params.get('only') || t.name === params.get('only')));
  XR8.XrController.configure({ disableWorldTracking: true, imageTargetData: activeTargets });
  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(),
    XR8.Threejs.pipelineModule(),
    XR8.XrController.pipelineModule(),
    XR8.CanvasScreenshot.pipelineModule(),
    appModule(data),
  ]);
  XR8.run({ canvas, allowedDevices: XR8.XrConfig.device().ANY, cameraConfig: { direction: XR8.XrConfig.camera().BACK } });
}

// ---------------------------------------------------------------- input
$('b-start').onclick = () => { if (loaded) { $('how').hidden = false; $('b-go').focus(); } };   // the splash leads to the what-to-point-at screen
$('b-go').onclick = start;
$('b-back').onclick = () => { $('how').hidden = true; $('b-start').focus(); };
$('b-wave').onclick = wave; $('b-wag').onclick = wag; $('b-walk').onclick = walk; $('b-replay').onclick = replay;
$('b-sound').onclick = () => { sound.on = !sound.on; $('b-sound').setAttribute('aria-pressed', String(sound.on)); $('b-sound').textContent = sound.on ? 'Sound on' : 'Sound off'; };
$('b-photo').onclick = async () => {
  try {
    const b64 = await XR8.CanvasScreenshot.takeScreenshot();
    const blob = await (await fetch('data:image/jpeg;base64,' + b64)).blob();
    const file = new File([blob], `bobo-keychain-${++shots}.jpg`, { type: 'image/jpeg' });
    const url = URL.createObjectURL(blob);
    $('shot-img').src = url; $('shot-save').href = url; $('shot-save').download = file.name;
    const canShare = navigator.canShare && navigator.canShare({ files: [file] });
    $('shot-share').hidden = !canShare;
    $('shot-share').onclick = () => navigator.share({ files: [file], title: 'Bobo popped out of my EVADE keychain' }).catch(() => {});
    $('shot').hidden = false; sound.tone(1200, 1800, 0.08, 0.1);
  } catch (e) { console.error(e); }
};
$('shot-close').onclick = () => { $('shot').hidden = true; };
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
showTune();

const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2(); let down = null;
canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', (e) => {
  if (!down || !camera || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 10) return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = (ch) => live(ch) && ray.ray.intersectsBox(new THREE.Box3().setFromObject(ch.root));
  if (!present) return;
  if (hit(B)) { wave(); tapBubbles(B); } else { if (hit(C)) spinCan(); tapBubbles(C); }   // a tap anywhere else fizzes the can (or Bobo, if he is on his own)
});

// desktop: offer the phone hand-off, but the webcam works too
const mobile = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900;
if (!mobile) {
  $('desk').hidden = false;
  try { window.QRCode && QRCode.toString(location.href, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }, (err, svg) => { if (!err) $('qr').innerHTML = svg; }); } catch (e) { /* no QR */ }
}

// the camera guide cycles through the three things to look for
{ const imgs = [...document.querySelectorAll('#guide img')]; let gi = 0; setInterval(() => { gi = (gi + 1) % imgs.length; imgs.forEach((im, i) => im.classList.toggle('show', i === gi)); }, 1700); }

window.__ar = { diag, get state() { return state; }, get old() { return B === Bold; }, conf, get pairOff() { return pairOff; }, TS, charm, pres, get drivers() { return { bobo: driver.bobo && driver.bobo.name, can: driver.can && driver.can.name }; }, replay, gravity, get B() { return B; }, get C() { return C; }, get camera() { return camera; }, get present() { return present; }, tune, get taps() { return taps; }, tapBubbles, tick, get bubbles() { return bubbles.filter((b) => b.life > 0).length; } };
