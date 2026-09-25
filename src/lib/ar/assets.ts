import type { AssetMeta } from "./project";

// The asset library contract shared by the builder UI and the upload endpoints.
//
// Upload (admin, every non-GET needs the header "x-ar-admin: 1"):
//   POST /api/ar/admin/assets                     {name,size,kind,mime,tags?,thumb?,mobile?} → {id,chunkSize,chunks}
//   PUT  /api/ar/admin/assets/<id>/chunks/<n>     raw bytes, every chunk but the last exactly chunkSize
//   POST /api/ar/admin/assets/<id>/complete       → AssetMeta (size, count and file signature verified)
// Library:
//   GET    /api/ar/admin/assets                   → {assets: AssetListItem[]}
//   DELETE /api/ar/admin/assets/<id>[?force=1]    409 {error:"in-use", usedBy} unless forced
// Public:
//   GET  /api/ar/asset/<id>                       the bytes, streamed, cached for a year

/** Chunks stay under Netlify's 6 MB function request limit. */
export const CHUNK_SIZE = 4 * 1024 * 1024;
export const MB = 1024 * 1024;
export const MAX_BYTES = { model: 20 * MB, image: 10 * MB } as const;
/** Above this a model is slow to load on phones; the library warns. */
export const HEAVY_MODEL_BYTES = 10 * MB;
/** Images are resized to fit these before upload. */
export const MAX_IMAGE_PX = 4096;
export const MOBILE_IMAGE_PX = 1600;

export const MIME_BY_KIND = {
  model: ["model/gltf-binary", "model/vnd.usdz+zip"],
  image: ["image/png", "image/jpeg", "image/webp"],
} as const;

/** Tags the builder sets on files it generates; they stay out of the library grid. */
export const GENERATED_TAGS = ["ar", "thumb", "variant"] as const;
export const isGenerated = (a: Pick<AssetMeta, "tags">) =>
  !!a.tags?.some((t) => (GENERATED_TAGS as readonly string[]).includes(t));

export const ASSET_ID_RE = /^[a-z0-9]{10,40}$/;

/** A library row: the stored meta plus where it's used. */
export interface AssetListItem extends AssetMeta {
  url: string;
  /** projects (slug + name) whose draft, published version or thumbnail uses the file */
  usedBy: { slug: string; name: string }[];
}

export interface InitUploadBody {
  name: string;
  size: number;
  kind: AssetMeta["kind"];
  mime: string;
  tags?: string[];
  /** asset id of an already uploaded thumbnail (models) */
  thumb?: string;
  /** asset id of an already uploaded phone-sized variant (images) */
  mobile?: string;
  /** pixel size (images) */
  width?: number;
  height?: number;
}

/**
 * The mime type a file's first bytes prove, or null. The server trusts this, not
 * the name or the browser's guess.
 */
export function sniffMime(head: Uint8Array): string | null {
  const b = head;
  const ascii = (from: number, len: number) => String.fromCharCode(...b.subarray(from, from + len));
  if (b.length >= 12 && ascii(0, 4) === "glTF") return "model/gltf-binary";
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04)
    return "model/vnd.usdz+zip";
  if (b.length >= 8 && b[0] === 0x89 && ascii(1, 3) === "PNG") return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  return null;
}

/** GLB header: version 2 and a total length that matches the file. */
export function glbHeaderOk(head: Uint8Array, size: number): boolean {
  if (head.length < 12) return false;
  const v = new DataView(head.buffer, head.byteOffset, 12);
  return v.getUint32(4, true) === 2 && v.getUint32(8, true) === size;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < MB) return `${Math.round(n / 1024)} KB`;
  return `${(n / MB).toFixed(n < 10 * MB ? 1 : 0)} MB`;
}
