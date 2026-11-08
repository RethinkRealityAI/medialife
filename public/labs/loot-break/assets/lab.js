/* LOOT BREAK test lab: plain three.js standing in for a Mattercraft AR scene.
   The game itself is the real component (LootBreakGame.ts), bundled with the
   lab shim by scripts/build-loot-break.mjs. The lab only adds what Mattercraft
   would give you: a camera, a renderer, a desk to stand the lane on. */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { LootBreakGame, LabContext, Observable } from "./loot-break-game.js?v=2";

const $ = (s) => document.querySelector(s);
const canvas = $("#c");
const overlay = $("#zcomponent-overlay");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
if ("outputColorSpace" in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 50);
camera.position.set(0, 0.42, 0.95);

scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2030, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(0.6, 1.4, 0.8);
scene.add(sun);

/* ── the desk ── */
const desk = new THREE.Group();
scene.add(desk);
{
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d");
  g.fillStyle = "#2b2233";
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = `rgba(255,255,255,${0.012 + Math.random() * 0.02})`;
    g.lineWidth = 1 + Math.random() * 3;
    g.beginPath();
    const y = Math.random() * 512;
    g.moveTo(0, y);
    g.bezierCurveTo(170, y + 8 - Math.random() * 16, 340, y + 8 - Math.random() * 16, 512, y);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  if ("colorSpace" in tex) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.04, 1.4),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }),
  );
  top.position.y = -0.02;
  desk.add(top);
  // A monitor behind the lane, for scale (the game is a taskbar that "fell off" it).
  const mon = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.68, 0.03),
    new THREE.MeshStandardMaterial({ color: 0x15121b, roughness: 0.4 }),
  );
  mon.position.set(0, 0.5, -0.45);
  desk.add(mon);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.14, 0.62),
    new THREE.MeshBasicMaterial({ color: 0x1d2a44 }),
  );
  screen.position.set(0, 0.5, -0.434);
  desk.add(screen);
  const stand = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.17, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x15121b }),
  );
  stand.position.set(0, 0.085, -0.46);
  desk.add(stand);
  const mug = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.04, 0.1, 24),
    new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.5 }),
  );
  mug.position.set(0.72, 0.05, 0.12);
  desk.add(mug);
}

/* ── the game ── */
let ac = null;
try {
  ac = new (window.AudioContext || window.webkitAudioContext)();
} catch {}
const unlock = () => ac && ac.state === "suspended" && ac.resume();
window.addEventListener("pointerdown", unlock, { capture: true });

const ctx = new LabContext({
  overlay,
  camera,
  audioContext: ac,
  audioLayer: ac ? ac.destination : null,
  canvas,
  renderer,
  scene,
});
const game = new LootBreakGame(ctx, {});
scene.add(game.element);

/* ── a stand-in for Zappar's User Placement Anchor Group ──
   Same observables the real one has. In AR the tracker decides when the
   phone is pointing at a surface; here it "finds" one after a second,
   unless "No surface found" is ticked in the Lab panel. ?place=0 turns
   placement off (as if the game sat outside a placement group). */
const q0 = new URLSearchParams(location.search);
const surface = { blocked: false, t: 0 };
const placer = {
  placementMode: new Observable(false),
  placementValid: new Observable(false),
  ready: new Observable(true),
  showPlaceButton: new Observable(true),
  showRestartPlacementButton: new Observable(true),
  restartPlacementMode: new Observable("place"),
  _restartPlacement() { this.placementMode.value = true; },
};
placer.placementMode.addListener((on) => {
  surface.t = 0;
  if (on) placer.placementValid.value = false;
});
if (q0.get("place") !== "0") game.parent = placer;
ctx.markConstructed();

/* ── camera ── */
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.05, 0);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 0.35;
controls.maxDistance = 2.4;
controls.maxPolarAngle = Math.PI * 0.47;

function fit() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  // Fit the 1.0-long lane across the screen, closer on wide screens.
  // Portrait phones: let the portal sit at the edge so the party stays big enough to tap.
  const halfW = (camera.aspect < 0.8 ? 0.48 : 0.62) * Math.max(1, game.sceneScale.value);
  const hFov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
  const d = THREE.MathUtils.clamp(halfW / Math.tan(hFov / 2), 0.7, 2.2);
  const dir = camera.position.clone().sub(controls.target).normalize();
  camera.position.copy(controls.target).addScaledVector(dir, d);
}
window.addEventListener("resize", fit);
fit();

/* ── camera background (optional) ── */
let video = null;
async function useCam(on) {
  if (!on) {
    video?.srcObject?.getTracks().forEach((t) => t.stop());
    video?.remove();
    video = null;
    desk.visible = true;
    return;
  }
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    video = Object.assign(document.createElement("video"), { srcObject: s, muted: true, playsInline: true, autoplay: true });
    video.className = "lab-bg";
    document.body.prepend(video);
    desk.visible = false;
  } catch (e) {
    $("#useCam").checked = false;
    $("#state").textContent = `Camera unavailable (${e?.name || e})`;
  }
}
$("#useCam").addEventListener("change", (e) => useCam(e.target.checked));

/* ── lab panel ── */
const panel = $("#lab");
$("#labToggle").addEventListener("click", () => {
  panel.hidden = !panel.hidden;
  $("#labToggle").setAttribute("aria-expanded", String(!panel.hidden));
});
for (const k of ["roundSeconds", "bossAt", "difficulty", "tierScale", "sceneScale"]) {
  const el = $(`#o-${k}`);
  const out = el.parentElement.querySelector("output");
  const set = () => {
    game[k].value = Number(el.value);
    out.textContent = el.value;
    if (k === "sceneScale") fit();
  };
  el.addEventListener("input", set);
  set();
}
for (const k of ["showTaskbar", "faceCamera", "sound"]) {
  const el = $(`#o-${k}`);
  el.addEventListener("change", () => (game[k].value = el.checked));
}
$("#b-start").addEventListener("click", () => game.startRound());
$("#b-end").addEventListener("click", () => game.endRound());
$("#b-intro").addEventListener("click", () => game.showIntro());
$("#b-boss").addEventListener("click", () => {
  const s = game.debugState;
  if (s.phase !== "playing") return;
  game.skip(Math.max(0, game.bossAt.value * game.roundSeconds.value - s.t + 0.05));
});
$("#b-replace").addEventListener("click", () => game.resetPlacement());
$("#b-nosurface").addEventListener("change", (e) => (surface.blocked = e.target.checked));
let bot = false;
$("#b-bot").addEventListener("change", (e) => (bot = e.target.checked));
// URL switches for scripted tests: ?bot=1 auto-plays, ?start=1 skips the intro.
const q = new URLSearchParams(location.search);
if (q.has("bot")) { bot = true; $("#b-bot").checked = true; }
if (q.has("start")) game.startRound();

/* ── loop ── */
let last = performance.now();
let botT = 0;
let stateT = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const st = game.debugState;
  // While a round runs, a drag would fight the taps: only zoom then.
  controls.enableRotate = st.phase !== "playing";
  controls.update();
  if (bot && st.phase === "placing" && placer.placementValid.value) game.place();
  if (bot && st.phase === "playing") {
    botT -= dt;
    if (botT <= 0) {
      botT = 0.16 + Math.random() * 0.08; // about 5 taps a second, a quick human
      game.collectAllLoot();
      game.tapFront();
    }
  }
  // Placement simulation: the lane hovers while placing and settles when placed.
  if (placer.placementMode.value) {
    surface.t += dt;
    const valid = !surface.blocked && surface.t > 1.1;
    if (placer.placementValid.value !== valid) placer.placementValid.value = valid;
    game.element.position.y = 0.04 + Math.sin(now / 300) * 0.006;
  } else {
    game.element.position.y += (0 - game.element.position.y) * Math.min(1, dt * 10);
  }
  ctx.step(dt);
  renderer.render(scene, camera);
  if ((stateT -= dt) <= 0) {
    stateT = 0.25;
    $("#state").textContent = `${st.phase}${st.placed ? "" : " (not placed)"} · ${st.t.toFixed(1)}s · ${st.score} pts · ${st.tier} · combo ${st.combo} (best ${st.bestCombo}) · party ${Math.round(st.partyHp)} HP`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__lab = { game, ctx, camera, controls, scene };
