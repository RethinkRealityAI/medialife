// Cola Run (EVADE) on 8th Wall world tracking: the full game, replacing the Zappar Mattercraft build.
//
// What runs here is the same code the Mattercraft project used, unchanged:
//   OrbHuntGame.ts (the game), CollectorHubMode.ts + HubCore.ts (Bobo's Hideout, BOBO OS, Bobo's Arcade),
//   CaptureCore.ts (record button), bundled by scripts/build-cola-capture.mjs into
//   /evade/cola-run-lab/assets/{orb-hunt-game,capture-core}.js. Edit the .ts files and rebuild, never the .js.
// mattercraft/lab-shim/zcomponent.ts stands in for Mattercraft's runtime; this file stands in for the
// Mattercraft scene: 8th Wall's camera, the placement anchor, Bobo's model and animations, the joystick.
//
// World units: 8th Wall "responsive" scale. The camera starts CAM_H units above the floor (y = 0); with the
// phone at chest height 1 unit is about 1 metre on a floor (less on a table). The game is in its own units
// (Bobo is 1.1 tall), so everything the game owns sits under `anchor`, scaled by `size` (pinch before Place).
//
// URL options: ?mode=play|record|lounge|hideout (deep links, e.g. back from Bobo's Arcade), ?hub=CODE (merch
// QR), ?home=always|afterActivation|off (BOBO OS as home; default always while testing), ?scale=0.25,
// ?stick=left, ?test (test code under the unlock form), ?diag (status readout; on by default on previews),
// ?hideout=classic (the two-storey hideout built round Bobo on the board instead of the walk-in portal one).
const PORTAL_HIDEOUT = new URLSearchParams(location.search).get("hideout") !== "classic";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { addArcadeCabinet } from "./arcade-cabinet.js?v=2";
import { setupHideoutPortal } from "./hideout-portal.js?v=1";
import { ColaCapture } from "/evade/cola-run-lab/assets/capture-core.js?v=4";
import {
  OrbHuntGame,
  CollectorHubMode,
  LabContext,
} from "/evade/cola-run-lab/assets/orb-hunt-game.js?v=9";

window.THREE = THREE; // XR8.Threejs.pipelineModule() looks for a global THREE

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const DIAG = qs.has("diag") || /^(localhost$|127\.|deploy-preview-)/.test(location.hostname);
const SOURCE = "cola-run"; // platform events / clip uploads

const CAM_H = 1.3;
const SPAWN_MIN = 2.5,
  SPAWN_MAX = 10,
  ARENA = 11; // game units: the board is ~22 units across
const SIZE_MIN = 0.1,
  SIZE_MAX = 0.6;
let size = Math.min(SIZE_MAX, Math.max(SIZE_MIN, Number(qs.get("scale")) || 0.25)); // board ~5.5 m
const BOBO_URL = "/roblox/activated-retail/models/catrun.glb?v=2";
// Static Blender Eclipse can: cola.glb is rigged, and cloned rigged pickups all draw at the original's skeleton.
const COLA_URL = "/evade/keychain/ar/eclipse-can.glb";

/* ── tiny observable, duck-typed like Mattercraft's (what the game reads off a Placement Anchor) ── */
function obs(v) {
  const fns = new Set();
  return {
    get value() {
      return v;
    },
    set value(x) {
      if (x === v) return;
      v = x;
      fns.forEach((f) => f(x));
    },
    addListener: (f) => fns.add(f),
    removeListener: (f) => fns.delete(f),
  };
}

/* ── errors + test readout ── */
const diag = { status: "loading", tracking: "-", fps: 0, errors: [] };
function showError(title, body) {
  $("err-title").textContent = title;
  $("err-body").textContent = body;
  $("error").hidden = false;
  diag.errors.push(`${title}: ${body}`);
}
$("err-retry").onclick = () => location.reload();
function drawDiag() {
  if (!DIAG) return;
  const el = $("diag");
  el.hidden = false;
  el.textContent =
    `camera: ${diag.status}  tracking: ${diag.tracking}  fps: ${diag.fps.toFixed(0)}\n` +
    `board: ${(ARENA * 2 * size).toFixed(1)} m  placed: ${game?.isPlaced ? "yes" : "no"}  hub: ${hub?.state || "-"}` +
    (diag.errors.length ? `\nerr: ${diag.errors.slice(-1)[0].slice(0, 120)}` : "");
}

/* ── load the engine + Bobo before Start (Start opens the camera in the same tap) ── */
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const xrReady = new Promise((res) =>
  window.XR8 ? res() : addEventListener("xrloaded", res, { once: true }),
);
const boboReady = loader.loadAsync(BOBO_URL);
const startBtn = $("start");
Promise.all([xrReady, boboReady])
  .then(() => {
    startBtn.disabled = false;
    startBtn.textContent = "Start";
  })
  .catch((e) => showError("Couldn't load the game", String(e?.message || e)));
setTimeout(() => {
  if (!window.XR8) showError("The AR engine didn't load", "Check your connection and try again.");
}, 25000);

/* ── audio: one context for the game and the recorder (resumed on the first tap) ── */
const ac = new (window.AudioContext || window.webkitAudioContext)();
const gameBus = ac.createGain();
gameBus.connect(ac.destination);
const unlockAudio = () => ac.state === "suspended" && ac.resume().catch(() => {});
addEventListener("pointerdown", unlockAudio, { capture: true });

/* ── joystick (stands in for EVADE's JoystickController) ── */
const stick = $("stick");
if (qs.get("stick") === "left") stick.classList.add("left");
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
  stickV.set(
    (e.clientX - (r.left + r.width / 2)) / (r.width / 2),
    (e.clientY - (r.top + r.height / 2)) / (r.height / 2),
  );
  if (stickV.length() > 1) stickV.normalize();
  knob.style.transform = `translate(${stickV.x * 34}px,${stickV.y * 34}px)`;
}
// The hideout's Joystick Side (Auto) finds it here, as it finds Mattercraft's.
(window.__mattercraftJoysticks ||= []).push({ joystickContainer: stick });
const keys = new Set();
addEventListener("keydown", (e) => keys.add(e.key.toLowerCase()));
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

/* ── canvas: the engine draws at the canvas's own size (300x150 unless set) ── */
const canvas = $("cam");
const DRAW_DPR = Math.min(devicePixelRatio || 1, Number(qs.get("dpr")) || 2);
function sizeCanvas() {
  const w = Math.round(innerWidth * DRAW_DPR);
  const h = Math.round(innerHeight * DRAW_DPR);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}
sizeCanvas();
addEventListener("resize", sizeCanvas);
addEventListener("orientationchange", () => setTimeout(sizeCanvas, 300));

/* ── pinch to size the board while placing (not while the hub owns two-finger gestures) ── */
const touches = new Map();
let pinch0 = null;
const inRoom = () =>
  !!hub && (hub.state === "building" || hub.state === "live" || hub.state === "leaving");
canvas.addEventListener("pointerdown", (e) => {
  touches.set(e.pointerId, e);
  if (touches.size === 2 && game && !game.isPlaced && !inRoom()) {
    const [a, b] = [...touches.values()];
    pinch0 = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), size };
  }
});
canvas.addEventListener("pointermove", (e) => {
  if (!touches.has(e.pointerId)) return;
  touches.set(e.pointerId, e);
  if (pinch0 && touches.size === 2) {
    const [a, b] = [...touches.values()];
    const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    size = Math.min(SIZE_MAX, Math.max(SIZE_MIN, pinch0.size * (d / Math.max(20, pinch0.d))));
  }
});
const endTouch = (e) => {
  touches.delete(e.pointerId);
  if (touches.size < 2) pinch0 = null;
};
canvas.addEventListener("pointerup", endTouch);
canvas.addEventListener("pointercancel", endTouch);

/* ── scene objects (filled in onStart, inside 8th Wall's three.js scene) ── */
let scene, camera, renderer, game, ctx, mode, hub, capture, mixer, runAct, idleAct, cabinet, hideoutPortal;
const emoteActs = {};
let emote = null;
const anchor = new THREE.Group(); // everything the game and the hideout own
const player = new THREE.Group();
const reticle = new THREE.Group();
const placeAnchor = {
  // What the game reads off a World Tracker anchor: placementMode (true = follows the floor, false = held)
  // and placementValid (false = no floor under the reticle, so Place waits).
  element: new THREE.Group(),
  children: [],
  placementMode: obs(true),
  placementValid: obs(false),
};

function fit(obj, height) {
  const box = new THREE.Box3().setFromObject(obj);
  obj.scale.setScalar(height / Math.max(1e-3, box.max.y - box.min.y));
  const b2 = new THREE.Box3().setFromObject(obj);
  obj.position.y -= b2.min.y;
}
function setEmote(name) {
  emote = name && emoteActs[name] ? name : null;
  if (emote) emoteActs[emote].reset();
}

async function buildScene(xr) {
  ({ scene, camera, renderer } = xr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x66584a, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(2, 5, 3);
  scene.add(sun);

  camera.position.set(0, CAM_H, 0);
  camera.quaternion.identity();
  XR8.XrController.updateCameraProjectionMatrix({
    origin: camera.position,
    facing: camera.quaternion,
  });

  // Reticle: flat white ring + dot on the floor while placing.
  const ringM = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  for (const m of [
    new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), ringM),
    new THREE.Mesh(new THREE.CircleGeometry(0.12, 24), ringM),
  ]) {
    m.rotation.x = -Math.PI / 2;
    reticle.add(m);
  }
  reticle.visible = false;
  scene.add(reticle);

  anchor.visible = false;
  scene.add(anchor);
  // Arena edge: where Bobo can run (the joystick stops him there).
  const edge = new THREE.Mesh(
    new THREE.RingGeometry(ARENA - 0.15, ARENA, 96),
    new THREE.MeshBasicMaterial({
      color: 0x4fd6e8,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  );
  edge.rotation.x = -Math.PI / 2;
  edge.position.y = 0.01;
  anchor.add(edge);
  anchor.add(player);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 32),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.005;
  player.add(shadow);

  const bobo = await boboReady;
  fit(bobo.scene, 1.1);
  player.add(bobo.scene);
  mixer = new THREE.AnimationMixer(bobo.scene);
  const clip = (n) => bobo.animations.find((a) => a.name === n);
  runAct = clip("Run") && mixer.clipAction(clip("Run"));
  idleAct = clip("Idle") && mixer.clipAction(clip("Idle"));
  idleAct?.play();
  if (runAct) {
    runAct.play();
    runAct.weight = 0;
  }
  for (const n of ["Sleep", "Alert", "Purr"]) {
    const c = clip(n);
    if (!c) continue;
    const a = mixer.clipAction(c);
    a.weight = 0;
    a.play();
    emoteActs[n] = a;
  }

  /* the recorder: bottom-centre shutter, clips go to the Where is Bobo? review queue */
  capture = new ColaCapture({
    canvas,
    host: $("zcomponent-overlay"),
    endpoint: qs.get("endpoint") || location.origin,
    globeUrl: "/evade/where-is-bobo/",
    source: SOURCE,
    audioContext: ac,
    connectAudio: (dest) => {
      gameBus.connect(dest);
      return () => gameBus.disconnect(dest);
    },
    isXR: () => false,
    on: (name, p) => {
      if (name === "error") diag.errors.push(`rec ${p.stage}: ${p.message}`);
    },
  });
  capture.settings.corner = "bottomCenter";
  capture.apply();

  /* the game, in the stand-in Mattercraft context, with the EVADE scene's settings */
  ctx = new LabContext({
    overlay: $("zcomponent-overlay"),
    camera,
    canvas,
    audioContext: ac,
    audioLayer: gameBus,
    loader,
    renderer,
    scene,
  });
  ctx.addNode("player", player);
  ctx.addComponent("anchor", placeAnchor);
  const EMOTE_FOR = { "lounge-sleep": "Sleep", "lounge-excited": "Alert", "lounge-purr": "Purr" };
  for (const [id, name] of Object.entries(EMOTE_FOR))
    ctx.addClip(id, { play: () => setEmote(name), stop: () => emote === name && setEmote(null) });

  game = new OrbHuntGame(ctx, { maxOrbs: 32, orbDetail: 32, pickupModel: COLA_URL });
  anchor.add(game.element);
  ctx.addComponent("game", game);
  game.playerNode.value = "player";
  game.pickupKind.value = "model";
  game.spawnMinRadius.value = SPAWN_MIN;
  game.spawnMaxRadius.value = SPAWN_MAX;
  game.placementEnabled.value = true;
  game.placementAnchor.value = "anchor";
  game.logoImage.value = "/brand/medialife-wordmark.webp";
  game.introImage.value = "/evade/cola-run-lab/assets/cola-run-intro.webp";
  game.licencesUrl.value = "/evade/licences/";
  // Bottom row (Dapo, 2026-11-17): Reset placement bottom left (always on), joystick centred, record + Bobo's
  // actions bottom right. The quick mute would share the bottom-left corner: Music / Sound stay in the menu.
  game.resetCorner.value = "bottomLeft";
  game.soundToggleEnabled.value = false;
  game.lounge1Timeline.value = "lounge-sleep";
  game.lounge2Timeline.value = "lounge-excited";
  game.lounge3Timeline.value = "lounge-purr";

  // What ColaRunRecorder does with the game's events: score + badge on the video.
  let hud = {};
  const pushHud = () => capture.setHud({ ...hud });
  const target = () => Number(game.targetCount.value) || undefined;
  game.onGameStart.addListener(() => {
    hud = { score: 0, target: target() };
    pushHud();
  });
  game.onLoungeEnter.addListener(() => {
    hud = { badge: "Lounging with Bobo" };
    pushHud();
  });
  game.onLoungeExit.addListener(() => {
    hud = {};
    pushHud();
    setEmote(null);
  });
  game.onOrbCollected.addListener((e) => {
    hud = { ...hud, score: Number(e?.score) || 0, target: Number(e?.target) || target() };
    pushHud();
  });
  game.onTargetReached.addListener(() => {
    hud = { ...hud, badge: "Run complete!" };
    pushHud();
    platformEvent("play", { result: "win" });
  });
  game.onTimeUp.addListener(() => {
    hud = { ...hud, badge: "Time's up" };
    pushHud();
    platformEvent("play", { result: "time" });
  });
  game.onHideoutEnter.addListener(() => {
    hud = { badge: "In Bobo's Hideout" };
    pushHud();
  });
  game.onPlace.addListener(() => {
    stick.hidden = false;
    platformEvent("scan", { placed: true });
  });
  game.onResetPlacement.addListener(() => {
    player.position.set(0, 0, 0);
  });

  // The recorder as CollectorHubMode sees it in Mattercraft (it moves it, hides it in the room).
  const lobs = (v, fn) => ({
    _v: v,
    get value() {
      return this._v;
    },
    set value(x) {
      this._v = x;
      fn(x);
    },
    addListener() {},
    removeListener() {},
  });
  ctx.addComponent("recorder", {
    element: new THREE.Group(),
    children: [],
    onRecordStart: { addListener() {}, removeListener() {} },
    // The walk-in hideout keeps the shutter (bottom centre): filming the trip through the door is the point.
    buttonVisible: lobs(true, (v) => capture.setVisible(v || !!hideoutPortal?.active)),
    corner: lobs(capture.settings.corner, (v) => {
      capture.settings.corner = v;
      capture.apply();
    }),
    startRecording: () => capture.status === "idle" && capture.toggle(),
  });

  /* Bobo's Hideout + BOBO OS (+ Bobo's Arcade), bound to the game as in Mattercraft */
  mode = new CollectorHubMode(ctx, {});
  anchor.add(mode.element);
  mode.gameNode.value = "game";
  mode.endpoint.value = qs.get("endpoint") || "";
  mode.modelUrl.value = "/hub/evade/room.glb";
  mode.globeUrl.value = "/evade/where-is-bobo/index.html";
  mode.arcadeUrl.value = "/evade/arcade/games.json";
  mode.showTestCode.value = qs.has("test");
  // Testing: BOBO OS (with the arcade) is home for everyone. At launch: "afterActivation" (merch code).
  mode.homeScreen.value = qs.get("home") || "always";
  // Fans who haven't unlocked the room land in Cola Run (the room asks for a merch code). ?start=myRoom|lounge.
  mode.startIn.value = qs.get("start") || "colaRun";
  mode.roomFit.value = "bothFloors";
  // Walk-in hideout: life size, so no pinch/twist resizing of the room.
  if (PORTAL_HIDEOUT) mode.allowAdjust.value = false;
  mode.buildTimeline.value = "lounge-excited";
  mode.roomTimeline.value = "lounge-purr";
  ctx.constructed.then(() => {
    hub = mode.hub;
    // Walk-in hideout (default): a door opens where Bobo stands; through it, the one-storey hideout.
    if (hub && PORTAL_HIDEOUT)
      hideoutPortal = setupHideoutPortal({
        hub,
        camera,
        renderer,
        canvas,
        anchor,
        player,
        onEvent: platformEvent,
        onActive: (on) => {
          stick.hidden = on || !game.isPlaced;
          capture.setVisible(true);
        },
      });
    // Classic hideout: the arcade machine in the room. Walk Bobo up to it (or tap it) to open Bobo's Arcade.
    else if (hub)
      cabinet = addArcadeCabinet({
        hub,
        player,
        camera,
        canvas,
        open: () => {
          hub.prompt(null);
          hub.openArcade();
          platformEvent("custom", { action: "arcade_open", from: "cabinet" });
        },
      });
  });

  // Deep links: ?mode=arcade|play|record|lounge|hideout, ?hub=CODE (merch QR).
  // arcade = back from another experience: place the board, then BOBO OS opens on Bobo's Arcade.
  const deep = qs.get("mode") || (qs.get("hub") ? "hideout" : "");
  game.showIntroOnLoad.value = !deep;
  ctx.markConstructed();
  if (deep === "arcade") {
    game.startRoundOnPlace.value = false;
    game.onPlace.addListener(() => setTimeout(() => hub?.openArcade(), 400));
  } else if (deep === "hideout") ctx.constructed.then(() => !qs.get("hub") && mode.open());
  else if (deep === "lounge") game.enterLounge();
  else if (deep === "play" || deep === "record") {
    game.startGame();
    if (deep === "record")
      game.onGameStart.addListener(() => capture.status === "idle" && capture.toggle());
  }

  window.__cr = {
    get hideoutPortal() {
      return hideoutPortal;
    },
    game,
    mode,
    anchor,
    player,
    camera,
    scene,
    capture,
    get hub() {
      return hub;
    },
    get size() {
      return size;
    },
  };
}

/* ── platform events (Where is Bobo? globe + analytics), same as the other EVADE experiences ── */
const SID = Math.random().toString(36).slice(2, 12);
function platformEvent(kind, extra = {}) {
  if (qs.has("nolog")) return;
  try {
    fetch("/api/bobo/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: kind, source: SOURCE, sessionId: SID, props: extra }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* offline */
  }
}

/* ── placing: the board follows the floor in the middle of the screen ── */
const ray = new THREE.Raycaster();
const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();
const centre = new THREE.Vector2(0, 0);
function followFloor(dt) {
  const placing = placeAnchor.placementMode.value;
  let ok = false;
  if (placing) {
    ray.setFromCamera(centre, camera);
    if (ray.ray.intersectPlane(floor, hit)) {
      const d = hit.distanceTo(camera.position);
      ok = d > 0.25 && d < 8 * CAM_H;
    }
    if (ok) {
      const first = !anchor.visible;
      anchor.position.lerp(hit, first ? 1 : 1 - Math.exp(-14 * dt));
      // Face the board's front (+z) toward the player.
      anchor.rotation.y = Math.atan2(
        camera.position.x - anchor.position.x,
        camera.position.z - anchor.position.z,
      );
      reticle.position.copy(anchor.position).setY(0.002);
      reticle.scale.setScalar(size * 1.4);
      anchor.visible = true;
    }
    reticle.visible = ok;
    anchor.scale.setScalar(size);
  } else reticle.visible = false;
  placeAnchor.placementValid.value = !placing || ok;
}

/* ── Bobo: camera-relative joystick, run / idle / lounge pose blend ── */
const fwd = new THREE.Vector3();
const right = new THREE.Vector3();
const dir = new THREE.Vector3();
let moving = 0;
function moveBobo(dt) {
  const mv = new THREE.Vector2(stickV.x, stickV.y);
  if (keys.has("arrowleft") || keys.has("a")) mv.x -= 1;
  if (keys.has("arrowright") || keys.has("d")) mv.x += 1;
  if (keys.has("arrowup") || keys.has("w")) mv.y -= 1;
  if (keys.has("arrowdown") || keys.has("s")) mv.y += 1;
  if (mv.length() > 1) mv.normalize();
  if (!game.isPlaced || !player.visible) mv.set(0, 0);
  if (mv.lengthSq() > 0.01) {
    camera.getWorldDirection(fwd).setY(0);
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    right.set(-fwd.z, 0, fwd.x);
    dir.copy(right).multiplyScalar(mv.x).addScaledVector(fwd, -mv.y);
    dir.applyAxisAngle(THREE.Object3D.DEFAULT_UP, -anchor.rotation.y); // into the board's frame
    const speed = 5.2; // game units per second, as in the Mattercraft scene
    player.position.x += dir.x * speed * dt;
    player.position.z += dir.z * speed * dt;
    // In the hideout the room has its own walls; on the board the arena edge stops him.
    if (!inRoom()) {
      const r = Math.hypot(player.position.x, player.position.z);
      if (r > ARENA - 0.6) player.position.multiplyScalar((ARENA - 0.6) / r);
    }
    let dy = Math.atan2(dir.x, dir.z) - player.rotation.y;
    dy = ((((dy + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
    player.rotation.y += dy * (1 - Math.exp(-12 * dt));
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

/* ── the 8th Wall pipeline ── */
let lastT = 0,
  built = false,
  frames = 0,
  fpsT = 0;
const app = {
  name: "cola-run",
  onStart: () => {
    buildScene(XR8.Threejs.xrScene())
      .then(() => {
        built = true;
      })
      .catch((e) => showError("Couldn't start the game", String(e?.message || e)));
  },
  onUpdate: () => {
    const now = performance.now();
    const dt = Math.min(0.1, lastT ? (now - lastT) / 1000 : 0.016);
    lastT = now;
    frames++;
    if (now - fpsT > 1000) {
      diag.fps = (frames * 1000) / (now - fpsT);
      frames = 0;
      fpsT = now;
      drawDiag();
    }
    if (!built) return;
    followFloor(dt);
    moveBobo(dt);
    mixer?.update(dt);
    ctx.step(dt); // triggers, then the game's and the hideout's onBeforeRender
    cabinet?.update(dt);
    hideoutPortal?.update(dt);
  },
  // Right after XR8.Threejs draws: the recorder copies the frame (as Mattercraft's onAfterRender).
  onRender: () => built && capture?.frame(),
  onCameraStatusChange: (ev) => {
    diag.status = ev.status;
    drawDiag();
    if (ev.status === "hasVideo") $("splash").hidden = true;
    else if (ev.status === "failed")
      showError(
        "The camera didn't start",
        "Allow camera access for this site, close other apps using the camera, then try again.",
      );
  },
  listeners: [
    {
      event: "reality.trackingstatus",
      process: ({ detail }) => {
        diag.tracking = `${detail.status}${detail.reason ? ` (${detail.reason})` : ""}`;
      },
    },
  ],
};

startBtn.addEventListener("click", () => {
  if (!PHONE && !qs.has("desktop")) return openOnPhone();
  startBtn.disabled = true;
  startBtn.textContent = "Starting camera…";
  unlockAudio();
  try {
    XR8.XrController.configure({ disableWorldTracking: false, scale: "responsive" });
    XR8.addCameraPipelineModules([
      XR8.GlTextureRenderer.pipelineModule(),
      XR8.Threejs.pipelineModule(),
      XR8.XrController.pipelineModule(),
      app,
      {
        name: "errors",
        onException: (e) => {
          if (e?.type === "permission")
            return showError(
              "Motion access is needed",
              "Cola Run uses your phone's motion sensors to keep Bobo on the floor. Allow motion and orientation access (on iPhone, tap Allow when asked), then try again.",
            );
          const msg = String(e?.message || (typeof e === "object" ? JSON.stringify(e) : e));
          if (/session manager|not supported|unsupported|device/i.test(msg) && diag.status !== "hasVideo") {
            try {
              XR8.stop();
            } catch {
              /* not running */
            }
            return openOnPhone();
          }
          showError(
            "AR stopped",
            e?.message || (typeof e === "object" ? JSON.stringify(e) : String(e)),
          );
        },
      },
    ]);
    XR8.run({
      canvas,
      allowedDevices: XR8.XrConfig.device().MOBILE_AND_HEADSETS,
      cameraConfig: { direction: XR8.XrConfig.camera().BACK },
      verbose: qs.has("verbose"),
    });
  } catch (e) {
    showError("AR couldn't start", String(e?.message || e));
  }
  setTimeout(() => {
    if (diag.status !== "hasVideo" && $("error").hidden)
      showError(
        "The camera didn't start",
        "Allow camera and motion access, close other apps using the camera, then try again.",
      );
  }, 15000);
});

// Phones only, by device (not touch: touchscreen laptops pass a touch check, then the engine fails with
// "No valid session manager"). On a computer, Start shows a QR to carry on on the phone; ?desktop skips it.
const PHONE =
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
function openOnPhone() {
  showError(
    "Open this on your phone",
    "Cola Run needs your phone's camera and motion sensors to put Bobo on your floor. Scan this to open it there.",
  );
  try {
    window.QRCode?.toString(
      location.href.replace(/[?&](test|desktop)\b[^&]*/g, ""),
      { type: "svg", margin: 0, errorCorrectionLevel: "M" },
      (err, svg) => {
        if (!err) {
          $("qr").innerHTML = svg;
          $("qr").hidden = false;
        }
      },
    );
  } catch {
    /* no QR */
  }
  $("err-retry").textContent = "Close";
  $("err-retry").onclick = () => {
    $("error").hidden = true;
    startBtn.disabled = false;
    startBtn.textContent = "Start";
  };
}
