// Cola Run on 8th Wall world tracking (SLAM): quick test.
//
// The REAL Cola Run game (OrbHuntGame.ts, the file that goes into Mattercraft, bundled for the browser by
// scripts/build-cola-capture.mjs into /evade/cola-run-lab/assets/orb-hunt-game.js) running on top of
// 8th Wall's world tracking instead of Zappar's Instant World Tracker. Only the stand-in for the
// Mattercraft scene is new here: the camera comes from 8th Wall, and the game's Placement Anchor is a small
// object that follows the floor in the middle of the screen until the player taps the game's own Place.
//
// World units: 8th Wall "responsive" scale. The camera starts CAM_H units above the floor (y = 0), so with
// CAM_H = 1.3 and the phone held at chest height, 1 unit is roughly 1 metre on the floor (smaller on a table).
// The game is built in its own units (Bobo is 1.1 tall, cans spawn out to SPAWN_MAX), so the whole board
// sits under `anchor`, scaled by `size` (pinch with two fingers before Place to change it).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { OrbHuntGame, LabContext } from "/evade/cola-run-lab/assets/orb-hunt-game.js?v=7";

window.THREE = THREE; // XR8.Threejs.pipelineModule() looks for a global THREE

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const DIAG = qs.has("diag") || /^(localhost$|127\.|deploy-preview-)/.test(location.hostname);

const CAM_H = 1.3; // camera start height in world units (sets the scale of the world)
const SPAWN_MIN = 2.5,
  SPAWN_MAX = 10,
  ARENA = 11; // game units (the board is ~22 units across)
const SIZE_MIN = 0.04,
  SIZE_MAX = 0.4;
let size = Math.min(SIZE_MAX, Math.max(SIZE_MIN, Number(qs.get("scale")) || 0.2)); // Bobo ~22 cm, board ~4.4 m across on the floor
const BOBO_URL = "/roblox/activated-retail/models/catrun.glb?v=2";
const COLA_URL = "/roblox/activated-retail/models/cola.glb?v=2";

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

/* ── UI helpers ── */
function hint(text) {
  const el = $("hint");
  el.hidden = !text;
  if (text) el.textContent = text;
}
function showError(title, body) {
  $("err-title").textContent = title;
  $("err-body").textContent = body;
  $("error").hidden = false;
  diag.errors.push(`${title}: ${body}`);
}
$("err-retry").onclick = () => location.reload();
const diag = { status: "loading", tracking: "-", fps: 0, errors: [] };
function drawDiag() {
  if (!DIAG) return;
  const el = $("diag");
  el.hidden = false;
  el.textContent =
    `engine: ${window.XR8 ? XR8.version?.() || "loaded" : "loading"}\n` +
    `camera: ${diag.status}  tracking: ${diag.tracking}\n` +
    `fps: ${diag.fps.toFixed(0)}  size: ${size.toFixed(3)}  placed: ${game?.isPlaced ? "yes" : "no"}\n` +
    (diag.errors.length ? `err: ${diag.errors.slice(-2).join(" | ")}` : "");
}

/* ── load models + engine before Start (Start must open the camera in the same tap) ── */
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
    drawDiag();
  })
  .catch((e) => showError("Couldn't load the game", String(e?.message || e)));
setTimeout(() => {
  if (!window.XR8) showError("The AR engine didn't load", "Check your connection and try again.");
}, 25000);

/* ── audio (resumed on the first tap, as Mattercraft does) ── */
const ac = new (window.AudioContext || window.webkitAudioContext)();
const gameBus = ac.createGain();
gameBus.connect(ac.destination);
addEventListener("pointerdown", () => ac.state === "suspended" && ac.resume().catch(() => {}), {
  capture: true,
});

/* ── joystick (stands in for EVADE's JoystickController) ── */
const stick = $("stick");
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
(window.__mattercraftJoysticks ||= []).push({ joystickContainer: stick });
const keys = new Set();
addEventListener("keydown", (e) => keys.add(e.key.toLowerCase()));
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

/* ── pinch to resize while placing ── */
const touches = new Map();
let pinch0 = null;
const canvas = $("cam");
canvas.addEventListener("pointerdown", (e) => {
  touches.set(e.pointerId, e);
  if (touches.size === 2 && game && !game.isPlaced) {
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

/* ── the scene (built in onStart, inside 8th Wall's three.js scene) ── */
let scene, camera, renderer, game, ctx, mixer, runAct, idleAct;
const anchor = new THREE.Group(); // the board: everything the game owns lives under it
const player = new THREE.Group();
const reticle = new THREE.Group();
const ray = new THREE.Raycaster();
const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();
const tmp = new THREE.Vector3();
const fwd = new THREE.Vector3();
const right = new THREE.Vector3();
const placeAnchor = {
  // What the game reads off a World Tracker anchor: placementMode (true = follows the floor, false = held),
  // placementValid (false = no floor under the reticle yet, so Place waits).
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

  // 8th Wall needs to know where the three.js camera starts: its height above the floor sets the scale.
  camera.position.set(0, CAM_H, 0);
  camera.quaternion.identity();
  XR8.XrController.updateCameraProjectionMatrix({
    origin: camera.position,
    facing: camera.quaternion,
  });

  // Reticle: flat white ring + dot, shown on the floor while placing.
  const ringM = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), ringM);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.12, 24), ringM);
  for (const m of [ring, dot]) {
    m.rotation.x = -Math.PI / 2;
    reticle.add(m);
  }
  reticle.visible = false;
  scene.add(reticle);

  // The board: an arena edge, Bobo's contact shadow, Bobo. Hidden until the floor is found.
  anchor.visible = false;
  scene.add(anchor);
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

  // The real game, in a stand-in Mattercraft context, with the EVADE scene's settings.
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
  game = new OrbHuntGame(ctx, { maxOrbs: 32, orbDetail: 32, pickupModel: COLA_URL });
  anchor.add(game.element);
  game.playerNode.value = "player";
  game.pickupKind.value = "model";
  game.spawnMinRadius.value = SPAWN_MIN;
  game.spawnMaxRadius.value = SPAWN_MAX;
  game.placementEnabled.value = true;
  game.placementAnchor.value = "anchor";
  game.logoImage.value = "/brand/medialife-wordmark.webp";
  game.introImage.value = "/evade/cola-run-lab/assets/cola-run-intro.webp";
  game.onPlace.addListener(() => {
    stick.hidden = false;
    hint(null);
  });
  game.onResetPlacement.addListener(() => {
    stick.hidden = true;
    player.position.set(0, 0, 0);
  });
  ctx.markConstructed();
  window.__crw = {
    game,
    anchor,
    player,
    camera,
    get size() {
      return size;
    },
    set size(v) {
      size = v;
    },
  };
}

/* ── placing: the board follows the floor in the middle of the screen ── */
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
      const yaw = Math.atan2(
        camera.position.x - anchor.position.x,
        camera.position.z - anchor.position.z,
      );
      anchor.rotation.y = yaw;
      reticle.position.copy(anchor.position).setY(0.002);
      reticle.scale.setScalar(size * 1.4);
      anchor.visible = true;
    }
    reticle.visible = ok;
    anchor.scale.setScalar(size);
    const introOpen = !!document
      .querySelector(".ohg-intro")
      ?.closest(".ohg-layer")
      ?.classList.contains("on");
    if (!game.isPlaced)
      hint(
        introOpen
          ? null
          : ok
            ? "Pinch to resize, then tap Place"
            : "Point at the floor or a table and move your phone slowly",
      );
  } else reticle.visible = false;
  placeAnchor.placementValid.value = !placing || ok;
}

/* ── Bobo: camera-relative joystick, run/idle blend ── */
let moving = 0;
function moveBobo(dt) {
  if (!game.isPlaced) {
    moving = 0;
    return;
  }
  const mv = new THREE.Vector2(stickV.x, stickV.y);
  if (keys.has("arrowleft") || keys.has("a")) mv.x -= 1;
  if (keys.has("arrowright") || keys.has("d")) mv.x += 1;
  if (keys.has("arrowup") || keys.has("w")) mv.y -= 1;
  if (keys.has("arrowdown") || keys.has("s")) mv.y += 1;
  if (mv.length() > 1) mv.normalize();
  if (mv.lengthSq() > 0.01) {
    // Screen up = away from the camera along the floor; turn it into board-local axes.
    camera.getWorldDirection(fwd).setY(0);
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    right.set(-fwd.z, 0, fwd.x);
    tmp.copy(right).multiplyScalar(mv.x).addScaledVector(fwd, -mv.y); // world direction
    tmp.applyAxisAngle(THREE.Object3D.DEFAULT_UP, -anchor.rotation.y); // into the board's frame
    const speed = 5.2; // game units per second, as in the Mattercraft scene
    player.position.x += tmp.x * speed * dt;
    player.position.z += tmp.z * speed * dt;
    const r = Math.hypot(player.position.x, player.position.z);
    if (r > ARENA - 0.6) player.position.multiplyScalar((ARENA - 0.6) / r);
    const yaw = Math.atan2(tmp.x, tmp.z);
    let dy = yaw - player.rotation.y;
    dy = ((((dy + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
    player.rotation.y += dy * (1 - Math.exp(-12 * dt));
  }
  moving += ((mv.lengthSq() > 0.01 ? 1 : 0) - moving) * (1 - Math.exp(-10 * dt));
  if (runAct && idleAct) {
    runAct.weight = moving;
    idleAct.weight = 1 - moving;
  }
}

/* ── the 8th Wall pipeline ── */
let lastT = 0,
  built = false,
  frames = 0,
  fpsT = 0;
const app = {
  name: "cola-run-world",
  onStart: () => {
    buildScene(XR8.Threejs.xrScene())
      .then(() => {
        built = true;
        hint(null);
      })
      .catch((e) => showError("Couldn't start the game", String(e?.message || e)));
  },
  onUpdate: ({ processCpuResult }) => {
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
    const r = processCpuResult?.reality;
    if (r?.trackingStatus)
      diag.tracking = `${r.trackingStatus}${r.trackingReason ? ` (${r.trackingReason})` : ""}`;
    if (!built) return;
    followFloor(dt);
    moveBobo(dt);
    mixer?.update(dt);
    ctx.step(dt);
  },
  onCameraStatusChange: (ev) => {
    const { status } = ev;
    diag.status = status;
    if (status === "failed")
      diag.errors.push(
        `camera: ${ev.reason || ev.config ? JSON.stringify({ reason: ev.reason, config: ev.config }) : ""}`.slice(
          0,
          300,
        ),
      );
    drawDiag();
    if (status === "requesting") hint("Allow camera and motion access");
    else if (status === "hasVideo") {
      $("splash").hidden = true;
      hint(null);
    } else if (status === "failed")
      showError(
        "The camera didn't start",
        "Allow camera access for this site, close other apps using the camera, then try again.",
      );
  },
  listeners: [
    // 8th Wall loses the floor when the view is blank or moves too fast; it keeps the board where it was.
    {
      event: "reality.trackingstatus",
      process: ({ detail }) => {
        diag.tracking = `${detail.status}${detail.reason ? ` (${detail.reason})` : ""}`;
      },
    },
  ],
};

startBtn.addEventListener("click", () => {
  startBtn.disabled = true;
  startBtn.textContent = "Starting camera…";
  ac.resume().catch(() => {});
  try {
    XR8.XrController.configure({ disableWorldTracking: false, scale: "responsive" });
    XR8.addCameraPipelineModules([
      XR8.GlTextureRenderer.pipelineModule(),
      XR8.Threejs.pipelineModule(),
      XR8.XrController.pipelineModule(),
      app,
    ]);
    XR8.addCameraPipelineModule({
      name: "errors",
      onException: (e) => {
        if (e?.type === "permission")
          return showError(
            "Motion access is needed",
            "World tracking uses your phone's motion sensors. Allow motion and orientation access (on iPhone, tap Allow when asked), then try again. A laptop can't run this one.",
          );
        showError(
          "AR stopped",
          e?.message || (typeof e === "object" ? JSON.stringify(e) : String(e)),
        );
      },
    });
    XR8.run({
      canvas,
      allowedDevices: qs.has("desktop")
        ? XR8.XrConfig.device().ANY
        : XR8.XrConfig.device().MOBILE_AND_HEADSETS,
      cameraConfig: { direction: XR8.XrConfig.camera().BACK },
      verbose: qs.has("verbose"),
    });
  } catch (e) {
    showError("AR couldn't start", String(e?.message || e));
  }
  // iOS sometimes never reports "failed".
  setTimeout(() => {
    if (diag.status !== "hasVideo" && $("error").hidden)
      showError(
        "The camera didn't start",
        "Allow camera and motion access, close other apps using the camera, then try again.",
      );
  }, 15000);
});
