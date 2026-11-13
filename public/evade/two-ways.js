// EVADE section 01, "1 Keychain, 2 Experiences": one phone, two experiences.
// The visitor slides one phone between the two things the keychain opens:
//   - left: the Cola Run splash. With the phone over it, Bobo's Hideout rises out of the phone and the
//     mini game from the homepage hero plays (Bobo collects three cans; joystick on the phone, arrow keys,
//     or Bobo plays himself when left alone).
//   - right: the real keychain. With the phone over it, Bobo and the Eclipse can pop off their charms
//     (the Off the Chain pop-out, ported from /labs/keychain-pop/). Tap Bobo to wave.
// The phone is a lens: outside it the pieces are dimmed; through it they are vivid, and what pops out
// spills past its edges. It starts in the middle, pointing at neither. With a mouse the phone IS the cursor
// (as on the homepage hero: it sits right under the pointer, no dragging) and holds still once an experience is
// on so the joystick and Bobo can be used; moving off the phone picks it up again. On touch you drag it (or tap
// a side), and the experience starts the moment the phone is over it, while still held. The switch under the
// stage works everywhere. Over the keychain the charms first open into portals (3 s, the same shader as the
// real AR) and then Bobo and the can pop out.
// Only real assets: the 3D keychain, the Bobo and can models, Bobo's Hideout, the Cola Run splash.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

const wrap = document.querySelector(".tw");
const stage = document.getElementById("twStage");
if (wrap && stage) {
  const io = new IntersectionObserver((es) => {
    if (es[0].isIntersecting) { io.disconnect(); init().catch((e) => console.warn("[two-ways]", e)); }
  }, { rootMargin: "500px 0px" });
  io.observe(stage);
}

const VH = 4;                       // world units visible top to bottom
const FOV = 28;
const D = VH / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const BASE = 0, POP = 1;            // layers: the pieces (dimmed outside the lens), what pops out
const GOLD = 0xf6c344;
const CANS = 3;
const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const easeInOut = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const backOut = (x) => { x = clamp01(x); const c = 1.4; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const setLayer = (o, l) => o.traverse((c) => c.layers.set(l));
function fit(obj, size) {
  const g = new THREE.Group();
  const box = new THREE.Box3().setFromObject(obj);
  const dim = box.getSize(new THREE.Vector3());
  obj.position.sub(box.getCenter(new THREE.Vector3()));
  g.add(obj);
  g.scale.setScalar(size / Math.max(dim.x, dim.y, dim.z, 1e-6));
  return g;
}

async function init() {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canvas = stage.querySelector(".tw-3d");
  const phone = stage.querySelector(".tw-phone");
  const back = stage.querySelector(".tw-back");
  const hudApp = phone.querySelector(".tw-app");
  const hudScore = phone.querySelector(".tw-score");
  const msgEl = phone.querySelector(".tw-msg");
  const stickEl = phone.querySelector(".tw-stick");
  const knob = stickEl.querySelector("i");
  const buttons = [...wrap.querySelectorAll(".tw-switch button")];
  const coarse = matchMedia("(pointer: coarse)").matches;
  const hint = phone.querySelector(".tw-hint");
  if (hint) hint.textContent = coarse ? "Drag the phone to either side" : "Move the phone to either side";

  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" }); } catch { return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  pm.dispose();
  scene.environmentIntensity = 0.7;
  const lights = [new THREE.HemisphereLight(0xffffff, 0x2a2340, 1.3), new THREE.DirectionalLight(0xfff4e0, 1.7), new THREE.DirectionalLight(0x3fe6e0, 0.8)];
  lights[1].position.set(2, 4, 6);
  lights[2].position.set(-4, 2, -2);
  for (const l of lights) { l.layers.enableAll(); scene.add(l); }
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60);
  camera.position.set(0, 0, D);
  camera.layers.enableAll();

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const load = (u) => loader.loadAsync(u);

  // ------------------------------------------------------------------ layout (px in the stage <-> world)
  const L = { w: 1, h: 1, ph: 1, pw: 1, lx: 0, rx: 1, wpp: 1, bez: 7, k: 1 };
  const px2x = (px) => (px - L.w / 2) * L.wpp;
  const py2y = (py) => (L.h / 2 - py) * L.wpp;

  // ------------------------------------------------------------------ left: the Cola Run splash, the hideout and the game
  const left = new THREE.Group();
  scene.add(left);
  const splash = await new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = "/evade/creators/assets/img/cola-run-splash.webp";
  });
  const CARD_H = VH * 0.6, CARD_W = CARD_H * (1080 / 1935);
  const card = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), new THREE.MeshBasicMaterial({ transparent: true }));
  if (splash) {
    const cv = document.createElement("canvas");
    cv.width = 540; cv.height = 968;
    const x = cv.getContext("2d");
    const r = 34;
    x.beginPath(); x.roundRect(3, 3, cv.width - 6, cv.height - 6, r); x.save(); x.clip();
    x.drawImage(splash, 0, 0, cv.width, cv.height); x.restore();
    x.lineWidth = 4; x.strokeStyle = "rgba(246,195,68,0.75)"; x.stroke();
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    card.material.map = t;
  }
  card.rotation.set(0, 0.16, -0.04);
  left.add(card);

  const game = new BoboGame(GOLD);
  setLayer(game.root, POP);
  left.add(game.root);
  let hub = null;

  // ------------------------------------------------------------------ right: the keychain and what pops off it
  // the same composition as the pop-out lab (keychain at 8x real size, floor below it), scaled into place
  const right = new THREE.Group();
  scene.add(right);
  const KS = 8, KY = 1.18, FLOOR_Y = -0.5;
  const ar = { ready: false, state: "idle", tweens: [] };

  // ------------------------------------------------------------------ the phone: position, spring, drag
  // it starts in the middle, between the two, pointing at nothing; moving it to a side starts that experience
  let u = 0.5, uv = 0, target = 0.5, dragging = null, touched = false, at = "game";
  const go = (k, byUser = true) => {
    target = k;
    locked = true;   // with a mouse, it stays there until the pointer comes back onto the scene off the phone
    if (byUser) touched = true;
    if (reduce) { u = k; uv = 0; }
    buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(i === k)));
  };
  buttons.forEach((b, i) => b.addEventListener("click", () => go(i)));

  function layout() {
    // the scene is the canvas: the stage minus the strip at the bottom that holds the switch
    L.w = canvas.clientWidth || stage.clientWidth || 1;
    L.h = canvas.clientHeight || stage.clientHeight || 1;
    renderer.setSize(L.w, L.h, false);
    camera.aspect = L.w / L.h;
    camera.updateProjectionMatrix();
    const narrow = L.w < 700;
    // on phones the phone and the two pieces are smaller and sit further apart, so the phone waiting in the
    // middle doesn't cover both of them and each piece has room around it
    L.ph = L.h * (narrow ? 0.74 : 0.88);
    L.pw = L.ph * 0.47;
    L.bez = narrow ? 5 : 7;
    L.lx = L.w * (narrow ? 0.25 : 0.27);
    L.rx = L.w * (narrow ? 0.73 : 0.73);
    L.k = narrow ? 0.8 : 1;             // the pieces and what plays in the phone, scaled with it
    L.wpp = VH / L.h;
    phone.style.width = back.style.width = L.pw + "px";
    phone.style.height = back.style.height = L.ph + "px";
    // pieces: left centred on its station, right on its own
    left.position.set(px2x(L.lx), 0, 0);
    right.position.set(px2x(L.rx), 0, 0);
    // the keychain set fills about three quarters of the stage height
    const f = (VH * (narrow ? 0.5 : 0.68)) / (KY - FLOOR_Y);
    right.scale.setScalar(f);
    right.position.y = -((KY + FLOOR_Y) / 2) * f + 0.1;
    L.narrow = narrow;
  }
  new ResizeObserver(layout).observe(stage);
  layout();

  const phoneX = () => lerp(L.lx, L.rx, u);
  // with a mouse the phone also rides up and down with the pointer (vy, px from the middle), as on the homepage hero
  let vy = 0, vyT = 0;
  const phoneY = () => L.h / 2 + vy;
  function placePhone() {
    const x = phoneX() - L.pw / 2, y = phoneY() - L.ph / 2;
    const tr = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    phone.style.transform = back.style.transform = tr;
  }

  // touch: drag the phone; a tap on a side moves it there. A mouse is the phone (below), and it can also grab
  // and drag it.
  let down = null;
  stage.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".tw-stick, .tw-switch")) return;
    const b = stage.getBoundingClientRect();
    const x = e.clientX - b.left;
    const onPhone = Math.abs(x - phoneX()) < L.pw / 2 && Math.abs(e.clientY - b.top - phoneY()) < L.ph / 2;
    const mouse = e.pointerType === "mouse";
    down = { x: e.clientX, y: e.clientY, u, onPhone, mouse, drag: onPhone, lx: e.clientX, lt: e.timeStamp, v: 0, moved: 0 };
    if (down.drag) { try { stage.setPointerCapture(e.pointerId); } catch {} }
  });
  stage.addEventListener("pointermove", (e) => {
    if (!down || !down.drag) return;
    const dx = e.clientX - down.x;
    down.moved = Math.max(down.moved, Math.abs(dx), Math.abs(e.clientY - down.y));
    if (down.moved < 6) return;
    if (!dragging) { phone.classList.add("is-drag"); setFollow(false); }
    dragging = true; touched = true;
    const span = L.rx - L.lx;
    u = Math.min(Math.max(down.u + dx / span, -0.05), 1.05);
    const dt = Math.max((e.timeStamp - down.lt) / 1000, 0.008);
    down.v = lerp(down.v, (e.clientX - down.lx) / span / dt, 0.5);
    down.lx = e.clientX; down.lt = e.timeStamp;
    target = u; uv = 0;
  });
  // mouse: the cursor is the phone, as on the homepage hero. It sits right under the pointer (a quick damp,
  // no spring), sideways and a little up and down, and the real cursor is hidden over the scene. On Cola Run,
  // once the phone has been held still for a moment it parks so the joystick can be used (the cursor shows
  // again); Off the Chain keeps following. Moving the pointer off a parked phone picks it up again.
  // Listening on the window (not the stage) means nothing laid over the scene can swallow the movement.
  let following = false, locked = false, stillT = 0;
  const span = () => L.rx - L.lx;
  // never past a piece: beyond the splash or the keychain the phone stays centred on it, so the lens frames it
  const uOf = (x) => Math.min(Math.max((x - L.lx) / span(), 0), 1);
  const setFollow = (f) => {
    if (f === following) return;
    following = f;
    stage.classList.toggle("is-follow", f);
    if (!f) vyT = 0;
  };
  let mouseAt = null;   // the last mouse position (client px), so a scroll with the wheel picks the phone up too
  const track = (cx, cy) => {
    // (no reduced-motion opt-out here: following the mouse is direct manipulation, not decoration; with reduced
    // motion the phone simply moves without the easing, as on the homepage hero)
    if (dragging) return;
    const b = canvas.getBoundingClientRect();
    const x = cx - b.left, y = cy - b.top;
    const inside = x >= 0 && y >= 0 && x <= L.w && y <= L.h;
    if (!inside) { setFollow(false); return; }
    // the switch and the joystick: leave the phone be
    const el = document.elementFromPoint(cx, cy);
    if (el && el.closest(".tw-switch, .tw-stick, a, button")) { setFollow(false); return; }
    if (locked) {
      const off = Math.abs(x - phoneX()) > L.pw / 2 + 4 || Math.abs(y - phoneY()) > L.ph / 2 + 4;
      if (!off) { setFollow(false); return; }
      locked = false;
    }
    setFollow(true);
    touched = true;
    target = uOf(x);
    const room = Math.max(0, (L.h - L.ph) / 2 - 2);
    vyT = Math.min(Math.max(y - L.h / 2, -room), room);
  };
  addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    mouseAt = { x: e.clientX, y: e.clientY };
    track(e.clientX, e.clientY);
  }, { passive: true });
  addEventListener("scroll", () => { if (mouseAt) track(mouseAt.x, mouseAt.y); }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => { mouseAt = null; setFollow(false); });
  const up = (e) => {
    if (!down) return;
    const d = down; down = null;
    phone.classList.remove("is-drag");
    if (dragging) {
      dragging = false;
      const proj = u + d.v * 0.15;   // a flick carries it over
      go(proj > 0.5 ? 1 : 0);
      uv = d.v * 0.35;
      return;
    }
    if (d.moved > 8 || !e) return;
    const b = stage.getBoundingClientRect();
    if (d.onPhone) { tapScreen(e.clientX - b.left, e.clientY - b.top); return; }
    if (!d.mouse) go(e.clientX - b.left < L.w / 2 ? 0 : 1);
  };
  stage.addEventListener("pointerup", up);
  stage.addEventListener("pointercancel", () => {
    const wasDrag = dragging;
    down = null; dragging = false; phone.classList.remove("is-drag");
    if (wasDrag) go(u > 0.5 ? 1 : 0, false);
  });

  // ------------------------------------------------------------------ the joystick and the arrow keys
  const stick = { x: 0, y: 0, active: false, at: -99 };
  game.stick = stick;
  let clock = 0;
  stickEl.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    touched = true;
    try { stickEl.setPointerCapture(e.pointerId); } catch {}
    stick.active = true;
    const move = (ev) => {
      const b = stickEl.getBoundingClientRect();
      let x = (ev.clientX - (b.left + b.width / 2)) / (b.width * 0.42);
      let y = -(ev.clientY - (b.top + b.height / 2)) / (b.height * 0.42);
      const m = Math.hypot(x, y);
      if (m > 1) { x /= m; y /= m; }
      stick.x = x; stick.y = y; stick.at = clock;
      knob.style.transform = `translate(${(x * 22).toFixed(1)}px, ${(-y * 22).toFixed(1)}px)`;
    };
    const end = () => {
      stick.active = false; stick.x = stick.y = 0; stick.at = clock;
      knob.style.transform = "";
      stickEl.removeEventListener("pointermove", move);
      stickEl.removeEventListener("pointerup", end);
      stickEl.removeEventListener("pointercancel", end);
    };
    move(e);
    stickEl.addEventListener("pointermove", move);
    stickEl.addEventListener("pointerup", end);
    stickEl.addEventListener("pointercancel", end);
  });
  let hover = false;
  stage.addEventListener("pointerenter", () => (hover = true));
  stage.addEventListener("pointerleave", () => (hover = false));
  const keys = new Set();
  addEventListener("keydown", (e) => {
    if (!/^Arrow/.test(e.key) || at !== "game" || !(hover || stage.contains(document.activeElement))) return;
    e.preventDefault();
    keys.add(e.key); touched = true;
  });
  addEventListener("keyup", (e) => keys.delete(e.key));
  function keyStick() {
    if (!keys.size || stick.active) return;
    stick.x = (keys.has("ArrowRight") ? 1 : 0) - (keys.has("ArrowLeft") ? 1 : 0);
    stick.y = (keys.has("ArrowUp") ? 1 : 0) - (keys.has("ArrowDown") ? 1 : 0);
    stick.at = clock;
  }

  // ------------------------------------------------------------------ the phone's screen
  let msgT = 0;
  function say(text, secs = 0) {
    msgEl.textContent = text;
    msgEl.classList.toggle("on", !!text);
    msgT = secs ? clock + secs : 0;
  }
  function setAt(next) {
    if (next === at) return;
    at = next;
    phone.dataset.at = wrap.dataset.at = at || "none";
    buttons.forEach((b, i) => b.setAttribute("aria-pressed", String((at === "game" && i === 0) || (at === "ar" && i === 1))));
    hudApp.textContent = at === "game" ? (L.narrow ? "Cola Run" : "EVADE · Cola Run") : at === "ar" ? (L.narrow ? "Off the Chain" : "Bobo · Off the Chain") : "Camera";
    hudScore.hidden = at !== "game";
    say("");
  }
  game.onScore = (n) => { hudScore.textContent = `Cans ${n}/${CANS}`; };
  game.onDone = () => {
    say("All 3 cans! Rewards land in Bobo's Hideout", 4);
    winT = clock;
  };
  let winT = -1;

  // ------------------------------------------------------------------ assets: the game first, then the keychain set
  const [cb, crun, ccan] = await Promise.all([
    load("/roblox/activated-retail/models/catbobo.glb"),
    load("/roblox/activated-retail/models/catrun.glb"),
    load("/roblox/activated-retail/models/cola.glb"),
  ]);
  game.setModels(cb, [...crun.animations, ...cb.animations], ccan);
  load("/home/ar/hub-lite.glb").then((g) => {
    const room = fit(g.scene, VH * 0.74);
    hub = new THREE.Group();
    hub.add(room);
    room.rotation.set(0.14, -0.55, 0);
    setLayer(hub, POP);
    hub.visible = false;
    left.add(hub);
  }).catch((e) => console.warn("[two-ways] hub", e));

  stage.classList.add("is-ready");
  wrap.classList.add("is-ready");
  placePhone();
  setAt(null);
  buttons.forEach((b) => b.setAttribute("aria-pressed", "false"));   // neither, until the phone is on one
  hudScore.textContent = `Cans 0/${CANS}`;

  loadAR().catch((e) => console.warn("[two-ways] keychain", e));

  // ------------------------------------------------------------------ render: dimmed outside the lens, vivid through it
  const run = { visible: true };
  new IntersectionObserver((es) => { run.visible = es[0].isIntersecting; }, { threshold: 0.01 }).observe(stage);
  let grow = 0, last = performance.now(), arWas = false, idleT = 1.6, nudgeDir = 1;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    if (!run.visible || document.hidden) return;
    clock += dt;

    // the phone: a soft spring to where it is going, unless it is held
    if (!dragging) {
      if (reduce) u = target;
      else if (following) { const n = lerp(u, target, 1 - Math.exp(-26 * dt)); uv = (n - u) / dt; u = n; }   // right under the pointer
      else { uv += ((target - u) * 70 - uv * 13) * dt; u += uv * dt; }
    }
    vy = reduce ? vyT : lerp(vy, vyT, 1 - Math.exp(-(following ? 26 : 8) * dt));
    placePhone();
    const settled = !dragging && Math.abs(target - u) < 0.03 && Math.abs(uv) < 0.4;
    // which experience the phone is on, with a little hysteresis so it doesn't flicker at the edges
    setAt(at === "game" ? (u < 0.26 ? "game" : u > 0.82 ? "ar" : null)
      : at === "ar" ? (u > 0.74 ? "ar" : u < 0.18 ? "game" : null)
      : u < 0.18 ? "game" : u > 0.82 ? "ar" : null);

    // until someone moves it, the phone waits in the middle and now and then leans each way, as a hint
    if (!touched && !reduce && settled && target === 0.5) {
      idleT += dt;
      if (idleT > 3.2) { idleT = 0; nudgeDir = -nudgeDir; uv += nudgeDir * 1.15; }
    } else idleT = 0;

    // left: the hideout rises and the game plays while the phone is over the splash
    // with a mouse, an experience that comes on holds the phone over its piece (the cursor shows again)
    if (following && at === "game" && !locked) {
      stillT = Math.abs(uv) < 0.3 ? stillT + dt : 0;
      if (stillT > 0.45) { locked = true; setFollow(false); target = 0; }   // parks, centred on the splash
    } else stillT = 0;
    // an experience starts as soon as the phone is over its piece, while it is still being dragged or moved
    const gameOn = at === "game";
    grow = reduce ? (gameOn ? 1 : 0) : clamp01(grow + (gameOn ? dt / 0.7 : -dt / 0.35));
    const g = gameOn ? backOut(grow) : easeInOut(grow);
    card.scale.setScalar(Math.max(1e-3, 1 - easeInOut(grow) * 0.98) * L.k);
    card.visible = grow < 0.98;
    if (hub) {
      hub.visible = grow > 0.01;
      hub.scale.setScalar(Math.max(1e-3, g) * (L.narrow ? 0.74 : 1));
      hub.position.y = VH * 0.06 - (1 - Math.min(1, g)) * 0.6;
    }
    game.root.visible = grow > 0.01 && game.ready;
    game.root.scale.setScalar(Math.max(1e-3, g) * VH * 0.2 * L.k);
    game.root.position.set(0.05, -VH * 0.17 * L.k, 0.9);
    if (!gameOn && grow === 0 && (game.score || !game.needSpawn)) { game.reset(); winT = -1; }
    if (gameOn && winT > 0 && clock - winT > 4.5) { game.reset(); winT = -1; }
    keyStick();
    game.auto = true;
    game.update(dt, clock, gameOn && grow > 0.6);
    stickEl.classList.toggle("on", gameOn && grow > 0.6);
    if (gameOn && grow > 0.6 && !msgEl.classList.contains("on") && winT < 0 && clock - stick.at > 6 && !game.score)
      say(L.narrow ? "Drag the stick" : coarse ? "Drag the stick to move Bobo" : "Use the stick or arrow keys to move Bobo");

    // right: the pop-out plays each time the phone arrives at the keychain
    const arOn = at === "ar";
    if (arOn && !arWas) arWas = arStart();
    if (!arOn && arWas) { arReset(); arWas = false; }
    arFrame(dt);

    if (msgT && clock > msgT) say("");

    // draw
    renderer.setScissorTest(false);
    renderer.clear();
    camera.layers.set(BASE);
    renderer.toneMappingExposure = 0.38;
    renderer.render(scene, camera);
    const sx = phoneX() - L.pw / 2 + L.bez, sy = phoneY() - L.ph / 2 + L.bez, sw = L.pw - L.bez * 2, sh = L.ph - L.bez * 2;
    renderer.setScissorTest(true);
    renderer.setScissor(sx, L.h - sy - sh, sw, sh);
    renderer.clear();
    renderer.toneMappingExposure = 1;
    renderer.render(scene, camera);
    renderer.setScissorTest(false);
    renderer.clearDepth();
    camera.layers.set(POP);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  // ------------------------------------------------------------------ the Off the Chain pop-out (from /labs/keychain-pop/)
  let K = null, B = null, C = null, PADS = null, SPOT = null, flashB = null, flashC = null;
  const PORTAL_S = 3, PORTAL_REST = 1, GLOW_REST = 0.55;   // the portal builds for 3 s before anything pops out (Dapo), and stays open after
  const tween = (dur, fn, done) => ar.tweens.push({ t: 0, dur, fn, done });
  const after = (d, fn) => tween(d, () => {}, fn);

  async function loadAR() {
    const [kc, bobo, can] = await Promise.all([
      load("/evade/keychain/evade-keychain.glb"),
      load("/evade/keychain/ar/bobo-keychain.glb"),
      load("/evade/keychain/ar/eclipse-can.glb"),
    ]);
    K = kc.scene;
    K.traverse((o) => {
      const m = o.isMesh && o.material;
      if (m && m.transmission) { m.transmission = 0; m.transparent = true; m.opacity = 0.14; m.roughness = 0.05; m.clearcoat = 1; m.depthWrite = false; }
    });
    K.scale.setScalar(KS);
    K.position.set(0, KY, 0);
    right.add(K);
    right.updateMatrixWorld(true);
    B = prepCharacter(bobo, 0.78, K.getObjectByName("Charm_Bobo"), PORTAL_COLOURS.bobo);
    C = prepCharacter(can, 0.56, K.getObjectByName("Charm_Eclipse"), PORTAL_COLOURS.can);
    PADS = { bobo: pad(0.42), can: pad(0.3) };
    SPOT = { bobo: new THREE.Vector3(-0.36, FLOOR_Y, 0.62), can: new THREE.Vector3(0.42, FLOOR_Y, 0.58) };
    PADS.bobo.position.copy(SPOT.bobo); PADS.can.position.copy(SPOT.can);
    for (const p of Object.values(PADS)) { p.visible = false; right.add(p); setLayer(p, POP); }
    flashB = sprite(glowTex, 0.01); flashC = sprite(glowTex, 0.01);
    right.add(flashB, flashC);
    setLayer(flashB, POP); setLayer(flashC, POP);
    ar.ready = true;
    if (at === "ar" && arWas === "wait") arWas = arStart();
  }
  function prepCharacter(gltf, height, charm, colours) {
    const root = new THREE.Group();
    const m = gltf.scene;
    const sil = takeSilhouette(m, charm, colours);
    const mixer = new THREE.AnimationMixer(m);
    const clips = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
    const restClip = clips.Sit || clips.Idle;
    if (restClip) { mixer.clipAction(restClip).play(); mixer.setTime(0); }
    m.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m, true);
    const h = box.max.y - box.min.y;
    mixer.stopAllAction();
    m.scale.setScalar(height / h);
    root.add(m);
    root.visible = false;
    right.add(root);
    m.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    setLayer(root, POP);
    return { root, model: m, mixer, clips, current: null, baseScale: height / h, height, sil, fx: { glow: 0, portal: 0, black: 0, shake: 0 } };
  }
  function takeSilhouette(m, charm, colours) {
    const sil = m.getObjectByName("Silhouette");
    if (!sil) return null;
    sil.updateMatrix();
    const local = sil.matrix.clone();
    sil.removeFromParent();
    const print = charm.getObjectByName(charm.name + "_Print_Front");
    print.geometry.computeBoundingBox();
    const bb = print.geometry.boundingBox;
    const c = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3());
    const map = sil.material.map;
    map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
    map.needsUpdate = true;
    const aspect = sz.x / sz.y;
    sil.material = portalMaterial(bakeMask(renderer, map, aspect), aspect, ...colours);
    sil.renderOrder = 5;
    sil.visible = false;
    sil.position.set(c.x, c.y, c.z + 0.012);
    sil.quaternion.identity();
    sil.scale.set(sz.x, sz.y, 1);
    print.add(sil);
    return { mesh: sil, local };
  }
  function play(ch, name, { loop = true, fade = 0.25, onDone } = {}) {
    const clip = ch.clips[name];
    if (!clip) return;
    const next = ch.mixer.clipAction(clip);
    next.reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.enabled = true;
    next.setEffectiveWeight(1);
    if (ch.current && ch.current !== next && fade > 0) next.crossFadeFrom(ch.current, fade, false);
    else if (ch.current && ch.current !== next) ch.current.stop();
    next.play();
    ch.current = next;
    if (onDone) {
      const h = (e) => { if (e.action === next) { ch.mixer.removeEventListener("finished", h); onDone(); } };
      ch.mixer.addEventListener("finished", h);
    }
  }
  // where a character lies flat over its printed charm, in the keychain group's own space
  const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _gi = new THREE.Matrix4(), _fwd = new THREE.Vector3();
  function charmPose(ch) {
    right.updateMatrixWorld(true);
    ch.sil.mesh.updateWorldMatrix(true, false);
    _inv.makeScale(ch.baseScale, ch.baseScale, ch.baseScale).multiply(ch.sil.local).invert();
    _gi.copy(right.matrixWorld).invert();
    _m.copy(_gi).multiply(ch.sil.mesh.matrixWorld).multiply(_inv);
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
    _m.decompose(pos, quat, scl);
    _fwd.set(0, 0, 1).applyQuaternion(quat);
    pos.addScaledVector(_fwd, 0.02);
    return { pos, quat, s: scl.y };
  }
  function arReset() {
    if (!ar.ready) return;
    ar.tweens.length = 0;
    ar.state = "idle";
    for (const ch of [B, C]) {
      ch.mixer.stopAllAction(); ch.current = null; ch.root.visible = false;
      ch.root.quaternion.identity(); ch.root.scale.setScalar(1);
      ch.sil.mesh.visible = false;
      Object.assign(ch.fx, { glow: 0, portal: 0, black: 0, shake: 0 });
    }
    PADS.bobo.visible = PADS.can.visible = false;
    flashB.material.opacity = flashC.material.opacity = 0;
  }
  function arStart() {
    if (!ar.ready) { say("Opening the camera…"); return "wait"; }
    arReset();
    ar.state = "popping";
    say(L.narrow ? "Opening the portals…" : "Keychain found. Opening the portals…");
    // the build-up: a border lights round each charm, the light throbs, and the charm opens into a portal
    for (const ch of [B, C]) ch.sil.mesh.visible = true;
    tween(reduce ? 0.01 : PORTAL_S, (k) => {
      for (const ch of [B, C]) {
        ch.fx.glow = easeOut(k * 2.2) * (0.8 + 0.35 * k);
        ch.fx.portal = reduce ? 1 : easeInOut((k - 0.22) / 0.55);
        ch.fx.shake = reduce ? 0 : easeInOut(k * 1.5) * (0.4 + 0.9 * k);
      }
    }, () => {
      say("");
      launch(C, SPOT.can, flashC, PADS.can);
      after(reduce ? 0.01 : 0.55, () => launch(B, SPOT.bobo, flashB, PADS.bobo));
    });
    return true;
  }
  function launch(ch, spot, flash, pd) {
    const isBobo = ch === B, fx = ch.fx;
    ch.root.visible = true;
    ch.sil.mesh.visible = true;
    play(ch, "PopOut", { loop: false, fade: 0, onDone: () => {
      if (isBobo) {
        play(B, "TailWag", { loop: false, fade: 0.25, onDone: () => play(B, "Sit", { fade: 0.3 }) });
        ar.state = "ready";
        say("Bobo's off the chain! Tap him to say hi", 5);
      } else play(ch, "Idle", { fade: 0.3 });
    } });
    const pop = ch.current;
    pop.paused = true;
    const place = (wig) => {
      const p = charmPose(ch);
      ch.root.position.copy(p.pos); ch.root.quaternion.copy(p.quat); ch.root.scale.setScalar(p.s);
      if (wig) ch.root.rotateZ(wig);
      return p;
    };
    place(0);
    ch.mixer.update(0);
    tween(reduce ? 0.01 : 0.38, (k) => {
      fx.black = Math.max(fx.black, Math.min(k * 4, 1)); fx.shake = 1 + k;
      place(Math.sin(k * Math.PI * 5) * 0.05 * k);
    }, () => {
      const from = place(0);
      fx.black = 1; fx.shake = 0;
      const portal0 = fx.portal, glow0 = fx.glow;
      pop.paused = false;
      pd.visible = true;
      flash.position.copy(from.pos);
      flash.position.z += 0.08;
      const q1 = new THREE.Quaternion();
      tween(reduce ? 0.01 : 1.0, (k) => {
        const e = easeOut(k);
        ch.root.position.lerpVectors(from.pos, spot, e);
        ch.root.position.y += Math.sin(k * Math.PI) * 0.45;
        ch.root.quaternion.slerpQuaternions(from.quat, q1, easeOut(k * 2));
        ch.root.scale.setScalar(lerp(from.s, 1, e));
        const f = Math.sin(Math.min(k * 1.6, 1) * Math.PI);
        flash.scale.setScalar(0.9 * f + 0.001);
        flash.material.opacity = f;
        pd.scale.setScalar(0.2 + 0.8 * easeOut(k * 1.3));
        pd.userData.ring.material.opacity = easeOut(k);
        fx.portal = lerp(portal0, PORTAL_REST, easeInOut(k));   // the portal stays open behind it, its rim softly lit
        fx.glow = lerp(Math.max(glow0, 1) * (1 + 0.8 * Math.sin(Math.min(k * 3, 1) * Math.PI)), GLOW_REST, easeInOut(k));
      });
    });
  }
  function arFrame(dt) {
    if (!ar.ready) return;
    for (let i = ar.tweens.length - 1; i >= 0; i--) {
      const w = ar.tweens[i];
      if (!w) continue;
      w.t += dt;
      const k = Math.min(w.t / w.dur, 1);
      w.fn(k);
      if (k >= 1) { const j = ar.tweens.indexOf(w); if (j >= 0) ar.tweens.splice(j, 1); w.done && w.done(); }
    }
    if (!reduce) K.rotation.z = Math.sin(clock * 1.3) * 0.035;
    for (const ch of [B, C]) {
      const uni = ch.sil.mesh.material.uniforms, fx = ch.fx;
      const throb = 1 + Math.min(fx.shake, 1.5) * 0.35 * Math.sin(clock * 22);
      uni.uTime.value = clock; uni.uGlow.value = fx.glow * (0.86 + 0.14 * Math.sin(clock * 5)) * throb;
      uni.uPortal.value = fx.portal; uni.uBlack.value = fx.black;
    }
    B.mixer.update(dt);
    C.mixer.update(dt);
    for (const p of Object.values(PADS)) p.userData.ring.rotation.z += dt * 0.6;
  }
  // a tap on the phone's screen: Bobo waves, the can spins
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function tapScreen(x, y) {
    if (at !== "ar" || ar.state !== "ready") return;
    ndc.set((x / L.w) * 2 - 1, -(y / L.h) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = (ch) => ray.ray.intersectsBox(new THREE.Box3().setFromObject(ch.root));
    if (hit(B)) play(B, "PawRaise", { loop: false, fade: 0.2, onDone: () => play(B, "Sit", { fade: 0.3 }) });
    else if (hit(C)) {
      const r0 = C.root.rotation.y, y0 = SPOT.can.y;
      tween(0.9, (k) => { C.root.rotation.y = r0 + Math.PI * 2 * easeInOut(k); C.root.position.y = y0 + Math.sin(k * Math.PI) * 0.18; });
    } else play(B, "TailWag", { loop: false, fade: 0.2, onDone: () => play(B, "Sit", { fade: 0.3 }) });
  }

  window.__tw = { go, get u() { return u; }, get uv() { return uv; }, get locked() { return locked; }, get stillT() { return stillT; }, get at() { return at; }, game, ar, step(n = 60) { for (let i = 0; i < n; i++) frame(performance.now()); } };
}

// ------------------------------------------------------------------ effects for the pop-out
// The charm portal, the same shader as Off the Chain (/evade/keychain-ar/main.js): a border lights up round
// the charm's cut-out, then it opens into a swirl in that charm's colours, and stays open once the character is out.
const HALO_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D map; uniform float uAspect;
  void main() {
    float halo = 0.0;
    for (int i = 0; i < 12; i++) {
      float an = float(i) * 0.5236; vec2 d = vec2(cos(an), sin(an) * uAspect);
      halo += texture2D(map, vUv + d * 0.022).a + texture2D(map, vUv + d * 0.05).a * 0.7;
    }
    gl_FragColor = vec4(texture2D(map, vUv).a, halo / 20.4, 0.0, 1.0);
  }`;
const PORTAL_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D map; uniform float uTime, uGlow, uPortal, uBlack, uAspect;
  uniform vec3 uA, uB, uC;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  // value noise that repeats every P cells across (and every 256 down, which also keeps the hash inputs small)
  float noise(vec2 p, float P) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float x0 = mod(i.x, P), x1 = mod(i.x + 1.0, P), y0 = mod(i.y, 256.0), y1 = mod(i.y + 1.0, 256.0);
    return mix(mix(hash(vec2(x0, y0)), hash(vec2(x1, y0)), f.x), mix(hash(vec2(x0, y1)), hash(vec2(x1, y1)), f.x), f.y); }
  float fbm(vec2 p, float P) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p, P); p = p * 2.0 + 7.1; P *= 2.0; a *= 0.5; } return v; }
  void main() {
    vec2 m = texture2D(map, vUv).rg; float a = m.r, halo = m.g;
    vec2 q = (vUv - 0.5) * vec2(1.0, 1.0 / uAspect); float r = length(q), ang = atan(q.y, q.x);
    float rim = smoothstep(0.0, 0.55, halo) * (1.0 - a);                    // outside the cut-out
    float edge = a * (1.0 - smoothstep(0.55, 1.0, halo));                   // just inside it
    float sweep = 0.5 + 0.5 * sin(ang * 2.0 - uTime * 3.2);
    vec3 rimCol = mix(uA, uC, sweep) * (1.1 + 0.5 * sin(uTime * 9.0 + ang * 5.0));
    // portal: a spiral falling into the middle (8 and 16 noise cells round the circle: seamless)
    float sw = ang + 1.6 / (r + 0.18) - uTime * 1.5;
    float n = fbm(vec2(sw * 1.27324, r * 5.0 - uTime * 0.9), 8.0);
    float n2 = fbm(vec2(sw * 2.54648 + 3.0, r * 9.0 + uTime * 0.6), 16.0);
    vec3 pc = mix(uB * 0.35, uA, smoothstep(0.25, 0.75, n));
    pc = mix(pc, uC, smoothstep(0.55, 0.9, n2) * 0.8);
    pc += vec3(1.0) * pow(n * n2 * 2.2, 3.0) * 0.9;                         // sparks in the swirl
    pc *= mix(0.12, 1.25, smoothstep(0.0, 0.42, r));                        // dark at the centre: it has depth
    pc += rimCol * edge * 1.4;
    float inA = a * max(uBlack, uPortal);
    vec3 inside = pc * uPortal * a + rimCol * edge * uGlow * 0.9 * a;
    vec3 glow = rimCol * rim * uGlow * 1.5;
    gl_FragColor = vec4(inside + glow, inA);                                // premultiplied: the glow is additive
  }`;
// mask picture -> a small texture holding the mask (red) and its halo (green), rendered once on the GPU
function bakeMask(renderer, map, aspect) {
  const img = map.image || {}; const k = Math.min(1, 512 / Math.max(img.width || 512, img.height || 512));
  const rt = new THREE.WebGLRenderTarget(Math.max(2, Math.round((img.width || 512) * k)), Math.max(2, Math.round((img.height || 512) * k)), { depthBuffer: false });
  const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: map }, uAspect: { value: aspect } }, fragmentShader: HALO_FRAG,
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }", depthTest: false, depthWrite: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
  const sc = new THREE.Scene(); sc.add(quad);
  const prev = renderer.getRenderTarget(); renderer.setRenderTarget(rt); renderer.render(sc, new THREE.Camera()); renderer.setRenderTarget(prev);
  quad.geometry.dispose(); mat.dispose();
  return rt.texture;
}
function portalMaterial(baked, aspect, a, b, c) {
  const m = new THREE.ShaderMaterial({
    uniforms: { map: { value: baked }, uTime: { value: 0 }, uGlow: { value: 0 }, uPortal: { value: 0 }, uBlack: { value: 0 }, uAspect: { value: aspect },
      uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) }, uC: { value: new THREE.Color(c) } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: PORTAL_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  return m;
}
const PORTAL_COLOURS = { bobo: [0xff9a3c, 0xffd28a, 0x6fb6ff], can: [0x4fc3ff, 0x8a1f6e, 0xff6ad5], old: [0xe2574a, 0xf4c5b2, 0x3a4ad0] };   // the cat"s oranges and visor blue; the can"s blue and magenta

function radialTexture(stops) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const glowTex = radialTexture([[0, "rgba(255,255,255,1)"], [0.25, "rgba(255,230,160,.8)"], [0.6, "rgba(246,195,68,.25)"], [1, "rgba(0,0,0,0)"]]);
const padTex = radialTexture([[0, "rgba(246,195,68,0)"], [0.62, "rgba(246,195,68,0)"], [0.7, "rgba(246,195,68,.9)"], [0.78, "rgba(63,230,224,.45)"], [1, "rgba(0,0,0,0)"]]);
const shadowTex = radialTexture([[0, "rgba(0,0,0,.55)"], [1, "rgba(0,0,0,0)"]]);
function sprite(tex, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(size);
  return s;
}
function pad(r) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.CircleGeometry(r, 64), new THREE.MeshBasicMaterial({ map: padTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const sh = new THREE.Mesh(new THREE.CircleGeometry(r * 0.75, 48), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  ring.rotation.x = sh.rotation.x = -Math.PI / 2;
  sh.position.y = 0.002;
  g.add(sh, ring);
  g.userData.ring = ring;
  return g;
}

// ------------------------------------------------------------------ the mini game (the homepage hero's Cola Run)
// Bobo on a board, three cans drop in, collect them for the reward. Joystick or arrow keys; when nobody is
// steering, Bobo heads for the nearest can himself.
class BoboGame {
  constructor(accent) {
    this.accent = accent;
    this.root = new THREE.Group();
    this.board = new THREE.Group();
    this.board.rotation.x = 0.42;
    this.root.add(this.board);
    const shadowDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.55 }));
    shadowDisc.rotation.x = -Math.PI / 2;
    this.board.add(shadowDisc);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.11, 32), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.45, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.004;
    this.board.add(this.shadow);
    this.ready = false;
    this.cans = []; this.bursts = [];
    this.pos = new THREE.Vector2(0, 0.15); this.vel = new THREE.Vector2(); this.heading = 0;
    this.score = 0; this.needSpawn = true; this.done = false; this.auto = false;
    this.stick = null; this.onScore = () => {}; this.onDone = () => {};
  }
  setModels(b, anims, c) {
    const bobo = fit(cloneSkinned(b.scene), 1);
    bobo.traverse((o) => (o.frustumCulled = false));
    const box = new THREE.Box3().setFromObject(bobo);
    bobo.scale.multiplyScalar(0.42 / (box.max.y - box.min.y));
    const box2 = new THREE.Box3().setFromObject(bobo);
    bobo.position.y -= box2.min.y;
    const holder = new THREE.Group();
    holder.add(bobo);
    this.bobo = holder;
    this.board.add(holder);
    this.mixer = new THREE.AnimationMixer(bobo);
    const clip = (n) => anims.find((a) => a.name === n);
    const ic = clip("Idle") || clip("Chill") || anims[0];
    const rc = clip("Run") || clip("Walk") || anims[1];
    if (ic) { this.idle = this.mixer.clipAction(ic); this.idle.play(); }
    if (rc) { this.run = this.mixer.clipAction(rc); this.run.play(); this.run.setEffectiveWeight(0); }
    const can = fit(cloneSkinned(c.scene), 1);
    can.traverse((o) => (o.frustumCulled = false));
    const cb = new THREE.Box3().setFromObject(can);
    can.scale.multiplyScalar(0.2 / (cb.max.y - cb.min.y));
    const cb2 = new THREE.Box3().setFromObject(can);
    can.position.y -= cb2.min.y;
    this.canTpl = new THREE.Group();
    this.canTpl.add(can);
    setLayer(this.root, POP);
    this.ready = true;
  }
  reset() {
    for (const c of this.cans) this.board.remove(c.obj);
    this.cans = [];
    for (const b of this.bursts) { this.board.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose(); }
    this.bursts = [];
    this.pos.set(0, 0.15); this.vel.set(0, 0); this.heading = 0;
    this.score = 0; this.done = false; this.needSpawn = true;
    this.onScore(0);
  }
  spawnAll() {
    if (!this.canTpl) return;
    const a0 = Math.random() * Math.PI * 2;
    for (let i = 0; i < CANS; i++) {
      const a = a0 + (i / CANS) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const r = 0.5 + Math.random() * 0.18;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const obj = cloneSkinned(this.canTpl);
      setLayer(obj, POP);
      obj.position.set(x, 0.9, z);
      obj.rotation.y = Math.random() * 6;
      obj.visible = false;
      this.board.add(obj);
      this.cans.push({ obj, x, z, state: "drop", t: -(0.45 + i * 0.22) });
    }
  }
  burst(x, z) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.0, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(this.accent).multiplyScalar(2), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.01, z);
    m.layers.set(POP);
    this.board.add(m);
    this.bursts.push({ m, t: 0 });
  }
  update(dt, t, live) {
    if (!this.ready || !this.bobo) return;
    if (live && this.needSpawn) { this.needSpawn = false; this.spawnAll(); }
    const st = this.stick;
    const dir = new THREE.Vector2();
    let speed = 0.95;
    if (live && st && (st.active || t - st.at < 3.5)) {
      dir.set(st.x, -st.y);
      if (dir.length() > 1) dir.normalize();
    } else if (live && this.auto) {
      const near = this.cans.filter((c) => c.state === "idle")
        .sort((a, b) => Math.hypot(a.x - this.pos.x, a.z - this.pos.y) - Math.hypot(b.x - this.pos.x, b.z - this.pos.y))[0];
      if (near) {
        dir.set(near.x - this.pos.x, near.z - this.pos.y);
        if (dir.length() > 0.02) dir.normalize();
        speed = 0.6;
      }
    }
    this.vel.lerp(dir.multiplyScalar(speed), 1 - Math.exp(-10 * dt));
    this.pos.addScaledVector(this.vel, dt);
    const r = this.pos.length();
    if (r > 0.84) this.pos.multiplyScalar(0.84 / r);
    const v = this.vel.length();
    if (v > 0.05) {
      const want = Math.atan2(this.vel.x, this.vel.y);
      let d = want - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * (1 - Math.exp(-12 * dt));
    }
    this.bobo.position.set(this.pos.x, 0, this.pos.y);
    this.bobo.rotation.set(-0.22, this.heading, 0, "XYZ");
    this.shadow.position.set(this.pos.x, 0.004, this.pos.y);
    const w = clamp01(v / 0.45);
    this.idle && this.idle.setEffectiveWeight(1 - w);
    if (this.run) { this.run.setEffectiveWeight(w); this.run.timeScale = 0.7 + v * 0.6; }
    this.mixer && this.mixer.update(dt);
    for (const c of [...this.cans]) {
      c.t += dt;
      if (c.state === "drop") {
        const k = clamp01(c.t / 0.55);
        c.obj.position.y = (1 - k * k) * 0.9;
        c.obj.visible = c.t >= 0;
        if (k >= 1) { c.state = "idle"; c.t = 0; }
      } else if (c.state === "idle") {
        c.obj.rotation.x = -0.22;
        c.obj.rotation.y += dt * 2.2;
        c.obj.position.y = 0.02 + Math.sin(t * 3 + c.x * 9) * 0.015;
        if (live && Math.hypot(c.x - this.pos.x, c.z - this.pos.y) < 0.15) {
          c.state = "pop"; c.t = 0;
          this.score += 1;
          this.onScore(this.score);
          this.burst(c.x, c.z);
        }
      } else {
        const k = clamp01(c.t / 0.3);
        c.obj.scale.setScalar(Math.max(1e-3, 1 + k * 0.4 - k * k * 1.4));
        c.obj.position.y = 0.02 + k * 0.25;
        c.obj.rotation.y += dt * 14;
        if (k >= 1) { this.board.remove(c.obj); this.cans.splice(this.cans.indexOf(c), 1); }
      }
    }
    if (!this.done && this.score >= CANS && this.cans.length === 0) { this.done = true; this.onDone(); }
    for (const b of [...this.bursts]) {
      b.t += dt;
      const k = clamp01(b.t / 0.45);
      b.m.scale.setScalar(0.08 + k * 0.32);
      b.m.material.opacity = 1 - k;
      if (k >= 1) { this.board.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose(); this.bursts.splice(this.bursts.indexOf(b), 1); }
    }
  }
}
