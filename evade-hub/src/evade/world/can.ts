// The Eclipse can (EVADE's real product, /evade/keychain/ar/eclipse-can.glb) as a few static parts for the mini
// games: Can Dash's pickups (instanced) and the stand under Paw Hoops' ring. Loaded once on the splash; the parts are
// merged per material, baked to a 1-unit-tall can centred on the origin, and given plain non-metal materials (there
// is no environment map in AR: metal would read black). No animation, no fizz, no silhouette card.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const CAN_URL = '/evade/keychain/ar/eclipse-can.glb';

export interface CanPart { geometry: THREE.BufferGeometry; material: THREE.Material }

let parts: CanPart[] = [];
let loading: Promise<void> | null = null;

const SKIP = /^(Silhouette|Can_Fizz)/;

/** Load and bake the can (on the splash). Never rejects: no can means the games fall back to their toy shapes. */
export function preloadCan(gltf: (url: string, onProgress?: (p: number) => void) => Promise<GLTF>, progress: (p: number) => void): Promise<void> {
  return (loading ||= (async () => {
    const g = await gltf(CAN_URL, progress).catch((e) => { console.error('[can] did not load', e); return null; });
    progress(1);
    if (!g) return;
    const root = g.scene;
    root.updateMatrixWorld(true);
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.visible) return;
      for (let p: THREE.Object3D | null = m; p; p = p.parent) if (SKIP.test(p.name)) return;
      const src = Array.isArray(m.material) ? m.material[0] : m.material;
      const geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
      for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
      if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      if (!geo.attributes.normal) geo.computeVertexNormals();
      const list = byMat.get(src) ?? [];
      list.push(geo.index ? geo : geo);
      byMat.set(src, list);
    });
    const box = new THREE.Box3();
    const out: CanPart[] = [];
    for (const [mat, geos] of byMat) {
      const allIndexed = geos.every((x) => x.index), noneIndexed = geos.every((x) => !x.index);
      const list = allIndexed || noneIndexed ? geos : geos.map((x) => (x.index ? x.toNonIndexed() : x));
      const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (!merged) continue;
      merged.computeBoundingBox();
      box.union(merged.boundingBox!);
      out.push({ geometry: merged, material: plain(mat) });
    }
    if (box.isEmpty()) return;
    // 1 unit tall, centred on the origin (the games place pickups by their centre)
    const h = box.max.y - box.min.y;
    const c = box.getCenter(new THREE.Vector3());
    for (const p of out) {
      p.geometry.translate(-c.x, -c.y, -c.z);
      p.geometry.scale(1 / h, 1 / h, 1 / h);
      p.geometry.computeBoundingSphere();
    }
    parts = out;
  })());
}

/** A plain standard material with the source's colour, texture and side (no metal, no extras). */
function plain(src: THREE.Material): THREE.Material {
  const s = src as THREE.MeshStandardMaterial;
  return new THREE.MeshStandardMaterial({
    name: `can-${src.name}`,
    color: s.color ? s.color.clone() : new THREE.Color(0xffffff),
    map: s.map ?? null,
    roughness: Math.max(0.35, s.roughness ?? 0.5),
    metalness: 0,
    side: src.side,
    transparent: false,
  });
}

/** The baked can parts (empty before `preloadCan`, or if it did not load). */
export function canParts(): readonly CanPart[] {
  return parts;
}
