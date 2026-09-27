import {
  HEAVY_MODEL_BYTES,
  MAX_BYTES,
  MAX_IMAGE_PX,
  MOBILE_IMAGE_PX,
  formatBytes,
  sniffMime,
} from "@/lib/ar/assets";
import type { AssetMeta } from "@/lib/ar/project";

import { uploadBlob } from "./upload";

// Turning dropped files into library assets, in the browser:
//  - images are resized to ≤4096 px (+ a ≤1600 px phone version), WebP when the
//    browser can encode it, PNG when it can't and the image has transparency;
//  - models must be binary glTF (.glb); a thumbnail is rendered with the site's
//    vendored three.js and uploaded as its own (hidden) image asset.

export class MediaError extends Error {}

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const OTHER_3D = /\.(gltf|fbx|obj|usdz|usd|blend|stl|dae|3ds|max|ma|mb|c4d|ply)$/i;

export type FileKind = "model" | "image";

/** What kind of library file this is, or a friendly reason it can't be one. */
export function classify(file: File): FileKind {
  const name = file.name.toLowerCase();
  if (name.endsWith(".glb")) return "model";
  if (OTHER_3D.test(name)) {
    throw new MediaError(
      `${file.name}: only .glb models are supported. Export it as binary glTF (.glb) and upload that.`,
    );
  }
  if (IMAGE_TYPES.includes(file.type) || /\.(png|jpe?g|webp)$/.test(name)) return "image";
  throw new MediaError(`${file.name}: use a .glb model or a PNG, JPEG or WebP image.`);
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

interface Encoded {
  blob: Blob;
  width: number;
  height: number;
  mime: string;
}

function canvasOf(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function toBlob(c: HTMLCanvasElement, type: string, q?: number): Promise<Blob | null> {
  return new Promise((resolve) => c.toBlob(resolve, type, q));
}

/** Any pixel not fully opaque? Checked on a small copy; enough for cut-outs and logos. */
function hasAlpha(bitmap: ImageBitmap): boolean {
  const s = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * s));
  const h = Math.max(1, Math.round(bitmap.height * s));
  const ctx = canvasOf(w, h).getContext("2d", { willReadFrequently: true });
  if (!ctx) return true;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < px.length; i += 4) if (px[i] < 255) return true;
  return false;
}

async function encode(
  bitmap: ImageBitmap,
  maxPx: number,
  alpha: boolean,
  q: number,
): Promise<Encoded> {
  const s = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * s));
  const height = Math.max(1, Math.round(bitmap.height * s));
  const c = canvasOf(width, height);
  const ctx = c.getContext("2d");
  if (!ctx) throw new MediaError("This browser couldn't process the image.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  // WebP keeps alpha and is small; Safari < 17 silently returns PNG instead
  let blob = await toBlob(c, "image/webp", q);
  if (!blob || blob.type !== "image/webp") {
    blob = alpha ? await toBlob(c, "image/png") : await toBlob(c, "image/jpeg", q);
  }
  if (!blob) throw new MediaError("This browser couldn't process the image.");
  return { blob, width, height, mime: blob.type };
}

export interface PreparedImage {
  main: Encoded;
  mobile: Encoded | null;
  alpha: boolean;
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new MediaError(`${file.name}: this image couldn't be read. Is the file damaged?`);
  }
  try {
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const sniffed = sniffMime(head);
    const alpha = sniffed !== "image/jpeg" && hasAlpha(bitmap);
    const longest = Math.max(bitmap.width, bitmap.height);
    // keep the original bytes when they already fit: no generation loss
    const keep =
      longest <= MAX_IMAGE_PX &&
      file.size <= MAX_BYTES.image &&
      !!sniffed &&
      IMAGE_TYPES.includes(sniffed);
    const main: Encoded = keep
      ? { blob: file, width: bitmap.width, height: bitmap.height, mime: sniffed! }
      : await encode(bitmap, MAX_IMAGE_PX, alpha, 0.9);
    if (main.blob.size > MAX_BYTES.image) {
      throw new MediaError(
        `${file.name} is ${formatBytes(main.blob.size)} after resizing; the limit is 10 MB.`,
      );
    }
    const mobile =
      longest > MOBILE_IMAGE_PX ? await encode(bitmap, MOBILE_IMAGE_PX, alpha, 0.85) : null;
    return { main, mobile, alpha };
  } finally {
    bitmap.close();
  }
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export async function checkGlb(file: File): Promise<{ heavy: boolean }> {
  if (file.size > MAX_BYTES.model) {
    throw new MediaError(`${file.name} is ${formatBytes(file.size)}; models can be at most 20 MB.`);
  }
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (sniffMime(head) !== "model/gltf-binary") {
    throw new MediaError(`${file.name} isn't a binary glTF file. Export it as .glb and try again.`);
  }
  const v = new DataView(head.buffer);
  if (v.getUint32(4, true) !== 2)
    throw new MediaError(`${file.name} is glTF 1.0; export it as glTF 2.0 (.glb).`);
  if (v.getUint32(8, true) !== file.size)
    throw new MediaError(`${file.name} looks cut short. Export it again.`);
  return { heavy: file.size > HEAVY_MODEL_BYTES };
}

// three.js is vendored under /vendor and loaded at runtime, not an npm
// dependency, so there are no types for it here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Untyped = any;
type ThreeKit = {
  THREE: Untyped;
  GLTFLoader: Untyped;
  MeshoptDecoder: Untyped;
  RoomEnvironment: Untyped;
};

let kit: Promise<ThreeKit> | null = null;

/**
 * The vendored three.js addons import the bare specifier "three", which only
 * resolves through the demo pages' import map. Rewrite those imports to the
 * absolute URL and load the addons from blob URLs, so this works in any page.
 */
function loadThree(): Promise<ThreeKit> {
  if (kit) return kit;
  kit = (async () => {
    const base = `${location.origin}/vendor/three@0.170.0`;
    const threeUrl = `${base}/three.module.min.js`;
    const src = async (path: string) => {
      const res = await fetch(`${base}/${path}`);
      if (!res.ok) throw new Error(`three.js addon ${path} is missing`);
      return res.text();
    };
    const blobUrl = (code: string) =>
      URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
    const bare = /from\s*['"]three['"]/g;
    const bgu = blobUrl(
      (await src("jsm/utils/BufferGeometryUtils.js")).replace(bare, `from '${threeUrl}'`),
    );
    const gltf = blobUrl(
      (await src("jsm/loaders/GLTFLoader.js"))
        .replace(bare, `from '${threeUrl}'`)
        .replace(/from\s*['"]\.\.\/utils\/BufferGeometryUtils\.js['"]/, `from '${bgu}'`),
    );
    const room = blobUrl(
      (await src("jsm/environments/RoomEnvironment.js")).replace(bare, `from '${threeUrl}'`),
    );
    const [THREE, loader, meshopt, env] = await Promise.all([
      import(/* @vite-ignore */ threeUrl),
      import(/* @vite-ignore */ gltf),
      import(/* @vite-ignore */ `${base}/jsm/libs/meshopt_decoder.module.js`),
      import(/* @vite-ignore */ room),
    ]);
    return {
      THREE,
      GLTFLoader: loader.GLTFLoader,
      MeshoptDecoder: meshopt.MeshoptDecoder,
      RoomEnvironment: env.RoomEnvironment,
    };
  })();
  kit.catch(() => {
    kit = null;
  });
  return kit;
}

/** A square WebP/PNG render of a .glb, with a transparent background; null if it can't render. */
// one render at a time: each needs its own WebGL context, and browsers cap them
let renderQueue: Promise<unknown> = Promise.resolve();

export function renderModelThumb(file: Blob, size = 512): Promise<Blob | null> {
  const job = renderQueue.then(() => renderOne(file, size));
  renderQueue = job.catch(() => null);
  return job;
}

async function renderOne(file: Blob, size: number): Promise<Blob | null> {
  let k: ThreeKit;
  try {
    k = await loadThree();
  } catch {
    return null;
  }
  const { THREE } = k;
  const canvas = canvasOf(size, size);
  let renderer: Untyped = null;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(size, size, false);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new k.RoomEnvironment(), 0.04).texture;

    const loader = new k.GLTFLoader();
    loader.setMeshoptDecoder(k.MeshoptDecoder);
    const data = await file.arrayBuffer();
    const gltf = await Promise.race([
      new Promise<{ scene: unknown }>((ok, err) => loader.parse(data, "", ok, err)),
      new Promise<never>((_, err) => setTimeout(() => err(new Error("timeout")), 45000)),
    ]);
    const model: Untyped = gltf.scene;
    scene.add(model);

    const box = new THREE.Box3().setFromObject(model);
    if (box.isEmpty()) return null;
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getBoundingSphere(new THREE.Sphere()).radius || 1;
    const camera = new THREE.PerspectiveCamera(30, 1, radius / 100, radius * 100);
    const dist = (radius / Math.sin(THREE.MathUtils.degToRad(15))) * 1.02;
    const dir = new THREE.Vector3(0.9, 0.55, 1.3).normalize();
    camera.position.copy(center).addScaledVector(dir, dist);
    camera.lookAt(center);
    renderer.render(scene, camera);

    let blob = await toBlob(canvas, "image/webp", 0.9);
    if (!blob || blob.type !== "image/webp") blob = await toBlob(canvas, "image/png");
    model.traverse((m: Untyped) => {
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        for (const v of Object.values(mat) as Untyped[])
          if (v instanceof THREE.Texture) v.dispose();
        mat.dispose();
      }
    });
    pmrem.dispose();
    return blob;
  } catch {
    return null;
  } finally {
    // free the WebGL context now; browsers cap how many can exist at once
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
}

// ---------------------------------------------------------------------------
// The whole pipeline for one dropped file
// ---------------------------------------------------------------------------

export interface UploadedFile {
  asset: AssetMeta;
  warning?: string;
}

export async function uploadFile(
  file: File,
  onProgress: (fraction: number, label: string) => void,
  signal?: AbortSignal,
): Promise<UploadedFile> {
  const kind = classify(file);
  if (kind === "model") {
    const { heavy } = await checkGlb(file);
    onProgress(0, "Making a thumbnail");
    let thumb: string | undefined;
    const png = await renderModelThumb(file);
    if (png) {
      const t = await uploadBlob(
        png,
        {
          name: file.name.replace(/\.glb$/i, "-thumb.webp"),
          kind: "image",
          mime: png.type,
          tags: ["thumb"],
        },
        { signal },
      );
      thumb = t.id;
    }
    const asset = await uploadBlob(
      file,
      { name: file.name, kind: "model", mime: "model/gltf-binary", thumb },
      { onProgress: (f) => onProgress(f, "Uploading"), signal },
    );
    return {
      asset,
      warning: heavy ? `${formatBytes(file.size)}: may load slowly on phones` : undefined,
    };
  }

  onProgress(0, "Preparing");
  const img = await prepareImage(file);
  let mobile: string | undefined;
  const share = img.mobile ? img.mobile.blob.size / (img.mobile.blob.size + img.main.blob.size) : 0;
  if (img.mobile) {
    const m = await uploadBlob(
      img.mobile.blob,
      {
        name: file.name.replace(/\.[a-z0-9]+$/i, "") + "-phone." + img.mobile.mime.split("/")[1],
        kind: "image",
        mime: img.mobile.mime,
        tags: ["variant"],
        width: img.mobile.width,
        height: img.mobile.height,
      },
      { onProgress: (f) => onProgress(f * share, "Uploading"), signal },
    );
    mobile = m.id;
  }
  const ext = img.main.mime.split("/")[1].replace("jpeg", "jpg");
  const asset = await uploadBlob(
    img.main.blob,
    {
      name: img.main.blob === file ? file.name : file.name.replace(/\.[a-z0-9]+$/i, "") + "." + ext,
      kind: "image",
      mime: img.main.mime,
      mobile,
      width: img.main.width,
      height: img.main.height,
    },
    { onProgress: (f) => onProgress(share + f * (1 - share), "Uploading"), signal },
  );
  return { asset };
}
