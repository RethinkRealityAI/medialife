// Asset loading with real progress. GLBs are meshopt-compressed (props were optimised with gltf-transform:
// simplified, textures 1024 webp, meshopt), so the loader wires the MeshoptDecoder. No Draco/KTX2 (pitfall: a phone
// GLB that needs them fails to load).
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { AssetLoader } from '../types';

export class Assets implements AssetLoader {
  private loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private cache = new Map<string, Promise<unknown>>();
  private parts = new Map<string, { weight: number; p: number }>();
  onProgress: ((p: number) => void) | null = null;

  /** Register a weighted part of the splash progress (0..1 each). */
  part(name: string, weight: number): (p: number) => void {
    this.parts.set(name, { weight, p: 0 });
    return (p: number) => {
      const it = this.parts.get(name);
      if (!it) return;
      it.p = Math.max(it.p, Math.min(1, p));
      this.report();
    };
  }

  get progress(): number {
    let w = 0, s = 0;
    for (const it of this.parts.values()) { w += it.weight; s += it.weight * it.p; }
    return w ? s / w : 0;
  }

  private report(): void {
    this.onProgress?.(this.progress);
  }

  gltf(url: string, onProgress?: (p: number) => void): Promise<GLTF> {
    let p = this.cache.get(url) as Promise<GLTF> | undefined;
    if (!p) {
      p = this.loader.loadAsync(url, (e) => { if (e.total) onProgress?.(e.loaded / e.total); }).then((g) => {
        onProgress?.(1);
        return g;
      });
      this.cache.set(url, p);
    }
    return p;
  }

  texture(url: string, srgb = true): Promise<THREE.Texture> {
    let p = this.cache.get(url) as Promise<THREE.Texture> | undefined;
    if (!p) {
      p = new THREE.TextureLoader().loadAsync(url).then((t) => {
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        return t;
      });
      this.cache.set(url, p);
    }
    return p;
  }
}
