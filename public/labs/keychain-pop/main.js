// Keychain pop-out lab: plain three.js copy of the Mattercraft KeychainPopOut component.
// The keychain is the existing 3D keychain model standing in for the real one under the camera.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const BASE = '/evade/keychain/';
const $ = (id) => document.getElementById(id);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas = $('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0b0d12');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3346, 1.5));
const key = new THREE.DirectionalLight(0xffffff, 1.7); key.position.set(1.5, 3, 4); scene.add(key);
const rim = new THREE.DirectionalLight(0xc88cff, 0.9); rim.position.set(-3, 2, -2); scene.add(rim);

const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50);
camera.position.set(0, 0.45, 4.1);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.0, 0.3);
controls.enableDamping = true; controls.enablePan = false;
controls.minDistance = 2.2; controls.maxDistance = 6;
controls.minPolarAngle = 0.6; controls.maxPolarAngle = 1.75;
controls.minAzimuthAngle = -1.2; controls.maxAzimuthAngle = 1.2;

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  // keep everything in frame on a phone held upright
  camera.fov = w / h < 0.75 ? 52 : 35;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ---------------------------------------------------------------- helpers
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
const padTex = radialTexture([[0, 'rgba(79,180,255,.0)'], [0.62, 'rgba(79,180,255,.0)'], [0.7, 'rgba(79,180,255,.9)'], [0.78, 'rgba(232,91,216,.55)'], [1, 'rgba(0,0,0,0)']]);
const shadowTex = radialTexture([[0, 'rgba(0,0,0,.55)'], [1, 'rgba(0,0,0,0)']]);

function sprite(tex, size, additive = true) {
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const s = new THREE.Sprite(m); s.scale.setScalar(size); return s;
}
function pad(r) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.CircleGeometry(r, 64), new THREE.MeshBasicMaterial({ map: padTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const sh = new THREE.Mesh(new THREE.CircleGeometry(r * 0.75, 48), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  ring.rotation.x = sh.rotation.x = -Math.PI / 2; sh.position.y = 0.002;
  g.add(sh, ring); g.userData.ring = ring; return g;
}

// ---------------------------------------------------------------- load
const loader = new GLTFLoader();
const [kc, bobo, can] = await Promise.all([
  loader.loadAsync(BASE + 'evade-keychain.glb'),
  loader.loadAsync(BASE + 'ar/bobo-keychain.glb'),
  loader.loadAsync(BASE + 'ar/eclipse-can.glb'),
]);
$('loading').remove();

// keychain hangs top-centre, 8x real size (the cat charm is ~0.6 units tall here)
const KS = 8;
const keychain = kc.scene; keychain.scale.setScalar(KS); keychain.position.set(0, 1.18, 0);
scene.add(keychain);
const charmBobo = keychain.getObjectByName('Charm_Bobo');
const charmCan = keychain.getObjectByName('Charm_Eclipse');
keychain.updateMatrixWorld(true);
const centreOf = (o) => new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());

// characters
const FLOOR_Y = -0.5;
function prepCharacter(gltf, height) {
  const root = new THREE.Group(); const m = gltf.scene;
  const mixer = new THREE.AnimationMixer(m);
  const clips = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
  // measure in the resting clip (Bobo's bind pose is on all fours, the keychain pose is sitting)
  const restClip = clips.Sit || clips.Idle;
  if (restClip) { mixer.clipAction(restClip).play(); mixer.setTime(0); }
  m.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(m, true); const h = box.max.y - box.min.y;
  mixer.stopAllAction();
  m.scale.setScalar(height / h);
  root.add(m); root.visible = false; scene.add(root);
  m.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; } });
  return { root, model: m, mixer, clips, current: null, baseScale: height / h, height };
}
const B = prepCharacter(bobo, 0.78);
const C = prepCharacter(can, 0.56);
const PADS = { bobo: pad(0.42), can: pad(0.3) };
const SPOT = { bobo: new THREE.Vector3(-0.36, FLOOR_Y, 0.62), can: new THREE.Vector3(0.42, FLOOR_Y, 0.58) };
PADS.bobo.position.copy(SPOT.bobo); PADS.can.position.copy(SPOT.can);
scene.add(PADS.bobo, PADS.can);
for (const p of Object.values(PADS)) p.visible = false;

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

// ---------------------------------------------------------------- effects
const scanBar = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.018), new THREE.MeshBasicMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
scanBar.position.z = 0.06; scene.add(scanBar);
const flashB = sprite(glowTex, 0.01), flashC = sprite(glowTex, 0.01);
scene.add(flashB, flashC);

// ---------------------------------------------------------------- the pop-out sequence
const tweens = [];
function tween(dur, fn, done) { tweens.push({ t: 0, dur, fn, done }); }
let state = 'idle';
function setButtons(on) { for (const id of ['b-wave', 'b-wag', 'b-walk']) $(id).disabled = !on; }

function popOut() {
  state = 'popping'; setButtons(false);
  $('b-pop').textContent = 'Replay'; $('hint').hidden = true;
  B.root.visible = C.root.visible = false; PADS.bobo.visible = PADS.can.visible = false;
  keychain.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(keychain);
  // 1. scan line sweeps down the keychain
  tween(reduceMotion ? 0.01 : 0.7, (k) => {
    scanBar.position.y = THREE.MathUtils.lerp(box.max.y, box.min.y, k);
    scanBar.material.opacity = Math.sin(k * Math.PI) * 0.9;
  }, () => { scanBar.material.opacity = 0; launch(B, charmBobo, SPOT.bobo, flashB, 0); launch(C, charmCan, SPOT.can, flashC, 0.18); });
}

function launch(ch, charm, spot, flash, delay) {
  const start = centreOf(charm);
  const charmH = new THREE.Box3().setFromObject(charm).getSize(new THREE.Vector3()).y;
  const s0 = charmH / ch.height;          // same size as the flat charm
  const isBobo = ch === B;
  setTimeout(() => {
    ch.root.visible = true;
    ch.root.rotation.set(0, 0, 0);
    // origin is at the feet; start centred on the charm
    const startFeet = start.clone().add(new THREE.Vector3(0, -charmH * 0.5, 0.05));
    flash.position.copy(start).add(new THREE.Vector3(0, 0, 0.08));
    play(ch, 'PopOut', { loop: false, fade: 0, onDone: () => {
      play(ch, isBobo ? 'Sit' : 'Idle', { fade: 0.3 });
      if (isBobo) setTimeout(() => wave(), 500);
      if (!isBobo) { state = 'ready'; setButtons(true); $('hint').hidden = false; }
    } });
    const pd = isBobo ? PADS.bobo : PADS.can;
    pd.visible = true;
    tween(reduceMotion ? 0.01 : 1.0, (k) => {
      const e = easeOut(k);
      ch.root.position.lerpVectors(startFeet, spot, e);
      ch.root.position.y += Math.sin(Math.min(k, 1) * Math.PI) * 0.45;
      ch.root.scale.setScalar(THREE.MathUtils.lerp(s0, 1, e));
      const f = Math.sin(Math.min(k * 1.6, 1) * Math.PI);
      flash.scale.setScalar(0.9 * f + 0.001); flash.material.opacity = f;
      pd.scale.setScalar(0.2 + 0.8 * easeOut(k * 1.3)); pd.userData.ring.material.opacity = easeOut(k);
    });
  }, reduceMotion ? 0 : delay * 1000);
}

function wave() {
  if (!B.root.visible) return;
  play(B, 'PawRaise', { loop: false, fade: 0.2, onDone: () => play(B, 'Sit', { fade: 0.3 }) });
}
function wag() {
  play(B, 'TailWag', { loop: false, fade: 0.2, onDone: () => play(B, 'Sit', { fade: 0.3 }) });
}
function walk() {
  if (state !== 'ready') return;
  state = 'walking'; setButtons(false);
  // the original Bobo's walk cycle, reused on the keychain Bobo's skeleton
  play(B, 'ClassicWalk', { fade: 0.35 });
  const home = SPOT.bobo.clone(); const R = 0.32; const centre = home.clone().add(new THREE.Vector3(0, 0, -R));
  tween(4.2, (k) => {
    const a = k * Math.PI * 2;
    B.root.position.set(centre.x + Math.sin(a) * R, home.y, centre.z + Math.cos(a) * R);
    B.root.rotation.y = a + Math.PI / 2;
  }, () => {
    tween(0.4, (k) => { B.root.rotation.y = THREE.MathUtils.lerp(Math.PI * 2 + Math.PI / 2, Math.PI * 2, easeInOut(k)); }, () => {
      B.root.rotation.y = 0; play(B, 'Sit', { fade: 0.4 }); state = 'ready'; setButtons(true);
    });
  });
}
function spinCan() {
  if (!C.root.visible) return;
  const r0 = C.root.rotation.y;
  tween(0.9, (k) => { C.root.rotation.y = r0 + Math.PI * 2 * easeInOut(k); C.root.position.y = SPOT.can.y + Math.sin(k * Math.PI) * 0.18; });
}

// ---------------------------------------------------------------- input
$('b-pop').onclick = popOut;
$('b-wave').onclick = wave;
$('b-wag').onclick = wag;
$('b-walk').onclick = walk;
$('b-key').onclick = () => {
  keychain.visible = !keychain.visible;
  $('b-key').textContent = keychain.visible ? 'Hide keychain' : 'Show keychain';
  $('b-key').setAttribute('aria-pressed', String(keychain.visible));
};
for (const id of ['b-pop', 'b-key']) $(id).disabled = false;

const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2(); let down = null;
canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 8) return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (state !== 'ready') return;
  // skinned meshes: test against a simple proxy box around each character
  const hit = (ch) => { const b = new THREE.Box3().setFromObject(ch.root); return ray.ray.intersectsBox(b); };
  if (hit(B)) wave(); else if (hit(C)) spinCan();
});

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock(); let tt = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05); tt += dt;
  for (let i = tweens.length - 1; i >= 0; i--) {
    const w = tweens[i]; w.t += dt; const k = Math.min(w.t / w.dur, 1); w.fn(k);
    if (k >= 1) { tweens.splice(i, 1); w.done && w.done(); }
  }
  // the keychain sways a little, like it is hanging from a hand
  if (!reduceMotion) keychain.rotation.z = Math.sin(tt * 1.3) * 0.035;
  B.mixer.update(dt); C.mixer.update(dt);
  for (const p of Object.values(PADS)) p.userData.ring.rotation.z += dt * 0.6;
  controls.update();
  renderer.render(scene, camera);
});

// debug hook for headless checks
window.__kc = { popOut, wave, wag, walk, spinCan, get state() { return state; }, clips: { bobo: Object.keys(B.clips), can: Object.keys(C.clips) } };
if (new URLSearchParams(location.search).has('auto')) setTimeout(popOut, 300);
