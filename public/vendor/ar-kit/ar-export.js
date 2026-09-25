/* ar-kit/ar-export.js: turn a live three.js endcap into files for native phone AR.
 *
 *   import { exportARFiles } from '/vendor/ar-kit/ar-export.js';
 *   const { glb, usdz } = await exportARFiles(displayRoot, { maxTexture: 2048 });
 *
 * glb  → Android Scene Viewer (and any glTF viewer)
 * usdz → iOS AR Quick Look
 *
 * Needs the page's import map to resolve 'three' and 'three/addons/' (every demo page has one).
 *
 * The live scene can't be exported as-is: it uses canvas and video textures, per-tile texture
 * offsets, a mirrored part or two, basic/unlit materials and additive glow planes, and Quick Look
 * only understands a subset of that. So this builds a flat, export-only copy of what's visible:
 *  - one mesh per visible mesh (instanced meshes expanded, skinned meshes frozen in their current
 *    pose, multi-material meshes split per material), world transforms relative to the root
 *  - every material converted to MeshStandardMaterial (unlit ones become self-lit), glow planes
 *    and invisible helpers dropped
 *  - every texture redrawn into a canvas at most maxTexture px, stored as JPEG unless it carries
 *    alpha, and its offset/repeat baked into the UVs (Quick Look gets texture transforms wrong)
 *  - the model centred on its footprint with the floor at y = 0, metres, facing +Z
 * The live scene is never modified.
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { USDZExporter } from './usdz-exporter.js';

const WHITE = new THREE.Color(1, 1, 1);

function isShown(o, root) {
  for (let n = o; n; n = n.parent) {
    if (!n.visible) return false;
    if (n === root) return true;
  }
  return true;
}

/* ---------------- textures ---------------- */

function imageSize(img) {
  return {
    w: img.videoWidth || img.naturalWidth || img.width || 0,
    h: img.videoHeight || img.naturalHeight || img.height || 0,
  };
}

function drawToCanvas(img, max) {
  if (!img) return null;
  let src = img;
  if (img.data && img.width && img.height) {
    // DataTexture: only 8-bit RGBA can be drawn
    if (!(img.data instanceof Uint8Array || img.data instanceof Uint8ClampedArray) || img.data.length !== img.width * img.height * 4) return null;
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
    src = c;
  }
  const { w, h } = imageSize(src);
  if (!w || !h) return null;
  const s = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  try {
    g.drawImage(src, 0, 0, c.width, c.height);
  } catch (e) {
    return null; // tainted or not decodable
  }
  return c;
}

function makeTextureBaker(max) {
  const sources = new Map(); // original Source → shared Source of the redrawn canvas (or null)
  const textures = new Map(); // original texture + alpha → export texture
  return function bake(tex, alpha) {
    if (!tex || !tex.isTexture || tex.isCubeTexture || tex.isCompressedTexture) return null;
    const key = tex.uuid + (alpha ? ':a' : ':o');
    if (textures.has(key)) return textures.get(key);
    let shared = sources.get(tex.source);
    if (shared === undefined) {
      const canvas = drawToCanvas(tex.image, max);
      shared = canvas ? new THREE.Source(canvas) : null;
      sources.set(tex.source, shared);
    }
    let out = null;
    if (shared) {
      out = new THREE.Texture();
      out.source = shared;
      out.flipY = tex.flipY;
      out.wrapS = tex.wrapS;
      out.wrapT = tex.wrapT;
      out.colorSpace = tex.colorSpace;
      out.channel = tex.channel || 0;
      out.name = tex.name;
      // the transform is baked into the UVs (see bakeUV)
      out.userData.mimeType = alpha ? 'image/png' : 'image/jpeg';
      out.needsUpdate = true;
    }
    textures.set(key, out);
    return out;
  };
}

/* ---------------- materials ---------------- */

const MAP_SLOTS = ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap'];

function textureTransformOf(m) {
  for (const k of MAP_SLOTS) {
    const t = m[k];
    if (!t || !t.isTexture) continue;
    t.updateMatrix();
    const e = t.matrix.elements;
    const identity = e[0] === 1 && e[1] === 0 && e[3] === 0 && e[4] === 1 && e[6] === 0 && e[7] === 0;
    return identity ? null : t.matrix.clone();
  }
  return null;
}

// Additive glows, light cones and near-invisible helpers look wrong (grey slabs) in AR viewers.
function droppable(m) {
  if (!m || m.visible === false) return true;
  if (m.blending !== THREE.NormalBlending) return true;
  if (m.transparent && m.opacity < 0.04) return true;
  if (m.colorWrite === false) return true;
  return false;
}

function makeMaterialConverter(bake) {
  const cache = new Map();
  return function convert(m) {
    if (cache.has(m)) return cache.get(m);
    let s = null;
    if (!droppable(m) && (m.isMeshStandardMaterial || m.isMeshBasicMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshToonMaterial || m.isMeshMatcapMaterial)) {
      s = new THREE.MeshStandardMaterial({ name: m.name || '' });
      const alpha = !!(m.transparent || m.alphaTest > 0);
      s.transparent = m.transparent && (m.opacity < 0.999 || !!m.map || !!m.alphaMap);
      s.opacity = m.opacity;
      s.alphaTest = m.alphaTest || 0;
      s.side = m.side;
      s.depthWrite = m.depthWrite;
      if (m.color) s.color.copy(m.color);
      if (m.isMeshMatcapMaterial) {
        s.roughness = 0.6;
        s.metalness = 0;
      } else {
        s.map = bake(m.map, alpha);
        s.alphaMap = bake(m.alphaMap, true);
      }
      if (m.isMeshStandardMaterial) {
        s.roughness = m.roughness;
        s.metalness = m.metalness;
        s.roughnessMap = bake(m.roughnessMap, false);
        s.metalnessMap = bake(m.metalnessMap, false);
        s.normalMap = bake(m.normalMap, false);
        if (s.normalMap) s.normalScale.copy(m.normalScale);
        s.aoMap = bake(m.aoMap, false);
        s.aoMapIntensity = m.aoMapIntensity;
        s.emissive.copy(m.emissive);
        s.emissiveIntensity = m.emissiveIntensity;
        s.emissiveMap = bake(m.emissiveMap, false);
      } else if (m.isMeshBasicMaterial) {
        // unlit: mostly self-lit, with a little diffuse so it still sits in the room
        s.roughness = 1;
        s.metalness = 0;
        s.emissive.copy(m.color || WHITE);
        s.emissiveMap = s.map;
        s.emissiveIntensity = 0.85;
        s.color.multiplyScalar(0.25);
      } else {
        // Lambert / Phong / Toon
        s.roughness = m.isMeshPhongMaterial ? THREE.MathUtils.clamp(1 - (m.shininess || 30) / 100, 0.15, 1) : 0.85;
        s.metalness = 0;
        if (m.emissive) {
          s.emissive.copy(m.emissive);
          s.emissiveIntensity = m.emissiveIntensity ?? 1;
          s.emissiveMap = bake(m.emissiveMap, false);
        }
        if (m.normalMap) {
          s.normalMap = bake(m.normalMap, false);
          if (s.normalMap) s.normalScale.copy(m.normalScale);
        }
      }
      // emissive_strength is optional in glTF viewers; keep LEDs bright but bounded
      s.emissiveIntensity = Math.min(s.emissiveIntensity, 4);
    }
    cache.set(m, s);
    return s;
  };
}

/* ---------------- geometry ---------------- */

function bakeUV(geometry, matrix) {
  const uv = geometry.getAttribute('uv');
  if (!uv) return geometry;
  const g = geometry.clone();
  const a = g.getAttribute('uv').clone();
  const v = new THREE.Vector3();
  for (let i = 0; i < a.count; i++) {
    v.set(a.getX(i), a.getY(i), 1).applyMatrix3(matrix);
    a.setXY(i, v.x, v.y);
  }
  g.setAttribute('uv', a);
  return g;
}

function subGeometry(geometry, group) {
  const g = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(geometry.attributes)) g.setAttribute(k, a);
  const idx = [];
  const end = group.start + group.count;
  if (geometry.index) for (let i = group.start; i < end; i++) idx.push(geometry.index.getX(i));
  else for (let i = group.start; i < end; i++) idx.push(i);
  g.setIndex(idx);
  return g;
}

function flipWinding(g) {
  if (!g.index) {
    const idx = [];
    for (let i = 0; i < g.attributes.position.count; i += 3) idx.push(i, i + 2, i + 1);
    g.setIndex(idx);
    return;
  }
  const a = g.index.array.slice();
  for (let i = 0; i < a.length; i += 3) {
    const t = a[i + 1];
    a[i + 1] = a[i + 2];
    a[i + 2] = t;
  }
  g.setIndex(new THREE.BufferAttribute(a, 1));
}

function frozenSkin(mesh) {
  const src = mesh.geometry;
  const g = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(src.attributes)) if (k !== 'skinIndex' && k !== 'skinWeight') g.setAttribute(k, a);
  if (src.index) g.setIndex(src.index);
  const pos = src.attributes.position.clone();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(src.attributes.position, i);
    mesh.applyBoneTransform(i, v);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.setAttribute('position', pos);
  g.computeVertexNormals();
  g.groups = src.groups.slice();
  return g;
}

/* ---------------- scene ---------------- */

/**
 * Build the export-only copy of `root` (see the header). Exposed for tests and previews.
 * @returns {THREE.Group}
 */
export function prepareARScene(root, { maxTexture = 2048 } = {}) {
  const bake = makeTextureBaker(maxTexture);
  const convert = makeMaterialConverter(bake);
  root.updateWorldMatrix(true, true);
  const toRoot = root.matrixWorld.clone().invert();
  const out = new THREE.Group();
  out.name = 'ARRoot';
  const geoCache = new Map(); // geometry + uv transform → prepared geometry
  const m4 = new THREE.Matrix4();

  function prepGeometry(geometry, uvMatrix) {
    const key = geometry.uuid + (uvMatrix ? ':' + uvMatrix.elements.map((x) => x.toFixed(5)).join(',') : '');
    let g = geoCache.get(key);
    if (!g) {
      g = uvMatrix ? bakeUV(geometry, uvMatrix) : geometry;
      if (!g.getAttribute('normal')) {
        g = g === geometry ? g.clone() : g;
        g.computeVertexNormals();
      }
      geoCache.set(key, g);
    }
    return g;
  }

  function add(geometry, material, matrix, name) {
    const mat = convert(material);
    if (!mat || !geometry.getAttribute('position')) return;
    let g = prepGeometry(geometry, textureTransformOf(material));
    let mtx = matrix;
    if (matrix.determinant() < 0) {
      // mirrored part: USDZ can't express negative scale, so bake the transform in and fix the winding
      g = g.clone().applyMatrix4(matrix);
      flipWinding(g);
      mtx = new THREE.Matrix4();
    }
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = (name || 'mesh').replace(/[^A-Za-z0-9_]/g, '_');
    mtx.decompose(mesh.position, mesh.quaternion, mesh.scale);
    out.add(mesh);
  }

  root.traverse((o) => {
    if (!o.isMesh || !isShown(o, root) || o.userData.noAR) return;
    if (o.isPoints || o.isLine || o.isSprite) return;
    const world = m4.multiplyMatrices(toRoot, o.matrixWorld).clone();
    const geometry = o.isSkinnedMesh ? frozenSkin(o) : o.geometry;
    const mats = Array.isArray(o.material) ? o.material : null;
    const parts =
      mats && geometry.groups.length
        ? geometry.groups.map((gr) => [subGeometry(geometry, gr), mats[gr.materialIndex ?? 0]])
        : [[geometry, mats ? mats[0] : o.material]];
    for (const [g, mat] of parts) {
      if (!mat) continue;
      if (o.isInstancedMesh) {
        const im = new THREE.Matrix4();
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, im);
          let m = mat;
          if (o.instanceColor) {
            const c = new THREE.Color();
            o.getColorAt(i, c);
            m = mat.clone();
            if (m.color) m.color.multiply(c);
          }
          add(g, m, world.clone().multiply(im), o.name + '_' + i);
        }
      } else add(g, mat, world, o.name);
    }
  });

  // centre on the footprint, floor at y = 0
  const box = new THREE.Box3().setFromObject(out);
  if (!box.isEmpty()) {
    const c = box.getCenter(new THREE.Vector3());
    for (const ch of out.children) {
      ch.position.x -= c.x;
      ch.position.z -= c.z;
      ch.position.y -= box.min.y;
    }
  }
  out.updateMatrixWorld(true);
  return out;
}

function tick() {
  return new Promise((r) => setTimeout(r, 0));
}

/**
 * @param {THREE.Object3D} root the endcap as currently shown
 * @param {{ maxTexture?: number, onProgress?: (msg: string) => void }} [opts]
 * @returns {Promise<{ glb: ArrayBuffer, usdz: ArrayBuffer }>}
 */
export async function exportARFiles(root, { maxTexture = 2048, onProgress } = {}) {
  const say = (m) => {
    try {
      onProgress && onProgress(m);
    } catch (e) {
      /* ignore */
    }
  };
  say('Preparing the model');
  const scene = prepareARScene(root, { maxTexture });
  await tick();
  say('Building the Android file (GLB)');
  const glb = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true, maxTextureSize: maxTexture });
  await tick();
  say('Building the iPhone file (USDZ)');
  const usdzBytes = await new USDZExporter().parseAsync(scene, { quickLookCompatible: true, maxTextureSize: maxTexture });
  const usdz = usdzBytes.buffer.slice(usdzBytes.byteOffset, usdzBytes.byteOffset + usdzBytes.byteLength);
  // the export copy owns its baked geometries/textures; the live scene's are shared and must stay
  scene.traverse((o) => {
    if (o.isMesh && o.material) {
      for (const k of MAP_SLOTS) o.material[k]?.dispose?.();
      o.material.dispose();
    }
  });
  say('Done');
  return { glb, usdz };
}
