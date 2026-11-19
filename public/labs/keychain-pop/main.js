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
// Each model carries a flat black 'Silhouette' node: the shape it leaves behind on its charm. It is
// a unit quad covering the whole charm image frame, placed where the model sits in its flat start pose.
function takeSilhouette(m, charm) {
  const sil = m.getObjectByName('Silhouette'); if (!sil) return null;
  sil.updateMatrix(); const local = sil.matrix.clone();     // where it sits in the model's own space
  sil.removeFromParent();
  sil.material = new THREE.MeshBasicMaterial({ color: 0x000000, map: sil.material.map, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  sil.renderOrder = 5; sil.visible = false;
  // pin it over the charm's printed art (same picture frame as the print)
  const print = charm.getObjectByName(charm.name + '_Print_Front');
  print.geometry.computeBoundingBox(); const bb = print.geometry.boundingBox;
  const c = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3());
  sil.position.set(c.x, c.y, c.z + 0.012); sil.quaternion.identity(); sil.scale.set(sz.x, sz.y, 1);
  print.add(sil);
  return { mesh: sil, local };
}
function prepCharacter(gltf, height, charm) {
  const root = new THREE.Group(); const m = gltf.scene;
  const sil = takeSilhouette(m, charm);
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
  return { root, model: m, mixer, clips, current: null, baseScale: height / h, height, sil };
}
const B = prepCharacter(bobo, 0.78, charmBobo);
const C = prepCharacter(can, 0.56, charmCan);
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

const after = (delay, fn) => tween(delay, () => {}, fn);

// Where a character has to be so that it lies flat exactly over its printed art: the silhouette's
// pinned frame times the inverse of where the silhouette sits inside the model.
const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _fwd = new THREE.Vector3();
function charmPose(ch) {
  ch.sil.mesh.updateWorldMatrix(true, false);
  _inv.makeScale(ch.baseScale, ch.baseScale, ch.baseScale).multiply(ch.sil.local).invert();
  _m.copy(ch.sil.mesh.matrixWorld).multiply(_inv);
  const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
  _m.decompose(pos, quat, scl);
  _fwd.set(0, 0, 1).applyQuaternion(quat); pos.addScaledVector(_fwd, 0.02);   // just in front of the silhouette
  return { pos, quat, s: scl.y };
}

function resetScene() {
  tweens.length = 0; scanBar.material.opacity = 0;
  for (const ch of [B, C]) {
    ch.mixer.stopAllAction(); ch.current = null; ch.root.visible = false;
    ch.root.quaternion.identity(); ch.root.scale.setScalar(1);
    ch.sil.mesh.visible = false; ch.sil.mesh.material.opacity = 0;
  }
  PADS.bobo.visible = PADS.can.visible = false;
  flashB.material.opacity = flashC.material.opacity = 0;
}

function popOut() {
  resetScene();
  state = 'popping'; setButtons(false);
  $('b-pop').textContent = 'Replay'; $('hint').hidden = true;
  keychain.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(keychain);
  // 1. scan line sweeps down the keychain
  tween(reduceMotion ? 0.01 : 0.7, (k) => {
    scanBar.position.y = THREE.MathUtils.lerp(box.max.y, box.min.y, k);
    scanBar.material.opacity = Math.sin(k * Math.PI) * 0.9;
  }, () => {
    scanBar.material.opacity = 0;
    // 2. the can pops first and lands beside Bobo's spot, 3. Bobo follows
    launch(C, SPOT.can, flashC, PADS.can);
    after(reduceMotion ? 0.01 : 0.55, () => launch(B, SPOT.bobo, flashB, PADS.bobo));
  });
}

function launch(ch, spot, flash, pd) {
  const isBobo = ch === B;
  // the character appears flat on the charm, exactly over the print, with its black silhouette under it
  ch.root.visible = true; ch.sil.mesh.visible = true;
  play(ch, 'PopOut', { loop: false, fade: 0, onDone: () => {
    if (isBobo) {
      // Bobo lands wagging his tail, then settles into the sit
      play(B, 'TailWag', { loop: false, fade: 0.25, onDone: () => play(B, 'Sit', { fade: 0.3 }) });
      state = 'ready'; setButtons(true); $('hint').hidden = false;
    } else play(ch, 'Idle', { fade: 0.3 });
  } });
  const pop = ch.current; pop.paused = true;
  const place = (wig) => {
    const p = charmPose(ch);
    ch.root.position.copy(p.pos); ch.root.quaternion.copy(p.quat); ch.root.scale.setScalar(p.s);
    if (wig) { ch.root.rotateZ(wig); }
    return p;
  };
  place(0); ch.mixer.update(0);
  // a. a short shiver while still stuck to the charm (it follows the swinging keychain)
  tween(reduceMotion ? 0.01 : 0.38, (k) => {
    ch.sil.mesh.material.opacity = Math.min(k * 4, 1);
    place(Math.sin(k * Math.PI * 5) * 0.05 * k);
  }, () => {
    // b. it springs off the charm and flies to its spot; the silhouette stays behind
    const from = place(0); pop.paused = false;
    pd.visible = true; flash.position.copy(from.pos); flash.position.z += 0.08;
    const q1 = new THREE.Quaternion();
    tween(reduceMotion ? 0.01 : 1.0, (k) => {
      const e = easeOut(k);
      ch.root.position.lerpVectors(from.pos, spot, e);
      ch.root.position.y += Math.sin(k * Math.PI) * 0.45;
      ch.root.quaternion.slerpQuaternions(from.quat, q1, easeOut(k * 2));
      ch.root.scale.setScalar(THREE.MathUtils.lerp(from.s, 1, e));
      const f = Math.sin(Math.min(k * 1.6, 1) * Math.PI);
      flash.scale.setScalar(0.9 * f + 0.001); flash.material.opacity = f;
      pd.scale.setScalar(0.2 + 0.8 * easeOut(k * 1.3)); pd.userData.ring.material.opacity = easeOut(k);
    });
  });
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
const params = new URLSearchParams(location.search);
const clock = new THREE.Clock(); let tt = 0;
function frame(dt) {
  tt += dt;
  for (let i = tweens.length - 1; i >= 0; i--) {
    const w = tweens[i]; if (!w) continue; w.t += dt; const k = Math.min(w.t / w.dur, 1); w.fn(k);
    if (k >= 1) { const j = tweens.indexOf(w); if (j >= 0) tweens.splice(j, 1); w.done && w.done(); }
  }
  // the keychain sways a little, like it is hanging from a hand
  if (!reduceMotion) keychain.rotation.z = Math.sin(tt * 1.3) * 0.035;
  B.mixer.update(dt); C.mixer.update(dt);
  for (const p of Object.values(PADS)) p.userData.ring.rotation.z += dt * 0.6;
  controls.update();
  renderer.render(scene, camera);
}
// ?capture: no real-time loop; frames are stepped by hand (used to film the animation)
const capture = params.has('capture');
if (!capture) renderer.setAnimationLoop(() => frame(Math.min(clock.getDelta(), 0.05)));
else { document.body.classList.add('capture'); frame(0); }

// debug hook for headless checks
window.__kc = {
  popOut, wave, wag, walk, spinCan, camera, controls, B, C, keychain,
  get state() { return state; }, clips: { bobo: Object.keys(B.clips), can: Object.keys(C.clips) },
  step(dt, grab = true) { frame(dt); return grab ? canvas.toDataURL('image/png') : null; },
};
if (params.has('auto')) after(0.3, popOut);
