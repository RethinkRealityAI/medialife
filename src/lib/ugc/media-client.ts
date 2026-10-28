/**
 * Browser-only helpers for UGC uploads: a poster frame, duration and size from
 * a video or photo File (nothing is uploaded here), and a cheap fingerprint.
 *
 *   const meta = await readUgcMedia(file);
 *   // meta.poster: JPEG Blob | null   meta.durationS / width / height / aspect
 *   aspectHint(meta.aspect, brief.preferredAspect)  // "Looks like 16:9. This brief asks for 9:16."
 *
 * Formats the browser can't decode (HEVC in some browsers, HEIC photos) return
 * nulls rather than failing: the upload still works, the card just has no
 * picture.
 */
import { UGC_SUBMISSION_TYPES, aspectOf, resolveUgcMime, type UgcAspect } from "./model";

export type UgcMediaMeta = {
  mediaType: "video" | "image" | null;
  durationS: number | null;
  width: number | null;
  height: number | null;
  aspect: UgcAspect | null;
  /** A JPEG no larger than maxEdge on its long side, or null. */
  poster: Blob | null;
};

type PosterOpts = { atSeconds?: number; maxEdge?: number; quality?: number; timeoutMs?: number };

const EMPTY: UgcMediaMeta = {
  mediaType: null,
  durationS: null,
  width: null,
  height: null,
  aspect: null,
  poster: null,
};

function toJpeg(
  source: CanvasImageSource,
  w: number,
  h: number,
  maxEdge: number,
  quality: number,
): Promise<Blob | null> {
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
}

/** Duration, size and a poster frame from a video File. */
export async function extractVideoPoster(file: Blob, opts: PosterOpts = {}): Promise<UgcMediaMeta> {
  const { atSeconds = 1, maxEdge = 720, quality = 0.8, timeoutMs = 15_000 } = opts;
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  const once = (ev: string) =>
    new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      video.addEventListener(
        ev,
        () => {
          clearTimeout(t);
          resolve();
        },
        { once: true },
      );
      video.addEventListener(
        "error",
        () => {
          clearTimeout(t);
          reject(new Error("decode"));
        },
        { once: true },
      );
    });
  try {
    await once("loadedmetadata");
    const durationS = Number.isFinite(video.duration)
      ? Math.round(video.duration * 100) / 100
      : null;
    const width = video.videoWidth || null;
    const height = video.videoHeight || null;
    const base = {
      mediaType: "video" as const,
      durationS,
      width,
      height,
      aspect: aspectOf(width, height),
    };
    let poster: Blob | null = null;
    if (width && height) {
      try {
        const at = Math.min(atSeconds, (durationS ?? atSeconds * 2) * 0.5);
        const seeked = once("seeked");
        video.currentTime = Math.max(0.05, at);
        await seeked;
        poster = await toJpeg(video, width, height, maxEdge, quality);
      } catch {
        poster = null;
      }
    }
    return { ...base, poster };
  } catch {
    return { ...EMPTY, mediaType: "video" };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

/** Size and a downscaled JPEG from a photo File. */
export async function extractImagePoster(file: Blob, opts: PosterOpts = {}): Promise<UgcMediaMeta> {
  const { maxEdge = 720, quality = 0.8 } = opts;
  try {
    const bmp = await createImageBitmap(file);
    const width = bmp.width;
    const height = bmp.height;
    const poster = await toJpeg(bmp, width, height, maxEdge, quality);
    bmp.close();
    return {
      mediaType: "image",
      durationS: null,
      width,
      height,
      aspect: aspectOf(width, height),
      poster,
    };
  } catch {
    return { ...EMPTY, mediaType: "image" };
  }
}

/** Video or photo, by the file's name and type. */
export async function readUgcMedia(file: File, opts: PosterOpts = {}): Promise<UgcMediaMeta> {
  const mime = resolveUgcMime(file.name, file.type);
  const media = mime ? UGC_SUBMISSION_TYPES[mime].media : null;
  if (media === "video") return extractVideoPoster(file, opts);
  if (media === "image") return extractImagePoster(file, opts);
  return EMPTY;
}

/**
 * SHA-256 over the size and the first and last 4 MB: quick on a phone (hashing
 * a whole multi-GB file isn't), and enough to spot the same file uploaded twice.
 */
export async function fingerprintUgcFile(file: Blob): Promise<string> {
  const piece = 4 * 1024 * 1024;
  const head = await file.slice(0, piece).arrayBuffer();
  const tail =
    file.size > piece
      ? await file.slice(Math.max(piece, file.size - piece)).arrayBuffer()
      : new ArrayBuffer(0);
  const size = new TextEncoder().encode(String(file.size));
  const all = new Uint8Array(size.byteLength + head.byteLength + tail.byteLength);
  all.set(size, 0);
  all.set(new Uint8Array(head), size.byteLength);
  all.set(new Uint8Array(tail), size.byteLength + head.byteLength);
  const d = await crypto.subtle.digest("SHA-256", all);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}
