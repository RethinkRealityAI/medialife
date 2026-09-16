/**
 * Product loading, colourways and print placement for the Drop Studio.
 *
 * Products are real GLB meshes (Meshy-generated, glTF-Transform optimised —
 * meshopt + WebP + quantised, one mesh, one material, ~20k tris, 200–500KB).
 *
 * Two things follow from how those models are built, and they drive the whole
 * design of this file:
 *
 * 1. The baked albedo is near-greyscale with the shading cooked in. So a
 *    colourway is applied by washing the albedo toward the chosen colour in the
 *    shader, which keeps every fold and seam while giving a clean flat colour.
 *    Tinting with `material.color` alone cannot neutralise what colour is left
 *    in the map; a wash can.
 *
 * 2. The UVs are a machine-packed atlas of arbitrary islands. There is no chest
 *    rectangle to paint into, and anything drawn in UV space smears across
 *    unrelated parts of the model. So artwork is *projected* onto the mesh with
 *    DecalGeometry instead, which is island-agnostic and is how every real
 *    garment configurator does it.
 *
 * Placement is bounded by named print zones defined relative to each product's
 * own bounding box, so a zone lands correctly whatever the model's raw scale.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ---------------------------------------------------------------------------
   Colourway wash
   --------------------------------------------------------------------------- */

const patched = new WeakMap();

/**
 * Patch a standard material so a colourway can be washed over its baked albedo.
 *
 * Adapted from the AiroHub paint pipeline, which solved the same problem: the
 * model arrives with a real baked albedo and throwing it away to recolour would
 * defeat the point of having generated it.
 *
 * @returns {{mix:{value:number}, color:{value:THREE.Color}}} live uniforms
 */
export function makeTintable(material) {
  if (!material?.isMeshStandardMaterial) return null;
  const existing = patched.get(material);
  if (existing) return existing;

  const uniforms = {
    mix: { value: 0 },
    color: { value: new THREE.Color("#ffffff") },
  };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.mlTintMix = uniforms.mix;
    shader.uniforms.mlTintColor = uniforms.color;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform float mlTintMix;
         uniform vec3 mlTintColor;`,
      )
      // Straight after the base albedo resolves: keep its luminance (that is
      // the folds and the baked shading) and take the hue from the colourway.
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
         {
           float lum = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
           vec3 washed = mlTintColor * ( 0.55 + 0.62 * lum );
           diffuseColor.rgb = mix( diffuseColor.rgb, washed, mlTintMix );
         }`,
      );
  };
  material.customProgramCacheKey = () => "ml-tintable-v1";
  material.needsUpdate = true;

  patched.set(material, uniforms);
  return uniforms;
}

/* ---------------------------------------------------------------------------
   Print zones
   --------------------------------------------------------------------------- */

/**
 * A print zone is the safe area a creator may place artwork inside.
 *
 * Coordinates are fractions of the product's own bounding box, so the same
 * definition works whatever scale the model was exported at:
 *   u, v   position across the face and up it, 0..1 from the box's min corner
 *   w, h   the zone's size as a fraction of the box width and height
 *   face   which way the artwork projects
 *
 * @typedef {{id:string,label:string,face:'front'|'back'|'left'|'right'|'top',
 *            u:number,v:number,w:number,h:number,note?:string}} PrintZone
 */

/** @type {Record<string, PrintZone[]>} */
export const PRINT_ZONES = {
  tee: [
    { id: "chest", label: "Front chest", face: "front", u: 0.5, v: 0.62, w: 0.42, h: 0.34 },
    { id: "back", label: "Back", face: "back", u: 0.5, v: 0.66, w: 0.5, h: 0.42 },
    { id: "pocket", label: "Left chest", face: "front", u: 0.34, v: 0.7, w: 0.14, h: 0.12 },
    { id: "hem", label: "Hem label", face: "front", u: 0.62, v: 0.14, w: 0.1, h: 0.07 },
  ],
  hoodie: [
    { id: "chest", label: "Front chest", face: "front", u: 0.5, v: 0.5, w: 0.38, h: 0.22 },
    { id: "back", label: "Back", face: "back", u: 0.5, v: 0.52, w: 0.46, h: 0.3 },
    { id: "pocket", label: "Left chest", face: "front", u: 0.36, v: 0.57, w: 0.13, h: 0.09 },
    { id: "sleeve", label: "Sleeve", face: "right", u: 0.5, v: 0.5, w: 0.18, h: 0.12 },
  ],
  plush: [
    { id: "chest", label: "Chest", face: "front", u: 0.5, v: 0.42, w: 0.4, h: 0.26 },
    { id: "back", label: "Back", face: "back", u: 0.5, v: 0.46, w: 0.4, h: 0.26 },
  ],
  cap: [
    { id: "front", label: "Front panel", face: "front", u: 0.5, v: 0.6, w: 0.34, h: 0.26 },
    { id: "side", label: "Side panel", face: "right", u: 0.5, v: 0.6, w: 0.2, h: 0.16 },
  ],
  keychain: [{ id: "face", label: "Charm face", face: "front", u: 0.5, v: 0.45, w: 0.6, h: 0.6 }],
  stickers: [{ id: "sheet", label: "Sheet", face: "front", u: 0.5, v: 0.5, w: 0.78, h: 0.78 }],
  deskmat: [{ id: "surface", label: "Surface", face: "top", u: 0.5, v: 0.5, w: 0.7, h: 0.6 }],
};

const FACE_DIR = {
  front: new THREE.Vector3(0, 0, 1),
  back: new THREE.Vector3(0, 0, -1),
  left: new THREE.Vector3(-1, 0, 0),
  right: new THREE.Vector3(1, 0, 0),
  top: new THREE.Vector3(0, 1, 0),
};

/**
 * Resolve a zone against a product's world bounding box.
 * @returns {{position:THREE.Vector3, orientation:THREE.Euler, size:THREE.Vector3, dir:THREE.Vector3}}
 */
export function resolveZone(zone, box) {
  const size = box.getSize(new THREE.Vector3());
  const min = box.min;
  const dir = FACE_DIR[zone.face] || FACE_DIR.front;

  // The projector is seated on the face it prints, not at the product's centre.
  // A projector spanning the whole depth also catches the opposite shell, which
  // puts a mirrored copy of the front print on the back of the garment.
  const pos = new THREE.Vector3();
  let depth;
  if (zone.face === "front" || zone.face === "back") {
    const z = zone.face === "front" ? box.max.z : box.min.z;
    pos.set(min.x + size.x * zone.u, min.y + size.y * zone.v, z);
    depth = size.z * 0.62;
  } else if (zone.face === "left" || zone.face === "right") {
    const x = zone.face === "right" ? box.max.x : box.min.x;
    pos.set(x, min.y + size.y * zone.v, min.z + size.z * zone.u);
    depth = size.x * 0.62;
  } else {
    pos.set(min.x + size.x * zone.u, box.max.y, min.z + size.z * zone.v);
    depth = size.y * 0.62;
  }

  // Look along the face normal. DecalGeometry projects down the local -Z of the
  // supplied orientation, so aim a helper object at the face and borrow its
  // rotation rather than composing Euler angles by hand.
  const helper = new THREE.Object3D();
  helper.position.copy(pos);
  helper.lookAt(pos.clone().add(dir));
  helper.updateMatrixWorld();

  return {
    position: pos,
    orientation: helper.rotation.clone(),
    size: new THREE.Vector3(size.x * zone.w, size.y * zone.h, depth),
    dir,
  };
}

/* ---------------------------------------------------------------------------
   Loading
   --------------------------------------------------------------------------- */

let loader = null;
function getLoader() {
  if (!loader) loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

const cache = new Map();

/**
 * Load a product GLB, normalise it to a consistent on-screen size, and make it
 * tintable. Cached by url, and cloned per use so two studios cannot fight over
 * one material's uniforms.
 *
 * @returns {Promise<{root:THREE.Object3D, meshes:THREE.Mesh[], tints:Array, box:THREE.Box3}>}
 */
export async function loadProduct(url, { targetSize = 2.2 } = {}) {
  if (!cache.has(url)) {
    cache.set(
      url,
      new Promise((resolve, reject) => {
        getLoader().load(url, resolve, undefined, (e) =>
          reject(new Error(`could not load ${url}: ${e?.message || e}`)),
        );
      }),
    );
  }
  const gltf = await cache.get(url);
  const root = gltf.scene.clone(true);

  // Normalise scale and centre on the origin so every product frames the same
  // way and the zone maths below is comparable across the catalogue.
  const raw = new THREE.Box3().setFromObject(root);
  const rawSize = raw.getSize(new THREE.Vector3());
  const scale = targetSize / Math.max(rawSize.x, rawSize.y, rawSize.z, 1e-6);
  root.scale.setScalar(scale);
  root.updateMatrixWorld(true);

  const scaled = new THREE.Box3().setFromObject(root);
  const centre = scaled.getCenter(new THREE.Vector3());
  root.position.set(-centre.x, -centre.y, -centre.z);
  root.updateMatrixWorld(true);

  const meshes = [];
  const tints = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    // Garments are open at the hem, cuffs and neck — FrontSide renders those
    // openings as holes straight through to the background.
    o.material.side = THREE.DoubleSide;
    // Generated metallic-roughness maps carry garbage in the unassigned parts
    // of the atlas. A metal texel in a dark studio is a mirror of nothing, so
    // those regions render as hard black patches across the hem and sleeves.
    // None of this catalogue is metal, so the channel is forced off.
    o.material.metalness = 0;
    o.material.roughness = Math.max(o.material.roughness ?? 1, 0.55);
    meshes.push(o);
    const t = makeTintable(o.material);
    if (t) tints.push(t);
  });

  return { root, meshes, tints, box: new THREE.Box3().setFromObject(root) };
}

/* ---------------------------------------------------------------------------
   Decals
   --------------------------------------------------------------------------- */

/**
 * Project artwork onto a product inside a print zone.
 *
 * `offsetX/offsetY` nudge within the zone in zone-widths, and `scale` is a
 * fraction of it, both clamped so artwork can never leave the safe area — the
 * whole point of a print zone is that a printer can actually reproduce it.
 */
export function buildDecal(meshes, zone, box, opts) {
  const { texture, scale = 1, offsetX = 0, offsetY = 0, rotation = 0 } = opts;
  if (!texture || !meshes.length) return null;

  const r = resolveZone(zone, box);

  // Clamp so the artwork's own half-size keeps it inside the zone.
  const half = clamp(scale, 0.1, 1) / 2;
  const maxOff = Math.max(0, 0.5 - half);
  const ox = clamp(offsetX, -1, 1) * maxOff;
  const oy = clamp(offsetY, -1, 1) * maxOff;

  const across = new THREE.Vector3();
  const up = new THREE.Vector3();
  const m = new THREE.Matrix4().makeRotationFromEuler(r.orientation);
  across.setFromMatrixColumn(m, 0);
  up.setFromMatrixColumn(m, 1);

  const pos = r.position
    .clone()
    .addScaledVector(across, ox * r.size.x * 2)
    .addScaledVector(up, oy * r.size.y * 2);

  const orientation = r.orientation.clone();
  const size = new THREE.Vector3(
    r.size.x * clamp(scale, 0.1, 1),
    r.size.y * clamp(scale, 0.1, 1),
    r.size.z,
  );

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    // alphaTest discards the fully transparent texels, so depthWrite can stay on
    // and overlapping projected layers stop blending into a ghost.
    alphaTest: 0.06,
    roughness: 0.72,
    metalness: 0,
    // A decal shares a surface with the mesh it sits on, so it needs a depth
    // bias or it z-fights across the whole print.
    polygonOffset: true,
    polygonOffsetFactor: -8,
  });

  const group = new THREE.Group();
  for (const mesh of meshes) {
    const euler = orientation.clone();
    euler.z += rotation;
    let geo;
    try {
      geo = new DecalGeometry(mesh, pos, euler, size);
    } catch {
      continue; // a mesh the projector misses simply contributes nothing
    }
    if (!geo.attributes.position || geo.attributes.position.count === 0) continue;
    const d = new THREE.Mesh(geo, material);
    d.renderOrder = 3;
    group.add(d);
  }
  group.userData.material = material;
  return group.children.length ? group : null;
}

/** A dashed outline of the safe area, shown while artwork is being positioned. */
export function buildZoneGuide(zone, box, color = 0x19affe) {
  const r = resolveZone(zone, box);
  const w = r.size.x;
  const h = r.size.y;
  const pts = [
    new THREE.Vector3(-w / 2, -h / 2, 0),
    new THREE.Vector3(w / 2, -h / 2, 0),
    new THREE.Vector3(w / 2, h / 2, 0),
    new THREE.Vector3(-w / 2, h / 2, 0),
    new THREE.Vector3(-w / 2, -h / 2, 0),
  ];
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const line = new THREE.Line(
    geo,
    new THREE.LineDashedMaterial({
      color,
      dashSize: w * 0.06,
      gapSize: w * 0.04,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    }),
  );
  line.computeLineDistances();
  line.position.copy(r.position).addScaledVector(r.dir, Math.max(w, h) * 0.06);
  line.rotation.copy(r.orientation);
  line.renderOrder = 6;
  return line;
}

/** Turn an image element into a texture ready to project. */
export function textureFromImage(img) {
  const tex = new THREE.Texture(img);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}
