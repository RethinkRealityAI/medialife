/**
 * The drop stage's 3D: one renderer, the EVADE wardrobe on a glowing grid
 * floor, the neon sign, the hero charm set, the future-drop products and
 * Bobo. Loaded lazily by ../stage.js when the stage nears the viewport.
 *
 * Load order: art + wardrobe + charms + sign (first frame, "ready"), then
 * Bobo, then the future-drop models one by one.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { loadImage, trimmed, makeCanvas, radialCanvas, ensureFonts } from "/merch-shelf/art.js";
import { buildSign } from "/merch-shelf/neon.js";
import { buildProduct } from "/merch-shelf/products.js";
import { buildWardrobe, PLINTH } from "./wardrobe.js";
import { buildDropCharms } from "./charms.js";
import { makeEvadeKit, lipLabel, glowSprite, GOLD, CYAN } from "./prints.js";
import { loadBobo } from "./bobo.js";

const IMG = "/evade/creators/assets/img/";
const ACTIVATE_URL = "https://medialife.ai/evade/creators/";

export const FUTURE = [
  { id: "tee", type: "tee", name: "Activated Tee", slot: "L0", color: "#e9e4d8", yaw: Math.PI - 0.34 },
  { id: "hoodie", type: "hoodie", name: "Activated Hoodie", slot: "R0", color: "#1d2433", yaw: Math.PI + 0.34 },
  { id: "cap", type: "cap", name: "Activated Cap", slot: "L1", color: "#2f5fb3", yaw: 0.42 },
  { id: "deskmat", type: "deskmat", name: "Activated Desk Mat", slot: "R1", color: "#14191f", yaw: 0 },
];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;

function bgTexture() {
  const c = makeCanvas(32, 512);
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, "#060a0e");
  g.addColorStop(0.35, "#16232b");
  g.addColorStop(0.62, "#1a2a33");
  g.addColorStop(0.8, "#0d151b");
  g.addColorStop(1, "#05080b");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function ringCanvas() {
  const S = 512;
  const c = makeCanvas(S, S);
  const ctx = c.getContext("2d");
  ctx.translate(S / 2, S / 2);
  ctx.shadowColor = "#7ff4ff";
  for (const [r, w, a, blur] of [
    [0.44, 10, 0.95, 26],
    [0.36, 4, 0.55, 12],
    [0.47, 2, 0.4, 6],
  ]) {
    ctx.shadowBlur = blur;
    ctx.strokeStyle = `rgba(150,245,255,${a})`;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(0, 0, S * r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // tick marks
  ctx.shadowBlur = 4;
  ctx.strokeStyle = "rgba(150,245,255,0.5)";
  ctx.lineWidth = 3;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    if (i % 12 > 8) continue;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * S * 0.39, Math.sin(a) * S * 0.39);
    ctx.lineTo(Math.cos(a) * S * 0.41, Math.sin(a) * S * 0.41);
    ctx.stroke();
  }
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, S * 0.44);
  g.addColorStop(0, "rgba(54,230,255,0.22)");
  g.addColorStop(1, "rgba(54,230,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, S * 0.44, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

function canvasTex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * The production keychain GLB, if it is there: same handle as buildDropCharms.
 * A missing file is not an error (the procedural set is the default).
 */
async function loadKeychainGLB(loader, url, reduced) {
  try {
    const gltf = await loader.loadAsync(url);
    const root = gltf.scene;
    const bobo = root.getObjectByName("Charm_Bobo");
    const can = root.getObjectByName("Charm_Eclipse");
    if (!bobo || !can) throw new Error("unexpected node layout");
    // match the procedural set's scale (Bobo charm 0.2 tall); the root's
    // origin is already the top of the clasp, the hanging point
    const bb = new THREE.Box3().setFromObject(bobo);
    const s = 0.2 / Math.max(1e-4, bb.max.y - bb.min.y);
    const group = new THREE.Group();
    group.name = "charms";
    const inner = new THREE.Group();
    inner.scale.setScalar(s);
    inner.add(root);
    group.add(inner);
    const materials = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      const m = o.material;
      if (/Print/i.test(o.name) && m?.emissive) {
        // a whisper of self-light keeps the pastel print true under the rim lights
        m.emissive = new THREE.Color(0xffffff);
        m.emissiveMap = m.map;
        m.emissiveIntensity = 0.04;
        materials.push(m);
      }
      if (m?.transmission > 0) {
        m.thickness = Math.max(m.thickness || 0, 0.003);
        m.envMapIntensity = 0.9;
      }
    });
    const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
    const rest = { b: bobo.rotation.clone(), c: can.rotation.clone() };
    let t = Math.random() * 10;
    const amp = reduced ? 0.35 : 1;
    return {
      group,
      materials,
      size,
      source: "glb",
      idle(dt) {
        t += dt;
        group.rotation.z = Math.sin(t * 1.1) * 0.03 * amp;
        bobo.rotation.z = rest.b.z + Math.sin(t * 1.7 + 1) * 0.04 * amp;
        bobo.rotation.y = rest.b.y + Math.sin(t * 0.6) * 0.3 * amp;
        can.rotation.z = rest.c.z + Math.sin(t * 1.4) * 0.05 * amp;
        can.rotation.y = rest.c.y + Math.sin(t * 0.5 + 2) * 0.35 * amp;
      },
      highlight(k) {
        for (const m of materials) m.emissiveIntensity = 0.04 + k * 0.1;
      },
      dispose() {},
    };
  } catch (e) {
    console.warn("[stage] keychain model unavailable, using the procedural set:", e.message);
    return null;
  }
}

/**
 * @param {{canvas:HTMLCanvasElement, el:HTMLElement, reduced:boolean, onProgress?:Function, onSelect?:Function, onBobo?:Function, onBoboReady?:Function, onHoverChange?:Function}} o
 */
export async function createStage({ canvas, el, reduced, keychainUrl = "", onProgress, onSelect, onBobo, onBoboReady, onHoverChange }) {
  const coarse = matchMedia("(pointer: coarse)").matches;
  const small = Math.min(innerWidth, innerHeight) < 700;
  const mobile = coarse || small;
  const quality = mobile ? "low" : "high";

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
  if (!renderer.getContext()) throw new Error("no webgl");
  const maxDpr = mobile ? 1.5 : 1.75;
  let dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  renderer.setPixelRatio(dpr);
  // Neutral keeps the pastel charm art true (ACES washes it out)
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !mobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;

  const scene = new THREE.Scene();
  scene.background = bgTexture();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 40);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.45;
  pmrem.dispose();

  // ---- lights ---------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0x5d8a9a, 0x080a0e, 0.6);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff1e2, 1.6);
  key.position.set(-1.8, 3.4, 4.4);
  key.castShadow = !mobile;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.01;
  key.shadow.radius = 4;
  const sc = key.shadow.camera;
  sc.left = -2;
  sc.right = 2;
  sc.top = 2.4;
  sc.bottom = -0.6;
  sc.near = 0.5;
  sc.far = 12;
  key.target.position.set(0, 0.8, 0);
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xcfe8ff, 0.5);
  fill.position.set(2.6, 0.8, 3);
  scene.add(fill);

  // ---- floor ------------------------------------------------------------------
  const floorMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { cA: { value: new THREE.Color(CYAN) }, time: { value: 0 } },
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 cA; uniform float time; varying vec2 vP;
      void main(){
        vec2 p = vP / 0.5;
        vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
        float line = 1.0 - min(min(g.x, g.y), 1.0);
        float r = length(vP * vec2(0.42, 0.75));
        float fade = smoothstep(3.6, 0.3, r);
        float glow = smoothstep(1.6, 0.0, length((vP - vec2(0.0, -0.55)) * vec2(0.6, 1.0)));
        vec3 base = vec3(0.035, 0.06, 0.075);
        vec3 col = base + cA * (line * 0.55 + glow * 0.07);
        gl_FragColor = vec4(col, (0.55 + line * 0.4) * fade);
      }`,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.renderOrder = 0;
  scene.add(floor);

  const ringTex = canvasTex(ringCanvas());
  const ringMat = new THREE.MeshBasicMaterial({
    map: ringTex,
    color: new THREE.Color(1, 1, 1).multiplyScalar(1.4),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const rings = [];
  const addRing = (x, z, s, y = 0.004) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), ringMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.renderOrder = 2;
    scene.add(m);
    rings.push(m);
    return m;
  };
  const HOME = new THREE.Vector3(0, 0, 0.62);
  addRing(HOME.x, HOME.z, 0.78);
  addRing(-1.05, 0.78, 0.42);
  addRing(1.05, 0.78, 0.42);

  // ---- wardrobe ----------------------------------------------------------------
  const wardrobe = buildWardrobe({ hero: CYAN, soon: "#2aa9bb", gold: GOLD, quality });
  scene.add(wardrobe.group);
  const W = wardrobe.size.w;

  // ---- dim plane + light pool for focus -------------------------------------------
  const dim = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 20),
    new THREE.MeshBasicMaterial({ color: 0x03060a, transparent: true, opacity: 0, depthWrite: false }),
  );
  dim.position.set(0, 1, wardrobe.size.d / 2 + 0.1);
  dim.renderOrder = 20;
  dim.visible = false;
  scene.add(dim);
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: canvasTex(
        radialCanvas([
          [0, "rgba(255,255,255,0.9)"],
          [0.35, "rgba(255,255,255,0.3)"],
          [0.7, "rgba(255,255,255,0.07)"],
          [1, "rgba(255,255,255,0)"],
        ]),
      ),
      color: new THREE.Color(CYAN),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  pool.renderOrder = 21;
  pool.visible = false;
  scene.add(pool);

  // ---- post -------------------------------------------------------------------
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: mobile ? 2 : 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const BLOOM = 0.7;
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), BLOOM, 0.45, 1.25);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const BLOOM_SCALE = mobile ? 0.4 : 0.5;

  onProgress?.(0.35);

  // ---- art (the hero keychain model starts loading first) ----------------------
  const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const keychainGLB = keychainUrl ? loadKeychainGLB(gltfLoader, keychainUrl, reduced) : Promise.resolve(null);
  await ensureFonts();
  const [boboImg, canImg] = await Promise.all([
    loadImage(IMG + "bobo-cat.webp").catch(() => loadImage(IMG + "bobo-cat.png")),
    loadImage(IMG + "eclipse-can.webp").catch(() => loadImage(IMG + "eclipse-can.png")),
  ]);
  const bobo = trimmed(boboImg, 900);
  const can = trimmed(canImg, 800);
  const kit = makeEvadeKit({ bobo, can });
  onProgress?.(0.6);

  // ---- neon sign ------------------------------------------------------------------
  const sign = buildSign({ name: "EVADE", handle: "COLA RUN DROP", neon: GOLD, accent: CYAN, maxWidth: W * 0.62, reduced });
  sign.group.position.set(0, wardrobe.top + 0.16 - sign.bounds.bottom, -0.12);
  scene.add(sign.group);
  const signTop = sign.group.position.y + sign.bounds.top;

  // ---- floating cans (the splash's glowing cans, behind the unit) ---------------------
  const canTex = canvasTex(glowSprite(can));
  const canAspect = canTex.image.width / canTex.image.height;
  const floaters = [];
  const FLOAT = [
    [-2.05, 1.95, -1.4, 0.36, -0.5],
    [2.15, 1.55, -1.6, 0.42, 0.4],
    [-1.75, 0.85, -2.2, 0.28, 0.3],
    [1.85, 2.45, -2.4, 0.26, -0.35],
    [-1.0, 2.55, -2.8, 0.22, 0.6],
    [2.6, 0.7, -2.6, 0.24, -0.2],
  ];
  for (const [x, y, z, h, r] of FLOAT) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(h * canAspect, h),
      new THREE.MeshBasicMaterial({ map: canTex, transparent: true, depthWrite: false, color: 0xbcc8cc }),
    );
    m.position.set(x, y, z);
    m.rotation.z = r;
    m.userData = { y, r, ph: Math.random() * 6 };
    scene.add(m);
    floaters.push(m);
  }

  // motes
  const N = mobile ? 70 : 140;
  const mpos = new Float32Array(N * 3);
  const mseed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    mpos[i * 3] = (Math.random() - 0.5) * 7;
    mpos[i * 3 + 1] = Math.random() * 3.2;
    mpos[i * 3 + 2] = -2.6 + Math.random() * 3.6;
    mseed[i] = Math.random();
  }
  const mgeo = new THREE.BufferGeometry();
  mgeo.setAttribute("position", new THREE.BufferAttribute(mpos, 3));
  const motes = new THREE.Points(
    mgeo,
    new THREE.PointsMaterial({
      size: 0.022,
      map: canvasTex(radialCanvas([[0, "rgba(255,255,255,1)"], [0.3, "rgba(255,255,255,0.6)"], [1, "rgba(255,255,255,0)"]], 64)),
      color: new THREE.Color(CYAN).multiplyScalar(0.9),
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  motes.frustumCulled = false;
  scene.add(motes);

  // ---- hero charm set ----------------------------------------------------------------
  const heroSlot = wardrobe.slots.hero;
  const charms =
    (await keychainGLB) ||
    buildDropCharms({ bobo, can, activateUrl: ACTIVATE_URL, quality, reduced });
  const heroItem = new THREE.Group();
  heroItem.name = "item-keychain";
  const heroSpin = new THREE.Group();
  heroItem.add(heroSpin);
  heroSpin.add(charms.group);
  const pegY = heroSlot.topY - 0.13;
  const pegLen = heroSlot.depth * 0.5;
  {
    const chrome = new THREE.MeshStandardMaterial({ color: 0xd9dce3, roughness: 0.18, metalness: 1 });
    const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, pegLen, 12), chrome);
    peg.rotation.x = Math.PI / 2;
    peg.position.set(0, pegY, heroSlot.backZ + pegLen / 2);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 8), chrome);
    cap.position.set(0, pegY, heroSlot.backZ + pegLen);
    scene.add(peg, cap);
  }
  heroItem.position.set(0, pegY - 0.005, heroSlot.backZ + pegLen * 0.86);
  heroItem.rotation.y = -0.2;
  scene.add(heroItem);
  // glow ring on the hero bay floor, under the charms
  addRing(0, 0.02, 0.62, heroSlot.floorY + 0.003);
  // rim lights: cyan from the left-back, gold from the right-back, a soft key from the front
  const rimA = new THREE.PointLight(new THREE.Color(CYAN), 0.9, 1.3, 1.4);
  const rimB = new THREE.PointLight(new THREE.Color(GOLD), 0.75, 1.3, 1.4);
  scene.add(rimA, rimB);
  const heroKey = new THREE.SpotLight(0xffffff, 1.7, 3.5, 0.42, 0.7, 1.2);
  heroKey.position.set(0.1, heroSlot.topY + 0.25, 1.6);
  heroKey.target = heroItem;
  scene.add(heroKey);

  let heroScale = 2.4;
  function placeHero() {
    charms.group.scale.setScalar(heroScale);
    const midY = pegY - 0.17 * heroScale;
    rimA.position.set(-0.32, midY + 0.12, heroSlot.backZ + 0.08);
    rimB.position.set(0.34, midY - 0.08, heroSlot.backZ + 0.08);
  }
  placeHero();

  // shelf-lip labels
  const lips = [];
  const addLip = (slot, text, live) => {
    const t = canvasTex(lipLabel(text, { live }));
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(live ? 0.56 : 0.27, live ? 0.087 : 0.042),
      new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(1, 1, 1).multiplyScalar(live ? 1.15 : 0.9), toneMapped: false }),
    );
    // the live label hangs at the top of the hero bay, above the clasp, where it reads first;
    // the future-drop labels stay on the shelf lips
    if (live) m.position.set(slot.center.x, slot.topY - 0.064, slot.frontZ + 0.006);
    else m.position.set(slot.center.x, slot.floorY - 0.025, slot.frontZ + 0.003);
    scene.add(m);
    lips.push(m);
  };
  addLip(heroSlot, "LIVE NOW · DROP 01", true);
  for (const f of FUTURE) addLip(wardrobe.slots[f.slot], "FUTURE DROP · SOON", false);

  // pick proxies
  const heroHit = new THREE.Mesh(
    new THREE.BoxGeometry(heroSlot.width * 0.9, heroSlot.height * 0.9, heroSlot.depth),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  heroHit.position.copy(heroSlot.center);
  heroHit.userData.productId = "keychain";
  scene.add(heroHit);
  const hits = [heroHit];
  for (const f of FUTURE) {
    const s = wardrobe.slots[f.slot];
    const h = new THREE.Mesh(
      new THREE.BoxGeometry(s.width * 0.94, s.height * 0.94, s.depth),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    h.position.copy(s.center);
    h.userData.productId = f.id;
    scene.add(h);
    hits.push(h);
  }

  // ---- items registry ------------------------------------------------------------------
  const items = new Map();
  items.set("keychain", {
    id: "keychain",
    item: heroItem,
    spin: heroSpin,
    slot: heroSlot,
    home: { pos: heroItem.position.clone(), yaw: heroItem.rotation.y },
    idle: charms.idle,
    highlight: (k) => charms.highlight(k),
    color: GOLD,
    ready: true,
  });
  for (const f of FUTURE) items.set(f.id, { id: f.id, slot: wardrobe.slots[f.slot], ready: false, color: CYAN, def: f });

  // ---- camera rig ------------------------------------------------------------------
  let width = 1;
  let height = 1;
  const cam = { target: new THREE.Vector3(0, 1, 0), dist: 6, yaw: 0, pitch: 0.08 };
  const heroPose = { target: new THREE.Vector3(), dist: 6, yaw: 0, pitch: 0.08 };
  const drag = { yaw: 0, v: 0 };
  const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
  let mode = "hero";
  let flight = null;
  const tanHalf = () => Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

  function computeHero() {
    const aspect = width / height;
    const portrait = aspect < 0.9;
    const pitch = portrait ? 0.11 : 0.09;
    // the floor in front (Bobo's patrol) up to the sign; the near floor
    // projects below y=0, so the frame starts under it
    const y0 = portrait ? -0.3 : -0.26;
    const y1 = signTop + 0.06;
    const frameW = portrait ? W * 0.94 : W + 0.55;
    const frameH = y1 - y0;
    // insets: the selector bar at the bottom, a little air at the top
    const top = portrait ? 8 : 10;
    const bottom = (portrait ? 108 : 98) + 6;
    const usableH = Math.max(0.3, 1 - (top + bottom) / height);
    const m = portrait ? 1.0 : 0.96;
    const dV = frameH / (2 * tanHalf() * usableH * m);
    const dH = frameW / (2 * tanHalf() * aspect * m);
    const dist = Math.max(dV, dH) + 0.25;
    const visH = 2 * tanHalf() * dist;
    const target = new THREE.Vector3(0, (y0 + y1) / 2, 0.25);
    target.y -= ((bottom - top) / 2 / height) * visH;
    heroPose.target.copy(target);
    heroPose.dist = dist;
    heroPose.pitch = pitch;
    heroPose.yaw = 0;
    heroScale = portrait ? 2.85 : 2.45;
    placeHero();
  }

  function focusPose(it) {
    const aspect = width / height;
    const portrait = aspect < 0.9;
    const box = new THREE.Box3().setFromObject(it.spin);
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(size.x, size.z) * 0.5;
    const w = Math.max(size.x, size.z, 0.1) * 1.05;
    const h = Math.max(size.y, 0.1);
    // portrait: the caption takes the bottom of the frame; landscape: the left
    const fillV = portrait ? 0.44 : 0.64;
    const fillH = portrait ? 0.78 : 0.44;
    const dV = h / (2 * tanHalf() * fillV);
    const dH = w / (2 * tanHalf() * aspect * fillH);
    const dist = Math.max(dV, dH) + r;
    const visH = 2 * tanHalf() * dist;
    const target = c.clone();
    if (portrait) target.y -= visH * (it.id === "keychain" ? 0.21 : 0.19);
    else {
      target.y -= visH * 0.04;
      target.x -= visH * aspect * 0.1;
    }
    return { target, dist, yaw: 0, pitch: 0.03 };
  }

  function flyTo(pose, dur = 1.1) {
    const from = { target: cam.target.clone(), dist: cam.dist, yaw: cam.yaw, pitch: cam.pitch };
    flight = { from, to: pose, t: 0, dur: reduced ? 0.3 : dur };
  }

  function applyCamera(t) {
    let yaw = cam.yaw;
    let pitch = cam.pitch;
    if (mode === "hero") {
      if (!reduced) yaw += Math.sin(t * 0.13) * 0.06;
      yaw += drag.yaw + parallax.x * 0.05;
      pitch += parallax.y * 0.025;
    }
    const d = cam.dist;
    camera.position.set(
      cam.target.x + Math.sin(yaw) * Math.cos(pitch) * d,
      cam.target.y + Math.sin(pitch) * d,
      cam.target.z + Math.cos(yaw) * Math.cos(pitch) * d,
    );
    camera.lookAt(cam.target);
  }

  function resize() {
    const r = el.getBoundingClientRect();
    width = Math.max(1, Math.round(r.width));
    height = Math.max(1, Math.round(r.height));
    renderer.setSize(width, height, false);
    composer.setPixelRatio(dpr);
    composer.setSize(width, height);
    bloom.resolution.set(width * BLOOM_SCALE, height * BLOOM_SCALE);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    computeHero();
    if (mode === "hero" && !flight) {
      cam.target.copy(heroPose.target);
      cam.dist = heroPose.dist;
      cam.yaw = heroPose.yaw;
      cam.pitch = heroPose.pitch;
    } else if (mode === "focus" && focused) {
      const it = items.get(focused);
      if (it?.ready && !it.anim) flyTo(focusPose(it), 0.4);
    }
    renderer.shadowMap.needsUpdate = true;
  }

  // ---- focus ---------------------------------------------------------------------
  let focused = null;
  let dimK = 0;
  let autoSpinPause = 0;

  function liftTarget(it) {
    const s = it.slot;
    if (it.id === "keychain") {
      return { pos: new THREE.Vector3(0, it.home.pos.y + 0.02, s.frontZ + 0.6), yaw: 0 };
    }
    // future drops are drawn straight out of their cubby, well clear of the shelf,
    // in front of the dimmed unit, so each gets a clean presentation
    const box = new THREE.Box3().setFromObject(it.item);
    const c = box.getCenter(new THREE.Vector3());
    const dy = Math.max(0, 0.78 - c.y);
    const p = it.home.pos.clone();
    p.x = p.x * 0.9;
    p.y += dy + 0.04;
    p.z = s.frontZ + 0.72;
    return { pos: p, yaw: 0 };
  }

  function animItem(it, toPos, toYaw, toSpin, dur, toRotX) {
    it.anim = {
      t: 0,
      dur: reduced ? 0.25 : dur,
      p0: it.item.position.clone(),
      p1: toPos.clone(),
      y0: it.item.rotation.y,
      y1: toYaw,
      s0: it.spin.rotation.y,
      s1: toSpin,
      x0: it.item.rotation.x,
      x1: toRotX ?? it.item.rotation.x,
    };
  }

  function sendHome(it) {
    if (!it?.ready) return;
    const s1 = Math.round(it.spin.rotation.y / (Math.PI * 2)) * Math.PI * 2;
    animItem(it, it.home.pos, it.home.yaw, s1, 0.8, it.home.rotX);
    it.highlight?.(0);
  }

  function liftOut(it) {
    const l = liftTarget(it);
    animItem(it, l.pos, it.id === "keychain" ? 0 : it.home.yaw, it.spin.rotation.y, 0.9, it.def?.type === "deskmat" ? -0.05 : undefined);
  }

  function select(id) {
    if (!items.has(id)) return;
    if (focused === id) return;
    if (focused) sendHome(items.get(focused));
    focused = id;
    mode = "focus";
    const it = items.get(id);
    wardrobeFocus.target = 1;
    pool.material.color.set(it.color);
    if (it.ready) {
      liftOut(it);
      // fly to where it will be
      const saved = { p: it.item.position.clone(), y: it.item.rotation.y, x: it.item.rotation.x };
      const l = liftTarget(it);
      it.item.position.copy(l.pos);
      it.item.rotation.y = it.anim.y1;
      it.item.rotation.x = it.anim.x1;
      it.item.updateMatrixWorld(true);
      const pose = focusPose(it);
      it.item.position.copy(saved.p);
      it.item.rotation.y = saved.y;
      it.item.rotation.x = saved.x;
      flyTo(pose, 1.1);
    } else {
      const s = it.slot;
      flyTo(
        { target: s.center.clone().add(new THREE.Vector3(0, -0.05, 0.3)), dist: 2.4, yaw: 0, pitch: 0.03 },
        1.1,
      );
    }
    boboApi?.watch(liftTarget(it).pos);
    renderer.shadowMap.needsUpdate = true;
  }

  function reset() {
    if (!focused) return;
    sendHome(items.get(focused));
    focused = null;
    mode = "hero";
    wardrobeFocus.target = 0;
    drag.yaw = 0;
    flyTo({ ...heroPose, target: heroPose.target.clone() }, 1.0);
    boboApi?.watch(null);
  }

  const wardrobeFocus = { k: 0, target: 0 };

  // ---- input -------------------------------------------------------------------------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let boboApi = null;
  function pickAt(cx, cy) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (boboApi) {
      const h = ray.intersectObject(boboApi.hit, false)[0];
      if (h) return { bobo: true };
    }
    if (mode === "focus") {
      const it = items.get(focused);
      if (it?.ready) {
        const h = ray.intersectObject(it.spin, true)[0];
        if (h) return { productId: focused, self: true };
      }
      return null;
    }
    const h = ray.intersectObjects(hits, false)[0];
    return h ? { productId: h.object.userData.productId } : null;
  }

  let down = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (!e.isPrimary) return;
    down = { x: e.clientX, y: e.clientY, lx: e.clientX, t: performance.now(), horiz: null, id: e.pointerId };
  });
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse") {
      const r = canvas.getBoundingClientRect();
      parallax.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
      parallax.ty = ((e.clientY - r.top) / r.height) * 2 - 1;
      if (!down) hover(e.clientX, e.clientY);
    }
    if (!down || down.id !== e.pointerId) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    if (down.horiz === null && Math.hypot(dx, dy) > 8) {
      down.horiz = Math.abs(dx) > Math.abs(dy) * 1.2;
      if (down.horiz) {
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {}
      }
    }
    if (down.horiz) {
      const step = e.clientX - down.lx;
      down.lx = e.clientX;
      if (mode === "focus") {
        const it = items.get(focused);
        if (it?.ready && !it.anim) {
          it.spin.rotation.y += step * 0.012;
          autoSpinPause = 2.5;
        }
      } else {
        drag.yaw = clamp(drag.yaw - step * 0.0035, -0.38, 0.38);
      }
    }
  });
  const endDrag = (e) => {
    if (!down || down.id !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const wasTap = e.type === "pointerup" && moved < 10 && performance.now() - down.t < 700;
    down = null;
    if (!wasTap) return;
    const p = pickAt(e.clientX, e.clientY);
    if (p?.bobo) {
      boboApi.tap();
      onBobo?.();
    } else if (p?.productId && !p.self) onSelect?.(p.productId);
    else if (!p && mode === "focus") onSelect?.(null);
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("pointerleave", () => {
    parallax.tx = 0;
    parallax.ty = 0;
    hover(-1, -1);
  });

  let hovered = null;
  function hover(x, y) {
    const p = x < 0 ? null : pickAt(x, y);
    const id = p?.bobo ? "bobo" : mode === "hero" ? p?.productId || null : null;
    canvas.style.cursor = p ? "pointer" : "";
    if (id === hovered) return;
    if (hovered && items.get(hovered)?.highlight) items.get(hovered).highlight(0);
    hovered = id;
    if (id && items.get(id)?.highlight) items.get(id).highlight(1);
    onHoverChange?.(id);
  }

  // ---- loop ---------------------------------------------------------------------
  let active = false;
  let raf = 0;
  let last = performance.now();
  let clock = 0;
  let frames = 0;
  let slowFrames = 0;
  let shadowTick = 0;

  function step(dt) {
    clock += dt;
    // flight
    if (flight) {
      flight.t = Math.min(1, flight.t + dt / flight.dur);
      const k = easeInOut(flight.t);
      cam.target.lerpVectors(flight.from.target, flight.to.target, k);
      cam.dist = lerp(flight.from.dist, flight.to.dist, k);
      cam.yaw = lerp(flight.from.yaw, flight.to.yaw, k);
      cam.pitch = lerp(flight.from.pitch, flight.to.pitch, k);
      if (flight.t >= 1) flight = null;
    }
    if (!down) drag.yaw *= Math.pow(0.35, dt);
    parallax.x += (parallax.tx - parallax.x) * Math.min(1, dt * 3);
    parallax.y += (parallax.ty - parallax.y) * Math.min(1, dt * 3);
    applyCamera(clock);

    // focus dimming
    wardrobeFocus.k += (wardrobeFocus.target - wardrobeFocus.k) * Math.min(1, dt * 4);
    const k = wardrobeFocus.k;
    dim.visible = k > 0.01;
    // blended in linear light: 0.93 reads as roughly a 70% dim once encoded to sRGB
    dim.material.opacity = k * 0.93;
    pool.visible = k > 0.01 && !!focused;
    pool.material.opacity = k * (focused === "keychain" ? 0.14 : 0.26);
    wardrobe.setFocus(focused || "none", k);
    bloom.strength = BLOOM * (1 - k * 0.35);

    for (const it of items.values()) {
      if (!it.ready) continue;
      if (it.anim) {
        const a = it.anim;
        a.t = Math.min(1, a.t + dt / a.dur);
        const e = easeInOut(a.t);
        it.item.position.lerpVectors(a.p0, a.p1, e);
        it.item.rotation.y = lerp(a.y0, a.y1, e);
        it.item.rotation.x = lerp(a.x0, a.x1, e);
        it.spin.rotation.y = lerp(a.s0, a.s1, e);
        if (a.t >= 1) {
          it.anim = null;
          if (it.id !== focused) it.spin.rotation.y = 0;
        }
      } else if (it.id === focused) {
        autoSpinPause -= dt;
        if (!reduced && autoSpinPause <= 0) it.spin.rotation.y += dt * 0.45;
      }
      it.idle?.(dt);
    }
    if (focused) {
      const it = items.get(focused);
      if (it?.ready) {
        const b = new THREE.Box3().setFromObject(it.item);
        const c = b.getCenter(new THREE.Vector3());
        const s = b.getSize(new THREE.Vector3());
        pool.position.set(c.x, c.y, c.z - Math.max(0.12, s.z));
        pool.scale.setScalar(Math.max(s.x, s.y) * (focused === "keychain" ? 1.3 : 1.35));
      }
    }

    sign.update(dt);
    if (!reduced) {
      floorMat.uniforms.time.value = clock;
      rings.forEach((r, i) => (r.rotation.z += dt * (i % 2 ? -0.15 : 0.2)));
      for (const f of floaters) {
        f.position.y = f.userData.y + Math.sin(clock * 0.6 + f.userData.ph) * 0.06;
        f.rotation.z = f.userData.r + Math.sin(clock * 0.4 + f.userData.ph) * 0.08;
      }
      for (let i = 0; i < N; i++) {
        mpos[i * 3 + 1] += dt * (0.02 + mseed[i] * 0.04);
        mpos[i * 3] += Math.sin(clock * 0.3 + mseed[i] * 40) * dt * 0.015;
        if (mpos[i * 3 + 1] > 3.3) mpos[i * 3 + 1] = 0;
      }
      mgeo.attributes.position.needsUpdate = true;
    }
    boboApi?.update(dt);

    if (renderer.shadowMap.enabled && ++shadowTick % 3 === 0) renderer.shadowMap.needsUpdate = true;
  }

  function frame(now) {
    raf = 0;
    if (!active) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(dt);
    composer.render();
    // adaptive: a slow device gets a lower resolution once
    frames++;
    if (frames > 30 && frames < 240 && dt > 0.034) slowFrames++;
    if (slowFrames > 60 && dpr > 1) {
      dpr = 1;
      renderer.setPixelRatio(dpr);
      resize();
      slowFrames = -1e9;
    }
    raf = requestAnimationFrame(frame);
  }

  let frozen = false;
  function setActive(on) {
    if (frozen) on = false;
    if (on === active) return;
    active = on;
    if (on) {
      last = performance.now();
      if (!raf) raf = requestAnimationFrame(frame);
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  const ro = new ResizeObserver(() => resize());
  ro.observe(el);
  resize();
  cam.target.copy(heroPose.target);
  cam.dist = heroPose.dist;
  cam.pitch = heroPose.pitch;
  renderer.shadowMap.needsUpdate = true;
  // compile + first frame before we say ready
  step(0.016);
  composer.render();
  onProgress?.(1);

  // ---- background loads ------------------------------------------------------------
  let ignited = false;
  const later = (async () => {
    try {
      const b = W / 2;
      boboApi = await loadBobo({
        loader: gltfLoader,
        scene,
        bounds: { x0: -b + 0.2, x1: b - 0.2, z0: wardrobe.size.d / 2 + 0.2, z1: wardrobe.size.d / 2 + 0.55 },
        home: HOME,
        camera,
        reduced,
      });
      onBoboReady?.(boboApi.clips);
    } catch (e) {
      console.warn("[stage] Bobo unavailable:", e.message);
    }
    for (const f of FUTURE) {
      try {
        const product = { id: f.id, type: f.type, name: f.name, price: 0, color: f.color, enabled: true };
        const h = await buildProduct({ product, slot: wardrobe.slots[f.slot], kit, accent: CYAN, neon: GOLD, activateUrl: ACTIVATE_URL, quality });
        // the stage never shows prices: hide the shelf's price tag
        h.mount.traverse((o) => {
          const p = o.geometry?.parameters;
          if (o.isMesh && p && Math.abs(p.width - 0.2) < 1e-6 && Math.abs(p.height - 0.035) < 1e-6) o.visible = false;
        });
        h.hit.visible = false;
        h.hit.removeFromParent();
        h.item.rotation.y = f.yaw;
        scene.add(h.mount, h.item);
        const it = items.get(f.id);
        Object.assign(it, {
          item: h.item,
          spin: h.spin,
          home: { pos: h.item.position.clone(), yaw: h.item.rotation.y, rotX: h.item.rotation.x },
          idle: h.idle,
          highlight: (k) => h.highlight(k * 0.8),
          ready: true,
        });
        renderer.shadowMap.needsUpdate = true;
        if (focused === f.id) {
          liftOut(it);
          const saved = it.item.position.clone();
          const l = liftTarget(it);
          it.item.position.copy(l.pos);
          it.item.updateMatrixWorld(true);
          const pose = focusPose(it);
          it.item.position.copy(saved);
          flyTo(pose, 0.8);
        }
      } catch (e) {
        console.warn("[stage] product unavailable:", f.id, e.message);
      }
    }
  })();

  return {
    select,
    reset,
    setActive(on) {
      setActive(on);
      if (on && !ignited) {
        ignited = true;
        sign.ignite();
      }
    },
    get focused() {
      return focused;
    },
    later,
    debug: {
      get bobo() {
        return boboApi;
      },
      items,
      renderer,
      get state() {
        return { k: wardrobeFocus.k, dim: dim.visible && dim.material.opacity, mode, focused, cam: { ...cam, target: cam.target.toArray() } };
      },
      /** Tests: Bobo's position on screen (CSS px, relative to the stage). */
      boboScreen() {
        if (!boboApi) return null;
        const v = new THREE.Vector3();
        boboApi.hit.getWorldPosition(v);
        v.project(camera);
        return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height };
      },
      /** Tests: stop the loop and advance the simulation by `sec` in fixed steps, then draw once. */
      advance(sec = 1) {
        setActive(false);
        frozen = true;
        for (let t = 0; t < sec; t += 1 / 30) step(1 / 30);
        composer.render();
      },
    },
  };
}
