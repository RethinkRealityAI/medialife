/**
 * Measuring a file before it goes into the asset library, and drawing its small picture. Loaded only when
 * someone adds a file (a dynamic import from the asset store), so the Studio's first paint never pays for it.
 *
 * Models: GLTFLoader + meshopt, the same as the fans' pages; Draco and KTX2 are refused with the admin
 * editor's words. The box is measured as loaded, before any animation (the scene editor's README). The
 * picture is rendered once, offscreen, from a 3/4 view on a flat neutral background.
 * Pictures: scaled down. Video: the frame at about half a second.
 */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { AssetKind } from './api';

const THUMB = 320;
const THUMB_BG = '#2b2d33';

export function kindOf(file: File): AssetKind | null {
  const n = file.name.toLowerCase();
  if (n.endsWith('.glb') || file.type === 'model/gltf-binary') return 'model';
  if (/\.(png|jpe?g|webp)$/.test(n) || /^image\/(png|jpeg|webp)$/.test(file.type)) return 'image';
  if (n.endsWith('.mp4') || file.type === 'video/mp4') return 'video';
  return null;
}

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
    const j = JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + len))) as { extensionsUsed?: string[]; extensionsRequired?: string[] };
    used = [...(j.extensionsUsed ?? []), ...(j.extensionsRequired ?? [])];
  } catch {
    return 'That model file is damaged. Export it again as a .glb.';
  }
  if (used.includes('KHR_draco_mesh_compression'))
    return 'This model uses Draco compression, which phones here can’t open. Export it again without Draco (Meshopt compression is fine).';
  if (used.includes('KHR_texture_basisu'))
    return 'This model uses KTX2 textures, which phones here can’t open. Export it again with PNG or JPEG textures.';
  return null;
}

export type Measured = {
  aspect: number | null;
  clips: string[];
  tris: number | null;
  dims: [number, number, number] | null;
  gltf?: GLTF;
  thumb: Blob | null;
};

let loader: GLTFLoader | null = null;
function gltfLoader() {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}

const toBlob = (c: HTMLCanvasElement) =>
  new Promise<Blob | null>((res) => c.toBlob((b) => res(b), 'image/jpeg', 0.84));

function canvasOf(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const g = c.getContext('2d')!;
  g.fillStyle = THUMB_BG;
  g.fillRect(0, 0, c.width, c.height);
  return { c, g };
}

/** A picture or video frame, scaled to fit THUMB on its long side. */
async function flatThumb(src: CanvasImageSource, w: number, h: number) {
  const k = THUMB / Math.max(w, h, 1);
  const { c, g } = canvasOf(Math.min(w * k, THUMB), Math.min(h * k, THUMB));
  g.drawImage(src, 0, 0, c.width, c.height);
  return toBlob(c);
}

function modelThumb(gltf: GLTF): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = THUMB;
  canvas.height = THUMB;
  let renderer: THREE.WebGLRenderer | null = null;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(THUMB, THUMB, false);
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(THUMB_BG);
    const pm = new THREE.PMREMGenerator(renderer);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.9;
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(0.4, 0.8, 1);
    scene.add(sun);
    const model = cloneSkinned(gltf.scene);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    model.position.sub(sphere.center);
    scene.add(model);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 1000);
    const r = Math.max(sphere.radius, 1e-4);
    const dist = (r * 1.08) / Math.sin((30 * Math.PI) / 360);
    camera.position.set(0.55, 0.35, 0.76).normalize().multiplyScalar(dist);
    camera.near = dist / 100;
    camera.far = dist * 10;
    camera.updateProjectionMatrix();
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    const out = toBlob(canvas);
    env.dispose();
    pm.dispose();
    return out.finally(() => {
      renderer?.dispose();
      renderer?.forceContextLoss();
    });
  } catch (e) {
    console.warn('[assets] no picture for that model', e);
    renderer?.dispose();
    return Promise.resolve(null);
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Couldn’t open that picture.'));
    img.src = src;
  });
}

function loadVideoFrame(src: string) {
  return new Promise<{ v: HTMLVideoElement; w: number; h: number }>((res, rej) => {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.onerror = () => rej(new Error('Couldn’t open that video. Use an MP4 (H.264).'));
    v.onloadedmetadata = () => {
      v.currentTime = Math.min(0.5, (v.duration || 1) / 2);
    };
    v.onseeked = () => res({ v, w: v.videoWidth, h: v.videoHeight });
    v.src = src;
  });
}

/** Opens a local file, measures it and draws its small picture. Throws a plain message. */
export async function measureFile(file: File, kind: AssetKind): Promise<Measured> {
  if (kind === 'model') {
    const buf = await file.arrayBuffer();
    const why = glbUnsupported(buf);
    if (why) throw new Error(why);
    let gltf: GLTF;
    try {
      gltf = await gltfLoader().parseAsync(buf, '');
    } catch {
      throw new Error('Couldn’t open that model. Export it as a binary glTF (.glb) and try again.');
    }
    gltf.scene.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3());
    let tris = 0;
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.geometry) return;
      const g = m.geometry;
      const n = g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
      tris += n * ((o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).count : 1);
    });
    return {
      aspect: null,
      clips: gltf.animations.map((a) => a.name).filter(Boolean),
      tris: Math.round(tris),
      dims: [size.x, size.y, size.z],
      gltf,
      thumb: await modelThumb(gltf),
    };
  }
  const url = URL.createObjectURL(file);
  try {
    if (kind === 'image') {
      const img = await loadImage(url);
      const w = img.naturalWidth,
        h = img.naturalHeight;
      return { aspect: w / Math.max(1, h), clips: [], tris: null, dims: null, thumb: await flatThumb(img, w, h) };
    }
    const { v, w, h } = await loadVideoFrame(url);
    const thumb = await flatThumb(v, w, h);
    v.removeAttribute('src');
    v.load();
    return { aspect: w / Math.max(1, h), clips: [], tris: null, dims: null, thumb };
  } finally {
    URL.revokeObjectURL(url);
  }
}
