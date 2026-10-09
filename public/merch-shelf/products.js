/**
 * Products on the shelf: loading the GLBs, the vintage colourway wash, the
 * printed artwork (front chest + framed back panel on apparel), how each type
 * is displayed (hanger, cap stand, peg, easel…), hang tags and price tags.
 *
 * Reused from the Drop Studio (public/roblox/creators/assets/js/product.js):
 * `resolveZone` + `buildDecal` (artwork projected with DecalGeometry inside a
 * print zone defined against the product's own bounding box) and its
 * PRINT_ZONES for the non-apparel models. The loader is our own copy of its
 * `loadProduct` so it can report byte progress and fall back between models.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { buildDecal, PRINT_ZONES } from "/roblox/creators/assets/js/product.js";
import {
  fitToAspect,
  makeCanvas,
  drawQR,
  roundRect,
  radialCanvas,
  FONT_MONO,
  FONT_SANS,
} from "./art.js";
import { distress, embroider } from "./prints.js";
import { PRODUCT_META, money } from "./config.js";
import { buildCharmSet } from "./keychain.js";
import { buildStickerPack } from "./sticker.js";

/* ---------------------------------------------------------------------------
   The model table: one place for each type's model + print zones.
   Entries are tried in order; the first that loads wins. The /merch-shelf/
   models are the boxy lineup fits; the creators-page models are the fallback.
   Zones: fractions of the model's bounding box (see product.js resolveZone).
   --------------------------------------------------------------------------- */
const LEGACY = "/roblox/creators/assets/models/";
const LINEUP = "/merch-shelf/models/";

// The lineup's boxy heavyweight fits (lead-supplied zones; "left chest" =
// wearer's left = viewer's right = +X).
const LINEUP_ZONES = {
  tee: {
    chest: { id: "chest", face: "front", u: 0.63, v: 0.7, w: 0.13, h: 0.12 },
    back: { id: "back", face: "back", u: 0.5, v: 0.52, w: 0.46, h: 0.52 },
  },
  hoodie: {
    chest: { id: "chest", face: "front", u: 0.6, v: 0.64, w: 0.11, h: 0.08 },
    back: { id: "back", face: "back", u: 0.5, v: 0.5, w: 0.42, h: 0.32 },
  },
  longsleeve: {
    chest: { id: "chest", face: "front", u: 0.6, v: 0.72, w: 0.12, h: 0.09 },
    back: { id: "back", face: "back", u: 0.5, v: 0.56, w: 0.4, h: 0.42 },
    // Projected from the front onto the hanging sleeves: a side projection
    // grazes the sleeve and smears the type (lead's side zones, tuned by eye).
    sleeveL: { id: "sleeveL", face: "front", u: 0.11, v: 0.4, w: 0.09, h: 0.3, seat: true },
    sleeveR: { id: "sleeveR", face: "front", u: 0.89, v: 0.4, w: 0.09, h: 0.3, seat: true },
  },
};
// Fallbacks on the creators-page models, if the lineup GLBs are missing.
const LEGACY_TEE_ZONES = {
  chest: { id: "chest", face: "front", u: 0.64, v: 0.71, w: 0.13, h: 0.11 },
  back: { id: "back", face: "back", u: 0.5, v: 0.58, w: 0.5, h: 0.52 },
};
const LEGACY_HOODIE_ZONES = {
  chest: { id: "chest", face: "front", u: 0.64, v: 0.6, w: 0.14, h: 0.08 },
  back: { id: "back", face: "back", u: 0.5, v: 0.5, w: 0.56, h: 0.34 },
};

export const MODELS = {
  tee: [
    { url: `${LINEUP}tee.glb`, zones: LINEUP_ZONES.tee },
    { url: `${LEGACY}tee.glb`, zones: LEGACY_TEE_ZONES },
  ],
  hoodie: [
    { url: `${LINEUP}hoodie.glb`, zones: LINEUP_ZONES.hoodie },
    { url: `${LEGACY}hoodie.glb`, zones: LEGACY_HOODIE_ZONES },
  ],
  longsleeve: [
    { url: `${LINEUP}longsleeve.glb`, zones: LINEUP_ZONES.longsleeve },
    { url: `${LEGACY}tee.glb`, zones: LEGACY_TEE_ZONES },
  ],
  cap: [{ url: `${LEGACY}cap.glb`, zones: { front: PRINT_ZONES.cap[0] } }],
  plush: [{ url: `${LEGACY}plush.glb`, zones: { front: PRINT_ZONES.plush[0] } }],
  deskmat: [
    {
      url: `${LEGACY}deskmat.glb`,
      zones: { front: { id: "surface", face: "front", u: 0.5, v: 0.5, w: 0.88, h: 0.84 } },
    },
  ],
};
/** Rough byte sizes, so the loader can show real progress before headers arrive. */
const EXPECTED_BYTES = {
  tee: 246e3,
  hoodie: 336e3,
  longsleeve: 265e3,
  cap: 195e3,
  plush: 94e3,
  deskmat: 254e3,
};

/** Size (largest dimension, m) each type is normalised to on the shelf. */
const TARGET = { tee: 0.58, hoodie: 0.53, longsleeve: 0.56, cap: 0.42, plush: 0.42, deskmat: 0.6 };

/* ---------------------------------------------------------------------------
   Loading
   --------------------------------------------------------------------------- */
let loader = null;
const gltfCache = new Map(); // url -> Promise<gltf>
const entryCache = new Map(); // type -> Promise<{entry, gltf}>

function loadUrl(url, onBytes) {
  if (!loader) loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  if (!gltfCache.has(url)) {
    gltfCache.set(
      url,
      new Promise((resolve, reject) =>
        loader.load(
          url,
          resolve,
          (e) => onBytes?.(e.loaded, e.lengthComputable ? e.total : 0),
          (e) => reject(new Error(`could not load ${url}: ${e?.message || e}`)),
        ),
      ),
    );
  }
  return gltfCache.get(url);
}

/** Load the first model that works for a type. */
export function loadModel(type, onBytes) {
  if (!MODELS[type]) return Promise.resolve(null);
  if (!entryCache.has(type)) {
    entryCache.set(
      type,
      (async () => {
        let lastErr;
        for (const entry of MODELS[type]) {
          try {
            const gltf = await loadUrl(entry.url, onBytes);
            return { entry, gltf };
          } catch (e) {
            gltfCache.delete(entry.url);
            lastErr = e;
          }
        }
        throw lastErr;
      })(),
    );
  }
  return entryCache.get(type);
}

/** Byte-level progress across the types a shelf needs. */
export function preloadModels(types, onProgress) {
  const uniq = [...new Set(types.filter((t) => MODELS[t]))];
  const state = new Map(
    uniq.map((t) => [t, { loaded: 0, total: EXPECTED_BYTES[t] || 2e5, done: false }]),
  );
  const report = () => {
    let l = 0;
    let tot = 0;
    for (const s of state.values()) {
      tot += s.total;
      l += s.done ? s.total : Math.min(s.loaded, s.total);
    }
    onProgress?.(tot ? l / tot : 1, [...state.values()].filter((s) => s.done).length, uniq.length);
  };
  report();
  return uniq.map((t) =>
    loadModel(t, (loaded, total) => {
      const s = state.get(t);
      s.loaded = loaded;
      if (total) s.total = total;
      report();
    })
      .catch(() => null)
      .finally(() => {
        state.get(t).done = true;
        report();
      }),
  );
}

/* ---------------------------------------------------------------------------
   Vintage colourway wash
   The baked albedo keeps the folds (luminance); the hue comes from the
   colourway. On apparel a garment-dye mottle, seam darkening and a fade on
   raised areas are added on top, so washed black reads as washed black.
   --------------------------------------------------------------------------- */
const NOISE_GLSL = `
float mlHash(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float mlNoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(mlHash(i+vec3(0,0,0)),mlHash(i+vec3(1,0,0)),f.x), mix(mlHash(i+vec3(0,1,0)),mlHash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(mlHash(i+vec3(0,0,1)),mlHash(i+vec3(1,0,1)),f.x), mix(mlHash(i+vec3(0,1,1)),mlHash(i+vec3(1,1,1)),f.x),f.y), f.z);
}
float mlFbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*mlNoise(p); p*=2.03; a*=0.5; } return s; }
`;

export function makeWash(material, { vintage = 0, scale = 1 } = {}) {
  const uniforms = {
    mix: { value: 1 },
    color: { value: new THREE.Color("#ffffff") },
    vintage: { value: vintage },
    scale: { value: scale },
    glow: { value: 0 },
    glowColor: { value: new THREE.Color("#19affe") },
  };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.mlTintMix = uniforms.mix;
    shader.uniforms.mlTintColor = uniforms.color;
    shader.uniforms.mlVintage = uniforms.vintage;
    shader.uniforms.mlScale = uniforms.scale;
    shader.uniforms.mlGlow = uniforms.glow;
    shader.uniforms.mlGlowColor = uniforms.glowColor;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float mlScale;\nvarying vec3 vMlPos;",
      )
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvMlPos = position * mlScale;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform float mlTintMix; uniform vec3 mlTintColor; uniform float mlVintage;
         uniform float mlGlow; uniform vec3 mlGlowColor;
         varying vec3 vMlPos;
         ${NOISE_GLSL}`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
         {
           float lum = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
           vec3 washed = mlTintColor * ( 0.55 + 0.62 * lum );
           if ( mlVintage > 0.0 ) {
             float n = mlFbm( vMlPos * 9.0 );
             float n2 = mlFbm( vMlPos * 38.0 + 7.0 );
             // garment-dye mottling: soft blotches plus a finer heather
             washed *= 1.0 + mlVintage * ( ( n - 0.5 ) * 0.55 + ( n2 - 0.5 ) * 0.22 );
             // the fade: raised areas lift toward a chalky, desaturated tone
             float raised = smoothstep( 0.35, 0.85, lum );
             vec3 chalk = vec3( dot( washed, vec3( 0.3333 ) ) ) * 1.3 + vec3( 0.03, 0.03, 0.034 );
             washed = mix( washed, chalk, raised * 0.5 * mlVintage );
             // uneven garment dye reads even on washed black: a soft absolute lift
             washed += vec3( 0.02, 0.02, 0.024 ) * clamp( n - 0.3, 0.0, 1.0 ) * mlVintage;
             // seams and creases hold more dye
             washed *= mix( 1.0, 0.55 + 0.45 * smoothstep( 0.05, 0.4, lum ), mlVintage * 0.7 );
             // never fully black: washed black is a faded charcoal
             washed = max( washed, vec3( 0.012, 0.012, 0.014 ) * ( 0.6 + n ) * mlVintage );
           }
           diffuseColor.rgb = mix( diffuseColor.rgb, washed, mlTintMix );
         }`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\n totalEmissiveRadiance += mlGlowColor * mlGlow;",
      );
  };
  material.customProgramCacheKey = () => `ml-shelf-wash-${vintage > 0 ? 1 : 0}`;
  material.needsUpdate = true;
  return uniforms;
}

/** Normalise a cloned glTF scene to `targetSize`, centred, with washable materials. */
function instantiate(gltf, { targetSize, vintage }) {
  const root = gltf.scene.clone(true);
  const raw = new THREE.Box3().setFromObject(root);
  const rawSize = raw.getSize(new THREE.Vector3());
  const scale = targetSize / Math.max(rawSize.x, rawSize.y, rawSize.z, 1e-6);
  root.scale.setScalar(scale);
  root.updateMatrixWorld(true);
  const centre = new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3());
  root.position.set(-centre.x, -centre.y, -centre.z);
  root.updateMatrixWorld(true);
  const meshes = [];
  const washes = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.material.side = THREE.DoubleSide;
    o.material.metalness = 0;
    o.material.roughness = Math.max(o.material.roughness ?? 1, 0.88);
    o.castShadow = true;
    o.receiveShadow = true;
    meshes.push(o);
    washes.push(makeWash(o.material, { vintage, scale }));
  });
  return { root, meshes, washes, box: new THREE.Box3().setFromObject(root) };
}

/* ---------------------------------------------------------------------------
   Shared bits: textures, hang tag, price tag
   --------------------------------------------------------------------------- */
const sharedTex = {};
function blobTexture() {
  if (!sharedTex.blob) {
    sharedTex.blob = new THREE.CanvasTexture(
      radialCanvas([
        [0, "rgba(0,0,0,0.75)"],
        [0.45, "rgba(0,0,0,0.35)"],
        [1, "rgba(0,0,0,0)"],
      ]),
    );
  }
  return sharedTex.blob;
}

function canvasTex(c, { aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

/** The swing tag: SCAN ME, a real QR to this product's activation, the NFC mark. */
function hangTagCanvas({ url, accent, neon }) {
  const W = 256;
  const H = 400;
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d");
  roundRect(ctx, 0, 0, W, H, 22);
  ctx.fillStyle = "#f6f5f2";
  ctx.fill();
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, accent);
  g.addColorStop(1, neon);
  ctx.save();
  roundRect(ctx, 0, 0, W, H, 22);
  ctx.clip();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, 92);
  ctx.restore();
  // punch hole
  ctx.fillStyle = "#1a1a1f";
  ctx.beginPath();
  ctx.arc(W / 2, 30, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = `700 30px ${FONT_SANS}`;
  ctx.textAlign = "center";
  ctx.fillText("ACTIVATED", W / 2, 78);
  drawQR(ctx, url, 38, 112, 180, { dark: "#111216", light: "#ffffff", margin: 1 });
  ctx.fillStyle = "#111216";
  ctx.font = `700 26px ${FONT_SANS}`;
  ctx.fillText("SCAN ME", W / 2, 330);
  ctx.font = `500 17px ${FONT_MONO}`;
  ctx.fillStyle = "#55576a";
  ctx.fillText("NFC · QR · NO APP", W / 2, 362);
  return c;
}

function priceTagCanvas(name, price) {
  const W = 640;
  const H = 112;
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d");
  roundRect(ctx, 2, 2, W - 4, H - 4, 14);
  ctx.fillStyle = "#f4f2ec";
  ctx.fill();
  ctx.fillStyle = "#111216";
  ctx.textBaseline = "middle";
  ctx.font = `600 34px ${FONT_MONO}`;
  ctx.textAlign = "left";
  let label = name.toUpperCase();
  while (ctx.measureText(label).width > W - 220 && label.length > 4) label = label.slice(0, -2);
  if (label !== name.toUpperCase()) label = label.trimEnd() + "…";
  ctx.fillText(label, 28, H / 2 + 2);
  ctx.textAlign = "right";
  ctx.font = `700 50px ${FONT_SANS}`;
  ctx.fillText(price, W - 28, H / 2 + 3);
  return c;
}

/* ---------------------------------------------------------------------------
   Building one product display
   --------------------------------------------------------------------------- */
const HANG_MAT = () =>
  new THREE.MeshStandardMaterial({ color: 0x15161b, roughness: 0.45, metalness: 0.2 });
const CHROME = () =>
  new THREE.MeshStandardMaterial({ color: 0xd9dce3, roughness: 0.18, metalness: 1 });

/**
 * Build the display for one product in one cubby.
 * @returns {Promise<object>} handle: { item, mount, hit, setColor, setFace, highlight, glint, update, dispose, … }
 */
export async function buildProduct({ product, slot, kit, accent, neon, activateUrl, quality }) {
  const meta = PRODUCT_META[product.type];
  const disposables = [];
  const keep = (x) => (disposables.push(x), x);
  const mount = new THREE.Group(); // stays on the shelf
  const item = new THREE.Group(); // lifts out when inspected
  item.name = `item-${product.id}`;
  const spin = new THREE.Group(); // turntable inside the item
  item.add(spin);
  const glowTargets = []; // uniforms with .glow
  const stdMats = []; // standard materials to glow via emissive
  let washes = [];
  let model = null;
  let decals = [];
  let face = "front";
  let turnMode = "spin";
  let idle = () => false;
  let size = new THREE.Vector3(0.4, 0.4, 0.2);

  const type = product.type;
  // The hoodie hangs back-out so the shelf shows off a big back-panel print —
  // the lineup's signature — next to the chest marks on the tee and long-sleeve.
  const restYaw =
    {
      tee: -0.38,
      hoodie: Math.PI + 0.34,
      longsleeve: -0.38,
      cap: 0.42,
      plush: 0.32,
      deskmat: -0.12,
    }[type] ?? 0;

  /* ---- modelled products ------------------------------------------------ */
  async function printDecals(hex) {
    for (const d of decals) {
      d.removeFromParent();
      d.userData.material?.map?.dispose();
      d.userData.material?.dispose();
      d.children.forEach((c) => c.geometry.dispose());
    }
    decals = [];
    if (!model) return;
    const zones = model.zones;
    // DecalGeometry works in world space; project in the wrapper's own space so
    // a reprint after the product is on the shelf (or lifted out) lands right.
    model.wrap.updateWorldMatrix(true, true);
    const inv = model.wrap.matrixWorld.clone().invert();
    const saved = model.meshes.map((m) => m.matrixWorld.clone());
    model.meshes.forEach((m) => m.matrixWorld.premultiply(inv));
    const add = (zone, canvas) => {
      if (!zone || !canvas) return;
      const z = sizeOfZone(zone, model.box);
      const fitted = fitToAspect(canvas, z.x / z.y, { size: 1024, pad: 0.02 });
      const tex = canvasTex(fitted, { aniso: 8 });
      const g = buildDecal(
        model.meshes,
        zone,
        zone.seat ? seatedBox(zone, model.box, model.meshes) : model.box,
        { texture: tex },
      );
      if (g) {
        g.userData.material.roughness = type === "cap" ? 0.7 : 0.92;
        g.children.forEach((m) => (m.castShadow = false));
        model.wrap.add(g);
        decals.push(g);
      } else tex.dispose();
    };
    const front = kit.front(product, hex);
    if (meta.apparel) {
      add(zones.chest, distress(cloneCanvas(front), 0.12, 2));
      const bz = sizeOfZone(zones.back, model.box);
      add(zones.back, kit.back(product, bz.x / bz.y));
      if (zones.sleeveL) add(zones.sleeveL, kit.sleeve(kit.toneFor(hex)));
      if (zones.sleeveR) add(zones.sleeveR, kit.sleeve(kit.toneFor(hex)));
    } else if (type === "cap") {
      add(zones.front, embroider(front));
    } else if (type === "deskmat") {
      const fz = sizeOfZone(zones.front, model.box);
      add(zones.front, kit.back(product, fz.x / fz.y));
    } else {
      add(zones.front, front);
    }
    model.meshes.forEach((m, i) => m.matrixWorld.copy(saved[i]));
  }

  if (MODELS[type]) {
    const loaded = await loadModel(type).catch(() => null);
    if (loaded) {
      const inst = instantiate(loaded.gltf, {
        targetSize: TARGET[type],
        vintage: meta.apparel ? 1 : type === "cap" ? 0.45 : 0,
      });
      const wrap = new THREE.Group();
      wrap.add(inst.root);
      model = { ...inst, wrap, zones: loaded.entry.zones };
      washes = inst.washes;
      glowTargets.push(...washes);
      spin.add(wrap);
      size = inst.box.getSize(new THREE.Vector3());
    }
  }

  const tagMats = [];
  function addHangTag(pos, rotZ = 0.12) {
    const tex = keep(canvasTex(hangTagCanvas({ url: activateUrl, accent, neon })));
    const mat = keep(
      new THREE.MeshStandardMaterial({
        map: tex,
        color: 0xdadada,
        roughness: 0.6,
        emissive: new THREE.Color("#ffffff"),
        emissiveMap: tex,
        emissiveIntensity: 0.03,
        side: THREE.DoubleSide,
      }),
    );
    tagMats.push(mat);
    const tag = new THREE.Group();
    const card = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.056, 0.0875)), mat);
    card.position.y = -0.0875 / 2 - 0.018;
    tag.add(card);
    const string = new THREE.Mesh(
      keep(new THREE.CylinderGeometry(0.0009, 0.0009, 0.03, 4)),
      keep(new THREE.MeshBasicMaterial({ color: 0x111111 })),
    );
    string.position.y = -0.006;
    tag.add(string);
    tag.position.copy(pos);
    tag.rotation.set(0, 0.1, rotZ);
    spin.add(tag);
    return tag;
  }

  if (model) {
    await printDecals(product.color);
    const b = model.box;
    if (meta.apparel) {
      turnMode = "faces";
      // hanger: black shoulder bar + chrome hook, garment hung from it
      const top = b.max.y;
      const w = size.x;
      const bar = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-w * 0.36, top - size.y * 0.12, 0),
        new THREE.Vector3(-w * 0.18, top - size.y * 0.02, 0),
        new THREE.Vector3(0, top + 0.012, 0),
        new THREE.Vector3(w * 0.18, top - size.y * 0.02, 0),
        new THREE.Vector3(w * 0.36, top - size.y * 0.12, 0),
      ]);
      const hm = keep(HANG_MAT());
      const barMesh = new THREE.Mesh(keep(new THREE.TubeGeometry(bar, 24, 0.009, 8, false)), hm);
      barMesh.castShadow = true;
      spin.add(barMesh);
      const hook = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, top + 0.012, 0),
        new THREE.Vector3(0, top + 0.05, 0),
        new THREE.Vector3(0.012, top + 0.075, 0),
        new THREE.Vector3(0.028, top + 0.07, 0),
        new THREE.Vector3(0.028, top + 0.055, 0),
      ]);
      const cm = keep(CHROME());
      spin.add(new THREE.Mesh(keep(new THREE.TubeGeometry(hook, 20, 0.0035, 6, false)), cm));
      addHangTag(
        new THREE.Vector3(b.max.x * 0.62, top - size.y * 0.22, b.max.z * 0.5 + 0.004),
        0.08,
      );
      item.position.set(slot.center.x, slot.topY - 0.105 - top, 0.0);
      item.rotation.y = restYaw;
      // the rail it hangs from
      const rail = new THREE.Mesh(
        keep(new THREE.CylinderGeometry(0.006, 0.006, slot.width, 10)),
        cm,
      );
      rail.rotation.z = Math.PI / 2;
      rail.position.set(slot.center.x, slot.topY - 0.03, 0.0);
      mount.add(rail);
      for (const sx of [-1, 1]) {
        const cup = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.012, 0.012, 0.008, 12)), cm);
        cup.rotation.z = Math.PI / 2;
        cup.position.set(slot.center.x + sx * (slot.width / 2 - 0.004), slot.topY - 0.03, 0);
        mount.add(cup);
      }
      // soft shadow on the back panel
      const sh = new THREE.Mesh(
        keep(new THREE.PlaneGeometry(size.x * 1.25, size.y * 1.15)),
        keep(
          new THREE.MeshBasicMaterial({
            map: blobTexture(),
            transparent: true,
            depthWrite: false,
            opacity: 0.85,
          }),
        ),
      );
      sh.position.set(slot.center.x + 0.02, item.position.y - 0.03, slot.backZ + 0.004);
      mount.add(sh);
      let t0 = Math.random() * 10;
      idle = (dt) => {
        t0 += dt;
        spin.rotation.z = Math.sin(t0 * 0.9) * 0.006;
        return true;
      };
    } else if (type === "cap") {
      // a little cap stand: weighted base + post + head
      const sm = keep(
        new THREE.MeshPhysicalMaterial({ color: 0x18191f, roughness: 0.3, clearcoat: 0.8 }),
      );
      const baseM = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.07, 0.078, 0.014, 32)), sm);
      baseM.position.set(slot.center.x, slot.floorY + 0.007, 0.02);
      const post = new THREE.Mesh(
        keep(new THREE.CylinderGeometry(0.008, 0.008, 0.11, 12)),
        keep(CHROME()),
      );
      post.position.set(slot.center.x, slot.floorY + 0.06, 0.02);
      mount.add(baseM, post);
      [baseM, post].forEach((m) => (m.castShadow = true));
      item.position.set(slot.center.x, slot.floorY + 0.115 + size.y / 2 - 0.02, 0.02);
      item.rotation.y = restYaw;
      item.rotation.x = 0.08;
      addHangTag(new THREE.Vector3(b.max.x * 0.85, b.min.y + size.y * 0.35, 0), 0.05);
      addBlob(slot.center.x, slot.floorY, 0.02, 0.22);
    } else if (type === "plush") {
      item.position.set(slot.center.x, slot.floorY + size.y / 2, 0.03);
      item.rotation.y = restYaw;
      addHangTag(new THREE.Vector3(b.max.x * 0.7, b.max.y * 0.3, b.max.z * 0.4), 0.2);
      addBlob(slot.center.x, slot.floorY, 0.03, size.x * 1.1);
      let t0 = Math.random() * 10;
      idle = (dt) => {
        t0 += dt;
        spin.scale.y = 1 + Math.sin(t0 * 1.6) * 0.008;
        return true;
      };
    } else if (type === "deskmat") {
      turnMode = "sway";
      item.rotation.x = -0.2;
      item.position.set(
        slot.center.x,
        slot.floorY + (size.y / 2) * Math.cos(0.2) + 0.004,
        slot.backZ + 0.05 + (size.y / 2) * Math.sin(0.2),
      );
      item.rotation.y = 0;
      // QR printed into the corner of the art
      const q = makeCanvas(160, 160);
      drawQR(q.getContext("2d"), activateUrl, 0, 0, 160, {
        dark: "#111216",
        light: "#ffffff",
        margin: 2,
      });
      const qm = new THREE.Mesh(
        keep(new THREE.PlaneGeometry(0.06, 0.06)),
        keep(
          new THREE.MeshStandardMaterial({
            map: keep(canvasTex(q)),
            roughness: 0.8,
            emissive: 0xffffff,
            emissiveIntensity: 0.1,
          }),
        ),
      );
      tagMats.push(qm.material);
      qm.material.emissiveMap = qm.material.map;
      qm.position.set(b.max.x - 0.06, b.min.y + 0.06, b.max.z + 0.002);
      spin.add(qm);
      addBlob(slot.center.x, slot.floorY, slot.backZ + 0.12, size.x * 0.9);
    }
  } else if (type === "keychain") {
    const set = buildCharmSet({ kit, accent, neon, activateUrl, quality });
    disposables.push({ dispose: set.dispose });
    spin.add(set.group);
    stdMats.push(...set.materials);
    tagMats.push(...set.tagMats);
    size = set.size;
    // peg out of the back panel; the clasp ring hangs on it
    const peg = new THREE.Mesh(
      keep(new THREE.CylinderGeometry(0.006, 0.006, slot.depth * 0.55, 10)),
      keep(CHROME()),
    );
    peg.rotation.x = Math.PI / 2;
    peg.position.set(slot.center.x, slot.topY - 0.1, slot.backZ + (slot.depth * 0.55) / 2);
    const pegCap = new THREE.Mesh(keep(new THREE.SphereGeometry(0.009, 12, 8)), peg.material);
    pegCap.position.set(slot.center.x, slot.topY - 0.1, slot.backZ + slot.depth * 0.55);
    mount.add(peg, pegCap);
    // the charm set's origin is its hanging point
    item.position.set(slot.center.x, slot.topY - 0.1, slot.backZ + slot.depth * 0.42);
    item.rotation.y = -0.18;
    turnMode = "spin";
    idle = set.idle;
  } else if (type === "sticker") {
    const pack = buildStickerPack({ kit, accent, neon, quality });
    disposables.push({ dispose: pack.dispose });
    pack.group.scale.setScalar(1.25);
    spin.add(pack.group);
    stdMats.push(...pack.materials);
    size = pack.size;
    item.position.set(slot.center.x, slot.floorY, 0.0);
    turnMode = "sway";
    addBlob(slot.center.x, slot.floorY, 0.0, 0.42);
    idle = pack.idle;
  }

  function addBlob(x, y, z, s) {
    const m = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(s, s * 0.6)),
      keep(
        new THREE.MeshBasicMaterial({
          map: blobTexture(),
          transparent: true,
          depthWrite: false,
          opacity: 0.9,
        }),
      ),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y + 0.002, z);
    m.renderOrder = 1;
    mount.add(m);
  }

  // ---- price tag on the shelf lip -----------------------------------------
  const pt = keep(canvasTex(priceTagCanvas(product.name, money(product.price))));
  const priceTag = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(0.2, 0.035)),
    keep(
      new THREE.MeshStandardMaterial({
        map: pt,
        color: 0xd6d6d6,
        roughness: 0.55,
        emissive: 0xffffff,
        emissiveMap: pt,
        emissiveIntensity: 0.04,
      }),
    ),
  );
  priceTag.position.set(slot.center.x, slot.floorY - 0.017, slot.frontZ + 0.003);
  mount.add(priceTag);

  // ---- hit proxy (cheaper and more forgiving than the 20k-tri meshes) -------
  const hit = new THREE.Mesh(
    keep(new THREE.BoxGeometry(slot.width * 0.96, slot.height * 0.96, slot.depth)),
    keep(new THREE.MeshBasicMaterial({ visible: false })),
  );
  hit.position.copy(slot.center);
  hit.userData.productId = product.id;
  mount.add(hit);

  item.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = quality === "high";
    }
  });

  // ---- API ----------------------------------------------------------------
  let color = product.color;
  const accentCol = new THREE.Color(accent);
  for (const w of washes) w.color.value.set(color);

  return {
    id: product.id,
    product,
    item,
    spin,
    mount,
    hit,
    size,
    restYaw: item.rotation.y,
    turnMode,
    get face() {
      return face;
    },
    /** Change colourway (and reprint if the art tone flips for a pale colour). */
    async setColor(hex) {
      const toneChanged = kit.toneFor(hex) !== kit.toneFor(color);
      color = hex;
      for (const w of washes) w.color.value.set(hex);
      if (toneChanged && model && !product.print) await printDecals(hex);
    },
    get color() {
      return color;
    },
    setFace(f) {
      face = f;
    },
    /** Hover/focus highlight, 0..1. */
    highlight(a) {
      for (const g of glowTargets) {
        g.glow.value = a * 0.05;
        g.glowColor.value.copy(accentCol);
      }
      for (const m of stdMats) {
        if (m.emissive) m.emissive.copy(accentCol).multiplyScalar(a * 0.08);
      }
      for (const d of decals) {
        const m = d.userData.material;
        if (m) m.emissive?.copy(accentCol).multiplyScalar(a * 0.05);
      }
    },
    /** The activation tag catching the light, 0..1. */
    glint(a) {
      for (const m of tagMats) m.emissiveIntensity = 0.03 + a * 0.45;
    },
    idle: (dt) => idle(dt),
    dispose() {
      for (const d of decals) {
        d.userData.material?.map?.dispose();
        d.userData.material?.dispose();
        d.children.forEach((c) => c.geometry.dispose());
      }
      if (model) {
        model.meshes.forEach((m) => m.material.dispose());
        // geometry is shared with the cached glTF: keep it for the next build
      }
      for (const d of disposables) d.dispose?.();
      item.removeFromParent();
      mount.removeFromParent();
    },
  };
}

function cloneCanvas(src) {
  const c = makeCanvas(src.width, src.height);
  c.getContext("2d").drawImage(src, 0, 0);
  return c;
}

/**
 * For a zone on a surface set back from the box's front (a hanging sleeve),
 * find that surface with a ray and return a box whose front face sits on it,
 * with a shallow projector so the print doesn't go through to the far side.
 */
const _ray = new THREE.Raycaster();
function seatedBox(zone, box, meshes) {
  const s = box.getSize(new THREE.Vector3());
  const x = box.min.x + s.x * zone.u;
  const y = box.min.y + s.y * zone.v;
  _ray.set(new THREE.Vector3(x, y, box.max.z + 1), new THREE.Vector3(0, 0, -1));
  const hit = _ray.intersectObjects(meshes, false)[0];
  if (!hit) return box;
  const depth = 0.05;
  const b = box.clone();
  b.max.z = hit.point.z + depth * 0.35;
  b.min.z = b.max.z - depth / 0.62;
  return b;
}

/** World size of a zone on a box (x across, y up), for fitting art to it. */
function sizeOfZone(zone, box) {
  const s = box.getSize(new THREE.Vector3());
  if (zone.face === "front" || zone.face === "back") return { x: s.x * zone.w, y: s.y * zone.h };
  if (zone.face === "left" || zone.face === "right") return { x: s.z * zone.w, y: s.y * zone.h };
  return { x: s.x * zone.w, y: s.z * zone.h };
}
