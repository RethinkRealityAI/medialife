// Monkey Quest, Activated: the 3D on the proposal page.
//   1. Hero: the real 3D Monkey Quest logo with the enamel pin orbiting it (the same models as the Monkey Quest Hub).
//   2. "1 Pin, 2 Experiences": the pin hangs on a keychain (drag it to swing). The two buttons run the Hub's two
//      modes in the browser:
//        - Spray the Pin: the pin pops off the keychain, the 3D logo appears by its head, and the visitor sprays
//          it with the Hub's own GPU painter (/monkey-quest/hub/paint.js): paint lands where the spray hits.
//        - Launch It: the pin flies off and lands big on the floor with the logo beside it. Tap the monkey to
//          make it hop, tap the logo to spin it. The paint stays on (same painter, same pin).
// Only real assets: models/pin.glb and models/logo.glb from the Hub (built in Blender from the supplied pin).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createPainter } from "/monkey-quest/hub/paint.js?v=1";

const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;
const PIN_H = 0.0507, LOGO_W = 0.108;            // model sizes in metres (see the Hub's main.js)
const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
const lerp = (a, b, k) => a + (b - a) * k;
const easeInOut = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const backOut = (x) => { x = clamp01(x); const c = 1.6; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

const loader = new GLTFLoader();
const models = Promise.all([loader.loadAsync("/monkey-quest/hub/models/pin.glb"), loader.loadAsync("/monkey-quest/hub/models/logo.glb")]);

function makeRenderer(canvas) {
  let r;
  try { r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" }); } catch (e) { return null; }
  r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.NeutralToneMapping;
  return r;
}
function envAndLights(r, scene, intensity = 0.9) {
  const pm = new THREE.PMREMGenerator(r);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  pm.dispose();
  scene.environmentIntensity = intensity;
  const sun = new THREE.DirectionalLight(0xffffff, 1.7); sun.position.set(1, 2, 3);
  const rim = new THREE.DirectionalLight(0xffc21f, 0.9); rim.position.set(-3, 1, -2);
  scene.add(sun, rim, new THREE.HemisphereLight(0xffffff, 0x223366, 0.8));
}
function onScreen(el, cb) {
  const io = new IntersectionObserver((es) => cb(es[0].isIntersecting), { rootMargin: "120px" });
  io.observe(el);
}

/* ═════════════════════════════════════════════════════════════ 1. HERO */
(async function hero() {
  const cv = document.getElementById("hero3d");
  if (!cv) return;
  const [pin, logo] = await models.catch(() => []);
  if (!pin) return;
  const r = makeRenderer(cv);
  if (!r) return;
  const sc = new THREE.Scene();
  envAndLights(r, sc);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 20);
  const L = logo.scene.clone(true), P = pin.scene.clone(true);
  L.scale.setScalar(1 / LOGO_W);
  P.scale.setScalar(0.5 / PIN_H);
  const lg = new THREE.Group(), pg = new THREE.Group();
  lg.add(L); pg.add(P); sc.add(lg, pg);
  let portrait = false;
  const fit = () => {
    const w = cv.clientWidth || 300, h = cv.clientHeight || 300;
    r.setSize(w, h, false); cam.aspect = w / h; portrait = w < h * 0.9;
    const needW = portrait ? 1.3 : 2.0, needH = 1.05;
    const t = 2 * Math.tan(THREE.MathUtils.degToRad(15));
    cam.position.set(0, 0, Math.max(needW / (t * cam.aspect), needH / t)); cam.updateProjectionMatrix();
  };
  fit();
  new ResizeObserver(fit).observe(cv);
  let mx = 0, my = 0, visible = true;
  addEventListener("pointermove", (e) => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; }, { passive: true });
  onScreen(cv, (v) => (visible = v));
  const t0 = performance.now();
  (function loop() {
    requestAnimationFrame(loop);
    if (!visible) return;
    const t = (performance.now() - t0) / 1000;
    const s = REDUCE ? 0.25 : 1;
    lg.rotation.y = Math.sin(t * 0.6) * 0.22 * s + mx * 0.5;
    lg.rotation.x = Math.sin(t * 0.45) * 0.05 + my * 0.2;
    lg.position.y = Math.sin(t * 1.2) * 0.02;
    // the pin orbits the logo: in front on the right, behind on the left
    const a = REDUCE ? 0.6 : t * 0.55 + 0.6;
    const R = portrait ? 0.3 : 0.82;
    pg.scale.setScalar(portrait ? 0.8 : 1);
    pg.position.set(Math.cos(a) * R, -0.12 + Math.sin(a * 2) * 0.06, 0.12 + Math.sin(a) * 0.32);
    pg.rotation.set(Math.sin(t * 1.1) * 0.08, Math.sin(t * 0.9) * 0.55 - Math.cos(a) * 0.3, Math.sin(t * 0.7) * 0.12);
    r.render(sc, cam);
  })();
  requestAnimationFrame(() => { cv.classList.add("on"); document.getElementById("heroFlat")?.classList.add("off"); });
})();

/* ═══════════════════════════════════════════════ 2. 1 PIN, 2 EXPERIENCES */
(async function keychain() {
  const stage = document.getElementById("kcStage");
  const cv = document.getElementById("kc3d");
  if (!stage || !cv) return;
  const [pinG, logoG0] = await models.catch(() => []);
  if (!pinG) return;
  const r = makeRenderer(cv);
  if (!r) return;
  r.autoClear = false;
  const scene = new THREE.Scene();
  envAndLights(r, scene, 0.95);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 60);
  const tag = document.getElementById("kcTag"), hintEl = document.getElementById("kcHint");
  const resetBtn = document.getElementById("kcReset"), capsEl = document.getElementById("caps");
  const modeBtns = [...document.querySelectorAll(".kc-mode")];
  const hint = (t) => { if (hintEl.textContent !== t) hintEl.textContent = t; hintEl.style.opacity = t ? 1 : 0; };

  // ---------------------------------------------------------------- the keychain: clasp, chain, split ring
  const metal = new THREE.MeshStandardMaterial({ color: 0xdfe3ea, metalness: 1, roughness: 0.22 });
  const PIVOT = new THREE.Vector3(0, 1.5, 0);
  const swing = new THREE.Group(); swing.position.copy(PIVOT); scene.add(swing);
  const clasp = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 14, 36), metal);
  clasp.scale.set(0.8, 1.25, 1); scene.add(clasp); clasp.position.copy(PIVOT).add(new THREE.Vector3(0, 0.07, 0));
  const linkGeo = new THREE.TorusGeometry(0.04, 0.012, 10, 24);
  for (let i = 0; i < 6; i++) {
    const l = new THREE.Mesh(linkGeo, metal);
    l.scale.set(1, 1.5, 1); l.position.y = -0.03 - i * 0.075; l.rotation.y = i % 2 ? Math.PI / 2 : 0;
    swing.add(l);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.016, 12, 48), metal);
  ring.position.y = -0.6; ring.rotation.y = 1.1; swing.add(ring);
  const anchor = new THREE.Object3D(); anchor.position.set(0.06, -1.0, 0); swing.add(anchor);   // where the pin hangs

  // ---------------------------------------------------------------- the pin (paintable) and the logo
  const pinModel = pinG.scene;
  const pinMeshes = [];
  pinModel.scale.setScalar(1 / PIN_H);                       // 1 unit tall
  pinModel.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.geometry.setAttribute("paintUv", o.geometry.attributes.uv); pinMeshes.push(o); } });
  const pinRoot = new THREE.Group(); pinRoot.add(pinModel); pinRoot.matrixAutoUpdate = false;
  const painter = createPainter(r, { res: 1024, undoDepth: 10 });
  scene.add(painter.world);
  const paintP = painter.makePaintable(pinRoot, pinMeshes);
  painter.warm(paintP, camera);
  const proxy = new THREE.Object3D(); scene.add(proxy);     // the pin's pose; pinRoot copies it every frame
  const logo = new THREE.Group(); logo.add(logoG0.scene); logoG0.scene.scale.setScalar(1 / LOGO_W); logo.visible = false; scene.add(logo);
  const logoMeshes = []; logo.traverse((o) => o.isMesh && logoMeshes.push(o));

  // ---------------------------------------------------------------- the floor (Launch It)
  const FLOOR_Y = -1.15;
  const floor = new THREE.Group(); floor.position.y = FLOOR_Y; floor.visible = false; scene.add(floor);
  const flat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(3.2, 64), flat(0x13224a, 0.9)); disc.rotation.x = -Math.PI / 2; floor.add(disc);
  for (const [rad, o] of [[1.2, 0.35], [2.1, 0.22], [3.0, 0.14]]) {
    const ringM = new THREE.Mesh(new THREE.RingGeometry(rad - 0.012, rad + 0.012, 96), flat(0xffc21f, o)); ringM.rotation.x = -Math.PI / 2; ringM.position.y = 0.002; floor.add(ringM);
  }
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 40), flat(0x000000, 0.35)); shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.004; floor.add(shadow);
  const land = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64), flat(0xffc21f, 0)); land.rotation.x = -Math.PI / 2; land.position.y = 0.006; floor.add(land);

  // ---------------------------------------------------------------- flat star bursts + spray mist
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2, rr = i % 2 ? 0.045 : 0.11; i ? starShape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : starShape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  const starGeo = new THREE.ShapeGeometry(starShape), dotGeo = new THREE.CircleGeometry(0.018, 10);
  const fx = [];
  function burst(at, n = 12) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(starGeo, flat(i % 3 ? 0xffc21f : 0xffffff, 1));
      m.position.copy(at); const a = Math.random() * Math.PI * 2;
      fx.push({ m, v: new THREE.Vector3(Math.cos(a) * 1.6, 1.2 + Math.random() * 1.6, Math.sin(a) * 0.8), life: 0.9, spin: (Math.random() - 0.5) * 8 });
      scene.add(m);
    }
  }
  function mist(at, color) {
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(dotGeo, flat(color, 0.9)); m.position.copy(at);
      fx.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.9, 0.4 + Math.random() * 0.5), life: 0.35, spin: 0, mist: true });
      scene.add(m);
    }
  }
  function tickFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; f.life -= dt;
      if (f.life <= 0) { scene.remove(f.m); f.m.material.dispose(); fx.splice(i, 1); continue; }
      if (!f.mist) f.v.y -= 3.2 * dt;
      f.m.position.addScaledVector(f.v, dt); f.m.rotation.z += f.spin * dt; f.m.quaternion.copy(camera.quaternion);
      f.m.material.opacity = Math.min(1, f.life * 3);
    }
  }

  // ---------------------------------------------------------------- swing physics (pendulum about the clasp)
  const sw = { th: 0.5, w: 0, ps: 0, pw: 0, tw: 0.4, tww: 0, calm: 0 };
  function stepSwing(dt) {
    const g = 15;
    sw.w += (-g * Math.sin(sw.th) - 0.55 * sw.w) * dt; sw.th += sw.w * dt;
    sw.pw += (-g * Math.sin(sw.ps) - 0.9 * sw.pw) * dt; sw.ps += sw.pw * dt;
    sw.tww += (-5 * sw.tw - 0.8 * sw.tww) * dt; sw.tw += sw.tww * dt;
    sw.calm += dt;
    if (sw.calm > (REDUCE ? 6 : 3.5) && mode === "hang" && !drag.on) { sw.calm = 0; const k = REDUCE ? 0.4 : 1; sw.w += (Math.random() < 0.5 ? -1 : 1) * 0.9 * k; sw.tww += (Math.random() - 0.5) * 3 * k; }
    swing.rotation.set(sw.ps, 0, sw.th);
  }

  // ---------------------------------------------------------------- poses and transitions
  let mode = "hang";
  const pose = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1 };
  const from = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1 };
  const trans = { t: 1, dur: 1, arc: 0, spin: 0 };
  const logoAnim = { t: 0, on: false };
  const hop = { t: 1 }, logoSpin = { t: 1 };
  const camNow = { p: new THREE.Vector3(), look: new THREE.Vector3() }, camFrom = { p: new THREE.Vector3(), look: new THREE.Vector3() };
  let narrow = false;
  const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

  function camTarget(m) {
    const t = 2 * Math.tan(THREE.MathUtils.degToRad(15));
    if (m === "launch") {
      const d = Math.max(4.6 / (t * camera.aspect), 3.2 / t) * 0.92;
      return { p: new THREE.Vector3(0, FLOOR_Y + d * 0.42, d), look: new THREE.Vector3(0, FLOOR_Y + 0.75, 0) };
    }
    const needW = m === "spray" ? (narrow ? 2.7 : 3.5) : 1.5, needH = m === "spray" ? 2.4 : 3.3;
    const d = Math.max(needW / (t * camera.aspect), needH / t);
    const y = m === "spray" ? 0.1 : 0.25;
    return { p: new THREE.Vector3(0, y, d), look: new THREE.Vector3(0, y, 0) };
  }
  function targetPose(m) {
    if (m === "spray") return { p: new THREE.Vector3(narrow ? 0.2 : 0.4, -0.05, 0.25), q: new THREE.Quaternion().setFromEuler(_e.set(0, -0.15, 0)), s: 1.55 };
    if (m === "launch") return { p: new THREE.Vector3(0.45, FLOOR_Y + 1.0, 0.1), q: new THREE.Quaternion().setFromEuler(_e.set(0, -0.35, 0)), s: 2.0 };
    anchor.updateWorldMatrix(true, false); anchor.matrixWorld.decompose(_v, _q, _s);
    return { p: _v.clone(), q: _q.clone().multiply(new THREE.Quaternion().setFromEuler(_e.set(0, sw.tw, 0))), s: 1 };
  }
  function logoPose(m) {
    if (m === "launch") return { p: new THREE.Vector3(-1.35, FLOOR_Y + 0.5, -0.3), ry: 0.4, s: 1.8 };
    return { p: new THREE.Vector3(narrow ? -0.62 : -0.95, 0.62, 0.35), ry: 0.3, s: narrow ? 0.95 : 1.15 };
  }

  function setMode(m) {
    if (m === mode && m !== "hang") return;
    const prev = mode; mode = m;
    stage.dataset.mode = m;
    from.p.copy(pose.p); from.q.copy(pose.q); from.s = pose.s;
    camFrom.p.copy(camNow.p); camFrom.look.copy(camNow.look);
    trans.t = 0;
    trans.dur = m === "launch" ? 1.5 : m === "spray" ? 1.0 : 1.1;
    trans.arc = m === "launch" ? 1.3 : m === "spray" ? 0.25 : 0.3;
    trans.spin = m === "launch" ? Math.PI * 2 : 0;
    floor.visible = m === "launch";
    if (m === "hang") { logoAnim.on = false; sw.w += 1.2; }
    else { logoAnim.on = true; if (prev === "hang") logoAnim.t = 0; }
    if (m === "launch") { land.material.opacity = 0; }
    tag.textContent = m === "spray" ? "SPRAY" : m === "launch" ? "LAUNCH" : "THE PIN";
    resetBtn.hidden = m === "hang";
    capsEl.hidden = m !== "spray";
    modeBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === m)));
    hint(m === "spray" ? "Hold on the pin to spray" : m === "launch" ? "Tap the monkey or the logo" : "Drag the keychain. Then pick an experience.");
    sprayEnd();
  }
  modeBtns.forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  resetBtn.addEventListener("click", () => setMode("hang"));

  // ---------------------------------------------------------------- colours
  const CAPS = [["Red", "#e3283a"], ["Gold", "#ffc21f"], ["Blue", "#2f80e0"], ["Purple", "#7b4ce0"], ["Green", "#2ec866"], ["Pink", "#ff6fb0"], ["White", "#ffffff"]];
  let paintCol = new THREE.Color(CAPS[2][1]), paintHex = CAPS[2][1];
  CAPS.forEach(([name, hex], i) => {
    const b = document.createElement("button");
    b.type = "button"; b.setAttribute("role", "radio"); b.setAttribute("aria-label", name); b.setAttribute("aria-checked", String(i === 2)); b.style.background = hex;
    b.addEventListener("click", () => { paintCol = new THREE.Color(hex); paintHex = hex; capsEl.querySelectorAll("[role=radio]").forEach((x) => x.setAttribute("aria-checked", String(x === b))); });
    capsEl.appendChild(b);
  });
  const clr = document.createElement("button");
  clr.type = "button"; clr.className = "clear"; clr.textContent = "Clean";
  clr.addEventListener("click", () => { painter.snapshot(paintP); painter.clear(paintP); painter.update(); });
  capsEl.appendChild(clr);

  // ---------------------------------------------------------------- input: drag (hang), spray (spray), tap (launch)
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const drag = { on: false, x: 0, y: 0, id: null, moved: 0 };
  const spray = { on: false, x: 0, y: 0, stamps: 0 };
  function toNdc(e) { const b = cv.getBoundingClientRect(); ndc.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1); }
  function hitPin() { ray.setFromCamera(ndc, camera); return ray.intersectObjects(pinMeshes, false)[0] || null; }
  function sprayEnd() { spray.on = false; }
  cv.addEventListener("pointerdown", (e) => {
    toNdc(e);
    if (mode === "spray") {
      cv.setPointerCapture(e.pointerId);
      painter.snapshot(paintP); spray.on = true; spray.x = ndc.x; spray.y = ndc.y;
      hint("");
      return;
    }
    if (mode === "launch") {
      ray.setFromCamera(ndc, camera);
      const lh = ray.intersectObjects(logoMeshes, false)[0], ph = ray.intersectObjects(pinMeshes, false)[0];
      if (ph && (!lh || ph.distance < lh.distance)) { if (hop.t >= 1) { hop.t = 0; } }
      else if (lh && logoSpin.t >= 1) { logoSpin.t = 0; burst(logo.position.clone().add(new THREE.Vector3(0, 0.4, 0)), 10); }
      return;
    }
    drag.on = true; drag.id = e.pointerId; drag.x = e.clientX; drag.y = e.clientY; drag.moved = 0;
    cv.setPointerCapture(e.pointerId); cv.style.cursor = "grabbing";
  });
  cv.addEventListener("pointermove", (e) => {
    toNdc(e);
    if (spray.on) { spray.x = ndc.x; spray.y = ndc.y; return; }
    if (!drag.on || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
    sw.w += dx * 0.05; sw.pw += dy * 0.02; sw.tww += dx * 0.08; sw.calm = 0;
  });
  const up = () => { if (drag.on && drag.moved < 6) { sw.w += (Math.random() < 0.5 ? -1 : 1) * 1.4; sw.tww += 4; } drag.on = false; cv.style.cursor = ""; sprayEnd(); };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);

  const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _u = new THREE.Vector3();
  function tickSpray() {
    if (!spray.on || mode !== "spray" || trans.t < 1) return;
    ndc.set(spray.x, spray.y);
    ray.setFromCamera(ndc, camera);
    _o.copy(camera.position); _d.copy(ray.ray.direction); _u.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const dist = Math.max(pose.p.distanceTo(_o), 0.1);
    painter.stamp({ origin: _o, dir: _d, up: _u, half: Math.atan(0.075 / dist), mode: "spray", color: paintCol, amt: 0.45, only: paintP });
    const h = hitPin();
    if (h && Math.random() < 0.7) mist(h.point.clone().addScaledVector(_d, -0.05), paintHex);
    spray.stamps++;
  }

  // ---------------------------------------------------------------- layout + loop
  function fit() {
    const w = cv.clientWidth || 300, h = cv.clientHeight || 300;
    r.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    narrow = w < 560;
    if (trans.t >= 1) { const c = camTarget(mode); camNow.p.copy(c.p); camNow.look.copy(c.look); }
  }
  fit();
  { const c = camTarget("hang"); camNow.p.copy(c.p); camNow.look.copy(c.look); }
  new ResizeObserver(fit).observe(cv);
  { const t = targetPose("hang"); pose.p.copy(t.p); pose.q.copy(t.q); }

  let visible = false, last = performance.now();
  onScreen(stage, (v) => (visible = v));
  stage.classList.add("ready");
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 1 / 20); last = now;
    if (!visible) return;
    // physics in small steps
    for (let i = 0; i < 4; i++) stepSwing(dt / 4);
    // the pin's pose
    const tgt = targetPose(mode);
    if (trans.t < 1) {
      trans.t = Math.min(1, trans.t + dt / trans.dur);
      const k = easeInOut(trans.t);
      pose.p.lerpVectors(from.p, tgt.p, k); pose.p.y += Math.sin(Math.PI * trans.t) * trans.arc;
      pose.q.slerpQuaternions(from.q, tgt.q, k);
      if (trans.spin) pose.q.multiply(_q.setFromAxisAngle(_v.set(0, 1, 0), trans.spin * k));
      pose.s = lerp(from.s, tgt.s, mode === "spray" ? backOut(trans.t) : k);
      const c = camTarget(mode);
      camNow.p.lerpVectors(camFrom.p, c.p, k); camNow.look.lerpVectors(camFrom.look, c.look, k);
      if (mode === "launch" && trans.t >= 1) { land.material.opacity = 0.9; burst(new THREE.Vector3(tgt.p.x, FLOOR_Y + 0.1, tgt.p.z), 14); }
    } else {
      pose.p.copy(tgt.p); pose.q.copy(tgt.q); pose.s = tgt.s;
      const t = now / 1000;
      if (mode === "spray") { pose.q.multiply(_q.setFromEuler(_e.set(Math.sin(t * 0.8) * 0.06, Math.sin(t * 0.6) * 0.18, 0))); pose.p.y += Math.sin(t * 1.4) * 0.03; }
    }
    // Launch It: hop when tapped
    let hopY = 0, hopSpin = 0;
    if (hop.t < 1) {
      hop.t = Math.min(1, hop.t + dt / 0.9);
      hopY = Math.sin(Math.PI * hop.t) * 0.9; hopSpin = easeInOut(hop.t) * Math.PI * 2;
      if (hop.t >= 1) { burst(new THREE.Vector3(pose.p.x, FLOOR_Y + 0.1, pose.p.z), 12); land.material.opacity = 0.9; }
    }
    proxy.position.copy(pose.p); proxy.position.y += hopY;
    proxy.quaternion.copy(pose.q); if (hopSpin) proxy.quaternion.multiply(_q.setFromAxisAngle(_v.set(0, 1, 0), hopSpin));
    proxy.scale.setScalar(pose.s);
    proxy.updateMatrixWorld(true);
    pinRoot.matrix.copy(proxy.matrixWorld); pinRoot.matrixWorldNeedsUpdate = true;
    // the keychain fades out of the way once the pin is off it
    swing.visible = clasp.visible = mode === "hang" || trans.t < 0.5;
    // the logo
    if (logoAnim.on) {
      logoAnim.t = Math.min(1, logoAnim.t + dt / 0.7);
      const lp = logoPose(mode), k = backOut(logoAnim.t);
      logo.visible = true;
      logo.position.lerp(lp.p, trans.t < 1 ? 0.12 : 1);
      if (logoAnim.t < 1 && trans.t >= 1) logo.position.copy(lp.p);
      let ry = lp.ry + Math.sin(now / 900) * 0.12;
      if (logoSpin.t < 1) { logoSpin.t = Math.min(1, logoSpin.t + dt / 1.1); ry += easeInOut(logoSpin.t) * Math.PI * 2; logo.position.y = lp.p.y + Math.sin(Math.PI * logoSpin.t) * 0.4; }
      logo.rotation.set(0, ry, 0);
      logo.scale.setScalar(Math.max(0.0001, lp.s * k));
    } else if (logo.visible) {
      logo.scale.multiplyScalar(0.8); if (logo.scale.x < 0.02) logo.visible = false;
    }
    if (mode === "launch") {
      shadow.position.set(pose.p.x, 0.004, pose.p.z); const ss = 0.9 * pose.s * (1 - hopY * 0.35); shadow.scale.set(ss, ss * 0.55, 1);
      land.position.set(pose.p.x, 0.006, pose.p.z); land.material.opacity *= 0.95; land.scale.setScalar(1 + (0.9 - land.material.opacity) * 0.8);
    }
    camera.position.copy(camNow.p); camera.lookAt(camNow.look);
    tickSpray();
    painter.update();
    tickFx(dt);
    r.setRenderTarget(null); r.setClearColor(0x000000, 0); r.clear();
    r.render(scene, camera);
  }
  requestAnimationFrame(frame);
  window.__mqc = { setMode, get state() { return { mode, stamps: spray.stamps, t: trans.t }; }, sprayAt: (x, y, ms = 600) => new Promise((res) => { spray.x = x; spray.y = y; painter.snapshot(paintP); spray.on = true; setTimeout(() => { spray.on = false; res(spray.stamps); }, ms); }), hop: () => (hop.t = 0), spinLogo: () => (logoSpin.t = 0) };
})();
