// Splash: the real EVADE keychain (/evade/keychain/evade-keychain.glb) drops in from the top on a cable
// and dangles like a real keychain. Small physics model, in metres and seconds so it moves at real speed:
//   - the clasp hangs on a stiff, slightly springy cable: it drops in, the cable catches it, it bounces;
//   - the whole set swings about the clasp (in the screen plane and a little toward you) and twists;
//   - each charm swings on its own jump ring, driven by how its ring accelerates (so it jiggles after
//     every bounce and every flick).
// Drag or flick the keychain to swing it; tap it to jiggle it. Stops and frees the GPU when the splash goes.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const splash = document.getElementById('splash');
const canvas = document.getElementById('kc3d');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const G = 9.81;

let renderer, scene, camera, rig, raf = 0, alive = true;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) { canvas.remove(); }

if (renderer) start();

function start() {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;   // keeps the pastel print true (ACES washes it out)
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.03).texture; pm.dispose();
  scene.environmentIntensity = 0.75;
  const key = new THREE.DirectionalLight(0xfff1d6, 1.6); key.position.set(0.3, 1, 0.8); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fd4ff, 1.1); rim.position.set(-0.6, 0.3, -0.6); scene.add(rim);
  camera = new THREE.PerspectiveCamera(24, 1, 0.01, 10);

  new GLTFLoader().load('/evade/keychain/evade-keychain.glb', (g) => { if (alive) build(g.scene); }, undefined, () => canvas.remove());
  addEventListener('resize', layout);
  new MutationObserver(() => { if (splash.hidden || splash.classList.contains('gone')) stop(); }).observe(splash, { attributes: true, attributeFilter: ['class', 'hidden'] });
}

// ---------------------------------------------------------------- the model, regrouped into swinging parts
function build(root) {
  const byName = {}; root.traverse((o) => { if (o.name) byName[o.name] = byName[o.name] || o; });
  root.updateMatrixWorld(true);
  // each charm swings about its top jump ring; the can's chain swings with it
  const pivotAt = (name, parts) => {
    const p = new THREE.Group(); byName[name].getWorldPosition(p.position); root.add(p); p.updateMatrixWorld(true);
    for (const n of parts) if (byName[n]) p.attach(byName[n]);
    return p;
  };
  const pB = pivotAt('Jump_Ring_Bobo', ['Jump_Ring_Bobo', 'Charm_Bobo']);
  const pE = pivotAt('Jump_Ring_Eclipse_Top', ['Jump_Ring_Eclipse_Top', 'Chain_Link_1', 'Chain_Link_2', 'Chain_Link_3', 'Jump_Ring_Eclipse', 'Charm_Eclipse']);
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    // clear acrylic: real transmission is costly on phones and looks the same at this size; a glossy clear slab instead
    if (m && m.transmission) { m.transmission = 0; m.transparent = true; m.opacity = 0.14; m.roughness = 0.05; m.clearcoat = 1; m.depthWrite = false; }
  });

  // cable from the top of the screen down to the clasp
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.00045, 0.00045, 1, 8, 1, true).translate(0, 0.5, 0),
    new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 1, roughness: 0.35 }));
  const anchor = new THREE.Group(), swing = new THREE.Group();
  anchor.add(swing); swing.add(root); scene.add(anchor, cable);

  // centre of mass below the clasp, roughly: the set is ~0.141 m long and the charms carry the weight
  const box = new THREE.Box3().setFromObject(root);
  rig = {
    anchor, swing, cable, pB, pE, size: box.getSize(new THREE.Vector3()), L: 0.075, lB: 0.034, lE: 0.042,
    rest: new THREE.Vector3(), top: new THREE.Vector3(),
    P: new THREE.Vector3(), V: new THREE.Vector3(),          // clasp position and velocity
    phi: 0, dphi: 0, psi: 0, dpsi: 0, tau: 0, dtau: 0,       // swing in the screen plane, toward you, twist
    b: 0, db: 0, e: 0, de: 0, eb: 0, deb: 0,                 // each charm's own swing (and the can's toward you)
    restB: pB.rotation.z, restE: pE.rotation.z,
  };
  layout();
  // drop in from above the screen with a little sideways drift and a twist, so it lands swinging
  // start just above the top edge, so it falls into view and the cable catches it
  const above = rig.visTop - rig.rest.y + rig.size.y + 0.01;
  rig.P.copy(rig.rest).add(new THREE.Vector3(reduce ? 0 : 0.01, reduce ? 0 : above, 0));
  rig.V.set(reduce ? 0 : -0.05, reduce ? 0 : -0.3, 0);
  rig.dtau = reduce ? 0 : 3; rig.phi = reduce ? 0 : 0.1;
  if (reduce) rig.P.copy(rig.rest);
  canvas.classList.add('on');
  bindPointer();
  let last = performance.now();
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min((now - last) / 1000, 1 / 20); last = now;
    if (document.hidden || window.__kc3dPause) return;
    const n = Math.ceil(dt / (1 / 480)); for (let i = 0; i < n; i++) step(dt / n);
    pose(); renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- framing: where the keychain hangs on screen
function layout() {
  if (!rig) { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); return; }
  const w = innerWidth, h = innerHeight, land = w > h;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  // the set fills about 44% of the screen height in portrait, a bit more on a wide screen
  // portrait: fill the space between the EVADE logo and the title plate (the desktop QR card makes it shorter)
  const logo = document.querySelector('#splash .brand img'), lr = logo && logo.getBoundingClientRect();
  const plate = document.getElementById('title'), pr = plate && plate.getBoundingClientRect();
  const room = lr && pr && pr.top > lr.bottom ? (pr.top - lr.bottom - 24) / h : 0.5;
  const frac = land ? 0.7 : THREE.MathUtils.clamp(Math.min(room, (w / h) * 1.05), 0.22, 0.52);
  const visH = rig.size.y / frac, dist = visH / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.set(0, 0, dist); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
  const visW = visH * camera.aspect;
  // clasp top: just under the EVADE logo in portrait; on a wide screen, the left part, under the top edge
  const topPx = land ? h * 0.12 : (lr && lr.height ? lr.bottom + 6 : h * 0.1);
  const xPx = land ? Math.min(w * 0.3, w / 2 - 230) : w / 2;
  rig.rest.set((xPx / w - 0.5) * visW, (0.5 - topPx / h) * visH, 0); rig.visTop = visH / 2;
  // the cable comes from behind the EVADE logo in portrait (it looks hooked on it), from the top edge otherwise
  rig.top.set(rig.rest.x, land ? visH / 2 + 0.01 : (0.5 - (lr && lr.height ? (lr.top + lr.bottom) / 2 : 0) / h) * visH, -0.004);
  if (!raf) rig.P.copy(rig.rest);
}

// ---------------------------------------------------------------- physics
const _a = new THREE.Vector3(), _w = new THREE.Vector3();
function step(dt) {
  const r = rig;
  // the cable: stiff spring with a little stretch, a hair of side pull back to the hook, and air drag
  const k = 5000, c = 95;   // a near-rigid cable: a sharp jolt and a small rebound, not a bungee
  _a.subVectors(r.rest, r.P).multiplyScalar(k).addScaledVector(r.V, -c);
  if (r.P.y > r.rest.y + 0.002) { _a.set((r.rest.x - r.P.x) * 6, -G, 0).addScaledVector(r.V, -0.4); }   // slack cable: falling
  r.V.addScaledVector(_a, dt); r.P.addScaledVector(r.V, dt);
  const ax = _a.x, ay = _a.y;
  // the set swings about the clasp: driven by the clasp's sideways acceleration, gravity felt as g + ay
  const g = Math.max(G + ay, 0.5);
  r.dphi += (-(g / r.L) * Math.sin(r.phi) - (ax / r.L) * Math.cos(r.phi) - 2.4 * r.dphi) * dt; r.phi += r.dphi * dt;
  r.dpsi += (-(g / r.L) * Math.sin(r.psi) - 2 * r.dpsi) * dt; r.psi += r.dpsi * dt;
  r.dtau += (-14 * r.tau - 0.8 * r.dtau) * dt; r.tau += r.dtau * dt;            // the swivel lets it twist and untwist
  // each charm: a pendulum on its own ring, driven by that ring's acceleration (taken from its motion)
  pose(true);
  const accOf = (pivot, key) => {   // the ring's acceleration from its last positions, lightly smoothed
    pivot.parent.localToWorld(_w.copy(pivot.position));
    const st = r[key] || (r[key] = { p: _w.clone(), v: null, ax: 0, ay: 0 });
    const vx = (_w.x - st.p.x) / dt, vy = (_w.y - st.p.y) / dt; st.p.copy(_w);
    if (st.v) { st.ax += (((vx - st.v[0]) / dt) - st.ax) * 0.35; st.ay += (((vy - st.v[1]) / dt) - st.ay) * 0.35; }
    st.v = [vx, vy];
    return [THREE.MathUtils.clamp(st.ax, -300, 300), THREE.MathUtils.clamp(st.ay, -300, 300)];
  };
  const [bx, by] = accOf(r.pB, 'sB').map((v) => v * 0.6), [ex, ey] = accOf(r.pE, 'sE').map((v) => v * 0.6);
  // the charm angle is measured in world terms: its parent already turns with the set (phi), so take that off
  const swingB = (gg, l, th, dth, axx) => (-(gg / l) * Math.sin(th + r.phi) - (axx / l) * Math.cos(th + r.phi) - 4.2 * dth);
  r.db += swingB(Math.max(G + by, 0.5), r.lB, r.b, r.db, bx) * dt; r.b += r.db * dt;
  r.de += swingB(Math.max(G + ey, 0.5), r.lE, r.e, r.de, ex) * dt; r.e += r.de * dt;
  r.deb += (-(G / r.lE) * Math.sin(r.eb) - 1.6 * r.deb - r.dpsi * 6) * dt; r.eb += r.deb * dt;
  r.b = THREE.MathUtils.clamp(r.b, -1.2, 1.2); r.e = THREE.MathUtils.clamp(r.e, -1.2, 1.2);
}
function pose(quick) {
  const r = rig;
  r.anchor.position.copy(r.P);
  r.swing.rotation.set(r.psi, r.tau, r.phi, 'YXZ');
  // charms keep the small resting angle they have on the real keychain (they push against each other)
  r.pB.rotation.z = r.b - 0.2; r.pE.rotation.z = r.e + 0.2;   // the two charms rest pushed apart, as on the real keychain r.pE.rotation.x = r.eb;
  r.anchor.updateMatrixWorld(true);
  if (quick) return;
  // cable: from the hook down to the clasp top
  const d = _w.subVectors(r.top, r.P), len = d.length();
  r.cable.position.copy(r.P); r.cable.scale.set(1, len, 1);
  r.cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
}

// ---------------------------------------------------------------- drag to swing, tap to jiggle
function bindPointer() {
  let down = null;
  const toWorldX = (px) => px / innerWidth * (2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * camera.aspect;
  const near = (e) => {   // only grabs near the keychain, so taps on the buttons and the rest of the splash are untouched
    const p = rig.P.clone().project(camera), sx = (p.x + 1) / 2 * innerWidth, sy = (1 - p.y) / 2 * innerHeight;
    const hPx = rig.size.y / (2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * innerHeight;
    return Math.abs(e.clientX - sx) < hPx * 0.55 && e.clientY > sy - 20 && e.clientY < sy + hPx * 1.05;
  };
  splash.addEventListener('pointerdown', (e) => {
    if (!rig || e.target.closest('button,a,#desk')) return;
    if (!near(e)) return;
    down = { x: e.clientX, y: e.clientY, t: e.timeStamp, lx: e.clientX, lt: e.timeStamp, vx: 0 };
  });
  splash.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dtt = Math.max((e.timeStamp - down.lt) / 1000, 0.008);
    down.vx = (e.clientX - down.lx) / dtt; down.lx = e.clientX; down.lt = e.timeStamp;
    rig.V.x += toWorldX(e.clientX - down.x) * 0.9; down.x = e.clientX;   // drag the clasp along
    rig.dtau += (e.clientX - down.lx) * 0.002;
  });
  const up = (e) => {
    if (!down) return;
    const moved = Math.abs(e.clientX - down.lx) + Math.abs(e.clientY - down.y);
    if (e.timeStamp - down.t < 250 && moved < 10) { rig.V.y += 0.35; rig.dtau += (Math.random() < 0.5 ? -1 : 1) * 3; rig.db += 4; rig.de -= 4; }   // tap: a jiggle
    else rig.dphi += THREE.MathUtils.clamp(down.vx * 0.004, -6, 6);
    down = null;
  };
  splash.addEventListener('pointerup', up); splash.addEventListener('pointercancel', () => { down = null; });
}

function stop() {
  if (!alive) return; alive = false;
  cancelAnimationFrame(raf); removeEventListener('resize', layout);
  setTimeout(() => {   // after the splash fades
    scene && scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); const m = o.material; if (m) [].concat(m).forEach((mm) => { for (const k in mm) if (mm[k] && mm[k].isTexture) mm[k].dispose(); mm.dispose(); }); });
    scene && scene.environment && scene.environment.dispose();
    renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss(); canvas.remove();
  }, 700);
}
window.__kc3d = { get rig() { return rig; }, get info() { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, cam: camera.position.toArray(), size: [canvas.width, canvas.height], vis: scene.children.map((c) => c.type + ':' + c.visible) }; }, step: (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) { const m = 8; for (let j = 0; j < m; j++) step(dt / m); } pose(); renderer.render(scene, camera); } };
