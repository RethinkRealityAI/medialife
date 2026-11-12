// The EVADE keychain, dangling: the real model (evade-keychain.glb) hangs on a cable and moves like a real
// keychain. Shared by the Bobo Off the Chain splash (/evade/keychain-ar/) and the EVADE hero.
//
//   import { dangleKeychain } from '/evade/keychain/dangle.js';
//   const kc = dangleKeychain({
//     canvas,                      // a <canvas> sized by CSS; the scene fills it (transparent background)
//     hitArea: someElement,        // where touches are listened for (default: the canvas's parent)
//     frame: (w, h) => ({          // where it hangs, in CSS px inside the canvas, recomputed on resize
//       clasp: { x, y },           //   top of the clasp at rest
//       height,                    //   on-screen height of the whole set (clasp to the bottom of the charms)
//       hook: { x, y },            //   where the cable starts (e.g. behind a logo, or above the top edge)
//     }),
//   });
//   kc.nudge(1)  // swing it as if flicked (+1 right, -1 left); kc.dispose() frees the GPU
//
// Physics, in metres and seconds so it moves at real speed (no library):
//   - the clasp hangs on a near-rigid cable: it drops in from above, the cable catches it with a jolt;
//   - the whole set swings about the clasp (side to side and a little toward you) and twists on the swivel;
//   - each charm swings on its own jump ring, driven by how that ring accelerates, so it jiggles after
//     every jolt, swing and touch;
//   - when it lands it is flicked sideways, as if someone just touched it, and every few seconds of calm it
//     gets a small nudge, so it always looks touchable. Drag it to swing it, tap it to jiggle it.
// prefers-reduced-motion: it just hangs, still (touch still swings it).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const G = 9.81;
const _a = new THREE.Vector3(), _w = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

export function dangleKeychain({ canvas, hitArea = canvas.parentElement, frame, glb = '/evade/keychain/evade-keychain.glb', reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches, sway = !reduceMotion, onReady } = {}) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); } catch (e) { return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;   // keeps the pastel print true (ACES washes it out)
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.03).texture; pm.dispose();
  scene.environmentIntensity = 0.75;
  const key = new THREE.DirectionalLight(0xfff1d6, 1.6); key.position.set(0.3, 1, 0.8); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fd4ff, 1.1); rim.position.set(-0.6, 0.3, -0.6); scene.add(rim);
  const camera = new THREE.PerspectiveCamera(24, 1, 0.01, 10);

  let r = null, raf = 0, alive = true, visible = true, last = 0, calm = 0, nextSway = 2 + Math.random() * 1.5;
  const api = { get rig() { return r; }, nudge, dispose, step: (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) for (let j = 0; j < 8; j++) step(dt / 8); render(); } };

  new GLTFLoader().load(glb, (g) => { if (alive) build(g.scene); }, undefined, () => { canvas.style.display = 'none'; });
  const ro = new ResizeObserver(() => layout()); ro.observe(canvas);
  const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; }); io.observe(canvas);

  // ---------------------------------------------------------------- the model, regrouped into swinging parts
  function build(root) {
    const byName = {}; root.traverse((o) => { if (o.name) byName[o.name] = byName[o.name] || o; });
    root.updateMatrixWorld(true);
    const pivotAt = (name, parts) => {   // each charm swings about its top jump ring; the can's chain swings with it
      const p = new THREE.Group(); byName[name].getWorldPosition(p.position); root.add(p); p.updateMatrixWorld(true);
      for (const n of parts) if (byName[n]) p.attach(byName[n]);
      return p;
    };
    const pB = pivotAt('Jump_Ring_Bobo', ['Jump_Ring_Bobo', 'Charm_Bobo']);
    const pE = pivotAt('Jump_Ring_Eclipse_Top', ['Jump_Ring_Eclipse_Top', 'Chain_Link_1', 'Chain_Link_2', 'Chain_Link_3', 'Jump_Ring_Eclipse', 'Charm_Eclipse']);
    root.traverse((o) => {
      const m = o.isMesh && o.material;
      // clear acrylic: real transmission is costly on phones and looks the same at this size; a glossy clear slab instead
      if (m && m.transmission) { m.transmission = 0; m.transparent = true; m.opacity = 0.14; m.roughness = 0.05; m.clearcoat = 1; m.depthWrite = false; }
    });
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.00045, 0.00045, 1, 8, 1, true).translate(0, 0.5, 0),
      new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 1, roughness: 0.35 }));
    const anchor = new THREE.Group(), swingG = new THREE.Group();
    anchor.add(swingG); swingG.add(root); scene.add(anchor, cable);
    const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
    r = {
      anchor, swing: swingG, cable, pB, pE, size, L: 0.075, lB: 0.034, lE: 0.042,
      rest: new THREE.Vector3(), top: new THREE.Vector3(), visTop: 0, scale: 1,
      P: new THREE.Vector3(), V: new THREE.Vector3(), taut: false,  // clasp position and velocity; cable taut yet?
      phi: 0, dphi: 0, psi: 0, dpsi: 0, tau: 0, dtau: 0,           // swing side to side, toward you, twist
      b: 0, db: 0, e: 0, de: 0, eb: 0, deb: 0,                     // each charm's own swing (and the can's toward you)
    };
    layout();
    // start just above the top edge, so it falls into view and the cable catches it
    if (reduceMotion) { r.P.copy(r.rest); r.taut = true; }
    else { r.P.copy(r.rest).add(new THREE.Vector3(0.01, r.visTop - r.rest.y + size.y + 0.01, 0)); r.V.set(-0.05, -0.3, 0); r.dtau = 3; r.phi = 0.1; }
    canvas.classList.add('on');
    bindPointer();
    last = performance.now();
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 1 / 20); last = now;
      if (document.hidden || !visible || window.__kc3dPause) return;
      const n = Math.ceil(dt / (1 / 480)); for (let i = 0; i < n; i++) step(dt / n);
      render();
    };
    raf = requestAnimationFrame(loop);
    onReady && onReady(api);
  }

  // ---------------------------------------------------------------- framing
  function layout() {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    if (!r) { camera.updateProjectionMatrix(); return; }
    const f = frame(w, h), visH = r.size.y / Math.max(f.height / h, 0.05);
    camera.position.set(0, 0, visH / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
    const visW = visH * camera.aspect, toX = (px) => (px / w - 0.5) * visW, toY = (py) => (0.5 - py / h) * visH;
    r.rest.set(toX(f.clasp.x), toY(f.clasp.y), 0); r.visTop = visH / 2; r.pxPerM = h / visH;
    r.top.set(toX(f.hook ? f.hook.x : f.clasp.x), f.hook ? toY(f.hook.y) : visH / 2 + 0.01, -0.004);
    if (!raf) r.P.copy(r.rest);
  }

  // ---------------------------------------------------------------- physics
  function step(dt) {
    // the cable: near-rigid (a sharp jolt and a small rebound, not a bungee); slack while it is still falling
    _a.subVectors(r.rest, r.P).multiplyScalar(5000).addScaledVector(r.V, -95);
    const slack = r.P.y > r.rest.y + 0.002;
    if (slack) _a.set((r.rest.x - r.P.x) * 6, -G, 0).addScaledVector(r.V, -0.4);
    else if (!r.taut) { r.taut = true; if (!reduceMotion) nudge(Math.sign(r.dphi) || 1, 1.25); }   // caught: it swings off as if flicked
    r.V.addScaledVector(_a, dt); r.P.addScaledVector(r.V, dt);
    // the set swings about the clasp: driven by the clasp's sideways acceleration, gravity felt as g + ay
    const g = Math.max(G + _a.y, 0.5), ax = _a.x;
    r.dphi += (-(g / r.L) * Math.sin(r.phi) - (ax / r.L) * Math.cos(r.phi) - 0.55 * r.dphi) * dt; r.phi += r.dphi * dt;
    r.dpsi += (-(g / r.L) * Math.sin(r.psi) - 1.2 * r.dpsi) * dt; r.psi += r.dpsi * dt;
    r.dtau += (-14 * r.tau - 0.4 * r.dtau) * dt; r.tau += r.dtau * dt;            // the swivel lets it twist and untwist
    // each charm: a pendulum on its own ring, driven by that ring's acceleration (taken from its motion)
    pose();
    const [bx, by] = accOf(r.pB, 'sB', dt), [ex, ey] = accOf(r.pE, 'sE', dt);
    const charm = (gg, l, th, dth, axx) => (-(gg / l) * Math.sin(th + r.phi) - (axx / l) * Math.cos(th + r.phi) - 2.2 * dth);   // world angle = own + the set's
    r.db += charm(Math.max(G + by, 0.5), r.lB, r.b, r.db, bx) * dt; r.b += r.db * dt;
    r.de += charm(Math.max(G + ey, 0.5), r.lE, r.e, r.de, ex) * dt; r.e += r.de * dt;
    r.deb += (-(G / r.lE) * Math.sin(r.eb) - 1.6 * r.deb - r.dpsi * 6) * dt; r.eb += r.deb * dt;
    r.b = THREE.MathUtils.clamp(r.b, -1.2, 1.2); r.e = THREE.MathUtils.clamp(r.e, -1.2, 1.2);
    // calm for a few seconds: a small nudge, like a breath of air (says "touch me")
    if (sway && r.taut) {
      calm = Math.abs(r.dphi) < 0.5 && Math.abs(r.phi) < 0.06 ? calm + dt : 0;
      if (calm > nextSway) { calm = 0; nextSway = 3.5 + Math.random() * 3; nudge(Math.random() < 0.5 ? -1 : 1, 0.55 + Math.random() * 0.35); }
    }
  }
  function accOf(pivot, key, dt) {   // a ring's acceleration from its last positions, lightly smoothed
    pivot.parent.localToWorld(_w.copy(pivot.position));
    const st = r[key] || (r[key] = { p: _w.clone(), v: null, ax: 0, ay: 0 });
    const vx = (_w.x - st.p.x) / dt, vy = (_w.y - st.p.y) / dt; st.p.copy(_w);
    if (st.v) { st.ax += (((vx - st.v[0]) / dt) - st.ax) * 0.35; st.ay += (((vy - st.v[1]) / dt) - st.ay) * 0.35; }
    st.v = [vx, vy];
    return [THREE.MathUtils.clamp(st.ax, -300, 300) * 0.75, THREE.MathUtils.clamp(st.ay, -300, 300) * 0.75];
  }
  function pose() {
    r.anchor.position.copy(r.P);
    r.swing.rotation.set(r.psi, r.tau, r.phi, 'YXZ');
    r.pB.rotation.z = r.b - 0.2; r.pE.rotation.z = r.e + 0.2; r.pE.rotation.x = r.eb;   // the charms rest pushed a little apart, as on the real keychain
    r.anchor.updateMatrixWorld(true);
  }
  function render() {
    pose();
    const d = _w.subVectors(r.top, r.P), len = d.length();   // the cable, from the hook down to the clasp
    r.cable.position.copy(r.P); r.cable.scale.set(1, len, 1); r.cable.quaternion.setFromUnitVectors(_up, d.normalize());
    renderer.render(scene, camera);
  }
  // swing it as if flicked: dir -1 left / +1 right, strength ~1 for a clear swing
  function nudge(dir = 1, strength = 1) {
    if (!r) return;
    r.dphi += dir * 3.4 * strength; r.dtau += -dir * 1.4 * strength; r.db += dir * 2.5 * strength; r.de -= dir * 1.5 * strength;
  }

  // ---------------------------------------------------------------- touch: drag to swing, tap to jiggle
  function bindPointer() {
    let down = null;
    const local = (e) => { const b = canvas.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    const near = (x, y) => {   // only grabs on the keychain, so taps on buttons and the rest of the page are untouched
      const w = canvas.clientWidth, h = canvas.clientHeight, p = _w.copy(r.P).project(camera);
      const sx = (p.x + 1) / 2 * w, sy = (1 - p.y) / 2 * h, hPx = r.size.y * r.pxPerM;
      return Math.abs(x - sx) < hPx * 0.6 && y > sy - 24 && y < sy + hPx * 1.05;
    };
    hitArea.addEventListener('pointerdown', (e) => {
      if (!r || e.target.closest('button,a,input,select,label,#desk')) return;
      const [x, y] = local(e); if (!near(x, y)) return;
      down = { x, y, t: e.timeStamp, lx: x, lt: e.timeStamp, vx: 0, moved: 0 };
      calm = 0;
    });
    hitArea.addEventListener('pointermove', (e) => {
      if (!down) return;
      const [x] = local(e), dtt = Math.max((e.timeStamp - down.lt) / 1000, 0.008), dx = x - down.lx;
      down.vx = dx / dtt; down.lx = x; down.lt = e.timeStamp; down.moved += Math.abs(dx);
      r.V.x += (dx / r.pxPerM) / dtt * 0.35;   // the clasp follows the finger a little; the swing does the rest
      r.dtau += dx * 0.004;
    });
    const up = (e) => {
      if (!down) return;
      if (e.timeStamp - down.t < 300 && down.moved < 10) { r.V.y += 0.3; r.dtau += (Math.random() < 0.5 ? -1 : 1) * 3; r.db += 5; r.de -= 5; r.dphi += (Math.random() - 0.5) * 2; }   // tap: a jiggle
      else r.dphi += THREE.MathUtils.clamp(down.vx * 0.005, -7, 7);
      down = null; calm = 0;
    };
    hitArea.addEventListener('pointerup', up); hitArea.addEventListener('pointercancel', () => { down = null; });
  }

  function dispose() {
    if (!alive) return; alive = false;
    cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
    scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); const m = o.material; if (m) [].concat(m).forEach((mm) => { for (const k in mm) if (mm[k] && mm[k].isTexture) mm[k].dispose(); mm.dispose(); }); });
    scene.environment && scene.environment.dispose();
    renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss();
  }
  return api;
}
