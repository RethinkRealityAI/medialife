import { z } from "zod";

import { parseRange } from "@/lib/ar/assets.server";

import { json, mediaReader, noStore, readGuard, writeGuard } from "./auth.server";
import { deleteAssets, getAsset, knownValues, listAssets, saveAsset } from "./data.server";
import {
  MEDIA,
  MEDIA_PURPOSES,
  SNIFF_BYTES,
  applyMediaPatch,
  cleanLine,
  formatBytes,
  imageSize,
  kindOf,
  mediaView,
  resolveMediaMime,
  sniffMedia,
  suggestPurpose,
  titleFromName,
  type MediaAsset,
  type MediaAssetView,
  type MediaStorageRef,
} from "./model";
import { configuredMediaStorage, mediaStorage, type UploadPlan } from "./storage.server";
import { newId, type MediaNamespace } from "./store.server";

// Uploads and downloads for the Media Library: the Creator Hub's resumable
// chunk pipeline (src/lib/hub/files.server.ts, src/lib/ugc/uploads.server.ts)
// with the library's own types, no quota, and a storage adapter in between.
//
// HTTP contract (JSON unless noted). Writes need the admin cookie and
// "x-media: 1"; the read-only API token is refused on all of them.
//   POST   /api/media/uploads                 init (body: InitBody) → 201 InitResult
//   GET    /api/media/uploads/:id             → UploadStatus (chunks received, for resume)
//   PUT    /api/media/uploads/:id/chunks/:n   raw bytes (exactly chunkSize, the last one shorter) → 204
//   POST   /api/media/uploads/:id/complete    → { asset }
//   PUT    /api/media/uploads/:id/thumb       raw JPEG/PNG/WebP ≤ 2 MB → { thumbUrl }
//   DELETE /api/media/uploads/:id             cancel an unfinished upload → 204
// Reads (admin cookie or bearer token):
//   GET    /api/media/files/:id[?download=1]  Range
//   GET    /api/media/thumbs/:id              (no auth needed when the asset is public)
// Public (no auth, only while the asset is public):
//   GET    /m/:id/:filename                   Range, cacheable, CORS *

const str = (max: number) => z.string().max(max * 2);

export const initSchema = z.object({
  name: z.string().min(1).max(300),
  size: z.number().int().positive(),
  mime: z.string().max(120).default(""),
  title: str(MEDIA.limits.title).optional(),
  description: str(MEDIA.limits.description).optional(),
  usageNotes: str(MEDIA.limits.usageNotes).optional(),
  rights: str(MEDIA.limits.rights).optional(),
  client: str(MEDIA.limits.client).optional(),
  collection: str(MEDIA.limits.collection).optional(),
  purpose: z.enum(MEDIA_PURPOSES).nullable().optional(),
  tags: z
    .array(z.string().max(MEDIA.limits.tag * 2))
    .max(MEDIA.limits.tagsPerAsset * 2)
    .optional(),
  aiGenerated: z.boolean().optional(),
  public: z.boolean().optional(),
  uploader: str(MEDIA.limits.uploader).optional(),
  width: z.number().int().positive().max(100_000).nullable().optional(),
  height: z.number().int().positive().max(100_000).nullable().optional(),
  durationS: z
    .number()
    .nonnegative()
    .max(48 * 3600)
    .nullable()
    .optional(),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .nullable()
    .optional(),
  fingerprint: z
    .string()
    .regex(/^[a-f0-9]{16,128}$/)
    .nullable()
    .optional(),
});
export type InitBody = z.input<typeof initSchema>;

export type InitResult = {
  id: string;
  plan: UploadPlan;
  /** Shortcuts for plan.mode === "chunks". */
  chunkSize: number;
  chunks: number;
  /** A gentle note for files over MEDIA.warnFileBytes. */
  warning: string | null;
};

export type UploadStatus = {
  id: string;
  name: string;
  size: number;
  chunkSize: number;
  chunks: number;
  received: number[];
  complete: boolean;
};

function cleanName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "file";
  return cleanLine(base, 160) || "file";
}

const NOT_WHAT_IT_SAYS =
  "That file doesn't look like what its name says (its first bytes don't match the type). Export it again or check the extension.";

export const bigFileWarning = (size: number) =>
  size > MEDIA.warnFileBytes
    ? `This file is ${formatBytes(size)}. It will upload fine, but a 1080p web export (H.264, ~10 Mbps) is usually under 1 GB and plays faster on the site.`
    : null;

/* ---------------------------------------------------------------------------
   Init
   --------------------------------------------------------------------------- */

export async function initUpload(ns: MediaNamespace, request: Request, body: unknown) {
  const denied = await writeGuard(request);
  if (denied) return denied;
  if (body === undefined) return json({ error: "invalid JSON" }, 400);
  const parsed = initSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "invalid" }, 400);
  const d = parsed.data;
  if (d.size > MEDIA.maxFileBytes)
    return json(
      {
        error: `That file is ${formatBytes(d.size)}. Files can be up to ${formatBytes(MEDIA.maxFileBytes)}; export it at 1080p for the web to make it smaller.`,
      },
      413,
    );
  const mime = resolveMediaMime(d.name, d.mime);
  if (!mime)
    return json(
      {
        error:
          "That file type isn't supported. Upload video, images, audio, 3D (GLB, glTF, USDZ), PDF, ZIP, fonts, or JSON/CSV/TXT/MD.",
      },
      415,
    );
  const id = newId(10);
  const kind = configuredMediaStorage();
  const storage = mediaStorage(ns, kind);
  const ref: MediaStorageRef = { kind, key: `files/${id}` };
  const plan = await storage.plan(ref, d.size);
  const chunks = plan.mode === "chunks" ? plan.chunks : plan.parts;
  const now = Date.now();
  const name = cleanName(d.name);
  const assetKind = kindOf(mime);
  const blank: MediaAsset = {
    id,
    name,
    title: titleFromName(name),
    mime,
    kind: assetKind,
    size: d.size,
    chunks,
    storage: ref,
    width: d.width ?? null,
    height: d.height ?? null,
    durationS: d.durationS ?? null,
    color: d.color?.toLowerCase() ?? null,
    thumb: null,
    tags: [],
    client: "",
    collection: "",
    purpose: suggestPurpose(name, assetKind),
    description: "",
    usageNotes: "",
    rights: "",
    aiGenerated: false,
    public: false,
    uploader: cleanLine(d.uploader ?? "", MEDIA.limits.uploader) || "MEDIALIFE team",
    fingerprint: d.fingerprint ?? null,
    complete: false,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  const known = knownValues(await listAssets(ns));
  const asset = applyMediaPatch(
    blank,
    {
      title: d.title,
      description: d.description,
      usageNotes: d.usageNotes,
      rights: d.rights,
      client: d.client,
      collection: d.collection,
      purpose: d.purpose === undefined ? undefined : d.purpose,
      aiGenerated: d.aiGenerated,
      public: d.public,
      setTags: d.tags,
    },
    known,
    now,
  );
  await saveAsset(ns, asset);
  return json(
    {
      id,
      plan,
      chunkSize: plan.mode === "chunks" ? plan.chunkSize : 0,
      chunks,
      warning: bigFileWarning(d.size),
    } satisfies InitResult,
    201,
  );
}

/* ---------------------------------------------------------------------------
   Chunks, status, complete, cancel
   --------------------------------------------------------------------------- */

async function writable(ns: MediaNamespace, request: Request, id: string) {
  const denied = await writeGuard(request);
  if (denied) return denied;
  const a = await getAsset(ns, id);
  if (!a) return json({ error: "not found" }, 404);
  return a;
}

export async function putChunk(ns: MediaNamespace, request: Request, id: string, n: number) {
  const a = await writable(ns, request, id);
  if (a instanceof Response) return a;
  if (a.complete) return json({ error: "already complete" }, 409);
  if (!Number.isInteger(n) || n < 0 || n >= a.chunks)
    return json({ error: "bad chunk index" }, 400);
  const expected =
    n === a.chunks - 1 ? a.size - MEDIA.chunkBytes * (a.chunks - 1) : MEDIA.chunkBytes;
  const declared = Number(request.headers.get("content-length") ?? "NaN");
  if (Number.isFinite(declared) && declared !== expected)
    return json({ error: `chunk ${n} should be ${expected} bytes` }, 400);
  const buf = new Uint8Array(await request.arrayBuffer());
  if (buf.byteLength !== expected)
    return json({ error: `chunk ${n} should be ${expected} bytes` }, 400);
  if (n === 0 && !sniffMedia(a.mime, buf.subarray(0, SNIFF_BYTES))) {
    await deleteAssets(ns, [a]);
    return json({ error: NOT_WHAT_IT_SAYS }, 415);
  }
  await mediaStorage(ns, a.storage.kind).putChunk(a.storage, n, buf);
  return new Response(null, { status: 204, headers: noStore });
}

export async function uploadStatus(ns: MediaNamespace, request: Request, id: string) {
  const a = await writable(ns, request, id);
  if (a instanceof Response) return a;
  const received = a.complete
    ? Array.from({ length: a.chunks }, (_, i) => i)
    : [...(await mediaStorage(ns, a.storage.kind).receivedChunks(a.storage))].sort((x, y) => x - y);
  return json({
    id,
    name: a.name,
    size: a.size,
    chunkSize: MEDIA.chunkBytes,
    chunks: a.chunks,
    received,
    complete: a.complete,
  } satisfies UploadStatus);
}

export async function completeUpload(ns: MediaNamespace, request: Request, id: string) {
  const a = await writable(ns, request, id);
  if (a instanceof Response) return a;
  if (a.complete) return json({ asset: mediaView(a) });
  const storage = mediaStorage(ns, a.storage.kind);
  const got = await storage.receivedChunks(a.storage);
  for (let n = 0; n < a.chunks; n++)
    if (!got.has(n)) return json({ error: `chunk ${n} is missing`, missing: n }, 409);
  const head = await storage.readHead(a.storage, MEDIA.chunkBytes);
  if (!head || !sniffMedia(a.mime, head.subarray(0, SNIFF_BYTES))) {
    await deleteAssets(ns, [a]);
    return json({ error: NOT_WHAT_IT_SAYS }, 415);
  }
  // The browser reads dimensions at upload time; this covers files it couldn't decode.
  const dims = !a.width || !a.height ? imageSize(a.mime, head) : null;
  const now = Date.now();
  const done = await saveAsset(ns, {
    ...a,
    ...(dims ?? {}),
    complete: true,
    completedAt: now,
    updatedAt: now,
  });
  return json({ asset: mediaView(done) });
}

export async function cancelUpload(ns: MediaNamespace, request: Request, id: string) {
  const a = await writable(ns, request, id);
  if (a instanceof Response) return a.status === 404 ? new Response(null, { status: 204 }) : a;
  if (a.complete)
    return json({ error: "That upload is finished. Delete it from the library instead." }, 409);
  await deleteAssets(ns, [a]);
  return new Response(null, { status: 204, headers: noStore });
}

const THUMB_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function putThumb(ns: MediaNamespace, request: Request, id: string) {
  const a = await writable(ns, request, id);
  if (a instanceof Response) return a;
  const mime = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!THUMB_TYPES.includes(mime))
    return json({ error: "thumbnail must be JPEG, PNG or WebP" }, 415);
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MEDIA.maxThumbBytes) return json({ error: "thumbnail is too big" }, 413);
  const buf = new Uint8Array(await request.arrayBuffer());
  if (!buf.byteLength || buf.byteLength > MEDIA.maxThumbBytes)
    return json({ error: "thumbnail is empty or too big" }, 413);
  if (!sniffMedia(mime, buf.subarray(0, SNIFF_BYTES)))
    return json({ error: NOT_WHAT_IT_SAYS }, 415);
  const key = `thumbs/${id}`;
  await mediaStorage(ns, a.storage.kind).putObject(key, buf);
  // re-read: the upload may have completed meanwhile
  const cur = (await getAsset(ns, id)) ?? a;
  const saved = await saveAsset(ns, {
    ...cur,
    thumb: { key, mime, size: buf.byteLength },
    updatedAt: Date.now(),
  });
  return json({ thumbUrl: mediaView(saved).thumbUrl });
}

/* ---------------------------------------------------------------------------
   Downloads
   --------------------------------------------------------------------------- */

/** Served inline (anything else is an attachment unless embedded by a page). */
const INLINE =
  /^(image\/|video\/|audio\/|application\/pdf|application\/json|text\/|model\/|font\/)/;
const SANDBOX =
  "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox";

type ServeOpts = {
  download: boolean;
  head: boolean;
  range: string | null;
  ifNoneMatch?: string | null;
};

function contentType(mime: string) {
  return mime.startsWith("text/") || mime === "application/json" || mime === "model/gltf+json"
    ? `${mime}; charset=utf-8`
    : mime;
}

function fileResponse(
  ns: MediaNamespace,
  a: MediaAsset,
  opts: ServeOpts & { visibility: "public" | "private" },
) {
  const inline = !opts.download && INLINE.test(a.mime);
  const etag = `"${a.id}-${a.size}"`;
  const headers: Record<string, string> = {
    "content-type": contentType(a.mime),
    "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(a.name)}`,
    "x-content-type-options": "nosniff",
    "accept-ranges": "bytes",
    etag,
  };
  // SVGs and text are documents a browser would render: no scripts, no requests.
  if (a.mime !== "application/pdf") headers["content-security-policy"] = SANDBOX;
  if (opts.visibility === "public") {
    headers["cache-control"] = "public, max-age=3600";
    // Netlify's CDN keeps one copy; turning "Public" off stops it within the hour.
    headers["netlify-cdn-cache-control"] = "public, max-age=3600, durable";
    headers["access-control-allow-origin"] = "*";
    headers["access-control-expose-headers"] = "content-length, content-range, accept-ranges, etag";
    headers["cross-origin-resource-policy"] = "cross-origin";
    headers["x-robots-tag"] = "noindex";
  } else {
    headers["cache-control"] = "private, max-age=3600";
    headers["cross-origin-resource-policy"] = "same-origin";
  }
  if (opts.ifNoneMatch && opts.ifNoneMatch.split(",").some((t) => t.trim() === etag) && !opts.range)
    return new Response(null, { status: 304, headers });
  const range = parseRange(opts.range, a.size);
  if (range === "invalid")
    return new Response(null, {
      status: 416,
      headers: { ...headers, "content-range": `bytes */${a.size}` },
    });
  const start = range ? range.start : 0;
  // A range answer may be shorter than asked; clients ask again for the rest.
  const end = range ? Math.min(range.end, start + MEDIA.maxResponseBytes - 1) : a.size - 1;
  headers["content-length"] = String(end - start + 1);
  if (range) headers["content-range"] = `bytes ${start}-${end}/${a.size}`;
  const status = range ? 206 : 200;
  if (opts.head) return new Response(null, { status, headers });
  return new Response(mediaStorage(ns, a.storage.kind).stream(a.storage, start, end), {
    status,
    headers,
  });
}

/** An asset's file for the team or a token holder. */
export async function serveFile(ns: MediaNamespace, request: Request, id: string) {
  const c = await readGuard(request);
  if (c instanceof Response) return c;
  const a = await getAsset(ns, id);
  if (!a || !a.complete) return json({ error: "not found" }, 404);
  return fileResponse(ns, a, {
    download: new URL(request.url).searchParams.get("download") === "1",
    head: request.method.toUpperCase() === "HEAD",
    range: request.headers.get("range"),
    ifNoneMatch: request.headers.get("if-none-match"),
    visibility: "private",
  });
}

/** /m/<id>/<name>: public assets only; everything else is a plain 404. */
export async function servePublic(ns: MediaNamespace, request: Request, id: string) {
  const a = await getAsset(ns, id);
  if (!a || !a.complete || !a.public)
    return new Response("Not found", {
      status: 404,
      headers: { ...noStore, "content-type": "text/plain; charset=utf-8" },
    });
  return fileResponse(ns, a, {
    download: new URL(request.url).searchParams.get("download") === "1",
    head: request.method.toUpperCase() === "HEAD",
    range: request.headers.get("range"),
    ifNoneMatch: request.headers.get("if-none-match"),
    visibility: "public",
  });
}

/** The thumbnail / poster: public for public assets, otherwise team or token. */
export async function serveThumb(ns: MediaNamespace, request: Request, id: string) {
  const a = await getAsset(ns, id);
  const isPublic = !!a?.public && !!a.complete;
  if (!isPublic) {
    const c = await mediaReader(request);
    if (!c) return json({ error: "unauthorized" }, 401);
  }
  if (!a?.thumb) return json({ error: "not found" }, 404);
  const buf = await mediaStorage(ns, a.storage.kind).getObject(a.thumb.key);
  if (!buf) return json({ error: "not found" }, 404);
  return new Response(buf, {
    headers: {
      "content-type": a.thumb.mime,
      // the URL carries ?v=<size>, so a replaced thumbnail gets a new URL
      "cache-control": isPublic ? "public, max-age=86400" : "private, max-age=86400",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cross-origin-resource-policy": isPublic ? "cross-origin" : "same-origin",
      ...(isPublic ? { "access-control-allow-origin": "*" } : {}),
    },
  });
}

export type { MediaAssetView };
