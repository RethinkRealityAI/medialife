/**
 * Drop Studio - the MEDIALIFE x Roblox product configurator.
 *
 * Each product is a real mesh: a GLB generated from a text prompt, then run
 * through scripts/optimize-models.mjs (meshopt geometry, WebP textures,
 * quantised) so a product lands in the low hundreds of KB. The loading, the
 * colourway wash and the artwork projection all live in product.js; this file
 * is the stage, the camera, the activation cinematic and the interaction.
 *
 * Two consequences of using real meshes are worth stating up front, because
 * they explain shapes in the code that would otherwise look arbitrary:
 *
 *   - A colourway cannot be a `material.color`. The albedo is baked, so the
 *     colourway is washed over it in the shader, preserving every fold.
 *
 *   - Artwork cannot be painted into UV space. The atlas is machine-packed
 *     islands, so a rectangle drawn in UVs lands in pieces all over the
 *     garment. Artwork is *projected* onto the mesh instead, inside named
 *     print zones defined against the product's own bounding box.
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import {
  loadProduct,
  buildDecal,
  buildZoneGuide,
  resolveZone,
  textureFromImage,
  PRINT_ZONES,
  HERO_VIEW,
} from "./product.js";

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clamp01 = (v) => clamp(v, 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// ---------------------------------------------------------------------------
// procedural textures (the stage and the cinematic only -- products are meshes)
// ---------------------------------------------------------------------------
/** Soft radial falloff used for the contact shadow and floor fade. */
function radialTexture(inner, outer, stops) {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(S / 2, S / 2, S * inner, S / 2, S / 2, S * outer);
  for (const [at, col] of stops) g.addColorStop(at, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A soft round sprite for the particle stream. */
function sparkTexture() {
  const S = 64;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Deterministic pseudo-QR block art for printed activation codes. */

// ---------------------------------------------------------------------------
// the studio
// ---------------------------------------------------------------------------

export function createStudio({
  canvas,
  viewport,
  onReady,
  onFail,
  onActivationStep,
  onDecalDrag,
  onProductReady,
  onModelFail,
}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
  } catch (err) {
    onFail?.(err);
    return null;
  }
  if (!renderer.getContext()) {
    onFail?.(new Error("no webgl context"));
    return null;
  }

  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // A baked albedo already carries its own shading, so the stage only has to
  // light the form. Held under 1 to keep a pale colourway from clipping to
  // paper-white and losing every fold.
  renderer.toneMappingExposure = 0.78;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 100);
  camera.position.set(0, 0.16, 5.0);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.enablePan = false;
  controls.minDistance = 2.6;
  controls.maxDistance = 8.5;
  controls.minPolarAngle = Math.PI * 0.16;
  controls.maxPolarAngle = Math.PI * 0.86;
  controls.rotateSpeed = 0.78;
  controls.zoomSpeed = 0.7;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.55;

  // environment
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.035);
  scene.environment = envRT.texture;
  // A baked albedo washed toward a colourway carries its own shading, so the
  // environment's job here is to light the form rather than to model it. Kept
  // moderate: too low and a black colourway collapses into the rim lights,
  // too high and it lifts to mid-grey.
  scene.environmentIntensity = 0.44;

  // key / rim / fill
  const key = new THREE.DirectionalLight(0xdfe9ff, 1.55);
  key.position.set(2.4, 3.0, 3.4);
  scene.add(key);

  // Edge-on rims: short range keeps them on the product, off the floor. They
  // are brand colour on the silhouette, not a light source -- pushed too hard
  // they tint the whole garment and the colourway stops reading.
  const rimA = new THREE.PointLight(0x19affe, 13, 5.4, 2);
  rimA.position.set(-3.0, 1.0, 0.5);
  scene.add(rimA);

  const rimB = new THREE.PointLight(0xff37ae, 10, 5.4, 2);
  rimB.position.set(3.0, -0.3, 0.35);
  scene.add(rimB);

  // low back light separates the silhouette from the background
  const back = new THREE.DirectionalLight(0xbcd2ff, 0.55);
  back.position.set(-0.6, 1.6, -3.0);
  scene.add(back);

  const fill = new THREE.DirectionalLight(0xffffff, 0.34);
  fill.position.set(-1.6, -1.6, 2.4);
  scene.add(fill);

  scene.add(new THREE.AmbientLight(0x1b2230, 0.7));

  // ---- stage: floor disc + contact shadow -------------------------------
  const stage = new THREE.Group();
  scene.add(stage);

  const floorTex = radialTexture(0.0, 0.5, [
    [0, "rgba(56,63,86,1)"],
    [0.07, "rgba(34,39,54,1)"],
    [0.16, "rgba(17,19,28,1)"],
    [0.32, "rgba(6,7,12,1)"],
    [1, "rgba(2,2,4,1)"],
  ]);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(26, 96),
    // unlit on purpose: a lit floor catches the rim lights and blows out
    new THREE.MeshBasicMaterial({ map: floorTex }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.62;
  stage.add(floor);

  // a warm-dark pool rather than pure black, so it reads on a near-black stage
  const shadowTex = radialTexture(0.0, 0.5, [
    [0, "rgba(6,8,14,0.95)"],
    [0.34, "rgba(5,6,11,0.55)"],
    [1, "rgba(2,2,4,0)"],
  ]);
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 3.4),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
  );
  contact.renderOrder = 1;
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = -1.605;
  stage.add(contact);

  // ---- product ----------------------------------------------------------
  // The product group holds whatever GLB is currently loaded, plus the
  // projected artwork and the activation tag. Nothing in here is authored by
  // this file any more -- it is all swapped wholesale on a product change.
  const product = new THREE.Group();
  stage.add(product);

  /** The loaded model: `{ root, meshes, tints, box }` from product.js. */
  let current = null;
  /** Discards the result of a load the visitor has already clicked past. */
  let loadToken = 0;
  /** Projected artwork groups, one per print, and the safe-area outline. */
  const decals = [];
  let zoneGuide = null;
  const tagRay = new THREE.Raycaster();
  // Scratch vectors shared by the framing and keyboard-orbit helpers.
  const _off = new THREE.Vector3();
  const _sph = new THREE.Spherical();
  let homeDist = 5.0;
  const homePos = new THREE.Vector3(0, 0.16, 5.0);

  /**
   * Where the cinematic props live for the current product. Recomputed on every
   * product change so the phone, portal and particle stream stay in frame for a
   * keychain and for a deskmat alike.
   */
  const cineAnchor = {
    center: new THREE.Vector3(),
    midLook: new THREE.Vector3(),
    phone: { x: 1.2, y: -0.1, z: 1.0, rise: 1.6, scale: 1 },
    portalScale: 1,
    unit: 1,
  };

  // ---- activation tag ---------------------------------------------------
  const tag = new THREE.Group();
  const tagBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.055, 0.012, 32),
    new THREE.MeshPhysicalMaterial({
      color: 0x0d0f16,
      roughness: 0.35,
      metalness: 0.6,
      clearcoat: 0.6,
    }),
  );
  tagBody.rotation.x = Math.PI / 2;
  tag.add(tagBody);

  const tagGlow = new THREE.Mesh(
    new THREE.TorusGeometry(0.056, 0.008, 12, 40),
    new THREE.MeshBasicMaterial({ color: 0x19affe, transparent: true, opacity: 0.8 }),
  );
  tagGlow.position.z = 0.009;
  tag.add(tagGlow);

  const pulses = [];
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(
      new THREE.RingGeometry(0.058, 0.068, 48),
      new THREE.MeshBasicMaterial({
        color: 0x19affe,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    p.position.z = 0.016;
    tag.add(p);
    pulses.push(p);
  }
  product.add(tag);

  // ---- cinematic props (hidden until the activation runs) ---------------
  const cine = new THREE.Group();
  cine.visible = false;
  stage.add(cine);

  // phone
  const phone = new THREE.Group();
  const phoneBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.78, 1.62, 0.055),
    new THREE.MeshPhysicalMaterial({
      color: 0x0a0b10,
      roughness: 0.25,
      metalness: 0.75,
      clearcoat: 0.8,
    }),
  );
  phone.add(phoneBody);

  const screenCanvas = document.createElement("canvas");
  screenCanvas.width = 256;
  screenCanvas.height = 512;
  const screenTex = new THREE.CanvasTexture(screenCanvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 1.52),
    new THREE.MeshBasicMaterial({ map: screenTex, transparent: true }),
  );
  screen.position.z = 0.03;
  phone.add(screen);
  phone.position.set(1.05, -0.15, 1.5);
  phone.rotation.set(-0.12, -0.34, 0.06);
  cine.add(phone);

  // portal
  const portal = new THREE.Group();
  const portalRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.15, 0.035, 16, 96),
    new THREE.MeshBasicMaterial({
      color: 0x19affe,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  portal.add(portalRing);
  const portalGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.5, 2.5),
    new THREE.MeshBasicMaterial({
      map: radialTexture(0, 0.5, [
        [0, "rgba(150,215,255,0.42)"],
        [0.34, "rgba(60,150,255,0.16)"],
        [0.62, "rgba(255,60,175,0.07)"],
        [1, "rgba(0,0,0,0)"],
      ]),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  portal.add(portalGlow);
  portal.position.set(0, 0.1, -1.7);
  portal.scale.setScalar(0.01);
  cine.add(portal);

  // particle stream from product to portal
  const P_COUNT = 420;
  const pPos = new Float32Array(P_COUNT * 3);
  const pSeed = new Float32Array(P_COUNT);
  const pAngle = new Float32Array(P_COUNT);
  for (let i = 0; i < P_COUNT; i++) {
    pSeed[i] = Math.random();
    pAngle[i] = Math.random() * Math.PI * 2;
    pPos[i * 3] = 0;
    pPos[i * 3 + 1] = 0;
    pPos[i * 3 + 2] = 0;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  const particles = new THREE.Points(
    pGeo,
    new THREE.PointsMaterial({
      size: 0.062,
      map: sparkTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: 0xcfeaff,
    }),
  );
  cine.add(particles);

  // ---- post ------------------------------------------------------------
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // Threshold high and strength low on purpose: bloom is for the activation
  // tag and the portal, not for the product. A pale colourway sits just under
  // it, so a white t-shirt reads as fabric rather than as a light source.
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.17, 0.62, 0.985);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ---- state -----------------------------------------------------------
  const state = {
    id: "tee",
    base: "#0b0b0f",
    /**
     * Artwork the creator has placed, in draw order. Each entry is
     * `{ zone, image, scale, x, y, rot }` where `scale` is a fraction of the
     * zone and `x`/`y` are nudges within it, -1..1. Prints belong to the
     * product being viewed; app.js keeps the per-product sets.
     */
    prints: [],
    guideZone: null,
    hasQr: true,
    hasNfc: true,
    showTag: true,
  };

  /** Zones available on the product currently loaded. */
  const zones = () => PRINT_ZONES[state.id] || [];
  const zoneById = (id) => zones().find((z) => z.id === id) || zones()[0] || null;

  /**
   * Where the activation tag sits on each product, as fractions of its own
   * bounding box. The tag is a real object, not paint, so it needs a seat on
   * the surface -- found by raycasting inward from in front of this point.
   */
  const TAG_SPOT = {
    tee: [0.5, 0.2],
    hoodie: [0.29, 0.3],
    cap: [0.5, 0.18],
    plush: [0.5, 0.1],
    keychain: [0.5, 0.28],
    deskmat: [0.86, 0.2],
  };

  /* ---- artwork ---------------------------------------------------------
     Artwork is projected, so it has to be rebuilt whenever anything about it
     or the product changes. Rebuilding is cheap (a few hundred triangles per
     print) and it is the only way to keep a decal glued to the surface. */

  function clearDecals() {
    for (const d of decals) {
      product.remove(d);
      d.userData.material?.dispose();
      d.children.forEach((c) => c.geometry.dispose());
    }
    decals.length = 0;
  }

  function rebuildPrints() {
    clearDecals();
    if (!current) return;
    for (const print of state.prints) {
      const zone = zoneById(print.zone);
      if (!zone || !print.image?.complete || !print.image.naturalWidth) continue;
      // The texture is cached on the print so dragging a slider does not
      // re-upload the same bitmap to the GPU on every frame.
      if (print.tex?.image !== print.image) {
        print.tex?.dispose();
        print.tex = textureFromImage(print.image);
      }
      const group = buildDecal(current.meshes, zone, current.box, {
        texture: print.tex,
        scale: print.scale ?? 1,
        offsetX: print.x ?? 0,
        offsetY: print.y ?? 0,
        rotation: print.rot ?? 0,
      });
      if (group) {
        product.add(group);
        decals.push(group);
      }
    }
  }

  function rebuildGuide() {
    if (zoneGuide) {
      product.remove(zoneGuide);
      zoneGuide.geometry.dispose();
      zoneGuide.material.dispose();
      zoneGuide = null;
    }
    if (!current || !state.guideZone) return;
    const zone = zoneById(state.guideZone);
    if (!zone) return;
    zoneGuide = buildZoneGuide(zone, current.box);
    product.add(zoneGuide);
  }

  /**
   * Fit the camera to whatever is on the stage so a deskmat and a keychain are
   * both well framed without per-product magic numbers.
   */
  function frameProduct() {
    if (!current) return;
    const box = new THREE.Box3().setFromObject(current.root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // Fit the box, not its bounding sphere: a sphere circumscribes a wide,
    // flat product like a deskmat by a huge margin and frames everything small.
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(fov / 2) * Math.max(camera.aspect, 0.6));
    const halfV = size.y / 2;
    const halfH = Math.max(size.x, size.z) / 2; // the widest face the turntable shows
    const distV = halfV / Math.tan(fov / 2);
    const distH = halfH / Math.tan(hFov / 2);
    homeDist = Math.max(distV, distH) * 1.12 + size.z * 0.5;

    controls.minDistance = homeDist * 0.4;
    controls.maxDistance = homeDist * 2.2;

    homePos.set(0, center.y, homeDist);
    const dir = camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0.04, 1);
    controls.target.set(0, center.y, 0);
    camera.position.copy(controls.target).add(dir.normalize().multiplyScalar(homeDist));
    controls.update();
  }

  /** Swing the camera to a product's hero angle, keeping the framed distance. */
  function heroView() {
    const v = HERO_VIEW[state.id] || { az: 0, el: 4 };
    const el = THREE.MathUtils.degToRad(v.el);
    const az = THREE.MathUtils.degToRad(v.az);
    _sph.set(homeDist, Math.PI / 2 - el, az);
    camera.position.copy(controls.target).add(_off.setFromSpherical(_sph));
    controls.update();
  }

  /** Reseat the stage, the tag and the cinematic props around a new product. */
  function stageProduct() {
    const box = current.box;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const [tu, tv] = TAG_SPOT[state.id] || [0.5, 0.2];
    const tx = box.min.x + size.x * tu;
    const ty = box.min.y + size.y * tv;
    tagRay.set(new THREE.Vector3(tx, ty, box.max.z + size.z), new THREE.Vector3(0, 0, -1));
    const hit = tagRay.intersectObjects(current.meshes, false)[0];
    tag.position.set(tx, ty, (hit ? hit.point.z : box.max.z) + 0.012);
    // The tag is modelled at roughly a real 25mm chip against a 2.2-unit
    // product, so it scales with the product rather than staying absolute.
    tag.scale.setScalar(clamp(Math.max(size.x, size.y) / 3.2, 0.45, 1.1));

    contact.scale.set(Math.max(size.x, 0.4) / 2.2, Math.max(size.x, 0.4) / 3.4, 1);
    contact.position.y = box.min.y - 0.015;
    floor.position.y = box.min.y - 0.025;
    floor.scale.setScalar(Math.max(0.42, Math.max(size.x, size.y) / 5.6));

    const unit = Math.max(size.x, size.y) / 2.4;
    cineAnchor.unit = unit;
    cineAnchor.center.set(0, center.y, 0);
    cineAnchor.midLook.set(size.x * 0.3, center.y, size.z * 0.4);
    cineAnchor.phone = {
      x: size.x * 0.5 + 0.3 * unit,
      y: center.y - 0.1 * unit,
      z: size.z * 0.5 + 0.85 * unit,
      rise: 1.5 * unit,
      scale: (size.y * 0.56) / 1.62, // phone body is 1.62 units tall
    };
    const ringR = 1.15 * Math.max(0.5, (size.y * 0.7) / 1.15);
    portal.position.set(
      0,
      Math.max(center.y, box.min.y + ringR * 0.92),
      -(size.z * 0.5 + 1.5 * unit),
    );
    cineAnchor.portalScale = Math.max(0.5, (size.y * 0.7) / 1.15); // ring radius is 1.15 at scale 1
  }

  /**
   * Swap in a product. Loading a GLB is asynchronous and a visitor can click
   * through the whole catalogue faster than one downloads, so every load
   * carries a token and a stale result is dropped rather than rendered.
   */
  async function setProduct(id, url) {
    if (!url) return;
    state.id = id;
    const token = ++loadToken;

    let loaded;
    try {
      loaded = await loadProduct(url, { id });
    } catch (err) {
      // A missing model must not take the whole studio down with it -- that is
      // what `onFail` means. The visitor keeps the product they had, and every
      // other control still works, so this is reported separately.
      console.warn(`[studio] ${id}: ${err.message}`);
      onModelFail?.(id, err);
      return;
    }
    if (token !== loadToken) return;

    clearDecals();
    if (zoneGuide) {
      product.remove(zoneGuide);
      zoneGuide = null;
    }
    if (current) product.remove(current.root);
    current = loaded;
    product.add(current.root);

    applyTint();
    stageProduct();
    rebuildPrints();
    rebuildGuide();
    frameProduct();
    heroView();
    onProductReady?.(id, zones());
  }

  function applyTint() {
    if (!current) return;
    const c = new THREE.Color(state.base);
    for (const t of current.tints) {
      t.color.value.copy(c);
      // Full wash: these albedos are near-greyscale by design, so anything
      // less leaves a cast of the generated colour under the colourway.
      t.mix.value = 1;
    }
  }

  function setColor(hex) {
    state.base = hex;
    applyTint();
  }

  function setActivation(kind) {
    state.hasNfc = kind === "nfc" || kind === "both";
    state.hasQr = kind === "qr" || kind === "both";
    tagBody.visible = state.hasNfc;
    tagGlow.visible = state.hasNfc;
  }

  function setShowTag(on) {
    state.showTag = on;
    tag.visible = on;
  }

  /** Replace the whole set of prints on the current product. */
  function setPrints(list) {
    // Carry cached textures across so re-rendering the same artwork after a
    // slider move does not churn GPU uploads.
    const keep = new Map(state.prints.map((p) => [p.image, p.tex]));
    state.prints = (list || []).map((p) => ({ ...p, tex: keep.get(p.image) || null }));
    for (const [img, tex] of keep) {
      if (tex && !state.prints.some((p) => p.image === img)) tex.dispose();
    }
    rebuildPrints();
  }

  /** Show the dashed safe-area outline for a zone, or `null` to hide it. */
  function setGuide(zoneId) {
    state.guideZone = zoneId;
    rebuildGuide();
  }

  // ---- print dragging ---------------------------------------------------
  // Dragging works in the zone's own plane rather than in UV space: the
  // pointer's hit point on the mesh is projected onto the zone's across/up
  // axes, which gives the same -1..1 offsets the sliders produce. That keeps
  // the drag honest on a curved surface, where UVs would skew it.
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const dragAxes = { across: new THREE.Vector3(), up: new THREE.Vector3() };
  let dragIndex = -1;

  function hitAt(ev) {
    if (!current) return null;
    const r = canvas.getBoundingClientRect();
    ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    return ray.intersectObjects(current.meshes, false)[0] || null;
  }

  /** Index of the print whose projected geometry is under the pointer. */
  function printAt(ev) {
    if (!current || !decals.length) return -1;
    const r = canvas.getBoundingClientRect();
    ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    // Topmost first: later prints are drawn over earlier ones, so they win.
    for (let i = decals.length - 1; i >= 0; i--) {
      if (ray.intersectObject(decals[i], true).length) return i;
    }
    return -1;
  }

  /** Convert a point on the mesh into offsets within the dragged print's zone. */
  function offsetsFrom(point, print) {
    const zone = zoneById(print.zone);
    if (!zone) return null;
    const r = resolveZone(zone, current.box);
    const d = point.clone().sub(r.position);
    const scale = clamp(print.scale ?? 1, 0.1, 1);
    const maxOff = Math.max(1e-4, 0.5 - scale / 2);
    return {
      x: clamp(d.dot(dragAxes.across) / (r.size.x * 2) / maxOff, -1, 1),
      y: clamp(d.dot(dragAxes.up) / (r.size.y * 2) / maxOff, -1, 1),
    };
  }

  canvas.addEventListener("pointermove", (ev) => {
    if (dragIndex >= 0) {
      const hit = hitAt(ev);
      if (!hit) return;
      const print = state.prints[dragIndex];
      const off = offsetsFrom(hit.point, print);
      if (!off) return;
      print.x = off.x;
      print.y = off.y;
      rebuildPrints();
      onDecalDrag?.(dragIndex, off.x, off.y);
      return;
    }
    canvas.style.cursor = printAt(ev) >= 0 ? "grab" : "";
  });

  canvas.addEventListener("pointerdown", (ev) => {
    const i = printAt(ev);
    if (i < 0) return;
    const zone = zoneById(state.prints[i].zone);
    if (!zone) return;
    // Cache the zone's axes for the duration of the drag; they cannot change
    // while a single print is being moved.
    const r = resolveZone(zone, current.box);
    const m = new THREE.Matrix4().makeRotationFromEuler(r.orientation);
    dragAxes.across.setFromMatrixColumn(m, 0);
    dragAxes.up.setFromMatrixColumn(m, 1);

    dragIndex = i;
    controls.enabled = false;
    canvas.style.cursor = "grabbing";
    canvas.setPointerCapture?.(ev.pointerId);
  });

  const endDrag = (ev) => {
    if (dragIndex < 0) return;
    dragIndex = -1;
    controls.enabled = true;
    canvas.style.cursor = "";
    canvas.releasePointerCapture?.(ev.pointerId);
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  // ---- keyboard orbit ---------------------------------------------------
  // The viewport is the centrepiece, so it cannot be pointer-only. Written
  // against the public camera/target only -- OrbitControls' own rotate and
  // dolly helpers are private in r180 and would break on an upgrade.
  function orbitBy(dTheta, dPhi) {
    _off.copy(camera.position).sub(controls.target);
    _sph.setFromVector3(_off);
    _sph.theta += dTheta;
    _sph.phi = clamp(_sph.phi + dPhi, controls.minPolarAngle + 0.02, controls.maxPolarAngle - 0.02);
    camera.position.copy(controls.target).add(_off.setFromSpherical(_sph));
  }

  function dollyBy(factor) {
    _off.copy(camera.position).sub(controls.target);
    const len = clamp(_off.length() * factor, controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target).add(_off.setLength(len));
  }

  canvas.addEventListener("keydown", (ev) => {
    if (act.on) return;
    const step = 0.16 * (ev.shiftKey ? 0.35 : 1);
    let handled = true;
    switch (ev.key) {
      case "ArrowLeft":
        orbitBy(step, 0);
        break;
      case "ArrowRight":
        orbitBy(-step, 0);
        break;
      case "ArrowUp":
        orbitBy(0, -step * 0.6);
        break;
      case "ArrowDown":
        orbitBy(0, step * 0.6);
        break;
      case "+":
      case "=":
        dollyBy(0.88);
        break;
      case "-":
      case "_":
        dollyBy(1.14);
        break;
      case "Home":
      case "0":
        resetView();
        break;
      default:
        handled = false;
    }
    if (!handled) return;
    ev.preventDefault();
    controls.autoRotate = false;
    controls.update();
  });

  // pause the turntable while someone is inspecting, resume when they leave
  canvas.addEventListener("focus", () => {
    if (!act.on) controls.autoRotate = false;
  });
  canvas.addEventListener("blur", () => {
    if (!act.on && !matchMedia("(prefers-reduced-motion: reduce)").matches)
      controls.autoRotate = true;
  });

  // ---- activation cinematic --------------------------------------------
  const STEPS = [
    { at: 0.0, to: 0.16, label: "A chip and a code, in the product" },
    { at: 0.16, to: 0.38, label: "The fan taps it with their phone" },
    { at: 0.38, to: 0.62, label: "The experience opens — no app, no account" },
    { at: 0.62, to: 0.84, label: "They land back in your game, with a reward" },
    { at: 0.84, to: 1.0, label: "Every tap comes back to you as data" },
  ];

  let act = { on: false, t: 0, dur: 10.5, step: -1, start: 0, hold: null };

  function paintScreen(p) {
    const c = screenCanvas;
    const ctx = c.getContext("2d");
    const W = c.width,
      H = c.height;
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#071726");
    g.addColorStop(1, "#1a0716");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const t = clamp01(p);
    const cx = W / 2,
      cy = H * 0.42;
    for (let i = 0; i < 4; i++) {
      const r = (t * 1.5 + i * 0.25) % 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r * W * 0.62, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${25 + i * 30},${175 - i * 20},254,${(1 - r) * 0.7})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.34);
    core.addColorStop(0, `rgba(255,255,255,${0.35 + 0.4 * t})`);
    core.addColorStop(0.45, "rgba(25,175,254,0.42)");
    core.addColorStop(1, "rgba(255,55,174,0)");
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "rgba(244,245,248,0.85)";
    ctx.fillRect(W * 0.16, H * 0.74, W * 0.68 * t, 4);
    ctx.fillStyle = "rgba(244,245,248,0.22)";
    ctx.fillRect(W * 0.16, H * 0.74, W * 0.68, 4);
    screenTex.needsUpdate = true;
  }

  function startActivation() {
    act = {
      on: true,
      t: 0,
      dur: 10.5,
      step: -1,
      start: performance.now(),
      hold: null,
      camFrom: camera.position.clone(),
      tgtFrom: controls.target.clone(),
    };
    cine.visible = true;
    controls.autoRotate = false;
    controls.enabled = false;
    if (!state.showTag) tag.visible = true;
    // The safe-area outline is a design aid. During the activation the visitor
    // is being shown the product, not editing it, and the outline draws through
    // the phone prop because it ignores depth.
    if (zoneGuide) zoneGuide.visible = false;
    return act.dur;
  }

  function stopActivation() {
    act.on = false;
    cine.visible = false;
    particles.material.opacity = 0;
    portal.scale.setScalar(0.01);
    controls.enabled = true;
    controls.autoRotate = true;
    tag.visible = state.showTag;
    if (zoneGuide) zoneGuide.visible = true;
    onActivationStep?.(-1, 0);
  }

  function updateActivation(dt) {
    // wall clock, so the cinematic runs at the same pace on a slow GPU
    act.t = act.hold === null ? (performance.now() - act.start) / 1000 : act.hold * act.dur;
    const p = clamp01(act.t / act.dur);

    const idx = STEPS.findIndex((s) => p >= s.at && p < s.to);
    const step = idx === -1 ? STEPS.length - 1 : idx;
    if (step !== act.step) {
      act.step = step;
      onActivationStep?.(step, p);
    } else {
      onActivationStep?.(step, p);
    }

    // Camera path in units of the fitted distance, so the shot holds whether
    // the product is a keychain or a deskmat. Positions are set directly from
    // wall-clock progress -- a per-frame lerp trails on a slow GPU.
    const tagWorld = tag.getWorldPosition(new THREE.Vector3());
    const c = cineAnchor.center;
    const at = (x, y, z) =>
      new THREE.Vector3(c.x + x * homeDist, c.y + y * homeDist, c.z + z * homeDist);

    // a narrow viewport needs more distance to hold product and phone together
    const wide = 1.26 + Math.max(0, 1.15 - camera.aspect) * 0.55;

    const A = at(0, 0, 1.0); // hero
    const B = at(0.24, -0.13, 0.54); // macro on the tag
    const C = at(0.26, -0.02, wide); // product and phone together
    const D = at(-0.05, 0.05, wide + 0.2); // wide, portal behind

    let pos;
    let lookAt;
    if (p < 0.3) {
      const k = easeInOut(clamp01(p / 0.3));
      pos = A.clone().lerp(B, k);
      lookAt = c.clone().lerp(tagWorld, k * 0.9);
    } else if (p < 0.58) {
      const k = easeInOut(clamp01((p - 0.3) / 0.28));
      pos = B.clone().lerp(C, k);
      lookAt = tagWorld.clone().lerp(cineAnchor.midLook, k);
    } else {
      const k = easeInOut(clamp01((p - 0.58) / 0.42));
      pos = C.clone().lerp(D, k);
      lookAt = cineAnchor.midLook.clone().lerp(c, k);
    }

    // ease out of wherever the visitor had orbited to, then follow the path exactly
    const blend = easeInOut(clamp01(p / 0.07));
    camera.position.copy(act.camFrom).lerp(pos, blend);
    controls.target.copy(act.tgtFrom).lerp(lookAt, blend);

    // tag pulses fire during step 2
    const pulsing = p > 0.14 && p < 0.52;
    pulses.forEach((ring, i) => {
      if (!pulsing) {
        ring.material.opacity = 0;
        return;
      }
      const cycle = (act.t * 1.15 + i * 0.33) % 1;
      ring.scale.setScalar(1 + cycle * 4.4);
      ring.material.opacity = (1 - cycle) * 0.75;
    });

    // phone rises into frame beside the product and lights up
    const ph = cineAnchor.phone;
    const phoneIn = clamp01((p - 0.28) / 0.16);
    const phoneOut = 1 - clamp01((p - 0.74) / 0.12);
    phone.visible = phoneIn > 0.01 && phoneOut > 0.01;
    if (phone.visible) {
      const k = easeOut(phoneIn);
      phone.position.set(ph.x, lerp(ph.y - ph.rise, ph.y, k), lerp(ph.z - ph.rise * 0.4, ph.z, k));
      phone.rotation.set(lerp(-0.42, -0.1, k), -0.3, lerp(0.2, 0.04, k));
      phone.scale.setScalar(ph.scale * phoneOut);
      screen.material.opacity = phoneOut;
      paintScreen(clamp01((p - 0.32) / 0.28));
    }

    // portal opens behind, particles stream from the product into it
    const portalIn = clamp01((p - 0.56) / 0.16);
    portal.scale.setScalar(Math.max(0.01, easeOut(portalIn) * cineAnchor.portalScale));
    portalRing.material.opacity = portalIn * 0.9;
    portalGlow.material.opacity = portalIn * 0.55;
    portal.rotation.z += dt * 0.35;

    const streaming = clamp01((p - 0.58) / 0.12) * (1 - clamp01((p - 0.88) / 0.1));
    particles.material.opacity = streaming * 0.95;
    particles.material.size = 0.11 * cineAnchor.unit;
    if (streaming > 0.01) {
      const arr = pGeo.attributes.position.array;
      const u0 = cineAnchor.unit;
      const zEnd = portal.position.z;
      for (let i = 0; i < P_COUNT; i++) {
        const s = pSeed[i];
        const u = (act.t * 0.55 + s) % 1;
        const spin = pAngle[i] + u * 4.6;
        const radius = lerp(1.35, 0.18, u) * (0.6 + s * 0.55) * u0;
        arr[i * 3] = Math.cos(spin) * radius * (1 - u * 0.35);
        arr[i * 3 + 1] =
          lerp(c.y - 0.7 * u0 + s * 1.4 * u0, portal.position.y, u) +
          Math.sin(spin) * radius * 0.35;
        arr[i * 3 + 2] = lerp(0.35 * u0, zEnd, u);
      }
      pGeo.attributes.position.needsUpdate = true;
    }

    if (p >= 1 && act.hold === null) stopActivation();
  }

  // ---- loop -------------------------------------------------------------
  let raf = 0;
  let running = false;
  let last = performance.now();
  let idleTime = 0;

  function resize() {
    const w = viewport.clientWidth || 1;
    const h = viewport.clientHeight || 1;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (current && !act.on) frameProduct();
  }

  function frame() {
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    idleTime += dt;

    if (act.on) {
      updateActivation(dt);
    } else if (state.showTag && state.hasNfc) {
      // idle breathing on the tag so it reads as live
      const b = 0.5 + 0.5 * Math.sin(idleTime * 2.1);
      tagGlow.material.opacity = 0.45 + b * 0.5;
      // A slow, small breath: enough to say "there is a chip here", not enough
      // to compete with the artwork the creator came to look at.
      pulses[0].scale.setScalar(1 + ((idleTime * 0.4) % 1) * 1.5);
      pulses[0].material.opacity = (1 - ((idleTime * 0.4) % 1)) * 0.2;
      pulses[1].material.opacity = 0;
      pulses[2].material.opacity = 0;
    }

    controls.update();
    composer.render();
  }

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  const ro = new ResizeObserver(resize);
  ro.observe(viewport);

  const io = new IntersectionObserver(
    ([entry]) => (entry.isIntersecting && !document.hidden ? start() : stop()),
    { rootMargin: "180px" },
  );
  io.observe(viewport);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else if (viewport.getBoundingClientRect().top < innerHeight) start();
  });

  // ---- capture ----------------------------------------------------------
  /**
   * Render one frame and return it as a PNG data URL. Capturing in the same
   * task as the render avoids needing preserveDrawingBuffer, which costs
   * frame time on mobile GPUs.
   */
  function capture(width = 1200, height = 900) {
    const prevSize = new THREE.Vector2();
    renderer.getSize(prevSize);
    const prevRatio = renderer.getPixelRatio();
    const prevAuto = controls.autoRotate;

    controls.autoRotate = false;
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    frameProduct();
    composer.render();
    const url = renderer.domElement.toDataURL("image/png");

    renderer.setPixelRatio(prevRatio);
    renderer.setSize(prevSize.x, prevSize.y, false);
    composer.setSize(prevSize.x, prevSize.y);
    camera.aspect = prevSize.x / Math.max(prevSize.y, 1);
    camera.updateProjectionMatrix();
    frameProduct();
    controls.autoRotate = prevAuto;
    return url;
  }

  function resetView() {
    controls.target.set(0, homePos.y, 0);
    camera.position.set(0, homePos.y + homeDist * 0.04, homeDist);
    controls.autoRotate = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    controls.update();
  }

  resize();
  start();
  onReady?.();

  return {
    setProduct,
    setColor,
    setActivation,
    setShowTag,
    setPrints,
    setGuide,
    /** The print zones available on the product currently loaded. */
    zones,
    startActivation,
    stopActivation,
    capture,
    resetView,
    resize,
    /** Scene state, for debugging from the console. */
    debug: () => ({
      homeDist,
      cam: camera.position.toArray(),
      target: controls.target.toArray(),
      dist: camera.position.distanceTo(controls.target),
      aspect: camera.aspect,
      boxSize: current ? current.box.getSize(new THREE.Vector3()).toArray() : [0, 0, 0],
      phone: cineAnchor.phone,
      phoneVisible: phone.visible,
      phonePos: phone.position.toArray(),
      phoneScaleNow: phone.scale.x,
      portalZ: portal.position.z,
      portalScale: cineAnchor.portalScale,
      portalScaleNow: portal.scale.x,
      particleOpacity: particles.material.opacity,
      productId: state.id,
      baseColor: state.base,
      prints: state.prints.map((x) => ({ zone: x.zone, scale: x.scale, x: x.x, y: x.y })),
      decalParts: decals.reduce((n, d) => n + d.children.length, 0),
      loaded: !!current,
    }),
    /** Freeze the cinematic at a fixed progress (0-1). Pass null to resume. */
    seek(p) {
      if (p === null) {
        if (act.on) act.start = performance.now() - act.t * 1000;
        act.hold = null;
        return;
      }
      if (!act.on) startActivation();
      act.hold = clamp01(p);
    },
    get isActivating() {
      return act.on;
    },
    setAutoRotate(on) {
      controls.autoRotate = on;
    },
    dispose() {
      stop();
      ro.disconnect();
      io.disconnect();
      clearDecals();
      for (const print of state.prints) print.tex?.dispose();
      envRT.dispose();
      pmrem.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}
