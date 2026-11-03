/**
 * Browser-only: what the Media Library learns from a file before it uploads
 * (nothing is sent from here). Reuses the UGC Hub's poster extraction
 * (src/lib/ugc/media-client.ts) and adds audio duration, SVG/GIF/AVIF images
 * and an average colour.
 *
 *   const meta = await readMediaMeta(file);
 *   // { width, height, durationS, color: "#2a1f4d", thumb: JPEG Blob | null }
 *
 * Formats the browser can't decode (HEVC in some browsers, HEIC, USDZ) give
 * nulls instead of failing: the upload still works; the server fills in image
 * dimensions it can read from the bytes.
 */
import { extractImagePoster, extractVideoPoster, fingerprintUgcFile } from "@/lib/ugc/media-client";

import { kindOf, resolveMediaMime } from "./model";
import type { MediaUploadMeta } from "./upload-client";

export { fingerprintUgcFile as fingerprintMediaFile };

const EMPTY: MediaUploadMeta = {
  width: null,
  height: null,
  durationS: null,
  color: null,
  thumb: null,
};

/** Average colour of an image Blob, "#rrggbb", or null. */
export async function averageColor(img: Blob): Promise<string | null> {
  try {
    const bmp = await createImageBitmap(img);
    const c = document.createElement("canvas");
    c.width = 12;
    c.height = 12;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, 12, 12);
    bmp.close();
    const d = ctx.getImageData(0, 0, 12, 12).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3] / 255;
      if (a < 0.2) continue; // transparent pixels don't count
      r += d[i] * a;
      g += d[i + 1] * a;
      b += d[i + 2] * a;
      n += a;
    }
    if (!n) return null;
    const hex = (v: number) =>
      Math.round(v / n)
        .toString(16)
        .padStart(2, "0");
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  } catch {
    return null;
  }
}

/** SVGs (createImageBitmap can't read them everywhere): size via an <img>, thumbnail via a canvas. */
async function svgMeta(file: Blob): Promise<MediaUploadMeta> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const width = img.naturalWidth || null;
    const height = img.naturalHeight || null;
    if (!width || !height) return EMPTY;
    const scale = Math.min(1, 720 / Math.max(width, height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(width * scale));
    c.height = Math.max(1, Math.round(height * scale));
    c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
    const thumb = await new Promise<Blob | null>((r) => c.toBlob((b) => r(b), "image/png"));
    return {
      width,
      height,
      durationS: null,
      color: thumb ? await averageColor(thumb) : null,
      thumb,
    };
  } catch {
    return EMPTY;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** PNG, WebP, GIF, AVIF may be transparent: keep the alpha in a WebP (or PNG) thumbnail. */
async function alphaImageMeta(file: Blob): Promise<MediaUploadMeta> {
  try {
    const bmp = await createImageBitmap(file);
    const { width, height } = bmp;
    const scale = Math.min(1, 960 / Math.max(width, height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(width * scale));
    c.height = Math.max(1, Math.round(height * scale));
    c.getContext("2d")?.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    // browsers without WebP encoding hand back a PNG, which the server also takes
    const thumb = await new Promise<Blob | null>((r) => c.toBlob((b) => r(b), "image/webp", 0.84));
    return {
      width,
      height,
      durationS: null,
      color: thumb ? await averageColor(thumb) : null,
      thumb,
    };
  } catch {
    return EMPTY;
  }
}

async function audioMeta(file: Blob): Promise<MediaUploadMeta> {
  const url = URL.createObjectURL(file);
  const audio = document.createElement("audio");
  audio.preload = "metadata";
  try {
    const durationS = await new Promise<number | null>((resolve) => {
      const t = setTimeout(() => resolve(null), 10_000);
      audio.addEventListener(
        "loadedmetadata",
        () => {
          clearTimeout(t);
          resolve(Number.isFinite(audio.duration) ? Math.round(audio.duration * 100) / 100 : null);
        },
        { once: true },
      );
      audio.addEventListener(
        "error",
        () => {
          clearTimeout(t);
          resolve(null);
        },
        { once: true },
      );
      audio.src = url;
    });
    return { ...EMPTY, durationS };
  } finally {
    audio.removeAttribute("src");
    URL.revokeObjectURL(url);
  }
}

/** Dimensions, duration, a JPEG thumbnail / poster frame and an average colour. */
export async function readMediaMeta(file: File): Promise<MediaUploadMeta> {
  const mime = resolveMediaMime(file.name, file.type);
  if (!mime) return EMPTY;
  const kind = kindOf(mime);
  try {
    if (kind === "video") {
      const v = await extractVideoPoster(file, { maxEdge: 960 });
      return {
        width: v.width,
        height: v.height,
        durationS: v.durationS,
        thumb: v.poster,
        color: v.poster ? await averageColor(v.poster) : null,
      };
    }
    if (kind === "image") {
      if (mime === "image/svg+xml") return svgMeta(file);
      if (mime === "image/jpeg" || mime === "image/heic") {
        const p = await extractImagePoster(file, { maxEdge: 960, quality: 0.82 });
        return {
          width: p.width,
          height: p.height,
          durationS: null,
          thumb: p.poster,
          color: p.poster ? await averageColor(p.poster) : null,
        };
      }
      return alphaImageMeta(file);
    }
    if (kind === "audio") return audioMeta(file);
  } catch {
    return EMPTY;
  }
  return EMPTY;
}
