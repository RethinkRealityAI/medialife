// EVADE keychain AR: point the camera at the keychain and Bobo and the Eclipse can jump off their
// charms, leaving black silhouettes behind. Image tracking by the open-source 8th Wall engine
// (github.com/8thwall/8thwall, MIT), self-hosted in ./vendor/xr. Rendering is plain three.js.
//
// How the alignment works: the image target is the Bobo charm and the can charm together as they sit on
// the keychain (a second target recognises the earlier keychain design; it has no silhouettes). image-targets/layout.json says where that picture sits in keychain space (metres),
// which fixes each charm's frame. The silhouette quad that ships inside each GLB covers exactly its
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
};
// landed sizes and spots (metres), in the "ground frame": x right, y up (gravity), z toward the viewer
const SIZE = { bobo: 0.042, can: 0.031 };     // a little smaller than the prints, so both fit on screen up close
const SPOT = {
  bobo: (flat) => new THREE.Vector3(-0.009, -0.06 * (1 - flat), 0.015 + 0.06 * flat),
  can: (flat) => new THREE.Vector3(0.026, -0.06 * (1 - flat), 0.014 + 0.06 * flat),
};

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
  buttons(on) { for (const id of ['b-wave', 'b-wag', 'b-walk', 'b-replay', 'b-photo']) $(id).disabled = !on; },
  error(title, body) { $('err-title').textContent = title; $('err-body').textContent = body; $('error').hidden = false; $('splash').hidden = true; },
};

// ---------------------------------------------------------------- assets (loaded behind the splash)
const loader = new GLTFLoader();
const assets = Promise.all([
  loader.loadAsync(BASE + 'ar/bobo-keychain.glb'),
  loader.loadAsync(BASE + 'ar/eclipse-can.glb'),
  fetch(HERE + 'image-targets/kc-both.json').then((r) => r.json()),
  fetch(HERE + 'image-targets/kc-old.json').then((r) => r.json()),
  fetch(HERE + 'image-targets/layout.json').then((r) => r.json()),
]);
const xrReady = new Promise((res) => (window.XR8 ? res() : window.addEventListener('xrloaded', () => res(), { once: true })));
let loaded = false;
Promise.all([assets, xrReady]).then(() => { loaded = true; $('b-start').disabled = false; $('b-start').textContent = 'Start camera'; $('load').hidden = true; })
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
const TS = {};               // tracker state per image target (the cat keychain and the earlier design)
let T = null;                // the target being followed right now
let kc;                      // the tracked picture: a group in metres, centred on the target, follows it rigidly
const charm = {};            // THREE.Group per charm inside kc, in charm space (metres)
let stage;                   // the Bobo charm frame again: the characters live in it
const G = { q: new THREE.Quaternion(), flat: 0 };   // ground frame inside the stage
const bubbles = []; let taps = 0, tapIdle = 0, finaleOn = false;
let B, C; const PADS = {}; let flashB, flashC, scanB, scanC, sparks;
const tweens = [];
const tween = (dur, fn, done) => tweens.push({ t: 0, dur, fn, done });
const after = (delay, fn) => tween(delay, () => {}, fn);
let state = 'idle';          // idle -> looking -> popping -> ready
let steady = 0, lostFor = 0, shots = 0;

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

function prepCharacter(gltf, height, charmGroup, def) {
  const root = new THREE.Group(); const m = gltf.scene;
  // the silhouette quad comes off the model and is pinned to the charm frame
  const sil = m.getObjectByName('Silhouette'); sil.updateMatrix(); const silLocal = sil.matrix.clone(); sil.removeFromParent();
  sil.material = new THREE.MeshBasicMaterial({ color: 0x000000, map: sil.material.map, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  sil.renderOrder = 5; sil.visible = false;
  sil.position.set(0, 0, 0.0004); sil.quaternion.identity(); sil.scale.set(def.w, def.h, 1);
  charmGroup.add(sil);
  const mixer = new THREE.AnimationMixer(m);
  const clips = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
  const rest = clips.Sit || clips.Idle; mixer.clipAction(rest).play(); mixer.setTime(0); m.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(m, true); const h = box.max.y - box.min.y; mixer.stopAllAction();
  const baseScale = height / h; m.scale.setScalar(baseScale);
  m.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  root.add(m); root.visible = false; stage.add(root);
  return { root, model: m, mixer, clips, current: null, baseScale, height, sil, silLocal, charm: charmGroup };
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

function buildScene(xr, [bobo, can, tNew, tOld, layout]) {
  ({ scene, camera, renderer } = xr);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.6;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x554a66, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(1.5, 3, 4); scene.add(key);
  camera.position.set(0, 0, 0); camera.quaternion.identity();
  XR8.XrController.updateCameraProjectionMatrix({ origin: camera.position, facing: camera.quaternion });

  kc = new THREE.Group(); kc.visible = false; scene.add(kc);
  for (const target of [tNew, tOld]) {
    TS[target.name] = { name: target.name, pr: target.properties, lay: layout.targets[target.name], tracked: false, at: 0, p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1, snap: true };
  }
  for (const [k, def] of Object.entries(CHARMS)) {
    charm[k] = new THREE.Group(); kc.add(charm[k]);
    if (DEBUG) {
      const fr = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(def.w, def.h)), new THREE.LineBasicMaterial({ color: k === 'bobo' ? 0x4fb4ff : 0xe85bd8, depthTest: false }));
      fr.renderOrder = 30; charm[k].add(fr);
    }
  }
  stage = new THREE.Group(); kc.add(stage);
  useTarget(TS[tNew.name]);
  B = prepCharacter(bobo, SIZE.bobo, charm.bobo, CHARMS.bobo);
  C = prepCharacter(can, SIZE.can, charm.can, CHARMS.can);
  PADS.bobo = pad(0.023); PADS.can = pad(0.016); stage.add(PADS.bobo, PADS.can);
  flashB = sprite(glowTex, 0.001); flashC = sprite(glowTex, 0.001); stage.add(flashB, flashC);
  const scanMat = () => new THREE.MeshBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
  scanB = new THREE.Mesh(new THREE.PlaneGeometry(CHARMS.bobo.w * 0.96, 0.0018), scanMat()); scanB.position.z = 0.001; charm.bobo.add(scanB);
  scanC = new THREE.Mesh(new THREE.PlaneGeometry(CHARMS.can.w * 0.96, 0.0018), scanMat()); scanC.position.z = 0.001; charm.can.add(scanC);
  // sparkle burst
  const N = 90; const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  sparks = new THREE.Points(geo, new THREE.PointsMaterial({ map: sparkTex, size: 0.007, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, sizeAttenuation: true }));
  for (let i = 0; i < 90; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTex, transparent: true, depthWrite: false, depthTest: false }));
    sp.visible = false; sp.renderOrder = 25; stage.add(sp); bubbles.push({ sp, life: 0, max: 1, vel: new THREE.Vector3(), size: 0.01, ph: 0 });
  }
  sparks.frustumCulled = false; sparks.userData = { vel: new Float32Array(N * 3), life: new Float32Array(N), next: 0 }; stage.add(sparks);
}

function burst(at, n = 40, speed = 0.16) {
  const pos = sparks.geometry.attributes.position; const u = sparks.userData;
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
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
// put the charm frames (and the stage, which is the Bobo charm frame) where this target's layout says they are
function useTarget(t) {
  T = t;
  for (const [k, g] of [['bobo', charm.bobo], ['can', charm.can], ['bobo', stage]]) {
    const c = t.lay.charms[k]; g.position.set(c.x, c.y, 0); g.rotation.set(0, 0, c.rz);
  }
  t.snap = true;
}
function onTarget(d) {
  const t = TS[d.name]; if (!t) return;
  const now = performance.now(); t.seen = now;
  // Both designs carry the same Eclipse can, so the cat keychain's target can lock onto the old keychain's
  // can. The old design's target is its Bobo charm alone, which only exists on the old keychain: it wins,
  // and for a few seconds after it was last seen the cat target is not believed.
  const old = TS['kc-old'];
  if (t !== old && old && now - (old.seen || -1e9) < 5000) return;
  if (t !== T) useTarget(t);
  const upp = d.scale * (d.scaledHeight || 1) / t.pr.height;               // world units per target pixel
  t.q.set(d.rotation.x, d.rotation.y, d.rotation.z, d.rotation.w);
  t.p.set(d.position.x, d.position.y, d.position.z);                       // centre of the target picture
  t.s = t.pr.height * upp / t.lay.heightM;                                           // world units per metre
  if (!t.tracked) t.snap = true;
  t.tracked = true; t.at = now;
}
function onLost(d) { const t = TS[d.name]; if (t) { t.tracked = false; if (t.name === 'kc-old') t.seen = -1e9; } }

// Stick to the print: follow real movement at once, and only smooth out the sub-millimetre jitter of a
// keychain that is being held still (any lag here shows up as the 3D sliding off the charms).
function follow() {
  const t = T, g = kc, clamp = THREE.MathUtils.clamp;
  const aP = t.snap ? 1 : clamp(g.position.distanceTo(t.p) / t.s / 0.0025, 0.3, 1);
  const aR = t.snap ? 1 : clamp(g.quaternion.angleTo(t.q) / 0.04, 0.3, 1);
  const aS = t.snap ? 1 : clamp(Math.abs(g.scale.x - t.s) / t.s / 0.03, 0.3, 1);
  t.snap = false;
  g.position.lerp(t.p, aP); g.quaternion.slerp(t.q, aR); g.scale.setScalar(THREE.MathUtils.lerp(g.scale.x, t.s, aS));
}
let present = false, gone = 0;           // is the keychain in view right now (with a short grace so it does not flicker)
const _sq = new THREE.Quaternion();
function updateFrames(dt) {
  if (T.tracked && performance.now() - T.at > 500) T.tracked = false;      // no pose for half a second: lost
  if (T.tracked) follow();
  gone = T.tracked ? 0 : gone + dt; present = T.tracked || (present && gone < 0.25);
  kc.visible = present; kc.updateMatrixWorld(true);                        // nothing is drawn unless it is tracked now
  if (state !== 'looking' && state !== 'idle') return;   // once they pop, the ground frame is fixed to the keychain

  // ground frame: up from gravity when the phone reports it, else the top of the screen
  const toStage = _q.copy(stage.getWorldQuaternion(_sq)).invert().multiply(camera.quaternion);       // camera space -> stage space
  const up = new THREE.Vector3(0, 1, 0);
  if (gravity.up && performance.now() - gravity.t < 1500) up.copy(gravity.up);
  up.applyQuaternion(toStage).normalize();
  // "forward" is toward the viewer along the ground; looking straight down, that is the bottom of the screen
  const camL = stage.worldToLocal(_v.copy(camera.position)).normalize();
  const scrDown = new THREE.Vector3(0, -1, 0).applyQuaternion(toStage);
  const f = camL.clone().addScaledVector(up, -camL.dot(up)).add(scrDown.addScaledVector(up, -scrDown.dot(up)).multiplyScalar(0.6));
  if (f.lengthSq() < 1e-8) f.set(0, 0, 1); f.normalize();
  const r = new THREE.Vector3().crossVectors(up, f).normalize();
  _q.setFromRotationMatrix(_m.makeBasis(r, up, f));
  G.q.copy(_q); G.flat = Math.min(Math.abs(up.z) * 1.25, 1);
}
const spotOf = (k) => SPOT[k](G.flat).applyQuaternion(G.q);

// where a character lies exactly over its print, in stage space
function charmPose(ch) {
  ch.sil.updateWorldMatrix(true, false);
  _m.makeScale(ch.baseScale, ch.baseScale, ch.baseScale).multiply(ch.silLocal).invert();
  _m2.copy(stage.matrixWorld).invert().multiply(ch.sil.matrixWorld).multiply(_m);
  const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
  _m2.decompose(pos, quat, scl);
  pos.addScaledVector(_v.set(0, 0, 1).applyQuaternion(quat), 0.0025);
  return { pos, quat, s: scl.y };
}

// ---------------------------------------------------------------- the pop-out
function resetScene() {
  tweens.length = 0; taps = 0; finaleOn = false; C.spin = null; showFizz(); for (const b of bubbles) { b.life = 0; b.sp.visible = false; }
  for (const ch of [B, C]) {
    ch.mixer.stopAllAction(); ch.current = null; ch.root.visible = false; ch.landed = false;
    ch.sil.visible = DEBUG && T.lay.silhouettes; ch.sil.material.opacity = DEBUG ? 0.45 : 0;
    if (DEBUG) ch.sil.material.color.set(ch === B ? 0x2060ff : 0xff30c0);
  }
  PADS.bobo.visible = PADS.can.visible = false;
  for (const m of [flashB, flashC, scanB, scanC]) m.material.opacity = 0;
  ui.buttons(false);
}
function popOut() {
  resetScene(); state = 'popping'; ui.hint(''); ui.guide(false); sound.scan();
  tween(reduceMotion ? 0.01 : 0.7, (k) => {
    const o = Math.sin(k * Math.PI) * 0.9;
    scanB.position.y = THREE.MathUtils.lerp(0.5, -0.5, k) * CHARMS.bobo.h; scanB.material.opacity = o;
    scanC.position.y = THREE.MathUtils.lerp(0.5, -0.5, k) * CHARMS.can.h; scanC.material.opacity = o;
  }, () => {
    scanB.material.opacity = scanC.material.opacity = 0;
    launch(C, 'can', flashC);                                             // the can pops first
    after(reduceMotion ? 0.01 : 0.55, () => launch(B, 'bobo', flashB));   // then Bobo
  });
}
function launch(ch, k, flash) {
  const isBobo = ch === B; const pd = PADS[k];
  ch.root.visible = true; ch.sil.visible = T.lay.silhouettes;
  play(ch, 'PopOut', { loop: false, fade: 0, onDone: () => {
    if (isBobo) {
      sound.bell(); sound.mew();
      play(B, 'TailWag', { loop: false, fade: 0.25, onDone: () => play(B, 'Sit', { fade: 0.3 }) });
      state = 'ready'; ui.buttons(true); ui.hint('Tap Bobo or the can for bubbles. Keep tapping!'); after(5, () => { if (state === 'ready' && !finaleOn) ui.hint(''); });
    } else play(ch, 'Idle', { fade: 0.3 });
  } });
  const pop = ch.current; pop.paused = true;
  const place = (wig) => {
    const p = charmPose(ch);
    ch.root.position.copy(p.pos); ch.root.quaternion.copy(p.quat); ch.root.scale.setScalar(p.s);
    if (wig) ch.root.rotateZ(wig);
    return p;
  };
  place(0); ch.mixer.update(0);
  tween(reduceMotion ? 0.01 : 0.38, (kk) => {                             // a shiver, still stuck to the charm
    ch.sil.material.opacity = Math.max(ch.sil.material.opacity, Math.min(kk * 4, 1));
    place(Math.sin(kk * Math.PI * 5) * 0.05 * kk);
  }, () => {
    const from = place(0); pop.paused = false; ch.sil.material.opacity = 1;
    sound.pop(); if (!isBobo) sound.fizz();
    pd.visible = true; flash.position.copy(from.pos); burst(from.pos, isBobo ? 50 : 34);
    tween(reduceMotion ? 0.01 : 1.0, (kk) => {                            // it flies to its spot; the silhouette stays
      const e = easeOut(kk); const to = spotOf(k);
      ch.root.position.lerpVectors(from.pos, to, e).addScaledVector(_v.set(0, 1, 0).applyQuaternion(G.q), Math.sin(kk * Math.PI) * 0.04);
      ch.root.quaternion.slerpQuaternions(from.quat, G.q, easeOut(kk * 2));
      ch.root.scale.setScalar(THREE.MathUtils.lerp(from.s, 1, e));
      const f = Math.sin(Math.min(kk * 1.6, 1) * Math.PI);
      flash.scale.setScalar(0.09 * f + 0.0001); flash.material.opacity = f;
      pd.scale.setScalar(0.2 + 0.8 * easeOut(kk * 1.3)); pd.userData.ring.material.opacity = easeOut(kk);
    }, () => { ch.landed = true; sound.land(); burst(spotOf(k), 14, 0.07); });
  });
}
// ---------------------------------------------------------------- bubbles
// Every tap blows bubbles; each tap in a row makes more of them and bigger. The tenth tap is the Eclipse
// overflow: the can rockets up spinning on a geyser of bubbles and Bobo cheers.
const FINALE = 10;
let bubbleNext = 0;
const upVec = () => new THREE.Vector3(0, 1, 0).applyQuaternion(G.q);
const topOf = (ch) => ch.root.position.clone().addScaledVector(upVec(), ch.height * 0.95);
function blow(at, n, size, speed = 0.05, spread = 0.5) {
  const up = upVec();
  for (let i = 0; i < n; i++) {
    const b = bubbles[bubbleNext]; bubbleNext = (bubbleNext + 1) % bubbles.length;
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
  if (finaleOn || !ch.landed) return;
  taps++; tapIdle = 0; showFizz();
  if (taps >= FINALE) { finale(); return; }
  sound.blip(taps);
  blow(topOf(ch), 2 + taps * 2, 0.005 + taps * 0.0016, 0.04 + taps * 0.004);
}
function finale() {
  finaleOn = true; sound.fanfare(); sound.bell(); ui.hint('Eclipse overflow!');
  C.spin = { k: 0, turns: 4, lift: 0.05 };
  play(B, 'PawRaise', { loop: false, fade: 0.2, onDone: () => play(B, 'TailWag', { loop: false, fade: 0.2, onDone: () => play(B, 'Sit', { fade: 0.3 }) }) });
  burst(topOf(C), 60, 0.2); flashC.position.copy(topOf(C));
  tween(2.4, (k) => {
    C.spin.k = Math.min(k * 1.15, 1);
    if (k < 0.85) { blow(topOf(C), 2, 0.012 + Math.random() * 0.016, 0.13, 0.35); if (Math.random() < 0.3) blow(topOf(B), 1, 0.012, 0.06); }
    const f = Math.sin(Math.min(k * 3, 1) * Math.PI); flashC.scale.setScalar(0.06 * f + 0.0001); flashC.material.opacity = f;
  }, () => {
    C.spin = null; burst(topOf(C), 40, 0.14); sound.land();
    after(1.4, () => { finaleOn = false; taps = 0; showFizz(); if ($('hint').textContent === 'Eclipse overflow!') ui.hint(''); });
  });
}

function wave() { if (state !== 'ready') return; sound.mew(); play(B, 'PawRaise', { loop: false, fade: 0.2, onDone: () => play(B, 'Sit', { fade: 0.3 }) }); }
function wag() { if (state !== 'ready') return; sound.bell(); play(B, 'TailWag', { loop: false, fade: 0.2, onDone: () => play(B, 'Sit', { fade: 0.3 }) }); }
function walk() {
  if (state !== 'ready') return; state = 'walking'; ui.buttons(false);
  play(B, 'ClassicWalk', { fade: 0.35 }); B.walk = { a: 0, turn: 0 };
  tween(4.2, (k) => { B.walk.a = k * Math.PI * 2; B.walk.turn = B.walk.a + Math.PI / 2; }, () => {
    tween(0.4, (k) => { B.walk.turn = THREE.MathUtils.lerp(Math.PI / 2, 0, easeInOut(k)); B.walk.a = 0; }, () => {
      B.walk = null; play(B, 'Sit', { fade: 0.4 }); state = 'ready'; ui.buttons(true);
    });
  });
}
function spinCan() { if (!C.landed || C.spin) return; sound.pop(); C.spin = { k: 0 }; tween(0.9, (k) => { C.spin.k = k; }, () => { C.spin = null; }); }
function replay() { resetScene(); state = 'looking'; steady = 0; }

// landed characters ride the ground frame (it re-levels as the keychain or the phone moves)
function settle() {
  const upG = _v.set(0, 1, 0).applyQuaternion(G.q).clone();
  for (const [ch, k] of [[B, 'bobo'], [C, 'can']]) {
    const pd = PADS[k]; pd.position.copy(spotOf(k)); pd.quaternion.copy(G.q); pd.userData.ring.rotation.z += 0.01;
    if (!ch.landed) continue;
    ch.root.position.copy(pd.position); ch.root.quaternion.copy(G.q);
    if (ch === B && B.walk) {
      const R = 0.018; ch.root.position.add(_v.set(Math.sin(B.walk.a) * R, 0, (Math.cos(B.walk.a) - 1) * R).applyQuaternion(G.q)); ch.root.rotateY(B.walk.turn);
    }
    if (ch === C && C.spin) { ch.root.rotateY(Math.PI * 2 * (C.spin.turns || 1) * easeInOut(C.spin.k)); ch.root.position.addScaledVector(upG, Math.sin(C.spin.k * Math.PI) * (C.spin.lift || 0.02)); }
  }
}

function tick(dt) {
  updateFrames(dt);
  // state: wait until the Bobo charm (or the can charm) has been held steady for a moment
  const seen = T.tracked;
  if (state === 'looking') {
    steady = seen ? steady + dt : 0; ui.guide(!seen);
    ui.hint(seen ? 'Found it. Hold still…' : 'Point your camera at Bobo and the can on your keychain');
    if (steady > 0.6 && !params.has('nopop')) popOut();
  } else if (state !== 'idle') {
    lostFor = seen ? 0 : lostFor + dt;
    const PULL = 'Move back a little to see Bobo and the can', KEEP = 'Point at the keychain to bring Bobo back';
    let off = false;
    ui.guide(!present); ui.buttons(present && state === 'ready');
    if (present && B.landed) { const n = B.root.getWorldPosition(_v).project(camera); off = Math.abs(n.x) > 0.92 || n.y < -0.86 || n.y > 0.7; }
    const cur = $('hint').textContent;
    if (!present) ui.hint(KEEP); else if (off) ui.hint(PULL); else if (cur === KEEP || cur === PULL) ui.hint('');
  }
  for (let i = tweens.length - 1; i >= 0; i--) {
    const w = tweens[i]; if (!w) continue; w.t += dt; const k = Math.min(w.t / w.dur, 1); w.fn(k);
    if (k >= 1) { const j = tweens.indexOf(w); if (j >= 0) tweens.splice(j, 1); w.done && w.done(); }
  }
  settle();
  B.mixer.update(dt); C.mixer.update(dt);
  updateBubbles(dt);
  if (taps && !finaleOn) { tapIdle += dt; if (tapIdle > 6) { taps = 0; showFizz(); } }   // the fizz goes flat if you stop tapping
  // sparks
  const pos = sparks.geometry.attributes.position, u = sparks.userData; let alive = 0;
  const down = _v.set(0, -1, 0).applyQuaternion(G.q);
  for (let i = 0; i < u.life.length; i++) {
    if (u.life[i] <= 0) continue; u.life[i] -= dt; alive++;
    u.vel[i * 3] += down.x * 0.25 * dt; u.vel[i * 3 + 1] += down.y * 0.25 * dt; u.vel[i * 3 + 2] += down.z * 0.25 * dt;
    pos.setXYZ(i, pos.getX(i) + u.vel[i * 3] * dt, pos.getY(i) + u.vel[i * 3 + 1] * dt, pos.getZ(i) + u.vel[i * 3 + 2] * dt);
    if (u.life[i] <= 0) pos.setXYZ(i, 0, 0, -1e4);
  }
  pos.needsUpdate = true; sparks.material.opacity = alive ? 0.95 : 0;
}

// ---------------------------------------------------------------- 8th Wall pipeline
const canvas = $('cam');
function sizeCanvas() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}
let last = 0;
const appModule = (data) => ({
  name: 'evade-keychain',
  onStart: () => { buildScene(XR8.Threejs.xrScene(), data); state = 'looking'; $('hud').hidden = false; ui.guide(true); },
  onUpdate: () => { const now = performance.now(); const dt = Math.min((now - (last || now)) / 1000, 0.05); last = now; if (scene) tick(dt); },
  onCameraStatusChange: ({ status }) => {
    if (status === 'requesting') ui.hint('Allow camera access to begin');
    if (status === 'hasVideo') { $('splash').classList.add('gone'); setTimeout(() => { $('splash').hidden = true; }, 600); }
    if (status === 'failed') ui.error('Camera not available', 'Allow camera access for this site in your browser settings, then reload. On iPhone use Safari; on Android use Chrome.');
  },
  onException: (e) => { console.error('XR', e); ui.error('Something went wrong', String((e && e.message) || e)); },
  listeners: [
    { event: 'reality.imagefound', process: ({ detail }) => { if (DEBUG) console.log('CAMPOSE', JSON.stringify(camera.position.toArray()), JSON.stringify(camera.quaternion.toArray()), 'proj', JSON.stringify(camera.projectionMatrix.elements.map((x) => +x.toFixed(3)))); onTarget(detail); } },
    { event: 'reality.imageupdated', process: ({ detail }) => onTarget(detail) },
    { event: 'reality.imagelost', process: ({ detail }) => onLost(detail) },
    { event: 'reality.imageloading', process: ({ detail }) => DEBUG && console.log('imageloading', JSON.stringify(detail)) },
    { event: 'reality.imagescanning', process: ({ detail }) => DEBUG && console.log('imagescanning', JSON.stringify(detail)) },
  ],
});

async function start() {
  if (!loaded) return;
  $('b-start').disabled = true; $('b-start').textContent = 'Starting…';
  sound.init(); await askMotion();
  const data = await assets;
  sizeCanvas(); addEventListener('resize', sizeCanvas); addEventListener('orientationchange', () => setTimeout(sizeCanvas, 300));
  XR8.XrController.configure({ disableWorldTracking: true, imageTargetData: [data[2], data[3]].filter((t) => !params.get('only') || t.name === params.get('only')) });
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
$('b-start').onclick = start;
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

const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2(); let down = null;
canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', (e) => {
  if (!down || !camera || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 10) return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = (ch) => present && ch.landed && ray.ray.intersectsBox(new THREE.Box3().setFromObject(ch.root));
  if (!present || (state !== 'ready' && state !== 'walking')) return;
  if (hit(B)) { wave(); tapBubbles(B); } else { if (hit(C)) spinCan(); tapBubbles(C); }   // a tap anywhere else fizzes the can
});

// desktop: offer the phone hand-off, but the webcam works too
const mobile = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900;
if (!mobile) {
  $('desk').hidden = false;
  try { window.QRCode && QRCode.toString(location.href, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }, (err, svg) => { if (!err) $('qr').innerHTML = svg; }); } catch (e) { /* no QR */ }
}

window.__ar = { get state() { return state; }, get T() { return T; }, get kc() { return kc; }, charm, get stage() { return stage; }, G, popOut, replay, gravity, get B() { return B; }, get C() { return C; }, get camera() { return camera; }, get present() { return present; }, get taps() { return taps; }, tapBubbles, tick, get bubbles() { return bubbles.filter((b) => b.life > 0).length; } };
