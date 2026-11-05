// Collector Hub lab: Bobo's Hideout (EVADE room) in plain three.js.
// The room model is built by art/collector-hub/build_room.py and exported to /hub/evade/room.glb.
// Intro: only the "Go home" portal is solid. Bobo steps out of it and walks up the floating steps,
// and the room builds in around him: a cyan wireframe sweeps out from the portal, then the
// textured surfaces fill in behind it with a glowing edge.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const MODEL_URL = '/hub/evade/room.glb';
const params = new URLSearchParams(location.search);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

// ---------------------------------------------------------------- renderer + scene
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

// Lights stand in for the Blender rig (key warm, fill cool, rim, lamp and monitor glow).
scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x2a1830, 0.35));
const key = new THREE.DirectionalLight(0xffe2c4, 2.2); key.position.set(4, 7, 5); scene.add(key);
const fill = new THREE.DirectionalLight(0x9fc4ff, 0.8); fill.position.set(-6, 3, 2); scene.add(fill);
const rim = new THREE.DirectionalLight(0xdfe8ff, 0.9); rim.position.set(-2, 5, -7); scene.add(rim);
const inside = new THREE.PointLight(0xffd7b0, 6, 6, 1.6); inside.position.set(0, 1.4, 0.2); scene.add(inside);
const loftLight = new THREE.PointLight(0x9fe9ff, 4, 5, 1.6); loftLight.position.set(-0.6, 3.0, -0.6); scene.add(loftLight);
const lampLight = new THREE.PointLight(0xff5fae, 3, 2.5, 1.6); scene.add(lampLight);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.05, 2.0);
composer.addPass(bloom);
if (params.has('nobloom')) bloom.enabled = false;
composer.addPass(new OutputPass());

// ---------------------------------------------------------------- build-in shader
// One set of uniforms drives every patched material, so the whole room reveals as one.
const reveal = {
  uSolid: { value: 1e3 },   // surfaces exist where dist < uSolid
  uWire: { value: 1e3 },    // the wireframe front leads the surfaces
  uGhost: { value: 0 },     // faint blueprint of the whole room before the build
  uOrigin: { value: new THREE.Vector3() },
  uGlow: { value: new THREE.Color(0x36e3ff) },
};
const REVEAL_COMMON = /* glsl */`
  uniform float uSolid; uniform float uWire; uniform float uGhost; uniform vec3 uOrigin; uniform vec3 uGlow;
  varying vec3 vRevealPos;
  float revealDist(vec3 p) {
    vec3 q = floor(p * 12.0);
    float n = fract(sin(dot(q, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    return length(p - uOrigin) + (n - 0.5) * 0.22;
  }`;
const REVEAL_VERT = /* glsl */`
  vec4 revealP = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    revealP = instanceMatrix * revealP;
  #endif
  vRevealPos = (modelMatrix * revealP).xyz;`;

function patchSolid(material) {
  if (material.userData.revealPatched) return;
  material.userData.revealPatched = true;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, reveal);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRevealPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + REVEAL_VERT);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + REVEAL_COMMON)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  float rd = revealDist(vRevealPos);\n  if (rd > uSolid) discard;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  float edge = 1.0 - smoothstep(0.0, 0.14, uSolid - rd);\n  gl_FragColor.rgb = mix(gl_FragColor.rgb, uGlow * 3.0, edge * 0.9);');
  };
  material.customProgramCacheKey = () => 'reveal-solid';
  material.needsUpdate = true;
}

const wireMaterial = new THREE.LineBasicMaterial({ color: 0x36e3ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
wireMaterial.onBeforeCompile = (shader) => {
  Object.assign(shader.uniforms, reveal);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vRevealPos;')
    .replace('#include <project_vertex>', '#include <project_vertex>\n' + REVEAL_VERT);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + REVEAL_COMMON)
    .replace('#include <dithering_fragment>', `#include <dithering_fragment>
      float rd = revealDist(vRevealPos);
      float lit = step(rd, uWire);
      float front = 1.0 - smoothstep(0.0, 0.5, uWire - rd);
      float fade = 1.0 - smoothstep(0.0, 0.9, uSolid - rd);
      float a = max(lit * (0.45 + 0.55 * front) * fade, uGhost * (1.0 - lit));
      if (a < 0.003) discard;
      gl_FragColor = vec4(uGlow * (1.0 + 2.5 * front * lit), a);`);
};
wireMaterial.customProgramCacheKey = () => 'reveal-wire';

// ---------------------------------------------------------------- room content
const ITEMS = {
  hub_keychain: { status: 'owned', title: 'Bobo × Eclipse keychain', sub: 'Collectible #00412 · first in your room',
    body: 'Unlocked with the code that came with your keychain. Scan the QR on the back of the can any time to jump back here.' },
  hub_cola_collectible: { status: 'owned', title: 'Eclipse Cola collectible', sub: 'Shelf piece',
    body: 'The can that started it all. Every product you activate adds something new to this room.' },
  hub_trophy_colarun: { status: 'earned', title: 'Cola Run trophy', sub: 'Earned in the game',
    body: 'Beat 25 cans in a single Cola Run to earn this. Trophies are earned by playing, never bought.' },
  hub_snowglobe_sf: { status: 'earned', title: 'San Francisco snow globe', sub: 'Where is Bobo? souvenir',
    body: 'Bobo was spotted in San Francisco. Each city Bobo visits on the globe can drop a souvenir here.',
    actions: [{ label: 'Open the globe', href: '/evade/where-is-bobo/' }] },
  hub_slot_plush: { status: 'locked', title: 'Bobo plush', sub: 'Empty slot',
    body: 'Not in your room yet. Activate a Bobo plush with its code and it appears right here.',
    actions: [{ label: 'Shop (coming soon)', disabled: true }] },
  hub_slot_tee: { status: 'locked', title: 'EVADE tee', sub: 'Empty slot',
    body: 'Not in your room yet. Activate an EVADE tee with its code and it hangs right here.',
    actions: [{ label: 'Shop (coming soon)', disabled: true }] },
  hub_poster_colarun: { status: 'owned', title: 'Cola Run poster', sub: 'Room poster',
    body: 'Play Cola Run, record a clip, and it shows up in My Clips on Bobo\'s computer.',
    actions: [{ label: 'Open the Cola Run lab', href: '/evade/cola-run-lab/index.html' }] },
  hub_poster_bobo: { status: 'owned', title: 'Bobo poster', sub: 'Room poster', body: 'Bobo, chilling. As one does.' },
  hub_window: { status: 'live', title: 'Eclipse skyline', sub: 'Window',
    body: 'The night sky outside the can. The moon is always mid-eclipse here.' },
  hub_sign_evade: { status: 'owned', title: 'EVADE neon sign', sub: 'Loft rail', body: 'The room is EVADE\'s first IP in the MEDIALIFE Collector Hub.' },
};
const STATUS_LABEL = { owned: 'Owned', locked: 'Locked', earned: 'Earned', live: 'Live' };
// Nodes whose name starts hub_ but that are parts of a bigger item.
const ALIAS = { hub_keychain_case: 'hub_keychain', hub_alert_light: 'hub_computer', hub_spawn_pad: 'hub_portal' };

let room, bobo, mixer, actions = {}, current, swirl, swirlAxis = new THREE.Vector3(0, 1, 0);
let orbitCans, alertMat, lampPos = new THREE.Vector3(), boboHome = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
const fizz = [], wires = [], pickables = [];
let walkCurve, maxDist = 6, state = 'loading', seqT = 0;

function hubIdOf(obj) {
  for (let o = obj; o; o = o.parent) {
    if (o.name && o.name.startsWith('hub_')) {
      const id = o.name.replace(/_(Asset|Art|Frame|Glow)$/, '');
      return ALIAS[id] || id;
    }
  }
  return null;
}
function inSubtree(obj, name) { for (let o = obj; o; o = o.parent) if (o.name === name) return true; return false; }

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
loader.load(MODEL_URL, onLoaded, (e) => {
  if (e.total) $('barFill').style.width = Math.round((e.loaded / e.total) * 100) + '%';
}, (err) => {
  console.error(err);
  $('loadText').textContent = 'The room could not load. Check your connection and refresh.';
  $('loadText').classList.add('err');
});

function onLoaded(gltf) {
  room = gltf.scene;
  scene.add(room);
  room.updateMatrixWorld(true);

  const portal = room.getObjectByName('hub_portal');
  bobo = room.getObjectByName('hub_bobo');
  swirl = room.getObjectByName('Portal_Swirl');
  orbitCans = room.getObjectByName('hub_orbit_cans');
  const lamp = room.getObjectByName('hub_cola_lamp');
  if (lamp) { new THREE.Box3().setFromObject(lamp).getCenter(lampPos); lampLight.position.copy(lampPos).y += 0.2; }

  portal.getWorldPosition(reveal.uOrigin.value);
  reveal.uOrigin.value.y += 0.5;
  const box = new THREE.Box3().setFromObject(room);
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z])
    maxDist = Math.max(maxDist, new THREE.Vector3(x, y, z).distanceTo(reveal.uOrigin.value));
  maxDist += 0.3;

  // The swirl disc is flat; spin it about its thinnest axis.
  if (swirl) {
    swirl.geometry.computeBoundingBox();
    const s = swirl.geometry.boundingBox.getSize(new THREE.Vector3());
    swirlAxis.set(0, 0, 0).setComponent([s.x, s.y, s.z].indexOf(Math.min(s.x, s.y, s.z)), 1);
  }

  // The portal and its pad stay solid during the build, so they get their own (unpatched) materials.
  for (const name of ['hub_portal', 'hub_spawn_pad']) room.getObjectByName(name)?.traverse((o) => {
    if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
  });

  room.traverse((o) => {
    if (o.name.startsWith('Fizz_')) fizz.push({ o, y: o.position.y, phase: Math.random() * 6.28, amp: 0.05 + Math.random() * 0.07 });
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      // Real transmission costs an extra full render pass; plain transparency looks the same at this size.
      if (m.transmission > 0) { m.transmission = 0; m.transparent = true; m.opacity = Math.min(m.opacity, 0.28); m.depthWrite = false; }
    }
    for (const m of mats) {
      if (/^(Neon_|Lamp_Blob)/.test(m.name)) m.emissiveIntensity = 2.6;
      if (m.name === 'Bulb_Warm') m.emissiveIntensity = 4;
      if (m.name === 'Monitor_Screen') m.emissiveIntensity = 1.15;
      if (m.name === 'Portal_Swirl') m.emissiveIntensity = 1.4;
      if (m.name === 'Sign_EVADE') m.emissiveIntensity = 1.3;
      if (m.name === 'Porthole_Sky') m.emissiveIntensity = 1.0;
      if (m.name === 'Glass' || m.name === 'Acrylic_Clear') { m.opacity = 0.1; m.roughness = 0.05; }
    }
    if (o.name === 'hub_alert_light') { o.material = o.material.clone(); alertMat = o.material; }
    if (inSubtree(o, 'hub_bobo')) { o.frustumCulled = false; pickables.push(o); return; }
    pickables.push(o);
    if (inSubtree(o, 'hub_portal') || inSubtree(o, 'hub_spawn_pad')) return;
    mats.forEach(patchSolid);
    if (!o.isSkinnedMesh && o.geometry.attributes.position.count < 60000) {
      const line = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 30), wireMaterial);
      line.raycast = () => {};
      line.renderOrder = 2;
      o.add(line);
      wires.push(line);
    }
  });

  // Bobo's animations live on the room scene (bones are inside hub_bobo).
  mixer = new THREE.AnimationMixer(room);
  for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
  boboHome.pos.copy(bobo.position); boboHome.quat.copy(bobo.quaternion);
  buildWalkPath();

  frameCamera();
  $('loader').classList.add('done');
  if (params.has('skip') || reduceMotion) { finishBuild(); showHint(); }
  else enterWaiting();
}

function buildWalkPath() {
  const pts = [];
  const portalPos = room.getObjectByName('hub_portal').getWorldPosition(new THREE.Vector3());
  pts.push(portalPos.clone());
  const steps = [0, 1, 2, 3].map((i) => room.getObjectByName('Step_' + i)).filter(Boolean);
  if (steps.length) {
    const first = steps[0].getWorldPosition(new THREE.Vector3());
    pts.push(portalPos.clone().lerp(first, 0.55).setY(portalPos.y));
    for (const s of steps) pts.push(s.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.03, 0)));
  }
  const last = pts[pts.length - 1];
  const entry = last.clone().lerp(boboHome.pos, 0.18).setY(0.0);
  pts.push(entry, boboHome.pos.clone().lerp(entry, 0.35).setY(0.02), boboHome.pos.clone());
  walkCurve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
}

function frameCamera() {
  const aspect = innerWidth / innerHeight;
  // Centre on the room plus the portal out front; phones in portrait need a little more room.
  controls.target.set(-0.2, aspect < 0.8 ? 1.0 : 1.25, 0.4);
  const radius = aspect < 0.8 ? 3.3 : 3.6;
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
  const dist = radius / Math.sin(Math.min(vfov, hfov) / 2);
  const dir = new THREE.Vector3(0.56, 0.36, 0.74).normalize();
  camera.position.copy(controls.target).addScaledVector(dir, Math.min(dist, controls.maxDistance));
  controls.update();
}

// ---------------------------------------------------------------- intro sequence
const SEQ = { popAt: 0.5, walkStart: 0.9, walkDur: 6.6, buildDur: 6.2, solidLag: 1.0, end: 8.6 };

function play(name, fade = 0.3, once = false) {
  const next = actions[name];
  if (!next || next === current) return next;
  next.reset();
  if (once) { next.setLoop(THREE.LoopOnce, 1); next.clampWhenFinished = true; } else next.setLoop(THREE.LoopRepeat, Infinity);
  next.enabled = true;
  next.fadeIn(fade).play();
  if (current) current.fadeOut(fade);
  current = next;
  return next;
}

function enterWaiting() {
  state = 'waiting';
  reveal.uSolid.value = -1; reveal.uWire.value = -1; reveal.uGhost.value = 0.07;
  wires.forEach((w) => (w.visible = true));
  bobo.visible = false;
  setUI({ intro: true, skip: false, hint: false });
  controls.autoRotate = !reduceMotion;
}

function startSequence() {
  closeSheet();
  state = 'intro'; seqT = 0;
  bobo.visible = false;
  setUI({ intro: false, skip: true, hint: false });
  controls.autoRotate = false;
}

function finishBuild() {
  state = 'live';
  reveal.uSolid.value = 1e3; reveal.uWire.value = 1e3; reveal.uGhost.value = 0;
  wires.forEach((w) => (w.visible = false));
  bobo.visible = true; bobo.scale.setScalar(1);
  bobo.position.copy(boboHome.pos); bobo.quaternion.copy(boboHome.quat);
  play('Sit', 0.4);
  setUI({ intro: false, skip: false });
  controls.autoRotate = !reduceMotion;
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);

function updateSequence(dt) {
  seqT += dt;
  // room build
  const b = ease(clamp01((seqT - 0.3) / SEQ.buildDur));
  reveal.uWire.value = b * maxDist;
  reveal.uSolid.value = ease(clamp01((seqT - 0.3 - SEQ.solidLag) / SEQ.buildDur)) * maxDist;
  reveal.uGhost.value = 0.07 * (1 - b);

  // Bobo steps out of the portal with a little pop, then walks the path home
  if (seqT >= SEQ.popAt) {
    if (!bobo.visible) { bobo.visible = true; play('Walk', 0.15); }
    const p = clamp01((seqT - SEQ.popAt) / 0.35);
    bobo.scale.setScalar(p < 1 ? 0.2 + 0.8 * (1 + 2.2 * Math.pow(p - 1, 3) + 1.2 * Math.pow(p - 1, 2)) : 1);
    const u = clamp01((seqT - SEQ.walkStart) / SEQ.walkDur);
    const uu = u < 1 ? THREE.MathUtils.smootherstep(u, 0, 1) * 0.15 + u * 0.85 : 1;
    walkCurve.getPointAt(uu, bobo.position);
    if (u < 0.97) {
      walkCurve.getTangentAt(uu, tmpV); tmpV.y = 0;
      if (tmpV.lengthSq() > 1e-6) {
        tmpQ.setFromAxisAngle(up, Math.atan2(tmpV.x, tmpV.z));
        bobo.quaternion.slerp(tmpQ, 1 - Math.pow(0.001, dt));
      }
    } else {
      bobo.quaternion.slerp(boboHome.quat, 1 - Math.pow(0.002, dt));
      if (current !== actions.Sit) play('Sit', 0.5);
    }
  }
  if (seqT >= SEQ.end) { finishBuild(); showHint(); }
}

// ---------------------------------------------------------------- UI
function setUI({ intro, skip, hint }) {
  if (intro !== undefined) $('intro').hidden = !intro;
  if (skip !== undefined) $('btnSkip').hidden = !skip;
  if (hint !== undefined) $('hint').hidden = !hint;
}
let hintTimer;
function showHint() {
  setUI({ hint: true });
  $('hint').style.opacity = 1;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { $('hint').style.opacity = 0; setTimeout(() => setUI({ hint: false }), 400); }, 6000);
}
let toastTimer;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

let lastFocus;
function openSheet(id) {
  const item = ITEMS[id]; if (!item) return;
  $('sheetStatus').textContent = STATUS_LABEL[item.status];
  $('sheetStatus').className = 'status ' + item.status;
  $('sheetTitle').textContent = item.title;
  $('sheetSub').textContent = item.sub;
  $('sheetBody').textContent = item.body;
  const row = $('sheetActions'); row.replaceChildren();
  for (const a of item.actions || []) {
    const el = document.createElement('a');
    el.className = 'btn' + (a.disabled ? '' : ' primary');
    el.textContent = a.label;
    if (a.disabled) el.setAttribute('aria-disabled', 'true'); else el.href = a.href;
    row.append(el);
  }
  row.hidden = !row.children.length;
  lastFocus = document.activeElement;
  $('sheet').classList.add('open');
  $('sheetClose').focus({ preventScroll: true });
}
function closeSheet() {
  if (!$('sheet').classList.contains('open')) return;
  $('sheet').classList.remove('open');
  lastFocus?.focus?.({ preventScroll: true });
}

const READ_KEY = 'hub.evade.alertsRead';
function unread() { return store.get(READ_KEY) === '1' ? 0 : 2; }
function syncAlerts() {
  const n = unread();
  $('alertBadge').textContent = n; $('alertBadge').hidden = !n;
  document.querySelectorAll('.alert').forEach((a) => a.classList.toggle('read', !n));
}
function openOS() {
  closeSheet();
  lastFocus = document.activeElement;
  $('os').classList.add('open'); $('alerts').classList.remove('open');
  syncAlerts();
  $('osClose').focus({ preventScroll: true });
}
function closeOS() { $('os').classList.remove('open'); lastFocus?.focus?.({ preventScroll: true }); }
$('appAlerts').addEventListener('click', () => {
  $('alerts').classList.toggle('open');
  if (unread()) { store.set(READ_KEY, '1'); setTimeout(syncAlerts, 900); }
});
$('osClose').addEventListener('click', closeOS);
$('os').addEventListener('click', (e) => { if (e.target === $('os')) closeOS(); });
$('sheetClose').addEventListener('click', closeSheet);
addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeOS(); closeSheet(); } });

$('btnHome').addEventListener('click', startSequence);
$('btnSkip').addEventListener('click', () => { finishBuild(); showHint(); });
$('btnReplay').addEventListener('click', () => { if (state === 'loading') return; closeOS(); enterWaiting(); });

// "Room items" list: the keyboard and screen-reader way into everything tappable.
$('btnItems').addEventListener('click', () => {
  closeOS();
  const row = $('sheetActions'); row.replaceChildren(); row.hidden = false;
  $('sheetStatus').className = 'status owned'; $('sheetStatus').textContent = 'Your room';
  $('sheetTitle').textContent = 'Room items';
  $('sheetSub').textContent = 'Everything you can open in Bobo\'s Hideout';
  $('sheetBody').textContent = '';
  const add = (label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = label; b.onclick = fn; row.append(b); };
  add('Bobo', () => { closeSheet(); tapBobo(); });
  add('Computer', openOS);
  for (const [id, it] of Object.entries(ITEMS)) add(it.title, () => openSheet(id));
  lastFocus = document.activeElement;
  $('sheet').classList.add('open');
  $('sheetClose').focus({ preventScroll: true });
});

// ---------------------------------------------------------------- tapping things in the room
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let downAt = null;
canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', (e) => {
  if (!downAt || !room) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  const quick = performance.now() - downAt.t < 450;
  downAt = null;
  if (moved > 8 || !quick) return; // that was a drag to look around
  const id = pick(e);
  if (!id) { closeSheet(); return; }
  onTap(id);
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || !room || downAt) return;
  canvas.style.cursor = pick(e) ? 'pointer' : 'grab';
});

function pick(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  for (const hit of ray.intersectObjects(pickables, false)) {
    if (!hit.object.visible) continue;
    if (state !== 'live' && !inSubtree(hit.object, 'hub_portal') && !inSubtree(hit.object, 'hub_spawn_pad')) continue;
    if (state === 'live' && hit.object.material?.transparent && hit.object.material.opacity < 0.4) continue; // see through glass
    const id = hubIdOf(hit.object);
    if (id) return id;
    if (state === 'live') return null; // walls block what is behind them
  }
  return null;
}

function tapBobo() {
  if (state !== 'live') return;
  const lines = ['Mrrp!', 'Purrrr…', 'Bobo approves.', 'Bobo wants a cola.'];
  toast(lines[Math.floor(Math.random() * lines.length)]);
  const a = play(Math.random() < 0.5 ? 'Excited' : 'Spin', 0.2, true);
  if (a) mixer.addEventListener('finished', function back(ev) { if (ev.action === a) { mixer.removeEventListener('finished', back); play('Sit', 0.4); } });
}

function onTap(id) {
  if (id === 'hub_portal') { if (state === 'waiting') startSequence(); else if (state === 'live') enterWaiting(); return; }
  if (state !== 'live') return;
  if (id === 'hub_bobo') return tapBobo();
  if (id === 'hub_computer') return openOS();
  if (id === 'hub_cola_lamp') { burstFizz(); toast('Fizz!'); return; }
  if (id === 'hub_pull_tab') { tabWiggle = 1; burstFizz(new THREE.Vector3(0, 3.6, 0)); toast('Pssst!'); return; }
  openSheet(id);
}

// Fizz burst: a puff of bubbles from the lamp (or the ring-pull).
const burst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.025, 10, 8),
  new THREE.MeshBasicMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.85, depthWrite: false }), 40);
burst.count = 0; burst.frustumCulled = false; scene.add(burst);
const bubbles = [];
function burstFizz(from = lampPos) {
  bubbles.length = 0;
  for (let i = 0; i < 40; i++) bubbles.push({ p: from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.15, 0.1, (Math.random() - 0.5) * 0.15)),
    v: new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.5 + Math.random() * 0.8, (Math.random() - 0.5) * 0.4), life: 1.2 + Math.random() * 0.8, s: 0.5 + Math.random() });
}
const mtx = new THREE.Matrix4();
function updateBurst(dt) {
  let n = 0;
  for (const b of bubbles) {
    b.life -= dt; if (b.life <= 0) continue;
    b.v.y += dt * 0.3; b.p.addScaledVector(b.v, dt);
    mtx.makeScale(b.s, b.s, b.s).setPosition(b.p); burst.setMatrixAt(n++, mtx);
  }
  burst.count = n; burst.instanceMatrix.needsUpdate = true;
}
let tabWiggle = 0;

// Stop the slow turntable while someone is looking around; resume after a pause.
let idleTimer;
controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(idleTimer); });
controls.addEventListener('end', () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => { if (!reduceMotion && state !== 'intro') controls.autoRotate = true; }, 6000); });

// ---------------------------------------------------------------- loop
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.setSize(w / 2, h / 2);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', () => { resize(); });
resize();

const clock = new THREE.Clock();
let t = 0;
const pullTab = () => room?.getObjectByName('hub_pull_tab');
let pullRest;
function frame(dt) {
  t += dt;
  if (room) {
    if (state === 'intro') updateSequence(dt);
    mixer.update(dt);
    if (!reduceMotion) {
      if (swirl) swirl.rotateOnAxis(swirlAxis, dt * (state === 'intro' ? 4 : 1.2));
      if (orbitCans) orbitCans.rotation.y += dt * 0.18;
      for (const f of fizz) f.o.position.y = f.y + Math.sin(t * 1.3 + f.phase) * f.amp;
    }
    if (alertMat) alertMat.emissiveIntensity = unread() ? 1.5 + 1.5 * Math.sin(t * 5) : 0.6;
    if (tabWiggle > 0) {
      const tab = pullTab(); if (tab) { pullRest ??= tab.rotation.z; tab.rotation.z = pullRest + Math.sin(tabWiggle * 30) * 0.12 * tabWiggle; }
      tabWiggle = Math.max(0, tabWiggle - dt * 1.2);
    }
    updateBurst(dt);
  }
  controls.update(dt);
  composer.render();
}
// ?manual drives time from outside (used to record smooth preview clips).
if (!params.has('manual')) renderer.setAnimationLoop(() => frame(Math.min(clock.getDelta(), 0.05)));

syncAlerts();
// Handy for automated checks of the page.
window.__hub = { frame, get state() { return state; }, get seqT() { return seqT; }, startSequence, finishBuild, camera, controls, get room() { return room; }, actions };
