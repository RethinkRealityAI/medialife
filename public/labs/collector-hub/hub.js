// Collector Hub lab: Bobo's Hideout on its own page.
// Everything about the room (build-in, BOBO OS, alerts, collection, unlock
// form) lives in hub-core.js, generated from mattercraft/cola-run/HubCore.ts,
// the same file the Mattercraft component uses. This page only supplies a
// renderer, a camera you can drag around, and the flow:
//   unlock (first visit) → portal → Go home → Bobo walks in, the room builds.
// ?skip  jump straight to the built room · ?test  show the test code
// ?hub=BOBO-XXXX-XXXX  a code from a product's QR (prefills the form)
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { CollectorHub } from "./hub-core.js?v=7";
import { mountViewControls } from "./view-controls.js?v=1";

const params = new URLSearchParams(location.search);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);

const canvas = $("stage");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = !matchMedia("(pointer: coarse)").matches;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070b1c);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.28;

const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
// Look around (drag), zoom towards the cursor (scroll / pinch) and move the
// view (right-drag, shift-drag, two fingers or the arrow keys).
controls.enablePan = true;
controls.screenSpacePanning = true;
controls.zoomToCursor = true;
controls.zoomSpeed = 1.1;
controls.keyPanSpeed = 18;
controls.listenToKeyEvents(canvas);
controls.minDistance = 1.1;
controls.maxDistance = 16;
controls.maxPolarAngle = THREE.MathUtils.degToRad(100);
controls.autoRotateSpeed = 0.5;
controls.target.set(0, 1.3, 0);

// Key, fill and rim stand in for the Blender rig; the room adds its own lamp/monitor lights.
// Softer and lower than before so the materials, not the lights, carry the room.
scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x2a1830, 0.22));
const key = new THREE.DirectionalLight(0xffe2c4, 1.45);
key.position.set(4, 7, 5);
scene.add(key);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.radius = 5;
key.shadow.bias = -0.0006;
key.shadow.normalBias = 0.045;
Object.assign(key.shadow.camera, {
  left: -3.5,
  right: 3.5,
  top: 4.5,
  bottom: -2.5,
  near: 1,
  far: 20,
});
const fill = new THREE.DirectionalLight(0x9fc4ff, 0.45);
fill.position.set(-6, 3, 2);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xdfe8ff, 0.7);
rim.position.set(-2, 5, -7);
scene.add(rim);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// Subtle on purpose: a soft halo on the neon, not a haze over the whole room.
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.16, 0.04, 2.4);
composer.addPass(bloom);
if (params.has("nobloom")) bloom.enabled = false;
composer.addPass(new OutputPass());

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const hub = new CollectorHub({
  parent: scene,
  host: document.body,
  canvas,
  getCamera: () => camera,
  loader: {
    loadAsync: (url) =>
      loader.loadAsync(url, (e) => {
        if (e.total) $("barFill").style.width = Math.round((e.loaded / e.total) * 100) + "%";
      }),
  },
  api: "",
  modelUrl: "/hub/evade/room.glb",
  shadows: true,
  globeUrl: "/evade/where-is-bobo/index.html",
  testHint: params.has("test") ? "BOBO-TEST-CATS" : null,
  hubCode: params.get("hub"),
  exitLabel: "Leave the room",
  on: (name, p) => {
    if (name === "portal") goHome();
    else if (name === "exit") hub.leave().then(atPortal);
    else if (name === "signedOut") {
      hub.hide();
      askToUnlock();
    } else if (name === "play")
      location.href = `/evade/cola-run-lab/?mode=${p.record ? "record" : "play"}`;
    else if (name === "state") onState(p);
    else if (name === "focus") focusOn(p);
    else if (name === "tour") {
      touring = p === "start";
      controls.autoRotate = !touring && !reduceMotion;
      viewUi.show(!touring && hub.state === "live");
    }
  },
});

/* ── camera ─────────────────────────────────────────────────────────── */
// Two framings: wide enough for the portal beside the room, and a closer one
// that fills the screen with the room once it is built. The camera glides
// between them; any drag, scroll or pinch hands control straight back.
const VIEW_DIR = new THREE.Vector3(0.56, 0.36, 0.74).normalize();
function viewFor(kind) {
  const aspect = innerWidth / innerHeight;
  const tall = aspect < 0.8;
  const target = new THREE.Vector3(-0.2, tall ? 1.15 : 1.4, 0.4);
  const radius = kind === "room" ? (tall ? 2.85 : 2.9) : tall ? 3.3 : 3.6;
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
  const dist = radius / Math.sin(Math.min(vfov, hfov) / 2);
  const dir = VIEW_DIR.clone();
  if (kind === "room") dir.y *= 0.8; // a touch lower: more eye level once inside
  const pos = target.clone().addScaledVector(dir.normalize(), Math.min(dist, controls.maxDistance));
  return { pos, target };
}
const viewKind = () => (hub.state === "live" || hub.state === "building" ? "room" : "portal");

let fly = null;
let userMoved = false; // the visitor has zoomed or moved the view themselves
function flyTo(view, dur = 1.6, byUser = false) {
  userMoved = byUser;
  if (reduceMotion || dur <= 0) {
    camera.position.copy(view.pos);
    controls.target.copy(view.target);
    controls.update();
    fly = null;
    return;
  }
  fly = {
    p0: camera.position.clone(),
    t0: controls.target.clone(),
    p1: view.pos,
    t1: view.target,
    t: 0,
    dur,
  };
}
function stepFly(dt) {
  if (!fly) return;
  fly.t += dt;
  const k = Math.min(1, fly.t / fly.dur);
  const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  camera.position.lerpVectors(fly.p0, fly.p1, e);
  controls.target.lerpVectors(fly.t0, fly.t1, e);
  if (k >= 1) fly = null;
}
function frameCamera() {
  flyTo(viewFor(viewKind()), 0);
}

// Keep the view near the room so it can't be panned off into empty space.
const HOME = new THREE.Vector3(-0.2, 1.25, 0.4);
controls.addEventListener("change", () => {
  const off = controls.target.clone().sub(HOME);
  const lim = 2.4;
  if (off.length() > lim) {
    off.setLength(lim);
    const fix = HOME.clone().add(off).sub(controls.target);
    controls.target.add(fix);
    camera.position.add(fix);
  }
});

function zoomStep(dir) {
  fly = null;
  const off = camera.position.clone().sub(controls.target);
  const len = THREE.MathUtils.clamp(
    off.length() * (dir > 0 ? 0.82 : 1.22),
    controls.minDistance,
    controls.maxDistance,
  );
  flyTo(
    { pos: controls.target.clone().add(off.setLength(len)), target: controls.target.clone() },
    0.28,
    true,
  );
}
const viewUi = mountViewControls({
  onZoom: zoomStep,
  onRecenter: () => flyTo(viewFor(viewKind()), 0.9),
});

// The welcome tour points the camera at each stop.
let touring = false;
function focusOn(p) {
  clearTimeout(pushIn);
  controls.autoRotate = false;
  if (!p) return flyTo(viewFor("room"), 1.3);
  const tall = innerWidth / innerHeight < 0.8;
  const dir = VIEW_DIR.clone();
  dir.y *= 0.8;
  dir.normalize();
  const dist = p.distance * (tall ? 1.6 : 1);
  flyTo({ pos: p.target.clone().addScaledVector(dir, dist), target: p.target.clone() }, 1.3);
}

let pushIn;
function onState(p) {
  controls.autoRotate = !reduceMotion && !touring && p !== "building" && p !== "leaving";
  clearTimeout(pushIn);
  // While the wireframe draws, glide in so the built room fills the screen.
  if (p === "building") pushIn = setTimeout(() => flyTo(viewFor("room"), 3.4), 1600);
  else if (p === "live" && !fly && !userMoved) flyTo(viewFor("room"), 1.0);
  else if (p === "leaving") flyTo(viewFor("portal"), 2.6);
  viewUi.show(p === "portal" || p === "building" || p === "live");
}

function atPortal() {
  hub.showPortal();
  hub.prompt("Bobo is waiting on the other side of the portal.", {
    label: "Go home",
    onClick: goHome,
  });
}
function goHome() {
  if (hub.state !== "portal") return;
  hub.enter({ walk: true });
}
function askToUnlock() {
  hub.prompt("Bobo's Hideout is for owners. Your merch came with a code.", {
    label: "Unlock with my code",
    onClick: start,
  });
}
async function start() {
  hub.prompt(null);
  const ok = await hub.ensureAccess();
  if (!ok) return askToUnlock();
  if (params.has("skip") || reduceMotion) {
    hub.showPortal();
    hub.skip();
  } else atPortal();
}

hub
  .load()
  .then(() => {
    frameCamera();
    $("loader").classList.add("done");
    start();
  })
  .catch((err) => {
    console.error(err);
    $("loadText").textContent = "The room could not load. Check your connection and refresh.";
    $("loadText").classList.add("err");
  });

// Pause the slow turntable while someone looks around; resume after a while.
let idleTimer;
controls.addEventListener("start", () => {
  controls.autoRotate = false;
  fly = null;
  userMoved = true;
  clearTimeout(pushIn);
  clearTimeout(idleTimer);
});
controls.addEventListener("end", () => {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (!reduceMotion && !touring && hub.state === "live") controls.autoRotate = true;
  }, 6000);
});

function resize() {
  const w = innerWidth,
    h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.setSize(w / 2, h / 2);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener("resize", () => {
  resize();
  if (!fly && !userMoved && hub.state !== "hidden") frameCamera();
});
resize();

const clock = new THREE.Clock();
function frame(dt) {
  hub.update(dt);
  stepFly(dt);
  controls.update(dt);
  composer.render();
}
// ?manual drives time from outside (used to record smooth preview clips).
if (!params.has("manual")) renderer.setAnimationLoop(() => frame(Math.min(clock.getDelta(), 0.05)));

// Test hook.
window.__hub = {
  hub,
  frame,
  // advance time without drawing (tests)
  tick(dt) {
    hub.update(dt);
    stepFly(dt);
    controls.update(dt);
  },
  camera,
  controls,
  get state() {
    return hub.state;
  },
  start,
};
