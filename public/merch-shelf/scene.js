/**
 * The stage: renderer, bloom, camera + limited orbit, lights, backdrops
 * (midnight / sunset / arcade / snow) with their particles, picking, camera
 * flights and the render loop (which sleeps when nothing moves or the tab is
 * hidden).
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { makeCanvas, radialCanvas } from "./art.js";

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);

const BACKDROPS = {
  midnight: {
    stops: [
      ["#18214a", 0],
      ["#0b1027", 0.5],
      ["#04060f", 1],
    ],
    radial: true,
    sky: 0x4a5a9a,
    particles: "dust",
    tint: 0xaecbff,
  },
  sunset: {
    stops: [
      ["#2a1150", 0],
      ["#5d1f62", 0.42],
      ["#b8434f", 0.75],
      ["#f08a3c", 1],
    ],
    radial: false,
    sky: 0xc87aa0,
    particles: "dust",
    tint: 0xffd2a8,
  },
  arcade: {
    stops: [
      ["#0c0820", 0],
      ["#07051a", 0.6],
      ["#12062a", 1],
    ],
    radial: false,
    sky: 0x7a5ad0,
    particles: "pixels",
    tint: 0xff7ad8,
  },
  snow: {
    stops: [
      ["#4d7fb0", 0],
      ["#173c66", 0.42],
      ["#0a1d38", 0.8],
      ["#071428", 1],
    ],
    radial: true,
    sky: 0x9fd0ff,
    particles: "snow",
    tint: 0xffffff,
  },
};

function backgroundTexture(kind) {
  const b = BACKDROPS[kind] || BACKDROPS.midnight;
  const c = makeCanvas(64, 512);
  const ctx = c.getContext("2d");
  if (b.radial) {
    const big = makeCanvas(512, 512);
    const g2 = big.getContext("2d");
    const g = g2.createRadialGradient(256, 150, 0, 256, 220, 460);
    for (const [col, at] of b.stops) g.addColorStop(at, col);
    g2.fillStyle = g;
    g2.fillRect(0, 0, 512, 512);
    addGrain(g2, 512, 512);
    const t = new THREE.CanvasTexture(big);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  for (const [col, at] of b.stops) g.addColorStop(at, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 512);
  addGrain(ctx, 64, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function addGrain(ctx, w, h) {
  const id = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < id.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 5;
    id.data[i] += n;
    id.data[i + 1] += n;
    id.data[i + 2] += n;
  }
  ctx.putImageData(id, 0, 0);
}

let sprite = null;
function softSprite() {
  if (!sprite) {
    sprite = new THREE.CanvasTexture(
      radialCanvas(
        [
          [0, "rgba(255,255,255,1)"],
          [0.3, "rgba(255,255,255,0.6)"],
          [1, "rgba(255,255,255,0)"],
        ],
        64,
      ),
    );
    sprite.colorSpace = THREE.SRGBColorSpace;
  }
  return sprite;
}

export function createScene({
  canvas,
  quality = "high",
  reduced = false,
  onHover,
  onPick,
  onFocusDrag,
  onUserMove,
}) {
  const mobile = quality !== "high";
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
  });
  if (!renderer.getContext()) throw new Error("no webgl");
  const maxDpr = mobile ? 1.5 : 2;
  let dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !mobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 60);
  camera.position.set(0, 0.2, 6);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.42;
  pmrem.dispose();

  // ---- lights -------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0x4a5a9a, 0x0a0a10, 0.55);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff1e2, 1.7);
  key.position.set(-1.6, 3.2, 4.2);
  key.castShadow = !mobile;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.01;
  key.shadow.radius = 4;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xcfe0ff, 0.45);
  fill.position.set(2.5, 0.5, 3);
  scene.add(fill);

  // ---- content root -------------------------------------------------------
  const root = new THREE.Group();
  scene.add(root);
  const backdrop = new THREE.Group();
  scene.add(backdrop);

  // dimmer for focus mode: sits between the shelf and a lifted product
  const dim = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshBasicMaterial({
      color: 0x03040a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  dim.position.z = 0.32;
  dim.renderOrder = 20;
  dim.visible = false;
  scene.add(dim);

  // ---- post ---------------------------------------------------------------
  const rt = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: mobile ? 2 : 4,
  });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.42, 1.2);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const BLOOM_SCALE = mobile ? 0.4 : 0.5;

  // ---- controls -----------------------------------------------------------
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.rotateSpeed = 0.45;
  controls.zoomSpeed = 0.6;
  controls.addEventListener("start", () => {
    userActive = true;
    lastInput = performance.now();
    onUserMove?.();
  });
  controls.addEventListener("end", () => {
    userActive = false;
    lastInput = performance.now();
  });
  controls.addEventListener("change", () => (dirty = true));

  // ---- state --------------------------------------------------------------
  let width = 1;
  let height = 1;
  let insets = { top: 72, bottom: 96, left: 0, right: 0 };
  const content = new THREE.Box3(new THREE.Vector3(-1, -1, -0.2), new THREE.Vector3(1, 1, 0.2));
  let mode = "hero"; // hero | focus | flight
  let dirty = true;
  let paused = false;
  let userActive = false;
  let lastInput = performance.now();
  let lastFrame = performance.now();
  const updaters = new Set();
  const tweens = [];
  const view = { x: 0, y: 0 }; // current view offset in px
  const parallax = { x: 0, y: 0, tx: 0, ty: 0, applied: new THREE.Vector3() };
  const heroPose = { pos: new THREE.Vector3(), target: new THREE.Vector3(), dist: 6 };

  // ---- backdrop -----------------------------------------------------------
  let particles = null;
  let floor = null;
  let bgTex = null;
  let backdropKind = "midnight";
  let theme = { accent: "#19affe", neon: "#ff37ae" };

  function clearBackdrop() {
    backdrop.children.slice().forEach((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
      backdrop.remove(o);
    });
    particles = null;
    floor = null;
  }

  function setBackdrop(kind, th) {
    backdropKind = BACKDROPS[kind] ? kind : "midnight";
    theme = th || theme;
    const b = BACKDROPS[backdropKind];
    bgTex?.dispose();
    bgTex = backgroundTexture(backdropKind);
    scene.background = bgTex;
    hemi.color.set(b.sky);
    clearBackdrop();
    const box = content.clone();
    const cx = (box.min.x + box.max.x) / 2;
    const w = box.max.x - box.min.x;
    const h = box.max.y - box.min.y;

    // particles
    const N = b.particles === "snow" ? (mobile ? 380 : 700) : mobile ? 140 : 260;
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    const spanX = Math.max(5, w * 2.6);
    const spanY = Math.max(4, h * 2.2);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = cx + (Math.random() - 0.5) * spanX;
      pos[i * 3 + 1] = (box.min.y + box.max.y) / 2 + (Math.random() - 0.5) * spanY;
      pos[i * 3 + 2] = -2.6 + Math.random() * 4.2;
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: b.particles === "snow" ? 0.028 : b.particles === "pixels" ? 0.02 : 0.016,
      map: softSprite(),
      color: new THREE.Color(b.tint).multiplyScalar(b.particles === "snow" ? 0.95 : 0.7),
      transparent: true,
      opacity: b.particles === "snow" ? 0.85 : 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    backdrop.add(pts);
    particles = {
      pts,
      pos,
      seed,
      N,
      kind: b.particles,
      spanX,
      spanY,
      cx,
      cy: (box.min.y + box.max.y) / 2,
    };

    // bokeh: a few big soft discs far behind
    if (b.particles !== "snow") {
      const bk = new Float32Array(18 * 3);
      for (let i = 0; i < 18; i++) {
        bk[i * 3] = cx + (Math.random() - 0.5) * spanX * 1.2;
        bk[i * 3 + 1] = particles.cy + (Math.random() - 0.5) * spanY;
        bk[i * 3 + 2] = -3 - Math.random() * 3;
      }
      const bg = new THREE.BufferGeometry();
      bg.setAttribute("position", new THREE.BufferAttribute(bk, 3));
      const bm = new THREE.PointsMaterial({
        size: 0.5,
        map: softSprite(),
        color: new THREE.Color(backdropKind === "sunset" ? "#ffb070" : theme.accent).multiplyScalar(
          0.22,
        ),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      backdrop.add(new THREE.Points(bg, bm));
      const bk2 = new Float32Array(10 * 3);
      for (let i = 0; i < 10; i++) {
        bk2[i * 3] = cx + (Math.random() - 0.5) * spanX * 1.2;
        bk2[i * 3 + 1] = particles.cy + (Math.random() - 0.5) * spanY;
        bk2[i * 3 + 2] = -3 - Math.random() * 3;
      }
      const bg2 = new THREE.BufferGeometry();
      bg2.setAttribute("position", new THREE.BufferAttribute(bk2, 3));
      backdrop.add(
        new THREE.Points(
          bg2,
          new THREE.PointsMaterial({
            size: 0.4,
            map: softSprite(),
            color: new THREE.Color(theme.neon).multiplyScalar(0.18),
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        ),
      );
    }

    // arcade: a glowing perspective grid floor below the shelf
    if (backdropKind === "arcade") {
      const fm = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          cA: { value: new THREE.Color(theme.neon) },
          cB: { value: new THREE.Color(theme.accent) },
          time: { value: 0 },
        },
        vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 cA; uniform vec3 cB; uniform float time; varying vec2 vP;
          void main(){
            vec2 p = vP * 2.2; p.y += time*0.25;
            vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
            float line = 1.0 - min(min(g.x, g.y), 1.0);
            float fade = smoothstep(9.0, 0.5, length(vP*vec2(0.55,1.0)));
            vec3 col = mix(cB, cA, smoothstep(-4.0, 4.0, vP.x));
            gl_FragColor = vec4(col * (line * 1.6 + 0.06), (line*0.9 + 0.12) * fade);
          }`,
      });
      floor = new THREE.Mesh(new THREE.PlaneGeometry(22, 16), fm);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(cx, box.min.y - 0.5, -2);
      backdrop.add(floor);
      const horizon = new THREE.Mesh(
        new THREE.PlaneGeometry(26, 3),
        new THREE.MeshBasicMaterial({
          map: softSprite(),
          color: new THREE.Color(theme.neon).multiplyScalar(0.35),
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      horizon.position.set(cx, box.min.y - 0.4, -9);
      backdrop.add(horizon);
    }
    dirty = true;
  }

  function animateParticles(dt, t) {
    if (!particles || reduced) return false;
    const { pos, seed, N, kind, spanX, spanY, cx, cy } = particles;
    const top = cy + spanY / 2;
    const bot = cy - spanY / 2;
    for (let i = 0; i < N; i++) {
      const s = seed[i];
      if (kind === "snow") {
        pos[i * 3 + 1] -= dt * (0.12 + s * 0.22);
        pos[i * 3] += Math.sin(t * (0.6 + s) + s * 20) * dt * 0.06;
        if (pos[i * 3 + 1] < bot) {
          pos[i * 3 + 1] = top;
          pos[i * 3] = cx + (Math.random() - 0.5) * spanX;
        }
      } else {
        pos[i * 3 + 1] += dt * (0.01 + s * 0.025);
        pos[i * 3] += Math.sin(t * 0.3 + s * 40) * dt * 0.012;
        if (pos[i * 3 + 1] > top) pos[i * 3 + 1] = bot;
      }
    }
    particles.pts.geometry.attributes.position.needsUpdate = true;
    if (floor) floor.material.uniforms.time.value = t;
    return true;
  }

  // ---- framing -------------------------------------------------------------
  const tanHalf = () => Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

  /** Camera pose that frames the whole shelf + sign inside the free area. */
  function computeHero(w = width, h = height, ins = insets) {
    const size = content.getSize(new THREE.Vector3());
    const center = content.getCenter(new THREE.Vector3());
    const aspect = w / h;
    const usableH = Math.max(0.3, 1 - (ins.top + ins.bottom) / h);
    const usableW = Math.max(0.3, 1 - (ins.left + ins.right) / w);
    const margin = mobile ? 0.97 : 0.93;
    const dV = size.y / (2 * tanHalf() * usableH * margin);
    const dH = size.x / (2 * tanHalf() * aspect * usableW * margin);
    const dist = Math.max(dV, dH) + size.z * 0.5;
    const visH = 2 * tanHalf() * dist;
    const target = center.clone();
    // shift so the content sits in the centre of the free area
    target.y += ((ins.top - ins.bottom) / 2 / h) * visH;
    target.x += ((ins.right - ins.left) / 2 / w) * visH * aspect;
    const pitch = 0.035;
    const pos = target
      .clone()
      .add(new THREE.Vector3(0, Math.sin(pitch) * dist, Math.cos(pitch) * dist));
    return { pos, target, dist };
  }

  function applyHeroLimits() {
    const r = computeHero();
    heroPose.pos.copy(r.pos);
    heroPose.target.copy(r.target);
    heroPose.dist = r.dist;
    controls.minDistance = r.dist * 0.55;
    controls.maxDistance = r.dist * 1.12;
    controls.minAzimuthAngle = -0.38;
    controls.maxAzimuthAngle = 0.38;
    controls.minPolarAngle = Math.PI / 2 - 0.3;
    controls.maxPolarAngle = Math.PI / 2 + 0.12;
  }

  function fitShadow() {
    if (!key.castShadow) return;
    const size = content.getSize(new THREE.Vector3());
    const c = content.getCenter(new THREE.Vector3());
    const s = Math.max(size.x, size.y) * 0.75;
    const cam = key.shadow.camera;
    cam.left = -s;
    cam.right = s;
    cam.top = s;
    cam.bottom = -s;
    cam.near = 0.5;
    cam.far = 12;
    key.target.position.copy(c);
    key.position.copy(c).add(new THREE.Vector3(-1.6, 3.2, 4.2));
    cam.updateProjectionMatrix();
    renderer.shadowMap.needsUpdate = true;
  }

  function setContentBounds(box) {
    content.copy(box);
    applyHeroLimits();
    fitShadow();
    if (mode === "hero") {
      controls.target.copy(heroPose.target);
      camera.position.copy(heroPose.pos);
      controls.update();
    }
    dim.position.x = (box.min.x + box.max.x) / 2;
    dirty = true;
  }

  function setInsets(next) {
    insets = { ...insets, ...next };
    applyHeroLimits();
    dirty = true;
  }

  // ---- tweens -------------------------------------------------------------
  function tween(dur, fn, ease = easeInOut) {
    return new Promise((resolve) => {
      const t = { t: 0, dur: reduced ? Math.min(dur, 0.25) : dur, fn, ease, resolve };
      tweens.push(t);
      dirty = true;
    });
  }
  function runTweens(dt) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const t = tweens[i];
      t.t = Math.min(1, t.t + dt / t.dur);
      t.fn(t.ease(t.t), t.t);
      if (t.t >= 1) {
        tweens.splice(i, 1);
        t.resolve();
      }
    }
    return tweens.length > 0;
  }

  function setView(x, y) {
    view.x = x;
    view.y = y;
    if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) camera.clearViewOffset();
    else camera.setViewOffset(width, height, x, y, width, height);
  }

  /** Fly the camera to a pose (position + target), with an optional view offset. */
  async function flyTo({ pos, target, viewX = 0, viewY = 0 }, dur = 1.1) {
    removeParallax();
    const p0 = camera.position.clone();
    const t0 = controls.target.clone();
    const v0 = { ...view };
    const prev = mode;
    mode = "flight";
    controls.enabled = false;
    await tween(dur, (k) => {
      camera.position.lerpVectors(p0, pos, k);
      controls.target.lerpVectors(t0, target, k);
      camera.lookAt(controls.target);
      setView(v0.x + (viewX - v0.x) * k, v0.y + (viewY - v0.y) * k);
    });
    mode = prev === "flight" ? "hero" : prev;
  }

  async function goHero(dur = 1.0) {
    await flyTo({ pos: heroPose.pos, target: heroPose.target }, dur);
    mode = "hero";
    controls.enabled = true;
    controls.update();
  }

  /** Where the camera should sit to look at an object of `size` at `point`. */
  function focusPose(point, size, { sheetSide = 0, sheetBottom = 0 } = {}) {
    const aspect = width / height;
    const freeW = Math.max(0.35, 1 - sheetSide / width);
    const freeH = Math.max(0.35, 1 - sheetBottom / height - insets.top / height);
    const dV = (size.y * (mobile ? 1.35 : 1.25)) / (2 * tanHalf() * freeH);
    const dH = (Math.max(size.x, size.z) * 1.35) / (2 * tanHalf() * aspect * freeW);
    const dist = Math.max(dV, dH, 0.55);
    const target = point.clone();
    const pos = target.clone().add(new THREE.Vector3(0, dist * 0.06, dist));
    return { pos, target, viewX: sheetSide / 2, viewY: (sheetBottom - insets.top) / 2 };
  }

  function setMode(m) {
    mode = m;
    controls.enabled = m === "hero";
  }

  async function setDim(on) {
    const from = dim.material.opacity;
    const to = on ? 0.62 : 0;
    dim.visible = true;
    await tween(0.6, (k) => (dim.material.opacity = from + (to - from) * k));
    if (!on) dim.visible = false;
  }

  // ---- parallax -------------------------------------------------------------
  function removeParallax() {
    camera.position.sub(parallax.applied);
    parallax.applied.set(0, 0, 0);
    parallax.x = parallax.y = 0;
  }
  function stepParallax(dt) {
    if (mode !== "hero" || reduced || userActive) return false;
    const k = 1 - Math.exp(-dt * 3);
    parallax.x += (parallax.tx - parallax.x) * k;
    parallax.y += (parallax.ty - parallax.y) * k;
    const amp = heroPose.dist * 0.035;
    const next = new THREE.Vector3(parallax.x * amp, -parallax.y * amp * 0.6, 0);
    if (next.distanceToSquared(parallax.applied) < 1e-10) return false;
    camera.position.sub(parallax.applied).add(next);
    parallax.applied.copy(next);
    camera.lookAt(controls.target);
    return true;
  }
  window.addEventListener(
    "deviceorientation",
    (e) => {
      if (e.gamma == null) return;
      parallax.tx = clamp(e.gamma / 25, -1, 1);
      parallax.ty = clamp((e.beta - 45) / 30, -1, 1);
    },
    { passive: true },
  );

  // ---- picking ----------------------------------------------------------------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let pickables = [];
  let hovered = null;
  let down = null;
  function pick(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    return hit ? hit.object.userData.productId : null;
  }
  canvas.addEventListener("pointermove", (e) => {
    lastInput = performance.now();
    if (e.pointerType === "mouse") {
      const r = canvas.getBoundingClientRect();
      parallax.tx = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
      parallax.ty = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
    }
    if (down && mode === "focus") {
      const dx = e.clientX - down.lastX;
      down.lastX = e.clientX;
      down.moved += Math.abs(dx);
      onFocusDrag?.(dx / Math.max(200, width * 0.4), false);
      return;
    }
    if (mode !== "hero" || down || e.pointerType !== "mouse") return;
    const id = pick(e.clientX, e.clientY);
    if (id !== hovered) {
      hovered = id;
      canvas.style.cursor = id ? "pointer" : "grab";
    }
    onHover?.(id, e.clientX, e.clientY);
  });
  canvas.addEventListener("pointerleave", () => {
    parallax.tx = parallax.ty = 0;
    if (hovered) {
      hovered = null;
      onHover?.(null);
    }
  });
  canvas.addEventListener("pointerdown", (e) => {
    down = { x: e.clientX, y: e.clientY, t: performance.now(), lastX: e.clientX, moved: 0 };
    lastInput = performance.now();
    if (mode === "focus") canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener("pointerup", (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.t < 600;
    const wasDrag = down.moved > 6;
    down = null;
    if (mode === "focus" && wasDrag) {
      onFocusDrag?.(0, true);
      return;
    }
    if (moved < 7 && quick) onPick?.(pick(e.clientX, e.clientY), e);
  });
  canvas.addEventListener("pointercancel", () => (down = null));

  // ---- resize -----------------------------------------------------------------
  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    width = Math.max(1, Math.round(r.width));
    height = Math.max(1, Math.round(r.height));
    dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(dpr);
    composer.setSize(width, height);
    bloom.setSize(Math.round(width * dpr * BLOOM_SCALE), Math.round(height * dpr * BLOOM_SCALE));
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (view.x || view.y) setView(view.x, view.y);
    applyHeroLimits();
    dirty = true;
  }

  // ---- loop -------------------------------------------------------------------
  let raf = 0;
  let clock = 0;
  let frameSkip = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    // Tweens run on wall-clock time so a slow device skips frames rather than
    // playing a camera move in slow motion; ambient motion uses a capped step.
    const raw = Math.min(0.5, (now - lastFrame) / 1000);
    const dt = Math.min(0.1, raw);
    lastFrame = now;
    if (paused) return;
    clock += dt;
    let active = runTweens(raw);
    if (controls.enabled) {
      if (controls.update()) active = true;
    }
    active = stepParallax(dt) || active;
    active = animateParticles(dt, clock) || active;
    for (const fn of updaters) if (fn(dt, clock, raw)) active = true;
    if (!active && !dirty) return;
    // idle on a phone: 30 fps is plenty for drifting dust
    const idle = now - lastInput > 4000 && tweens.length === 0;
    if (mobile && idle && !dirty && frameSkip++ & 1) return;
    dirty = false;
    if (mode === "hero" && userActive === false && now - lastInput > 9000 && controls.enabled)
      maybeReturnHome();
    composer.render(dt);
  }
  let returning = false;
  function maybeReturnHome() {
    if (returning) return;
    const off = camera.position.clone().sub(parallax.applied).distanceTo(heroPose.pos);
    if (off < heroPose.dist * 0.02) return;
    returning = true;
    goHero(1.6).finally(() => {
      returning = false;
      lastInput = performance.now();
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (!raf) {
      lastFrame = performance.now();
      raf = requestAnimationFrame(frame);
    }
  });
  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas.parentElement);
  resize();
  raf = requestAnimationFrame(frame);

  // ---- captures ---------------------------------------------------------------
  /** Render the hero view at an arbitrary size into a new 2D canvas. */
  function snapshot(w, h, { insetsOverride = { top: 0, bottom: 0, left: 0, right: 0 } } = {}) {
    const save = {
      pos: camera.position.clone(),
      target: controls.target.clone(),
      view: { ...view },
      aspect: camera.aspect,
      dim: dim.visible,
    };
    const pose = computeHero(w, h, insetsOverride);
    camera.clearViewOffset();
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(1);
    composer.setSize(w, h);
    bloom.setSize(Math.round(w * 0.5), Math.round(h * 0.5));
    camera.aspect = w / h;
    camera.position.copy(pose.pos);
    camera.lookAt(pose.target);
    camera.updateProjectionMatrix();
    dim.visible = false;
    composer.render(0);
    const out = makeCanvas(w, h);
    out.getContext("2d").drawImage(renderer.domElement, 0, 0, w, h);
    // restore
    dim.visible = save.dim;
    camera.position.copy(save.pos);
    controls.target.copy(save.target);
    camera.lookAt(save.target);
    resize();
    if (save.view.x || save.view.y) setView(save.view.x, save.view.y);
    composer.render(0);
    return out;
  }

  /** Render one object alone (for cart thumbnails). Returns a data URL. */
  const thumbScene = new THREE.Scene();
  thumbScene.environment = envRT.texture;
  thumbScene.environmentIntensity = 0.6;
  thumbScene.add(new THREE.HemisphereLight(0xffffff, 0x222233, 0.9));
  const tKey = new THREE.DirectionalLight(0xffffff, 1.8);
  tKey.position.set(-1, 2, 3);
  thumbScene.add(tKey);
  const thumbCam = new THREE.PerspectiveCamera(30, 1, 0.01, 20);
  /**
   * Drawn straight to the canvas (so tone mapping and sRGB output apply, which
   * they don't for a render target), copied out, then the frame is redrawn in
   * the same task so nothing flashes on screen.
   */
  function thumbnail(object, size = 192, bg = "#e9e7e1") {
    const parent = object.parent;
    const savedPos = object.position.clone();
    const savedQ = object.quaternion.clone();
    thumbScene.add(object);
    object.position.set(0, 0, 0);
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3());
    const d = (Math.max(s.x, s.y) * 1.25) / (2 * Math.tan(THREE.MathUtils.degToRad(15)));
    thumbCam.position.set(c.x, c.y + d * 0.05, c.z + d + s.z / 2);
    thumbCam.lookAt(c);
    thumbScene.background = new THREE.Color(bg);
    const pr = renderer.getPixelRatio();
    const cw = renderer.domElement.width;
    const ch = renderer.domElement.height;
    const px = Math.max(16, Math.min(size, cw, ch));
    const v = px / pr;
    renderer.setRenderTarget(null);
    renderer.setScissorTest(true);
    renderer.setViewport(0, 0, v, v);
    renderer.setScissor(0, 0, v, v);
    renderer.render(thumbScene, thumbCam);
    const cv = makeCanvas(size, size);
    cv.getContext("2d").drawImage(renderer.domElement, 0, ch - px, px, px, 0, 0, size, size);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, width, height);
    thumbScene.remove(object);
    object.position.copy(savedPos);
    object.quaternion.copy(savedQ);
    if (parent) parent.add(object);
    object.updateMatrixWorld(true);
    composer.render(0);
    dirty = true;
    return cv.toDataURL("image/jpeg", 0.88);
  }

  return {
    THREE,
    renderer,
    scene,
    camera,
    controls,
    root,
    get mode() {
      return mode;
    },
    get size() {
      return { width, height };
    },
    get heroPose() {
      return heroPose;
    },
    setMode,
    setBackdrop,
    setContentBounds,
    setInsets,
    computeHero,
    focusPose,
    flyTo,
    goHero,
    setDim,
    tween,
    addUpdater: (fn) => (updaters.add(fn), () => updaters.delete(fn)),
    requestRender: () => (dirty = true),
    updateShadows: () => (renderer.shadowMap.needsUpdate = true),
    setPaused: (p) => {
      paused = p;
      dirty = true;
    },
    setPickables: (list) => (pickables = list),
    snapshot,
    thumbnail,
    noteInput: () => (lastInput = performance.now()),
    setTheme(th) {
      theme = th;
    },
    get backdrop() {
      return backdropKind;
    },
  };
}
