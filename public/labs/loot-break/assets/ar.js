// LOOT BREAK (TBH: Task Bar Hero) on 8th Wall world tracking.
//
// The game is the real Mattercraft component, mattercraft/loot-break/LootBreakGame.ts, bundled with the lab shim
// into ./loot-break-game.js by scripts/build-loot-break.mjs (edit the .ts and rebuild, never the .js). This file
// stands in for the Mattercraft scene: 8th Wall's camera and SLAM (the engine binary), a placement group the game
// drives (placementMode / placementValid, duck-typed like Zappar's Instant World Tracker), the record button and
// analytics. The splash is index.html (generated from mattercraft/loot-break/index.src.html, same as Mattercraft's).
//
// Placement: the lane follows the desk in the middle of the screen. The desk height comes from the engine's
// feature points under the reticle (the engine binary has no plane events and its y = 0 is the floor), falling
// back to the floor when there are none. The lane's size follows the distance (about 95 % of the view across), so
// it looks right on a desk or a floor whatever SLAM's scale is; pinch while placing to make it bigger or smaller.
// Place waits until there's a surface AND tracking has settled (world-health.js).
//
// URL options: ?desktop (skip the phone check, simulator), ?diag (status readout, on by default on previews),
// ?verbose (engine camera log), ?rewards=0 (no codes), ?dpr=, ?adapt=0, ?cam=720 (world-health A/B knobs).
import * as THREE from "three";
import { worldHealth } from "/evade/xr/world-health.js";
import { ColaCapture } from "/evade/cola-run-lab/assets/capture-core.js?v=4";
import { LootBreakGame, LabContext } from "./loot-break-game.js?v=3";

window.THREE = THREE; // XR8.Threejs.pipelineModule() looks for a global THREE

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const DIAG = qs.has("diag") || /^(localhost$|127\.|deploy-preview-)/.test(location.hostname);
const EXPERIENCE = "tbh_lootbreak";
const PAGE_START = Date.now();
const CAM_H = 1.3; // responsive scale: the camera starts this far above the floor (y = 0)
const VIEW_FILL = 0.95; // the lane spans about this much of the view across, at the distance it's placed
let sizeMul = 1; // pinch while placing

/* ── analytics: same GA property and event names as the Mattercraft build (index.ts) ── */
function track(name, params = {}) {
  try {
    window.gtag?.("event", name, { experience: EXPERIENCE, ...params });
  } catch {
    /* analytics must never break the experience */
  }
}
const seconds = (since) => Math.round((Date.now() - since) / 1000);

/* ── a tiny observable, duck-typed like Mattercraft's ── */
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

/* ── sheet: errors and "open this on your phone" ── */
const diag = { status: "loading", tracking: "-", errors: [] };
function sheet(title, body, btn = "Try again", onBtn = () => location.reload()) {
  $("sheet-title").textContent = title;
  $("sheet-body").textContent = body;
  $("sheet-btn").textContent = btn;
  $("sheet-btn").onclick = onBtn;
  $("qr").hidden = true;
  $("sheet").hidden = false;
  if (title !== "Open this on your phone") diag.errors.push(`${title}: ${body}`);
}
// Phones by device, never by touch: touchscreen laptops pass a touch check and the engine then fails with
// "No valid session manager". Computers get a QR to carry on on the phone; ?desktop skips it (simulator).
const PHONE =
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
function openOnPhone() {
  sheet(
    "Open this on your phone",
    "LOOT BREAK puts the raid on your desk with your phone's camera. Scan this to play it there.",
    "Close",
    () => {
      $("sheet").hidden = true;
      launch.disabled = false;
    },
  );
  try {
    window.QRCode?.toString(
      location.href.replace(/[?&](desktop)\b[^&]*/g, ""),
      { type: "svg", margin: 0, errorCorrectionLevel: "M" },
      (err, svg) => {
        if (!err) {
          $("qr").innerHTML = svg;
          $("qr").hidden = false;
        }
      },
    );
  } catch {
    /* no QR library: the text still says what to do */
  }
}

/* ── load the engine before Start (Start opens the camera in the same tap) ── */
const launch = $("launchButton");
const xrReady = new Promise((res) => (window.XR8 ? res() : addEventListener("xrloaded", res, { once: true })));
const fontsReady = document.fonts?.ready?.catch(() => {}) ?? Promise.resolve();
Promise.all([xrReady, fontsReady]).then(() => {
  launch.disabled = false;
});
setTimeout(() => {
  if (!window.XR8) sheet("The AR engine didn't load", "Check your connection and try again.");
}, 25000);

/* ── audio: one context for the game and the recorder, resumed on the first tap ── */
const AC = window.AudioContext || window.webkitAudioContext;
const ac = AC ? new AC() : null;
const gameBus = ac ? ac.createGain() : null;
gameBus?.connect(ac.destination);
const unlockAudio = () => ac && ac.state === "suspended" && ac.resume().catch(() => {});
addEventListener("pointerdown", unlockAudio, { capture: true });

/* ── canvas size + tracking health (adaptive pixel ratio, settle gate, phone logs) ── */
const canvas = $("cam");
const wh = worldHealth({ page: "loot-break", canvas, baseDpr: 1.5, post: true });
wh.sizeCanvas();
addEventListener("resize", () => wh.sizeCanvas());
addEventListener("orientationchange", () => setTimeout(() => wh.sizeCanvas(), 300));

/* ── pinch while placing: bigger or smaller lane ── */
const touches = new Map();
let pinch0 = null;
canvas.addEventListener("pointerdown", (e) => {
  touches.set(e.pointerId, e);
  if (touches.size === 2 && placeGroup.placementMode.value) {
    const [a, b] = [...touches.values()];
    pinch0 = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), m: sizeMul };
  }
});
canvas.addEventListener("pointermove", (e) => {
  if (!touches.has(e.pointerId)) return;
  touches.set(e.pointerId, e);
  if (pinch0 && touches.size === 2) {
    const [a, b] = [...touches.values()];
    const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    sizeMul = Math.min(2, Math.max(0.5, pinch0.m * (d / Math.max(20, pinch0.d))));
  }
});
const endTouch = (e) => {
  touches.delete(e.pointerId);
  if (touches.size < 2) pinch0 = null;
};
canvas.addEventListener("pointerup", endTouch);
canvas.addEventListener("pointercancel", endTouch);

/* ── the scene ── */
let scene, camera, renderer, game, ctx, capture;
const anchor = new THREE.Group(); // the lane lives here; the game scales its own content (sceneScale)
// What the game reads off a Zappar Instant World Tracker: placementMode (true = the lane follows the desk) and,
// new for this page, placementValid (false = no surface yet or tracking still settling, so Place waits).
const placeGroup = {
  element: new THREE.Group(),
  children: [],
  placementMode: obs(true),
  placementValid: obs(false),
};

function buildScene(xr) {
  ({ scene, camera, renderer } = xr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2030, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(0.6, 1.4, 0.8);
  scene.add(sun);

  camera.position.set(0, CAM_H, 0);
  camera.quaternion.identity();
  XR8.XrController.updateCameraProjectionMatrix({ origin: camera.position, facing: camera.quaternion });

  anchor.visible = false;
  scene.add(anchor);

  ctx = new LabContext({
    overlay: $("zcomponent-overlay"),
    camera,
    canvas,
    audioContext: ac,
    audioLayer: gameBus,
    renderer,
    scene,
  });
  game = new LootBreakGame(ctx, {});
  anchor.add(game.element);
  game.parent = placeGroup; // the game finds its tracker by walking up from itself
  placeGroup.children.push(game);
  game.showIntroOnLoad.value = false; // the splash already said what this is; coach tips teach in play
  game.placeHint.value = "Point at your desk, then tap Place.";
  game.placeButtonLabel.value = "Place on desk";
  game.licencesUrl.value = "./licences.html";
  game.reserveShutter.value = true;
  game.shareUrl.value = location.origin + location.pathname;
  const rw = qs.get("rewards");
  if (rw === "0") game.rewardsEnabled.value = false;
  // Same origin: medialife.ai in production, a deploy preview tests against that preview's own codes.
  else game.rewardsApi.value = rw && rw.startsWith("https://") ? rw : location.origin;
  if (gameBus) game.setAudioOutput(gameBus);

  /* the record button: bottom centre, save / share only (no upload: TBH clips aren't collected) */
  capture = new ColaCapture({
    canvas,
    host: $("zcomponent-overlay"),
    endpoint: location.origin,
    globeUrl: "/",
    source: "loot-break",
    audioContext: ac,
    connectAudio: (dest) => {
      gameBus.connect(dest);
      return () => gameBus.disconnect(dest);
    },
    isXR: () => false,
    on: (name, p) => {
      if (name === "recordStart") track("record", { action: "start" });
      if (name === "recordStop") track("record", { action: "stop", seconds: Math.round(p?.seconds || 0) });
      if (name === "saved") track("record", { action: "save" });
      if (name === "error") diag.errors.push(`rec ${p.stage}: ${p.message}`);
    },
  });
  Object.assign(capture.settings, {
    corner: "bottomCenter",
    accent: "#f5c447",
    brandTitle: "LOOT BREAK",
    brandTagline: "TBH: Task Bar Hero · Activated by MEDIALIFE",
    sendEnabled: false,
    keepTitle: "Nice raid! Keep the clip?",
    hintText: "Record your raid",
    clipTitle: "LOOT BREAK clip",
    filePrefix: "loot-break",
    backLabel: "Back to the raid",
  });
  capture.apply();
  capture.setVisible(false);

  ctx.markConstructed();
  // Straight to placing: no round starts until the player taps Place (house rule).
  ctx.constructed.then(() => game.startRound());

  /* analytics, as Mattercraft's index.ts did */
  const session = { rounds: 0, best: 0, bestTier: "", bosses: 0, placed: 0, resets: 0, wipes: 0, codes: 0 };
  let roundStart = 0;
  game.onPlace.addListener(() => {
    session.placed++;
    track("scene_placed", { seconds: seconds(PAGE_START), attempt: session.placed, tracking: wh.tracking });
  });
  game.onResetPlacement.addListener(() => {
    session.resets++;
    track("placement_reset", { count: session.resets });
  });
  game.onRoundStart.addListener(() => {
    session.rounds++;
    roundStart = Date.now();
    track("game_start", { attempt: session.rounds });
  });
  game.onBoss.addListener(() => {
    session.bosses++;
    track("boss_reached", { attempt: session.rounds });
  });
  game.onRoundEnd.addListener((score, tier) => {
    if (score > session.best) {
      session.best = score;
      session.bestTier = tier;
    }
    const st = game.roundStats ?? {};
    if (st.wiped) session.wipes++;
    track("game_complete", {
      attempt: session.rounds,
      score,
      tier,
      seconds: roundStart ? seconds(roundStart) : undefined,
      outcome: st.wiped ? "wiped" : "survived",
      boss: st.boss,
      ults: st.ults,
      weak_hits: st.weakHits,
      cursed_hits: st.cursedHits,
      accuracy: st.accuracy,
      best_combo: st.bestCombo,
      badges: Array.isArray(st.badges) ? st.badges.join(",") || "none" : undefined,
    });
  });
  game.onReward.addListener((action, percent) => {
    if (action === "claim" || action === "upgrade" || action === "quest_claim") session.codes++;
    track("reward", { action, percent: percent || undefined, attempt: session.rounds });
  });
  let summarised = false;
  const summarise = () => {
    if (summarised) return;
    summarised = true;
    track("session_summary", {
      rounds: session.rounds,
      best_score: session.best,
      best_tier: session.bestTier || undefined,
      seconds: seconds(PAGE_START),
      placed: session.placed,
      resets: session.resets,
      wipes: session.wipes,
      codes: session.codes,
      furthest: session.rounds ? (session.bosses ? "boss" : "played") : session.placed ? "placed" : "landed",
    });
  };
  addEventListener("pagehide", summarise);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && summarise());

  window.__lb = { game, anchor, camera, scene, capture, placeGroup, wh, surface: () => ({ ...surf }) };
}

/* ── placing: find the desk under the middle of the screen ── */
const ray = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();
const centre = new THREE.Vector2(0, 0);
const camPos = new THREE.Vector3();
const samples = []; // recent feature-point heights under the reticle: { y, t }
const surf = { kind: "none", y: 0, ok: false, dist: 0 };
function hitY(x, y) {
  try {
    for (const h of XR8.XrController.hitTest(x, y, ["FEATURE_POINT"]))
      if (h.distance > 0.12 && h.distance < 6) return h.position.y;
  } catch {
    /* not ready yet */
  }
  return null;
}
function median(a) {
  const s = [...a].sort((p, q) => p - q);
  return s[Math.floor(s.length / 2)];
}
function findSurface(now) {
  camera.getWorldPosition(camPos);
  for (const [x, y] of [
    [0.5, 0.5],
    [0.5, 0.6],
    [0.42, 0.55],
    [0.58, 0.55],
  ]) {
    const v = hitY(x, y);
    if (v !== null && v < camPos.y - 0.04) samples.push({ y: v, t: now });
  }
  while (samples.length && (now - samples[0].t > 900 || samples.length > 48)) samples.shift();
  ray.setFromCamera(centre, camera);
  // A desk (or anything flat) under the reticle: its feature points. Else the floor (y = 0).
  let kind = "none";
  if (samples.length >= 4) {
    const y = median(samples.map((s) => s.y));
    surf.y = surf.kind === "desk" ? surf.y + (y - surf.y) * 0.25 : y;
    kind = "desk";
  } else surf.y = 0;
  plane.constant = -surf.y;
  let ok = !!ray.ray.intersectPlane(plane, hit);
  if (ok) {
    surf.dist = hit.distanceTo(camPos);
    ok = surf.dist > 0.12 && surf.dist < 8 * CAM_H;
  }
  if (!ok && kind === "desk") {
    // The desk fit points away from the view: try the floor.
    plane.constant = 0;
    ok = !!ray.ray.intersectPlane(plane, hit) && hit.distanceTo(camPos) < 8 * CAM_H;
    if (ok) surf.dist = hit.distanceTo(camPos);
    kind = "floor";
    surf.y = 0;
  } else if (kind === "none" && ok) kind = "floor";
  surf.kind = ok ? kind : "none";
  surf.ok = ok;
  return ok;
}

let lastSurfOk = 0;
function followSurface(dt, now) {
  const placing = placeGroup.placementMode.value;
  if (!placing) {
    placeGroup.placementValid.value = true;
    return;
  }
  const ok = findSurface(now);
  if (ok) {
    lastSurfOk = now;
    const first = !anchor.visible;
    const k = first ? 1 : 1 - Math.exp(-12 * dt);
    anchor.position.lerp(hit, k);
    // The lane's front (+z) faces the player.
    anchor.rotation.y = Math.atan2(camPos.x - anchor.position.x, camPos.z - anchor.position.z);
    // Size from distance: same share of the view on a desk or a floor, whatever SLAM's scale is.
    const hFov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    const viewW = 2 * surf.dist * Math.tan(hFov / 2);
    const target = Math.min(4, Math.max(0.08, viewW * VIEW_FILL * sizeMul));
    anchor.scale.setScalar(first ? target : anchor.scale.x + (target - anchor.scale.x) * k);
    anchor.visible = true;
  }
  // Place waits for a surface (seen in the last half second) and settled tracking.
  placeGroup.placementValid.value = now - lastSurfOk < 500 && wh.settled();
}

/* ── record button: only while the lane is down and no card covers the screen ── */
let lastScore = -1;
function syncRecorder() {
  if (!capture) return;
  const st = game.debugState;
  const modal = game._ui?.classList.contains("lb-modal");
  const show = game.isPlaced && !modal && st.phase !== "moving";
  capture.setVisible(show || capture.status === "recording");
  if (st.score !== lastScore) {
    lastScore = st.score;
    capture.setHud({ score: st.score, badge: st.tier ? `${st.tier}` : undefined });
  }
}

/* ── hint pill: only when tracking is struggling after the lane is down ── */
let hintText = "";
function syncHint() {
  let t = "";
  const s = wh.tracking;
  if (game?.isPlaced && /LIMITED/.test(s)) t = "Point back at your desk";
  if (t !== hintText) {
    hintText = t;
    $("hint").textContent = t;
  }
}

/* ── test readout (?diag, previews) ── */
function drawDiag() {
  if (!DIAG || !game) return;
  let el = $("lb-diag");
  if (!el) {
    el = document.createElement("pre");
    el.id = "lb-diag";
    el.setAttribute("aria-hidden", "true");
    el.style.cssText =
      "position:fixed;left:8px;bottom:calc(env(safe-area-inset-bottom,0px) + 150px);z-index:99;margin:0;padding:4px 6px;font:10px/1.3 ui-monospace,monospace;color:#fff;background:#000a;border-radius:6px;pointer-events:none;white-space:pre";
    document.body.appendChild(el);
  }
  const st = game.debugState;
  el.textContent =
    `cam ${diag.status}  slam ${wh.tracking || "-"}${wh.settled() ? " ✓" : ""}  fps ${wh.fps}\n` +
    `surface ${surf.kind} y=${surf.y.toFixed(2)} d=${surf.dist.toFixed(2)}  lane ${anchor.scale.x.toFixed(2)}\n` +
    `phase ${st.phase}  placed ${game.isPlaced ? "yes" : "no"}  valid ${placeGroup.placementValid.value}` +
    (diag.errors.length ? `\nerr ${diag.errors.slice(-1)[0].slice(0, 110)}` : "");
}

/* ── the 8th Wall pipeline ── */
let lastT = 0,
  built = false,
  diagT = 0;
const app = {
  name: "loot-break",
  onStart: () => {
    try {
      buildScene(XR8.Threejs.xrScene());
      built = true;
    } catch (e) {
      sheet("Couldn't start the game", String(e?.message || e));
    }
  },
  onUpdate: () => {
    const now = performance.now();
    const dt = Math.min(0.1, lastT ? (now - lastT) / 1000 : 0.016);
    lastT = now;
    if (!built) return;
    followSurface(dt, now);
    ctx.step(dt);
    syncRecorder();
    syncHint();
    if ((diagT -= dt) <= 0) {
      diagT = 0.25;
      drawDiag();
    }
  },
  // Right after XR8.Threejs draws: the recorder copies the frame.
  onRender: () => built && capture?.frame(),
  onCameraStatusChange: (ev) => {
    diag.status = ev.status;
    if (ev.status === "hasVideo") {
      document.body.classList.add("zcomponent-launched");
      setTimeout(() => {
        const sp = $("splash");
        if (sp) sp.hidden = true;
      }, 500);
      track("camera_granted", { seconds: seconds(PAGE_START) });
    } else if (ev.status === "failed") {
      track("camera_denied", { reason: "failed" });
      sheet(
        "The camera didn't start",
        "Allow camera access for this site, close other apps using the camera, then try again.",
      );
    }
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

launch.addEventListener("click", () => {
  if (launch.disabled) return;
  // activate_click is tracked by the splash's own analytics script (index.src.html).
  if (!PHONE && !qs.has("desktop")) return openOnPhone();
  launch.disabled = true;
  launch.textContent = "Starting camera…";
  unlockAudio();
  try {
    XR8.XrController.configure({ disableWorldTracking: false, scale: "responsive" });
    XR8.addCameraPipelineModules([
      XR8.GlTextureRenderer.pipelineModule(),
      XR8.Threejs.pipelineModule(),
      XR8.XrController.pipelineModule(),
      wh.module,
      app,
      {
        name: "errors",
        onException: (e) => {
          if (e?.type === "permission")
            return sheet(
              "Motion access is needed",
              "LOOT BREAK uses your phone's motion sensors to keep the raid on your desk. Allow motion and orientation access (on iPhone, tap Allow when asked), then try again.",
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
          sheet("AR stopped", msg);
        },
      },
    ]);
    XR8.run({
      canvas,
      allowedDevices: qs.has("desktop") ? XR8.XrConfig.device().ANY : XR8.XrConfig.device().MOBILE_AND_HEADSETS,
      cameraConfig: { direction: XR8.XrConfig.camera().BACK },
      verbose: qs.has("verbose"),
    });
  } catch (e) {
    sheet("AR couldn't start", String(e?.message || e));
  }
  setTimeout(() => {
    if (diag.status !== "hasVideo" && $("sheet").hidden)
      sheet(
        "The camera didn't start",
        "Allow camera and motion access, close other apps using the camera, then try again.",
      );
  }, 15000);
});
