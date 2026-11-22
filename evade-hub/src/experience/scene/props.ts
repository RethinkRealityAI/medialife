// The party props: only the disco ball is a GLB (public/models/props/discoball.glb, a few thousand triangles, 1024
// webp). Each `make()` returns a fresh clone (geometry and textures shared) fitted to a height, standing on y = 0,
// centred, facing +z.
import * as THREE from 'three';
import type { Assets } from '../core/assets';

export type PropName = 'discoball';
const FILES: Record<PropName, string> = { discoball: 'discoball' };
/** Turn so the prop's front faces +z. */
const YAW: Partial<Record<PropName, number>> = {};

export class PropKit {
  private src = new Map<PropName, THREE.Object3D>();

  async load(assets: Assets, progress: (p: number) => void): Promise<void> {
    const names = Object.keys(FILES) as PropName[];
    let done = 0;
    await Promise.all(names.map(async (n) => {
      const g = await assets.gltf(`/evade/hub/models/props/${FILES[n]}.glb`);
      g.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        for (const mat of ([] as THREE.Material[]).concat(m.material)) {
          const s = mat as THREE.MeshStandardMaterial;
          s.side = THREE.DoubleSide; // fixed at load (never flip it later: that is a shader change)
          if (s.map) s.map.anisotropy = 4;
          if ('roughness' in s) { s.roughness = Math.max(0.45, s.roughness); s.metalness = Math.min(0.1, s.metalness); }
        }
      });
      this.src.set(n, g.scene);
      progress(++done / names.length);
    }));
  }

  /** A fitted clone: `height` units tall, feet on y = 0, centred on x/z, facing +z. */
  make(name: PropName, height: number): THREE.Group {
    const src = this.src.get(name);
    const g = new THREE.Group();
    g.name = name;
    if (!src) return g;
    const inner = new THREE.Group();
    inner.rotation.y = YAW[name] ?? 0;
    inner.add(src.clone(true));
    g.add(inner);
    inner.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(inner);
    const s = height / Math.max(1e-4, b.max.y - b.min.y);
    inner.scale.setScalar(s);
    inner.updateMatrixWorld(true);
    b.setFromObject(inner);
    const c = b.getCenter(new THREE.Vector3());
    inner.position.set(-c.x, -b.min.y, -c.z);
    return g;
  }

  /** Width and depth of a fitted prop (for layout and collisions). */
  size(obj: THREE.Object3D): THREE.Vector3 {
    obj.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
    const b = new THREE.Box3();
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      b.union(bb);
    });
    return b.getSize(new THREE.Vector3());
  }
}
