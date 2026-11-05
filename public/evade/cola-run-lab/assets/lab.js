// Cola Run lab: the real Cola Run game (OrbHuntGame.ts, the exact file that
// goes into Mattercraft) running in plain three.js, so its menu, intro, HUD,
// lounge bar and modals can be tried in a browser. orb-hunt-game.js is
// generated from mattercraft/cola-run/OrbHuntGame.ts with a small stand-in for
// @zcomponent/* (mattercraft/lab-shim/zcomponent.ts).
//
// The recorder is the same one the Mattercraft component uses (capture-core.js
// is generated from mattercraft/cola-run/CaptureCore.ts). The renderer is set
// up like Mattercraft's (alpha, no preserveDrawingBuffer) and the recorder is
// fed right after each render, the way the component's useOnAfterRender does.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { ColaCapture, DEFAULT_SETTINGS } from "./capture-core.js?v=3";
import { OrbHuntGame, LabContext } from "./orb-hunt-game.js?v=1";
import { CollectorHub } from "/labs/collector-hub/hub-core.js?v=8";
import { mountViewControls } from "/labs/collector-hub/view-controls.js?v=1";

const $ = (s) => document.querySelector(s);
const canvas = $("#c");
const overlay = $("#zcomponent-overlay");
const qs = new URLSearchParams(location.search);

/* ── log ── */
const logEl = $("#log");
function log(msg, href) {
  const li = document.createElement("li");
  li.textContent = `${new Date().toLocaleTimeString()}  ${msg} `;
  if (href) {
    const a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "open";
    li.appendChild(a);
  }
  logEl.prepend(li);
  console.log("[lab]", msg);
}

/* ── renderer, like Mattercraft's ── */
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  preserveDrawingBuffer: false,
});
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);

function sky() {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, "#5fb7e8");
  gr.addColorStop(0.55, "#bfe6f2");
  gr.addColorStop(1, "#f4e6c8");
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const skyTex = sky();
scene.background = skyTex;
scene.add(new THREE.HemisphereLight(0xffffff, 0x7a6a55, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(4, 8, 3);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(20, 72),
  new THREE.MeshStandardMaterial({ color: 0x8fcf7a, roughness: 0.95 }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const ring = new THREE.Mesh(
  new THREE.RingGeometry(19.6, 20, 120),
  new THREE.MeshBasicMaterial({ color: 0x4fd6e8, transparent: true, opacity: 0.7 }),
);
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.01;
scene.add(ring);

/* ── models ── */
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const player = new THREE.Group();
scene.add(player);
let mixer = null;
let runAct = null;
let idleAct = null;
const emoteActs = {};
let emote = null;
const BOBO_URL = "/roblox/activated-retail/models/catrun.glb?v=2";
const COLA_URL = "/roblox/activated-retail/models/cola.glb?v=2";

async function loadModels() {
  const bobo = await loader.loadAsync(BOBO_URL);
  const b = bobo.scene;
  fit(b, 1.1);
  player.add(b);
  mixer = new THREE.AnimationMixer(b);
  const clip = (n) => bobo.animations.find((a) => a.name === n);
  runAct = clip("Run") && mixer.clipAction(clip("Run"));
  idleAct = clip("Idle") && mixer.clipAction(clip("Idle"));
  idleAct?.play();
  runAct?.play();
  runAct && (runAct.weight = 0);
  for (const n of ["Sleep", "Alert", "Purr"]) {
    const c = clip(n);
    if (!c) continue;
    const a = mixer.clipAction(c);
    a.weight = 0;
    a.play();
    emoteActs[n] = a;
  }
}

/** Bobo's lounge poses: what the game's lounge timelines play in Mattercraft. */
function setEmote(name) {
  emote = name && emoteActs[name] ? name : null;
  if (emote) emoteActs[emote].reset();
}

function fit(obj, height) {
  const box = new THREE.Box3().setFromObject(obj);
  const s = height / Math.max(1e-3, box.max.y - box.min.y);
  obj.scale.setScalar(s);
  const b2 = new THREE.Box3().setFromObject(obj);
  obj.position.y -= b2.min.y;
}

/* ── audio: one context for the game and the recorder ──
   Mattercraft resumes its shared AudioContext on the first tap; so does this. */
const ac = new (window.AudioContext || window.webkitAudioContext)();
const gameBus = ac.createGain(); // the game's audio layer
gameBus.connect(ac.destination);
const unlockAudio = () => ac.state === "suspended" && ac.resume().catch(() => undefined);
addEventListener("pointerdown", unlockAudio, { capture: true });
addEventListener("keydown", unlockAudio, { capture: true });

/* ── camera background (optional) ── */
let camStream = null;
async function useCamera(on) {
  if (!on) {
    for (const t of camStream?.getTracks() ?? []) t.stop();
    camStream = null;
    scene.background = skyTex;
    ground.visible = true;
    return;
  }
  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
    const v = document.createElement("video");
    v.playsInline = true;
    v.muted = true;
    v.srcObject = camStream;
    await v.play();
    const t = new THREE.VideoTexture(v);
    t.colorSpace = THREE.SRGBColorSpace;
    scene.background = t;
    ground.visible = false;
    log("camera on");
  } catch (e) {
    log(`camera unavailable (${e?.name || e})`);
  }
}

/* ── input: keys + joystick ── */
const keys = new Set();
addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  keys.add(e.key.toLowerCase());
  if (e.key.toLowerCase() === "r" && !inRoom()) capture.toggle(); // handy on desktop
});
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
const stick = $("#stick");
const knob = stick.querySelector("span");
const stickV = new THREE.Vector2();
let stickId = null;
stick.addEventListener("pointerdown", (e) => {
  stickId = e.pointerId;
  stick.setPointerCapture(e.pointerId);
  moveStick(e);
});
stick.addEventListener("pointermove", (e) => e.pointerId === stickId && moveStick(e));
const endStick = (e) => {
  if (e.pointerId !== stickId) return;
  stickId = null;
  stickV.set(0, 0);
  knob.style.transform = "";
};
stick.addEventListener("pointerup", endStick);
stick.addEventListener("pointercancel", endStick);
function moveStick(e) {
  const r = stick.getBoundingClientRect();
  const x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
  const y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
  stickV.set(x, y);
  if (stickV.length() > 1) stickV.normalize();
  knob.style.transform = `translate(${stickV.x * 34}px,${stickV.y * 34}px)`;
}

/* ── the recorder (the thing under test) ── */
const capture = new ColaCapture({
  canvas,
  host: overlay,
  endpoint: qs.get("endpoint") || location.origin,
  globeUrl: "/evade/where-is-bobo/",
  source: "cola-run-lab",
  audioContext: ac,
  connectAudio: (dest) => {
    if (!$("#o-audio").checked) return () => undefined;
    gameBus.connect(dest);
    return () => gameBus.disconnect(dest);
  },
  isXR: () => false,
  on: (name, p) => {
    if (name === "recordStop")
      log(
        `recorded ${p.seconds}s, ${(p.blob.size / 1048576).toFixed(1)} MB ${p.mime} ${p.width}x${p.height}`,
      );
    else if (name === "sent") {
      log(`sent: asset ${p.id}${p.review ? " (in review)" : " (live)"}`, `/admin/media?asset=${p.id}`);
      log("watch it on the globe", p.globeUrl);
    }
    else if (name === "error") log(`error (${p.stage}): ${p.message}`);
    else log(name);
  },
});


/* ── the game: the real OrbHuntGame, in a stand-in Mattercraft context ── */
const ctx = new LabContext({ overlay, camera, audioContext: ac, audioLayer: gameBus, loader });
ctx.addNode("player", player);
// The lounge timelines Bobo's buttons point at in Mattercraft.
const EMOTE_FOR = { "lounge-sleep": "Sleep", "lounge-excited": "Alert", "lounge-purr": "Purr" };
for (const [id, name] of Object.entries(EMOTE_FOR))
  ctx.addClip(id, { play: () => setEmote(name), stop: () => emote === name && setEmote(null) });

const game = new OrbHuntGame(ctx, { maxOrbs: 32, orbDetail: 32, pickupModel: COLA_URL });
scene.add(game.element);
// The settings the EVADE scene uses in Mattercraft; everything else stays at
// the component's defaults, so the menu and copy are what players will see.
game.playerNode.value = "player";
game.pickupKind.value = "model";
game.placementEnabled.value = qs.has("place"); // AR placement means nothing in a browser tab
game.logoImage.value = "/brand/medialife-wordmark.webp";
game.introImage.value = "/evade/cola-run-lab/assets/cola-run-intro.webp";
game.lounge1Timeline.value = "lounge-sleep";
game.lounge2Timeline.value = "lounge-excited";
game.lounge3Timeline.value = "lounge-purr";

// What ColaRunRecorder does with the game's events.
let hud = {};
const pushHud = () => capture.setHud({ ...hud });
const hint = () => capture.showHint(qs.has("hint"));
const target = () => Number(game.targetCount.value) || undefined;
game.onGameStart.addListener(() => {
  hud = { score: 0, target: target() };
  pushHud();
  hint();
  showModeButton(false);
  log("round started");
});
game.onLoungeEnter.addListener(() => {
  hud = { badge: "Lounging with Bobo" };
  pushHud();
  hint();
  if (!hubOn) showModeButton(true);
  log("lounge entered");
});
game.onLoungeExit.addListener(() => {
  hud = {};
  pushHud();
  setEmote(null);
  showModeButton(false);
  log("lounge exited");
});
game.onOrbCollected.addListener((e) => {
  hud = { ...hud, score: Number(e?.score) || 0, target: Number(e?.target) || target() };
  pushHud();
});
game.onTargetReached.addListener(() => {
  hud = { ...hud, badge: "Run complete!" };
  pushHud();
  log("run complete");
});
game.onTimeUp.addListener(() => {
  hud = { ...hud, badge: "Time's up" };
  pushHud();
  log("time up");
});
game.onLoungeAction.addListener((e) => log(`lounge: ${e.label}`));
for (const n of ["onPortalOpen", "onRewardShown", "onRewardModalShown", "onClaimed", "onReplay", "onGameReset"])
  game[n].addListener(() => log(n.replace(/^on/, "").replace(/[A-Z]/g, (c) => " " + c.toLowerCase()).trim()));

/* ── Bobo's Hideout: the Collector Hub as a game mode ──
   Same core as the Mattercraft component (hub-core.js is generated from
   mattercraft/cola-run/HubCore.ts). Tap the mode → unlock (first time) → the
   portal appears ahead of Bobo → walk him into it → his room builds around
   him. The OS's Cola Run app brings you back here to play or record. */
const hub = new CollectorHub({
  parent: scene,
  host: overlay,
  canvas,
  getCamera: () => camera,
  loader,
  api: qs.get("endpoint") || "",
  modelUrl: "/hub/evade/room.glb",
  globeUrl: "/evade/where-is-bobo/index.html",
  testHint: qs.has("test") ? "BOBO-TEST-CATS" : null,
  hubCode: qs.get("hub"),
  exitLabel: "Back to Cola Run",
  on: (name, p) => {
    log(`hub: ${name}${typeof p === "string" ? " " + p : ""}`);
    if (name === "exit") leaveHideout();
    else if (name === "signedOut") leaveHideout();
    else if (name === "play") leaveHideout(p.record ? "record" : "play");
    else if (name === "portal") hub.prompt("Walk Bobo into the portal");
    else if (name === "focus") {
      // The welcome tour: aim the room camera at each stop.
      resetOrbit();
      if (p) {
        const f = hub.focus();
        orbit.pan.copy(p.target).sub(f.target);
        const base =
          (f.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2)) * (camera.aspect < 0.8 ? 1.1 : 0.8);
        orbit.zoom = Math.min(1, Math.max(0.2, (p.distance * (camera.aspect < 0.8 ? 1.6 : 1)) / base));
      }
    }
  },
});
let hubOn = false; // the hideout mode is active (portal or room)
let hubCam = 0; // 0 = follow cam, 1 = room cam
const hubCamPos = new THREE.Vector3();
const hubLook = new THREE.Vector3();
const orbit = { yaw: 0, pitch: 0.38, zoom: 1, pan: new THREE.Vector3() };
const resetOrbit = () => {
  orbit.yaw = 0;
  orbit.pitch = 0.38;
  orbit.zoom = 1;
  orbit.pan.set(0, 0, 0);
};
const PLAYER_H = 1.1;
const inRoom = () => hubOn && hub.state !== "portal";
function showModeButton(on) {
  hub.modeButton(on ? () => openHideout() : null);
}

async function openHideout() {
  if (hubOn) return;
  unlockAudio();
  if (!game.isLounging) game.enterLounge();
  hubOn = true;
  game.uiEnabled.value = false; // the hideout has its own UI
  showModeButton(false);
  hub.prompt("Opening the portal…");
  try {
    await hub.load();
  } catch (e) {
    log(`hub load failed: ${e?.message || e}`);
    hub.prompt(null);
    hubOn = false;
    game.uiEnabled.value = true;
    showModeButton(true);
    return;
  }
  hub.prompt(null);
  const ok = await hub.ensureAccess();
  if (!ok) {
    hubOn = false;
    game.uiEnabled.value = true;
    showModeButton(true);
    return;
  }
  // Room Bobo the same size as the player's Bobo; the portal 3.2 m ahead of him.
  hub.placeNear(player.position, camera.position, 3.2, PLAYER_H / hub.boboHeight());
  hub.showPortal();
  hub.prompt("Walk Bobo into the portal");
  stick.hidden = false;
  log("hideout: portal open");
}

function hubStep(dt) {
  hub.update(dt);
  if (!hubOn) {
    viewUi.show(false);
    hubCam = Math.max(0, hubCam - dt * 1.2);
    return;
  }
  if (hub.state === "portal" && player.visible && hub.distanceToPortal(player.position) < 0.75) {
    // Through the portal: the room's Bobo takes over and walks home.
    player.visible = false;
    stick.hidden = true;
    capture.setVisible(false);
    resetOrbit();
    hub.enter({ walk: true });
    log("hideout: entered");
  }
  const want = hub.state === "building" || hub.state === "live" || hub.state === "leaving" ? 1 : 0;
  viewUi.show(hubOn && (hub.state === "building" || hub.state === "live"));
  hubCam += (want - hubCam) * (1 - Math.exp(-2.5 * dt));
}

async function leaveHideout(then) {
  if (!hubOn) return;
  await hub.leave();
  // Bobo steps back out of the portal, towards the camera.
  const p = hub.portalPosition(new THREE.Vector3());
  const toCam = tmp.set(camera.position.x - p.x, 0, camera.position.z - p.z).normalize();
  player.position.set(p.x + toCam.x * 1.1, 0, p.z + toCam.z * 1.1);
  player.rotation.y = Math.atan2(toCam.x, toCam.z);
  player.visible = true;
  hubOn = false;
  hub.hide();
  stick.hidden = false;
  game.uiEnabled.value = true;
  capture.setVisible(true);
  log("hideout: left");
  if (then === "play" || then === "record") {
    game.startGame();
    if (then === "record") setTimeout(() => capture.status === "idle" && capture.toggle(), 400);
  } else {
    showModeButton(true);
  }
}

// In the room: drag to look around, scroll or pinch to zoom, right-drag,
// shift-drag or two fingers to move the view (taps still go to the hub).
const ZOOM_MIN = 0.35,
  ZOOM_MAX = 1.8;
const setZoom = (z) => (orbit.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)));
function panBy(dx, dy) {
  const f = hub.focus();
  const k = (f.radius * orbit.zoom * 1.6) / innerHeight;
  const right = tmp.setFromMatrixColumn(camera.matrixWorld, 0);
  orbit.pan.addScaledVector(right, -dx * k);
  orbit.pan.y += dy * k;
  if (orbit.pan.length() > f.radius * 0.75) orbit.pan.setLength(f.radius * 0.75);
}
const pointers = new Map();
let drag = null;
let pinch = null;
canvas.addEventListener("contextmenu", (e) => inRoom() && e.preventDefault());
canvas.addEventListener("pointerdown", (e) => {
  if (!inRoom()) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: orbit.zoom, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    drag = null;
  } else
    drag = {
      x: e.clientX,
      y: e.clientY,
      yaw: orbit.yaw,
      pitch: orbit.pitch,
      id: e.pointerId,
      pan: e.button === 2 || e.shiftKey,
    };
});
addEventListener("pointermove", (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d > 10) setZoom(pinch.zoom * (pinch.d / d));
    const mx = (a.x + b.x) / 2,
      my = (a.y + b.y) / 2;
    panBy(mx - pinch.mx, my - pinch.my);
    pinch.mx = mx;
    pinch.my = my;
    return;
  }
  if (!drag || e.pointerId !== drag.id) return;
  if (drag.pan) {
    panBy(e.clientX - drag.x, e.clientY - drag.y);
    drag.x = e.clientX;
    drag.y = e.clientY;
    return;
  }
  orbit.yaw = drag.yaw - (e.clientX - drag.x) * 0.006;
  orbit.pitch = Math.min(1.1, Math.max(0.05, drag.pitch + (e.clientY - drag.y) * 0.004));
});
const endPointer = (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (drag && e.pointerId === drag.id) drag = null;
};
addEventListener("pointerup", endPointer);
addEventListener("pointercancel", endPointer);
canvas.addEventListener(
  "wheel",
  (e) => {
    if (!inRoom()) return;
    e.preventDefault();
    setZoom(orbit.zoom * Math.exp(e.deltaY * 0.0012));
  },
  { passive: false },
);
const viewUi = mountViewControls({
  onZoom: (dir) => setZoom(orbit.zoom * (dir > 0 ? 0.85 : 1.18)),
  onRecenter: resetOrbit,
});

/* ── settings panel ── */
const endpointIn = $("#o-endpoint");
endpointIn.value = qs.get("endpoint") || location.origin;
$("#endpointLabel").textContent = endpointIn.value;
const applySettings = () => {
  const s = capture.settings;
  s.maxSeconds = Math.round(Math.min(60, Math.max(5, Number($("#o-max").value) || 30)));
  s.corner = $("#o-corner").value;
  s.offsetX = Number($("#o-dx").value) || 0;
  s.offsetY = Number($("#o-dy").value) || 0;
  s.watermark = $("#o-wm").checked;
  s.sendEnabled = $("#o-send").checked;
  capture.configure({ endpoint: endpointIn.value.trim().replace(/\/+$/, "") || location.origin });
  $("#endpointLabel").textContent = endpointIn.value;
  capture.apply();
};
for (const el of document.querySelectorAll(".lab-panel input, .lab-panel select"))
  el.addEventListener("change", applySettings);
$("#o-hint").addEventListener("click", () => capture.showHint(true));
$("#o-copy").addEventListener("click", async () => {
  const s = capture.settings;
  const out = {
    maxSeconds: s.maxSeconds,
    corner: s.corner,
    offsetX: s.offsetX,
    offsetY: s.offsetY,
    watermark: s.watermark,
    sendEnabled: s.sendEnabled,
    recordGameAudio: $("#o-audio").checked,
  };
  try {
    await navigator.clipboard.writeText(JSON.stringify(out, null, 2));
    log("settings copied");
  } catch {
    log(JSON.stringify(out));
  }
});
const toggle = $("#labToggle");
toggle.addEventListener("click", () => {
  const p = $("#lab");
  p.hidden = !p.hidden;
  toggle.setAttribute("aria-expanded", String(!p.hidden));
});

$("#o-hideout").addEventListener("click", () => openHideout());
$("#o-intro").addEventListener("click", () => game.showIntro());
$("#useCam").addEventListener("change", (e) => useCamera(e.target.checked));
$("#o-lounge").addEventListener("click", () => (game.isLounging ? game.startGame() : game.enterLounge()));

/* ── loop ── */
const clock = new THREE.Clock();
const tmp = new THREE.Vector3();
const camTarget = new THREE.Vector3();
function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

let moving = 0;
let lookY = 0.8;
function step() {
  const dt = Math.min(0.1, clock.getDelta());
  if (!inRoom()) {
    const mv = new THREE.Vector2(stickV.x, stickV.y);
    if (keys.has("arrowleft") || keys.has("a")) mv.x -= 1;
    if (keys.has("arrowright") || keys.has("d")) mv.x += 1;
    if (keys.has("arrowup") || keys.has("w")) mv.y -= 1;
    if (keys.has("arrowdown") || keys.has("s")) mv.y += 1;
    if (mv.length() > 1) mv.normalize();
    const speed = 5.2;
    if (mv.lengthSq() > 0.01) {
      player.position.x += mv.x * speed * dt;
      player.position.z += mv.y * speed * dt;
      const lim = 19.2;
      const d = Math.hypot(player.position.x, player.position.z);
      if (d > lim) player.position.multiplyScalar(lim / d);
      const yaw = Math.atan2(mv.x, mv.y);
      player.rotation.y +=
        (((((yaw - player.rotation.y + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) -
          Math.PI) *
        (1 - Math.exp(-12 * dt));
    }
    moving += ((mv.lengthSq() > 0.01 ? 1 : 0) - moving) * (1 - Math.exp(-10 * dt));
    if (emote && moving > 0.5) setEmote(null); // walking off ends the pose
    const em = emote ? 1 - moving : 0;
    for (const [n, a] of Object.entries(emoteActs)) a.weight = n === emote ? em : 0;
    if (runAct && idleAct) {
      runAct.weight = moving;
      idleAct.weight = (1 - moving) * (1 - em);
    }
  }
  mixer?.update(dt);
  ctx.step(dt); // triggers, then the game's onBeforeRender
  hubStep(dt);
  if (hubCam > 0.001) {
    // In the hideout: orbit the room (drag to look around), blended from the follow cam.
    const f = hub.focus();
    const yaw = f.yaw + orbit.yaw;
    const dist =
      (f.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2)) * (camera.aspect < 0.8 ? 1.1 : 0.8) * orbit.zoom;
    f.target.add(orbit.pan);
    hubCamPos.set(Math.sin(yaw) * Math.cos(orbit.pitch), Math.sin(orbit.pitch), Math.cos(yaw) * Math.cos(orbit.pitch))
      .multiplyScalar(dist).add(f.target);
    camTarget.copy(player.position).add(tmp.set(0, 5.5, 8.5)).lerp(hubCamPos, hubCam);
    camera.position.lerp(camTarget, 1 - Math.exp(-4 * dt));
    hubLook.lerp(tmp.copy(player.position).setY(player.position.y + 0.8).lerp(f.target, hubCam), 1 - Math.exp(-6 * dt));
    camera.lookAt(hubLook);
  } else {
    camTarget.copy(player.position).add(tmp.set(0, 5.5, 8.5));
    camera.position.lerp(camTarget, 1 - Math.exp(-4 * dt));
    // While lounging, aim below Bobo so he sits above the game's lounge bar.
    const wantY = game.isLounging ? (camera.aspect < 0.8 ? -1.6 : -1.1) : 0.8;
    lookY += (wantY - lookY) * (1 - Math.exp(-4 * dt));
    hubLook.set(player.position.x, player.position.y + lookY, player.position.z);
    camera.lookAt(hubLook);
  }

  renderer.render(scene, camera);
  // same moment as Mattercraft's onAfterRender
  capture.frame();
  requestAnimationFrame(step);
}

loadModels()
  .then(() => {
    // Deep links: ?mode=play|record|lounge|hideout (from the hideout's Cola Run app), ?hub=CODE (a product QR).
    // A deep link skips the intro; a plain visit gets the game's own intro.
    const mode = qs.get("mode") || (qs.get("hub") ? "hideout" : "");
    game.showIntroOnLoad.value = !mode;
    // Mattercraft finishes building the scene before the game binds its
    // player and opens the intro; same order here.
    ctx.markConstructed();
    log("scene ready");
    window.__lab.ready = true;
    if (mode === "hideout") openHideout();
    else if (mode === "lounge") game.enterLounge();
    else if (mode === "play" || mode === "record") {
      game.startGame();
      if (mode === "record") setTimeout(() => capture.status === "idle" && capture.toggle(), 600);
    }
  })
  .catch((e) => log(`model load failed: ${e?.message || e}`));
requestAnimationFrame(step);

/* ── test hook ── */
window.__lab = {
  ready: false,
  capture,
  game,
  ctx,
  DEFAULT_SETTINGS,
  play: () => game.startGame(),
  // Collect every live can through the game's own pickup path.
  collectAll: () => game._orbs.filter((o) => o.alive && o.active).forEach((o) => game._collect(o)),
  status: () => capture.status,
  state: () => ({ state: game._state, score: game._score, timeLeft: game._timeLeft, lounge: game.isLounging, emote }),
  lounge: () => game.enterLounge(),
  hub,
  hideout: () => openHideout(),
  walkTo: (x, z) => player.position.set(x, 0, z),
  player,
  emote: (n) => setEmote(n),
};
