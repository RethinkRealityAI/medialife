import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

import type { AssetInfo, SceneItemKind } from "./types";

// Loading and measuring scene files in the browser (client only: imported lazily, never on the server).
// Models: GLTFLoader with meshopt compression, the same as the fans' pages. Draco meshes and KTX2
// textures are refused (the fans' pages can't open them), so what shows here shows there. The model's size comes from
// Box3.setFromObject(gltf.scene) on the scene as loaded, before any animation plays (README.md).

let loader: GLTFLoader | null = null;
function gltfLoader() {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}

export type LoadedModel = {
  gltf: GLTF;
  /** Bounding box of the scene as loaded, in the model's own units. */
  box: THREE.Box3;
  info: AssetInfo;
};

export function measureModel(gltf: GLTF, bytes: number | null): LoadedModel {
  gltf.scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const size = box.getSize(new THREE.Vector3());
  let triangles = 0;
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    const g = m.geometry;
    const n = g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
    triangles +=
      n * ((o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).count : 1);
  });
  return {
    gltf,
    box,
    info: {
      bytes,
      triangles: Math.round(triangles),
      clips: gltf.animations.map((a) => a.name).filter(Boolean),
      box: { w: size.x, h: size.y, d: size.z },
    },
  };
}

/** The height used to normalise a model: its box height, or its largest side when it has no height. */
export function modelHeight(box: { w: number; h: number; d: number }) {
  return box.h > 1e-6 ? box.h : Math.max(box.w, box.d, 1e-6);
}

async function parseModel(buf: ArrayBuffer): Promise<LoadedModel> {
  const gltf = await gltfLoader().parseAsync(buf, "");
  return measureModel(gltf, buf.byteLength);
}

const models = new Map<string, Promise<LoadedModel>>();

/** A model by URL, loaded once per page (the same GLTF is cloned for each item that uses it). */
export function loadModel(url: string): Promise<LoadedModel> {
  let p = models.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Couldn't load the model (error ${r.status})`);
        return r.arrayBuffer();
      })
      .then(parseModel);
    p.catch(() => models.delete(url));
    models.set(url, p);
  }
  return p;
}

/** After an upload: reuse what was measured from the local file instead of downloading it again. */
export function primeModel(url: string, m: LoadedModel) {
  models.set(url, Promise.resolve(m));
}

function imageAspect(src: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth / Math.max(1, img.naturalHeight));
    img.onerror = () => reject(new Error("Couldn't open that picture"));
    img.src = src;
  });
}

function videoAspect(src: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => resolve(v.videoWidth / Math.max(1, v.videoHeight));
    v.onerror = () => reject(new Error("Couldn't open that video. Use an MP4 (H.264)."));
    v.src = src;
  });
}

/** Which kind a dropped or picked file is, from its type or name. */
export function kindOf(file: File): SceneItemKind | null {
  const n = file.name.toLowerCase();
  if (n.endsWith(".glb") || file.type === "model/gltf-binary") return "model";
  if (/\.(png|jpe?g|webp)$/.test(n) || /^image\/(png|jpeg|webp)$/.test(file.type)) return "image";
  if (n.endsWith(".mp4") || file.type === "video/mp4") return "video";
  return null;
}

/** Measure a local file before it is uploaded. Models come back parsed, ready to show. */
/** Why the fans' pages can't show this GLB (null: fine). Same check as the server's. */
export function glbUnsupported(buf: ArrayBuffer): string | null {
  const b = new Uint8Array(buf);
  if (b.length < 20) return null;
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) return null; // "glTF"; the loader reports other problems
  const len = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== 0x4e4f534a || 20 + len > b.length) return null;
  let used: string[] = [];
  try {
    const j = JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + len))) as {
      extensionsUsed?: string[];
      extensionsRequired?: string[];
    };
    used = [...(j.extensionsUsed ?? []), ...(j.extensionsRequired ?? [])];
  } catch {
    return "That model file is damaged. Export it again as a .glb.";
  }
  if (used.includes("KHR_draco_mesh_compression"))
    return "This model uses Draco compression, which phones here can't open. Export it again without Draco (Meshopt compression is fine).";
  if (used.includes("KHR_texture_basisu"))
    return "This model uses KTX2 textures, which phones here can't open. Export it again with PNG or JPEG textures.";
  return null;
}

export async function measureFile(
  file: File,
  kind: SceneItemKind,
): Promise<{ info: AssetInfo; model?: LoadedModel }> {
  if (kind === "model") {
    let model: LoadedModel;
    const buf = await file.arrayBuffer();
    const why = glbUnsupported(buf);
    if (why) throw new Error(why);
    try {
      model = await parseModel(buf);
    } catch {
      throw new Error("Couldn't open that model. Export it as a binary glTF (.glb) and try again.");
    }
    return { info: model.info, model };
  }
  const url = URL.createObjectURL(file);
  try {
    const aspect = kind === "image" ? await imageAspect(url) : await videoAspect(url);
    return { info: { bytes: file.size, aspect } };
  } finally {
    URL.revokeObjectURL(url);
  }
}
