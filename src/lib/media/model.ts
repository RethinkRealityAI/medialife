/**
 * The Media Library (/admin/media): a site-wide hub for videos, images, audio,
 * 3D models, documents, fonts and data files, organised so people and agents
 * can find and reuse them.
 *
 * Client-safe: types, constants, labels and pure helpers only (no storage, no
 * secrets). The server code is in *.server.ts; the admin page calls the
 * server functions in admin.functions.ts and the HTTP endpoints below.
 *
 * Organisation (the Creator Hub library's model, plus structured fields):
 *   - kind: what the file is (video, image, audio, 3D…), from its type. Fixed.
 *   - client: who it belongs to (EVADE, MEDIALIFE, Sakamoto Days…). Free text.
 *   - collection: the group it belongs in ("Cola Run gameplay"). Free text.
 *   - purpose: what it's for (marketing, gameplay, product shot…).
 *   - tags: free-form, compared case-insensitively.
 *   - orientation / aspect: from the dimensions.
 *   - description (alt text), usage notes, rights / source, AI-generated flag.
 *   - public: private by default; public files get a stable /m/<id>/<name> URL.
 *
 * Endpoints (admin cookie, or `Authorization: Bearer $MEDIA_API_TOKEN` for reads):
 *   GET  /api/media/index.json   the catalogue as JSON (filters: q, tags, type, …)
 *   GET  /api/media/llms.txt     the same as Markdown, for LLMs
 *   GET  /api/media/files/:id    the file (Range; ?download=1 for attachment)
 *   GET  /api/media/thumbs/:id   the thumbnail / poster frame
 *   GET  /m/:id/:filename        a public file, no auth, cacheable, Range
 * Uploads (admin cookie + "x-media: 1" only; a token never writes):
 *   POST /api/media/uploads → PUT /api/media/uploads/:id/chunks/:n →
 *   POST /api/media/uploads/:id/complete, PUT /api/media/uploads/:id/thumb,
 *   GET|DELETE /api/media/uploads/:id
 */
import { HUB } from "@/lib/hub/model";

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;

export const MEDIA = {
  name: "Media Library",
  adminPath: "/admin/media",
  /** Per file. Chunks are separate blobs, so this is a sanity limit, not a storage one. */
  maxFileBytes: 5 * GiB,
  /** Above this the uploader suggests a 1080p web export. */
  warnFileBytes: 1 * GiB,
  /** Same chunk size as the Creator Hub: keeps each request under Netlify's 6 MB body limit. */
  chunkBytes: HUB.chunkBytes,
  /** Largest single download response; players and downloads page through with Range. */
  maxResponseBytes: HUB.maxResponseBytes,
  /** Thumbnails / poster frames (client-made JPEG, PNG or WebP). */
  maxThumbBytes: 2 * MiB,
  /** An upload left unfinished this long is cleared. */
  staleUploadMs: 7 * 24 * 60 * 60 * 1000,
  /** How many records index.json returns per page by default, and at most. */
  pageSize: 500,
  maxPageSize: 5000,
  limits: {
    title: 200,
    description: 2000,
    usageNotes: 1000,
    rights: 200,
    client: 60,
    collection: 80,
    uploader: 80,
    tag: 40,
    tagsPerAsset: 40,
  },
} as const;

/* ---------------------------------------------------------------------------
   Kinds and file types
   --------------------------------------------------------------------------- */

export const MEDIA_KINDS = [
  "video",
  "image",
  "audio",
  "model",
  "document",
  "archive",
  "font",
  "data",
] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const MEDIA_KIND_LABELS: Record<MediaKind, string> = {
  video: "Video",
  image: "Image",
  audio: "Audio",
  model: "3D model",
  document: "PDF",
  archive: "Archive",
  font: "Font",
  data: "Data / text",
};

export const MEDIA_KIND_PLURAL: Record<MediaKind, string> = {
  video: "Videos",
  image: "Images",
  audio: "Audio",
  model: "3D",
  document: "PDFs",
  archive: "Archives",
  font: "Fonts",
  data: "Data",
};

type TypeInfo = { ext: string[]; kind: MediaKind };

/** Everything the library accepts, by the MIME type it's stored and served as. */
export const MEDIA_TYPES: Record<string, TypeInfo> = {
  "video/mp4": { ext: ["mp4", "m4v"], kind: "video" },
  "video/quicktime": { ext: ["mov"], kind: "video" },
  "video/webm": { ext: ["webm"], kind: "video" },
  "image/jpeg": { ext: ["jpg", "jpeg"], kind: "image" },
  "image/png": { ext: ["png"], kind: "image" },
  "image/webp": { ext: ["webp"], kind: "image" },
  "image/gif": { ext: ["gif"], kind: "image" },
  "image/avif": { ext: ["avif"], kind: "image" },
  "image/svg+xml": { ext: ["svg"], kind: "image" },
  "image/heic": { ext: ["heic", "heif"], kind: "image" },
  "audio/mpeg": { ext: ["mp3"], kind: "audio" },
  "audio/wav": { ext: ["wav"], kind: "audio" },
  "audio/mp4": { ext: ["m4a"], kind: "audio" },
  "audio/aac": { ext: ["aac"], kind: "audio" },
  "audio/ogg": { ext: ["ogg", "oga"], kind: "audio" },
  "model/gltf-binary": { ext: ["glb"], kind: "model" },
  "model/gltf+json": { ext: ["gltf"], kind: "model" },
  "model/vnd.usdz+zip": { ext: ["usdz"], kind: "model" },
  "application/pdf": { ext: ["pdf"], kind: "document" },
  "application/zip": { ext: ["zip"], kind: "archive" },
  "font/otf": { ext: ["otf"], kind: "font" },
  "font/ttf": { ext: ["ttf"], kind: "font" },
  "font/woff": { ext: ["woff"], kind: "font" },
  "font/woff2": { ext: ["woff2"], kind: "font" },
  "application/json": { ext: ["json"], kind: "data" },
  "text/csv": { ext: ["csv"], kind: "data" },
  "text/plain": { ext: ["txt"], kind: "data" },
  "text/markdown": { ext: ["md"], kind: "data" },
};

/** For <input accept>. */
export const MEDIA_ACCEPT = Object.values(MEDIA_TYPES)
  .flatMap((t) => t.ext.map((e) => `.${e}`))
  .join(",");

/** "MP4, MOV, WEBM…" for help text. */
export const MEDIA_EXTENSIONS = Object.values(MEDIA_TYPES).flatMap((t) => t.ext);

export const extOf = (name: string) =>
  name.includes(".") ? (name.split(".").pop() ?? "").toLowerCase() : "";

/**
 * The MIME type to store, from the name's extension (browsers report video,
 * 3D and font types unreliably). Null when the library doesn't take it.
 */
export function resolveMediaMime(name: string, mime = ""): string | null {
  const ext = extOf(name);
  if (!ext) return null;
  const m = mime.split(";")[0].trim().toLowerCase();
  if (MEDIA_TYPES[m]?.ext.includes(ext)) return m;
  for (const [t, info] of Object.entries(MEDIA_TYPES)) if (info.ext.includes(ext)) return t;
  return null;
}

export const kindOf = (mime: string): MediaKind => MEDIA_TYPES[mime]?.kind ?? "data";

/** Types a browser would run as a document if served inline without a sandbox. */
export const RISKY_TYPES = new Set(["image/svg+xml"]);

/* ---------------------------------------------------------------------------
   Magic bytes
   --------------------------------------------------------------------------- */

/** How many leading bytes the server reads for sniffMedia(). */
export const SNIFF_BYTES = 4096;

const HEIF_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"];
const AVIF_BRANDS = ["avif", "avis"];
const QT_ATOMS = ["ftyp", "moov", "wide", "mdat", "free", "skip", "pnot"];
const HTML_START = /^\s*<(!doctype\s+html|html|head|body|script|iframe|meta|title|object|embed)\b/i;

function ascii(head: Uint8Array, i: number, n: number) {
  return String.fromCharCode(...head.subarray(i, i + n));
}

/** The brands in an ISO-BMFF ftyp box (MP4, MOV, M4A, HEIC, AVIF). */
function ftypBrands(head: Uint8Array): string[] | null {
  if (head.length < 12 || ascii(head, 4, 4) !== "ftyp") return null;
  const size = ((head[0] << 24) | (head[1] << 16) | (head[2] << 8) | head[3]) >>> 0;
  const end = Math.min(head.length, size >= 16 ? size : 16);
  const brands = [ascii(head, 8, 4)];
  for (let i = 16; i + 4 <= end; i += 4) brands.push(ascii(head, i, 4));
  return brands;
}

/** Leading bytes as text, or null when they look binary (NUL bytes, invalid UTF-8). */
export function headAsText(head: Uint8Array): string | null {
  if (head.includes(0)) return null;
  // the head may end part-way through a multi-byte character
  for (let cut = 0; cut <= 3 && cut < head.length; cut++) {
    try {
      const s = new TextDecoder("utf-8", { fatal: true }).decode(
        head.subarray(0, head.length - cut),
      );
      return s.replace(/^\uFEFF/, "");
    } catch {
      /* try a shorter slice */
    }
  }
  return null;
}

/**
 * Magic-byte check on the first bytes of an upload (up to SNIFF_BYTES), so a
 * renamed file can't pose as something else, and nothing HTML-like gets in.
 */
export function sniffMedia(mime: string, head: Uint8Array): boolean {
  if (!head.length) return false;
  const at = (i: number, bytes: number[]) => bytes.every((b, k) => head[i + k] === b);
  const brands = () => ftypBrands(head);
  switch (mime) {
    case "video/mp4":
    case "audio/mp4":
      return brands() !== null;
    case "video/quicktime":
      return QT_ATOMS.includes(ascii(head, 4, 4));
    case "video/webm":
      return at(0, [0x1a, 0x45, 0xdf, 0xa3]);
    case "image/jpeg":
      return at(0, [0xff, 0xd8, 0xff]);
    case "image/png":
      return at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      return ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 4) === "WEBP";
    case "image/gif":
      return ascii(head, 0, 4) === "GIF8";
    case "image/avif":
      return brands()?.some((b) => AVIF_BRANDS.includes(b)) ?? false;
    case "image/heic":
      return (
        brands()?.some((b) => HEIF_BRANDS.includes(b) || b === "mif1" || b === "msf1") ?? false
      );
    case "image/svg+xml": {
      const t = headAsText(head);
      return !!t && !HTML_START.test(t) && /<svg[\s>]/i.test(t);
    }
    case "audio/mpeg":
      return ascii(head, 0, 3) === "ID3" || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0);
    case "audio/aac":
      return (
        ascii(head, 0, 3) === "ID3" ||
        ascii(head, 0, 4) === "ADIF" ||
        (head[0] === 0xff && (head[1] & 0xf6) === 0xf0)
      );
    case "audio/wav":
      return ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 4) === "WAVE";
    case "audio/ogg":
      return ascii(head, 0, 4) === "OggS";
    case "model/gltf-binary":
      return ascii(head, 0, 4) === "glTF";
    case "model/gltf+json":
    case "application/json": {
      const t = headAsText(head);
      return !!t && /^\s*[[{]/.test(t);
    }
    case "model/vnd.usdz+zip":
      return at(0, [0x50, 0x4b, 0x03, 0x04]);
    case "application/zip":
      return at(0, [0x50, 0x4b]) && [0x03, 0x05, 0x07].includes(head[2]);
    case "application/pdf":
      return ascii(head, 0, 1024).includes("%PDF-");
    case "font/otf":
    case "font/ttf":
      return (
        at(0, [0x00, 0x01, 0x00, 0x00]) || ["OTTO", "true", "ttcf"].includes(ascii(head, 0, 4))
      );
    case "font/woff":
      return ascii(head, 0, 4) === "wOFF";
    case "font/woff2":
      return ascii(head, 0, 4) === "wOF2";
    case "text/csv":
    case "text/plain":
    case "text/markdown": {
      const t = headAsText(head);
      return t !== null && !HTML_START.test(t);
    }
    default:
      return false;
  }
}

/* ---------------------------------------------------------------------------
   Dimensions (server-side fallback when the browser couldn't read them)
   --------------------------------------------------------------------------- */

/** Width and height from the first bytes of a PNG, GIF, WebP, JPEG or SVG; null if unknown. */
export function imageSize(mime: string, b: Uint8Array): { width: number; height: number } | null {
  const u16be = (i: number) => (b[i] << 8) | b[i + 1];
  const u16le = (i: number) => b[i] | (b[i + 1] << 8);
  const u24le = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
  const u32be = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  const ok = (width: number, height: number) =>
    width > 0 && height > 0 && width < 100_000 && height < 100_000 ? { width, height } : null;
  try {
    if (mime === "image/png" && b.length >= 24) return ok(u32be(16), u32be(20));
    if (mime === "image/gif" && b.length >= 10) return ok(u16le(6), u16le(8));
    if (mime === "image/webp" && b.length >= 30) {
      const chunk = ascii(b, 12, 4);
      if (chunk === "VP8 ") return ok(u16le(26) & 0x3fff, u16le(28) & 0x3fff);
      if (chunk === "VP8L") {
        const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
        return ok((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
      }
      if (chunk === "VP8X") return ok(u24le(24) + 1, u24le(27) + 1);
      return null;
    }
    if (mime === "image/jpeg") {
      let i = 2;
      while (i + 8 < b.length) {
        if (b[i] !== 0xff) {
          i++;
          continue;
        }
        const marker = b[i + 1];
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          i += 2;
          continue;
        }
        const len = u16be(i + 2);
        const sof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
        if (sof) return ok(u16be(i + 7), u16be(i + 5));
        i += 2 + len;
      }
      return null;
    }
    if (mime === "image/svg+xml") {
      const t = headAsText(b.subarray(0, SNIFF_BYTES));
      const tag = t?.match(/<svg\b[^>]*>/i)?.[0];
      if (!tag) return null;
      const num = (attr: string) => {
        const m = tag.match(
          new RegExp(`\\b${attr}\\s*=\\s*["']\\s*([\\d.]+)\\s*(px)?\\s*["']`, "i"),
        );
        return m ? Math.round(Number(m[1])) : null;
      };
      const w = num("width");
      const h = num("height");
      if (w && h) return ok(w, h);
      const vb = tag.match(
        /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i,
      );
      return vb ? ok(Math.round(Number(vb[1])), Math.round(Number(vb[2]))) : null;
    }
  } catch {
    return null;
  }
  return null;
}

/* ---------------------------------------------------------------------------
   Classification
   --------------------------------------------------------------------------- */

export const MEDIA_PURPOSES = [
  "marketing",
  "gameplay",
  "product-shot",
  "logo-brand",
  "ugc",
  "3d-model",
  "audio",
  "doc",
  "other",
] as const;
export type MediaPurpose = (typeof MEDIA_PURPOSES)[number];

export const MEDIA_PURPOSE_LABELS: Record<MediaPurpose, string> = {
  marketing: "Marketing",
  gameplay: "Gameplay",
  "product-shot": "Product shot",
  "logo-brand": "Logo / brand",
  ugc: "UGC",
  "3d-model": "3D model",
  audio: "Audio",
  doc: "Document",
  other: "Other",
};

export type MediaOrientation = "landscape" | "portrait" | "square";
export const MEDIA_ORIENTATIONS: MediaOrientation[] = ["landscape", "portrait", "square"];
export const MEDIA_ORIENTATION_LABELS: Record<MediaOrientation, string> = {
  landscape: "Landscape",
  portrait: "Portrait",
  square: "Square",
};

export function orientationOf(
  width: number | null | undefined,
  height: number | null | undefined,
): MediaOrientation | null {
  if (!width || !height) return null;
  const r = width / height;
  if (r > 1.05) return "landscape";
  if (r < 0.95) return "portrait";
  return "square";
}

const RATIOS: [number, number][] = [
  [16, 9],
  [9, 16],
  [1, 1],
  [4, 5],
  [5, 4],
  [4, 3],
  [3, 4],
  [3, 2],
  [2, 3],
  [21, 9],
  [2, 1],
];

/** "16:9", "9:16", "1:1"… within 3%, else "1.87:1". Null without dimensions. */
export function aspectLabel(
  width: number | null | undefined,
  height: number | null | undefined,
): string | null {
  if (!width || !height) return null;
  const r = width / height;
  for (const [a, b] of RATIOS) if (Math.abs(r - a / b) / (a / b) < 0.03) return `${a}:${b}`;
  return r >= 1 ? `${r.toFixed(2)}:1` : `1:${(1 / r).toFixed(2)}`;
}

/** Suggestions for the client / property field; existing values are added to these. */
export const MEDIA_CLIENT_SUGGESTIONS = [
  "EVADE",
  "MEDIALIFE",
  "Sakamoto Days",
  "Monkey Quest",
  "Roblox",
];

/** Suggestions for rights / source. */
export const MEDIA_RIGHTS_SUGGESTIONS = [
  "Client-supplied",
  "Recorded in-house",
  "Created in-house",
  "Licensed stock",
  "Creator-submitted (UGC licence)",
  "Unknown: check before use",
];

/** Suggested tags for the tag picker, grouped. */
export const MEDIA_PRESET_TAGS: Record<string, string[]> = {
  Content: ["Gameplay", "Trailer", "B-roll", "Behind the scenes", "Tutorial", "Testimonial"],
  Brand: ["Logo", "Wordmark", "Key art", "Character", "Mascot", "Colour palette", "Typography"],
  Product: ["Merch", "Keychain", "Apparel", "Plush", "Packaging", "Mockup"],
  Format: ["Vertical", "Horizontal", "Transparent", "Loop", "Thumbnail", "Hero", "Poster"],
  Status: ["Final", "Draft", "Approved", "Needs review"],
};
const ALL_PRESET_TAGS = Object.values(MEDIA_PRESET_TAGS).flat();

/**
 * Rules agents and people must follow for a client's assets. Shown in the
 * detail drawer and carried on every catalogue record as `clientPolicy`.
 */
export const MEDIA_CLIENT_POLICIES: { match: RegExp; text: string }[] = [
  {
    match: /^evade\b/i,
    text: "EVADE forbids image-to-image and image-to-3D generation from its assets. Never feed these files into a generative model as a reference or source.",
  },
];

export function clientPolicy(client: string): string | null {
  const c = client.trim();
  return c ? (MEDIA_CLIENT_POLICIES.find((p) => p.match.test(c))?.text ?? null) : null;
}

/** A best guess at purpose and tags for a new upload, from its name and kind. */
export function suggestPurpose(name: string, kind: MediaKind): MediaPurpose | null {
  const n = name.toLowerCase();
  if (kind === "model") return "3d-model";
  if (kind === "audio") return "audio";
  if (kind === "document" || kind === "data") return "doc";
  if (/logo|wordmark|brand|lockup|icon/.test(n)) return "logo-brand";
  if (/gameplay|game.?play|footage|clip|run\b/.test(n)) return "gameplay";
  if (/ugc|creator|submission/.test(n)) return "ugc";
  if (/product|merch|mockup|keychain|tee|hoodie|plush|charm/.test(n)) return "product-shot";
  if (/poster|banner|hero|og|card|splash|promo|ad\b|social/.test(n)) return "marketing";
  return null;
}

/* ---------------------------------------------------------------------------
   Records
   --------------------------------------------------------------------------- */

export type MediaStorageKind = "blobs" | "r2";
export type MediaStorageRef = { kind: MediaStorageKind; key: string };

export type MediaAsset = {
  id: string;
  /** The original file name (with extension). */
  name: string;
  title: string;
  mime: string;
  kind: MediaKind;
  size: number;
  chunks: number;
  storage: MediaStorageRef;
  width: number | null;
  height: number | null;
  durationS: number | null;
  /** Average colour of the thumbnail, "#rrggbb". */
  color: string | null;
  thumb: { key: string; mime: string; size: number } | null;
  tags: string[];
  client: string;
  collection: string;
  purpose: MediaPurpose | null;
  /** Description / alt text. */
  description: string;
  usageNotes: string;
  /** Rights / source ("Client-supplied", "Recorded in-house"…). */
  rights: string;
  aiGenerated: boolean;
  public: boolean;
  uploader: string;
  fingerprint: string | null;
  complete: boolean;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  /** Loaded by the dev seed. */
  sample?: boolean;
};

/** What the admin page receives: the record without storage internals, plus URLs. */
export type MediaAssetView = Omit<MediaAsset, "storage" | "chunks" | "thumb" | "fingerprint"> & {
  aspect: string | null;
  orientation: MediaOrientation | null;
  hasThumb: boolean;
  /** Same-origin, admin-cookie URLs. */
  fileUrl: string;
  downloadUrl: string;
  thumbUrl: string | null;
  /** /m/<id>/<name> when public, else null. */
  publicPath: string | null;
  clientPolicy: string | null;
};

/** A URL-safe version of the file name for the public URL. */
export function publicFileName(name: string): string {
  const ext = extOf(name);
  const base = (ext ? name.slice(0, -(ext.length + 1)) : name)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const safe = base && base !== "poster" ? base : `${base || "file"}-file`;
  return ext ? `${safe}.${ext}` : safe;
}

export const mediaFileUrl = (id: string, download = false) =>
  `/api/media/files/${id}${download ? "?download=1" : ""}`;
export const mediaThumbUrl = (a: Pick<MediaAsset, "id" | "thumb">) =>
  a.thumb ? `/api/media/thumbs/${a.id}?v=${a.thumb.size}` : null;
export const mediaPublicPath = (a: Pick<MediaAsset, "id" | "name">) =>
  `/m/${a.id}/${publicFileName(a.name)}`;

export function mediaView(a: MediaAsset): MediaAssetView {
  const {
    storage: _storage,
    chunks: _chunks,
    thumb: _thumb,
    fingerprint: _fingerprint,
    ...rest
  } = a;
  return {
    ...rest,
    aspect: aspectLabel(a.width, a.height),
    orientation: orientationOf(a.width, a.height),
    hasThumb: !!a.thumb,
    fileUrl: mediaFileUrl(a.id),
    downloadUrl: mediaFileUrl(a.id, true),
    thumbUrl: mediaThumbUrl(a),
    publicPath: a.public && a.complete ? mediaPublicPath(a) : null,
    clientPolicy: clientPolicy(a.client),
  };
}

/** The picture to show for an asset in a grid: its thumbnail, or the image itself. */
export function previewSrc(
  a: Pick<MediaAssetView, "thumbUrl" | "kind" | "mime" | "fileUrl" | "size">,
) {
  if (a.thumbUrl) return a.thumbUrl;
  if (a.kind === "image" && a.mime !== "image/heic" && a.size <= 8 * MiB) return a.fileUrl;
  return null;
}

/* ---------------------------------------------------------------------------
   Text fields and tags
   --------------------------------------------------------------------------- */

const printable = (s: string, keepNewlines = false) =>
  Array.from(s)
    .filter((c) => {
      const n = c.charCodeAt(0);
      return (n >= 32 && n !== 127) || (keepNewlines && (c === "\n" || c === "\t"));
    })
    .join("");

/** One line: trimmed, single spaces, capped. */
export const cleanLine = (s: string, max: number) =>
  printable(s).replace(/\s+/g, " ").trim().slice(0, max);

/** Several lines: trimmed, at most two blank lines in a row, capped. */
export const cleanText = (s: string, max: number) =>
  printable(s.replace(/\r\n?/g, "\n"), true)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);

export function cleanTag(raw: string): string {
  return printable(raw)
    .replace(/[#,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MEDIA.limits.tag);
}
export const tagKey = (t: string) => cleanTag(t).toLowerCase();

/** Unique by key, preset spelling preferred, capped. */
export function normaliseTags(tags: readonly string[], known: readonly string[] = []): string[] {
  const out = new Map<string, string>();
  const spellings = [...ALL_PRESET_TAGS, ...known];
  for (const raw of tags) {
    const t = cleanTag(raw);
    if (!t) continue;
    const k = t.toLowerCase();
    if (out.has(k)) continue;
    out.set(k, spellings.find((p) => p.toLowerCase() === k) ?? t);
    if (out.size >= MEDIA.limits.tagsPerAsset) break;
  }
  return [...out.values()];
}

/** An existing spelling of a free-text value (client, collection), so "evade" files under "EVADE". */
export function canonicalValue(value: string, existing: readonly string[]): string {
  const v = value.trim();
  if (!v) return "";
  return existing.find((e) => e.toLowerCase() === v.toLowerCase()) ?? v;
}

/** "Cola_Run-gameplay_01.mp4" → "Cola Run gameplay 01". */
export function titleFromName(name: string): string {
  const ext = extOf(name);
  const base = ext ? name.slice(0, -(ext.length + 1)) : name;
  const t = base
    .replace(/[_]+/g, " ")
    .replace(/\s*-\s*/g, " – ")
    .replace(/\s+/g, " ")
    .trim();
  return cleanLine(t.replace(/ – /g, " ") || name, MEDIA.limits.title);
}

/* ---------------------------------------------------------------------------
   Editing
   --------------------------------------------------------------------------- */

export type MediaPatch = {
  title?: string;
  description?: string;
  usageNotes?: string;
  rights?: string;
  client?: string;
  collection?: string;
  purpose?: MediaPurpose | null;
  aiGenerated?: boolean;
  public?: boolean;
  setTags?: string[];
  addTags?: string[];
  removeTags?: string[];
};

export type MediaKnown = { clients: string[]; collections: string[]; tags: string[] };

/** The record after a patch. `known` keeps one spelling of each client, collection and tag. */
export function applyMediaPatch(
  a: MediaAsset,
  p: MediaPatch,
  known: MediaKnown = { clients: [], collections: [], tags: [] },
  now = Date.now(),
): MediaAsset {
  const L = MEDIA.limits;
  const next: MediaAsset = { ...a };
  if (p.title !== undefined) next.title = cleanLine(p.title, L.title) || titleFromName(a.name);
  if (p.description !== undefined) next.description = cleanText(p.description, L.description);
  if (p.usageNotes !== undefined) next.usageNotes = cleanText(p.usageNotes, L.usageNotes);
  if (p.rights !== undefined) next.rights = cleanLine(p.rights, L.rights);
  if (p.client !== undefined)
    next.client = canonicalValue(cleanLine(p.client, L.client), known.clients);
  if (p.collection !== undefined)
    next.collection = canonicalValue(cleanLine(p.collection, L.collection), known.collections);
  if (p.purpose !== undefined) next.purpose = p.purpose;
  if (p.aiGenerated !== undefined) next.aiGenerated = p.aiGenerated;
  if (p.public !== undefined) next.public = p.public;
  if (p.setTags || p.addTags || p.removeTags) {
    const removing = new Set((p.removeTags ?? []).map(tagKey));
    next.tags = normaliseTags(
      [...(p.setTags ?? a.tags), ...(p.addTags ?? [])].filter((t) => !removing.has(tagKey(t))),
      known.tags,
    );
  }
  next.updatedAt = now;
  return next;
}

/* ---------------------------------------------------------------------------
   Search, filters, sort, facets (the page and index.json share these)
   --------------------------------------------------------------------------- */

export const MEDIA_SORTS = {
  relevance: "Best match",
  new: "Newest first",
  old: "Oldest first",
  updated: "Recently edited",
  title: "Title A–Z",
  size: "Largest first",
  duration: "Longest first",
} as const;
export type MediaSort = keyof typeof MEDIA_SORTS;

export type MediaQuery = {
  /** Words, all of which must appear in title, file name, tags, description, client, collection, notes or rights. */
  q?: string;
  /** Every tag must be on the asset. */
  tags?: string[];
  kind?: MediaKind;
  collection?: string;
  client?: string;
  purpose?: MediaPurpose;
  public?: boolean;
  aiGenerated?: boolean;
  orientation?: MediaOrientation;
  sort?: MediaSort;
};

type Searchable = Pick<
  MediaAsset,
  | "title"
  | "name"
  | "tags"
  | "description"
  | "client"
  | "collection"
  | "usageNotes"
  | "rights"
  | "purpose"
  | "kind"
  | "mime"
  | "public"
  | "aiGenerated"
  | "width"
  | "height"
  | "size"
  | "durationS"
  | "createdAt"
  | "updatedAt"
>;

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const queryWords = (q: string | undefined) =>
  fold(q ?? "")
    .split(/[\s,]+/)
    .map((w) => w.replace(/^["']|["']$/g, ""))
    .filter(Boolean)
    .slice(0, 12);

function haystack(a: Searchable) {
  return fold(
    [
      a.title,
      a.name,
      a.tags.join(" "),
      a.description,
      a.client,
      a.collection,
      a.usageNotes,
      a.rights,
      a.purpose ? MEDIA_PURPOSE_LABELS[a.purpose] : "",
      MEDIA_KIND_LABELS[a.kind],
      extOf(a.name),
    ].join("\n"),
  );
}

/** How well an asset matches the words; 0 = not at all (some word missing). */
export function matchScore(a: Searchable, words: string[]): number {
  if (!words.length) return 1;
  const all = haystack(a);
  const title = fold(`${a.title} ${a.name}`);
  const tags = a.tags.map(fold);
  const meta = fold(`${a.client} ${a.collection}`);
  let score = 0;
  for (const w of words) {
    if (!all.includes(w)) return 0;
    score += 1;
    if (title.includes(w)) score += 3;
    if (tags.some((t) => t === w)) score += 4;
    else if (tags.some((t) => t.includes(w))) score += 2;
    if (meta.includes(w)) score += 2;
  }
  return score;
}

const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function matchesFilters(a: Searchable, f: MediaQuery): boolean {
  if (f.kind && a.kind !== f.kind) return false;
  if (f.client !== undefined && !eq(a.client, f.client)) return false;
  if (f.collection !== undefined && !eq(a.collection, f.collection)) return false;
  if (f.purpose && a.purpose !== f.purpose) return false;
  if (f.public !== undefined && a.public !== f.public) return false;
  if (f.aiGenerated !== undefined && a.aiGenerated !== f.aiGenerated) return false;
  if (f.orientation && orientationOf(a.width, a.height) !== f.orientation) return false;
  if (f.tags?.length) {
    const have = new Set(a.tags.map(tagKey));
    if (!f.tags.every((t) => have.has(tagKey(t)))) return false;
  }
  return true;
}

/** Filters, searches and sorts. Relevance is the default sort when there are words. */
export function searchMedia<T extends Searchable>(list: readonly T[], f: MediaQuery): T[] {
  const words = queryWords(f.q);
  const scored: { a: T; s: number }[] = [];
  for (const a of list) {
    if (!matchesFilters(a, f)) continue;
    const s = matchScore(a, words);
    if (s > 0) scored.push({ a, s });
  }
  const sort: MediaSort = f.sort ?? (words.length ? "relevance" : "new");
  const by: Record<MediaSort, (x: { a: T; s: number }, y: { a: T; s: number }) => number> = {
    relevance: (x, y) => y.s - x.s || y.a.createdAt - x.a.createdAt,
    new: (x, y) => y.a.createdAt - x.a.createdAt,
    old: (x, y) => x.a.createdAt - y.a.createdAt,
    updated: (x, y) => y.a.updatedAt - x.a.updatedAt,
    title: (x, y) => x.a.title.localeCompare(y.a.title, "en", { sensitivity: "base" }),
    size: (x, y) => y.a.size - x.a.size,
    duration: (x, y) => (y.a.durationS ?? -1) - (x.a.durationS ?? -1),
  };
  return scored.sort(by[sort] ?? by.new).map((x) => x.a);
}

export type MediaFacets = {
  total: number;
  kinds: Partial<Record<MediaKind, number>>;
  clients: { value: string; count: number }[];
  collections: { value: string; count: number }[];
  tags: { value: string; count: number }[];
  purposes: Partial<Record<MediaPurpose, number>>;
  publicCount: number;
  aiCount: number;
  totalBytes: number;
};

function countBy(values: string[]) {
  const m = new Map<string, { value: string; count: number }>();
  for (const v of values) {
    if (!v.trim()) continue;
    const k = v.toLowerCase();
    const cur = m.get(k);
    if (cur) cur.count++;
    else m.set(k, { value: v, count: 1 });
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export function mediaFacets(list: readonly Searchable[]): MediaFacets {
  const kinds: MediaFacets["kinds"] = {};
  const purposes: MediaFacets["purposes"] = {};
  let publicCount = 0;
  let aiCount = 0;
  let totalBytes = 0;
  for (const a of list) {
    kinds[a.kind] = (kinds[a.kind] ?? 0) + 1;
    if (a.purpose) purposes[a.purpose] = (purposes[a.purpose] ?? 0) + 1;
    if (a.public) publicCount++;
    if (a.aiGenerated) aiCount++;
    totalBytes += a.size;
  }
  return {
    total: list.length,
    kinds,
    clients: countBy(list.map((a) => a.client)),
    collections: countBy(list.map((a) => a.collection)),
    tags: countBy(list.flatMap((a) => a.tags)),
    purposes,
    publicCount,
    aiCount,
    totalBytes,
  };
}

/* ---------------------------------------------------------------------------
   Formatting
   --------------------------------------------------------------------------- */

/** "1.4 GB", "820 MB", "12 KB". */
export function formatBytes(n: number): string {
  if (n >= GiB) return `${(n / GiB).toFixed(n >= 10 * GiB ? 0 : 1)} GB`;
  if (n >= MiB) return `${(n / MiB).toFixed(n >= 10 * MiB ? 0 : 1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

/** 42 → "0:42", 3725 → "1:02:05". */
export function formatDuration(s: number | null | undefined): string | null {
  if (s == null || !Number.isFinite(s)) return null;
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

const escAttr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The HTML to embed a public asset (`<video>`, `<img>`, `<audio>` or a link). */
export function embedSnippet(
  a: Pick<
    MediaAssetView,
    "kind" | "mime" | "width" | "height" | "description" | "title" | "name" | "hasThumb" | "id"
  >,
  url: string,
  origin = "",
): string {
  const size = a.width && a.height ? ` width="${a.width}" height="${a.height}"` : "";
  const alt = escAttr(a.description || a.title);
  if (a.kind === "video") {
    const poster = a.hasThumb ? ` poster="${origin}/api/media/thumbs/${a.id}"` : "";
    return `<video src="${url}"${poster}${size} controls playsinline preload="metadata"></video>`;
  }
  if (a.kind === "image")
    return `<img src="${url}" alt="${alt}"${size} loading="lazy" decoding="async">`;
  if (a.kind === "audio") return `<audio src="${url}" controls preload="metadata"></audio>`;
  return `<a href="${url}" download>${escAttr(a.title || a.name)}</a>`;
}
