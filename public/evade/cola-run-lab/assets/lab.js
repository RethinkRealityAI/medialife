// Cola Run recorder lab: a stand-in Cola Run scene in plain three.js, wired
// to the exact recorder the Mattercraft component uses (capture-core.js is
// generated from mattercraft/cola-run/CaptureCore.ts). The renderer is set up
// like Mattercraft's (alpha, no preserveDrawingBuffer) and the recorder is fed
// right after each render, the way the component's useOnAfterRender does.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { ColaCapture, DEFAULT_SETTINGS } from "./capture-core.js?v=2";
import { CollectorHub } from "/labs/collector-hub/hub-core.js?v=4";

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
  new THREE.CircleGeometry(14, 64),
  new THREE.MeshStandardMaterial({ color: 0x8fcf7a, roughness: 0.95 }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const ring = new THREE.Mesh(
  new THREE.RingGeometry(13.6, 14, 96),
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
const cans = [];
let canProto = null;
let canClip = null;

async function loadModels() {
  const [bobo, cola] = await Promise.all([
    loader.loadAsync("/roblox/activated-retail/models/catrun.glb"),
    loader.loadAsync("/roblox/activated-retail/models/cola.glb"),
  ]);
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
  canProto = cola.scene;
  fit(canProto, 0.9);
  canClip = cola.animations[0] ?? null;
}

function fit(obj, height) {
  const box = new THREE.Box3().setFromObject(obj);
  const s = height / Math.max(1e-3, box.max.y - box.min.y);
  obj.scale.setScalar(s);
  const b2 = new THREE.Box3().setFromObject(obj);
  obj.position.y -= b2.min.y;
}

const TARGET = 6;
function layoutCans() {
  for (const c of cans) scene.remove(c.obj);
  cans.length = 0;
  if (!canProto) return;
  for (let i = 0; i < TARGET; i++) {
    const a = (i / TARGET) * Math.PI * 2 + 0.4;
    const r = 4.5 + (i % 2) * 3.5;
    const obj = canProto.clone(true);
    const holder = new THREE.Group();
    holder.add(obj);
    holder.position.set(Math.cos(a) * r, 0.25, Math.sin(a) * r);
    scene.add(holder);
    const m = canClip ? new THREE.AnimationMixer(obj) : null;
    m?.clipAction(canClip).play();
    cans.push({ obj: holder, mixer: m, taken: false });
  }
}

/* ── audio: a small synth loop + a pickup ding through one master bus ── */
let ac = null;
let master = null;
let musicTimer = 0;
function audioStart() {
  if (ac) return;
  ac = new (window.AudioContext || window.webkitAudioContext)();
  master = ac.createGain();
  master.gain.value = 0.5;
  master.connect(ac.destination);
  let step = 0;
  let next = ac.currentTime + 0.05;
  const bass = [55, 55, 65.4, 49];
  const tick = () => {
    while (next < ac.currentTime + 0.25) {
      const beat = step % 8;
      if (beat % 2 === 0) tone(bass[(step >> 3) % 4], next, 0.22, "triangle", 0.25);
      if (beat % 2 === 1) noise(next, 0.04, 0.06);
      if (beat === 4) tone(440, next, 0.08, "square", 0.05);
      next += 0.1875;
      step++;
    }
  };
  tick();
  musicTimer = setInterval(tick, 60);
}
function tone(f, t, d, type = "sine", v = 0.2) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.value = f;
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + d + 0.02);
}
let noiseBuf = null;
function noise(t, d, v) {
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.1, ac.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  }
  const s = ac.createBufferSource();
  const g = ac.createGain();
  s.buffer = noiseBuf;
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  s.connect(g).connect(master);
  s.start(t);
}
const ding = () => {
  if (!ac) return;
  const t = ac.currentTime;
  tone(880, t, 0.12, "sine", 0.3);
  tone(1320, t + 0.07, 0.18, "sine", 0.25);
};

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

/* ── game state ── */
const ROUND = 45;
let playing = false;
let score = 0;
let timeLeft = ROUND;
let done = false;
const scoreEl = $("#score");
const timeEl = $("#time");

/* ── lounge mode: hang out with Bobo, no clock, no cans ── */
let lounge = false;
const hudEl = $(".lab-hud");
const loungeBar = $("#loungeBar");
function enterLounge() {
  lounge = true;
  playing = true;
  done = true;
  for (const c of cans) c.obj.visible = false;
  hudEl.classList.add("lab-lounging");
  loungeBar.hidden = false;
  // what the component does on the game's onLoungeEnter
  capture.setHud({ badge: "Lounging with Bobo" });
  capture.showHint(qs.has("hint"));
  if (!hubOn) showModeButton(true);
  log("lounge entered");
}
function exitLounge() {
  lounge = false;
  setEmote(null);
  hudEl.classList.remove("lab-lounging");
  loungeBar.hidden = true;
  capture.setHud(null);
  log("lounge exited");
}
function setEmote(name) {
  emote = name && emoteActs[name] ? name : null;
  if (emote) emoteActs[emote].reset();
}
for (const b of document.querySelectorAll("[data-emote]"))
  b.addEventListener("click", () => {
    setEmote(b.dataset.emote);
    log(`emote ${b.dataset.emote}`);
  });
$("#loungeExit").addEventListener("click", () => {
  exitLounge();
  startRound();
});

function startRound() {
  if (lounge) exitLounge();
  score = 0;
  timeLeft = ROUND;
  done = false;
  playing = true;
  player.position.set(0, 0, 0);
  layoutCans();
  scoreEl.textContent = `0 / ${TARGET}`;
  capture.setHud({ score: 0, target: TARGET });
  capture.showHint(qs.has("hint"));
  showModeButton(false);
  log("round started");
}

function collect(c) {
  c.taken = true;
  c.obj.visible = false;
  score++;
  ding();
  scoreEl.textContent = `${score} / ${TARGET}`;
  const hud = { score, target: TARGET };
  if (score >= TARGET) {
    done = true;
    hud.badge = "Run complete!";
    log("run complete");
  }
  capture.setHud(hud);
}

/* ── input: keys + joystick ── */
const keys = new Set();
addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  keys.add(e.key.toLowerCase());
  if (e.key.toLowerCase() === "r" && playing) capture.toggle(); // handy on desktop
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
  audioContext: null, // set on Play (needs a tap first)
  connectAudio: (dest) => {
    if (!$("#o-audio").checked || !master) return () => undefined;
    master.connect(dest);
    return () => master.disconnect(dest);
  },
  isXR: () => false,
  on: (name, p) => {
    if (name === "recordStop")
      log(
        `recorded ${p.seconds}s, ${(p.blob.size / 1048576).toFixed(1)} MB ${p.mime} ${p.width}x${p.height}`,
      );
    else if (name === "sent") log(`sent: asset ${p.id}`, `/admin/media?asset=${p.id}`);
    else if (name === "error") log(`error (${p.stage}): ${p.message}`);
    else log(name);
  },
});


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
  },
});
let hubOn = false; // the hideout mode is active (portal or room)
let hubCam = 0; // 0 = follow cam, 1 = room cam
const hubCamPos = new THREE.Vector3();
const hubLook = new THREE.Vector3();
const orbit = { yaw: 0, pitch: 0.38 };
const PLAYER_H = 1.1;
const inRoom = () => hubOn && hub.state !== "portal";
function showModeButton(on) {
  hub.modeButton(on ? () => openHideout() : null);
}

async function openHideout() {
  if (hubOn) return;
  if (!ac) {
    audioStart();
    capture.configure({ audioContext: ac });
  }
  $("#intro").hidden = true;
  if (!lounge) enterLounge();
  loungeBar.hidden = true;
  showModeButton(false);
  hubOn = true;
  hub.prompt("Opening the portal…");
  try {
    await hub.load();
  } catch (e) {
    log(`hub load failed: ${e?.message || e}`);
    hub.prompt(null);
    hubOn = false;
    loungeBar.hidden = false;
    showModeButton(true);
    return;
  }
  hub.prompt(null);
  const ok = await hub.ensureAccess();
  if (!ok) {
    hubOn = false;
    loungeBar.hidden = false;
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
    hubCam = Math.max(0, hubCam - dt * 1.2);
    return;
  }
  if (hub.state === "portal" && player.visible && hub.distanceToPortal(player.position) < 0.75) {
    // Through the portal: the room's Bobo takes over and walks home.
    player.visible = false;
    stick.hidden = true;
    hudEl.hidden = true; // the room has its own top bar
    capture.setVisible(false);
    orbit.yaw = 0;
    orbit.pitch = 0.38;
    hub.enter({ walk: true });
    log("hideout: entered");
  }
  const want = hub.state === "building" || hub.state === "live" || hub.state === "leaving" ? 1 : 0;
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
  hudEl.hidden = false;
  capture.setVisible(true);
  log("hideout: left");
  if (then === "play" || then === "record") {
    startRound();
    if (then === "record") setTimeout(() => capture.status === "idle" && capture.toggle(), 400);
    showModeButton(false);
  } else {
    loungeBar.hidden = false;
    showModeButton(true);
  }
}

// Drag to look around the room (taps still go to the hub).
let drag = null;
canvas.addEventListener("pointerdown", (e) => {
  if (inRoom()) drag = { x: e.clientX, y: e.clientY, yaw: orbit.yaw, pitch: orbit.pitch, id: e.pointerId };
});
addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  orbit.yaw = drag.yaw - (e.clientX - drag.x) * 0.006;
  orbit.pitch = Math.min(1.1, Math.max(0.05, drag.pitch + (e.clientY - drag.y) * 0.004));
});
addEventListener("pointerup", () => (drag = null));

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

$("#play").addEventListener("click", async () => {
  audioStart();
  // browsers only allow audio after a tap, so the recorder gets it now
  capture.configure({ audioContext: ac });
  if ($("#useCam").checked) await useCamera(true);
  $("#intro").hidden = true;
  startRound();
});
$("#lounge").addEventListener("click", async () => {
  audioStart();
  capture.configure({ audioContext: ac });
  if ($("#useCam").checked) await useCamera(true);
  $("#intro").hidden = true;
  enterLounge();
});
$("#hideout").addEventListener("click", () => openHideout());
$("#o-lounge").addEventListener("click", () => {
  $("#intro").hidden = true;
  if (!ac) {
    audioStart();
    capture.configure({ audioContext: ac });
  }
  if (lounge) {
    exitLounge();
    startRound();
  } else enterLounge();
});

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
function step() {
  const dt = Math.min(0.1, clock.getDelta());
  if (playing && !inRoom()) {
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
      const lim = 13.2;
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
    for (const c of cans) {
      if (c.taken) continue;
      if (player.position.distanceTo(tmp.set(c.obj.position.x, 0, c.obj.position.z)) < 1.3)
        collect(c);
    }
    if (!done && !lounge) {
      timeLeft = Math.max(0, timeLeft - dt);
      if (timeLeft === 0) {
        done = true;
        capture.setHud({ score, target: TARGET, badge: "Time's up" });
        log("time up");
      }
    }
    timeEl.textContent = timeLeft.toFixed(1);
  }
  mixer?.update(dt);
  for (const c of cans) c.mixer?.update(dt);
  hubStep(dt);
  if (hubCam > 0.001) {
    // In the hideout: orbit the room (drag to look around), blended from the follow cam.
    const f = hub.focus();
    const yaw = f.yaw + orbit.yaw;
    const dist = (f.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2)) * (camera.aspect < 0.8 ? 1.25 : 0.95);
    hubCamPos.set(Math.sin(yaw) * Math.cos(orbit.pitch), Math.sin(orbit.pitch), Math.cos(yaw) * Math.cos(orbit.pitch))
      .multiplyScalar(dist).add(f.target);
    camTarget.copy(player.position).add(tmp.set(0, 5.5, 8.5)).lerp(hubCamPos, hubCam);
    camera.position.lerp(camTarget, 1 - Math.exp(-4 * dt));
    hubLook.lerp(tmp.copy(player.position).setY(player.position.y + 0.8).lerp(f.target, hubCam), 1 - Math.exp(-6 * dt));
    camera.lookAt(hubLook);
  } else {
    camTarget.copy(player.position).add(tmp.set(0, 5.5, 8.5));
    camera.position.lerp(camTarget, 1 - Math.exp(-4 * dt));
    hubLook.set(player.position.x, player.position.y + 0.8, player.position.z);
    camera.lookAt(hubLook);
  }

  renderer.render(scene, camera);
  // same moment as Mattercraft's onAfterRender
  capture.frame();
  requestAnimationFrame(step);
}

loadModels()
  .then(() => {
    layoutCans();
    log("scene ready");
    window.__lab.ready = true;
    // Deep links: ?mode=play|record|hideout (from the hideout's Cola Run app), ?hub=CODE (a product QR).
    const mode = qs.get("mode") || (qs.get("hub") ? "hideout" : "");
    if (mode === "hideout") openHideout();
    else if (mode === "play" || mode === "record") {
      $("#play").click();
      if (mode === "record") setTimeout(() => capture.status === "idle" && capture.toggle(), 600);
    }
  })
  .catch((e) => log(`model load failed: ${e?.message || e}`));
requestAnimationFrame(step);

/* ── test hook ── */
window.__lab = {
  ready: false,
  capture,
  DEFAULT_SETTINGS,
  play: () => $("#play").click(),
  collectAll: () => cans.filter((c) => !c.taken).forEach(collect),
  status: () => capture.status,
  state: () => ({ playing, score, timeLeft, done, lounge, emote }),
  lounge: () => enterLounge(),
  hub,
  hideout: () => openHideout(),
  walkTo: (x, z) => player.position.set(x, 0, z),
  player,
  emote: (n) => setEmote(n),
};
