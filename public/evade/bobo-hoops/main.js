// Bobo Hoops: from an image target to world-tracked AR in one session.
//
//  1. find     Point at the Eclipse can charm (kc-can / kc-can-back, the Off the Chain targets). A scan line sweeps the
//              charm (Bobo X-Ray's scanner), the printed can turns into a dark cut-out with a cyan rim, and the 3D
//              Eclipse can (the same Blender GLB as Off the Chain) pops out of it and hovers, fizzing.
//  2. ready    "Play Some Hoops".
//  3. grow     The can leaves the charm, grows and spins out in front of the phone.
//  4. placing  "Point at the floor": the can hovers over a ring on the floor (or a table), pinch to size it, Place.
//  5. drop     It slams down, its lid pops off: an open-top can.
//  6. play     10 balls. Swipe up from the bottom: the camera aims (yaw and how high the arc starts), the length of
//              the swipe is the power. Optional dotted aim arc (Off / Short / Full). Physics is a small custom solver
//              against the can's real profile (body, shoulder, rim torus, inner wall, floor).
//
// ONE ENGINE: 8th Wall's distributed engine binary (@8thwall/engine-binary, Niantic Spatial licence) runs image
// targets and SLAM together (XrController.configure({ disableWorldTracking: false, imageTargetData })), and gives the
// image target's pose in the same world frame as the floor. So the handoff is just "take the can's world transform
// off the charm and keep animating it in world space": no second engine, no restart, no recentre.
// The image target pose is in SLAM units, not the print's real size, so at the handoff the can is slid along the
// camera ray to a believable distance (same picture on screen, see takeOffCharm).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

window.THREE = THREE;                         // XR8.Threejs.pipelineModule() looks for a global THREE

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const KC = '/evade/keychain-ar/';             // Off the Chain: image targets
const LIVE_SITE = /(^|\.)medialife\.ai$/i.test(location.hostname);
const SHOW_DIAG = params.has('diag') || /^(localhost$|127\.|deploy-preview-)/.test(location.hostname);
const TOUCH = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const easeOut = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
const easeInOut = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const easeOutBack = (x) => { x = clamp(x, 0, 1); const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* no haptics */ } };
const store = { get(k, d) { try { const v = localStorage.getItem('bobo-hoops-' + k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('bobo-hoops-' + k, String(v)); } catch (e) { /* none */ } } };

// ---------------------------------------------------------------- the keychain and the can (metres)
const TARGETS = ['kc-can', 'kc-can-back'];
const PXM = 14000;                            // charm pictures: 14 px per mm (as Off the Chain)
const CHARM = { w: 434 / PXM, h: 805 / PXM }; // the can charm's frame
// The can GLB is 0.99 units tall; its profile (radius against height, model units), measured from the mesh:
// straight body to 0.79, shoulder in to the neck (0.222) at 0.945, where the lid was. The lid is cut off in play.
const TOP_Y = 0.945, NECK_R = 0.222, BODY_R = 0.2705, BASE_Y = 0.07, RIM_T = 0.013;
const rOut = (y) => (y < 0.79 ? BODY_R : y < TOP_Y ? lerp(BODY_R, NECK_R, (y - 0.79) / (TOP_Y - 0.79)) : NECK_R);
const rIn = (y) => rOut(y) - 0.012;
// hoop size: the can's height on the floor (pinch while placing)
const HOOP_MIN = 0.25, HOOP_MAX = 1.2;
let hoopH = clamp(+store.get('hoop', 0.6) || 0.6, HOOP_MIN, HOOP_MAX);
const CAM_H = 1.3;                            // camera start height (sets the world scale: ~1 unit = 1 m on a floor)
const G = 9.8;                                // real gravity, metres
const BALLS = 10;
let guideMode = ['off', 'short', 'full'].includes(store.get('guide', 'short')) ? store.get('guide', 'short') : 'short';

// ---------------------------------------------------------------- sound (made here, no files)
const sound = {
  ctx: null, on: store.get('sound', '1') === '1', master: null,
  init() {
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)(); this.ctx.resume();
      if (!this.master) { this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination); }
    } catch (e) { /* no audio */ }
  },
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
  scan() { for (let i = 0; i < 6; i++) this.tone(1500 + i * 120, 1500 + i * 120, 0.05, 0.03, 'square', i * 0.11); },
  pop() { this.tone(240, 900, 0.16, 0.12, 'triangle'); this.noise(0.12, 0.08, 1500, 8000); },
  fizz() { this.noise(0.7, 0.1, 3000, 12000); this.tone(1400, 2600, 0.12, 0.03, 'sine', 0.05); },
  grow() { this.tone(160, 640, 1.1, 0.09, 'sawtooth'); this.noise(1.1, 0.05, 400, 3000); },
  thud() { this.tone(120, 40, 0.35, 0.3, 'sine'); this.noise(0.25, 0.14, 60, 900); },
  lid() { this.tone(900, 1900, 0.09, 0.06, 'triangle'); this.noise(0.4, 0.09, 2500, 12000, 0.03); },
  throwIt() { this.noise(0.18, 0.05, 1500, 6000); },
  rim(v) { const f = 1700 + Math.random() * 300; this.tone(f, f * 0.98, 0.35, Math.min(0.08, 0.02 + v * 0.02), 'triangle'); this.tone(f * 1.51, f * 1.5, 0.25, 0.02, 'sine'); },
  wall(v) { if (v > 0.4) this.tone(420, 300, 0.12, Math.min(0.08, 0.02 + v * 0.015), 'triangle'); },
  bounce(v) { if (v > 0.5) this.tone(260 + v * 40, 160, 0.08, Math.min(0.07, 0.015 + v * 0.012), 'sine'); },
  swish() { this.noise(0.35, 0.12, 2500, 9000); },
  score(n) { [784, 988, 1175, 1568].slice(0, 2 + Math.min(n, 2)).forEach((f, i) => this.tone(f, f, 0.14, 0.06, 'triangle', i * 0.07)); },
  cheer() { this.noise(1.4, 0.06, 500, 4000); for (let i = 0; i < 4; i++) this.tone(600 + Math.random() * 500, 700 + Math.random() * 500, 0.2, 0.02, 'triangle', 0.1 + i * 0.18); },
  miss() { this.tone(330, 220, 0.25, 0.05, 'triangle'); },
  mew() { this.tone(620, 880, 0.14, 0.07, 'triangle'); this.tone(880, 560, 0.22, 0.07, 'triangle', 0.13); },
  click() { this.tone(1200, 900, 0.05, 0.05, 'triangle'); },
};

// ---------------------------------------------------------------- loading
const loadTex = (src) => new Promise((res, rej) => new THREE.TextureLoader().load(src, res, undefined, rej));
const getJson = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(r.status + ' ' + u); return r.json(); });
const gl = new GLTFLoader();
const assets = Promise.all([
  getJson(KC + 'image-targets/layout.json'),
  Promise.all(TARGETS.map((n) => getJson(KC + `image-targets/${n}.json`))),
  gl.loadAsync('/evade/keychain/ar/eclipse-can.glb'),
]).then(([layout, tdata, can]) => ({ layout, tdata, can }));
const boboAsset = assets.then(() => gl.loadAsync('/evade/keychain/ar/bobo-keychain.glb')).catch(() => null);   // Bobo cheers by the can (after the can: it is not needed to start)
const xrReady = new Promise((res) => (window.XR8 ? res() : window.addEventListener('xrloaded', () => res(), { once: true })));
let loaded = false;
Promise.all([assets, xrReady]).then(() => { loaded = true; $('b-start').disabled = false; $('b-start').textContent = 'Start'; $('load').hidden = true; })
  .catch((e) => showError('Couldn\'t load Bobo Hoops', String((e && e.message) || e)));
setTimeout(() => { if (!window.XR8) showError('The AR engine didn\'t load', 'Check your connection and try again.'); }, 30000);

// ---------------------------------------------------------------- scene
let scene, camera, renderer;
const A = new THREE.Group();                  // follows the charm picture (children in metres of the print)
const CF = new THREE.Group(); A.add(CF);      // the can charm's frame inside the picture
const canRoot = new THREE.Group();            // the can: model units inside (0.99 tall); its transform says where and how big
let canModel = null, canMixer = null, canClips = {}, canMats = [], bindPose = [];
let lie = null;                               // where the can lies exactly over its print, in the charm frame
let sil = null, silRim = null, scanBar = null;
const inner = new THREE.Group();              // the open top: inner wall, inner floor, rim (shown once the lid is off)
let lidFly = null;                            // the lid that pops off
const clipTop = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);   // cuts the lid off the can (world space)
const reticle = new THREE.Group();
const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
const dust = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
const hoop = { pos: new THREE.Vector3(), yaw: 0, s: 1 };   // the placed can (world): floor point, facing, metres per model unit
let bobo = null, boboMixer = null, boboClips = {}, boboAct = null;

// the cut-out: the silhouette picture's shape as a flat white mask (tinted by the material colour), shown only below
// the scan line (a clipping plane in the charm frame, re-derived every frame).
function maskTexture(src) {
  const img = src.image, c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) { const on = d.data[i + 3] > 127; d.data[i] = d.data[i + 1] = d.data[i + 2] = 255; d.data[i + 3] = on ? 255 : 0; }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c); t.flipY = src.flipY; t.colorSpace = THREE.SRGBColorSpace; return t;
}
const scanClip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);   // world space: keeps what is below the scan line
const silMat = (map, col) => new THREE.MeshBasicMaterial({ map, color: col, transparent: true, alphaTest: 0.5, depthWrite: false, clippingPlanes: [scanClip] });
const _m3 = new THREE.Matrix3();
function setScanCut(k) {                       // k: 0 = nothing shown, 1 = the whole cut-out (fraction of the charm's height)
  const local = new THREE.Plane(new THREE.Vector3(0, -1, 0), (k - 0.5) * CHARM.h + (k >= 1 ? 1 : 0));
  CF.updateMatrixWorld(true); scanClip.copy(local).applyMatrix4(CF.matrixWorld, _m3.getNormalMatrix(CF.matrixWorld));
}

function buildScene(xr, data) {
  ({ scene, camera, renderer } = xr);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.localClippingEnabled = true;
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.65;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x66584a, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(2, 5, 3); scene.add(sun);
  camera.position.set(0, CAM_H, 0); camera.quaternion.identity();
  XR8.XrController.updateCameraProjectionMatrix({ origin: camera.position, facing: camera.quaternion });
  scene.add(A); A.visible = false;
  buildCan(data.can);
  // the floor: reticle ring, the can's shadow, the landing dust ring
  const ringM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 56), ringM), dot = new THREE.Mesh(new THREE.CircleGeometry(0.08, 24), ringM);
  for (const m of [ring, dot]) { m.rotation.x = -Math.PI / 2; reticle.add(m); }
  reticle.visible = false; scene.add(reticle);
  for (const m of [shadow, dust]) { m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 1; scene.add(m); }
  buildBalls();
  boboAsset.then((g) => { if (g) buildBobo(g); });
}

function buildCan(gltf) {
  canModel = gltf.scene;
  canModel.traverse((o) => {
    bindPose.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]);
    if (!o.isMesh) return;
    o.frustumCulled = false;
    o.material = o.material.clone(); canMats.push(o.material);
  });
  canMixer = new THREE.AnimationMixer(canModel);
  for (const c of gltf.animations) canClips[c.name] = c;
  // the silhouette quad that ships in the GLB covers the charm's print: it becomes the dark cut-out (and its rim),
  // pinned to the charm frame; the model lies at (charm frame) x (silhouette matrix)^-1, i.e. over its print
  const s0 = canModel.getObjectByName('Silhouette'); s0.updateMatrix(); const silLocal = s0.matrix.clone();
  const map = maskTexture(s0.material.map); s0.removeFromParent();
  // the GLB's own quad: its uvs match the picture
  sil = new THREE.Mesh(s0.geometry, silMat(map, 0x0f1519)); sil.scale.set(CHARM.w, CHARM.h, 1); sil.position.z = 0.0004; sil.renderOrder = 3;
  silRim = new THREE.Mesh(s0.geometry, silMat(map, 0x4fd6e8)); silRim.scale.set(CHARM.w * 1.12, CHARM.h * 1.065, 1); silRim.position.z = 0.0002; silRim.renderOrder = 2;
  scanBar = new THREE.Mesh(new THREE.PlaneGeometry(CHARM.w * 1.25, CHARM.h * 0.025), new THREE.MeshBasicMaterial({ color: 0x4fd6e8, transparent: true, depthWrite: false }));
  scanBar.position.z = 0.0008; scanBar.renderOrder = 4;
  sil.name = 'sil'; silRim.name = 'silRim'; canRoot.name = 'canRoot';
  CF.add(silRim, sil, scanBar);
  const L = new THREE.Matrix4().makeScale(CHARM.w, CHARM.h, 1).multiply(silLocal.clone().invert());
  lie = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), sc: new THREE.Vector3() }; L.decompose(lie.pos, lie.quat, lie.sc);
  lie.pos.z += 0.0025;
  canRoot.add(canModel); CF.add(canRoot); canRoot.visible = false;
  // the open top: an inner wall (back faces of a lathe a wall's thickness in), an inner floor, a rolled rim
  const alu = new THREE.MeshStandardMaterial({ color: 0xb9c0c7, metalness: 0.75, roughness: 0.32 });
  const pts = []; for (let i = 0; i <= 24; i++) { const y = BASE_Y + (TOP_Y - BASE_Y) * i / 24; pts.push(new THREE.Vector2(rIn(y), y)); }
  const wall = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), new THREE.MeshStandardMaterial({ color: 0x7b848c, metalness: 0.6, roughness: 0.45, side: THREE.BackSide }));
  const floorIn = new THREE.Mesh(new THREE.CircleGeometry(rIn(BASE_Y), 40), new THREE.MeshStandardMaterial({ color: 0x4d555c, metalness: 0.5, roughness: 0.6 }));
  floorIn.rotation.x = -Math.PI / 2; floorIn.position.y = BASE_Y + 0.002;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(NECK_R, RIM_T, 10, 56), alu); rim.rotation.x = Math.PI / 2; rim.position.y = TOP_Y;
  const rimLine = new THREE.Mesh(new THREE.TorusGeometry(NECK_R, RIM_T * 1.45, 8, 56), new THREE.MeshBasicMaterial({ color: 0x15131a, side: THREE.BackSide }));
  rimLine.rotation.x = Math.PI / 2; rimLine.position.y = TOP_Y;
  inner.add(wall, floorIn, rim, rimLine); inner.visible = false; canRoot.add(inner);
  // the lid that pops off (a flat aluminium disc + the tab)
  lidFly = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(NECK_R, NECK_R, 0.02, 40), alu); lidFly.add(disc);
  const tab = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.18), alu); tab.position.set(0, 0.016, 0.05); lidFly.add(tab);
  lidFly.visible = false; canRoot.add(lidFly);
}
function resetCanPose() { canMixer.stopAllAction(); for (const [o, p, q, s] of bindPose) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(s); } }
function playCan(name, loop = true) {
  const c = canClips[name]; if (!c) return null;
  canMixer.stopAllAction(); const a = canMixer.clipAction(c); a.reset(); a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = !loop; a.play(); return a;
}
function setOpenTop(on) {
  inner.visible = on;
  for (const m of canMats) { m.clippingPlanes = on ? [clipTop] : null; m.needsUpdate = true; }
  for (const n of ['Can_Tab', 'Can_Rivet', 'Can_Opening']) { const o = canModel.getObjectByName(n); if (o) o.visible = !on; }
  for (let i = 1; i <= 7; i++) { const o = canModel.getObjectByName('Can_Fizz_' + i); if (o) o.visible = !on; }
}

function buildBobo(g) {
  bobo = g.scene; bobo.visible = false;
  const s0 = bobo.getObjectByName('Silhouette'); if (s0) s0.removeFromParent();
  bobo.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  boboMixer = new THREE.AnimationMixer(bobo);
  for (const c of g.animations) boboClips[c.name] = c;
  const sit = boboClips.Sit && boboMixer.clipAction(boboClips.Sit); if (sit) sit.play(); boboMixer.update(0); bobo.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(bobo, true); bobo.userData.h = box.max.y - box.min.y; bobo.userData.y0 = box.min.y;
  bobo.userData.wrap = new THREE.Group(); bobo.userData.wrap.add(bobo); scene.add(bobo.userData.wrap);
  boboAct = sit;
}
function boboDo(name) {
  if (!bobo || !boboClips[name]) return;
  const a = boboMixer.clipAction(boboClips[name]); a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true;
  a.crossFadeFrom(boboAct, 0.2, false); a.play();
  const back = () => { boboMixer.removeEventListener('finished', back); const s = boboMixer.clipAction(boboClips.Sit); s.reset(); s.play(); s.crossFadeFrom(a, 0.3, false); boboAct = s; };
  boboMixer.addEventListener('finished', back); boboAct = a;
}
function placeBobo(on) {
  if (!bobo) return; const w = bobo.userData.wrap;
  bobo.visible = on; if (!on) return;
  const h = hoopH * 0.62, k = h / bobo.userData.h;
  bobo.scale.setScalar(k); bobo.position.y = -bobo.userData.y0 * k;
  const side = new THREE.Vector3(Math.cos(hoop.yaw), 0, -Math.sin(hoop.yaw));   // the can's right (as the player sees it)
  w.position.copy(hoop.pos).addScaledVector(side, BODY_R * hoop.s + h * 0.55);
  w.rotation.y = hoop.yaw - 0.35;
  w.userData.pop = 0;
}

// ---------------------------------------------------------------- tracking (image target)
const TS = {};
let layout = null;
function initTargets(targets, lay) {
  layout = lay;
  for (const t of targets) {
    const c = lay.targets[t.name].charms.can;
    const local = new THREE.Matrix4().makeTranslation(c.x, c.y, 0).multiply(new THREE.Matrix4().makeRotationZ(c.rz)).multiply(new THREE.Matrix4().makeScale(c.mirror ? -c.s : c.s, c.s, c.s));
    TS[t.name] = { name: t.name, pr: t.properties, H: lay.targets[t.name].heightM, local, mirror: !!c.mirror, tracked: false, at: 0, gap: 40, p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1 };
  }
}
function onTarget(d) {
  const t = TS[d.name]; if (!t) return;
  const upp = d.scale * (d.scaledHeight || 1) / t.pr.height;          // world units per target pixel
  t.q.set(d.rotation.x, d.rotation.y, d.rotation.z, d.rotation.w); t.p.set(d.position.x, d.position.y, d.position.z);
  t.s = t.pr.height * upp / t.H;                                       // world units per metre of the print
  const now = performance.now();
  if (!t.tracked) { diag.found++; } else t.gap += (clamp(now - t.at, 8, 400) - t.gap) * 0.2;
  t.tracked = true; t.at = now;
}
function onLost(d) { const t = TS[d.name]; if (t && t.tracked) { t.tracked = false; diag.lost++; } }
let side = null;
function pickSide() {
  const on = Object.values(TS).filter((t) => t.tracked);
  if (!on.length) return side;
  if (!side || !TS[side].tracked) side = on[0].name;
  return side;
}
const pose = { state: 'none', lostAt: 0, snap: true, goneAt: 0 };
function updatePose(now) {
  for (const x of Object.values(TS)) if (x.tracked && now - x.at > clamp(x.gap * 3, 120, 300)) x.tracked = false;   // the engine went quiet
  const n = pickSide(), t = n && TS[n];
  let st;
  if (t && t.tracked) { st = 'track'; pose.lostAt = now; follow(t); }
  else st = pose.state !== 'none' && now - pose.lostAt < 150 ? 'hold' : 'none';   // a blink only: nothing shows unless tracked now
  if (st === 'none' && pose.state !== 'none') pose.goneAt = now;
  if (st === 'none') pose.snap = true;
  const fresh = st !== 'none' && pose.state === 'none';
  pose.state = st; A.visible = st !== 'none';
  if (fresh) arrived(now);
}
function follow(t) {
  const s = t.s, p = t.p, q = t.q;
  const aP = pose.snap ? 1 : clamp(A.position.distanceTo(p) / s / 0.0015, 0.5, 1);
  const aR = pose.snap ? 1 : clamp(A.quaternion.angleTo(q) / 0.03, 0.5, 1);
  pose.snap = false;
  A.position.lerp(p, aP); A.quaternion.slerp(q, aR); A.scale.setScalar(lerp(A.scale.x, s, pose.snap ? 1 : 0.6));
  CF.matrix.copy(t.local); CF.matrix.decompose(CF.position, CF.quaternion, CF.scale);
  // the back of the charm: the can turns round to show its back (QR side) rather than reading as a mirror image
  canModel.scale.z = t.mirror ? -1 : 1;
  A.updateMatrixWorld(true);
}

// ---------------------------------------------------------------- the flow
let mode = 'find';
function setMode(m) { mode = m; $('hud').dataset.mode = m; $('b-move-can').hidden = !(m === 'play' || m === 'drop'); diag.steps.push([m, Math.round(performance.now())]); }
const reveal = { t: -1 };
function arrived(now) {
  if (mode === 'find' || (mode === 'ready' && now - pose.goneAt > 2500)) {
    if (mode === 'find' && !diag.firstFoundS) { diag.firstFoundS = +((now - camStartAt) / 1000).toFixed(1); postEvent('found', {}); }
    setMode('reveal'); reveal.t = 0; reveal.popped = false; hint(''); sound.scan(); buzz([10, 40, 18]);
    $('b-play').hidden = true;
  }
}
// reveal: 0..0.9 s scan line up the charm (the cut-out fills in behind it), 0.9..1.3 s shiver, then the PopOut clip
const SCAN_S = 0.9, SHIVER_S = 0.4, _dimRim = new THREE.Color(0x1d6f7c);
let revealCut = 0;
function tickReveal(dt) {
  if (mode !== 'reveal' && mode !== 'ready') return;
  const vis = A.visible;
  if (mode === 'reveal') {
    reveal.t += dt; const t = reveal.t;
    const k = clamp(t / SCAN_S, 0, 1);
    revealCut = k;
    scanBar.visible = k < 1; scanBar.position.y = (k - 0.5) * CHARM.h; scanBar.material.opacity = 0.9;
    canRoot.visible = t > SCAN_S;
    if (t > SCAN_S && t < SCAN_S + SHIVER_S) {
      placeOnCharm(Math.sin((t - SCAN_S) * 40) * 0.04 * ((t - SCAN_S) / SHIVER_S), 0.12);
    } else if (t >= SCAN_S + SHIVER_S && !reveal.popped) {
      reveal.popped = true; placeOnCharm(0, 1); sound.pop(); sound.fizz(); buzz(20);
      const a = playCan('PopOut', false); reveal.popLen = a ? canClips.PopOut.duration : 0.8;
    }
    if (reveal.popped) {
      // lift off the print: the clip does the jump, we fill out its depth and float it a little in front
      const k2 = clamp((t - SCAN_S - SHIVER_S) / 0.6, 0, 1);
      placeOnCharm(0, lerp(0.12, 1, easeOut(k2)), 0.012 * easeOut(k2));
      if (t > SCAN_S + SHIVER_S + reveal.popLen) { playCan('Idle'); setMode('ready'); }
    }
  } else {
    placeOnCharm(0, 1, 0.012 + Math.sin(clock.t * 2.4) * 0.002);
  }
  silRim.material.color.setHex(0x4fd6e8).lerp(_dimRim, 0.5 + 0.5 * Math.sin(clock.t * 4));   // a pulsing rim (colour, not opacity: alphaTest would cut it)
  if (A.visible) setScanCut(mode === 'reveal' ? revealCut : 1);
  $('b-play').hidden = !(mode === 'ready' && vis);
  if (mode === 'ready') hint(vis ? '' : 'Point at the can again');
}
function placeOnCharm(wiggle, depthK, lift = 0) {
  canRoot.position.copy(lie.pos); canRoot.position.z += lift;
  canRoot.quaternion.copy(lie.quat); if (wiggle) canRoot.rotateZ(wiggle);
  canRoot.scale.set(lie.sc.y, lie.sc.y, lie.sc.y * depthK);
}

// Play Some Hoops: the can leaves the charm. Its world transform comes off the charm (scene.attach keeps it). The
// target pose is in SLAM units, which need not match the print's real size, so slide it along the camera ray to
// 30 cm away and shrink it by the same factor: the same picture on screen, now at a sensible depth to grow from.
const grow = { t: -1, p0: new THREE.Vector3(), q0: new THREE.Quaternion(), s0: 1 };
function takeOffCharm() {
  sound.click(); sound.grow(); buzz(15);
  $('b-play').hidden = true;
  scene.attach(canRoot); canModel.scale.z = 1;   // the label faces you from here on
  const cam = camera.position, d0 = canRoot.position.distanceTo(cam), k = 0.3 / Math.max(d0, 1e-3);
  grow.p0.copy(cam).addScaledVector(canRoot.position.clone().sub(cam), k);
  grow.q0.copy(canRoot.quaternion); grow.s0 = canRoot.scale.y * k;
  canRoot.position.copy(grow.p0); canRoot.scale.setScalar(grow.s0);
  grow.t = 0; setMode('grow');
  A.visible = false; aWanted = false;
  postEvent('custom', { action: 'hoops-play' });
}
let aWanted = true;                            // the charm's cut-out stays only while we're on the keychain
const GROW_S = 1.3;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
function hoverPose(out) {                      // where the can floats while you place it
  if (reticle.visible) { out.p.copy(reticle.position); out.p.y += hoopH * (0.35 + 0.04 * Math.sin(clock.t * 3)); }
  else { camera.getWorldDirection(_v); out.p.copy(camera.position).addScaledVector(_v, 1.2); out.p.y -= 0.25; }
  const yaw = Math.atan2(camera.position.x - out.p.x, camera.position.z - out.p.z);
  out.q.setFromEuler(_e.set(0, yaw, 0)); out.s = hoopH / 0.99; out.yaw = yaw;
}
const hv = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1, yaw: 0 };
function tickGrow(dt) {
  if (mode === 'grow') {
    grow.t += dt; const k = clamp(grow.t / GROW_S, 0, 1);
    hoverPose(hv);
    const e = easeOutBack(k), spin = (1 - easeOut(k)) * Math.PI * 3;
    canRoot.position.lerpVectors(grow.p0, hv.p, easeInOut(k)); canRoot.position.y += Math.sin(k * Math.PI) * 0.25;
    _q.slerpQuaternions(grow.q0, hv.q, easeInOut(k)); canRoot.quaternion.copy(_q); canRoot.rotateY(spin);
    canRoot.scale.setScalar(lerp(grow.s0, hv.s, e));
    if (k >= 1) { setMode('placing'); hint('Point at the floor or a table'); }
  } else if (mode === 'placing') {
    hoverPose(hv);
    const a = 1 - Math.exp(-8 * dt);
    canRoot.position.lerp(hv.p, a); canRoot.quaternion.slerp(hv.q, a); canRoot.scale.setScalar(lerp(canRoot.scale.x, hv.s, a));
    $('b-place').hidden = false; $('b-place').disabled = !reticle.visible;
    $('size').hidden = false; $('size').textContent = `Can ${Math.round(hoopH * 100)} cm tall · pinch to size`;
    if (!trackingBad()) hint(reticle.visible ? 'Tap Place when the ring is where you want it' : 'Point at the floor or a table');
  }
}
// the floor: a ray from the middle of the screen to the plane y = 0 (what 8th Wall's own examples do)
const ray = new THREE.Raycaster(), floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
function tickFloor(dt) {
  const placing = mode === 'grow' || mode === 'placing';
  if (!placing) { reticle.visible = false; return; }
  if (testFloor) { reticle.visible = true; shadow.visible = true; shadow.position.copy(reticle.position); shadow.scale.setScalar(BODY_R * hoopH / 0.99); return; }
  ray.setFromCamera(new THREE.Vector2(0, -0.15), camera);
  let ok = false;
  if (ray.ray.intersectPlane(floorPlane, hit)) { const d = hit.distanceTo(camera.position); ok = d > 0.45 && d < 7; }
  if (ok) {
    if (!reticle.visible) reticle.position.copy(hit); else reticle.position.lerp(hit, 1 - Math.exp(-16 * dt));
    reticle.position.y = 0.002; reticle.scale.setScalar(BODY_R * (hoopH / 0.99) * 1.25);
  }
  reticle.visible = ok;
  shadow.visible = ok; if (ok) { shadow.position.copy(reticle.position); shadow.position.y = 0.001; shadow.scale.setScalar(BODY_R * hoopH / 0.99); }
}
const drop = { t: -1, from: new THREE.Vector3() };
function placeCan() {
  if (!reticle.visible || mode !== 'placing') return;
  sound.click(); store.set('hoop', hoopH.toFixed(2));
  hoop.pos.copy(reticle.position); hoop.pos.y = 0; hoop.s = hoopH / 0.99;
  hoop.yaw = Math.atan2(camera.position.x - hoop.pos.x, camera.position.z - hoop.pos.z);
  drop.from.copy(canRoot.position); drop.q0 = canRoot.quaternion.clone(); drop.t = 0; drop.landed = false;
  $('b-place').hidden = true; $('size').hidden = true; hint('');
  setMode('drop');
}
const DROP_S = 0.42, LID_S = 0.7;
let topOff = false;
function tickDrop(dt) {
  if (mode !== 'drop') return;
  drop.t += dt; const t = drop.t;
  const q = new THREE.Quaternion().setFromEuler(_e.set(0, hoop.yaw, 0));
  if (t < DROP_S) {
    const k = t / DROP_S;
    canRoot.position.lerpVectors(drop.from, hoop.pos, k * k); canRoot.quaternion.slerpQuaternions(drop.q0, q, easeOut(k)); canRoot.scale.setScalar(hoop.s);
  } else {
    if (!drop.landed) {
      drop.landed = true; sound.thud(); buzz([30, 30, 20]);
      dust.visible = true; dust.position.copy(hoop.pos); dust.position.y = 0.003; dust.userData.t = 0;
      if (!topOff) {   // the lid pops off once: the can stays open-topped from then on, even when it is moved
        topOff = true; resetCanPose(); setOpenTop(true);
        lidFly.visible = true; lidFly.position.set(0, TOP_Y + 0.01, 0); lidFly.rotation.set(0, 0, 0); lidFly.userData.v = new THREE.Vector3(0.25, 2.2, 0.6); lidFly.userData.t = 0;
        sound.lid();
      }
    }
    const k = clamp((t - DROP_S) / 0.28, 0, 1);   // squash and stretch on landing
    const sq = 1 - 0.14 * Math.sin(k * Math.PI);
    canRoot.position.copy(hoop.pos); canRoot.quaternion.copy(q);
    canRoot.scale.set(hoop.s * (2 - sq), hoop.s * sq, hoop.s * (2 - sq));
    if (t > DROP_S + LID_S) { canRoot.scale.setScalar(hoop.s); startGame(); }
  }
}
function tickFx(dt) {
  if (dust.visible) {
    const u = dust.userData; u.t += dt; const k = u.t / 0.6;
    dust.scale.setScalar(BODY_R * hoop.s * (1.1 + 1.6 * easeOut(k))); dust.material.opacity = 0.7 * (1 - k);
    if (k >= 1) dust.visible = false;
  }
  if (lidFly.visible && lidFly.userData.v) {
    const u = lidFly.userData; u.t += dt;
    u.v.y -= 4 * dt; lidFly.position.addScaledVector(u.v, dt); lidFly.rotation.x += 9 * dt; lidFly.rotation.z += 4 * dt;
    if (u.t > 0.9) lidFly.visible = false;
  }
  if (bobo && bobo.visible) {
    const w = bobo.userData.wrap; w.userData.pop = Math.min(1, (w.userData.pop || 0) + dt / 0.45);
    w.scale.setScalar(REDUCED ? 1 : easeOutBack(w.userData.pop));
  }
}

// ---------------------------------------------------------------- the game
const BALL_COLS = { base: 0xf6c344, money: 0x4fd6e8 };
const balls = [];
let held = null, ballGeo = null, ballTex = {}, guide = null;
const game = { on: false, left: BALLS, thrown: 0, score: 0, made: 0, swish: 0, streak: 0, best: +store.get('best', 0) || 0, resolved: 0 };
const R = () => hoopH * 0.07;                 // ball radius: the opening is about 3.2 balls across
function ballTexture(col) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#' + col.toString(16).padStart(6, '0'); g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#15131a'; g.lineWidth = 7;                   // the seams of a ball, flat
  g.beginPath(); g.moveTo(0, 64); g.lineTo(256, 64); g.stroke();
  g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 128); g.moveTo(192, 0); g.lineTo(192, 128); g.stroke();
  g.beginPath(); g.ellipse(128, 64, 44, 64, 0, 0, Math.PI * 2); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function buildBalls() {
  ballGeo = new THREE.SphereGeometry(1, 28, 18);
  ballTex.base = ballTexture(BALL_COLS.base); ballTex.money = ballTexture(BALL_COLS.money);
  // the aim arc: flat round dots
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 26, 0, Math.PI * 2); g.fill();
  const N = 28, geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  guide = new THREE.Points(geo, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(c), size: 11, sizeAttenuation: false, transparent: true, depthWrite: false, depthTest: false, opacity: 0.9, alphaTest: 0.3 }));
  guide.frustumCulled = false; guide.visible = false; guide.renderOrder = 20; scene.add(guide);
}
const isMoney = (i) => i === BALLS - 1;
function makeBall(money) {
  const m = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ map: money ? ballTex.money : ballTex.base, roughness: 0.55, metalness: 0 }));
  m.scale.setScalar(R()); scene.add(m); return m;
}
function startGame() {
  setMode('play');
  for (const b of balls) scene.remove(b.m); balls.length = 0;
  Object.assign(game, { on: true, left: BALLS, thrown: 0, score: 0, made: 0, swish: 0, streak: 0, resolved: 0 });
  $('board').hidden = false; $('rack').hidden = false; drawBoard(); drawRack();
  placeBobo(true);
  nextBall(0.2);
  hint('Swipe up to shoot. Longer swipe, more power');
  setTimeout(() => { if (mode === 'play' && game.thrown === 0) hint('Aim with your phone, then swipe up from the bottom'); }, 6000);
}
function nextBall(delay = 0.55) {
  if (held || game.thrown >= BALLS) return;
  held = { m: makeBall(isMoney(game.thrown)), t: -delay, money: isMoney(game.thrown) };
  held.m.visible = false;
}
// the held ball sits low in the middle of the view, rises a little while you swipe
const HOLD_OFF = new THREE.Vector3(0, -0.13, -0.36), HELD_R = 0.016;   // held up close it is drawn small; it grows to its real size as it flies off
function tickHeld(dt) {
  if (!held) return;
  held.t += dt; held.m.visible = held.t > 0;
  const k = easeOutBack(clamp(held.t / 0.3, 0, 1));
  const pull = aim.on ? aim.power : 0;
  _v.copy(HOLD_OFF); _v.y += -0.1 * (1 - k) + pull * 0.03; _v.x += aim.on ? aim.side * 0.04 : 0;
  held.m.position.copy(_v.applyMatrix4(camera.matrixWorld));
  held.m.scale.setScalar(HELD_R * Math.max(0.01, k));
  held.m.rotation.x += dt * 0.8;
}
// aiming: swipe up. power = the swipe's length (0..1 over 65% of the screen height) = how FAR the ball goes: it is
// mapped to a landing distance at the can's rim height (0.6 to 5 m), not to a raw speed, so the same swipe always
// carries the same distance whatever angle you hold the phone at (a raw-speed swipe was ~3 cm of landing per pixel:
// unplayable). side = the swipe's sideways lean.
const aim = { on: false, id: null, x0: 0, y0: 0, power: 0, side: 0 };
function aimFrom(e) {
  const up = aim.y0 - e.clientY, dx = e.clientX - aim.x0;
  aim.power = clamp(up / (innerHeight * 0.65), 0, 1);
  aim.side = clamp(Math.atan2(dx, Math.max(up, 40)), -0.6, 0.6);
}
function launchVelocity(power, sideAng, out) {
  camera.getWorldDirection(_v2);
  const pitch = Math.asin(clamp(_v2.y, -1, 1));
  const h = _v.set(_v2.x, 0, _v2.z); if (h.lengthSq() < 1e-6) h.set(0, 0, -1); h.normalize();
  h.applyAxisAngle(THREE.Object3D.DEFAULT_UP, -sideAng * 0.75);
  let elev = clamp(0.8 + 0.55 * pitch, 0.3, 1.25);   // the arc starts higher when you look up, flatter when you look down
  const D = RANGE_MIN + power * (RANGE_MAX - RANGE_MIN);
  const y0 = launchPoint(_v3).y, yT = (hoopUp() ? hoop.pos.y + TOP_Y * hoop.s : y0 - 0.5);
  let den = D * Math.tan(elev) - (yT - y0);
  if (den < 0.05 * D) { elev = Math.atan((yT - y0 + 0.05 * D) / D + 0.05); den = D * Math.tan(elev) - (yT - y0); }
  const c = Math.cos(elev), speed = Math.min(14, Math.sqrt(G * D * D / (2 * c * c * Math.max(den, 1e-3))));
  return out.copy(h).multiplyScalar(c * speed).setY(Math.sin(elev) * speed);
}
const RANGE_MIN = 0.6, RANGE_MAX = 5;
const _v3 = new THREE.Vector3();
const hoopUp = () => mode === 'play' || mode === 'drop';
function launchPoint(out) { return out.copy(HOLD_OFF).applyMatrix4(camera.matrixWorld); }
function throwBall(power, sideAng) {
  if (!held || held.t < 0.15 || mode !== 'play') return false;
  const b = { m: held.m, p: launchPoint(new THREE.Vector3()), v: launchVelocity(power, sideAng, new THREE.Vector3()), inside: false, rim: 0, wall: 0, outer: 0, rattle: 0, done: false, age: 0, rest: 0, money: held.money, from: 0, idx: game.thrown };
  b.from = Math.hypot(b.p.x - hoop.pos.x, b.p.z - hoop.pos.z);
  balls.push(b); held = null; game.thrown++; game.left--; drawRack();
  sound.throwIt(); buzz(8); diag.throws++; hint('');
  nextBall();
  return true;
}
function predictArc(power, sideAng) {
  const pos = guide.geometry.attributes.position, N = pos.count;
  const p = launchPoint(new THREE.Vector3()), v = launchVelocity(power, sideAng, new THREE.Vector3());
  const tFull = (v.y + Math.sqrt(v.y * v.y + 2 * G * Math.max(0.05, p.y))) / G;   // until it would reach the floor
  const tMax = guideMode === 'full' ? tFull : tFull * 0.34;
  for (let i = 0; i < N; i++) { const t = (i + 1) / N * tMax; pos.setXYZ(i, p.x + v.x * t, p.y + v.y * t - 0.5 * G * t * t, p.z + v.z * t); }
  pos.needsUpdate = true;
}
const canvas = $('cam');
canvas.addEventListener('pointerdown', (e) => {
  touches.set(e.pointerId, e);
  if (mode === 'placing' && touches.size === 2) { const [a, b] = [...touches.values()]; pinch0 = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), h: hoopH }; return; }
  if (mode !== 'play' || !held || aim.on) return;
  aim.on = true; aim.id = e.pointerId; aim.x0 = e.clientX; aim.y0 = e.clientY; aim.power = 0; aim.side = 0;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* none */ }
});
canvas.addEventListener('pointermove', (e) => {
  if (touches.has(e.pointerId)) touches.set(e.pointerId, e);
  if (pinch0 && touches.size === 2) { const [a, b] = [...touches.values()]; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); hoopH = clamp(pinch0.h * d / Math.max(20, pinch0.d), HOOP_MIN, HOOP_MAX); return; }
  if (aim.on && e.pointerId === aim.id) aimFrom(e);
});
const endPointer = (e, cancel) => {
  touches.delete(e.pointerId); if (touches.size < 2) pinch0 = null;
  if (!aim.on || e.pointerId !== aim.id) return;
  aimFrom(e); aim.on = false; guide.visible = false;
  if (!cancel && aim.power > 0.06) throwBall(aim.power, aim.side);
};
canvas.addEventListener('pointerup', (e) => endPointer(e, false));
canvas.addEventListener('pointercancel', (e) => endPointer(e, true));
const touches = new Map(); let pinch0 = null;

// physics: spheres against the can (in its own upright frame: the can stands on the floor, y up), the floor, each other
const SUB = 4;
function tickBalls(dt) {
  if (guide) { guide.visible = aim.on && guideMode !== 'off' && aim.power > 0.03 && mode === 'play'; if (guide.visible) predictArc(aim.power, aim.side); }
  if (!balls.length) return;
  const r = R(), s = hoop.s, cx = hoop.pos.x, cz = hoop.pos.z, fy = hoop.pos.y;
  const topY = fy + TOP_Y * s, neck = NECK_R * s, rimT = RIM_T * s, baseY = fy + BASE_Y * s;
  const h = dt / SUB;
  for (let st = 0; st < SUB; st++) {
    for (const b of balls) {
      if (b.done) continue;
      const py0 = b.p.y;
      b.v.y -= G * h; b.p.addScaledVector(b.v, h);
      let dx = b.p.x - cx, dz = b.p.z - cz, rho = Math.hypot(dx, dz);
      const ux = rho > 1e-6 ? dx / rho : 1, uz = rho > 1e-6 ? dz / rho : 0;
      const ly = (b.p.y - fy) / s;                     // height in can units
      // into the can through the opening
      if (!b.inside && py0 >= topY && b.p.y < topY && rho < neck - r * 0.25) b.inside = true;
      if (b.inside) {
        const lim = rIn(clamp(ly, BASE_Y, TOP_Y)) * s - r;
        if (b.p.y < topY + r && rho > lim) {           // the inner wall
          b.p.x = cx + ux * lim; b.p.z = cz + uz * lim;
          const vn = b.v.x * ux + b.v.z * uz; if (vn > 0) { b.v.x -= 1.5 * vn * ux; b.v.z -= 1.5 * vn * uz; b.wall++; if (b.p.y > topY - 0.3 * TOP_Y * s) b.rattle++; sound.wall(vn); }
        }
        if (b.p.y < baseY + r) { b.p.y = baseY + r; if (b.v.y < 0) { sound.bounce(-b.v.y); b.v.y *= -0.3; } b.v.x *= 0.9; b.v.z *= 0.9; }
        if (b.p.y > topY + r * 1.2) b.inside = false;  // bounced back out
      } else if (b.p.y < topY && rho < rOut(clamp(ly, 0, TOP_Y)) * s + r) {   // the outside of the can
        const lim = rOut(clamp(ly, 0, TOP_Y)) * s + r;
        b.p.x = cx + ux * lim; b.p.z = cz + uz * lim;
        const vn = b.v.x * ux + b.v.z * uz; if (vn < 0) { b.v.x -= 1.5 * vn * ux; b.v.z -= 1.5 * vn * uz; b.wall++; b.outer++; sound.wall(-vn); }
      }
      // the rim: a torus round the opening
      dx = b.p.x - cx; dz = b.p.z - cz; rho = Math.hypot(dx, dz);
      const qx = cx + (rho > 1e-6 ? dx / rho : 1) * neck, qz = cz + (rho > 1e-6 ? dz / rho : 0) * neck;
      _v.set(b.p.x - qx, b.p.y - topY, b.p.z - qz); const dl = _v.length();
      if (dl < r + rimT && dl > 1e-6) {
        _v.multiplyScalar(1 / dl); b.p.set(qx, topY, qz).addScaledVector(_v, r + rimT);
        const vn = b.v.dot(_v); if (vn < 0) { b.v.addScaledVector(_v, -1.55 * vn); b.v.multiplyScalar(0.92); b.rim++; sound.rim(-vn); }
      }
      // the floor round the can
      if (!b.inside && b.p.y < fy + r) {
        b.p.y = fy + r;
        if (b.v.y < 0) { sound.bounce(-b.v.y); b.v.y *= -0.5; }
        b.v.x *= 0.96; b.v.z *= 0.96;
      }
    }
    // ball against ball (a pile in the can)
    for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i], c = balls[j]; if (a.done && c.done) continue;
      _v.subVectors(c.p, a.p); const d = _v.length(); if (d >= 2 * r || d < 1e-6) continue;
      _v.multiplyScalar(1 / d); const push = (2 * r - d) / 2;
      a.p.addScaledVector(_v, -push); c.p.addScaledVector(_v, push);
      const rel = _v2.subVectors(c.v, a.v).dot(_v); if (rel < 0) { a.v.addScaledVector(_v, rel * 0.8); c.v.addScaledVector(_v, -rel * 0.8); }
    }
  }
  for (const b of balls) {
    b.m.position.copy(b.p);
    if (b.done) continue;
    b.age += dt; b.m.rotation.x += b.v.length() * dt * 3;
    b.m.scale.setScalar(lerp(HELD_R, r, easeInOut(b.age / 0.35)));
    if (b.inside && !b.scored && b.p.y < topY - r * 1.6) score(b);
    const slow = b.v.lengthSq() < 0.05;
    b.rest = slow ? b.rest + dt : 0;
    if (b.scored && b.rest > 0.6) b.done = true;       // stays in the can (the pile)
    const far = Math.hypot(b.p.x - cx, b.p.z - cz) > 9 || b.p.y < fy - 3;
    if (!b.inside && !b.scored && (far || b.rest > 0.7 || b.age > 5)) missed(b);
  }
}
function score(b) {
  b.scored = true;
  const sw = b.rim === 0 && b.outer === 0 && b.rattle === 0;   // a swish: clean in (no rim, no outside, no rattle round the top of the wall)
  let pts = sw ? 3 : 2, label = sw ? 'SWISH!' : 'In!';
  const extras = [];
  if (b.from > 2.5) { pts += 1; extras.push('long shot +1'); }
  game.streak++; if (game.streak >= 3) { pts += 1; extras.push(`${game.streak} in a row +1`); }
  if (b.money) { pts *= 2; extras.push('money ball x2'); }
  game.score += pts; game.made++; if (sw) game.swish++;
  popWord(`${label} +${pts}`, extras.join(' · '), b.p, sw || b.money ? 'cyan' : '');
  if (sw) sound.swish(); sound.score(game.streak); buzz(sw ? [20, 30, 20] : 20);
  if (game.streak >= 3 || sw) sound.cheer();
  boboDo(sw ? 'TailWag' : 'PawRaise'); if (sw) sound.mew();
  diag.makes++; resolved();
  $('board').classList.remove('bump'); void $('board').offsetWidth; $('board').classList.add('bump');
}
function missed(b) {
  b.done = true; b.missed = true; game.streak = 0;
  popWord(b.rim ? 'Rimmed out' : 'Miss', '', b.p, 'miss'); sound.miss();
  setTimeout(() => { scene.remove(b.m); const i = balls.indexOf(b); if (i >= 0) balls.splice(i, 1); }, 400);
  resolved();
}
function resolved() {
  game.resolved++; drawBoard();
  if (game.resolved >= BALLS) setTimeout(endGame, 1100);
}
function endGame() {
  if (!game.on) return; game.on = false;
  const best = game.score > game.best; if (best) { game.best = game.score; store.set('best', game.best); }
  $('end-sc').textContent = game.score;
  $('end-line').textContent = `${game.made} of ${BALLS} in · ${game.swish} swish${game.swish === 1 ? '' : 'es'}`;
  $('end-best').textContent = best ? 'New best!' : `Your best: ${game.best}`;
  $('end').hidden = false; $('b-again').focus();
  if (best) sound.cheer();
  hint(''); postEvent('custom', { action: 'hoops-score', score: game.score, made: game.made, swish: game.swish, hoopCm: Math.round(hoopH * 100) });
  flushDiag(true);
}
function drawBoard() {
  $('sc').textContent = game.score; $('made').textContent = `${game.made}/${BALLS}`;
}
function drawRack() {
  const el = $('rack'); if (el.children.length !== BALLS) { el.innerHTML = ''; for (let i = 0; i < BALLS; i++) { const d = document.createElement('i'); if (isMoney(i)) d.className = 'money'; el.appendChild(d); } }
  [...el.children].forEach((d, i) => d.classList.toggle('used', i < game.thrown));
  el.setAttribute('aria-label', `${BALLS - game.thrown} balls left`);
}
function popWord(text, small, at, cls) {
  const p = at.clone().project(camera); if (p.z > 1) return;
  const el = document.createElement('div'); el.className = 'pop-word ' + (cls || '');
  el.textContent = text; if (small) { const s = document.createElement('small'); s.textContent = small; el.appendChild(s); }
  el.style.left = clamp((p.x + 1) / 2 * innerWidth, 80, innerWidth - 80) + 'px'; el.style.top = clamp((1 - p.y) / 2 * innerHeight, 90, innerHeight - 160) + 'px';
  $('pops').appendChild(el); setTimeout(() => el.remove(), 1400);
}
function tickDist() {
  if (mode !== 'play' || !camera) return;
  const d = Math.hypot(camera.position.x - hoop.pos.x, camera.position.z - hoop.pos.z);
  const t = d.toFixed(1) + ' m'; if ($('dist').textContent !== t) $('dist').textContent = t;
}
function resetToPlacing() {
  $('end').hidden = true; game.on = false;
  for (const b of balls) scene.remove(b.m); balls.length = 0; if (held) { scene.remove(held.m); held = null; }
  $('board').hidden = true; $('rack').hidden = true; placeBobo(false);
  lidFly.visible = false;   // the top stays off (Dapo): no setOpenTop(false), no Idle clip
  setMode('placing');
}
$('b-play').onclick = takeOffCharm;
$('b-place').onclick = placeCan;
$('b-again').onclick = () => { $('end').hidden = true; if (held) { scene.remove(held.m); held = null; } startGame(); };
$('b-move').onclick = resetToPlacing;

// ---------------------------------------------------------------- frame
const clock = { t: 0 };
let lastTrack = '', limitedSince = 0;
function tick(dt) {
  const now = performance.now(); clock.t += dt; diag.fpsN++; camera.updateMatrixWorld();
  if (aWanted) updatePose(now); else A.visible = false;
  if (canMixer && (mode === 'reveal' || mode === 'ready' || mode === 'grow' || mode === 'placing')) canMixer.update(dt);
  if (boboMixer && bobo && bobo.visible) boboMixer.update(dt);
  if (topOff) clipTop.constant = canRoot.position.y + (TOP_Y - 0.002) * canRoot.scale.y;   // the cut follows the can wherever it goes
  tickReveal(dt); tickFloor(dt); tickGrow(dt); tickDrop(dt); tickFx(dt);
  tickHeld(dt); tickBalls(dt); tickDist();
  // the world: tracking lost for a while -> say how to get it back (only once we're on the floor)
  if (mode !== 'find' && mode !== 'reveal' && mode !== 'ready') {
    if (lastTrack === 'LIMITED') { if (!limitedSince) limitedSince = now; if (now - limitedSince > 1500) hint('Move your phone slowly so it can see the floor again'); }
    else if (limitedSince) { limitedSince = 0; if (/slowly/.test($('hint').textContent)) hint(''); }
  }
  if (SHOW_DIAG && now - (diag.drawAt || 0) > 500) drawDiag(now);
}
function hint(text) { if ($('hint').textContent !== text) $('hint').textContent = text || ''; }
const trackingBad = () => lastTrack === 'LIMITED' && limitedSince && performance.now() - limitedSince > 1500;
let testFloor = false;

// ---------------------------------------------------------------- options
function segInit(id, cur, fn) {
  const el = $(id), bs = [...el.querySelectorAll('button')];
  const set = (v) => { for (const b of bs) b.setAttribute('aria-checked', String(b.dataset.v === v)); };
  set(cur); bs.forEach((b) => (b.onclick = () => { set(b.dataset.v); fn(b.dataset.v); sound.click(); }));
}
segInit('seg-guide', guideMode, (v) => { guideMode = v; store.set('guide', v); });
const optsEl = $('opts');
function openOpts() { optsEl.hidden = false; $('b-opts').setAttribute('aria-expanded', 'true'); optsEl.querySelector('.x').focus(); }
function closeOpts() { optsEl.hidden = true; $('b-opts').setAttribute('aria-expanded', 'false'); $('b-opts').focus(); }
$('b-opts').onclick = openOpts;
optsEl.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeOpts));
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !optsEl.hidden) closeOpts(); });
const soundBtn = $('o-sound'); soundBtn.setAttribute('aria-checked', String(sound.on));
soundBtn.onclick = () => { sound.on = !sound.on; store.set('sound', sound.on ? '1' : '0'); soundBtn.setAttribute('aria-checked', String(sound.on)); sound.click(); };
$('o-how').onclick = () => { closeOpts(); $('how').hidden = false; $('b-go').focus(); };
$('o-move').onclick = () => { closeOpts(); if (['play', 'drop'].includes(mode) || !$('end').hidden) resetToPlacing(); };
// Move the can: always on screen once it is placed (house rule for world-tracked experiences), bottom right
$('b-move-can').onclick = () => { sound.click(); if (['play', 'drop'].includes(mode) || !$('end').hidden) resetToPlacing(); };
$('b-go').onclick = () => { $('how').hidden = true; store.set('how', '1'); };
function showError(title, body) { $('err-title').textContent = title; $('err-body').textContent = body; $('error').hidden = false; diag.errors.push(`${title}: ${body}`.slice(0, 200)); }
$('err-retry').onclick = () => location.reload();

// ---------------------------------------------------------------- 8th Wall pipeline
// The engine draws into the canvas at its own width/height: unsized it stays 300x150 and the camera looks
// stretched and blurry (Cola Run World phone test). CSS pins it to the screen; this sets the drawing size.
const DPR = clamp(+params.get('dpr') || 1.5, 1, 3);
function sizeCanvas() {
  const dpr = Math.min(devicePixelRatio || 1, DPR), w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}
let last = 0, camStartAt = 0, built = false;
const appModule = (data) => ({
  name: 'bobo-hoops',
  onStart: () => { buildScene(XR8.Threejs.xrScene(), data); built = true; $('hud').hidden = false; setMode('find'); hint('Point at the Eclipse can'); },
  onUpdate: ({ processCpuResult }) => {
    const now = performance.now(); const dt = Math.min((now - (last || now)) / 1000, 0.05); last = now;
    const r = processCpuResult && processCpuResult.reality; if (r && r.trackingStatus) noteTracking(r.trackingStatus, r.trackingReason);
    if (built) tick(dt); flushDiag(false);
  },
  onCameraStatusChange: ({ status }) => {
    diag.steps.push(['cam:' + status, Math.round(performance.now())]);
    if (status === 'hasVideo') {
      camStartAt = performance.now();
      $('splash').classList.add('gone'); setTimeout(() => { $('splash').hidden = true; }, 600);
      if (store.get('how', '0') !== '1') { $('how').hidden = false; $('b-go').focus(); }
    }
    if (status === 'requesting') hint('Allow camera and motion access to begin');
    if (status === 'failed') camFailed('failed');
  },
  onException: (e) => {
    diag.errors.push('XR: ' + (typeof e === 'object' ? JSON.stringify(e) : String(e)).slice(0, 200)); flushDiag(true, true);
    if (e && e.type === 'permission') return showError('Motion access is needed', 'Bobo Hoops uses your phone\'s motion sensors to keep the can on your floor. Allow motion and orientation access (on iPhone, tap Allow when asked), then try again.');
    showError('Something went wrong', String((e && e.message) || (typeof e === 'object' ? JSON.stringify(e) : e)));
  },
  listeners: [
    { event: 'reality.imagefound', process: ({ detail }) => onTarget(detail) },
    { event: 'reality.imageupdated', process: ({ detail }) => onTarget(detail) },
    { event: 'reality.imagelost', process: ({ detail }) => onLost(detail) },
    { event: 'reality.trackingstatus', process: ({ detail }) => noteTracking(detail.status, detail.reason) },
  ],
});
function noteTracking(st, why) { if (st !== lastTrack) { lastTrack = st; diag.tracking.push([st + (why && why !== 'UNSPECIFIED' ? ' ' + why : ''), Math.round(performance.now())]); if (diag.tracking.length > 30) diag.tracking.shift(); } }
function start() {
  if (!loaded) return;
  $('b-start').disabled = true; $('b-start').textContent = 'Starting…';
  sound.init();
  sizeCanvas(); addEventListener('resize', sizeCanvas); addEventListener('orientationchange', () => setTimeout(sizeCanvas, 300));
  assets.then((data) => {
    initTargets(data.tdata, data.layout);
    // one engine for both: image targets on, world tracking on
    XR8.XrController.configure({ disableWorldTracking: false, scale: 'responsive', imageTargetData: data.tdata });
    XR8.addCameraPipelineModules([XR8.GlTextureRenderer.pipelineModule(), XR8.Threejs.pipelineModule(), XR8.XrController.pipelineModule(), appModule(data)]);
    postEvent('scan', {});
    setTimeout(() => { if (!camStartAt) camFailed('no video after 15 s'); }, 15000);
    XR8.run({
      canvas,
      allowedDevices: params.has('desktop') ? XR8.XrConfig.device().ANY : XR8.XrConfig.device().MOBILE_AND_HEADSETS,
      cameraConfig: { direction: XR8.XrConfig.camera().BACK }, verbose: params.has('verbose'),
    });
  });
}
$('b-start').onclick = start;
function camFailed(why) {
  if (camStartAt || diag.camFailed) return; diag.camFailed = why; flushDiag(true, true);
  showError('The camera didn\'t start', 'Allow camera and motion access for this site, and close the Camera app or other tabs that use the camera, then tap Try again. A laptop can\'t run this one: open it on your phone.');
}

// ---------------------------------------------------------------- Where is Bobo? events (city level, anonymous)
const SID = 'bh-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
function postEvent(type, props) {
  if (params.has('nolog')) return;
  try { fetch('/api/bobo/events', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, source: 'bobo-hoops', sessionId: SID, props }) }).catch(() => {}); } catch (e) { /* offline */ }
}

// ---------------------------------------------------------------- test log (previews and local dev only, or ?diag)
// Read back with GET /api/ar/kc-diag on a deploy preview (records carry page: 'bobo-hoops').
const diag = { page: 'bobo-hoops', sid: SID, found: 0, lost: 0, fpsN: 0, throws: 0, makes: 0, errors: [], steps: [], tracking: [], note: params.get('note') || '' };
let flushAt = 0;
function flushDiag(force, always = false) {
  const now = performance.now(); if (!force && now - flushAt < 10000) return; flushAt = now;
  if ((!camStartAt && !always) || params.has('nolog') || (LIVE_SITE && !params.has('diag'))) return;
  const body = JSON.stringify({ ...diag, mode, hoopCm: Math.round(hoopH * 100), score: game.score, guide: guideMode, secs: Math.round((now - (camStartAt || now)) / 1000), fps: camStartAt ? +(diag.fpsN / Math.max((now - camStartAt) / 1000, 1)).toFixed(1) : 0, screen: [innerWidth, innerHeight, devicePixelRatio], ua: navigator.userAgent });
  try { if (!(navigator.sendBeacon && navigator.sendBeacon('/api/ar/kc-diag', new Blob([body], { type: 'application/json' })))) fetch('/api/ar/kc-diag', { method: 'POST', body, keepalive: true }); } catch (e) { /* offline */ }
}
addEventListener('pagehide', () => flushDiag(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) flushDiag(true); });
addEventListener('error', (e) => { diag.errors.push(String(e.message).slice(0, 200)); });
// the small status line at the top edge (previews / ?diag only; click-through so it never blocks a button)
function drawDiag(now) {
  diag.drawAt = now; const el = $('diagp'); el.hidden = false;
  const fps = camStartAt ? diag.fpsN / Math.max((now - camStartAt) / 1000, 1) : 0;
  el.textContent = `${mode} · track ${lastTrack || '-'} · target ${pose.state} · fps ${fps.toFixed(0)}\ncan ${Math.round(hoopH * 100)} cm` + (mode === 'play' ? ` · ${game.thrown}/${BALLS} thrown · ${game.score} pts` : '') + (diag.errors.length ? `\nerr: ${diag.errors.slice(-1)[0].slice(0, 60)}` : '');
}

// automated tests (?test)
if (params.has('test')) window.__bh = {
  get mode() { return mode; }, get pose() { return pose.state; }, get game() { return { ...game, balls: balls.length, inside: balls.filter((b) => b.inside).length }; },
  get tracking() { return lastTrack; }, scene: () => scene, get topOff() { return topOff && inner.visible && canMats.every((m) => m.clippingPlanes && m.clippingPlanes.length); }, get endShown() { return !$('end').hidden; },
  balls: () => balls.map((b) => ({ p: b.p.toArray().map((x) => +x.toFixed(3)), inside: b.inside, scored: !!b.scored, done: b.done, rim: b.rim, wall: b.wall, rest: +b.rest.toFixed(2), age: +b.age.toFixed(1) })), diag, TS, hoop, camera: () => camera,
  play: takeOffCharm, place: placeCan,
  // the power that lands exactly at the can's rim (for the shot test)
  powerFor(dOff = 0) { const p = launchPoint(new THREE.Vector3()); const D = Math.hypot(p.x - hoop.pos.x, p.z - hoop.pos.z) + dOff; return (D - RANGE_MIN) / (RANGE_MAX - RANGE_MIN); },
  sideFor() { const p = launchPoint(new THREE.Vector3()); camera.getWorldDirection(_v2); const a = Math.atan2(hoop.pos.x - p.x, hoop.pos.z - p.z), b = Math.atan2(_v2.x, _v2.z); let d = a - b; d = Math.atan2(Math.sin(d), Math.cos(d)); return -d / 0.75; },
  // put the reticle (and so the can) at a point on the floor dx metres right, dz metres ahead of the camera
  floorAt(dx, dz) {   // dz metres ahead along the view, dx to the right
    testFloor = true; reticle.visible = true; camera.getWorldDirection(_v2); _v2.y = 0; _v2.normalize();
    reticle.position.set(camera.position.x + _v2.x * dz - _v2.z * dx, 0.002, camera.position.z + _v2.z * dz + _v2.x * dx);
  },
  shoot: (power, side = 0) => { if (held) held.t = 1; return throwBall(power, side); },
  aimAt: (power, side = 0) => { aim.on = true; aim.power = power; aim.side = side; },
  aimOff: () => { aim.on = false; },
  canScreen: () => { const p = new THREE.Vector3(); canRoot.getWorldPosition(p); const q = p.clone().project(camera); return { world: p.toArray(), screen: [(q.x + 1) / 2 * innerWidth, (1 - q.y) / 2 * innerHeight], scale: canRoot.scale.x }; },
};

// desktop: a QR to open it on the phone
if (!TOUCH) {
  $('desk').hidden = false;
  try { window.QRCode && QRCode.toString(location.href, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }, (err, svg) => { if (!err) $('qr').innerHTML = svg; }); } catch (e) { /* no QR */ }
}
