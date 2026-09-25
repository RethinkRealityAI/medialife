import { z } from "zod";

import {
  ASSET_ID_RE,
  CHUNK_SIZE,
  MAX_BYTES,
  MIME_BY_KIND,
  glbHeaderOk,
  isGenerated,
  sniffMime,
  type AssetListItem,
} from "./assets";
import { requireAdmin } from "./auth.server";
import type { AssetMeta, ProjectDoc } from "./project";
import { assetIdFromRef, assetUrl, referencedAssetIds } from "./projects";
import { arStore, type ArNamespace } from "./store.server";

// Uploaded files for the endcap builder (3D models, images, generated AR files
// and thumbnails). See src/lib/ar/assets.ts for the HTTP contract.
//
// Storage: meta in the "assets" store as "<id>.json" (in-progress uploads as
// "pending/<id>.json"), bytes in the "chunks" store as "<id>/<0000>". Files are
// split into ≤4 MB chunks because a Netlify function accepts at most 6 MB per
// request; downloads stream the chunks back in order, so one response can carry
// up to 20 MB. Ids are random and never reused, so files can be cached forever.

const PENDING_TTL_MS = 24 * 60 * 60 * 1000;
const metaKey = (id: string) => `${id}.json`;
const pendingKey = (id: string) => `pending/${id}.json`;
const chunkKey = (id: string, n: number) => `${id}/${String(n).padStart(4, "0")}`;

interface PendingUpload extends AssetMeta {
  expiresAt: number;
}

const noStore = { "cache-control": "no-store" };
export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: noStore });
}

/**
 * For admin API routes: 401 without the admin cookie, and 403 for a non-GET
 * request without "x-ar-admin: 1" (a cross-site form can't set headers, so this
 * keeps the cookie from being used by another site).
 */
export async function adminGuard(request: Request): Promise<Response | null> {
  const deny = await requireAdmin(request);
  if (deny) return json({ error: "unauthorized" }, 401);
  const m = request.method.toUpperCase();
  if (m !== "GET" && m !== "HEAD" && request.headers.get("x-ar-admin") !== "1") {
    return json({ error: "missing x-ar-admin header" }, 403);
  }
  return null;
}

export function newAssetId(): string {
  const rnd = crypto.getRandomValues(new Uint8Array(10));
  return Date.now().toString(36) + Array.from(rnd, (b) => (b % 36).toString(36)).join("");
}

function cleanName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  // drop control characters
  return (
    Array.from(base)
      .filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)
      .join("")
      .trim()
      .slice(0, 120) || "file"
  );
}

export const initUploadSchema = z.object({
  name: z.string().min(1).max(300),
  size: z.number().int().positive(),
  kind: z.enum(["model", "image"]),
  mime: z.string().max(60),
  tags: z
    .array(z.string().regex(/^[a-z0-9-]{1,24}$/))
    .max(8)
    .optional(),
  thumb: z.string().regex(ASSET_ID_RE).optional(),
  mobile: z.string().regex(ASSET_ID_RE).optional(),
  width: z.number().int().positive().max(100000).optional(),
  height: z.number().int().positive().max(100000).optional(),
});

type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });

async function purgeStale(ns: ArNamespace) {
  const [assets, chunks] = await Promise.all([arStore("assets", ns), arStore("chunks", ns)]);
  const now = Date.now();
  for (const key of await assets.list("pending/")) {
    const p = await assets.getJSON<PendingUpload>(key);
    if (p && p.expiresAt > now) continue;
    const id = key.slice("pending/".length).replace(/\.json$/, "");
    for (const k of await chunks.list(`${id}/`)) await chunks.del(k);
    await assets.del(key);
  }
}

export async function initUpload(
  ns: ArNamespace,
  input: unknown,
): Promise<{ ok: true; id: string; chunkSize: number; chunks: number } | Fail> {
  const parsed = initUploadSchema.safeParse(input);
  if (!parsed.success) return fail(400, "invalid upload details");
  const b = parsed.data;
  if (!(MIME_BY_KIND[b.kind] as readonly string[]).includes(b.mime)) {
    return fail(
      415,
      b.kind === "model" ? "models must be .glb" : "images must be PNG, JPEG or WebP",
    );
  }
  if (b.size > MAX_BYTES[b.kind]) {
    return fail(
      413,
      `${b.kind === "model" ? "models" : "images"} can be at most ${MAX_BYTES[b.kind] / 1024 / 1024} MB`,
    );
  }
  // abandoned uploads leave chunks behind; clear them now and then
  if (Math.random() < 0.2) await purgeStale(ns).catch(() => {});

  const id = newAssetId();
  const now = Date.now();
  const pending: PendingUpload = {
    id,
    name: cleanName(b.name),
    kind: b.kind,
    mime: b.mime,
    size: b.size,
    chunks: Math.ceil(b.size / CHUNK_SIZE),
    chunkSize: CHUNK_SIZE,
    createdAt: now,
    expiresAt: now + PENDING_TTL_MS,
    ...(b.tags?.length ? { tags: [...new Set(b.tags)] } : {}),
    ...(b.thumb ? { thumb: b.thumb } : {}),
    ...(b.mobile ? { mobile: b.mobile } : {}),
    ...(b.width && b.height ? { width: b.width, height: b.height } : {}),
  };
  await (await arStore("assets", ns)).setJSON(pendingKey(id), pending);
  return { ok: true, id, chunkSize: CHUNK_SIZE, chunks: pending.chunks };
}

export async function putChunk(
  ns: ArNamespace,
  id: string,
  n: number,
  request: Request,
): Promise<{ ok: true } | Fail> {
  if (!ASSET_ID_RE.test(id)) return fail(404, "unknown upload");
  const p = await (await arStore("assets", ns)).getJSON<PendingUpload>(pendingKey(id));
  if (!p) return fail(404, "unknown upload");
  if (!Number.isInteger(n) || n < 0 || n >= p.chunks) return fail(400, "bad chunk index");
  const cs = p.chunkSize ?? CHUNK_SIZE;
  const expected = n < p.chunks - 1 ? cs : p.size - cs * (p.chunks - 1);
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) !== expected) return fail(400, "wrong chunk size");
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength !== expected) return fail(400, "wrong chunk size");
  await (await arStore("chunks", ns)).setBytes(chunkKey(id, n), bytes);
  return { ok: true };
}

export async function completeUpload(
  ns: ArNamespace,
  id: string,
): Promise<{ ok: true; asset: AssetMeta } | Fail> {
  if (!ASSET_ID_RE.test(id)) return fail(404, "unknown upload");
  const [assets, chunks] = await Promise.all([arStore("assets", ns), arStore("chunks", ns)]);
  const p = await assets.getJSON<PendingUpload>(pendingKey(id));
  if (!p) {
    // a retried "complete" after a success
    const done = await assets.getJSON<AssetMeta>(metaKey(id));
    return done ? { ok: true, asset: done } : fail(404, "unknown upload");
  }
  const have = new Set(await chunks.list(`${id}/`));
  for (let n = 0; n < p.chunks; n++) {
    if (!have.has(chunkKey(id, n))) return fail(409, `chunk ${n + 1} of ${p.chunks} is missing`);
  }
  const first = await chunks.getBytes(chunkKey(id, 0));
  const head = new Uint8Array(first ?? new ArrayBuffer(0)).subarray(0, 16);
  const sniffed = sniffMime(head);
  if (sniffed !== p.mime) {
    return fail(
      415,
      p.mime === "model/gltf-binary"
        ? "that isn't a binary glTF (.glb) file"
        : `the file doesn't look like ${p.mime}`,
    );
  }
  if (p.mime === "model/gltf-binary" && !glbHeaderOk(head, p.size)) {
    return fail(415, "the .glb header is damaged or it isn't glTF 2.0");
  }
  const { expiresAt: _drop, ...meta } = p;
  await assets.setJSON(metaKey(id), meta);
  await assets.del(pendingKey(id));
  return { ok: true, asset: meta };
}

export async function readAsset(ns: ArNamespace, id: string): Promise<AssetMeta | null> {
  if (!ASSET_ID_RE.test(id)) return null;
  return (await arStore("assets", ns)).getJSON<AssetMeta>(metaKey(id));
}

/** asset id → projects that reference it (draft, published version or list thumbnail). */
export async function assetUsage(
  ns: ArNamespace,
): Promise<Map<string, { slug: string; name: string }[]>> {
  const projects = await arStore("projects", ns);
  const keys = (await projects.list("")).filter((k) => /^[a-z0-9-]+\.json$/.test(k));
  const docs = await Promise.all(keys.map((k) => projects.getJSON<ProjectDoc>(k)));
  const usage = new Map<string, { slug: string; name: string }[]>();
  for (const doc of docs) {
    if (!doc) continue;
    const ids = referencedAssetIds([doc.draft, doc.published, doc.thumb]);
    for (const id of ids) {
      const list = usage.get(id) ?? [];
      list.push({ slug: doc.slug, name: doc.draft?.name ?? doc.slug });
      usage.set(id, list);
    }
  }
  return usage;
}

export async function listAssets(ns: ArNamespace): Promise<AssetListItem[]> {
  const assets = await arStore("assets", ns);
  const keys = (await assets.list("")).filter((k) => /^[a-z0-9]+\.json$/.test(k));
  const [metas, usage] = await Promise.all([
    Promise.all(keys.map((k) => assets.getJSON<AssetMeta>(k))),
    assetUsage(ns),
  ]);
  return metas
    .filter((m): m is AssetMeta => !!m)
    .map((m) => ({ ...m, url: assetUrl(m.id), usedBy: usage.get(m.id) ?? [] }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

async function removeAsset(ns: ArNamespace, id: string) {
  const [assets, chunks] = await Promise.all([arStore("assets", ns), arStore("chunks", ns)]);
  await Promise.all((await chunks.list(`${id}/`)).map((k) => chunks.del(k)));
  await assets.del(metaKey(id));
}

export async function deleteAsset(
  ns: ArNamespace,
  id: string,
  force: boolean,
): Promise<{ ok: true } | Fail | { ok: false; status: 409; error: "in-use"; usedBy: unknown }> {
  const meta = await readAsset(ns, id);
  if (!meta) return { ok: true }; // already gone
  const usage = await assetUsage(ns);
  const usedBy = usage.get(id) ?? [];
  if (usedBy.length && !force) return { ok: false, status: 409, error: "in-use", usedBy };
  await removeAsset(ns, id);
  // its thumbnail / phone version go with it unless something else uses them
  for (const linked of [meta.thumb, meta.mobile]) {
    if (linked && !(usage.get(linked) ?? []).length) await removeAsset(ns, linked);
  }
  return { ok: true };
}

/**
 * Delete generated files (AR exports, thumbnails) that no project uses any more,
 * e.g. the previous AR files after a new publish. Uploaded files are never touched.
 */
export async function releaseGenerated(ns: ArNamespace, refs: (string | null | undefined)[]) {
  const ids = [...new Set(refs.map((r) => assetIdFromRef(r ?? null) ?? "").filter(Boolean))];
  if (!ids.length) return;
  const usage = await assetUsage(ns);
  for (const id of ids) {
    if ((usage.get(id) ?? []).length) continue;
    const meta = await readAsset(ns, id);
    if (meta && isGenerated(meta)) await removeAsset(ns, id);
  }
}

// ---- public download ----

function parseRange(header: string | null, size: number) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null; // multi-range and other units: send the whole file
  let start: number;
  let end: number;
  if (m[1] === "") {
    const suffix = Number(m[2]);
    if (!m[2] || suffix === 0) return "invalid" as const;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start > end || start >= size) return "invalid" as const;
  return { start, end };
}

const PUBLIC_HEADERS = {
  "cache-control": "public, max-age=31536000, immutable",
  // one shared copy across Netlify's edges: the function streams each file once
  "netlify-cdn-cache-control": "public, max-age=31536000, immutable, durable",
  "access-control-allow-origin": "*",
  "access-control-expose-headers": "content-length, content-range, accept-ranges, etag",
  "accept-ranges": "bytes",
};

/** The asset's bytes as a streamed Response (range requests supported). */
export async function assetResponse(
  ns: ArNamespace,
  id: string,
  request: Request,
  headOnly = false,
): Promise<Response> {
  const meta = await readAsset(ns, id);
  if (!meta) {
    return new Response("Not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
  const etag = `"${meta.id}"`;
  const ascii = meta.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const headers: Record<string, string> = {
    ...PUBLIC_HEADERS,
    "content-type": meta.mime,
    etag,
    "content-disposition": `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(meta.name)}`,
  };
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }

  const range = parseRange(request.headers.get("range"), meta.size);
  if (range === "invalid") {
    return new Response(null, {
      status: 416,
      headers: { ...headers, "content-range": `bytes */${meta.size}` },
    });
  }
  const start = range ? range.start : 0;
  const end = range ? range.end : meta.size - 1;
  headers["content-length"] = String(end - start + 1);
  if (range) headers["content-range"] = `bytes ${start}-${end}/${meta.size}`;
  const status = range ? 206 : 200;
  if (headOnly) return new Response(null, { status, headers });

  const chunks = await arStore("chunks", ns);
  const cs = meta.chunkSize ?? CHUNK_SIZE;
  const last = Math.floor(end / cs);
  let n = Math.floor(start / cs);
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const buf = await chunks.getBytes(chunkKey(meta.id, n));
      if (!buf) {
        controller.error(new Error(`asset ${meta.id}: chunk ${n} missing`));
        return;
      }
      const from = n === Math.floor(start / cs) ? start - n * cs : 0;
      const to = n === last ? end - n * cs + 1 : buf.byteLength;
      controller.enqueue(new Uint8Array(buf, from, to - from));
      n++;
      if (n > last) controller.close();
    },
  });
  return new Response(body, { status, headers });
}
