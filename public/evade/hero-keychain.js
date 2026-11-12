// EVADE hero: the real keychain (the same model as the Bobo Off the Chain splash) hangs in the hero and
// dangles like a real one. It drops in on a thin cable, jiggles once it lands, nudges itself now and then
// so people know it can be touched, and swings when you drag or flick it (tap to jiggle).
// The physics is the splash's (/evade/keychain-ar/splash3d.js), framed to sit exactly where the still render
// (#heroKc img) is, which stays as the poster and the fallback (no WebGL, reduced motion, slow load).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const hero = document.querySelector(".hero");
const fig = document.getElementById("heroKc");
const img = fig && fig.querySelector("img");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const G = 9.81;

if (hero && fig && img && !reduce) {
  // after the page has painted, so the 3D never competes with the first view
  const go = () => ("requestIdleCallback" in window ? requestIdleCallback(init, { timeout: 1500 }) : setTimeout(init, 300));
  if (document.readyState === "complete") go();
  else addEventListener("load", go, { once: true });
}

function init() {
  const canvas = document.createElement("canvas");
  canvas.className = "hk-3d";
  canvas.setAttribute("aria-hidden", "true");
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch {
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.toneMapping = THREE.NeutralToneMapping; // keeps the pastel print true
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.03).texture;
  pm.dispose();
  scene.environmentIntensity = 0.75;
  const key = new THREE.DirectionalLight(0xfff1d6, 1.6);
  key.position.set(0.3, 1, 0.8);
  const rim = new THREE.DirectionalLight(0x9fd4ff, 1.1);
  rim.position.set(-0.6, 0.3, -0.6);
  scene.add(key, rim);
  const camera = new THREE.PerspectiveCamera(24, 1, 0.01, 10);

  let rig = null, W = 1, H = 1, visible = true, awakeUntil = 0, touched = false, nudgeT = 0, side = 1;
  const poke = (ms = 6000) => (awakeUntil = Math.max(awakeUntil, performance.now() + ms));

  new GLTFLoader().load("/evade/keychain/evade-keychain.glb", (g) => build(g.scene), undefined, () => canvas.remove());

  // ------------------------------------------------------------ the model, regrouped into swinging parts
  function build(root) {
    const byName = {};
    root.traverse((o) => { if (o.name) byName[o.name] = byName[o.name] || o; });
    root.updateMatrixWorld(true);
    const pivotAt = (name, parts) => {
      const p = new THREE.Group();
      byName[name].getWorldPosition(p.position);
      root.add(p);
      p.updateMatrixWorld(true);
      for (const n of parts) if (byName[n]) p.attach(byName[n]);
      return p;
    };
    const pB = pivotAt("Jump_Ring_Bobo", ["Jump_Ring_Bobo", "Charm_Bobo"]);
    const pE = pivotAt("Jump_Ring_Eclipse_Top", ["Jump_Ring_Eclipse_Top", "Chain_Link_1", "Chain_Link_2", "Chain_Link_3", "Jump_Ring_Eclipse", "Charm_Eclipse"]);
    root.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      if (m && m.transmission) { m.transmission = 0; m.transparent = true; m.opacity = 0.14; m.roughness = 0.05; m.clearcoat = 1; m.depthWrite = false; }
    });
    const cable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.00045, 0.00045, 1, 8, 1, true).translate(0, 0.5, 0),
      new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 1, roughness: 0.35 }),
    );
    const anchor = new THREE.Group(), swing = new THREE.Group();
    anchor.add(swing);
    swing.add(root);
    scene.add(anchor, cable);
    const box = new THREE.Box3().setFromObject(root);
    // reference points for lining the model up with the still: the clasp's top and the split ring's centre
    const claspBox = new THREE.Box3().setFromObject(byName.Clasp || root);
    const ring = new THREE.Box3().setFromObject(byName.Split_Ring || root).getCenter(new THREE.Vector3());
    rig = {
      anchor, swing, cable, pB, pE, box, size: box.getSize(new THREE.Vector3()), L: 0.075, lB: 0.034, lE: 0.042,
      rest: new THREE.Vector3(), top: new THREE.Vector3(), P: new THREE.Vector3(), V: new THREE.Vector3(),
      phi: 0, dphi: 0, psi: 0, dpsi: 0, tau: 0, dtau: 0, b: 0, db: 0, e: 0, de: 0, eb: 0, deb: 0, visH: 1, visW: 1,
      claspTop: claspBox.max.y, ring, wide: true,
    };

    // swap the still for the live one in the same place
    hero.appendChild(canvas);
    fig.classList.add("is-3d");
    layout();
    if (rig.wide) {
      // drop in from above the hero, drifting a little and twisting, so it lands swinging
      rig.P.copy(rig.rest).add(new THREE.Vector3(0.008, rig.visH * 0.5 - rig.rest.y + rig.size.y * 0.6, 0));
      rig.V.set(-0.04, -0.3, 0);
      rig.dtau = 3;
      rig.phi = 0.1;
    } else {
      // phones: the copy sits above it, so no drop; it starts swinging where it hangs
      rig.dphi = 3.2; rig.dtau = 2.5; rig.db = 4; rig.de = -4;
    }
    requestAnimationFrame(() => canvas.classList.add("on"));
    poke(8000);
    // once it has landed: shake it as if someone just touched it, then show that it can be touched
    setTimeout(() => { if (!touched) { jiggle(); hint(true); } }, 2300);
    nudgeT = performance.now() + 9000;

    new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) poke(); }, { threshold: 0.05 }).observe(hero);
    new ResizeObserver(() => { layout(); poke(1500); }).observe(hero);
    bindPointer();
    let last = performance.now();
    const loop = (now) => {
      requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 1 / 20);
      last = now;
      if (!visible || document.hidden) return;
      // every so often, while nobody has touched it, it sways by itself (a hint that it is touchable)
      if (!touched && now > nudgeT) { nudgeT = now + 8000; rig.dphi += 1.1 * side; side = -side; rig.db += 2.5; rig.de -= 2.5; poke(); }
      if (now > awakeUntil) return; // settled: no work until something moves it
      const n = Math.ceil(dt / (1 / 480));
      for (let i = 0; i < n; i++) step(dt / n);
      pose();
      renderer.render(scene, camera);
    };
    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------ framing: the model sits where the still is
  function layout() {
    const hr = hero.getBoundingClientRect();
    W = hr.width; H = hr.height;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    if (!rig) return camera.updateProjectionMatrix();
    const ir = img.getBoundingClientRect();
    if (!ir.height) return;
    // in the still, the clasp top is at 1% of its height and the split ring's centre at 33.25% (x 58.9%)
    const visH = (rig.claspTop - rig.ring.y) / ((0.3225 * ir.height) / H);
    const dist = visH / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.set(0, 0, dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    const visW = visH * camera.aspect;
    const wx = (x) => (x / W - 0.5) * visW, wy = (y) => (0.5 - y / H) * visH;
    rig.rest.set(wx(ir.left - hr.left + 0.589 * ir.width) - rig.ring.x, wy(ir.top - hr.top + 0.01 * ir.height) - rig.claspTop, 0);
    // wide screens: the cable runs up out of the hero; phones: no cable (the copy sits above), it hangs as if on a hook
    rig.wide = innerWidth >= 1100;
    rig.cable.visible = rig.wide;
    rig.top.set(rig.rest.x, visH / 2 + 0.01, -0.004);
    rig.visH = visH; rig.visW = visW;
    if (!canvas.classList.contains("on")) rig.P.copy(rig.rest);
  }

  // ------------------------------------------------------------ physics (from the splash)
  const _a = new THREE.Vector3(), _w = new THREE.Vector3();
  function step(dt) {
    const r = rig;
    const k = 5000, c = 95;
    _a.subVectors(r.rest, r.P).multiplyScalar(k).addScaledVector(r.V, -c);
    if (r.P.y > r.rest.y + 0.002) _a.set((r.rest.x - r.P.x) * 6, -G, 0).addScaledVector(r.V, -0.4);
    r.V.addScaledVector(_a, dt);
    r.P.addScaledVector(r.V, dt);
    const ax = _a.x, ay = _a.y, g = Math.max(G + ay, 0.5);
    r.dphi += (-(g / r.L) * Math.sin(r.phi) - (ax / r.L) * Math.cos(r.phi) - 2.4 * r.dphi) * dt; r.phi += r.dphi * dt;
    r.dpsi += (-(g / r.L) * Math.sin(r.psi) - 2 * r.dpsi) * dt; r.psi += r.dpsi * dt;
    r.dtau += (-14 * r.tau - 0.8 * r.dtau) * dt; r.tau += r.dtau * dt;
    pose(true);
    const accOf = (pivot, key) => {
      pivot.parent.localToWorld(_w.copy(pivot.position));
      const st = r[key] || (r[key] = { p: _w.clone(), v: null, ax: 0, ay: 0 });
      const vx = (_w.x - st.p.x) / dt, vy = (_w.y - st.p.y) / dt;
      st.p.copy(_w);
      if (st.v) { st.ax += ((vx - st.v[0]) / dt - st.ax) * 0.35; st.ay += ((vy - st.v[1]) / dt - st.ay) * 0.35; }
      st.v = [vx, vy];
      return [THREE.MathUtils.clamp(st.ax, -300, 300) * 0.6, THREE.MathUtils.clamp(st.ay, -300, 300) * 0.6];
    };
    const [bx, by] = accOf(r.pB, "sB"), [ex, ey] = accOf(r.pE, "sE");
    const swingB = (gg, l, th, dth, axx) => -(gg / l) * Math.sin(th + r.phi) - (axx / l) * Math.cos(th + r.phi) - 4.2 * dth;
    r.db += swingB(Math.max(G + by, 0.5), r.lB, r.b, r.db, bx) * dt; r.b += r.db * dt;
    r.de += swingB(Math.max(G + ey, 0.5), r.lE, r.e, r.de, ex) * dt; r.e += r.de * dt;
    r.deb += (-(G / r.lE) * Math.sin(r.eb) - 1.6 * r.deb - r.dpsi * 6) * dt; r.eb += r.deb * dt;
    r.b = THREE.MathUtils.clamp(r.b, -1.2, 1.2);
    r.e = THREE.MathUtils.clamp(r.e, -1.2, 1.2);
  }
  function pose(quick) {
    const r = rig;
    r.anchor.position.copy(r.P);
    r.swing.rotation.set(r.psi, r.tau, r.phi, "YXZ");
    r.pB.rotation.z = r.b - 0.2;
    r.pE.rotation.z = r.e + 0.2;
    r.anchor.updateMatrixWorld(true);
    if (quick) return;
    const d = _w.subVectors(r.top, r.P), len = d.length();
    r.cable.position.copy(r.P);
    r.cable.scale.set(1, len, 1);
    r.cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  }
  function jiggle() {
    rig.V.y += 0.35;
    rig.dtau += (Math.random() < 0.5 ? -1 : 1) * 3;
    rig.db += 4;
    rig.de -= 4;
    rig.dphi += 0.8 * side;
    poke();
  }

  // ------------------------------------------------------------ the "you can touch it" hint
  let hintEl = null;
  function hint(on) {
    if (on && !hintEl) {
      hintEl = document.createElement("span");
      hintEl.className = "hk-hint mono";
      hintEl.setAttribute("aria-hidden", "true");
      hintEl.innerHTML = "<i></i>" + (matchMedia("(pointer: coarse)").matches ? "Tap or swipe it" : "Tap or drag it");
      fig.appendChild(hintEl);
      requestAnimationFrame(() => hintEl.classList.add("on"));
    } else if (!on && hintEl) hintEl.classList.remove("on");
  }

  // ------------------------------------------------------------ drag to swing, tap to jiggle
  function bindPointer() {
    const pxToWorld = (px) => (px / W) * rig.visW;
    const near = (e) => {
      const ir = img.getBoundingClientRect();
      const p = rig.P.clone().project(camera), hr = hero.getBoundingClientRect();
      const sx = ((p.x + 1) / 2) * W + hr.left, sy = ((1 - p.y) / 2) * H + hr.top;
      const cx = sx + ((rig.box.min.x + rig.box.max.x) / 2 / rig.visW) * W;
      return Math.abs(e.clientX - cx) < ir.width * 0.62 && e.clientY > sy - 24 && e.clientY < sy + ir.height * 1.04;
    };
    let down = null;
    hero.addEventListener("pointerdown", (e) => {
      if (!rig || e.target.closest("a,button")) return;
      if (!near(e)) return;
      down = { x: e.clientX, y: e.clientY, t: e.timeStamp, lx: e.clientX, lt: e.timeStamp, vx: 0 };
      hero.classList.add("kc-grab");
      touched = true;
      hint(false);
      poke();
    });
    hero.addEventListener("pointermove", (e) => {
      if (!down) {
        if (e.pointerType === "mouse") hero.classList.toggle("kc-hover", !!rig && near(e));
        return;
      }
      const dtt = Math.max((e.timeStamp - down.lt) / 1000, 0.008);
      down.vx = (e.clientX - down.lx) / dtt;
      rig.V.x += pxToWorld(e.clientX - down.x) * 0.9;
      rig.dtau += (e.clientX - down.lx) * 0.002;
      down.x = e.clientX; down.lx = e.clientX; down.lt = e.timeStamp;
      poke();
    });
    const up = (e) => {
      if (!down) return;
      const moved = Math.abs(e.clientX - down.lx) + Math.abs(e.clientY - down.y);
      if (e.timeStamp - down.t < 250 && moved < 10) jiggle();
      else rig.dphi += THREE.MathUtils.clamp(down.vx * 0.004, -6, 6);
      down = null;
      hero.classList.remove("kc-grab");
      poke();
    };
    hero.addEventListener("pointerup", up);
    hero.addEventListener("pointercancel", () => { down = null; hero.classList.remove("kc-grab"); });
    hero.addEventListener("pointerleave", () => hero.classList.remove("kc-hover"));
  }

  window.__heroKc = {
    get rig() { return rig; }, poke, jiggle,
    // debug: hold it at rest and draw one frame (for lining it up with the still)
    rest() { Object.assign(rig, { phi: 0, dphi: 0, psi: 0, dpsi: 0, tau: 0, dtau: 0, b: 0, db: 0, e: 0, de: 0, eb: 0, deb: 0 }); rig.P.copy(rig.rest); rig.V.set(0, 0, 0); touched = true; awakeUntil = 0; pose(); renderer.render(scene, camera); },
  };
}
