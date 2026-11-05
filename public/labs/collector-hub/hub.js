// Collector Hub lab: Bobo's Hideout on its own page.
// Everything about the room (build-in, BOBO OS, alerts, collection, unlock
// form) lives in hub-core.js, generated from mattercraft/cola-run/HubCore.ts,
// the same file the Mattercraft component uses. This page only supplies a
// renderer, a camera you can drag around, and the flow:
//   unlock (first visit) → portal → Go home → Bobo walks in, the room builds.
// ?skip  jump straight to the built room · ?test  show the test code
// ?hub=BOBO-XXXX-XXXX  a code from a product's QR (prefills the form)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CollectorHub } from './hub-core.js?v=4';

const params = new URLSearchParams(location.search);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);

const canvas = $('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070b1c);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 3;
controls.maxDistance = 18;
controls.maxPolarAngle = THREE.MathUtils.degToRad(100);
controls.autoRotateSpeed = 0.5;
controls.target.set(0, 1.3, 0);

// Key, fill and rim stand in for the Blender rig; the room adds its own lamp/monitor lights.
scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x2a1830, 0.35));
const key = new THREE.DirectionalLight(0xffe2c4, 2.2); key.position.set(4, 7, 5); scene.add(key);
const fill = new THREE.DirectionalLight(0x9fc4ff, 0.8); fill.position.set(-6, 3, 2); scene.add(fill);
const rim = new THREE.DirectionalLight(0xdfe8ff, 0.9); rim.position.set(-2, 5, -7); scene.add(rim);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// Subtle on purpose: a soft halo on the neon, not a haze over the whole room.
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.16, 0.04, 2.4);
composer.addPass(bloom);
if (params.has('nobloom')) bloom.enabled = false;
composer.addPass(new OutputPass());

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const hub = new CollectorHub({
  parent: scene,
  host: document.body,
  canvas,
  getCamera: () => camera,
  loader: {
    loadAsync: (url) => loader.loadAsync(url, (e) => {
      if (e.total) $('barFill').style.width = Math.round((e.loaded / e.total) * 100) + '%';
    }),
  },
  api: '',
  modelUrl: '/hub/evade/room.glb',
  globeUrl: '/evade/where-is-bobo/index.html',
  testHint: params.has('test') ? 'BOBO-TEST-CATS' : null,
  hubCode: params.get('hub'),
  exitLabel: 'Leave the room',
  on: (name, p) => {
    if (name === 'portal') goHome();
    else if (name === 'exit') hub.leave().then(atPortal);
    else if (name === 'signedOut') { hub.hide(); askToUnlock(); }
    else if (name === 'play') location.href = `/evade/cola-run-lab/?mode=${p.record ? 'record' : 'play'}`;
    else if (name === 'state') controls.autoRotate = !reduceMotion && p !== 'building' && p !== 'leaving';
  },
});

function frameCamera() {
  const aspect = innerWidth / innerHeight;
  controls.target.set(-0.2, aspect < 0.8 ? 1.0 : 1.25, 0.4);
  const radius = aspect < 0.8 ? 3.3 : 3.6;
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
  const dist = radius / Math.sin(Math.min(vfov, hfov) / 2);
  const dir = new THREE.Vector3(0.56, 0.36, 0.74).normalize();
  camera.position.copy(controls.target).addScaledVector(dir, Math.min(dist, controls.maxDistance));
  controls.update();
}

function atPortal() {
  hub.showPortal();
  hub.prompt('Bobo is waiting on the other side of the portal.', { label: 'Go home', onClick: goHome });
}
function goHome() {
  if (hub.state !== 'portal') return;
  hub.enter({ walk: true });
}
function askToUnlock() {
  hub.prompt('Bobo\'s Hideout is for owners. Your merch came with a code.', {
    label: 'Unlock with my code',
    onClick: start,
  });
}
async function start() {
  hub.prompt(null);
  const ok = await hub.ensureAccess();
  if (!ok) return askToUnlock();
  if (params.has('skip') || reduceMotion) { hub.showPortal(); hub.skip(); }
  else atPortal();
}

hub.load().then(() => {
  frameCamera();
  $('loader').classList.add('done');
  start();
}).catch((err) => {
  console.error(err);
  $('loadText').textContent = 'The room could not load. Check your connection and refresh.';
  $('loadText').classList.add('err');
});

// Pause the slow turntable while someone looks around; resume after a while.
let idleTimer;
controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(idleTimer); });
controls.addEventListener('end', () => {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (!reduceMotion && hub.state !== 'building') controls.autoRotate = true; }, 6000);
});

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.setSize(w / 2, h / 2);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
function frame(dt) {
  hub.update(dt);
  controls.update(dt);
  composer.render();
}
// ?manual drives time from outside (used to record smooth preview clips).
if (!params.has('manual')) renderer.setAnimationLoop(() => frame(Math.min(clock.getDelta(), 0.05)));

// Test hook.
window.__hub = { hub, frame, camera, controls, get state() { return hub.state; }, start };
