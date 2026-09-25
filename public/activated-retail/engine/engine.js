/* =========================================================
   Activated-retail endcap engine
   One static page that renders any endcap project (src/lib/ar/project.ts is the schema).
   It began as a copy of the Roblox demo (public/roblox/activated-retail/), which is still the
   reference for look, feel and performance hardening; the hard-coded content became data:
   themes, graphics, the seven shelf zones, product copy, the tour, the activation and the CTA.
   Modes (contract A): published (window.__AR_PROJECT, injected at /x/<slug>), preview
   (?preview=1, inside the builder, driven by postMessage) and template (?template=<name>).
   ========================================================= */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import * as KA from "/activated-retail/engine/keyart.js";

/* =========================================================
   Fixture: the AR-01 endcap (display.glb). Everything here is about the hardware, not the content.
   ========================================================= */
const FIXTURE_URL = "/roblox/activated-retail/display.glb";
const ZONE_IDS = ["cap", "plush", "keychain", "mousepad", "figure", "tee", "hoodie"];
// shelf zones = the fixture's MERCH_<id> groups; zoom = how big the product is shown when held
const FIX = {
  cap: { hero: "HERO_cap", group: "MERCH_cap", zoom: 1.9 },
  plush: { hero: "HERO_plush", group: "MERCH_plush", zoom: 1.7 },
  keychain: { hero: "HERO_keychain", group: "MERCH_keychain", zoom: 3.6 },
  mousepad: { hero: "HERO_mousepad", group: "MERCH_mousepad", zoom: 1.6 },
  tee: { hero: "HERO_tee", group: "MERCH_tee", zoom: 1.7 },
  hoodie: { hero: "HERO_hoodie", group: "MERCH_hoodie", zoom: 1.55 },
  figure: { hero: "HERO_figure", group: "MERCH_figure", zoom: 1.9 },
};
// camera viewpoints (project VIEWS ids): the Roblox demo's tour stops
const VIEWS = {
  aisle: { pos: [-3.9, 1.75, 6.2], tgt: [0.4, 1.15, 0], label: "From the aisle" },
  hero: { pos: [0.0, 1.62, 2.7], tgt: [0, 1.5, 0], label: "The hero screen" },
  shelf: { pos: [0.25, 1.18, 2.05], tgt: [0, 0.62, 0], label: "The merch shelf" },
  qr: { pos: [2.55, 1.5, 2.1], tgt: [1.45, 1.3, 0.35], label: "Tap, play, unlock" },
  totem: { pos: [2.1, 1.5, 3.6], tgt: [3.0, 1.1, 1.1], label: "The digital totem" },
  dashboard: { pos: [-1.1, 1.65, 3.8], tgt: [0.2, 1.2, 0], label: "Measured" },
  build: { pos: [0.9, 2.35, 8.3], tgt: [0.7, 1.4, 0.3], label: "Built modular" },
};
const PARTS = {
  PART_TowerL: {
    off: [-0.95, 0, 0.05],
    name: "Lightbox tower · left",
    dims: "760 × 600 × 2160 mm · backlit fabric graphic",
  },
  PART_TowerR: {
    off: [0.95, 0, 0.05],
    name: "Lightbox tower · QR",
    dims: "760 × 600 × 2160 mm · scan-to-unlock panel",
  },
  PART_Header: {
    off: [0, 0.62, 0.05],
    name: "Header + channel letters",
    dims: "2320 × 560 × 380 mm · face-lit acrylic",
  },
  PART_VideoWall: {
    off: [0, 0.22, -0.55],
    name: "Video wall",
    dims: "12 tiles · 2200 × 940 mm + 1190 mm hero screen",
  },
  PART_Bay: {
    off: [0, 0.08, 0.75],
    name: "Merch bay",
    dims: "2280 × 440 × 830 mm · LED shelf edges",
  },
  PART_Plinth: { off: [0, -0.02, 1.45], name: "Plinth", dims: "2280 × 680 × 200 mm · lit tagline" },
  PART_Totem: {
    off: [0.55, 0, 0.65],
    name: "Digital totem",
    dims: '1040 × 480 × 2020 mm · 75" portrait screen',
  },
};
// simulated activation feed per zone (dashboard + hero screen), same starting numbers as the demo
const SKU_SEED = {
  keychain: 318,
  tee: 241,
  cap: 188,
  hoodie: 164,
  plush: 151,
  mousepad: 122,
  figure: 100,
};

/* =========================================================
   Mode + project
   ========================================================= */
const $ = (s) => document.querySelector(s);
const qs = new URLSearchParams(location.search);
const MODE = window.__AR_PROJECT
  ? "published"
  : qs.get("preview") === "1"
    ? "preview"
    : qs.get("template")
      ? "template"
      : "none";
const IN_PREVIEW = MODE === "preview";
document.body.classList.add("mode-" + MODE);
let SLUG = String(window.__AR_SLUG || window.__AR_PROJECT?.slug || "");
const demoId = () => "x:" + (SLUG || PROJECT?.slug || "unknown");
// first-party analytics: published endcaps only (preview and templates never count as visits)
if (MODE === "published") {
  try {
    window.ARTrack?.init?.({ demo: demoId() });
  } catch (e) {}
}
function track(name, props) {
  if (MODE !== "published") return;
  try {
    window.ARTrack?.event?.(name, props);
  } catch (e) {}
}
// builder protocol (contract A): same origin only, and only to the page that framed us
function post(msg, transfer) {
  if (!IN_PREVIEW || window.parent === window) return;
  try {
    window.parent.postMessage(msg, location.origin, transfer || []);
  } catch (e) {}
}
function postError(message) {
  console.warn("[engine]", message);
  post({ type: "ar:error", message: String(message) });
}

let PROJECT = null;
const HEX = /^#[0-9a-fA-F]{6}$/;
// site paths only (the schema's assetRef): never another origin, never a protocol-relative URL
const sitePath = (u) => (typeof u === "string" && /^\/(?!\/)[^\s"'<>\\()]*$/.test(u) ? u : null);
const httpUrl = (u) => (typeof u === "string" && /^https?:\/\/[^\s]+$/i.test(u) ? u : null);
const str = (v, d = "") => (typeof v === "string" ? v : d);
function normalizeImg(ref) {
  if (!ref) return null;
  if (typeof ref === "string") return sitePath(ref) ? { src: ref } : null;
  const src = sitePath(ref.src);
  if (!src) return null;
  return { src, mobile: sitePath(ref.mobile) || undefined };
}
/** Fill the schema's defaults and drop anything unusable, so a half-typed builder draft still renders. */
function normalizeProject(raw) {
  if (!raw || typeof raw !== "object") throw new Error("No project data");
  const p = JSON.parse(JSON.stringify(raw));
  if (!Array.isArray(p.themes) || !p.themes.length)
    throw new Error("The project needs at least one theme");
  const seen = new Set();
  p.themes = p.themes
    .filter((t) => t && typeof t.id === "string" && t.id && !seen.has(t.id) && seen.add(t.id))
    .slice(0, 4)
    .map((t) => {
      const g = t.graphics || {};
      const graphics = { mode: g.mode === "keyart" ? "keyart" : "panels" };
      for (const k of ["keyArt", "towerL", "towerR", "totem", "wall", "screen", "header"])
        graphics[k] = normalizeImg(g[k]);
      return {
        id: t.id,
        name: str(t.name, t.id) || t.id,
        led: HEX.test(t.led) ? t.led : "#8a5cff",
        led2: HEX.test(t.led2) ? t.led2 : "#4f7dff",
        bay: HEX.test(t.bay) ? t.bay : null,
        spill: HEX.test(t.spill) ? t.spill : null,
        markers: {
          product: HEX.test(t.markers?.product) ? t.markers.product : null,
          activation: HEX.test(t.markers?.activation) ? t.markers.activation : null,
        },
        graphics,
        site: str(t.site),
        game: str(t.game),
      };
    });
  if (!p.themes.length) throw new Error("The project needs at least one theme");
  if (!p.themes.some((t) => t.id === p.defaultTheme)) p.defaultTheme = p.themes[0].id;
  const b = p.brand || {};
  p.brand = {
    lockup: str(b.lockup),
    sub: str(b.sub),
    splashTitle: str(b.splashTitle, "Activated Retail") || "Activated Retail",
    splashSub: str(b.splashSub),
    retailer: str(b.retailer, "Walmart") || "Walmart",
    headerText: str(b.headerText).trim().slice(0, 24),
    tagline: str(b.tagline).trim().slice(0, 40),
  };
  p.name = str(p.name, p.brand.splashTitle);
  p.client = str(p.client);
  p.access = p.access || {};
  const zones = {};
  for (const id of ZONE_IDS) {
    const z = p.zones?.[id];
    const m = z?.model || {};
    const pr = z?.product || {};
    zones[id] = {
      enabled: !!z && z.enabled !== false && !!pr.label,
      model: {
        source: ["asset", "image"].includes(m.source) ? m.source : "default",
        asset: sitePath(m.asset),
        image: normalizeImg(m.image),
        tint: HEX.test(m.tint) ? m.tint : null,
        print: normalizeImg(m.print),
        yaw: Number.isFinite(+m.yaw) ? Math.max(-180, Math.min(180, +m.yaw)) : 0,
        scale: Number.isFinite(+m.scale) && +m.scale > 0 ? Math.max(0.2, Math.min(3, +m.scale)) : 1,
      },
      product: {
        label: str(pr.label, "Product") || "Product",
        category: str(pr.category),
        sku: str(pr.sku),
        price: Math.max(0, +pr.price || 0),
        sizes: Array.isArray(pr.sizes)
          ? pr.sizes.filter((s) => typeof s === "string" && s).slice(0, 8)
          : [],
        description: str(pr.description),
        unlock: {
          title: str(pr.unlock?.title),
          sub: str(pr.unlock?.sub),
          image: normalizeImg(pr.unlock?.image),
        },
        trigger: str(pr.trigger),
        channel: str(pr.channel),
        hotspot: str(pr.hotspot),
        canActivate: !!pr.canActivate,
      },
    };
  }
  p.zones = zones;
  const a = p.activation || {};
  p.activation = {
    type: ["game", "link", "none"].includes(a.type) ? a.type : "game",
    url: httpUrl(a.url),
    buttonLabel: str(a.buttonLabel, "Play the drop") || "Play the drop",
    splash: normalizeImg(a.splash),
    rewardPrefix: /^[A-Z0-9]{2,6}$/.test(a.rewardPrefix || "") ? a.rewardPrefix : "AR01",
    qrUrl: httpUrl(a.qrUrl),
  };
  if (p.activation.type === "link" && !p.activation.url) p.activation.type = "game";
  p.tour = (Array.isArray(p.tour) ? p.tour : [])
    .filter((s) => s && typeof s.title === "string" && s.title && VIEWS[s.view])
    .slice(0, 10)
    .map((s) => ({
      title: s.title,
      body: str(s.body),
      view: s.view,
      theme: typeof s.theme === "string" ? s.theme : null,
      dashboard: !!s.dashboard,
    }));
  const c = p.cta || {};
  p.cta = {
    label: str(c.label, "Book a call") || "Book a call",
    mode: c.mode === "url" && httpUrl(c.url) ? "url" : "lead",
    url: httpUrl(c.url),
  };
  p.ar = { glb: sitePath(p.ar?.glb), usdz: sitePath(p.ar?.usdz) };
  return p;
}

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const money = (n) => "$" + (+n || 0).toFixed(2);
const hexInt = (h) => parseInt(String(h).slice(1), 16);
// "MEDIALIFE® × ROBLOX" → the ® drawn smaller, like the demo lockup
const lockupHTML = (s) => esc(s).replace(/®/g, "<span>®</span>");
/* =========================================================
   Renderer / scene
   ========================================================= */
const stage = $("#stage");
const isTouch = matchMedia("(pointer:coarse)").matches;
const small = Math.min(innerWidth, innerHeight) < 700 || !!window.__LOWQ;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
// an image reference from the project: the phone-sized variant on small screens when there is one
const imgUrl = (ref) => (!ref ? null : small && ref.mobile ? ref.mobile : ref.src);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
// pixel budget: never ask the GPU for more than ~2.2 MP per frame (1.2 MP on phones)
const PIX_BUDGET = small ? 2.6e6 : 4.8e6;
const DPR_FLOOR = small ? 0.8 : 1.0;
const budgetDpr = () =>
  Math.min(
    devicePixelRatio,
    2,
    Math.max(DPR_FLOOR, Math.sqrt(PIX_BUDGET / (innerWidth * innerHeight))),
  );
let DPR_MAX = budgetDpr();
let dpr = DPR_MAX;
renderer.setPixelRatio(dpr);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping; // keeps brand colours true instead of washing them out
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false; // the scene is mostly static: re-render shadows only when something moves
renderer.xr.enabled = true;
stage.appendChild(renderer.domElement);
// Phones drop the WebGL context of a page that sits behind another heavy tab (a game, the camera).
// Pause while it is gone, rebuild what three.js can't (the environment map, the live screen) when it
// comes back, and if it doesn't come back, say so and offer a reload instead of a dead screen.
let gpuLost = false,
  gpuLosses = 0;
function gpuBanner(on) {
  let el = document.getElementById("gpuBanner");
  if (on && !el) {
    el = document.createElement("div");
    el.id = "gpuBanner";
    el.className = "gpu-banner";
    el.setAttribute("role", "alert");
    el.innerHTML =
      '<span>The 3D display paused to save memory.</span><button type="button" class="btn go">Reload display</button>';
    el.querySelector("button").onclick = () => location.reload();
    document.body.appendChild(el);
  }
  if (el) el.classList.toggle("on", !!on);
}
function gpuCheck() {
  if (gpuLost || gpuLosses >= 3) gpuBanner(true);
}
renderer.domElement.addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  gpuLost = true;
  gpuLosses++;
  dpr = Math.max(0.75, dpr - 0.25);
  clearTimeout(gpuCheck.t);
  gpuCheck.t = setTimeout(gpuCheck, 3500);
});
renderer.domElement.addEventListener("webglcontextrestored", () => {
  gpuLost = false;
  clearTimeout(gpuCheck.t);
  gpuBanner(gpuLosses >= 3);
  try {
    renderer.setPixelRatio(dpr);
    composer.setPixelRatio(dpr);
    resize();
  } catch (err) {}
  try {
    const pm = new THREE.PMREMGenerator(renderer);
    const old = scene.environment;
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    old?.dispose?.();
  } catch (err) {}
  try {
    if (screenTex) screenTex.needsUpdate = true;
    loop.drew0 = false;
  } catch (err) {}
  renderer.shadowMap.needsUpdate = true;
});

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.03, 80);
camera.position.set(-6.5, 3.2, 9.5);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.target.set(0.4, 1.15, 0.1);
controls.minDistance = 1.1;
controls.maxDistance = 9;
controls.maxPolarAngle = Math.PI * 0.5 - 0.01;
controls.minPolarAngle = 0.62; // stay under the store ceiling
controls.enablePan = true;
controls.screenSpacePanning = true;
controls.autoRotateSpeed = 0.5;

/* ---------------------------------------------------------
   Interaction guard: one owner of the pointer at a time.
   - user input always beats a running camera flight
   - controls are off while a product is held, in shopper view, or behind an overlay
   - stale pointers (released over an overlay/iframe/outside the window) are cleared,
     so a single-finger drag can never be misread as a two-finger pan/dolly
   --------------------------------------------------------- */
function resetPointers() {
  const c = controls;
  if (c._pointers && c._pointers.length) {
    for (const id of c._pointers) {
      try {
        c.domElement.releasePointerCapture(id);
      } catch (e) {}
    }
    c._pointers.length = 0;
    for (const k in c._pointerPositions) delete c._pointerPositions[k];
  }
  c.domElement.removeEventListener("pointermove", c._onPointerMove);
  c.domElement.removeEventListener("pointerup", c._onPointerUp);
  c.state = -1;
  killMomentum();
}
function killMomentum() {
  const c = controls;
  c._sphericalDelta?.set(0, 0, 0);
  c._panOffset?.set(0, 0, 0);
  c._scale = 1;
}
function overlayOpen() {
  return (
    document.querySelector("#phoneWrap.open, #modal.open, #cart.open") !== null ||
    !!document.querySelector(".arl-wrap, #arHandoff:not([hidden])")
  );
}
function syncControls() {
  const want = mode !== "walk" && !focus && !overlayOpen();
  if (controls.enabled !== want) {
    resetPointers();
    controls.enabled = want;
  }
}
controls.addEventListener("start", () => {
  cancelCamTween();
  idle = 0;
  controls.autoRotate = false;
});
// capture phase runs before OrbitControls' own pointerdown: a new primary pointer while
// the controls still think one is down means the previous pointerup was lost.
renderer.domElement.addEventListener(
  "pointerdown",
  (e) => {
    if (e.isPrimary && controls._pointers.length) resetPointers();
  },
  { capture: true },
);
addEventListener("blur", () => {
  resetPointers();
  endDrag();
  walk.drag = null;
});
// Back from another tab or app: a touch that started here may have ended there, so reset every
// pointer owner, re-sync the controls with what's open, and pick the clock up where we are now.
function wake() {
  try {
    resetPointers();
    endDrag();
    walk.drag = null;
    hsPress = null;
    syncControls();
  } catch (err) {}
  try {
    lastNow = performance.now();
    clock.getDelta();
    renderer.shadowMap.needsUpdate = true;
  } catch (err) {}
  try {
    if (renderer.getContext().isContextLost() && !gpuLost) {
      gpuLost = true;
      clearTimeout(gpuCheck.t);
      gpuCheck.t = setTimeout(gpuCheck, 3500);
    }
  } catch (err) {}
  try {
    if (actx && actx.state === "suspended") actx.resume().catch(() => {});
  } catch (err) {}
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    resetPointers();
    endDrag();
    walk.drag = null;
    try {
      actx?.suspend?.().catch(() => {});
    } catch (err) {}
  } else wake();
});
addEventListener("pageshow", wake);
addEventListener("focus", wake);
let lastInput = 0;
["pointerdown", "pointermove", "wheel", "keydown", "touchmove"].forEach((ev) =>
  addEventListener(
    ev,
    () => {
      lastInput = performance.now();
    },
    { passive: true, capture: true },
  ),
);

// Post
const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();
const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.55, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());
function resize() {
  const cap = budgetDpr();
  if (cap !== DPR_MAX) {
    DPR_MAX = cap;
    if (dpr > DPR_MAX) {
      dpr = DPR_MAX;
      renderer.setPixelRatio(dpr);
      composer.setPixelRatio(dpr);
    }
  }
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloom.resolution.set(innerWidth / 2, innerHeight / 2);
}
addEventListener("resize", resize);
resize();

/* =========================================================
   Store environment (generic retail — no retailer branding)
   ========================================================= */
const store = new THREE.Group();
scene.add(store);
const lights = {};
function canvasTex(w, h, draw, { repeat = [1, 1], srgb = true } = {}) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAX_ANISO;
  return t;
}
function rand(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function buildStore() {
  // Floor: polished vinyl tile over a soft planar reflection
  const floorTex = canvasTex(
    1024,
    1024,
    (g, w, h) => {
      g.fillStyle = "#c9c7cc";
      g.fillRect(0, 0, w, h);
      const r = rand(7);
      for (let i = 0; i < 9000; i++) {
        const v = (150 + r() * 80) | 0;
        g.fillStyle = `rgba(${v},${v},${v + 4},${0.05 + r() * 0.06})`;
        g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3);
      }
      // 4x4 tiles of 600mm per texture repeat
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++) {
          const v = r() * 10 - 5;
          g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 100})`;
          g.fillRect((i * w) / 4, (j * h) / 4, w / 4, h / 4);
        }
      g.strokeStyle = "rgba(90,88,100,.35)";
      g.lineWidth = 2;
      for (let i = 0; i <= 4; i++) {
        g.beginPath();
        g.moveTo((i * w) / 4, 0);
        g.lineTo((i * w) / 4, h);
        g.stroke();
        g.beginPath();
        g.moveTo(0, (i * h) / 4);
        g.lineTo(w, (i * h) / 4);
        g.stroke();
      }
    },
    { repeat: [25, 25] },
  );
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.3, metalness: 0 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = "FLOOR";
  store.add(floor);
  lights.floor = floor;
  lights.floorMat = floorMat;

  // Contact shadows (baked radial gradients)
  const shadowTex = canvasTex(
    256,
    256,
    (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, "rgba(0,0,0,.55)");
      gr.addColorStop(0.55, "rgba(0,0,0,.28)");
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    },
    { srgb: false },
  );
  const sh = (w, d, x, z, ry = 0) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
    );
    m.rotation.set(-Math.PI / 2, 0, ry);
    m.position.set(x, 0.003, z);
    m.renderOrder = 1;
    store.add(m);
    return m;
  };
  sh(4.9, 1.7, 0, 0.1);
  lights.totemShadow = sh(1.5, 0.9, 3.0, 1.1);

  // Ceiling + light troffers
  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: 0x8d8b93, roughness: 0.9 }),
  );
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = 4.4;
  store.add(ceil);
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfff8f0,
    emissiveIntensity: 1.6,
  });
  lights.panelMat = panelMat;
  const pg = new THREE.PlaneGeometry(1.2, 0.6);
  const panels = new THREE.InstancedMesh(pg, panelMat, 120);
  let k = 0;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  for (let x = -14; x <= 14; x += 3.2)
    for (let z = -12; z <= 14; z += 3.0) {
      if (k >= 120) break;
      m4.compose(new THREE.Vector3(x, 4.39, z), q, new THREE.Vector3(1, 1, 1));
      panels.setMatrixAt(k++, m4);
    }
  panels.count = k;
  store.add(panels);

  // Walls
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xe4e2e7, roughness: 0.85 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(40, 4.4), wallMat);
  back.position.set(0, 2.2, -10);
  store.add(back);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(40, 4.4), wallMat);
  left.position.set(-16, 2.2, 0);
  left.rotation.y = Math.PI / 2;
  store.add(left);

  // Gondola shelving rows with generic product facings
  const facingTex = canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = "#ededf0";
    g.fillRect(0, 0, w, h);
    const r = rand(11);
    const pal = [
      "#e84a5f",
      "#2a9df4",
      "#f7b32b",
      "#3dbb6d",
      "#8e5cf7",
      "#ff7f3f",
      "#18c3c3",
      "#f25fa0",
      "#5a5f73",
      "#ffffff",
    ];
    for (let row = 0; row < 4; row++) {
      let x = 6;
      const y0 = (row * h) / 4 + 10,
        hh = h / 4 - 18;
      while (x < w - 10) {
        const bw = 26 + r() * 52;
        const bh = hh * (0.55 + r() * 0.45);
        g.fillStyle = pal[(r() * pal.length) | 0];
        g.fillRect(x, y0 + hh - bh, bw, bh);
        g.fillStyle = "rgba(255,255,255,.55)";
        g.fillRect(x + 4, y0 + hh - bh + 6, bw - 8, bh * 0.18);
        g.fillStyle = "rgba(0,0,0,.12)";
        g.fillRect(x + bw - 4, y0 + hh - bh, 4, bh);
        x += bw + 3;
      }
      g.fillStyle = "#b9b8bf";
      g.fillRect(0, y0 + hh, w, 8);
    }
  });
  const gondMat = new THREE.MeshStandardMaterial({
    color: 0xd8d7dc,
    roughness: 0.6,
    metalness: 0.1,
  });
  const faceMat = new THREE.MeshStandardMaterial({ map: facingTex, roughness: 0.7 });
  const gondola = (len, x, z, ry) => {
    const grp = new THREE.Group();
    grp.position.set(x, 0, z);
    grp.rotation.y = ry;
    const base = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 1.1), gondMat);
    base.position.y = 0.06;
    grp.add(base);
    const spine = new THREE.Mesh(new THREE.BoxGeometry(len, 1.7, 0.08), gondMat);
    spine.position.y = 0.95;
    grp.add(spine);
    for (const s of [1, -1]) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.55), faceMat);
      f.position.set(0, 0.92, 0.5 * s);
      f.rotation.y = s > 0 ? 0 : Math.PI;
      grp.add(f);
    }
    store.add(grp);
  };
  gondola(9.6, -10.2, -1.0, Math.PI / 2);
  gondola(9.6, -7.4, -1.0, Math.PI / 2);
  gondola(9.6, 10.2, -1.0, Math.PI / 2);
  gondola(9.6, 7.4, -1.0, Math.PI / 2);
  gondola(12, 0, -5.2, 0);
  gondola(12, 0, -7.8, 0);

  // Aisle blade signs (Walmart-style aisle blue, no retailer marks)
  const signTex = (txt) =>
    canvasTex(512, 128, (g, w, h) => {
      g.fillStyle = "#0b5cc8";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#ffc220";
      g.fillRect(0, h - 10, w, 10);
      g.fillStyle = "#fff";
      g.font = "600 54px Figtree, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(txt, w / 2, h / 2 + 2);
    });
  const blade = (txt, x, z, ry) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.4),
      new THREE.MeshStandardMaterial({ map: signTex(txt), roughness: 0.6, side: THREE.DoubleSide }),
    );
    m.position.set(x, 3.35, z);
    m.rotation.y = ry;
    store.add(m);
  };
  blade("TOYS & GAMES", -8.8, 4.2, 0);
  blade("GAMING", 8.8, 4.2, 0);
  blade("COLLECTIBLES", 0, -3.8, 0);

  // Lights
  lights.hemi = new THREE.HemisphereLight(0xffffff, 0x9d9aa8, 1.0);
  scene.add(lights.hemi);
  const key = new THREE.DirectionalLight(0xfff5ea, 1.5);
  key.position.set(-3, 7, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(small ? 1024 : 1536, small ? 1024 : 1536);
  key.shadow.camera.left = -6;
  key.shadow.camera.right = 6;
  key.shadow.camera.top = 5;
  key.shadow.camera.bottom = -3;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  lights.key = key;
  // coloured spill from the display onto the floor
  // (no real point lights: additive glow decals on the floor fake the LED spill for free)
  const glowTex = canvasTex(
    256,
    256,
    (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, "rgba(255,255,255,1)");
      gr.addColorStop(0.4, "rgba(255,255,255,.35)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    },
    { srgb: false },
  );
  const glow = (w, d, x, z) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({
        map: glowTex,
        color: 0x7a4dff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.006, z);
    m.renderOrder = 2;
    store.add(m);
    return m;
  };
  lights.spillL = glow(1.8, 1.6, -1.55, 0.75);
  lights.spillR = glow(1.8, 1.6, 1.55, 0.75);
  lights.spillC = glow(3.4, 1.5, 0, 0.95);
  lights.spillT = glow(1.4, 1.1, 3.0, 1.35);
}
buildStore();

let lightMode = "store";
function setLight(mode) {
  lightMode = mode;
  document
    .querySelectorAll("[data-light]")
    .forEach((b) => b.setAttribute("aria-pressed", b.dataset.light === mode));
  const night = mode === "night";
  scene.background = new THREE.Color(night ? 0x06050b : 0xd4d2d8);
  scene.fog = new THREE.Fog(night ? 0x06050b : 0xcfcdd4, night ? 6 : 14, night ? 20 : 42);
  lights.hemi.intensity = night ? 0.08 : 0.62;
  lights.key.intensity = night ? 0.12 : 1.25;
  scene.environmentIntensity = night ? 0.16 : 0.38;
  lights.panelMat.emissiveIntensity = night ? 0.06 : 1.2;
  lights.floorMat.color.setHex(night ? 0x39373f : 0xffffff);
  ["spillL", "spillR", "spillC", "spillT"].forEach(
    (k) => (lights[k].material.opacity = night ? 0.26 : 0.05),
  );
  applyGlow();
  renderer.shadowMap.needsUpdate = true;
  bloom.strength = night ? 0.32 : 0.1;
  bloom.threshold = night ? 0.92 : 1.0;
  bloom.radius = night ? 0.32 : 0.25;
  renderer.toneMappingExposure = 1.0;
}

/* =========================================================
   Loading: the fixture, then the featured theme's graphics, then the shelf
   ========================================================= */
// ---- loading screen progress: fixture 50%, HD graphics 30%, shelf models 20%
const loadParts = { model: 0, gfx: 0, merch: 0 };
let shownPct = 0;
const LOAD_STAGES = [
  [0, "Unpacking the fixture"],
  [20, "Assembling the lightbox towers"],
  [40, "Wiring the LED channels"],
  [52, "Printing the graphics in HD"],
  [80, "Stocking the shelf"],
  [95, "Switching on the aisle lights"],
];
function progress(part, v) {
  loadParts[part] = Math.max(loadParts[part], Math.min(1, v));
  const pct = Math.round(
    (loadParts.model * 0.5 + loadParts.gfx * 0.3 + loadParts.merch * 0.2) * 100,
  );
  if (pct <= shownPct) return;
  shownPct = pct;
  $("#loader")?.style.setProperty("--lp", (pct / 100).toFixed(3));
  const n = $("#ldPct");
  if (n) n.textContent = pct;
  const st = [...LOAD_STAGES].reverse().find(([p]) => pct >= p);
  const el = $("#ldStage");
  if (el && st && el.textContent !== st[1]) el.textContent = st[1];
}
const manager = new THREE.LoadingManager();
const gltfLoader = new GLTFLoader(manager);
gltfLoader.setMeshoptDecoder(MeshoptDecoder);

const refs = {
  nodes: {},
  screens: {},
  tiles: [],
  leds: [],
  hero: {},
  merch: {},
  parts: {},
  merchItems: {},
  pickables: [],
  glbTex: {},
};
let display;
let displayReadyResolve;
const displayReady = new Promise((r) => (displayReadyResolve = r));

// fetch with a progress callback (streamed), used for the fixture and every shelf model
async function fetchBuffer(url, onProgress, estimate = 2600000) {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) throw new Error(url + " could not be loaded (" + res.status + ")");
  if (onProgress && res.body) {
    const total = +res.headers.get("content-length") || estimate;
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      onProgress(Math.min(1, got / total));
    }
    return await new Blob(chunks).arrayBuffer();
  }
  return await res.arrayBuffer();
}
async function loadGLB(url, onProgress, estimate) {
  const buf = await fetchBuffer(url, onProgress, estimate);
  const magic = new Uint8Array(buf, 0, 4);
  if (String.fromCharCode(...magic) !== "glTF") throw new Error("Not a binary glTF (.glb) file");
  try {
    return await gltfLoader.parseAsync(buf, url.replace(/[^/]*$/, ""));
  } catch (e) {
    if (/draco|ktx2|basisu/i.test(e.message || ""))
      throw new Error(
        "This model uses compression the viewer does not support (Draco / KTX2). Export it without compression.",
      );
    throw e;
  }
}
// the fixture download starts at once, before the project arrives (the <link rel=preload> in the page feeds it)
// (in every mode: the preload has already started it, and an unused preload is a console warning)
const fixtureBuffer = fetchBuffer(FIXTURE_URL, (v) => progress("model", v * 0.96)).catch((e) => e);

async function loadDisplay() {
  const buf = await fixtureBuffer;
  if (buf instanceof Error) throw buf;
  const gltf = await gltfLoader.parseAsync(buf, "/roblox/activated-retail/");
  display = gltf.scene;
  scene.add(display);
  display.traverse((o) => {
    refs.nodes[o.name] = o;
    if (o.isMesh) {
      const n = o.name,
        mn = o.material?.name || "";
      const glowing = /SCREEN_|GFX_|LED|Letter/.test(n + mn);
      o.castShadow = !glowing && !/Foot|Kick/.test(n);
      o.receiveShadow = true;
      if (o.material?.map) o.material.map.anisotropy = MAX_ANISO;
      if (/^M_LED|M_Letter/.test(mn)) refs.leds.push(o.material);
    }
  });
  // unique LED materials, toned down to a subtle glow
  refs.leds = [...new Set(refs.leds)];
  for (const m of refs.leds) {
    const k = /Letter_Face/.test(m.name)
      ? 0.24
      : /Letter_Return/.test(m.name)
        ? 0.22
        : /White/.test(m.name)
          ? 0.2
          : 0.26;
    m.emissiveIntensity *= k;
    m.userData.base = m.emissiveIntensity;
  }
  refs.ledPurple = refs.leds.filter((m) => /Purple|Return/.test(m.name));
  refs.ledBlue = refs.leds.filter((m) => /Blue/.test(m.name));
  // screens
  refs.screens.center = refs.nodes["SCREEN_Center"];
  refs.screens.totem = refs.nodes["SCREEN_Totem"];
  refs.towerL = refs.nodes["GFX_TowerL"];
  refs.towerR = refs.nodes["GFX_TowerR"];
  refs.bayBack = refs.nodes["GFX_Bay_Back"];
  for (const [k, o] of Object.entries(refs.nodes))
    if (k.startsWith("SCREEN_Tile_")) {
      o.material = o.material.clone();
      o.userData.base = o.material.emissiveIntensity || 1.3;
      refs.tiles.push(o);
    }
  // the fixture's own prints: the fallback for any graphic a theme doesn't provide
  refs.glbTex = {
    towerL: refs.towerL.material.map,
    towerR: refs.towerR.material.map,
    totem: refs.screens.totem.material.map,
    screen: refs.screens.center.material.map,
    wall: refs.tiles[0]?.material.map,
  };
  refs.screens.totem.material = refs.screens.totem.material.clone();
  // printed/backlit graphics: mostly self-lit, only a little diffuse so the store lights can't blow them out
  refs.graphics = [];
  display.traverse((o) => {
    if (o.isMesh && /^(GFX_|SCREEN_)/.test(o.name)) {
      if (!refs.graphics.includes(o.material)) refs.graphics.push(o.material);
    }
  });
  refs.tiles.forEach((o) => {
    o.userData.base = 0.62;
  });
  const bayShared = refs.bayBack.material;
  refs.bayBack.material = refs.bayBack.material.clone();
  // the bay back and the tower sides carry the platform pattern; a campaign with its own header art switches it off
  refs.bayMats = [refs.bayBack.material, bayShared].map((m) => {
    m.userData.map0 = m.map;
    m.userData.emap0 = m.emissiveMap;
    return m;
  });
  const pl = refs.nodes["GFX_Plinth_Text"];
  if (pl) {
    refs.plinth = pl.material;
    pl.material.userData.map0 = pl.material.map;
    pl.material.userData.emap0 = pl.material.emissiveMap;
  }
  // merch + parts
  for (const [id, f] of Object.entries(FIX)) {
    refs.hero[id] = refs.nodes[f.hero];
    refs.merch[id] = refs.nodes[f.group];
    const g = refs.merch[id];
    refs.merchItems[id] = g
      ? g.children.filter(
          (c) =>
            /^(HERO_|Cap_|Plush_|Tee_|Hoodie_|Keychain_|Mousepad_|Figure_)/.test(c.name) &&
            !/_Art$/.test(c.name),
        )
      : [];
    if (g) g.userData.home = g.position.clone();
  }
  for (const k of Object.keys(PARTS)) {
    const o = refs.nodes[k];
    if (o) {
      refs.parts[k] = o;
      o.userData.home = o.position.clone();
    }
  }
  refs.occluders = [];
  display.traverse((o) => {
    if (
      o.isMesh &&
      /Body|Header_Box|BackWall|Bay_Cheek|Plinth_Body|CenterMonitor_Body/.test(o.name)
    )
      refs.occluders.push(o);
  });
  // cheap acrylic: no transmission pass (that pass re-renders the whole scene every frame)
  display.traverse((o) => {
    if (o.isMesh && o.material && o.material.transmission > 0) {
      const m = o.material;
      m.transmission = 0;
      m.transparent = true;
      m.opacity = 0.22;
      m.roughness = 0.05;
      m.depthWrite = false;
      m.needsUpdate = true;
    }
  });
  setupCenterScreen();
  buildHeaderPanel();
  prepDefaultMerch();
  rebuildPickables();
  renderer.shadowMap.needsUpdate = true;
  displayReadyResolve(display);
}
// pick-meshes: merch + QR tower only (clicks never raycast the whole 300k-triangle scene)
function rebuildPickables() {
  refs.pickables = [];
  for (const id of ZONE_IDS) {
    refs.merch[id]?.traverse((o) => {
      if (o.isMesh) refs.pickables.push(o);
    });
  }
  if (refs.towerR) refs.pickables.push(refs.towerR);
}
const zoneOfGroup = (name) => ZONE_IDS.find((id) => FIX[id].group === name) || null;

/* =========================================================
   Header: the fixture's channel letters read "ROBLOX". A theme's header art (a lightbox, from the
   Monkey Quest demo) replaces them; otherwise brand.headerText does, as lit 3D channel letters.
   ========================================================= */
function buildHeaderPanel() {
  const letters = [];
  display.traverse((o) => {
    if (o.isMesh && /Letter/.test(o.material?.name || "")) letters.push(o);
  });
  const head = refs.parts.PART_Header;
  if (!letters.length || !head) return;
  const lb = new THREE.Box3();
  letters.forEach((o) => lb.expandByObject(o));
  const hb = new THREE.Box3();
  head.traverse((o) => {
    if (o.isMesh && !letters.includes(o)) hb.expandByObject(o);
  });
  // where the fixture's letters sit, in the header's own frame: the brand's letters take their place
  head.updateWorldMatrix(true, false);
  const lo = head.worldToLocal(lb.min.clone()),
    hi = head.worldToLocal(lb.max.clone()),
    hlo = head.worldToLocal(hb.min.clone()),
    hhi = head.worldToLocal(hb.max.clone());
  const fit = {
    cx: (hlo.x + hhi.x) / 2,
    cy: (lo.y + hi.y) / 2,
    front: hi.z,
    depth: hi.z - lo.z,
    capH: (hi.y - lo.y) * 0.62,
    maxW: (hhi.x - hlo.x) * 0.84,
    maxH: Math.min((hi.y - lo.y) * 1.08, (hhi.y - hlo.y) * 0.8),
  };
  const matOf = (re) =>
    letters.find((o) => re.test(o.material.name))?.material || letters[0].material;
  const faceW = (hb.max.x - hb.min.x) * 0.93,
    faceH = (lb.max.y - lb.min.y) * 1.22;
  const aspect = 2048 / 500;
  const w = Math.min(faceW, faceH * aspect),
    h = w / aspect;
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.8,
    roughness: 0.6,
    metalness: 0,
  });
  mat.color.setScalar(0.3);
  const geo = new THREE.PlaneGeometry(w, h);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i)); // textures here are loaded flipY=false
  const plane = new THREE.Mesh(geo, mat);
  plane.name = "GFX_Header";
  plane.visible = false;
  const c = lb.getCenter(new THREE.Vector3());
  plane.position.set((hb.min.x + hb.max.x) / 2, c.y, lb.min.z + 0.004);
  scene.add(plane);
  head.attach(plane);
  refs.header = {
    head,
    plane,
    letters,
    fit,
    face: matOf(/Letter_Face/),
    ret: matOf(/Letter_Return/),
    brand: null, // { text, mesh } once built
    token: 0,
  };
  refs.graphics.push(mat);
}
/**
 * Header art wins; else the brand's letters (brand.headerText); else the fixture's own letters.
 * Resolves once what shows is in place (the brand's letters load their outlines the first time).
 */
function setHeader(tex) {
  const H = refs.header;
  if (!H) return null;
  const on = !!tex,
    text = on ? "" : (PROJECT.brand.headerText || "").trim();
  H.plane.visible = on;
  if (on && H.plane.material.map !== tex) {
    H.plane.material.map = tex;
    H.plane.material.emissiveMap = tex;
    H.plane.material.needsUpdate = true;
  }
  // (while the brand's letters load, the header stays dark rather than showing the wrong name)
  H.letters.forEach((o) => (o.visible = !on && !text));
  const token = ++H.token;
  let done = null;
  if (H.brand) H.brand.mesh.visible = !!text && H.brand.text === text;
  if (text && H.brand?.text !== text)
    done = headerFont()
      .then((font) => {
        if (token === H.token) buildBrandLetters(font, text);
      })
      .catch((e) => postError("Header letters: " + e.message));
  renderer.shadowMap.needsUpdate = true;
  return done;
}

// Unbounded ExtraBold outlines (OFL; assets/unbounded-OFL.txt), fetched only when a project sets headerText
const HEADER_FONT_URL = "/activated-retail/engine/assets/unbounded-800.json";
let headerFontP = null;
function headerFont() {
  if (!headerFontP)
    headerFontP = fetch(HEADER_FONT_URL)
      .then((r) => {
        if (!r.ok) throw new Error("lettering font HTTP " + r.status);
        return r.json();
      })
      .catch((e) => {
        headerFontP = null;
        throw e;
      });
  return headerFontP;
}
/** One line of text as THREE.Shapes in font units (y up, baseline at 0), plus its ink bounds. */
function textShapes(font, text) {
  const shapes = [],
    track = font.upm * 0.03,
    box = new THREE.Box2();
  let x = 0;
  for (const ch of text) {
    const gl = font.g[ch] || font.g[ch.toUpperCase()] || font.g[" "];
    const [adv, d] = gl;
    if (d) {
      const sp = new THREE.ShapePath(),
        tok = d.match(/[MLQCZ]|-?\d+(?:\.\d+)?/g) || [];
      let i = 0,
        cmd = "";
      const n = () => +tok[i++];
      while (i < tok.length) {
        if (/[MLQCZ]/.test(tok[i])) cmd = tok[i++];
        if (cmd === "M") sp.moveTo(x + n(), n());
        else if (cmd === "L") sp.lineTo(x + n(), n());
        else if (cmd === "Q") sp.quadraticCurveTo(x + n(), n(), x + n(), n());
        else if (cmd === "C") sp.bezierCurveTo(x + n(), n(), x + n(), n(), x + n(), n());
        else if (cmd !== "Z") break;
      }
      // TrueType outlines: clockwise contours are solid, counter-clockwise ones are holes
      for (const s of sp.toShapes()) {
        shapes.push(s);
        for (const p of s.getPoints()) box.expandByPoint(p);
      }
    }
    x += adv + track;
  }
  return { shapes, box };
}
/** ExtrudeGeometry makes two draw groups per glyph shape; one per material draws (and exports) cheaper. */
function groupByMaterial(geo) {
  const out = new THREE.BufferGeometry(),
    order = [0, 1].map((mi) => geo.groups.filter((g) => (g.materialIndex || 0) === mi));
  for (const [name, attr] of Object.entries(geo.attributes)) {
    const k = attr.itemSize,
      arr = new attr.array.constructor(attr.array.length);
    let o = 0;
    for (const gs of order)
      for (const g of gs) {
        arr.set(attr.array.subarray(g.start * k, (g.start + g.count) * k), o);
        o += g.count * k;
      }
    out.setAttribute(name, new THREE.BufferAttribute(arr, k));
  }
  let start = 0;
  order.forEach((gs, mi) => {
    const count = gs.reduce((a, g) => a + g.count, 0);
    out.addGroup(start, count, mi);
    start += count;
  });
  geo.dispose();
  return out;
}
/** Lit channel letters spelling the brand, in the fixture letters' place, depth and materials. */
function buildBrandLetters(font, text) {
  const H = refs.header,
    f = H.fit;
  if (H.brand) {
    H.brand.mesh.removeFromParent();
    H.brand.mesh.geometry.dispose();
    H.brand = null;
  }
  const { shapes, box } = textShapes(font, text);
  if (!shapes.length) return;
  // one line, auto-fitted: the fixture's letter height for short names, smaller for long ones,
  // with accents and descenders kept on the header face
  const cap = font.cap,
    half = Math.max(box.max.y - cap / 2, cap / 2 - box.min.y),
    s = Math.min(f.capH / cap, f.maxW / (box.max.x - box.min.x), f.maxH / 2 / half);
  const geo = groupByMaterial(
    new THREE.ExtrudeGeometry(shapes, {
      depth: f.depth / s,
      bevelEnabled: false,
      curveSegments: 6,
    }),
  );
  const mesh = new THREE.Mesh(geo, [H.face, H.ret]);
  mesh.name = "Header_BrandLetters";
  mesh.scale.setScalar(s);
  mesh.position.set(
    f.cx - ((box.min.x + box.max.x) / 2) * s,
    f.cy - (cap / 2) * s,
    f.front - f.depth,
  );
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  H.head.add(mesh);
  H.brand = { text, mesh };
  renderer.shadowMap.needsUpdate = true;
  lastChange = performance.now();
}
// a campaign with its own header art also gets a plain backlit bay (no platform pattern) and its own
// plinth line; brand.tagline replaces the fixture's line ("REAL WORLDS. MORE PLAY.") on any theme
function plinthLine(th, custom) {
  const tag = (PROJECT.brand.tagline || "").trim();
  if (tag) return [[tag.toUpperCase(), "#fff"]];
  if (custom)
    return [
      [(th.game || th.name).toUpperCase() + ".", "#fff"],
      ["  TAP TO UNLOCK.", lightHex(th.led)],
    ];
  return null;
}
const plinthCache = new Map();
/** The plinth's lit line from [text, colour] runs, set like the fixture's print. */
function plinthTexture(runs) {
  const key = JSON.stringify(runs);
  if (plinthCache.has(key)) return plinthCache.get(key);
  for (const t of plinthCache.values()) retireTexture(t);
  plinthCache.clear();
  const W = 2048,
    H = 877,
    c = KA.makeCanvas(W, H),
    g = c.getContext("2d");
  const draw = () => {
    g.fillStyle = "#000";
    g.fillRect(0, 0, W, H);
    // tall, condensed caps like the fixture's own plinth print: the display face squeezed to 72% width,
    // auto-fitted to the recess
    const squeeze = 0.72;
    g.font = `700 100px ${KA.FONT_DISPLAY}`;
    const ws = runs.map(([t]) => g.measureText(t).width),
      w100 = ws.reduce((a, b) => a + b, 0) || 1;
    const size = Math.min(H * 0.2, (W * 0.74 * 100) / (w100 * squeeze));
    g.font = `700 ${size}px ${KA.FONT_DISPLAY}`;
    g.textBaseline = "middle";
    const total = ((w100 * size) / 100) * squeeze;
    g.save();
    g.translate((W - total) / 2, H / 2);
    g.scale(squeeze, 1);
    let x = 0;
    runs.forEach(([t, col], i) => {
      g.fillStyle = col;
      g.fillText(t, x, 0);
      x += (ws[i] * size) / 100;
    });
    g.restore();
  };
  draw();
  const t = new THREE.CanvasTexture(c);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAX_ANISO;
  // drawn before the web font arrived: draw it again once it has
  try {
    if (document.fonts && !document.fonts.check("700 100px Unbounded"))
      document.fonts
        .load("700 100px Unbounded")
        .then(() => {
          if (plinthCache.get(key) === t && document.fonts.check("700 100px Unbounded")) {
            draw();
            t.needsUpdate = true;
          }
        })
        .catch(() => {});
  } catch (e) {}
  plinthCache.set(key, t);
  return t;
}
function applyFixtureLook(th, custom) {
  for (const m of refs.bayMats || []) {
    const map = custom ? null : m.userData.map0,
      em = custom ? null : m.userData.emap0;
    if (m.map !== map || m.emissiveMap !== em) {
      m.map = map;
      m.emissiveMap = em;
      m.needsUpdate = true;
    }
  }
  const pm = refs.plinth;
  if (pm) {
    const runs = plinthLine(th, custom),
      t = runs ? plinthTexture(runs) : pm.userData.map0;
    if (pm.map !== t) {
      pm.map = t;
      if (pm.userData.emap0 || runs) pm.emissiveMap = runs ? t : pm.userData.emap0;
      pm.needsUpdate = true;
    }
  }
}
function lightHex(hex) {
  const c = new THREE.Color(hex),
    o = {};
  c.getHSL(o, THREE.SRGBColorSpace);
  c.setHSL(o.h, Math.min(1, Math.max(0.85, o.s)), Math.max(0.66, o.l), THREE.SRGBColorSpace);
  return "#" + c.getHexString();
}

/* =========================================================
   QR codes (qrcode.min.js): drawn as crisp modules on canvases and textures
   ========================================================= */
function qrMatrix(text) {
  try {
    const q = window.QRCode?.create?.(text, { errorCorrectionLevel: "M" });
    return q ? { n: q.modules.size, d: q.modules.data } : null;
  } catch (e) {
    return null;
  }
}
/** Draw a QR for text into the square (x,y,S) with a white quiet zone of `quiet` modules. */
function drawQR(g, text, x, y, S, quiet = 1) {
  const m = qrMatrix(text);
  if (!m) return false;
  const n = m.n + quiet * 2,
    cell = S / n;
  g.fillStyle = "#fff";
  g.fillRect(x, y, S, S);
  g.fillStyle = "#0b0a12";
  for (let r = 0; r < m.n; r++)
    for (let c = 0; c < m.n; c++)
      if (m.d[r * m.n + c]) {
        const x0 = Math.round(x + (c + quiet) * cell),
          y0 = Math.round(y + (r + quiet) * cell);
        g.fillRect(
          x0,
          y0,
          Math.round(x + (c + quiet + 1) * cell) - x0,
          Math.round(y + (r + quiet + 1) * cell) - y0,
        );
      }
  return true;
}
function qrCanvas(text, S = 512) {
  const c = KA.makeCanvas(S, S);
  return drawQR(c.getContext("2d"), text, 0, 0, S, 2) ? c : null;
}
// Find a QR code printed in panel art, so the live code replaces it in place. Classic finder-pattern scan:
// dark-light-dark-light-dark runs in a 1:1:3:1:1 ratio, confirmed across; three of them in an L make the code.
function findQR(img) {
  const W0 = img.naturalWidth || img.width,
    H0 = img.naturalHeight || img.height;
  if (!W0 || !H0) return null;
  const k = Math.min(1, 420 / W0),
    w = Math.max(8, Math.round(W0 * k)),
    h = Math.max(8, Math.round(H0 * k));
  const c = KA.makeCanvas(w, h),
    g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data,
    dark = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++)
    dark[i] = 0.3 * px[i * 4] + 0.59 * px[i * 4 + 1] + 0.11 * px[i * 4 + 2] < 128 ? 1 : 0;
  const runsOf = (get, len) => {
    const out = [];
    let v = get(0),
      s = 0;
    for (let i = 1; i <= len; i++) {
      const nv = i < len ? get(i) : -1;
      if (nv !== v) {
        out.push([v, s, i - s]);
        v = nv;
        s = i;
      }
    }
    return out;
  };
  const ratio = (r) => {
    const tot = r.reduce((a, b) => a + b, 0);
    if (tot < 7) return 0;
    const m = tot / 7,
      t = m * 0.7;
    return Math.abs(r[0] - m) < t &&
      Math.abs(r[1] - m) < t &&
      Math.abs(r[2] - 3 * m) < 3 * t &&
      Math.abs(r[3] - m) < t &&
      Math.abs(r[4] - m) < t
      ? m
      : 0;
  };
  const cands = [];
  for (let y = 0; y < h; y++) {
    const runs = runsOf((i) => dark[y * w + i], w);
    for (let i = 0; i + 4 < runs.length; i++) {
      if (runs[i][0] !== 1) continue;
      const m = ratio(runs.slice(i, i + 5).map((r) => r[2]));
      if (!m) continue;
      const cx = Math.round(runs[i + 2][1] + runs[i + 2][2] / 2);
      const col = runsOf((j) => dark[j * w + cx], h);
      const j = col.findIndex((r) => y >= r[1] && y < r[1] + r[2]);
      if (j < 2 || j + 2 >= col.length || col[j][0] !== 1) continue;
      const mv = ratio(col.slice(j - 2, j + 3).map((r) => r[2]));
      if (!mv || mv / m > 1.6 || m / mv > 1.6) continue;
      cands.push({ x: cx, y: col[j][1] + col[j][2] / 2, m: (m + mv) / 2 });
    }
  }
  const cl = [];
  for (const p of cands) {
    const q = cl.find((q) => Math.hypot(q.x - p.x, q.y - p.y) < q.m * 3);
    if (q) {
      q.x = (q.x * q.n + p.x) / (q.n + 1);
      q.y = (q.y * q.n + p.y) / (q.n + 1);
      q.m = (q.m * q.n + p.m) / (q.n + 1);
      q.n++;
    } else cl.push({ ...p, n: 1 });
  }
  const pts = cl.filter((q) => q.n >= 2);
  let best = null;
  for (const a of pts)
    for (const b of pts)
      for (const d of pts) {
        if (a === b || a === d || b === d) continue;
        // a = top-left corner, b = top-right, d = bottom-left; the art is upright, so the L is axis-aligned
        const ab = b.x - a.x,
          ad = d.y - a.y;
        if (ab <= 0 || ad <= 0) continue;
        if (
          Math.abs(b.y - a.y) > a.m * 2 ||
          Math.abs(d.x - a.x) > a.m * 2 ||
          Math.abs(ab - ad) > Math.max(ab, ad) * 0.12
        )
          continue;
        const ms = [a.m, b.m, d.m];
        if (Math.max(...ms) / Math.min(...ms) > 1.5) continue;
        if (!best || ab > best.ab) best = { a, b, d, ab, m: (a.m + b.m + d.m) / 3 };
      }
  if (!best) return null;
  const m = best.m,
    x0 = best.a.x - 3.5 * m,
    y0 = best.a.y - 3.5 * m,
    x1 = best.b.x + 3.5 * m,
    y1 = best.d.y + 3.5 * m;
  return { x: x0 / k, y: y0 / k, s: Math.max(x1 - x0, y1 - y0) / k, m: m / k };
}
/** Panel art with the live QR: in place of a printed code when there is one, else on a tile at the QR spot. */
function qrComposite(img, url, crop) {
  const W = img.naturalWidth || img.width,
    H = img.naturalHeight || img.height;
  const c = KA.makeCanvas(W, H),
    g = c.getContext("2d");
  g.drawImage(img, 0, 0, W, H);
  const found = findQR(img);
  if (found) {
    const pad = found.m * 1.2;
    g.fillStyle = "#fff";
    g.fillRect(found.x - pad, found.y - pad, found.s + pad * 2, found.s + pad * 2);
    drawQR(g, url, found.x, found.y, found.s, 0);
  } else {
    // the part of the image the tower shows (towers map u 0.2–0.8 of the fixture's own print)
    const vx0 = crop ? crop[0] * W : 0,
      vw = crop ? (crop[1] - crop[0]) * W : W,
      S = vw * 0.44,
      x = vx0 + (vw - S) / 2,
      y = H * 0.4 - S / 2,
      r = S * 0.1;
    g.save();
    g.shadowColor = "rgba(0,0,0,.35)";
    g.shadowBlur = S * 0.08;
    g.fillStyle = "#fff";
    g.beginPath();
    g.roundRect(x - S * 0.06, y - S * 0.06, S * 1.12, S * 1.12, r);
    g.fill();
    g.restore();
    drawQR(g, url, x, y, S, 1);
  }
  return c;
}

/* =========================================================
   Live center screen (canvas composited over the key art)
   ========================================================= */
let screenCtx,
  screenTex,
  screenBase = null,
  hdScreenTex = null,
  heroQR = null,
  exporting = false;
const live = { acts: 1284, returns: 912, session: 0, perSku: {}, hourly: [] };
{
  const r = rand(3);
  for (let i = 0; i < 12; i++) {
    live.hourly.push(Math.round(40 + 80 * Math.sin((i / 11) * Math.PI) + r() * 30));
  }
}
function setupCenterScreen() {
  const CW = small ? 1280 : 1792,
    CH = Math.round((CW * 9) / 16);
  const c = document.createElement("canvas");
  c.width = CW;
  c.height = CH;
  screenCtx = c.getContext("2d");
  screenCtx.scale(CW / 1280, CH / 720);
  screenTex = new THREE.CanvasTexture(c);
  screenTex.flipY = false;
  screenTex.colorSpace = THREE.SRGBColorSpace;
  screenTex.anisotropy = MAX_ANISO;
  const m = refs.screens.center.material;
  m.map = screenTex;
  m.emissiveMap = screenTex;
  m.emissive = new THREE.Color(0xffffff);
  m.emissiveIntensity = 0.8;
  m.needsUpdate = true;
}
const qrLabel = (u) => {
  try {
    const x = new URL(u);
    return x.hostname.replace(/^www\./, "") + (x.pathname.length > 1 ? "/…" : "");
  } catch (e) {
    return "";
  }
};
function drawScreen(t) {
  if (!screenCtx || exporting) return;
  const g = screenCtx,
    W = 1280,
    H = 720;
  const cyc = 18,
    ph = ((t % cyc) / cyc) * 3;
  const slide = Math.floor(ph),
    f = ph - slide;
  g.globalAlpha = 1;
  g.fillStyle = "#07061a";
  g.fillRect(0, 0, W, H);
  const theme = THEMES[currentTheme];
  if (!theme) return;
  const scrM = refs.screens.center.material;
  const artTex = slide === 0 && hdScreenTex && hdScreenTex.image ? hdScreenTex : screenTex;
  if (scrM.map !== artTex) {
    scrM.map = artTex;
    scrM.emissiveMap = artTex;
  }
  {
    const e = Math.min(f, 1 - f),
      k = Math.min(1, e / 0.06);
    scrM.emissiveIntensity = GLOW.screen * k;
    scrM.color.setScalar(GLOW.diffuse * k);
  }
  if (slide === 0) {
    if (artTex !== screenTex) return;
    if (screenBase) g.drawImage(screenBase, 0, 0, W, H);
  } else if (slide === 1) {
    const gr = g.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, "#120a33");
    gr.addColorStop(1, "#050414");
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    if (screenBase) {
      g.globalAlpha = 0.22;
      g.drawImage(screenBase, 0, 0, W, H);
      g.globalAlpha = 1;
    }
    const col = "#" + new THREE.Color(theme.led).getHexString();
    g.fillStyle = "#fff";
    g.font = "700 92px Unbounded, Arial Black, sans-serif";
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    g.fillText("SCAN.", 90, 250);
    g.fillText("PLAY.", 90, 360);
    g.fillStyle = col;
    g.fillText("UNLOCK.", 90, 470);
    const qrUrl = PROJECT.activation.qrUrl;
    g.fillStyle = "#c9c4e0";
    g.font = "500 30px Figtree, sans-serif";
    g.fillText(
      heroQR
        ? fitText(g, "Scan with your phone to play " + theme.game, 560)
        : "Tap any product to unlock exclusive in-game content",
      92,
      540,
    );
    g.font = "500 22px JetBrains Mono, monospace";
    g.fillStyle = "#8f89ad";
    g.fillText("ACTIVATED MERCHANDISE®  ·  NO APP NEEDED", 92, 600);
    if (heroQR) {
      // the real, scannable code: point a phone at the screen
      const cx = 1010,
        cy = 350,
        S = 330;
      const p = (t * 0.5) % 1;
      g.strokeStyle = `rgba(255,255,255,${(1 - p) * 0.6})`;
      g.lineWidth = 4;
      g.beginPath();
      g.roundRect(
        cx - S / 2 - 18 - p * 40,
        cy - S / 2 - 18 - p * 40,
        S + 36 + p * 80,
        S + 36 + p * 80,
        34 + p * 20,
      );
      g.stroke();
      g.fillStyle = "#fff";
      g.beginPath();
      g.roundRect(cx - S / 2 - 14, cy - S / 2 - 14, S + 28, S + 28, 24);
      g.fill();
      g.imageSmoothingEnabled = false;
      g.drawImage(heroQR, cx - S / 2, cy - S / 2, S, S);
      g.imageSmoothingEnabled = true;
      g.fillStyle = "#c9c4e0";
      g.font = "600 26px JetBrains Mono, monospace";
      g.textAlign = "center";
      g.fillText(qrLabel(qrUrl), cx, cy + S / 2 + 60);
    } else {
      // animated NFC rings
      const cx = 1010,
        cy = 360;
      for (let i = 0; i < 3; i++) {
        const p = (t * 0.6 + i / 3) % 1;
        g.strokeStyle = `rgba(255,255,255,${(1 - p) * 0.8})`;
        g.lineWidth = 5;
        g.beginPath();
        g.arc(cx, cy, 40 + p * 170, 0, Math.PI * 2);
        g.stroke();
      }
      g.fillStyle = col;
      g.beginPath();
      g.roundRect(cx - 55, cy - 55, 110, 110, 22);
      g.fill();
      g.fillStyle = "#0b0a12";
      g.font = "700 30px JetBrains Mono, monospace";
      g.textAlign = "center";
      g.fillText("NFC", cx, cy + 10);
    }
  } else {
    g.fillStyle = "#07061a";
    g.fillRect(0, 0, W, H);
    const col = "#" + new THREE.Color(theme.led).getHexString();
    g.textAlign = "left";
    g.fillStyle = "#8f89ad";
    g.font = "500 26px JetBrains Mono, monospace";
    g.fillText("ACTIVATIONS AT THIS DISPLAY · TODAY", 90, 150);
    g.fillStyle = "#fff";
    g.font = "700 190px Unbounded, Arial Black, sans-serif";
    g.fillText(live.acts.toLocaleString("en-US"), 80, 360);
    g.fillStyle = col;
    g.font = "700 54px Unbounded, Arial Black, sans-serif";
    g.fillText(
      fitText(g, live.returns.toLocaleString("en-US") + " back in " + theme.game, 1110),
      90,
      460,
    );
    // mini bars
    const vals = live.hourly,
      max = Math.max(...vals);
    vals.forEach((v, i) => {
      const bh = (v / max) * 150;
      g.fillStyle = i === vals.length - 1 ? col : "rgba(255,255,255,.28)";
      g.fillRect(90 + i * 52, 640 - bh, 36, bh);
    });
    g.fillStyle = "#8f89ad";
    g.font = "500 20px JetBrains Mono, monospace";
    g.fillText("SCANS / HOUR", 90 + 12 * 52 + 10, 640);
  }
  // scanline sheen
  g.fillStyle = "rgba(255,255,255,0.035)";
  const sy = (t * 140) % H;
  g.fillRect(0, sy, W, 26);
  screenTex.needsUpdate = true;
}
// trim text to a pixel width with an ellipsis (canvas copy comes from the project and can be long)
function fitText(g, s, maxW) {
  if (g.measureText(s).width <= maxW) return s;
  let t = s;
  while (t.length > 1 && g.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t.trimEnd() + "…";
}

/* =========================================================
   Graphics: where every panel of a theme comes from
   - an image (uploaded or on the site), the phone-sized variant on small screens
   - the key-art composer (keyart.js), for "keyart" themes and for panels a theme leaves empty
   - the fixture's own print, when a theme has neither
   Only the featured theme's graphics live on the GPU; others stay decoded, ready to upload.
   ========================================================= */
const SLOTS = ["towerL", "towerR", "totem", "wall", "screen"];
// the HD graphics are pre-cropped to the part of the panel that shows; the fixture's own prints are not
const CROP = { towerL: [0.2, 0.8], towerR: [0.2, 0.8], totem: [0.1, 0.9] };
const texCache = new Map(); // key → THREE.Texture (userData: ready, failed, wait[])
const kaSets = new Map(); // key-art set key → { promise, used }
function newTex(key, slot, crop = true) {
  const t = new THREE.Texture();
  t.userData = { ready: false, failed: false, wait: [], slot, key };
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAX_ANISO;
  const c = crop && CROP[slot];
  if (c) {
    const w = c[1] - c[0];
    t.repeat.set(1 / w, 1);
    t.offset.set(-c[0] / w, 0);
  }
  texCache.set(key, t);
  return t;
}
function settleTex(t, image) {
  if (image) {
    t.image = image;
    t.needsUpdate = true;
  } else t.userData.failed = true;
  t.userData.ready = true;
  t.userData.wait.splice(0).forEach((f) => f(t));
}
const whenTex = (t) =>
  new Promise((res) => {
    t.userData.ready ? res(t) : t.userData.wait.push(res);
  });
function loadImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = async () => {
      try {
        await img.decode();
      } catch (e) {}
      res(img);
    };
    img.onerror = () => rej(new Error("Image could not be loaded: " + url));
    img.src = url;
  });
}
function keyArtKey(th) {
  return [
    imgUrl(th.graphics.keyArt),
    th.led,
    th.led2,
    th.bay,
    th.game,
    th.site,
    PROJECT.activation.qrUrl || "",
  ].join("~");
}
function slotSource(th, slot) {
  const g = th.graphics,
    ref = g[slot],
    ka = g.keyArt,
    qr = slot === "towerR" ? PROJECT.activation.qrUrl : null;
  if (slot === "header")
    return ref
      ? { kind: "url", url: imgUrl(ref), key: "u:" + imgUrl(ref) + "|header", slot }
      : null;
  if (ref && !(g.mode === "keyart" && ka)) {
    const url = imgUrl(ref);
    return { kind: "url", url, qr, slot, key: "u:" + url + "|" + slot + (qr ? "|qr:" + qr : "") };
  }
  if (ka)
    return { kind: "keyart", th, slot, set: keyArtKey(th), key: "k:" + keyArtKey(th) + "|" + slot };
  return { kind: "glb", qr, slot, key: "g:" + slot + (qr ? "|qr:" + qr : "") };
}
const themeSources = (id) => {
  const th = THEMES[id];
  return th ? [...SLOTS, "header"].map((s) => slotSource(th, s)).filter(Boolean) : [];
};
/** The texture for a source (loads it the first time). Resolves null when it can't be had. */
async function ensureSource(src) {
  if (src.kind === "glb" && !src.qr) {
    await displayReady;
    return refs.glbTex[src.slot] || null;
  }
  let t = texCache.get(src.key);
  if (!t) {
    if (src.kind === "keyart") {
      buildKeyArt(src.th);
      t = texCache.get(src.key);
    } else {
      t = newTex(src.key, src.slot, src.kind === "url");
      if (src.kind === "url")
        loadImage(src.url)
          .then((img) => settleTex(t, src.qr ? qrComposite(img, src.qr, null) : img))
          .catch((e) => {
            postError(e.message);
            settleTex(t, null);
          });
      else
        displayReady.then(() => {
          const img = refs.glbTex[src.slot]?.image;
          settleTex(t, img ? qrComposite(img, src.qr, CROP[src.slot]) : null);
        });
    }
  }
  if (src.kind === "keyart") {
    const s = kaSets.get(src.set);
    if (s) s.used = performance.now();
  }
  await whenTex(t);
  return t.userData.failed ? null : t;
}
// "Your IP" composer: every panel from one key-art image, LEDs from the theme
function buildKeyArt(th) {
  const set = keyArtKey(th);
  if (kaSets.has(set)) return kaSets.get(set).promise;
  const texs = {};
  for (const slot of SLOTS) texs[slot] = newTex("k:" + set + "|" + slot, slot, true);
  const qrUrl = PROJECT.activation.qrUrl,
    url = imgUrl(th.graphics.keyArt);
  const entry = {
    used: performance.now(),
    promise: (async () => {
      try {
        const img = await loadImage(url);
        const src = KA.toWorking(img);
        await KA.fonts();
        const pal = {
          led: th.led,
          led2: th.led2,
          bay: th.bay,
          spill: th.spill,
          text: lightHex("#" + th.led.toString(16).padStart(6, "0")),
        };
        const meta = KA.meta(src, th.game, pal);
        meta.site = th.site || "";
        if (qrUrl) meta.qr = (g, x, y, S) => drawQR(g, qrUrl, x, y, S, 1);
        await new Promise((r) => setTimeout(r, 0));
        const cv = KA.composeSlots(meta, SLOTS, small);
        for (const slot of SLOTS) settleTex(texs[slot], cv[slot]);
      } catch (e) {
        postError("Key art could not be loaded: " + url);
        for (const slot of SLOTS) if (!texs[slot].userData.ready) settleTex(texs[slot], null);
      }
    })(),
  };
  kaSets.set(set, entry);
  trimKeyArt();
  return entry.promise;
}
// composed sets are big canvases: keep the two most recently used (plus whatever is on screen)
function trimKeyArt() {
  if (kaSets.size <= 2) return;
  const inUse = new Set(
    themeSources(currentTheme)
      .filter((s) => s.kind === "keyart")
      .map((s) => s.set),
  );
  const drop = [...kaSets.entries()]
    .filter(([k]) => !inUse.has(k))
    .sort((a, b) => a[1].used - b[1].used)
    .slice(0, kaSets.size - 2);
  for (const [k] of drop) {
    for (const slot of SLOTS) dropTex("k:" + k + "|" + slot);
    kaSets.delete(k);
  }
}
function dropTex(key) {
  const t = texCache.get(key);
  if (!t) return;
  retireTexture(t);
  texCache.delete(key);
}
function loadThemeTextures(id, onEach) {
  const list = themeSources(id);
  let n = 0;
  return Promise.all(
    list.map((src) =>
      ensureSource(src).then((t) => {
        n++;
        onEach && onEach(n / list.length);
        return t;
      }),
    ),
  );
}
function uploadThemeTextures(id) {
  for (const src of themeSources(id)) {
    const t = src.kind === "glb" && !src.qr ? refs.glbTex[src.slot] : texCache.get(src.key);
    if (t?.image && !t.userData?.failed) {
      try {
        renderer.initTexture(t);
      } catch (e) {}
    }
  }
}
function releaseThemeTextures(prev, next) {
  const keep = new Set(themeSources(next).map((s) => s.key));
  for (const src of themeSources(prev)) {
    if (keep.has(src.key)) continue;
    const t = src.kind === "glb" && !src.qr ? refs.glbTex[src.slot] : texCache.get(src.key);
    t?.dispose();
  }
}
// after a project change: forget every graphic no theme uses any more (GPU copy and decoded image)
function gcTextures() {
  const keep = new Set(),
    sets = new Set();
  for (const id of Object.keys(THEMES))
    for (const s of themeSources(id)) {
      keep.add(s.key);
      if (s.kind === "keyart") sets.add(s.set);
    }
  const onScreen = new Set([
    refs.towerL?.material.map,
    refs.towerR?.material.map,
    refs.screens.totem?.material.map,
    refs.tiles[0]?.material.map,
    hdScreenTex,
    refs.header?.plane.material.map,
  ]);
  for (const [k, t] of [...texCache.entries()])
    if (!keep.has(k) && !onScreen.has(t) && t.userData.ready) dropTex(k);
  for (const k of [...kaSets.keys()]) if (!sets.has(k)) kaSets.delete(k);
}
function preloadThemeTextures() {
  const ids = Object.keys(THEMES).filter((id) => id !== currentTheme);
  let i = 0;
  const step = () => {
    if (i >= ids.length) return;
    loadThemeTextures(ids[i++]).then(() => setTimeout(step, 300));
  };
  step();
}
const GLOW = { diffuse: 0.3, emit: 0.72, screen: 0.82, bay: 0.42 };
function applyGlow() {
  const night = lightMode === "night";
  GLOW.diffuse = night ? 0.22 : 0.32;
  GLOW.emit = night ? 0.8 : 0.7;
  GLOW.screen = night ? 0.86 : 0.78;
  GLOW.bay = night ? 0.5 : 0.34;
  for (const m of refs.graphics || []) {
    if (m === refs.screens?.center?.material) continue;
    m.color.setScalar(GLOW.diffuse);
    m.emissive.setRGB(1, 1, 1);
    m.emissiveIntensity = GLOW.emit;
  }
  (refs.tiles || []).forEach((o) => {
    o.material.color.setScalar(GLOW.diffuse);
    o.material.emissive.setRGB(1, 1, 1);
  });
  if (refs.bayBack) {
    refs.bayBack.material.emissiveIntensity = GLOW.bay;
  }
}

/* =========================================================
   Themes (featured property / campaign): project themes → fixture colours + graphics
   ========================================================= */
let THEMES = {};
let currentTheme = null;
function buildThemes() {
  const out = {};
  for (const t of PROJECT.themes) {
    const led = hexInt(t.led),
      led2 = hexInt(t.led2);
    out[t.id] = {
      id: t.id,
      name: t.name,
      led,
      led2,
      // derived like the key-art palette: the bay a little lighter than LED A, the floor spill in LED A
      bay: t.bay ? hexInt(t.bay) : KA.mix(led, 0xffffff, 0.14),
      spill: t.spill ? hexInt(t.spill) : led,
      hs: t.markers.product ? hexInt(t.markers.product) : null,
      hs2: t.markers.activation ? hexInt(t.markers.activation) : null,
      graphics: t.graphics,
      site: t.site,
      game: t.game || t.name,
    };
  }
  THEMES = out;
}
const siteLabel = (th) =>
  th.site ||
  (() => {
    try {
      return new URL(PROJECT.activation.url).hostname.replace(/^www\./, "").toUpperCase();
    } catch (e) {
      return "ACTIVATED MERCHANDISE®";
    }
  })();

let themeReady = Promise.resolve();
function setTheme(id, { silent = false } = {}) {
  if (!display || !THEMES[id]) return themeReady;
  // (the shelf belongs to the project, not the theme, so a held product can stay in hand)
  const prev = currentTheme;
  currentTheme = id;
  const th = THEMES[id];
  document
    .querySelectorAll("[data-theme]")
    .forEach((b) => b.setAttribute("aria-pressed", b.dataset.theme === id));
  const token = (setTheme.token = (setTheme.token || 0) + 1);
  const srcs = Object.fromEntries(themeSources(id).map((s) => [s.slot, s]));
  themeReady = Promise.all(
    [...SLOTS, "header"].map((slot) => (srcs[slot] ? ensureSource(srcs[slot]) : null)),
  ).then((texs) => {
    if (token !== setTheme.token) return;
    const T = Object.fromEntries(
      [...SLOTS, "header"].map((s, i) => [s, texs[i] || (s === "header" ? null : refs.glbTex[s])]),
    );
    const put = (mat, t) => {
      if (!t || mat.map === t) return;
      mat.map = t;
      mat.emissiveMap = t;
      mat.needsUpdate = true;
    };
    uploadThemeTextures(id);
    put(refs.towerL.material, T.towerL);
    put(refs.towerR.material, T.towerR);
    put(refs.screens.totem.material, T.totem);
    refs.tiles.forEach((o) => put(o.material, T.wall));
    hdScreenTex = T.screen;
    screenBase = hdScreenTex?.image || null;
    loop.drew0 = false;
    const header = setHeader(T.header);
    applyFixtureLook(th, !!T.header);
    if (prev && prev !== id) releaseThemeTextures(prev, id);
    renderer.shadowMap.needsUpdate = true;
    return header; // the theme is ready once the brand's letters are up
  });
  const c1 = new THREE.Color(th.led),
    c2 = new THREE.Color(th.led2);
  refs.ledPurple.forEach((m) => {
    m.color.copy(c1);
    m.emissive.copy(c1);
  });
  refs.ledBlue.forEach((m) => {
    m.color.copy(c2);
    m.emissive.copy(c2);
  });
  refs.bayBack.material.emissive = new THREE.Color(th.bay);
  refs.bayBack.material.color = new THREE.Color(th.bay).multiplyScalar(0.5);
  refs.bayBack.material.emissiveIntensity = GLOW.bay;
  ["spillL", "spillR", "spillC"].forEach((k) => lights[k].material.color.setHex(th.spill));
  lights.spillT.material.color.setHex(th.led2);
  rings.forEach((r) => r.material.color.set(th.led));
  disc.material.color.set(th.led);
  const rgbOf = (c, lift) => {
    const h = new THREE.Color(c).lerp(new THREE.Color(0xffffff), lift).getHex();
    return [(h >> 16) & 255, (h >> 8) & 255, h & 255].join(",");
  };
  document.documentElement.style.setProperty("--hs-rgb", rgbOf(th.hs ?? th.led, 0.14));
  document.documentElement.style.setProperty("--hs2-rgb", rgbOf(th.hs2 ?? th.led2, 0.08));
  document.documentElement.style.setProperty(
    "--accent",
    "#" + c1.clone().lerp(new THREE.Color(0xffffff), 0.18).getHexString(),
  );
  applyThemeCopy(th);
  relabelHotspots();
  if (!silent && started && prev !== id)
    toast(
      th.name +
        (PROJECT.activation.qrUrl
          ? " · the QR on the right tower is live"
          : " · same fixture, new graphics"),
    );
  renderer.shadowMap.needsUpdate = true;
  return themeReady;
}

/* =========================================================
   Shelf zones: the fixture's sample merch (optionally recoloured / printed), an uploaded model,
   or an acrylic cut-out made from a transparent image. Every slot of a zone gets the same product,
   fitted to the slot (the EVADE merch code from the demo, generalised).
   ========================================================= */
const zoneState = {}; // id → { key, variants:[[item,variant]], mixers:[], dispose, failed }
const assetCache = new Map(); // model url → { promise, users:Set(zone ids) }
const TEX_KEYS = [
  "map",
  "emissiveMap",
  "normalMap",
  "roughnessMap",
  "metalnessMap",
  "aoMap",
  "alphaMap",
  "bumpMap",
  "clearcoatMap",
  "clearcoatNormalMap",
  "clearcoatRoughnessMap",
  "specularColorMap",
  "specularIntensityMap",
  "sheenColorMap",
  "sheenRoughnessMap",
  "transmissionMap",
  "thicknessMap",
  "lightMap",
  "displacementMap",
  "iridescenceMap",
  "anisotropyMap",
];
// Free a texture for good. three.js's shared shadow depth material can keep the last map it drew in a
// uniform and upload it again after dispose(); pointing the texture at a 1×1 placeholder first makes
// that a no-op instead of re-uploading a freed image (or a closed ImageBitmap, which WebGL rejects).
const RETIRED = KA.makeCanvas(1, 1);
function retireTexture(t) {
  if (!t) return;
  const img = t.image;
  t.dispose();
  if (img === RETIRED) return;
  t.image = RETIRED;
  try {
    img?.close?.();
  } catch (e) {}
}
function disposeTree(root) {
  const geos = new Set(),
    mats = new Set();
  root.traverse((o) => {
    if (o.geometry) geos.add(o.geometry);
    const m = o.material;
    (Array.isArray(m) ? m : [m]).forEach((x) => x && mats.add(x));
  });
  geos.forEach((g) => g.dispose());
  mats.forEach((m) => {
    for (const k of TEX_KEYS) retireTexture(m[k]);
    m.dispose();
  });
}
const zoneLabel = (id) => PROJECT.zones[id]?.product.label || id;
function zoneModelKey(id) {
  const z = PROJECT.zones[id];
  if (!z.enabled) return "off";
  const m = z.model;
  if (m.source === "asset" && m.asset) return JSON.stringify(["a", m.asset, m.yaw, m.scale]);
  if (m.source === "image" && m.image)
    return JSON.stringify(["i", imgUrl(m.image), m.yaw, m.scale]);
  // a desk mat with a print becomes a printed roll (the Monkey Quest demo's rolled mat)
  if (id === "mousepad" && m.source === "default" && m.print)
    return JSON.stringify(["r", imgUrl(m.print), m.tint, m.yaw, m.scale]);
  return "default";
}
// what a zone looks like (snapshots of the product are cached per look)
const zoneLook = (id) => {
  const m = PROJECT.zones[id].model;
  return (
    zoneModelKey(id) +
    "|" +
    (m.source === "default" ? (m.tint || "") + "|" + (imgUrl(m.print) || "") : "")
  );
};

// Every build of a zone holds its own handle on the model, so rebuilding a zone with the same
// model (a new yaw or scale) never frees the copy the new variants use.
async function acquireAsset(url) {
  const user = Symbol(url);
  let e = assetCache.get(url);
  if (!e) {
    e = {
      users: new Set(),
      promise: loadGLB(url, null, 1500000).then((g) => {
        // a product model brings its meshes only: never its lights or cameras
        const extra = [];
        g.scene.traverse((o) => {
          if (o.isLight || o.isCamera) extra.push(o);
        });
        extra.forEach((o) => o.removeFromParent());
        return g;
      }),
    };
    assetCache.set(url, e);
    e.promise.catch(() => {
      if (assetCache.get(url) === e) assetCache.delete(url);
    });
  }
  e.users.add(user);
  let gltf;
  try {
    gltf = await e.promise;
  } catch (err) {
    e.users.delete(user);
    throw err;
  }
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    e.users.delete(user);
    if (!e.users.size) {
      if (assetCache.get(url) === e) assetCache.delete(url);
      disposeTree(gltf.scene);
    }
  };
  return { gltf, release };
}
function cloneAsset(gltf, m, id) {
  const inner = SkeletonUtils.clone(gltf.scene);
  inner.rotation.y = THREE.MathUtils.degToRad(m.yaw || 0);
  const wrap = new THREE.Group();
  wrap.add(inner);
  inner.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      if (o.material?.map) o.material.map.anisotropy = MAX_ANISO;
      // plush reads as fabric, never as metal (generated models often carry a metalness map)
      if (id === "plush" && o.material && !Array.isArray(o.material)) {
        o.material.roughness = Math.max(0.85, o.material.roughness ?? 1);
        o.material.metalness = 0;
      }
    }
  });
  let mixer = null;
  if (gltf.animations?.length) {
    mixer = new THREE.AnimationMixer(inner);
    const a = mixer.clipAction(gltf.animations[0]);
    a.play();
    a.time = Math.random() * gltf.animations[0].duration;
  }
  return { obj: wrap, mixer };
}

/* ---------- acrylic cut-outs (keychain charms hang from the rail, everything else gets a standee base) ---------- */
// Crop to the art, add a white acrylic rim unless the art has one, and for a charm find its hole (or add a tab with one).
function cutoutCanvas(img, hang) {
  const W0 = img.naturalWidth || img.width,
    H0 = img.naturalHeight || img.height,
    k = Math.min(1, 1024 / Math.max(W0, H0));
  const w = Math.max(2, Math.round(W0 * k)),
    h = Math.max(2, Math.round(H0 * k));
  const c0 = KA.makeCanvas(w, h),
    g0 = c0.getContext("2d", { willReadFrequently: true });
  g0.drawImage(img, 0, 0, w, h);
  const a = g0.getImageData(0, 0, w, h).data;
  let x0 = w,
    y0 = h,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (a[(y * w + x) * 4 + 3] > 40) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) {
    x0 = 0;
    y0 = 0;
    x1 = w - 1;
    y1 = h - 1;
  }
  const bw = x1 - x0 + 1,
    bh = y1 - y0 + 1,
    op = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && a[(y * w + x) * 4 + 3] > 40;
  // does the art already have a light rim? (most edge pixels near white)
  let edge = 0,
    light = 0;
  for (let y = y0; y <= y1; y += 2)
    for (let x = x0; x <= x1; x += 2) {
      if (!op(x, y) || (op(x - 2, y) && op(x + 2, y) && op(x, y - 2) && op(x, y + 2))) continue;
      edge++;
      const i = (y * w + x) * 4;
      if (a[i] + a[i + 1] + a[i + 2] > 600) light++;
    }
  const rim = edge && light / edge > 0.6 ? 0 : Math.max(2, Math.round(Math.max(bw, bh) * 0.022));
  // a hole already cut into the top quarter of the art? (transparent pixels the outside can't reach)
  let hole = null;
  if (hang) {
    const S = Math.min(1, 160 / Math.max(bw, bh)),
      sw = Math.max(4, Math.round(bw * S)),
      sh = Math.max(4, Math.round(bh * S));
    const opq = (sx, sy) => op(x0 + Math.floor(sx / S), y0 + Math.floor(sy / S)),
      seen = new Uint8Array(sw * sh),
      st = [];
    for (let x = 0; x < sw; x++) {
      st.push([x, 0], [x, sh - 1]);
    }
    for (let y = 0; y < sh; y++) {
      st.push([0, y], [sw - 1, y]);
    }
    while (st.length) {
      const [x, y] = st.pop();
      if (x < 0 || y < 0 || x >= sw || y >= sh) continue;
      const i = y * sw + x;
      if (seen[i] || opq(x, y)) continue;
      seen[i] = 1;
      st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    let hx = 0,
      hy = 0,
      n = 0;
    for (let y = 0; y < Math.ceil(sh * 0.28); y++)
      for (let x = 0; x < sw; x++) {
        const i = y * sw + x;
        if (!seen[i] && !opq(x, y)) {
          hx += x;
          hy += y;
          n++;
        }
      }
    if (n >= 3) hole = { x: hx / n / S, y: hy / n / S, r: Math.sqrt(n / Math.PI) / S };
  }
  // no hole: add an acrylic tab above the top of the art, nearest the middle
  let tab = null;
  if (hang && !hole) {
    let ax = bw / 2;
    for (let y = y0; y <= y1 && !tab; y++) {
      let best = -1;
      for (let x = x0; x <= x1; x++)
        if (op(x, y) && (best < 0 || Math.abs(x - x0 - bw / 2) < Math.abs(best - bw / 2)))
          best = x - x0;
      if (best >= 0) {
        ax = best;
        tab = { x: ax, r: Math.max(bw, bh) * 0.075 };
      }
    }
  }
  const pad = rim + 2,
    top = tab ? Math.round(tab.r * 1.4) : 0;
  const W = bw + pad * 2,
    H = bh + pad * 2 + top,
    out = KA.makeCanvas(W, H),
    g = out.getContext("2d");
  const art = KA.makeCanvas(bw, bh);
  art.getContext("2d").drawImage(c0, x0, y0, bw, bh, 0, 0, bw, bh);
  if (rim || tab) {
    const sil = KA.makeCanvas(bw, bh),
      sg = sil.getContext("2d");
    sg.drawImage(art, 0, 0);
    sg.globalCompositeOperation = "source-in";
    sg.fillStyle = "#f3f5fa";
    sg.fillRect(0, 0, bw, bh);
    for (let i = 0; i < 16 && rim; i++) {
      const t = (i / 16) * Math.PI * 2;
      g.drawImage(sil, pad + Math.cos(t) * rim, top + pad + Math.sin(t) * rim);
    }
    if (tab) {
      g.fillStyle = "#f3f5fa";
      g.beginPath();
      g.arc(pad + tab.x, top + pad - tab.r * 0.2, tab.r, 0, Math.PI * 2);
      g.fill();
      g.fillRect(pad + tab.x - tab.r, top + pad - tab.r * 0.2, tab.r * 2, tab.r * 1.2);
    }
  }
  g.drawImage(art, pad, top + pad);
  if (tab) {
    g.globalCompositeOperation = "destination-out";
    g.beginPath();
    g.arc(pad + tab.x, top + pad - tab.r * 0.2, tab.r * 0.42, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = "source-over";
    hole = { x: tab.x, y: -tab.r * 0.2, r: tab.r * 0.42 };
  }
  // hole position as a fraction of the canvas (for the key ring)
  const hf = hole ? { x: (pad + hole.x) / W, y: (top + pad + hole.y) / H } : null;
  return { canvas: out, aspect: W / H, hole: hf };
}
function makeCutout(cut, tex, hang) {
  const g = new THREE.Group();
  const h = 0.07,
    w = h * cut.aspect;
  const face = new THREE.MeshStandardMaterial({
    map: tex,
    alphaTest: 0.4,
    transparent: false,
    roughness: 0.12,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const geo = new THREE.PlaneGeometry(w, h);
  if (hang) {
    // the charm hangs from its hole: ring through the hole, a small link above it
    const hx = cut.hole ? (cut.hole.x - 0.5) * w : 0,
      hy = cut.hole ? (0.5 - cut.hole.y) * h : h / 2;
    for (const z of [0.0016, -0.0016]) {
      const m = new THREE.Mesh(geo, face);
      m.position.set(-hx, -0.012 - hy + 0.004, z);
      g.add(m);
    }
    const metal = new THREE.MeshStandardMaterial({
      color: 0xd9dbe2,
      metalness: 1,
      roughness: 0.22,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.0016, 8, 24), metal);
    ring.position.y = -0.003;
    g.add(ring);
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.004, 0.0012, 6, 16), metal);
    link.position.y = -0.012 + 0.024;
    link.rotation.y = Math.PI / 2;
    g.add(link);
  } else {
    for (const z of [0.0016, -0.0016]) {
      const m = new THREE.Mesh(geo, face);
      m.position.set(0, h / 2 + 0.004, z);
      g.add(m);
    }
    // clear acrylic standee foot
    const foot = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(w * 0.62, 0.03), 0.004, 0.024),
      new THREE.MeshStandardMaterial({
        color: 0xeef2ff,
        roughness: 0.08,
        metalness: 0,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    );
    foot.position.y = 0.002;
    g.add(foot);
  }
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return { obj: g };
}
// rolled desk mat in a printed sleeve (Monkey Quest demo): simple, exact geometry + the real print
function makeRoll(tex, band) {
  const g = new THREE.Group();
  const roll = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.4, 40, 1, false),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 }),
  );
  roll.rotation.z = Math.PI / 2;
  roll.position.y = 0.035;
  g.add(roll);
  const end = new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.9 });
  for (const x of [-0.2, 0.2]) {
    const c = new THREE.Mesh(new THREE.CircleGeometry(0.035, 32), end);
    c.position.set(x, 0.035, 0);
    c.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2;
    g.add(c);
  }
  const sleeve = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0365, 0.0365, 0.09, 40, 1, true),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(band || "#e3262f"),
      roughness: 0.5,
      side: THREE.DoubleSide,
    }),
  );
  sleeve.rotation.z = Math.PI / 2;
  sleeve.position.y = 0.035;
  g.add(sleeve);
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return { obj: g };
}
function imageTexture(canvas, { flipY = true, wrap = false } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAX_ANISO;
  t.flipY = flipY;
  if (wrap) t.wrapS = THREE.RepeatWrapping;
  return t;
}
function canvasFrom(img, maxDim = 2048) {
  const W = img.naturalWidth || img.width,
    H = img.naturalHeight || img.height,
    k = Math.min(1, maxDim / Math.max(W, H));
  const c = KA.makeCanvas(W * k, H * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c;
}

// the item's box in its shelf group, from its shelf pose: it may be held or flying home right now,
// and a variant measured from that pose would be built big and floating in front of the shelf
function shelfBoxInGroup(item) {
  item.updateWorldMatrix(true, true);
  const inv = item.matrixWorld.clone().invert(),
    lb = new THREE.Box3(),
    mb = new THREE.Box3(),
    m = new THREE.Matrix4();
  item.traverse((o) => {
    if (o.isMesh && o.geometry) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      mb.copy(o.geometry.boundingBox).applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld));
      lb.union(mb);
    }
  });
  const s = shelfSlots.get(item);
  const home = s
    ? new THREE.Matrix4().compose(s.pos, s.quat, s.scale)
    : new THREE.Matrix4().compose(item.position, item.quaternion, item.scale);
  return lb.applyMatrix4(home);
}
// fit a product into a slot: as tall as the sample it replaces (never much wider), standing on the shelf,
// or hanging from the rail in the keychain zone; then the project's yaw and scale
function fitVariant(id, item, v, m, extra = 1) {
  const ib = shelfBoxInGroup(item);
  const isz = ib.getSize(new THREE.Vector3());
  v.updateWorldMatrix(true, true);
  const vb = new THREE.Box3().setFromObject(v);
  const vsz = vb.getSize(new THREE.Vector3());
  if (vb.isEmpty() || vsz.y <= 0) throw new Error("The model is empty");
  let sc = isz.y / vsz.y;
  const foot = Math.max(isz.x, isz.z) * 1.25,
    vfoot = Math.max(vsz.x, vsz.z) * sc;
  if (vfoot > foot) sc *= foot / vfoot;
  if (id === "plush") sc *= 1.05;
  if (id === "figure") sc *= 0.8;
  v.scale.setScalar(sc * extra * (m.scale || 1));
  const vb2 = new THREE.Box3().setFromObject(v);
  const vc = vb2.getCenter(new THREE.Vector3());
  const ic = ib.getCenter(new THREE.Vector3());
  if (id === "keychain") v.position.set(ic.x - vc.x, ib.max.y - vb2.max.y, ic.z - vc.z);
  else v.position.set(ic.x - vc.x, ib.min.y - vb2.min.y, ic.z - vc.z);
}
async function buildZone(id) {
  const m = PROJECT.zones[id].model,
    key = zoneModelKey(id),
    items = refs.merchItems[id] || [];
  if (key === "off" || key === "default" || !items.length) return null;
  let make,
    extra = 1,
    dispose = () => {};
  if (m.source === "asset") {
    const { gltf, release } = await acquireAsset(m.asset);
    make = () => cloneAsset(gltf, m, id);
    dispose = release;
  } else if (m.source === "image") {
    const img = await loadImage(imgUrl(m.image));
    const cut = cutoutCanvas(img, id === "keychain");
    const tex = imageTexture(cut.canvas);
    make = () => {
      const r = makeCutout(cut, tex, id === "keychain");
      r.obj.rotation.y = THREE.MathUtils.degToRad(m.yaw || 0);
      return r;
    };
    dispose = () => retireTexture(tex);
  } else {
    const img = await loadImage(imgUrl(m.print));
    const tex = imageTexture(canvasFrom(img), { wrap: true });
    make = () => {
      const r = makeRoll(tex, m.tint);
      r.obj.rotation.y = THREE.MathUtils.degToRad(m.yaw || 0);
      return r;
    };
    extra = 0.55;
    dispose = () => retireTexture(tex);
  }
  const variants = [],
    mixers = [],
    owned = m.source !== "asset";
  try {
    for (const item of items) {
      const r = make();
      const wrap = new THREE.Group();
      wrap.add(r.obj);
      fitVariant(id, item, wrap, m, extra);
      wrap.name = item.name + "__v";
      wrap.visible = false;
      wrap.userData.isVariant = true;
      variants.push([item, wrap]);
      if (r.mixer) mixers.push(r.mixer);
    }
  } catch (e) {
    for (const [, v] of variants) if (owned) disposeTree(v);
    dispose();
    throw e;
  }
  return {
    variants,
    mixers,
    dispose: () => {
      if (owned) for (const [, v] of variants) disposeTree(v);
      dispose();
    },
  };
}
// wait until nothing from this zone is held or flying (swapping mid-hold would hide the held item)
async function freeShelf(id) {
  if (focus && focus.id === id) await new Promise((r) => unfocus(r, { keepView: true }));
  for (let i = 0; i < 40; i++) {
    const busy = [...flights.keys()].some((o) => {
      let p = o;
      while (p) {
        if (p === refs.merch[id]) return true;
        p = p.parent;
      }
      return refs.merchItems[id]?.includes(o) || zoneState[id]?.variants.some(([, v]) => v === o);
    });
    if (!busy) return;
    await new Promise((r) => setTimeout(r, 100));
  }
}
async function applyZone(id) {
  const st = (zoneState[id] ||= { key: "default", variants: [], mixers: [], dispose: null });
  applyDefaultLook(id);
  const key = zoneModelKey(id);
  if (key === st.key) {
    syncZone(id);
    return;
  }
  const token = (st.token = (st.token || 0) + 1);
  let built = null,
    err = null;
  try {
    built = await buildZone(id);
  } catch (e) {
    err = e;
  }
  if (token !== st.token) {
    built?.dispose();
    return;
  }
  await freeShelf(id);
  if (token !== st.token) {
    built?.dispose();
    return;
  }
  for (const [item, v] of st.variants) {
    v.removeFromParent();
    if (item.userData.variant === v) delete item.userData.variant;
  }
  st.dispose?.();
  st.variants = [];
  st.mixers = [];
  st.dispose = null;
  if (built) {
    for (const [item, v] of built.variants) {
      refs.merch[id].add(v);
      item.userData.variant = v;
    }
    Object.assign(st, { variants: built.variants, mixers: built.mixers, dispose: built.dispose });
  }
  // a model that fails keeps the fixture's sample on the shelf; it is retried only when the zone changes
  st.key = key;
  st.failed = !!err;
  if (err) {
    postError(
      `${zoneLabel(id)}: the model could not be loaded (${err.message}). Showing the sample product instead.`,
    );
  }
  syncZone(id);
  rebuildPickables();
  renderer.shadowMap.needsUpdate = true;
}
function syncZone(id) {
  const st = zoneState[id],
    on = !!PROJECT.zones[id]?.enabled,
    hasV = !!st?.variants.length;
  for (const item of refs.merchItems[id] || []) if (focus?.obj !== item) item.visible = on && !hasV;
  for (const [, v] of st?.variants || []) v.visible = on;
  if (refs.merch[id]) refs.merch[id].userData.anchor = null;
  const h = hotspots.find((h) => h.id === id);
  if (h) h.hidden = !on;
}
/** Bring every zone in line with the project (rebuilds only zones whose model changed). */
async function applyZones(onProgress) {
  let n = 0;
  const work = ZONE_IDS.map((id) =>
    applyZone(id)
      .catch((e) => postError(e.message))
      .finally(() => {
        n++;
        onProgress && onProgress(n / ZONE_IDS.length);
      }),
  );
  await Promise.all(work);
}
const zoneMixers = () => {
  const out = [];
  for (const id of ZONE_IDS) {
    const st = zoneState[id];
    if (st?.variants.length && PROJECT.zones[id].enabled) out.push(...st.mixers);
  }
  return out;
};
const heroObj = (id) => {
  const h = refs.hero[id];
  const v = h?.userData.variant;
  return v && v.parent ? v : h;
};

/* ---------- the fixture's own merch: recolour (cap, tee, hoodie, figure box) and print (figure box front) ---------- */
// Fabric recolour: pixels near the fabric's own brightness take the new colour (shading kept); logos, trims and
// deep shadows (much brighter or darker) keep theirs. A uniform switch, so changing colour never recompiles.
const TINT_GLSL = `if(uTintOn>0.5){ float l=dot(diffuseColor.rgb,vec3(0.2126,0.7152,0.0722)); float k=l/max(uRef,1e-4);
  float fabric=1.0-smoothstep(0.9,1.7,abs(log2(max(k,1e-4))));
  diffuseColor.rgb=mix(diffuseColor.rgb,uTint*clamp(pow(k,0.85),0.25,1.7),fabric); }`;
function lumRef(image) {
  try {
    const c = KA.makeCanvas(64, 64),
      g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(image, 0, 0, 64, 64);
    const d = g.getImageData(0, 0, 64, 64).data;
    const lin = (v) => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const bins = new Float32Array(40);
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
      bins[Math.max(0, Math.min(39, Math.floor((Math.log2(Math.max(l, 1e-4)) + 13.3) * 3)))]++;
    }
    let b = 0;
    for (let i = 1; i < 40; i++) if (bins[i] > bins[b]) b = i;
    return Math.pow(2, (b + 0.5) / 3 - 13.3);
  } catch (e) {
    return 0.2;
  }
}
function prepTint(mat) {
  const u = {
    uTint: { value: new THREE.Color(1, 1, 1) },
    uTintOn: { value: 0 },
    uRef: { value: lumRef(mat.map.image) },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader =
      "uniform vec3 uTint;\nuniform float uTintOn;\nuniform float uRef;\n" +
      sh.fragmentShader.replace("#include <map_fragment>", "#include <map_fragment>\n" + TINT_GLSL);
  };
  mat.customProgramCacheKey = () => "ml-tint";
  mat.needsUpdate = true;
  return u;
}
const TINTABLE = ["cap", "tee", "hoodie", "figure"],
  PRINTABLE = ["figure", "mousepad"];
function prepDefaultMerch() {
  refs.tint = {};
  for (const id of ["cap", "tee", "hoodie"]) {
    const mat = refs.hero[id]?.material;
    if (mat?.map?.image) refs.tint[id] = prepTint(mat);
  }
  // figure: the box sides take the tint, the front panel the print
  refs.nodes["HERO_figure"]?.traverse((o) => {
    if (!o.isMesh) return;
    if (/Box_Side/.test(o.material.name)) refs.boxSide = o.material;
    if (/box_front/.test(o.material.name)) refs.boxFront = o.material;
  });
  if (refs.boxSide) refs.boxSide.userData.color0 = refs.boxSide.color.clone();
  if (refs.boxFront) refs.boxFront.userData.map0 = refs.boxFront.map;
}
function applyDefaultLook(id) {
  const m = PROJECT.zones[id].model,
    own = m.source === "default",
    tint = own ? m.tint : null;
  const u = refs.tint?.[id];
  if (u) {
    if (tint) {
      u.uTint.value.set(tint);
      u.uTintOn.value = 1;
    } else u.uTintOn.value = 0;
  }
  if (id === "figure") {
    if (refs.boxSide)
      refs.boxSide.color.copy(tint ? new THREE.Color(tint) : refs.boxSide.userData.color0);
    setBoxPrint(own ? imgUrl(m.print) : null);
  }
}
// the window box's front panel (UV-mapped 0..1 on the fixture, 1528 × 2048 art): the print, cover-fitted
let boxPrint = { url: null, tex: null, token: 0 };
function setBoxPrint(url) {
  const bf = refs.boxFront;
  if (!bf || boxPrint.url === url) return;
  boxPrint.url = url;
  const token = ++boxPrint.token;
  const done = (tex) => {
    if (token !== boxPrint.token) {
      retireTexture(tex);
      return;
    }
    const old = boxPrint.tex;
    bf.map = tex || bf.userData.map0;
    bf.needsUpdate = true;
    boxPrint.tex = tex;
    retireTexture(old);
    snapCacheClear("figure");
    renderer.shadowMap.needsUpdate = true;
  };
  if (!url) {
    done(null);
    return;
  }
  loadImage(url)
    .then((img) => {
      const c = KA.makeCanvas(764, 1024);
      KA.cover(c.getContext("2d"), img, 0, 0, 764, 1024, 0.5, 0.5);
      done(imageTexture(c, { flipY: false }));
    })
    .catch((e) => {
      postError("Figure box print: " + e.message);
      done(null);
    });
}
/* =========================================================
   Hotspots
   ========================================================= */
const hsLayer = $("#hotspots");
const hotspots = [];
function addHotspot(id, label, getPos, cls = "", onClick) {
  const b = document.createElement("button");
  b.className = "hs " + cls;
  b.setAttribute("aria-label", label);
  b.innerHTML =
    '<span class="ring"></span><span class="core"></span><span class="tag">' + label + "</span>";
  // Touch-safe activation: the markers ride the camera, so they can slide a few pixels between
  // finger-down and finger-up (damping, auto-rotate, a camera flight). A plain 'click' is then
  // lost because down and up land on different elements. Arm on pointerdown, fire on pointerup.
  b.addEventListener("pointerdown", (e) => {
    if (!e.isPrimary || e.button > 0) return;
    e.stopPropagation();
    hsPress = { b, onClick, x: e.clientX, y: e.clientY, t: performance.now() };
    killMomentum();
    controls.autoRotate = false;
    idle = 0;
    // markers cover much of the shelf on a phone: a drag that starts on one still orbits the scene
    if (controls.enabled) {
      if (controls._pointers.length) resetPointers();
      try {
        controls._onPointerDown(e);
      } catch (_) {}
    }
  });
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    if (performance.now() - hsFiredAt < 700) return;
    onClick();
  }); // keyboard + fallback
  hsLayer.appendChild(b);
  hotspots.push({ id, el: b, getPos, vis: true });
  return b;
}
let hsPress = null,
  hsFiredAt = 0;
addEventListener(
  "pointerup",
  (e) => {
    const pr = hsPress;
    hsPress = null;
    if (!pr || !e.isPrimary) return;
    if (Math.hypot(e.clientX - pr.x, e.clientY - pr.y) > 14 || performance.now() - pr.t > 900)
      return;
    if (pr.b.classList.contains("hidden") || getComputedStyle(pr.b).pointerEvents === "none")
      return;
    hsFiredAt = performance.now();
    pr.onClick();
  },
  true,
);
addEventListener(
  "pointercancel",
  () => {
    hsPress = null;
  },
  true,
);
function relabelHotspots() {
  if (!PROJECT) return;
  for (const h of hotspots) {
    let label = null;
    if (FIX[h.id]) {
      const z = PROJECT.zones[h.id];
      label = z.product.hotspot || z.product.label;
      h.hidden = !z.enabled;
    }
    if (h.id === "qr") {
      label = activationLabel();
      h.hidden = PROJECT.activation.type === "none";
    }
    if (label) {
      h.el.setAttribute("aria-label", label);
      h.el.querySelector(".tag").textContent = label;
    }
  }
}
function worldCenter(o) {
  o.updateWorldMatrix(true, true);
  const b = new THREE.Box3();
  o.traverse((c) => {
    if (c.isMesh && isShown(c)) b.expandByObject(c, false);
  });
  if (b.isEmpty()) b.setFromObject(o);
  return b.getCenter(new THREE.Vector3()).setY(b.max.y + 0.05);
}
function setupHotspots() {
  for (const id of ZONE_IDS) {
    const g = refs.merch[id];
    if (!g) continue;
    addHotspot(
      id,
      id,
      () => {
        if (!g.userData.anchor || explodeT > 0) {
          g.userData.anchor = worldCenter(g);
        }
        return g.userData.anchor;
      },
      "merch",
      () => {
        track("hotspot", { id });
        focusProduct(id, { user: true });
      },
    );
  }
  addHotspot(
    "qr",
    "Try the activation",
    () =>
      new THREE.Vector3(1.54, 1.47, 0.43).add(
        refs.parts.PART_TowerR
          ? refs.parts.PART_TowerR.position.clone().sub(refs.parts.PART_TowerR.userData.home)
          : new THREE.Vector3(),
      ),
    "qr",
    () => {
      track("hotspot", { id: "qr" });
      openPhone(activationZone());
    },
  );
  addHotspot(
    "screen",
    "Live scan counter",
    () => new THREE.Vector3(0, 1.95, 0.14),
    "",
    () => {
      track("hotspot", { id: "screen" });
      flyTo([0, 1.6, 2.4], [0, 1.56, 0]);
      bump("session");
      toast("The hero screen cycles key art, the call to action and live scans");
    },
  );
  addHotspot(
    "totem",
    "Digital totem",
    () => new THREE.Vector3(3.0, 2.12, 1.05),
    "",
    () => {
      track("hotspot", { id: "totem" });
      flyTo(VIEWS.totem.pos, VIEWS.totem.tgt);
      bump("session");
      toast("Freestanding totem: pulls shoppers in from the main aisle");
    },
  );
  relabelHotspots();
}
const _v = new THREE.Vector3(),
  ray = new THREE.Raycaster();
let hsFrame = 0;
function updateHotspots() {
  hsFrame++;
  const W = innerWidth,
    H = innerHeight;
  for (const h of hotspots) {
    const p = h.getPos();
    _v.copy(p).project(camera);
    const behind = _v.z > 1;
    const x = (_v.x * 0.5 + 0.5) * W,
      y = (-_v.y * 0.5 + 0.5) * H;
    h.el.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
    if (hsFrame % 8 === 0 && display) {
      const dist = camera.position.distanceTo(p);
      ray.set(camera.position, p.clone().sub(camera.position).normalize());
      ray.far = dist - 0.08;
      const hit = ray.intersectObjects(refs.occluders, false)[0];
      h.occluded = !!hit;
    }
    h.el.classList.toggle(
      "hidden",
      !!h.hidden || behind || h.occluded || x < -40 || x > W + 40 || y < -40 || y > H + 40,
    );
  }
}
// scale the marker's dot, never the marker itself (its transform is rewritten every frame to follow the camera)
function pulseHotspot(id, times = 3) {
  const h = hotspots.find((h) => h.id === id);
  if (!h) return;
  h.el
    .querySelector(".core")
    ?.animate([{ transform: "scale(1)" }, { transform: "scale(1.8)" }, { transform: "scale(1)" }], {
      duration: 900,
      iterations: times,
    });
}
// after the tour: name every product on the shelf for a moment, so people know where to tap
function revealMarkers() {
  if (focus || mode !== "explore") return;
  $("#hint").style.opacity = "";
  document.body.classList.add("labels");
  hotspots.forEach((h, i) => {
    if (!h.hidden) setTimeout(() => pulseHotspot(h.id, 2), i * 90);
  });
  clearTimeout(revealMarkers.t);
  revealMarkers.t = setTimeout(() => document.body.classList.remove("labels"), 4200);
}

/* =========================================================
   Tiny tween system
   ========================================================= */
const tweens = [];
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function tween(dur, fn, { e = ease, done } = {}) {
  const tw = { t0: performance.now(), dur: reduceMotion ? 1 : dur, fn, e, done };
  tweens.push(tw);
  return tw;
}
function runTweens(now) {
  // iterate a snapshot: a tween's done() may start or cancel others. A tween that throws is dropped,
  // so a single bad frame can never wedge the loop.
  for (const tw of tweens.slice()) {
    if (!tweens.includes(tw)) continue;
    const k = Math.min(1, (now - tw.t0) / tw.dur);
    let fin = k >= 1;
    try {
      tw.fn(tw.e(k), k);
    } catch (err) {
      fin = true;
      reportErr(err);
    }
    if (fin) {
      const i = tweens.indexOf(tw);
      if (i >= 0) tweens.splice(i, 1);
      if (tw.done) {
        try {
          tw.done();
        } catch (err) {
          reportErr(err);
        }
      }
    }
  }
}
function reportErr(err) {
  reportErr.n = (reportErr.n || 0) + 1;
  if (reportErr.n <= 8) console.error("frame error", err);
}
// one flight per object: starting a new move cancels the old one, so two tweens never fight over it
const flights = new Map();
function flight(obj, dur, fn, done) {
  const prev = flights.get(obj);
  if (prev) {
    const i = tweens.indexOf(prev);
    if (i >= 0) tweens.splice(i, 1);
  }
  const tw = tween(dur, fn, {
    done: () => {
      if (flights.get(obj) === tw) flights.delete(obj);
      done && done();
    },
  });
  flights.set(obj, tw);
  return tw;
}
let camTween = null;
function cancelCamTween() {
  if (camTween) {
    const i = tweens.indexOf(camTween);
    if (i >= 0) tweens.splice(i, 1);
    camTween = null;
  }
}
function flyTo(pos, tgt, dur = 1600, done) {
  const p0 = camera.position.clone(),
    t0 = controls.target.clone(),
    p1 = new THREE.Vector3(...pos),
    t1 = new THREE.Vector3(...tgt);
  cancelCamTween();
  killMomentum();
  controls.autoRotate = false;
  camTween = tween(
    dur,
    (k) => {
      camera.position.lerpVectors(p0, p1, k);
      const arc = Math.sin(k * Math.PI) * 0.25;
      camera.position.y += arc * 0;
      controls.target.lerpVectors(t0, t1, k);
    },
    {
      done: () => {
        camTween = null;
        done && done();
      },
    },
  );
}

/* =========================================================
   Product focus: pull merch off the shelf
   ========================================================= */
let focus = null;
const fx = new THREE.Group();
scene.add(fx);
fx.visible = false;
const ringMat = new THREE.MeshBasicMaterial({
  color: 0x8a5cff,
  transparent: true,
  opacity: 0.8,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const rings = [];
for (let i = 0; i < 3; i++) {
  const r = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.212, 96), ringMat.clone());
  r.rotation.x = -Math.PI / 2;
  fx.add(r);
  rings.push(r);
}
const discTex = canvasTex(
  256,
  256,
  (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, "rgba(255,255,255,.9)");
    gr.addColorStop(0.35, "rgba(255,255,255,.25)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  },
  { srgb: false },
);
const disc = new THREE.Mesh(
  new THREE.CircleGeometry(0.34, 64),
  new THREE.MeshBasicMaterial({
    map: discTex,
    color: 0x8a5cff,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
);
disc.rotation.x = -Math.PI / 2;
fx.add(disc);
// sparkles
const sparkN = 90,
  sparkGeo = new THREE.BufferGeometry(),
  sparkPos = new Float32Array(sparkN * 3),
  sparkSeed = new Float32Array(sparkN);
for (let i = 0; i < sparkN; i++) {
  sparkSeed[i] = Math.random();
}
sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
const sparkMat = new THREE.PointsMaterial({
  size: 0.018,
  color: 0xd9ccff,
  transparent: true,
  opacity: 0.9,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const sparks = new THREE.Points(sparkGeo, sparkMat);
fx.add(sparks);

function productDest() {
  // In front of the merch bay at eye level, nudged left on wide screens so the sheet doesn't cover it
  return new THREE.Vector3(innerWidth > 760 ? -0.05 : 0, 1.24, 1.35);
}
// the direction the camera looks at a held product from (frameFocus) and the axes it spins/tilts on
const VIEW_DIR = new THREE.Vector3(0.22, 0.1, 1).normalize();
const VIEW_RIGHT = new THREE.Vector3()
  .crossVectors(VIEW_DIR.clone().negate(), new THREE.Vector3(0, 1, 0))
  .normalize();
const Y_AXIS = new THREE.Vector3(0, 1, 0);
// Frame the held product inside the part of the screen the product sheet leaves free:
// left of the side card on desktop/tablet, above the bottom sheet on phones. Sized to fit that space.
function sheetFreeRect() {
  const W = innerWidth,
    H = innerHeight,
    sh = $("#sheet");
  const cs = getComputedStyle(sh);
  const bottomSheet = W <= 760;
  if (bottomSheet) {
    const top = H - (parseFloat(cs.bottom) || 0) - sh.offsetHeight;
    return { x0: 12, x1: W - 12, y0: 58, y1: Math.max(170, top - 8), phone: true };
  }
  const left = W - (parseFloat(cs.right) || 0) - sh.offsetWidth;
  const y0 = H <= 560 ? 12 : 72;
  return { x0: 16, x1: Math.max(220, left - 12), y0, y1: H - 18, phone: false };
}
function frameFocus(dur = 700) {
  if (!focus) return;
  const W = innerWidth,
    H = innerHeight,
    r = sheetFreeRect();
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const fw = r.x1 - r.x0,
    fh = r.y1 - r.y0,
    cx = (r.x0 + r.x1) / 2,
    cy = (r.y0 + r.y1) / 2 - (r.phone ? 10 : 0);
  // phones: fill the space above the sheet; desktop: a confident hero size without crowding the card
  const targetPx = r.phone
    ? Math.max(150, Math.min(fw * 0.8, fh * 0.76))
    : Math.max(170, Math.min(fw * 0.66, fh * 0.74, 700));
  // distance at which the product (plus a little room for its rotation) spans targetPx
  const D = THREE.MathUtils.clamp(
    (focus.want * (focus.flat ? 1.08 : 1.18) * H) / (2 * tanV * targetPx),
    0.4,
    3.2,
  );
  const wpp = (2 * D * tanV) / H;
  const fwd = VIEW_DIR.clone().negate(),
    up = new THREE.Vector3().crossVectors(VIEW_RIGHT, fwd);
  const tgt = focus.dest
    .clone()
    .addScaledVector(VIEW_RIGHT, (W / 2 - cx) * wpp)
    .addScaledVector(up, (cy - H / 2) * wpp);
  const pos = tgt.clone().addScaledVector(VIEW_DIR, D);
  flyTo(pos.toArray(), tgt.toArray(), dur);
  // spotlight the product: the vignette opens around it, the coach mark sits just under it
  const vg = $("#vignette").style;
  vg.setProperty("--vx", cx + "px");
  vg.setProperty("--vy", cy + "px");
  vg.setProperty("--vr", Math.round(targetPx * 0.5) + "px");
  const sh = $("#spinHint");
  sh.style.left = cx + "px";
  sh.style.top = Math.min(r.y1 - 36, cy + targetPx * 0.44) + "px";
}
addEventListener("resize", () => {
  clearTimeout(frameFocus.t);
  frameFocus.t = setTimeout(() => {
    if (focus) frameFocus(450);
  }, 120);
});

// where a product lives on the shelf, captured the first time it is picked up (it is on the shelf then),
// so a product grabbed again mid-flight still knows its way home
// (kept in a WeakMap, not userData: three.js JSON-copies userData whenever an object is cloned)
const shelfSlots = new WeakMap();
function shelfSlot(obj) {
  if (shelfSlots.has(obj)) return shelfSlots.get(obj);
  obj.updateWorldMatrix(true, true);
  const inv = obj.matrixWorld.clone().invert(),
    lb = new THREE.Box3(),
    mb = new THREE.Box3(),
    m = new THREE.Matrix4();
  obj.traverse((o) => {
    if (o.isMesh && o.geometry) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      mb.copy(o.geometry.boundingBox).applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld));
      lb.union(mb);
    }
  });
  const world = new THREE.Box3().setFromObject(obj),
    size = world.getSize(new THREE.Vector3());
  const slot = {
    parent: obj.parent,
    pos: obj.position.clone(),
    quat: obj.quaternion.clone(),
    scale: obj.scale.clone(),
    center: lb.isEmpty() ? new THREE.Vector3() : lb.getCenter(new THREE.Vector3()),
    size,
    // folded apparel and flat prints lie on the shelf: present them standing up, face-on
    flat: size.y < 0.5 * Math.max(size.x, size.z),
  };
  shelfSlots.set(obj, slot);
  return slot;
}
function slotWorld(s) {
  const tmp = new THREE.Object3D();
  s.parent.add(tmp);
  tmp.position.copy(s.pos);
  tmp.quaternion.copy(s.quat);
  tmp.scale.copy(s.scale);
  tmp.updateWorldMatrix(true, false);
  const p = new THREE.Vector3(),
    q = new THREE.Quaternion(),
    sc = new THREE.Vector3();
  tmp.matrixWorld.decompose(p, q, sc);
  s.parent.remove(tmp);
  return { p, q, s: sc };
}
// the held product's default pose: flat items stand up and face the screen; others get a 3/4 turn
function presentQuat(shelfQ, flat) {
  if (flat) return new THREE.Quaternion().setFromUnitVectors(Y_AXIS, VIEW_DIR).multiply(shelfQ);
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, -0.35, 0)).multiply(shelfQ);
}
// pivot the held product around its visual centre, not its model origin
const _hq = new THREE.Quaternion(),
  _hq2 = new THREE.Quaternion(),
  _hc = new THREE.Vector3();
function heldPose(f, spin, tilt, zoom, out) {
  _hq.setFromAxisAngle(Y_AXIS, spin);
  _hq2.setFromAxisAngle(VIEW_RIGHT, tilt);
  out.q.copy(_hq2).multiply(_hq).multiply(f.baseQ);
  out.s.copy(f.baseScale).multiplyScalar(zoom);
  _hc.copy(f.center).multiply(out.s).applyQuaternion(out.q);
  out.p.copy(f.dest).sub(_hc);
  return out;
}
function sweepStrays() {
  for (const id of Object.keys(refs.hero || {})) {
    const h = refs.hero[id];
    if (!h) continue;
    for (const o of [h, h.userData.variant]) {
      if (!o || focus?.obj === o || flights.has(o)) continue;
      const s = shelfSlots.get(o);
      if (!s || o.parent === s.parent) continue;
      s.parent.attach(o);
      o.position.copy(s.pos);
      o.quaternion.copy(s.quat);
      o.scale.copy(s.scale);
      setCastShadow(o, true);
      renderer.shadowMap.needsUpdate = true;
    }
  }
}
function setCastShadow(obj, on) {
  obj.traverse((o) => {
    if (o.isMesh) {
      if (o.userData.cast0 === undefined) o.userData.cast0 = o.castShadow;
      o.castShadow = on ? o.userData.cast0 : false;
    }
  });
}
let spinHintShown = 0;
function focusProduct(id, { user = false } = {}) {
  if (!display || !PROJECT.zones[id]?.enabled) return;
  if (focus) {
    if (focus.id === id) return;
    unfocus(null, { keepView: true });
  }
  exitModes();
  const p = P(id),
    obj = heroObj(id);
  if (!obj) return;
  bump("session");
  live.perSku[id] = (live.perSku[id] || 0) + 1;
  bump("acts");
  track("product_open", { id, label: p.label });
  // the builder selects the zone the viewer picked
  if (user) post({ type: "ar:state", theme: currentTheme, zone: id });
  const slot = shelfSlot(obj),
    home = slotWorld(slot);
  scene.attach(obj);
  const sp = obj.position.clone(),
    sq = obj.quaternion.clone(),
    ss = obj.scale.clone();
  // normalise the display size from the shelf size (never from a mid-flight scale)
  const maxd = Math.max(slot.size.x, slot.size.y, slot.size.z);
  const want = Math.min(0.32, Math.max(0.25, maxd * p.zoom));
  const mul = want / maxd;
  const dest = productDest();
  const f = {
    id,
    obj,
    spin: 0,
    tilt: 0,
    zoom: 1,
    zoomT: 1,
    arrived: false,
    dragging: false,
    lastDrag: 0,
    t: 0,
    bob: 0,
    want,
    dest,
    flat: slot.flat,
    center: slot.center,
    baseQ: presentQuat(home.q, slot.flat),
    baseScale: home.s.clone().multiplyScalar(mul),
  };
  focus = f;
  document.body.classList.add("focus");
  syncControls();
  const end = heldPose(f, 0, 0, 1, {
    p: new THREE.Vector3(),
    q: new THREE.Quaternion(),
    s: new THREE.Vector3(),
  });
  const mid = sp
    .clone()
    .lerp(end.p, 0.5)
    .add(new THREE.Vector3(0, 0.28, 0.2));
  setCastShadow(obj, false);
  flight(
    obj,
    1150,
    (k) => {
      // quadratic bezier path: lift off shelf, arc toward viewer
      const a = sp.clone().lerp(mid, k),
        b = mid.clone().lerp(end.p, k);
      obj.position.copy(a.lerp(b, k));
      obj.quaternion.slerpQuaternions(sq, end.q, k);
      obj.scale.lerpVectors(ss, end.s, k);
    },
    () => {
      if (focus === f) {
        f.arrived = true;
        showSpinHint();
      }
    },
  );
  fx.position.copy(dest).add(new THREE.Vector3(0, -want * 0.62, 0));
  fx.visible = true;
  fx.userData.t0 = performance.now();
  fx.scale.setScalar(want / 0.34);
  fillSheet(id);
  frameFocus(1200);
  // open the sheet only if this is still the product being held (a quick close must win)
  setTimeout(() => {
    if (focus === f) $("#sheet").classList.add("open");
  }, 380);
  $("#hint").style.opacity = 0;
}
function unfocus(after, { keepView = false } = {}) {
  // always leave the UI consistent, even if nothing is held
  $("#sheet").classList.remove("open");
  document.body.classList.remove("focus");
  endDrag();
  hideSpinHint();
  if (!focus) {
    syncControls();
    return after && after();
  }
  const f = focus;
  focus = null;
  const obj = f.obj;
  syncControls();
  const slot = shelfSlot(obj),
    home = slotWorld(slot);
  const sp = obj.position.clone(),
    sq = obj.quaternion.clone(),
    ss = obj.scale.clone();
  const mid = sp
    .clone()
    .lerp(home.p, 0.5)
    .add(new THREE.Vector3(0, 0.22, 0.15));
  flight(
    obj,
    900,
    (k) => {
      const a = sp.clone().lerp(mid, k),
        b = mid.clone().lerp(home.p, k);
      obj.position.copy(a.lerp(b, k));
      obj.quaternion.slerpQuaternions(sq, home.q, k);
      obj.scale.lerpVectors(ss, home.s, k);
    },
    () => {
      slot.parent.attach(obj);
      obj.position.copy(slot.pos);
      obj.quaternion.copy(slot.quat);
      obj.scale.copy(slot.scale);
      setCastShadow(obj, true);
      renderer.shadowMap.needsUpdate = true;
      if (!focus) fx.visible = false;
      after && after();
    },
  );
  if (!after && !keepView) flyTo([-2.1, 1.7, 4.9], [0.3, 1.05, 0.1], 1200);
}
function showSpinHint() {
  if (spinHintShown >= 2) return;
  spinHintShown++;
  $("#spinHintTxt").textContent = isTouch
    ? "Drag to rotate · pinch to zoom"
    : "Drag to rotate · scroll to zoom";
  const el = $("#spinHint");
  el.classList.add("on");
  clearTimeout(showSpinHint.t);
  showSpinHint.t = setTimeout(hideSpinHint, 3800);
}
function hideSpinHint() {
  $("#spinHint").classList.remove("on");
}
function fillSheet(id) {
  const p = P(id);
  $("#sCat").textContent = p.cat;
  $("#sCat").hidden = !p.cat;
  $("#sName").textContent = p.label;
  $("#sSku").textContent = (p.sku ? "SKU " + p.sku + " · " : "") + "drag the product to spin it";
  const d = $("#sDesc");
  d.textContent = p.desc;
  d.hidden = !p.desc;
  d.classList.add("clamp");
  $("#sMore").hidden = true;
  requestAnimationFrame(() => {
    $("#sMore").hidden = !p.desc || d.scrollHeight <= d.clientHeight + 2;
  });
  $("#sUnlock").textContent = p.unlock;
  $("#sUnlockSub").textContent = p.unlockSub;
  $(".unlock").hidden = !p.unlock;
  const img = $("#sUnlockImg");
  img.src = p.img || snapshot(id);
  img.alt = p.unlock;
  const spec = [
    ["Trigger", p.trigger],
    ["Sold via", p.channel],
  ].filter(([, b]) => b);
  $("#sSpec").innerHTML = spec
    .map(([a, b]) => `<div><dt>${a}</dt><dd>${esc(b)}</dd></div>`)
    .join("");
  $("#sSpec").hidden = !spec.length;
  cartSheet(id);
}
// offscreen snapshot of the product's 3D twin, rendered with the main renderer into a small target
// (a second WebGLRenderer would create a second GPU context and stall the page)
const SNAP = small ? 384 : 512; // product twin snapshots (sheet art, cart thumbnails, rewards)
const snapRT = new THREE.WebGLRenderTarget(SNAP, SNAP, { samples: 4 });
snapRT.texture.colorSpace = THREE.SRGBColorSpace;
const snapCache = new Map();
const snapScene = new THREE.Scene();
const snapCacheClear = (id) => {
  for (const k of [...snapCache.keys()]) if (k.startsWith(id + "|")) snapCache.delete(k);
};
snapScene.add(new THREE.HemisphereLight(0xffffff, 0x6655aa, 2.2));
{
  const dl = new THREE.DirectionalLight(0xffffff, 2.2);
  dl.position.set(1, 2, 3);
  snapScene.add(dl);
}
const snapCam = new THREE.PerspectiveCamera(30, 1, 0.005, 10);
const snapBuf = new Uint8Array(SNAP * SNAP * 4);
const snapCanvas = document.createElement("canvas");
snapCanvas.width = snapCanvas.height = SNAP;
const snapCtx = snapCanvas.getContext("2d");
function snapshot(id) {
  if (!display || !PROJECT.zones[id]) return "";
  const key = id + "|" + zoneLook(id) + "|" + (zoneState[id]?.variants.length || 0);
  if (snapCache.has(key)) return snapCache.get(key);
  const obj = heroObj(id);
  if (!obj) return "";
  const c = SkeletonUtils.clone(obj);
  c.visible = true;
  c.traverse((o) => (o.visible = true));
  c.position.set(0, 0, 0);
  c.quaternion.copy(
    new THREE.Quaternion()
      .setFromEuler(new THREE.Euler(0.25, -0.5, 0))
      .multiply(obj.getWorldQuaternion(new THREE.Quaternion())),
  );
  c.scale.copy(obj.getWorldScale(new THREE.Vector3()));
  snapScene.add(c);
  c.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(c);
  c.position.sub(box.getCenter(new THREE.Vector3()));
  const r = box.getSize(new THREE.Vector3()).length() * 0.5;
  snapCam.position.set(0, 0, (r / Math.tan((Math.PI * 15) / 180)) * 0.86);
  snapCam.lookAt(0, 0, 0);
  const prevT = renderer.getRenderTarget(),
    prevC = renderer.getClearColor(new THREE.Color()),
    prevA = renderer.getClearAlpha(),
    prevEnv = snapScene.environment;
  snapScene.environment = scene.environment;
  try {
    renderer.setRenderTarget(snapRT);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(snapScene, snapCam);
    renderer.readRenderTargetPixels(snapRT, 0, 0, SNAP, SNAP, snapBuf);
  } finally {
    // never leave the clone behind: it shares materials with the shelf and would outlive them
    renderer.setRenderTarget(prevT);
    renderer.setClearColor(prevC, prevA);
    snapScene.environment = prevEnv;
    snapScene.remove(c);
  }
  const img = snapCtx.createImageData(SNAP, SNAP);
  const row = SNAP * 4;
  for (let y = 0; y < SNAP; y++) {
    img.data.set(snapBuf.subarray((SNAP - 1 - y) * row, (SNAP - y) * row), y * row);
  }
  snapCtx.putImageData(img, 0, 0);
  snapCacheClear(id);
  const url = snapCanvas.toDataURL("image/webp", 0.9);
  snapCache.set(key, url);
  return url;
}
function warmSnapshots() {
  const ids = ZONE_IDS.filter((id) => PROJECT.zones[id].enabled);
  let i = 0;
  const step = () => {
    if (i >= ids.length) return;
    if (tweens.length || focus) {
      setTimeout(step, 500);
      return;
    }
    try {
      snapshot(ids[i++]);
    } catch (e) {}
    (window.requestIdleCallback || setTimeout)(step, { timeout: 1200 });
  };
  step();
}

// hold a product: drag to rotate (and tilt a little), pinch or scroll to zoom
const held = { ptrs: new Map(), pinch0: 0, zoom0: 1 };
const pinchDist = () => {
  const [a, b] = [...held.ptrs.values()];
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
};
renderer.domElement.addEventListener("pointerdown", (e) => {
  if (!focus || !focus.arrived) return;
  held.ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  try {
    renderer.domElement.setPointerCapture(e.pointerId);
  } catch (_) {}
  focus.dragging = true;
  focus.lastDrag = performance.now();
  hideSpinHint();
  spinHintShown = 2;
  if (held.ptrs.size === 2) {
    held.pinch0 = pinchDist();
    held.zoom0 = focus.zoomT;
  }
});
renderer.domElement.addEventListener("pointermove", (e) => {
  if (!focus || !held.ptrs.has(e.pointerId)) return;
  const prev = held.ptrs.get(e.pointerId);
  held.ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  focus.lastDrag = performance.now();
  if (held.ptrs.size >= 2) {
    if (held.pinch0 > 0)
      focus.zoomT = THREE.MathUtils.clamp((held.zoom0 * pinchDist()) / held.pinch0, 0.8, 1.9);
    return;
  }
  focus.spin += (e.clientX - prev[0]) * 0.011;
  focus.tilt = THREE.MathUtils.clamp(focus.tilt + (e.clientY - prev[1]) * 0.006, -0.55, 0.55);
});
function endDrag(e) {
  if (!e || e.type === "blur") {
    for (const id of held.ptrs.keys()) {
      try {
        renderer.domElement.releasePointerCapture(id);
      } catch (_) {}
    }
    held.ptrs.clear();
  } else {
    if (!held.ptrs.has(e.pointerId)) return;
    held.ptrs.delete(e.pointerId);
    try {
      renderer.domElement.releasePointerCapture(e.pointerId);
    } catch (_) {}
  }
  held.pinch0 = 0;
  if (focus && !held.ptrs.size) focus.dragging = false;
}
["pointerup", "pointercancel", "lostpointercapture"].forEach((ev) =>
  renderer.domElement.addEventListener(ev, endDrag),
);
renderer.domElement.addEventListener(
  "wheel",
  (e) => {
    if (!focus || !focus.arrived) return;
    e.preventDefault();
    focus.zoomT = THREE.MathUtils.clamp(focus.zoomT * Math.exp(-e.deltaY * 0.0015), 0.8, 1.9);
    focus.lastDrag = performance.now();
    hideSpinHint();
  },
  { passive: false },
);
$("#sMore").addEventListener("click", () => {
  $("#sDesc").classList.remove("clamp");
  $("#sMore").hidden = true;
  if (focus) frameFocus(450);
});

function isShown(o) {
  while (o) {
    if (!o.visible) return false;
    o = o.parent;
  }
  return true;
}
// click directly on merch in the scene
const clickRay = new THREE.Raycaster();
let downAt = null;
renderer.domElement.addEventListener("pointerdown", (e) => {
  downAt = [e.clientX, e.clientY, performance.now()];
});
renderer.domElement.addEventListener("pointerup", (e) => {
  if (!downAt || !display) return;
  const [x0, y0, t0] = downAt;
  downAt = null;
  if (Math.hypot(e.clientX - x0, e.clientY - y0) > 6 || performance.now() - t0 > 500) return;
  const m = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  clickRay.setFromCamera(m, camera);
  if (mode === "walk") {
    walkClick(clickRay);
    return;
  }
  if (focus || overlayOpen()) {
    return;
  }
  const hit = clickRay.intersectObjects(
    refs.pickables.filter((m) => isShown(m)),
    false,
  )[0];
  if (!hit) return;
  pickTarget(hit.object);
});
// what a click on a pick-mesh opens: its zone's product, or the activation from the QR tower
function pickTarget(o) {
  while (o) {
    const id = zoneOfGroup(o.name);
    if (id) {
      if (PROJECT.zones[id].enabled) {
        track("hotspot", { id, via: "scene" });
        focusProduct(id, { user: true });
      }
      return true;
    }
    if (o.name === "GFX_TowerR") {
      if (PROJECT.activation.type !== "none") {
        openPhone(activationZone());
      }
      return true;
    }
    o = o.parent;
  }
  return false;
}
/* =========================================================
   Modes: explore / tour / walk / build
   ========================================================= */
let mode = "explore";
function setModeButtons() {
  document
    .querySelectorAll("[data-mode]")
    .forEach((b) => b.setAttribute("aria-pressed", b.dataset.mode === mode));
}
function exitModes() {
  if (mode === "tour") endTour(false);
  if (mode === "walk") endWalk();
  if (mode === "build") setExplode(false);
  mode = "explore";
  setModeButtons();
  document.body.classList.remove("build", "walk");
  syncControls();
}
function setMode(m, { first = false } = {}) {
  if (m === "tour" && !PROJECT.tour.length) m = "explore";
  if (focus) unfocus(null, { keepView: true });
  if (m === mode && m !== "explore") {
    exitModes();
    homeView();
    return;
  }
  exitModes();
  mode = m;
  setModeButtons();
  syncControls();
  if (m === "tour") startTour(first);
  if (m === "walk") startWalk();
  if (m === "build") {
    document.body.classList.add("build");
    setExplode(true);
    flyTo(VIEWS.build.pos, VIEWS.build.tgt);
  }
  if (m === "explore") homeView();
}
document.querySelectorAll("[data-mode]").forEach((b) =>
  b.addEventListener("click", () => {
    bump("session");
    track("mode", { mode: b.dataset.mode });
    setMode(b.dataset.mode);
  }),
);
function homeView() {
  flyTo([-2.7, 1.75, 5.3], [0.35, 1.12, 0.1]);
}

// ---- explode
let explodeT = 0,
  explodeTw = null;
const partLabels = {};
function setExplode(on) {
  if (!display) return;
  document.body.classList.toggle("build", on);
  if (!Object.keys(partLabels).length) {
    for (const [k, p] of Object.entries(PARTS)) {
      const d = document.createElement("div");
      d.className = "plabel";
      d.innerHTML = `<b>${p.name}</b><span>${p.dims}</span>`;
      hsLayer.appendChild(d);
      partLabels[k] = d;
    }
  }
  const from = explodeT,
    to = on ? 1 : 0;
  if (explodeTw) {
    const i = tweens.indexOf(explodeTw);
    if (i >= 0) tweens.splice(i, 1);
  }
  explodeTw = tween(
    1400,
    (k) => {
      explodeT = from + (to - from) * k;
      applyExplode();
    },
    { done: () => (explodeTw = null) },
  );
}
function applyExplode() {
  for (const [k, o] of Object.entries(refs.parts)) {
    const off = PARTS[k].off;
    o.position.copy(o.userData.home).add(new THREE.Vector3(...off).multiplyScalar(explodeT));
  }
  // merch rides along with the bay
  const bo = PARTS.PART_Bay.off;
  for (const id of ZONE_IDS) {
    const g = refs.merch[id];
    if (g && g.userData.home && !(focus && focus.id === id))
      g.position.copy(g.userData.home).add(new THREE.Vector3(...bo).multiplyScalar(explodeT));
    g && (g.userData.anchor = null);
  }
}
function updatePartLabels() {
  if (explodeT <= 0.01) return;
  for (const [k, d] of Object.entries(partLabels)) {
    const o = refs.parts[k];
    if (!o) continue;
    const b = new THREE.Box3().setFromObject(o);
    const p = b.getCenter(new THREE.Vector3());
    p.y = b.max.y + 0.08;
    if (k === "PART_TowerL" || k === "PART_TowerR") {
      p.y = b.min.y + (b.max.y - b.min.y) * 0.72;
    }
    if (k === "PART_Plinth") {
      p.y = b.min.y - 0.02;
    }
    if (k === "PART_VideoWall") {
      p.x = b.min.x + 0.5;
    }
    _v.copy(p).project(camera);
    const below = k === "PART_Plinth";
    d.style.transform = `translate(${(_v.x * 0.5 + 0.5) * innerWidth}px,${(-_v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%,${below ? "10%" : "-100%"})`;
  }
}

// ---- tour
let tourI = 0;
const TOUR = () => PROJECT.tour;
function startTour(first = false) {
  if (!TOUR().length) return;
  tourI = 0;
  $("#tour").classList.add("open");
  showTour(first ? 2600 : 1800);
  $("#hint").style.opacity = 0;
}
function renderTourCard() {
  const steps = TOUR();
  tourI = Math.max(0, Math.min(tourI, steps.length - 1));
  const s = steps[tourI];
  if (!s) return null;
  $("#tStep").textContent = `Stop ${tourI + 1} of ${steps.length}`;
  $("#tTitle").textContent = s.title;
  $("#tBody").textContent = s.body;
  $("#tPips").innerHTML = steps.map((_, i) => `<i class="${i <= tourI ? "on" : ""}"></i>`).join("");
  $("#tPrev").disabled = tourI === 0;
  $("#tPrev").style.opacity = tourI === 0 ? 0.4 : 1;
  $("#tNext").textContent = tourI === steps.length - 1 ? "Finish" : "Next";
  return s;
}
function showTour(dur = 1800) {
  const s = renderTourCard();
  if (!s) return;
  gotoStep(s, dur);
  track("tour_step", { i: tourI + 1, title: s.title });
}
/** Fly to a tour step (also used by presentation mode and the builder's ar:goto). */
function gotoStep(s, dur = 1800) {
  if (s.theme && THEMES[s.theme] && s.theme !== currentTheme) setTheme(s.theme, { silent: true });
  if (s.view !== "build" && explodeT > 0) setExplode(false);
  openDash(!!s.dashboard);
  const v = VIEWS[s.view] || VIEWS.aisle;
  flyTo(v.pos, v.tgt, dur);
  if (s.view === "build") setExplode(true);
  if (s.view === "qr") pulseHotspot("qr");
}
function endTour(showCta = true) {
  $("#tour").classList.remove("open");
  if (explodeT > 0) setExplode(false);
  openDash(false);
  if (showCta) openPilot();
}
let revealAfterModal = false;
$("#tNext").addEventListener("click", () => {
  bump("session");
  if (tourI < TOUR().length - 1) {
    tourI++;
    showTour();
  } else {
    track("tour_finish");
    exitModes();
    homeView();
    revealAfterModal = true;
    openPilot();
  }
});
$("#tPrev").addEventListener("click", () => {
  if (tourI > 0) {
    tourI--;
    showTour();
  }
});
$("#tSkip").addEventListener("click", () => {
  bump("session");
  track("tour_skip", { at: tourI + 1 });
  exitModes();
  homeView();
  setTimeout(revealMarkers, 700);
});
$("#tPresent").addEventListener("click", () => startPresenting("tour"));
addEventListener("keydown", (e) => {
  if (mode !== "tour" || overlayOpen() || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName || ""))
    return;
  if (e.key === "ArrowRight") {
    e.preventDefault();
    $("#tNext").click();
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    $("#tPrev").click();
  }
});

// ---- walk (shopper view)
const walk = { yaw: 0, pitch: 0, keys: {}, target: null, drag: null };
function startWalk() {
  document.body.classList.add("walk");
  cancelCamTween();
  syncControls();
  camera.position.set(-1.2, 1.58, 4.6);
  walk.yaw = Math.atan2(0 - -1.2, 4.6 - 0) * -1;
  walk.yaw = Math.atan2(1.2, 4.6) * -1 + 0.0;
  walk.pitch = -0.06;
  walk.target = null;
  applyWalkRot();
  $("#hint").style.opacity = 0;
}
function endWalk() {
  document.body.classList.remove("walk");
  walk.drag = null;
  walk.target = null;
  const d = new THREE.Vector3();
  camera.getWorldDirection(d);
  controls.target.copy(camera.position).add(d.multiplyScalar(3));
}
function applyWalkRot() {
  camera.quaternion.setFromEuler(new THREE.Euler(walk.pitch, walk.yaw, 0, "YXZ"));
}
renderer.domElement.addEventListener("pointerdown", (e) => {
  if (mode === "walk" && e.isPrimary && !overlayOpen()) {
    walk.drag = [e.clientX, e.clientY];
  }
});
addEventListener("pointermove", (e) => {
  if (mode === "walk" && walk.drag && e.buttons === 0) {
    walk.drag = null;
    return;
  }
  if (mode === "walk" && walk.drag) {
    const dx = e.clientX - walk.drag[0],
      dy = e.clientY - walk.drag[1];
    walk.drag = [e.clientX, e.clientY];
    walk.yaw -= dx * 0.0045;
    walk.pitch = THREE.MathUtils.clamp(walk.pitch - dy * 0.0035, -0.9, 0.6);
    applyWalkRot();
  }
});
addEventListener("pointerup", () => {
  walk.drag = null;
});
addEventListener("pointercancel", () => {
  walk.drag = null;
});
addEventListener("keydown", (e) => {
  walk.keys[e.key.toLowerCase()] = true;
  if (e.key === "Escape") {
    if (document.querySelector("#phoneWrap.open")) closePhone();
    else if (document.querySelector("#modal.open")) closeModal();
    else if (focus) unfocus();
    else if (mode !== "explore") {
      exitModes();
      homeView();
    }
  }
});
addEventListener("keyup", (e) => {
  walk.keys[e.key.toLowerCase()] = false;
});
function walkClick(r) {
  const h2 = display
    ? r.intersectObjects(
        refs.pickables.filter((m) => isShown(m)),
        false,
      )[0]
    : null;
  const hit = r.intersectObject(lights.floor)[0];
  if (hit && !h2) {
    walk.target = hit.point.clone().setY(1.58);
  } else if (display && h2) {
    let o = h2.object;
    while (o) {
      const id = zoneOfGroup(o.name);
      if (id) {
        if (PROJECT.zones[id].enabled) {
          exitModes();
          focusProduct(id, { user: true });
        }
        return;
      }
      o = o.parent;
    }
  }
}
const blockers = [
  new THREE.Box3(new THREE.Vector3(-2.25, 0, -0.55), new THREE.Vector3(2.25, 3, 0.95)),
  new THREE.Box3(new THREE.Vector3(2.35, 0, 0.55), new THREE.Vector3(3.65, 3, 1.65)),
];
function updateWalk(dt) {
  if (mode !== "walk") return;
  const f = new THREE.Vector3(-Math.sin(walk.yaw), 0, -Math.cos(walk.yaw)),
    r = new THREE.Vector3(-f.z, 0, f.x);
  const mv = new THREE.Vector3();
  const k = walk.keys;
  if (k.w || k.arrowup) mv.add(f);
  if (k.s || k.arrowdown) mv.sub(f);
  if (k.d || k.arrowright) mv.add(r);
  if (k.a || k.arrowleft) mv.sub(r);
  if (mv.lengthSq() > 0) {
    walk.target = null;
    mv.normalize().multiplyScalar(1.6 * dt);
  } else if (walk.target) {
    const d = walk.target.clone().sub(camera.position);
    d.y = 0;
    const L = d.length();
    if (L < 0.05) walk.target = null;
    else mv.copy(d).multiplyScalar(Math.min(1, dt * 2.2));
  }
  const next = camera.position.clone().add(mv);
  next.x = THREE.MathUtils.clamp(next.x, -12, 12);
  next.z = THREE.MathUtils.clamp(next.z, -3.4, 12);
  const pt = next.clone().setY(1);
  if (!blockers.some((b) => b.containsPoint(pt))) camera.position.copy(next);
  else walk.target = null;
  camera.position.y = 1.58 + (mv.lengthSq() > 0 ? Math.sin(performance.now() * 0.012) * 0.012 : 0);
}

/* =========================================================
   Dashboard
   ========================================================= */
function openDash(on) {
  const was = $("#dash").classList.contains("open");
  $("#dash").classList.toggle("open", on);
  document.querySelector('[data-action="dash"]').setAttribute("aria-pressed", on);
  if (on) {
    renderDash();
    if (!was) track("dash_open");
  }
}
// short SKU names for the bars: without "Activated " or the property's own name in front
const skuName = (id) => {
  const th = THEMES[currentTheme];
  let s = P(id).label.replace(/^Activated\s+/i, "");
  if (th?.game && s.toLowerCase().startsWith(th.game.toLowerCase() + " "))
    s = s.slice(th.game.length + 1);
  return s;
};
function renderDash() {
  const set = (id, v) => {
    $(id + " b").textContent = v;
  };
  set("#kAct", live.acts.toLocaleString("en-US"));
  set("#kRet", live.returns.toLocaleString("en-US"));
  set("#kSess", live.session);
  const skus = Object.entries(live.perSku)
    .filter(([k]) => PROJECT.zones[k]?.enabled)
    .sort((a, b) => b[1] - a[1]);
  $("#kTop b").textContent = skus.length ? skuName(skus[0][0]) : "—";
  const max = Math.max(1, ...skus.map((s) => s[1]));
  $("#bars").innerHTML = skus
    .map(
      ([k, v]) =>
        `<div class="bar"><span>${esc(skuName(k))}</span><span class="track"><span class="fill" style="width:${(v / max) * 100}%"></span></span><span>${v}</span></div>`,
    )
    .join("");
  const vals = live.hourly,
    mx = Math.max(...vals) * 1.1,
    n = vals.length;
  const X = (i) => 4 + i * (312 / (n - 1)),
    Y = (v) => 66 - (v / mx) * 60;
  const pts = vals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  $("#spark").innerHTML =
    `<defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9270ff" stop-opacity=".45"/><stop offset="1" stop-color="#9270ff" stop-opacity="0"/></linearGradient></defs>
   ${[0.25, 0.5, 0.75].map((f) => `<line x1="0" x2="320" y1="${6 + f * 60}" y2="${6 + f * 60}" stroke="rgba(255,255,255,.06)"/>`).join("")}
   <polygon points="4,66 ${pts} ${X(n - 1)},66" fill="url(#sg)"/><polyline points="${pts}" fill="none" stroke="#b39cff" stroke-width="2" vector-effect="non-scaling-stroke"/>
   <circle cx="${X(n - 1)}" cy="${Y(vals[n - 1])}" r="3.5" fill="#3cefb1"/>`;
}
function bump(what, n = 1) {
  if (what === "session") live.session += n;
  if (what === "acts") live.acts += n;
  if (what === "returns") live.returns += n;
  const map = { session: "#kSess", acts: "#kAct", returns: "#kRet" };
  const el = $(map[what]);
  if ($("#dash").classList.contains("open")) {
    renderDash();
    el.classList.add("bump");
    setTimeout(() => el.classList.remove("bump"), 600);
  }
}
setInterval(() => {
  // ambient simulated feed
  const r = Math.random();
  if (r < 0.55) {
    live.acts++;
    const ks = Object.keys(live.perSku).filter((k) => PROJECT?.zones[k]?.enabled);
    if (ks.length) live.perSku[ks[(Math.random() * ks.length) | 0]]++;
    live.hourly[live.hourly.length - 1]++;
    if (Math.random() < 0.7) live.returns++;
  }
  if ($("#dash").classList.contains("open")) renderDash();
}, 2600);
document.querySelector('[data-action="dash"]').addEventListener("click", () => {
  bump("session");
  openDash(!$("#dash").classList.contains("open"));
});
$("#dClose").addEventListener("click", () => openDash(false));

/* =========================================================
   Activation phone demo: simulated tap → the experience's splash → the built-in drop game,
   or the live experience in a new tab ("link") → reward → inventory
   ========================================================= */
let phoneProduct = "cap",
  phoneStep = 0,
  game = null;
const REWARD_CODE = () =>
  PROJECT.activation.rewardPrefix +
  "-" +
  Math.random().toString(36).slice(2, 6).toUpperCase() +
  "-" +
  Math.random().toString(36).slice(2, 4).toUpperCase();
// "Launch Cola Run ↗" → "Cola Run": what the live experience is called in copy
function linkName() {
  const a = PROJECT.activation,
    th = THEMES[currentTheme];
  const s = a.buttonLabel
    .replace(/^(launch|play|open|start|try)\s+/i, "")
    .replace(/\s*[↗→›»]+\s*$/, "")
    .trim();
  return !s || /^(the|your|a|an|it|now)\b/i.test(s) ? th?.game || "the experience" : s;
}
const activationLabel = () =>
  PROJECT.activation.type === "link" ? "Activate: " + linkName() : "Try the activation";
// the product the activation demo opens with: one that can activate, else the first one on the shelf
function activationZone(prefer) {
  const on = ZONE_IDS.filter((id) => PROJECT.zones[id].enabled);
  if (prefer && on.includes(prefer)) return prefer;
  return on.find((id) => PROJECT.zones[id].product.canActivate) || on[0] || "cap";
}
const shortName = (label) => {
  const th = THEMES[currentTheme];
  let s = label.replace(/^Activated\s+/i, "");
  if (th?.game && s.toLowerCase().startsWith(th.game.toLowerCase() + " "))
    s = s.slice(th.game.length + 1);
  return s.toLowerCase();
};
// the experience's art: the activation splash, else the featured theme's hero-screen art
function heroArt() {
  const s = imgUrl(PROJECT.activation.splash);
  if (s) return s;
  const img = hdScreenTex?.image;
  if (!img) return "";
  if (img.currentSrc || img.src) return img.currentSrc || img.src;
  if (img.toDataURL) {
    heroArt.cache =
      heroArt.cache?.img === img ? heroArt.cache : { img, url: img.toDataURL("image/jpeg", 0.84) };
    return heroArt.cache.url;
  }
  return "";
}
function phoneShow(i) {
  phoneStep = i;
  document
    .querySelectorAll(".pscreen")
    .forEach((s) => s.classList.toggle("on", +s.dataset.s === i));
  const step = Math.min(i, 4);
  document.querySelectorAll("#pSteps li").forEach((li, j) => {
    li.classList.toggle("on", j === step);
    li.classList.toggle("done", j < step);
  });
}
function openPhone(id) {
  if (!PROJECT || PROJECT.activation.type === "none") return;
  if (overlayOpen() && $("#phoneWrap").classList.contains("open")) closePhone();
  phoneProduct = activationZone(id);
  const p = P(phoneProduct);
  const th = THEMES[currentTheme];
  const a = PROJECT.activation,
    isLink = a.type === "link";
  bump("session");
  bump("acts");
  live.perSku[phoneProduct] = (live.perSku[phoneProduct] || 0) + 1;
  track("activation_open", { id: phoneProduct, type: a.type });
  $("#modal").classList.remove("open");
  $("#phoneWrap").classList.add("open");
  syncControls();
  phoneShow(0);
  // screen 0: the simulated tap plays by itself, then hands over to the experience
  const short = shortName(p.label);
  const s0 = document.querySelector(".tapscreen");
  s0.classList.remove("run", "ok");
  void s0.offsetWidth;
  s0.classList.add("run");
  $("#p0img").src = p.img || snapshot(phoneProduct) || "";
  $("#p0title").textContent = "Reading your " + short;
  $("#p0last").textContent = isLink ? "Opening " + linkName() : "Unlocking your drop";
  (openPhone.tt || []).forEach(clearTimeout);
  openPhone.tt = [
    setTimeout(() => {
      try {
        navigator.vibrate?.(14);
      } catch (e) {}
      blip();
    }, 420),
    setTimeout(() => {
      if (phoneStep !== 0) return;
      s0.classList.add("ok");
      $("#p0title").textContent = "Verified";
      try {
        navigator.vibrate?.([10, 50, 18]);
      } catch (e) {}
      tone(988, 0.16, "sine", 0.035);
      tone(1319, 0.24, "sine", 0.03, 0.07);
    }, 1750),
  ];
  $("#p3note").hidden = true;
  $("#p1bar").textContent = siteLabel(th);
  $("#p1title").textContent = "You own a piece of " + th.game;
  $("#p1sub").textContent = isLink
    ? "Your " +
      short +
      " is verified. " +
      linkName() +
      " opens in a new tab, and your reward is waiting here when you're back."
    : "Your " + short + " is verified. Play the drop to claim what's inside.";
  $("#p1go").textContent = a.buttonLabel;
  const art = heroArt();
  $("#p1bg").style.backgroundImage = art ? `url("${art}")` : "none";
  if (art) $("#p1art").src = art;
  else $("#p1art").removeAttribute("src");
  $("#p1art").alt = th.game + " key art";
  $("#p1thumb").src = p.img || snapshot(phoneProduct) || "";
  $("#p1prod").textContent = p.label;
  const img = p.img || snapshot(phoneProduct);
  $("#p3img").src = img;
  $("#p3title").textContent = p.unlock || "Your reward";
  $("#p3sub").textContent = p.unlockSub;
  $("#p3code").textContent = REWARD_CODE();
  $("#p3go").textContent = "Redeem in " + th.game;
  $("#p4new").style.backgroundImage = `url("${img}")`;
  $("#p4sub").textContent = (p.unlock || "Your reward") + " added in " + th.game + ".";
  $("#p4loop").textContent =
    "Product → experience → " + th.game + " → back to the shelf. Every step is measured.";
  $("#pHead").textContent = isLink
    ? "Try the real " + th.game + " activation"
    : "From the shelf back into the game";
  $("#pLead").textContent = isLink
    ? "This is the live experience. " +
      linkName() +
      " opens in a new tab, and the reward waits here when you come back."
    : "No app to install. A tap or a scan opens the experience in the browser, and the reward lands in " +
      th.game +
      ".";
  $("#pStep2").textContent = isLink ? "Open " + linkName() : "Open the property's experience";
  $("#pStep3").textContent = isLink ? "Play it in a new tab" : "Play the 12-second drop";
  $("#pStep5").textContent = "Redeem it in " + th.game;
  clearTimeout(openPhone.t);
  openPhone.t = setTimeout(() => {
    if (phoneStep === 0) phoneShow(1);
  }, 2500);
}
function closePhone() {
  $("#phoneWrap").classList.remove("open");
  clearTimeout(openPhone.t);
  (openPhone.tt || []).forEach(clearTimeout);
  if (game) {
    game.stop();
    game = null;
  }
  syncControls();
}
$("#pClose").addEventListener("click", closePhone);
document.querySelector(".tapscreen").addEventListener("click", () => {
  if (phoneStep === 0) {
    clearTimeout(openPhone.t);
    phoneShow(1);
  }
});
$("#phoneWrap").addEventListener("click", (e) => {
  if (e.target.id === "phoneWrap") closePhone();
});
$("#p1go").addEventListener("click", () => {
  if (PROJECT.activation.type === "link") startLive();
  else {
    phoneShow(2);
    startGame();
  }
});
$("#p3go").addEventListener("click", () => {
  phoneShow(4);
  bump("returns");
  chime();
  track("reward_redeem", { id: phoneProduct });
});
$("#p4go").addEventListener("click", () => {
  closePhone();
  openDash(true);
  toast("+1 activation and +1 return to " + THEMES[currentTheme].game + " logged");
});
document
  .querySelector('[data-action="activate"]')
  .addEventListener("click", () => openPhone(focus ? focus.id : null));
$("#sActivate").addEventListener("click", () => openPhone(focus ? focus.id : cart.sheetId));
$("#sClose").addEventListener("click", () => unfocus());

// ---- live experience ("link"): it opens in its own tab (it can't run inside a frame),
// and the phone moves straight on to the reward, which is waiting when they come back
function startLive() {
  const url = PROJECT.activation.url;
  if (!url) return;
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
  track("activation_launch", { url });
  const n = $("#p3note");
  n.href = url;
  n.textContent = linkName() + " is open in a new tab ↗";
  n.hidden = false;
  phoneShow(3);
  chime();
}

// 12-second drop: catch the reward (when its art is a cut-out) or the glowing cubes
function spriteFor(src) {
  // only art with a transparent background falls well; a photo would read as a falling square
  if (!src) return Promise.resolve(null);
  return loadImage(src)
    .then((img) => {
      const c = KA.makeCanvas(16, 16),
        g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0, 16, 16);
      const d = g.getImageData(0, 0, 16, 16).data;
      const corners = [0, 15, 240, 255].map((i) => d[i * 4 + 3]);
      return corners.every((a) => a < 30) ? img : null;
    })
    .catch(() => null);
}
async function startGame() {
  const c = $("#game"),
    r = c.getBoundingClientRect();
  const dpr = Math.min(2, devicePixelRatio);
  c.width = r.width * dpr;
  c.height = r.height * dpr;
  const g = c.getContext("2d");
  g.scale(dpr, dpr);
  const W = r.width,
    H = r.height;
  const cubes = [];
  let score = 0,
    t0 = performance.now(),
    last = t0,
    running = true,
    spawn = 0;
  const burst = [];
  const th = THEMES[currentTheme],
    p = P(phoneProduct);
  const col = [
    "#" + new THREE.Color(th.led).getHexString(),
    "#3cefb1",
    "#ffffff",
    "#" + new THREE.Color(th.led2).getHexString(),
  ];
  let tap = null;
  const stop = () => {
    running = false;
    if (tap) c.removeEventListener("pointerdown", tap);
  };
  game = { stop };
  g.fillStyle = "#0d0a1d";
  g.fillRect(0, 0, W, H);
  let bg = null,
    sprite = null;
  const art = heroArt();
  [bg, sprite] = await Promise.all([
    art ? loadImage(art).catch(() => null) : null,
    spriteFor(p.img),
  ]);
  if (!running) return;
  const unit = sprite ? "CAUGHT" : null;
  tap = (e) => {
    const b = c.getBoundingClientRect();
    const x = e.clientX - b.left,
      y = e.clientY - b.top;
    for (let i = cubes.length - 1; i >= 0; i--) {
      const q = cubes[i];
      if (Math.abs(x - q.x) < q.s * 1.2 && Math.abs(y - q.y) < q.s * 1.2) {
        cubes.splice(i, 1);
        score++;
        for (let j = 0; j < 10; j++)
          burst.push({
            x: q.x,
            y: q.y,
            vx: (Math.random() - 0.5) * 260,
            vy: (Math.random() - 0.5) * 260,
            l: 1,
            c: q.c,
          });
        blip();
        break;
      }
    }
  };
  c.addEventListener("pointerdown", tap);
  track("game_start", { id: phoneProduct });
  t0 = last = performance.now();
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const el = (now - t0) / 1000,
      left = Math.max(0, 12 - el);
    spawn -= dt;
    if (spawn <= 0) {
      spawn = 0.42 - Math.min(0.2, el * 0.015);
      cubes.push({
        x: 30 + Math.random() * (W - 60),
        y: -20,
        s: 22 + Math.random() * 14,
        v: 90 + Math.random() * 80 + el * 6,
        r: Math.random() * 6,
        c: col[(Math.random() * col.length) | 0],
      });
    }
    if (bg && bg.naturalWidth) {
      const k = Math.max(W / bg.naturalWidth, H / bg.naturalHeight),
        iw = bg.naturalWidth * k,
        ih = bg.naturalHeight * k;
      g.drawImage(bg, (W - iw) / 2, (H - ih) / 2, iw, ih);
    } else {
      g.fillStyle = "#0d0a1d";
      g.fillRect(0, 0, W, H);
    }
    g.fillStyle = "rgba(8,6,20,.45)";
    g.fillRect(0, 0, W, H);
    for (let i = cubes.length - 1; i >= 0; i--) {
      const q = cubes[i];
      q.y += q.v * dt;
      q.r += dt * 2;
      if (q.y > H + 30) {
        cubes.splice(i, 1);
        continue;
      }
      g.save();
      g.translate(q.x, q.y);
      if (sprite) {
        g.rotate(Math.sin(q.r) * 0.5);
        const S = q.s * 1.9;
        g.shadowColor = q.c;
        g.shadowBlur = 16;
        g.drawImage(sprite, -S / 2, -S / 2, S, S);
      } else {
        g.rotate(q.r);
        g.shadowColor = q.c;
        g.shadowBlur = 18;
        g.fillStyle = q.c;
        g.fillRect(-q.s / 2, -q.s / 2, q.s, q.s);
        g.fillStyle = "rgba(11,10,18,.85)";
        g.fillRect(-q.s / 5, -q.s / 5, q.s / 2.5, q.s / 2.5);
      }
      g.restore();
    }
    for (let i = burst.length - 1; i >= 0; i--) {
      const b = burst[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.l -= dt * 2;
      if (b.l <= 0) {
        burst.splice(i, 1);
        continue;
      }
      g.globalAlpha = b.l;
      g.fillStyle = b.c;
      g.fillRect(b.x - 2, b.y - 2, 4, 4);
      g.globalAlpha = 1;
    }
    $("#gScore").textContent = unit
      ? score + " " + unit
      : score + (score === 1 ? " CUBE" : " CUBES");
    $("#gTime").textContent = left.toFixed(1) + "s";
    if (el < 1.4) {
      g.fillStyle = "rgba(255,255,255," + (1 - el / 1.4) + ")";
      g.font = "700 20px Unbounded, sans-serif";
      g.textAlign = "center";
      g.fillText(sprite ? "CATCH THEM" : "TAP THE CUBES", W / 2, H / 2);
    }
    if (left <= 0) {
      stop();
      track("game_end", { id: phoneProduct, score });
      setTimeout(() => {
        phoneShow(3);
        chime();
      }, 350);
      return;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* =========================================================
   Sound (only after interaction)
   ========================================================= */
let actx = null;
function ac() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {}
  return actx;
}
function tone(f, d, type = "sine", v = 0.05, when = 0) {
  const a = ac();
  if (!a) return;
  const o = a.createOscillator(),
    g = a.createGain();
  o.type = type;
  o.frequency.value = f;
  g.gain.setValueAtTime(0, a.currentTime + when);
  g.gain.linearRampToValueAtTime(v, a.currentTime + when + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + when + d);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + when);
  o.stop(a.currentTime + when + d + 0.05);
}
function blip() {
  tone(880 + Math.random() * 300, 0.12, "triangle", 0.04);
}
function chime() {
  [659, 880, 1175].forEach((f, i) => tone(f, 0.5, "sine", 0.05, i * 0.09));
}

/* =========================================================
   Modal: the end-of-tour call to action, AR notes
   ========================================================= */
function openModal(eyebrow, title, html) {
  $("#mEyebrow").textContent = eyebrow;
  $("#mTitle").textContent = title;
  $("#mBody").innerHTML = html;
  $("#modal").classList.add("open");
  syncControls();
  setTimeout(() => $("#mClose").focus({ preventScroll: true }), 60);
}
function closeModal() {
  $("#modal").classList.remove("open");
  syncControls();
  if (revealAfterModal) {
    revealAfterModal = false;
    setTimeout(revealMarkers, 350);
  }
}
$("#mClose").addEventListener("click", closeModal);
$("#modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") closeModal();
});
function openPilot() {
  const act = PROJECT.activation.type !== "none";
  openModal(
    "End of the tour",
    "Take it from here",
    `<p>Tap any product to shop it in 3D${act ? ", try the activation on a phone," : ""} or talk to us about putting this endcap in stores.</p>
    <div class="modal-actions"><button class="btn go" id="mCta" type="button">${esc(PROJECT.cta.label)}</button>${act ? '<button class="btn ghost" id="mTry" type="button">Try an activation</button>' : ""}<button class="btn ghost" id="mDone" type="button">Keep exploring</button></div>`,
  );
  $("#mCta").onclick = () => {
    closeModal();
    openCta("tour_end");
  };
  if (act)
    $("#mTry").onclick = () => {
      closeModal();
      openPhone(null);
    };
  $("#mDone").onclick = closeModal;
}
// the call to action: the in-page contact form (ar-kit/lead.js) or the project's link
function openCta(source) {
  const c = PROJECT.cta;
  if (c.mode === "url" && c.url) {
    track("cta_open", { source, mode: "url" });
    window.open(c.url, "_blank", "noopener");
    return;
  }
  if (window.ARLead?.open) {
    try {
      window.ARLead.open({ source, demo: demoId(), title: c.label });
      return;
    } catch (e) {
      console.warn(e);
    }
  }
  if (c.url) {
    window.open(c.url, "_blank", "noopener");
    return;
  }
  toast("The contact form is not available right now. Please try again later.");
}
document.querySelectorAll("[data-cta]").forEach((b) =>
  b.addEventListener("click", () => {
    bump("session");
    openCta(b.dataset.cta);
  }),
);

/* =========================================================
   AR: native viewers with the files made at publish time (ar-kit/ar-launch.js)
   ========================================================= */
const arFiles = () => !!(PROJECT?.ar?.glb || PROJECT?.ar?.usdz);
// what the desktop QR opens on the phone: the shared AR hand-off page for a published endcap,
// else this page with ?ar=1 (it opens straight to a "View in your space" button)
function arHandoffUrl() {
  if (MODE === "published") {
    const th = PROJECT.themes.find((t) => t.id === PROJECT.defaultTheme) || PROJECT.themes[0];
    const poster =
      th.graphics.screen?.src || th.graphics.keyArt?.src || PROJECT.activation.splash?.src;
    const code = (qs.get("c") || "")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, 40);
    const q = new URLSearchParams();
    if (PROJECT.ar.glb) q.set("glb", PROJECT.ar.glb);
    if (PROJECT.ar.usdz) q.set("usdz", PROJECT.ar.usdz);
    if (poster) q.set("p", poster);
    q.set("t", PROJECT.brand.splashTitle || PROJECT.brand.lockup || PROJECT.name);
    q.set("d", demoId());
    if (code) q.set("c", code);
    return location.origin + "/ar/?" + q.toString();
  }
  const u = new URL(location.href);
  u.searchParams.set("ar", "1");
  u.hash = "";
  return u.href;
}
function launchAR(source) {
  if (!arFiles()) return false;
  if (!window.ARLaunch?.open) {
    toast("AR is not available right now");
    return true;
  }
  window.ARLaunch.open({
    usdz: PROJECT.ar.usdz || undefined,
    glb: PROJECT.ar.glb || undefined,
    title: PROJECT.brand.splashTitle || PROJECT.name,
    handoffUrl: arHandoffUrl(),
    onEvent: (n, p) => track(n, { ...(p || {}), source }),
  });
  return true;
}
document.querySelector('[data-action="ar"]').addEventListener("click", async () => {
  bump("session");
  if (launchAR("dock")) return;
  // no AR files yet (a template or the builder preview): WebXR where the device has it, else say when they come
  let ok = false;
  try {
    ok = !!(navigator.xr && (await navigator.xr.isSessionSupported("immersive-ar")));
  } catch (e) {}
  if (ok) {
    track("ar_open", { platform: "webxr" });
    startAR();
    return;
  }
  openModal(
    "View in AR",
    "Place this display in your own space",
    `<p>AR files are generated when this endcap is published. Open the published link on a phone to drop the display into your room at true scale (3.84 m wide) and walk around it.</p>
    <button class="btn ghost" id="mOk" type="button">Got it</button>`,
  );
  $("#mOk").onclick = closeModal;
});
async function startAR() {
  const session = await navigator.xr
    .requestSession("immersive-ar", {
      requiredFeatures: ["hit-test"],
      optionalFeatures: ["dom-overlay"],
      domOverlay: { root: document.body },
    })
    .catch(() => null);
  if (!session) {
    toast("AR session could not start on this device");
    return;
  }
  renderer.xr.setReferenceSpaceType("local");
  await renderer.xr.setSession(session);
  const refSpace = await session.requestReferenceSpace("viewer");
  const hitSrc = await session.requestHitTestSource({ space: refSpace });
  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x3cefb1 }),
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);
  store.visible = false;
  const bg = scene.background;
  scene.background = null;
  display.visible = false;
  const ctrl = renderer.xr.getController(0);
  ctrl.addEventListener("select", () => {
    if (reticle.visible) {
      display.position.setFromMatrixPosition(reticle.matrix);
      display.visible = true;
    }
  });
  scene.add(ctrl);
  renderer.setAnimationLoop((t, frame) => {
    if (frame) {
      const hits = frame.getHitTestResults(hitSrc);
      if (hits.length) {
        const pose = hits[0].getPose(renderer.xr.getReferenceSpace());
        reticle.visible = true;
        reticle.matrix.fromArray(pose.transform.matrix);
      } else reticle.visible = false;
    }
    renderer.render(scene, camera);
  });
  session.addEventListener("end", () => {
    store.visible = true;
    scene.background = bg;
    display.position.set(0, 0, 0);
    display.visible = true;
    scene.remove(reticle);
    renderer.setAnimationLoop(loop);
  });
}
// opened from the desktop QR (?ar=1): straight to a "View in your space" button (the viewers need a tap)
function arHandoff() {
  if (qs.get("ar") !== "1" || !arFiles()) return;
  const el = $("#arHandoff");
  el.hidden = false;
  syncControls();
  $("#arhTitle").textContent =
    "Place " + (PROJECT.brand.splashTitle || "this endcap") + " in your room";
  const close = () => {
    el.hidden = true;
    syncControls();
  };
  $("#arhGo").onclick = () => {
    launchAR("handoff");
  };
  $("#arhSkip").onclick = close;
  setTimeout(() => $("#arhGo").focus({ preventScroll: true }), 60);
}
// Scene Viewer sends Android users back with #ar-unavailable when it can't start
if (location.hash === "#ar-unavailable") {
  setTimeout(() => toast("AR is not available on this device"), 1200);
  history.replaceState(null, "", location.pathname + location.search);
}

/* =========================================================
   Presentation mode (ar-kit/present.js): the tour, full screen and hands-free, looping
   ========================================================= */
function presentSteps() {
  if (PROJECT.tour.length) return PROJECT.tour;
  return ["aisle", "hero", "shelf", "qr", "totem"].map((v) => ({
    title: VIEWS[v].label,
    body: "",
    view: v,
    theme: null,
    dashboard: false,
  }));
}
function startPresenting(source) {
  if (!window.ARPresent?.start || IN_PREVIEW) return false;
  const steps = presentSteps();
  if (focus) unfocus(null, { keepView: true });
  closePhone();
  closeModal();
  closeCart();
  exitModes();
  try {
    window.ARPresent.start({
      steps: steps.length,
      go: (i) => gotoStep(steps[i], 2200),
      dwell: (i) => (steps[i]?.view === "build" ? 11000 : 9000),
      caption: (i) => ({ title: steps[i]?.title || "", body: steps[i]?.body || "" }),
      source: demoId() + (source ? ":" + source : ""),
      onStop: () => {
        openDash(false);
        if (explodeT > 0) setExplode(false);
        homeView();
      },
    });
    return true;
  } catch (e) {
    console.warn(e);
    return false;
  }
}

/* =========================================================
   Toast
   ========================================================= */
let toastT;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("on"), 2800);
}

/* =========================================================
   UI wiring
   ========================================================= */
$("#themeSeg").addEventListener("click", (e) => {
  const b = e.target.closest("[data-theme]");
  if (!b || b.dataset.theme === currentTheme) return;
  bump("session");
  track("theme", { id: b.dataset.theme });
  setTheme(b.dataset.theme);
  post({ type: "ar:state", theme: b.dataset.theme });
});
document.querySelectorAll("[data-light]").forEach((b) =>
  b.addEventListener("click", () => {
    bump("session");
    track("light", { mode: b.dataset.light });
    setLight(b.dataset.light);
  }),
);

/* =========================================================
   Loop
   ========================================================= */
const clock = new THREE.Clock();
let started = false,
  idle = 0;
["pointerdown", "keydown", "wheel"].forEach((ev) =>
  addEventListener(
    ev,
    () => {
      idle = 0;
      controls.autoRotate = false;
    },
    { passive: true },
  ),
);
const perf = { acc: 0, n: 0, t0: performance.now() };
function adapt(dtMs) {
  if (window.__NOADAPT) return;
  // dynamic resolution: keep the frame budget, never let a slow GPU lock the page up
  perf.acc += dtMs;
  perf.n++;
  if (performance.now() - perf.t0 < 2000 || perf.n < 30) return;
  const avg = perf.acc / perf.n;
  perf.acc = 0;
  perf.n = 0;
  perf.t0 = performance.now();
  if (document.hidden) return;
  let next = dpr;
  if (avg > 40)
    next = Math.max(avg > 70 ? 0.7 : DPR_FLOOR, dpr - 0.15); // below ~25 fps: step down a little
  else if (avg < 22 && dpr < DPR_MAX) next = Math.min(DPR_MAX, dpr + 0.15); // smooth again: climb back to full sharpness
  next = Math.round(next * 100) / 100;
  if (next !== dpr) {
    dpr = next;
    renderer.setPixelRatio(dpr);
    composer.setPixelRatio(dpr);
    resize();
  }
}
let lastNow = performance.now(),
  shadowTick = 0;
// Frame budget: full rate while anything moves or the user is touching the scene; 30 fps when the
// scene is only breathing; 10 fps behind full-screen overlays. Cooler phones stay responsive.
// In the builder's preview the page shares the builder's main thread, so an idle scene drops to a
// few frames a second (2 fps after 15 s) and only runs at full rate while something moves.
let lastChange = 0;
function frameCap(now) {
  const moving =
    tweens.length ||
    mode === "walk" ||
    now - lastInput < 1600 ||
    explodeTw ||
    now - lastChange < 1200;
  if (IN_PREVIEW) {
    if (moving || focus?.dragging) return 0;
    if (document.querySelector("#phoneWrap.open, #modal.open")) return 4;
    if (focus) return 15;
    return now - Math.max(lastInput, lastChange) > 15000 ? 2 : 6;
  }
  if (document.querySelector("#phoneWrap.open, #modal.open")) return 10;
  if (moving || focus) return 0;
  return 30;
}
function loop() {
  if (gpuLost || !display) return;
  const nowT = performance.now(),
    cap = frameCap(nowT);
  if (cap && nowT - lastNow < 1000 / cap - 3) return;
  if (cap) {
    perf.acc = 0;
    perf.n = 0;
    perf.t0 = nowT;
  } else adapt(nowT - lastNow);
  lastNow = nowT;
  window.__frames = (window.__frames || 0) + 1;
  try {
    frameBody();
  } catch (err) {
    reportErr(err);
  }
  try {
    updateHotspots();
    updatePartLabels();
  } catch (err) {
    reportErr(err);
  }
  if (nowT - (loop.swept || 0) > 1000) {
    loop.swept = nowT;
    try {
      sweepStrays();
    } catch (err) {
      reportErr(err);
    }
  }
  try {
    composer.render();
  } catch (err) {
    reportErr(err);
  }
}
function frameBody() {
  if (window.__FT) {
    const n = performance.now();
    window.__ftl = n - (window.__ftp || n);
    window.__ftp = n;
  }
  const dt = Math.min(0.05, clock.getDelta()),
    t = clock.elapsedTime,
    now = performance.now();
  runTweens(now);
  if (mode !== "walk") {
    controls.update();
    // keep the orbit inside the store: target near the display, camera below the ceiling
    const tg = controls.target;
    tg.x = THREE.MathUtils.clamp(tg.x, -4, 5);
    tg.y = THREE.MathUtils.clamp(tg.y, 0.3, 2.4);
    tg.z = THREE.MathUtils.clamp(tg.z, -1.5, 3);
    if (camera.position.y > 4.1) camera.position.y = 4.1;
  } else updateWalk(dt);
  idle += dt;
  if (
    started &&
    mode === "explore" &&
    !focus &&
    idle > 28 &&
    !reduceMotion &&
    !IN_PREVIEW &&
    !document.body.classList.contains("ar-presenting")
  )
    controls.autoRotate = true;
  let animated = false;
  if (display) {
    // LED breathing + video wall shimmer
    const breathe = 0.9 + 0.1 * Math.sin(t * 1.6);
    refs.ledPurple.forEach(
      (m) => (m.emissiveIntensity = (m.userData.base ??= m.emissiveIntensity) * breathe),
    );
    refs.tiles.forEach((o, i) => {
      o.material.emissiveIntensity = GLOW.emit * (0.88 + 0.1 * Math.sin(t * 1.1 + i * 0.9));
    });
    const fr = Math.floor(t * 8);
    if (fr !== loop.lastFrame) {
      loop.lastFrame = fr;
      const ph = (t % 18) / 6,
        f = ph - Math.floor(ph);
      if (Math.floor(ph) !== 0 || f < 0.08 || f > 0.92 || !loop.drew0) {
        drawScreen(t);
        loop.drew0 = Math.floor(ph) === 0 && f >= 0.08;
      }
    }
    // animated shelf models (the first clip of each uploaded model)
    const mx = zoneMixers();
    for (const m of mx) m.update(dt);
    animated = mx.length > 0;
  }
  if (focus && focus.arrived) {
    const f = focus,
      o = f.obj;
    f.t += dt;
    f.bob += dt;
    const resting = !f.dragging && now - f.lastDrag > 2200;
    if (resting) {
      // flat items sway around their front so the print stays readable; others turn slowly on the spot
      if (f.flat) {
        f.spin = Math.atan2(Math.sin(f.spin), Math.cos(f.spin));
        const aim = Math.sin(f.t * 0.6) * 0.42;
        f.spin += (aim - f.spin) * Math.min(1, dt * 1.6);
      } else f.spin += dt * 0.42;
      f.tilt += (0 - f.tilt) * Math.min(1, dt * 2);
    }
    f.zoom += (f.zoomT - f.zoom) * Math.min(1, dt * 10);
    heldPose(
      f,
      f.spin,
      f.tilt,
      f.zoom,
      heldPose.out ||
        (heldPose.out = {
          p: new THREE.Vector3(),
          q: new THREE.Quaternion(),
          s: new THREE.Vector3(),
        }),
    );
    o.quaternion.copy(heldPose.out.q);
    o.scale.copy(heldPose.out.s);
    o.position.copy(heldPose.out.p);
    o.position.y += Math.sin(f.bob * 1.6) * 0.01;
  }
  if (fx.visible) {
    const k = (now - (fx.userData.t0 || now)) / 1000;
    rings.forEach((r, i) => {
      const p = (k * 0.55 + i / 3) % 1;
      r.scale.setScalar(0.6 + p * 1.6);
      r.material.opacity = (1 - p) * 0.85;
    });
    disc.material.opacity = 0.55 + 0.15 * Math.sin(k * 3);
    const pos = sparkGeo.attributes.position.array;
    for (let i = 0; i < sparkN; i++) {
      const s = sparkSeed[i];
      const a = s * Math.PI * 2 + k * (0.4 + s);
      const rad = 0.15 + s * 0.3;
      const h = ((k * 0.18 + s) % 1) * 0.75;
      pos[i * 3] = Math.cos(a) * rad;
      pos[i * 3 + 1] = h;
      pos[i * 3 + 2] = Math.sin(a) * rad;
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparkMat.opacity = 0.8;
  }
  shadowTick = (shadowTick + 1) % 3;
  if (((flights.size || explodeTw) && shadowTick !== 1) || (animated && shadowTick === 0))
    renderer.shadowMap.needsUpdate = true;
}

/* =========================================================
   Splash: when everything is on the GPU, light the drawing and let them in
   ========================================================= */
function splashReady(onEnter) {
  const L = $("#loader");
  if (!L) return onEnter();
  L.classList.add("ready");
  const btn = $("#ldEnter");
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    L.classList.add("gone");
    onEnter();
    setTimeout(() => L.remove(), 1300);
  };
  // the builder preview never waits on a splash
  if (IN_PREVIEW) {
    go();
    return;
  }
  btn.addEventListener("click", () => {
    ac();
    go();
  });
  if (window.__gate?.open !== false) btn.focus({ preventScroll: true });
  if (!window.__HOLDSPLASH)
    (window.__gate || { then: (cb) => cb() }).then(() =>
      setTimeout(go, window.__FASTENTER ? 50 : 6500),
    );
}

/* =========================================================
   Warm-up: compile every material and upload every texture before it is first needed
   ========================================================= */
async function warmUp() {
  const fxWas = fx.visible;
  fx.visible = true;
  try {
    await renderer.compileAsync(scene, camera);
  } catch (e) {
    try {
      renderer.compile(scene, camera);
    } catch (_) {}
  }
  fx.visible = fxWas;
}

/* =========================================================
   Shop the shelf: a mock cart + checkout that shows the display
   working as a standalone 3D shopping experience.
   Nothing is charged and no payment details are collected.
   ========================================================= */
const TAX = 0.0725;
const priceOf = (id) => PROJECT.zones[id]?.product.price || 0;
const sizesOf = (id) => {
  const s = PROJECT.zones[id]?.product.sizes;
  return s && s.length ? s : null;
};
const canActivate = (id) =>
  PROJECT.activation.type !== "none" && !!PROJECT.zones[id]?.product.canActivate;
const cart = { items: [], fulfil: "pickup", size: {}, sheetId: null, orders: 0 };
// the size a product opens on: M when there is one, else the middle size
const defaultSize = (sizes) =>
  sizes.includes("M") ? "M" : sizes[Math.floor((sizes.length - 1) / 2)];

function cartSheet(id) {
  cart.sheetId = id;
  $("#sPrice").textContent = money(priceOf(id));
  const sizes = sizesOf(id);
  const opts = $("#sOpts");
  opts.hidden = !sizes;
  if (sizes) {
    const cur = sizes.includes(cart.size[id]) ? cart.size[id] : defaultSize(sizes);
    cart.size[id] = cur;
    $("#sSizes").innerHTML = sizes
      .map(
        (s) =>
          `<button type="button" role="radio" aria-checked="${s === cur}" data-size="${esc(s)}">${esc(s)}</button>`,
      )
      .join("");
  }
  const act = canActivate(id);
  $("#sActivate").hidden = !act;
  $("#sheet").classList.toggle("can-act", act);
  setAddLabel(id);
}
function setAddLabel(id, added) {
  const b = $("#sAdd");
  b.classList.toggle("added", !!added);
  const two = $("#sheet").classList.contains("can-act");
  $("#sAddTxt").textContent = added
    ? two
      ? "Added"
      : "Added to cart"
    : (two ? "Add" : "Add to cart") + " · " + money(priceOf(id));
}
$("#sSizes").addEventListener("click", (e) => {
  const b = e.target.closest("[data-size]");
  if (!b || !cart.sheetId) return;
  cart.size[cart.sheetId] = b.dataset.size;
  $("#sSizes")
    .querySelectorAll("[data-size]")
    .forEach((x) => x.setAttribute("aria-checked", x === b));
});
$("#sSizes").addEventListener("keydown", (e) => {
  if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
  e.preventDefault();
  const bs = [...$("#sSizes").querySelectorAll("[data-size]")];
  let i = bs.findIndex((b) => b.getAttribute("aria-checked") === "true");
  i = (i + (e.key === "ArrowRight" ? 1 : -1) + bs.length) % bs.length;
  bs[i].click();
  bs[i].focus();
});

function itemKey(id, size) {
  return id + (size ? ":" + size : "");
}
function addToCart(id, { fly = true } = {}) {
  const p = P(id),
    sizes = sizesOf(id),
    size = sizes ? cart.size[id] || defaultSize(sizes) : null,
    key = itemKey(id, size);
  let it = cart.items.find((x) => x.key === key);
  if (it) it.qty++;
  else {
    it = {
      key,
      id,
      name: p.label,
      size,
      price: priceOf(id),
      qty: 1,
      img: snapshot(id) || p.img || "",
      unlock: p.unlock,
      sku: p.sku,
      act: canActivate(id),
    };
    cart.items.push(it);
  }
  bump("session");
  track("add_to_cart", { id, price: it.price, size: size || undefined });
  if (fly) flyToCart(it.img);
  else renderCart();
  chimeSoft();
  return it;
}
$("#sAdd").addEventListener("click", () => {
  const id = focus ? focus.id : cart.sheetId;
  if (!id) return;
  addToCart(id);
  setAddLabel(id, true);
  clearTimeout(setAddLabel.t);
  setAddLabel.t = setTimeout(() => {
    if (cart.sheetId === id) setAddLabel(id);
  }, 1600);
});

// the product leaves the 3D shelf and drops into the bag
function flyToCart(src) {
  const btn = $("#cartBtn");
  const to = btn.getBoundingClientRect();
  let x = innerWidth * 0.4,
    y = innerHeight * 0.45;
  if (focus?.obj) {
    const v = new THREE.Vector3();
    focus.obj.getWorldPosition(v);
    v.project(camera);
    x = (v.x * 0.5 + 0.5) * innerWidth;
    y = (-v.y * 0.5 + 0.5) * innerHeight;
  }
  const done = () => {
    renderCart();
    btn.classList.remove("pop");
    void btn.offsetWidth;
    btn.classList.add("pop");
  };
  if (reduceMotion || !src) {
    done();
    return;
  }
  const im = document.createElement("img");
  im.src = src;
  im.className = "fly-item";
  im.alt = "";
  const S = Math.min(220, innerWidth * 0.36);
  im.style.width = im.style.height = S + "px";
  document.body.appendChild(im);
  const tx = to.left + to.width / 2,
    ty = to.top + to.height / 2;
  const mx = (x + tx) / 2,
    my = Math.min(y, ty) - Math.min(160, innerHeight * 0.18);
  const a = im.animate(
    [
      { transform: `translate(${x - S / 2}px,${y - S / 2}px) scale(1)`, opacity: 1, offset: 0 },
      {
        transform: `translate(${mx - S / 2}px,${my - S / 2}px) scale(.55)`,
        opacity: 1,
        offset: 0.55,
      },
      {
        transform: `translate(${tx - S / 2}px,${ty - S / 2}px) scale(.1)`,
        opacity: 0.2,
        offset: 1,
      },
    ],
    { duration: 900, easing: "cubic-bezier(.45,0,.3,1)", fill: "forwards" },
  );
  a.onfinish = () => {
    im.remove();
    done();
  };
}
function chimeSoft() {
  try {
    tone(740, 0.18, "sine", 0.035);
    tone(1109, 0.28, "sine", 0.03, 0.08);
  } catch (e) {}
}

function cartCount() {
  return cart.items.reduce((n, i) => n + i.qty, 0);
}
function cartTotals() {
  const sub = cart.items.reduce((n, i) => n + i.qty * i.price, 0);
  const tax = Math.round(sub * TAX * 100) / 100;
  return { sub, tax, tot: sub + tax };
}
function renderCart() {
  const n = cartCount();
  const cnt = $("#cartCount");
  cnt.textContent = n;
  $("#cartBtn").classList.toggle("has", n > 0);
  $("#cartBtn").setAttribute(
    "aria-label",
    n ? `Cart, ${n} item${n > 1 ? "s" : ""}` : "Cart, empty",
  );
  $("#cartEmpty").hidden = n > 0;
  $("#cartSum").hidden = n === 0;
  $("#cart").querySelector(".fulfil").hidden = n === 0;
  $("#cartItems").innerHTML = cart.items
    .map(
      (i) => `
    <li class="ci" data-key="${esc(i.key)}">
      <div class="ci-img">${i.img ? `<img src="${esc(i.img)}" alt="">` : ""}</div>
      <div class="ci-main">
        <div class="ci-name">${esc(i.name)}</div>
        <div class="ci-meta">${i.size ? "Size " + esc(i.size) : ""}${i.size && i.sku ? " · " : ""}${i.sku ? "SKU " + esc(i.sku) : ""}</div>
        ${i.unlock ? `<div class="ci-unlock"><i></i>Unlocks ${esc(i.unlock)}</div>` : ""}
        <div class="ci-row">
          <div class="qty" role="group" aria-label="Quantity for ${esc(i.name)}">
            <button type="button" data-q="-1" aria-label="Remove one">${i.qty === 1 ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>' : "−"}</button>
            <span aria-live="polite">${i.qty}</span>
            <button type="button" data-q="1" aria-label="Add one">+</button>
          </div>
          <b class="ci-price">${money(i.qty * i.price)}</b>
        </div>
      </div>
    </li>`,
    )
    .join("");
  const t = cartTotals();
  $("#cSub").textContent = money(t.sub);
  $("#cTax").textContent = money(t.tax);
  $("#cTot").textContent = money(t.tot);
  $("#cartUnlocks").innerHTML = n
    ? `<i></i><span>Includes <b>${n} in-game unlock${n > 1 ? "s" : ""}</b>, ready the moment you tap</span>`
    : "";
  // complete the set: suggest one product from the shelf that isn't in the bag
  const have = new Set(cart.items.map((i) => i.id));
  const pick = ["keychain", "tee", "plush", "cap", "hoodie", "figure", "mousepad"].find(
    (id) => !have.has(id) && PROJECT.zones[id]?.enabled && refs.hero[id],
  );
  const up = $("#upsell");
  if (n && pick) {
    const p = P(pick);
    up.hidden = false;
    up.innerHTML = `<div class="up-label">Complete the set</div><div class="up-card"><div class="ci-img"><img src="${esc(snapshot(pick) || p.img || "")}" alt=""></div><div class="ci-main"><div class="ci-name">${esc(p.label)}</div><div class="ci-meta">${money(priceOf(pick))}${p.unlock ? " · unlocks " + esc(p.unlock) : ""}</div></div><button class="btn ghost up-add" type="button" data-add="${pick}" aria-label="Add ${esc(p.label)}">Add</button></div>`;
  } else {
    up.hidden = true;
    up.innerHTML = "";
  }
}
$("#cartItems").addEventListener("click", (e) => {
  const b = e.target.closest("[data-q]");
  if (!b) return;
  const key = b.closest(".ci").dataset.key;
  const it = cart.items.find((i) => i.key === key);
  if (!it) return;
  it.qty += +b.dataset.q;
  if (it.qty <= 0) cart.items.splice(cart.items.indexOf(it), 1);
  renderCart();
  const again = $(`.ci[data-key="${CSS.escape(key)}"] [data-q="${b.dataset.q}"]`);
  (again || $("#cartClose")).focus();
});
$("#upsell").addEventListener("click", (e) => {
  const b = e.target.closest("[data-add]");
  if (!b) return;
  addToCart(b.dataset.add, { fly: false });
  toast(P(b.dataset.add).label + " added");
});
$("#cart")
  .querySelector(".fulfil")
  .addEventListener("click", (e) => {
    const b = e.target.closest("[data-f]");
    if (!b) return;
    cart.fulfil = b.dataset.f;
    $("#cart")
      .querySelectorAll("[data-f]")
      .forEach((x) => x.setAttribute("aria-checked", x === b));
  });

function cartView(v) {
  $("#cart")
    .querySelectorAll(".cart-view")
    .forEach((el) => (el.hidden = el.dataset.v !== v));
  $("#cart").dataset.view = v;
  $("#cartTitle").textContent = v === "pay" ? "Checkout" : v === "done" ? "Thank you" : "Your cart";
}
function openCart() {
  if ($("#phoneWrap").classList.contains("open")) closePhone();
  if (cart.view !== "done") cartView("list");
  renderCart();
  $("#cart").classList.add("open");
  $("#cartBtn").setAttribute("aria-expanded", "true");
  syncControls();
  track("cart_open", { items: cartCount() });
  setTimeout(() => $("#cartClose").focus({ preventScroll: true }), 60);
}
function closeCart() {
  if (!$("#cart").classList.contains("open")) return;
  $("#cart").classList.remove("open");
  $("#cartBtn").setAttribute("aria-expanded", "false");
  syncControls();
  if (cart.view === "done") {
    cart.view = null;
    cartView("list");
  }
}
$("#cartBtn").addEventListener("click", () =>
  $("#cart").classList.contains("open") ? closeCart() : openCart(),
);
$("#cartClose").addEventListener("click", closeCart);
addEventListener(
  "keydown",
  (e) => {
    if (e.key === "Escape" && $("#cart").classList.contains("open")) {
      e.stopImmediatePropagation();
      closeCart();
      $("#cartBtn").focus();
    }
  },
  true,
);

$("#cartCheckout").addEventListener("click", () => {
  if (!cart.items.length) return;
  const t = cartTotals(),
    retailer = PROJECT.brand.retailer;
  $("#payLines").innerHTML =
    cart.items
      .map(
        (i) =>
          `<li><span>${i.qty} × ${esc(i.name)}${i.size ? " (" + esc(i.size) + ")" : ""}</span><span>${money(i.qty * i.price)}</span></li>`,
      )
      .join("") +
    `<li class="muted"><span>${cart.fulfil === "pickup" ? "Pickup today · this " + esc(retailer) : "Shipping · 2-day"}</span><span>Free</span></li><li class="muted"><span>Est. tax</span><span>${money(t.tax)}</span></li>`;
  $("#pTot").textContent = money(t.tot);
  $("#payTxt").textContent = "Pay " + money(t.tot);
  cartView("pay");
  $("#payNow").disabled = false;
  $("#payNow").classList.remove("busy");
  track("checkout", { items: cartCount(), total: Math.round(t.tot * 100) / 100 });
  setTimeout(() => $("#payNow").focus({ preventScroll: true }), 60);
});
$("#payBack").addEventListener("click", () => cartView("list"));
$("#payNow").addEventListener("click", () => {
  const b = $("#payNow");
  if (b.disabled) return;
  b.disabled = true;
  b.classList.add("busy");
  $("#payTxt").textContent = "Processing…";
  setTimeout(completeOrder, reduceMotion ? 200 : 1300);
});
function completeOrder() {
  const items = cart.items.slice();
  const n = cartCount();
  cart.orders++;
  const t = cartTotals();
  const no = "ML-" + (48200 + Math.floor(Math.random() * 700));
  $("#doneSub").textContent =
    `Order ${no} · ${cart.fulfil === "pickup" ? "ready for pickup at this " + PROJECT.brand.retailer + " in about an hour" : "arrives in 2 days"}`;
  $("#twins").innerHTML = items
    .map(
      (i, k) =>
        `<div class="twin" style="--d:${k * 110 + 350}ms"><div class="tw-img">${i.img ? `<img src="${esc(i.img)}" alt="">` : ""}<span class="tw-badge">Unlocked</span></div><b>${esc(i.unlock || i.name)}</b><span>${esc(i.name)}${i.qty > 1 ? " ×" + i.qty : ""}</span></div>`,
    )
    .join("");
  // only products that can activate have an experience to open from here
  const live1 = items.find((i) => i.act && canActivate(i.id));
  $("#doneTry").hidden = !live1;
  $("#doneTry").textContent = "Open your first unlock";
  cart.lastItems = items;
  cart.items = [];
  cart.view = "done";
  cartView("done");
  renderCart();
  track("order", { items: n, total: Math.round(t.tot * 100) / 100 });
  // the sale shows up in the program data
  bump("acts", n);
  for (const i of items) {
    live.perSku[i.id] = (live.perSku[i.id] || 0) + i.qty;
  }
  chime();
  setTimeout(() => $("#doneShop").focus({ preventScroll: true }), 60);
}
$("#doneShop").addEventListener("click", () => {
  closeCart();
});
$("#doneTry").addEventListener("click", () => {
  const first = (cart.lastItems || []).find((i) => i.act && canActivate(i.id));
  closeCart();
  openPhone(first ? first.id : null);
});

/* =========================================================
   Content: product and page copy from the project
   ========================================================= */
function P(id) {
  const pr = PROJECT.zones[id].product;
  return {
    id,
    label: pr.label,
    cat: pr.category,
    sku: pr.sku,
    desc: pr.description,
    unlock: pr.unlock.title,
    unlockSub: pr.unlock.sub,
    img: imgUrl(pr.unlock.image),
    trigger: pr.trigger,
    channel: pr.channel,
    price: pr.price,
    zoom: FIX[id].zoom,
  };
}
// "Prepared for": the client link's name wins, then ?to=, then the project's client
let linkClient = "";
const preparedFor = () =>
  linkClient || (qs.get("to") || "").trim().slice(0, 80) || PROJECT.client || "";
function applyPreparedFor() {
  const who = preparedFor();
  const s = $("#bSub");
  s.textContent = who ? "Prepared for " + who : PROJECT.brand.sub;
  s.hidden = !s.textContent;
  const f = $("#ldFor");
  if (f) {
    f.textContent = who ? "Prepared for " + who : "";
    f.hidden = !who;
  }
}
// the loader leaves the DOM once they're in: copy for it is set only while it's there
const setText = (sel, v) => {
  const el = $(sel);
  if (el) el.textContent = v;
  return el;
};
// a client link (?c=, published endcaps) resolves in the background
function resolvePreparedFor() {
  applyPreparedFor();
  if (MODE === "published")
    window.ARTrack?.link
      ?.then?.((l) => {
        if (l?.name) {
          linkClient = String(l.name).slice(0, 80);
          applyPreparedFor();
        }
      })
      .catch?.(() => {});
}
function buildThemeButtons() {
  const seg = $("#themeSeg");
  seg.querySelectorAll("[data-theme]").forEach((b) => b.remove());
  for (const t of PROJECT.themes) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.theme = t.id;
    b.setAttribute("aria-pressed", String(t.id === currentTheme));
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = t.led;
    b.append(dot, t.name);
    seg.appendChild(b);
  }
  seg.hidden = PROJECT.themes.length < 2;
}
// the loader shows the featured theme's hero-screen art (or its key art), powering on as the scene loads
function setLoaderArt() {
  const th = PROJECT.themes.find((t) => t.id === PROJECT.defaultTheme) || PROJECT.themes[0],
    g = th.graphics;
  const src =
    imgUrl(g.mode === "keyart" ? g.keyArt || g.screen : g.screen || g.keyArt) ||
    imgUrl(PROJECT.activation.splash);
  const hero = $(".ld-hero");
  if (!hero) return;
  hero.hidden = !src;
  if (!src || $("#ldOn").getAttribute("src") === src) return;
  hero.classList.remove("in");
  const on = () => hero.classList.add("in");
  const im = $("#ldOn");
  im.addEventListener("load", on, { once: true });
  im.addEventListener("error", on, { once: true });
  for (const id of ["#ldOff", "#ldOn", "#ldRef"]) $(id).src = src;
}
function applyCopy() {
  const p = PROJECT,
    b = p.brand;
  // same rule as the /x/<slug> route's <title>: the brand lockup, never the internal project name
  if (MODE !== "published") document.title = `${b.lockup || p.name} · Activated Retail`;
  $("#bLockup").innerHTML = lockupHTML(b.lockup || "MEDIALIFE®");
  const chip = $("#ldChip");
  if (chip) chip.innerHTML = lockupHTML(b.lockup || "MEDIALIFE®");
  setText("#ldTitle", b.splashTitle);
  const sub = setText("#ldSub", b.splashSub);
  if (sub) sub.hidden = !b.splashSub;
  applyPreparedFor();
  setText("#ldFootRetail", `Designed for ${b.retailer} endcaps`);
  $("#sStock").textContent = `In stock at this ${b.retailer}`;
  $("#fPickup").textContent = `This ${b.retailer} · ready in 1 hr`;
  document.querySelectorAll("[data-cta]").forEach((el) => {
    el.textContent = p.cta.label;
  });
  document.querySelector('[data-mode="tour"]').hidden = !p.tour.length;
  document.querySelector('[data-action="activate"]').hidden = p.activation.type === "none";
  // a published endcap without AR files has nothing to open; previews and templates explain when they come
  document.querySelector('[data-action="ar"]').hidden = MODE === "published" && !arFiles();
  $("#tPresent").hidden = !window.ARPresent?.start || IN_PREVIEW;
  buildThemeButtons();
  setLoaderArt();
  refreshQR();
  if (THEMES[currentTheme]) applyThemeCopy(THEMES[currentTheme]);
}
function applyThemeCopy(th) {
  $("#sUnlockIn").textContent = "Unlocks in " + th.game;
  $("#kRetLbl").textContent = "Outbound to " + th.game;
  $("#twinsTitle").textContent = "Your digital twins are already in " + th.game;
}
// the live QR (activation.qrUrl): right tower (see qrComposite), hero screen, and the phone demo's side card
let qrFor = null;
function refreshQR() {
  const url = PROJECT.activation.qrUrl || null;
  if (url === qrFor) return;
  qrFor = url;
  heroQR = url ? qrCanvas(url, 660) : null;
  $("#realQr").hidden = !url;
  if (url) {
    const cv = $("#realQrCv");
    drawQR(cv.getContext("2d"), url, 0, 0, cv.width, 1);
    $("#realQrA").href = url;
    $("#realQrTxt").textContent = `Point your phone's camera at this code to open ${qrLabel(url)}.`;
    $("#realQrCv").setAttribute("aria-label", "QR code for " + qrLabel(url));
  }
}

/* =========================================================
   Boot + live re-apply (the builder sends a new project on every edit)
   ========================================================= */
let booted = false,
  sceneReadyResolve,
  zonesBusy = Promise.resolve();
const sceneReady = new Promise((r) => (sceneReadyResolve = r));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function boot(raw) {
  PROJECT = normalizeProject(raw);
  if (!SLUG) SLUG = PROJECT.slug || "";
  buildThemes();
  currentTheme = PROJECT.defaultTheme;
  for (const id of ZONE_IDS) live.perSku[id] = SKU_SEED[id];
  resolvePreparedFor();
  applyCopy();
  if (PROJECT.brand.headerText) headerFont().catch(() => {}); // alongside the fixture download
  const gfxReady = loadThemeTextures(currentTheme, (v) => progress("gfx", v));
  await loadDisplay();
  setupHotspots();
  applyGlow();
  booted = true;
  setTheme(currentTheme, { silent: true });
  zonesBusy = applyZones((v) => progress("merch", v));
  await gfxReady;
  await themeReady;
  uploadThemeTextures(currentTheme);
  await zonesBusy;
  await wait(60);
  await warmUp();
  progress("model", 1);
  progress("gfx", 1);
  progress("merch", 1);
  // intro sweep starts the moment they enter
  camera.position.set(-7.5, 3.6, 10.5);
  controls.target.set(0.2, 1.2, 0);
  splashReady(onEnter);
  window.__ready = true;
  sceneReadyResolve();
  post({ type: "ar:loaded" });
  arHandoff();
  // after the intro: textures for the other themes, product snapshots
  setTimeout(() => {
    preloadThemeTextures();
    warmSnapshots();
  }, 3600);
}
function onEnter() {
  started = true;
  document.body.classList.remove("intro");
  track("enter", { theme: currentTheme });
  if (qs.get("present") === "1" && startPresenting("link")) return;
  // first visit starts in the guided walkthrough, so people see what the display does before they explore
  const tour = !IN_PREVIEW && !window.__NOTOUR && qs.get("notour") !== "1" && PROJECT.tour.length;
  if (tour) setMode("tour", { first: true });
  else flyTo([-2.7, 1.75, 5.3], [0.35, 1.12, 0.1], 3000);
}
async function apply(raw) {
  const next = normalizeProject(raw);
  PROJECT = next;
  if (!SLUG || IN_PREVIEW) SLUG = next.slug || SLUG;
  buildThemes();
  for (const id of ZONE_IDS) if (live.perSku[id] == null) live.perSku[id] = SKU_SEED[id];
  const want = THEMES[currentTheme] ? currentTheme : PROJECT.defaultTheme;
  applyCopy();
  if (focus && !PROJECT.zones[focus.id]?.enabled) unfocus();
  await setTheme(want, { silent: true });
  relabelHotspots();
  zonesBusy = applyZones();
  await zonesBusy;
  if (focus) {
    fillSheet(focus.id);
  }
  if (mode === "tour") {
    if (PROJECT.tour.length) renderTourCard();
    else {
      exitModes();
      homeView();
    }
  }
  if ($("#dash").classList.contains("open")) renderDash();
  renderCart();
  gcTextures();
  // show the change at full frame rate for a moment (the preview idles at a few frames a second)
  lastChange = performance.now();
  renderer.shadowMap.needsUpdate = true;
}
// every project change goes through one queue: a newer one replaces any still waiting
let applying = null,
  pending = null;
function queueApply(p) {
  pending = { p };
  if (!applying) applying = drain();
  return applying;
}
async function drain() {
  let last = null;
  while (pending) {
    const { p } = pending;
    pending = null;
    try {
      if (!booted) await boot(p);
      else await apply(p);
      last = { ok: true };
      post({ type: "ar:applied", ok: true });
    } catch (e) {
      console.error(e);
      last = { ok: false, message: e?.message || String(e) };
      post({ type: "ar:applied", ok: false, message: last.message });
      if (!booted && MODE !== "preview")
        unavailable(
          "This endcap couldn't be shown",
          "Something in its setup is incomplete. Ask the person who shared it with you to check it in the builder.",
        );
      else if (!booted) {
        const st = $("#ldStage");
        if (st) st.textContent = "Could not load: " + last.message;
        $("#loader")?.classList.add("error");
      }
    }
  }
  applying = null;
  return last;
}
function unavailable(title, body) {
  document.body.classList.add("unavailable");
  if (title) $("#unTitle").textContent = title;
  if (body) $("#unBody").textContent = body;
  $("#unavail").hidden = false;
  $("#loader")?.remove();
  $("#gate")?.remove();
}

/* ---------- builder commands ---------- */
async function gotoCmd(o = {}) {
  await sceneReady;
  lastChange = performance.now();
  if (o.theme && THEMES[o.theme] && o.theme !== currentTheme) setTheme(o.theme, { silent: true });
  if (typeof o.zone === "string" && FIX[o.zone]) {
    if (!PROJECT.zones[o.zone].enabled) return;
    exitModes();
    focusProduct(o.zone);
    return;
  }
  if (o.zone === null && focus) unfocus(null, { keepView: !!o.view });
  if (o.view && VIEWS[o.view]) {
    if (focus) unfocus(null, { keepView: true });
    if (mode !== "explore") exitModes();
    gotoStep({ view: o.view, dashboard: o.view === "dashboard" }, 1400);
  }
}
async function tourCmd(play) {
  await sceneReady;
  if (play) {
    if (focus) unfocus(null, { keepView: true });
    exitModes();
    setMode("tour");
  } else if (mode === "tour") {
    exitModes();
    homeView();
  }
}
/** JPEG of the current view: the canvas only holds the 3D scene, never the page UI. */
async function thumb(width = 640) {
  if (!booted) throw new Error("The scene is still loading");
  await sceneReady;
  const w = Math.max(64, Math.min(2048, Math.round(+width || 640)));
  try {
    composer.render();
  } catch (e) {}
  const src = renderer.domElement,
    h = Math.max(1, Math.round((w * src.height) / src.width));
  const c = KA.makeCanvas(w, h);
  c.getContext("2d").drawImage(src, 0, 0, w, h);
  return c.toDataURL("image/jpeg", 0.85);
}
/** AR files (GLB for Scene Viewer, USDZ for Quick Look) of the fixture as shown with that theme (contract C). */
async function exportAR(themeId) {
  if (!booted) throw new Error("The scene is still loading");
  await sceneReady;
  if (themeId && !THEMES[themeId]) throw new Error("Unknown theme: " + themeId);
  if (focus) await new Promise((r) => unfocus(r, { keepView: true }));
  exitModes();
  for (let i = 0; i < 60 && flights.size; i++) await wait(100);
  if (themeId) await setTheme(themeId, { silent: true });
  else await themeReady;
  await zonesBusy;
  if (explodeTw) {
    const i = tweens.indexOf(explodeTw);
    if (i >= 0) tweens.splice(i, 1);
    explodeTw = null;
  }
  explodeT = 0;
  applyExplode();
  document.body.classList.remove("build");
  // the hero screen exports showing its key art, not a live slide
  const m = refs.screens.center.material,
    saved = { map: m.map, em: m.emissiveMap, ei: m.emissiveIntensity, c: m.color.clone() };
  exporting = true;
  if (hdScreenTex?.image) {
    m.map = hdScreenTex;
    m.emissiveMap = hdScreenTex;
  }
  m.emissiveIntensity = GLOW.screen;
  m.color.setScalar(GLOW.diffuse);
  // the exporter keeps textures, not shaders: recoloured fabric goes out as recoloured pixels
  const unbake = bakeTints();
  try {
    let mod;
    try {
      mod = await import("/vendor/ar-kit/ar-export.js");
    } catch (e) {
      throw new Error("The AR exporter is not available (" + (e.message || e) + ")");
    }
    return await mod.exportARFiles(display, {
      maxTexture: 2048,
      onProgress: (msg) => console.info("[ar-export]", msg),
    });
  } finally {
    unbake();
    m.map = saved.map;
    m.emissiveMap = saved.em;
    m.emissiveIntensity = saved.ei;
    m.color.copy(saved.c);
    exporting = false;
    loop.drew0 = false;
  }
}
// The fabric tint (TINT_GLSL) applied to a copy of each tinted texture on the CPU; returns an undo.
function bakeTints() {
  const undo = [];
  const lin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const srgb = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  const smooth = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (const [id, u] of Object.entries(refs.tint || {})) {
    const mat = refs.hero[id]?.material;
    if (!u.uTintOn.value || !mat?.map?.image) continue;
    try {
      const img = mat.map.image,
        W = img.width,
        H = img.height;
      const c = KA.makeCanvas(W, H),
        g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      const px = g.getImageData(0, 0, W, H),
        d = px.data;
      const tr = u.uTint.value.r,
        tg = u.uTint.value.g,
        tb = u.uTint.value.b,
        ref = Math.max(u.uRef.value, 1e-4);
      for (let i = 0; i < d.length; i += 4) {
        const r = lin(d[i] / 255),
          gg = lin(d[i + 1] / 255),
          b = lin(d[i + 2] / 255);
        const k = (0.2126 * r + 0.7152 * gg + 0.0722 * b) / ref;
        const f = 1 - smooth(0.9, 1.7, Math.abs(Math.log2(Math.max(k, 1e-4))));
        if (f <= 0) continue;
        const s = Math.min(1.7, Math.max(0.25, Math.pow(k, 0.85)));
        d[i] = Math.round(255 * srgb(Math.min(1, r + (tr * s - r) * f)));
        d[i + 1] = Math.round(255 * srgb(Math.min(1, gg + (tg * s - gg) * f)));
        d[i + 2] = Math.round(255 * srgb(Math.min(1, b + (tb * s - b) * f)));
      }
      g.putImageData(px, 0, 0);
      // a new texture (a clone would share the original's image source)
      const old = mat.map,
        t = new THREE.Texture(c);
      for (const k of ["flipY", "colorSpace", "wrapS", "wrapT", "channel", "anisotropy"])
        t[k] = old[k];
      t.repeat.copy(old.repeat);
      t.offset.copy(old.offset);
      t.needsUpdate = true;
      mat.map = t;
      u.uTintOn.value = 0;
      undo.push(() => {
        mat.map = old;
        u.uTintOn.value = 1;
        retireTexture(t);
      });
    } catch (e) {
      console.warn("[engine] tint bake", id, e);
    }
  }
  return () => undo.forEach((f) => f());
}

/* =========================================================
   Start
   ========================================================= */
setLight("store");
document.body.classList.add("intro");
if (!window.__NORENDER) renderer.setAnimationLoop(loop);
else {
  setInterval(() => {
    runTweens(performance.now());
  }, 50);
}
window.__engine = {
  mode: MODE,
  get project() {
    return PROJECT;
  },
  apply: (p) => queueApply(p),
  goto: gotoCmd,
  tour: tourCmd,
  exportAR,
  thumb,
  // which zones' default merch honours model.tint / model.print (the builder can grey the others out)
  capabilities: { tint: TINTABLE, print: PRINTABLE },
};
// debug / automation hooks
window.__app = {
  renderer,
  scene,
  composer,
  bloom,
  store,
  lights,
  get display() {
    return display;
  },
  drawScreen,
  applyGlow,
  loop,
  focusProduct,
  unfocus,
  setTheme,
  setLight,
  openPhone,
  closePhone,
  phoneShow,
  startLive,
  startGame,
  get gpuLost() {
    return gpuLost;
  },
  setExplode,
  openDash,
  startTour,
  flyTo,
  camera,
  controls,
  refs,
  THREE,
  exitModes,
  resetPointers,
  zoneState,
  texCache,
  get mode() {
    return mode;
  },
  set mode(v) {
    mode = v;
  },
  get focus() {
    return focus;
  },
  get theme() {
    return currentTheme;
  },
  openCart,
  closeCart,
  addToCart,
  startPresenting,
};

if (MODE === "published") queueApply(window.__AR_PROJECT);
else if (MODE === "template") {
  const name = qs.get("template") || "";
  if (!/^[a-z0-9-]{1,40}$/.test(name))
    unavailable("That template doesn't exist", "Check the template name in the link.");
  else
    fetch("/activated-retail/templates/" + name + ".json", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("not found"))))
      .then((p) => queueApply(p))
      .catch(() =>
        unavailable("That template doesn't exist", "Check the template name in the link."),
      );
} else if (MODE === "preview") {
  let got = false;
  post({ type: "ar:ready" });
  const readyT = setInterval(() => {
    if (got) clearInterval(readyT);
    else post({ type: "ar:ready" });
  }, 500);
  addEventListener("message", (e) => {
    if (e.origin !== location.origin || e.source !== window.parent) return;
    const d = e.data;
    if (!d || typeof d !== "object" || typeof d.type !== "string") return;
    if (d.type === "ar:project") {
      got = true;
      clearInterval(readyT);
      queueApply(d.project);
    } else if (d.type === "ar:goto") gotoCmd(d).catch((err) => postError(err.message));
    else if (d.type === "ar:tour") tourCmd(!!d.play).catch((err) => postError(err.message));
    else if (d.type === "ar:export")
      exportAR(d.theme)
        .then(({ glb, usdz }) =>
          post(
            { type: "ar:export:done", id: d.id, glb, usdz },
            [glb, usdz].filter((b) => b instanceof ArrayBuffer),
          ),
        )
        .catch((err) =>
          post({ type: "ar:export:error", id: d.id, message: err?.message || String(err) }),
        );
    else if (d.type === "ar:thumb")
      thumb(d.width)
        .then((dataUrl) => post({ type: "ar:thumb:done", id: d.id, dataUrl }))
        .catch((err) =>
          post({ type: "ar:thumb:error", id: d.id, message: err?.message || String(err) }),
        );
  });
} else unavailable();
