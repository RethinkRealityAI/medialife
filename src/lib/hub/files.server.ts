import { z } from "zod";

import { isAdminRequest } from "@/lib/ar/auth.server";

import { HUB_COOKIE, resolveSession } from "./auth.server";
import {
  getCreator,
  getFile,
  listExperiences,
  listProducts,
  logActivity,
  saveExperience,
  saveProduct,
} from "./data.server";
import { HUB, type FileKind, type HubFile } from "./model";
import { KEYS, hubFileStore, hubStore, newId, type HubNamespace } from "./store.server";

// Files in the Creator Hub: creator artwork, MEDIALIFE proofs and collateral.
//
// Uploads are chunked (≤4 MB per request; Netlify functions take at most 6 MB)
// and private: a file is readable by its creator and by the team, never public.
// Downloads stream the chunks back in order.
//
// HTTP contract (all JSON unless noted; non-GET requests need "x-hub: 1", which a
// cross-site form cannot send):
//   POST   /api/hub/files                              {name,size,mime,kind,category,productId?,note?,creatorId? (admin)}
//                                                      → 201 {id, creatorId, chunkSize, chunks}
//   PUT    /api/hub/files/:creatorId/:id/chunks/:n     raw bytes → 204
//   POST   /api/hub/files/:creatorId/:id/complete      → {file}
//   GET    /api/hub/files/:creatorId/:id[?download=1]  → the bytes
//   DELETE /api/hub/files/:creatorId/:id               → 204 (creators: their own artwork only)

/** What may be uploaded. Anything that could run in a browser is served as a download. */
const ALLOWED: Record<string, { ext: string[]; inline: boolean }> = {
  "image/png": { ext: ["png"], inline: true },
  "image/jpeg": { ext: ["jpg", "jpeg"], inline: true },
  "image/webp": { ext: ["webp"], inline: true },
  "image/gif": { ext: ["gif"], inline: true },
  "image/avif": { ext: ["avif"], inline: true },
  "image/svg+xml": { ext: ["svg"], inline: true },
  "application/pdf": { ext: ["pdf"], inline: true },
  "video/mp4": { ext: ["mp4"], inline: true },
  "video/quicktime": { ext: ["mov"], inline: true },
  "application/zip": { ext: ["zip"], inline: false },
  "image/vnd.adobe.photoshop": { ext: ["psd"], inline: false },
  "application/postscript": { ext: ["ai", "eps"], inline: false },
  "application/illustrator": { ext: ["ai"], inline: false },
  "font/otf": { ext: ["otf"], inline: false },
  "font/ttf": { ext: ["ttf"], inline: false },
  "font/woff2": { ext: ["woff2"], inline: false },
  "font/woff": { ext: ["woff"], inline: false },
};

/** Browsers report PSD/AI/fonts inconsistently (often empty); trust the extension for those. */
export function resolveMime(name: string, mime: string): string | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ALLOWED[mime]?.ext.includes(ext)) return mime;
  for (const [m, v] of Object.entries(ALLOWED)) if (v.ext.includes(ext)) return m;
  return null;
}

export const ACCEPT = Object.values(ALLOWED)
  .flatMap((v) => v.ext.map((e) => `.${e}`))
  .join(",");

export const initSchema = z.object({
  name: z.string().min(1).max(300),
  size: z.number().int().positive().max(HUB.maxUploadBytes),
  mime: z.string().max(100),
  kind: z.enum(["artwork", "proof", "collateral", "mockup"]),
  category: z.string().regex(/^[a-z-]{1,24}$/),
  productId: z
    .string()
    .regex(/^[A-Za-z0-9]{6,60}$/)
    .nullable()
    .optional(),
  note: z.string().max(500).optional(),
  creatorId: z
    .string()
    .regex(/^[A-Za-z0-9]{6,60}$/)
    .optional(),
});

const noStore = { "cache-control": "no-store" };
export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: noStore });

const chunkKey = (id: string, n: number) => `${id}/${String(n).padStart(4, "0")}`;

function cleanName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "file";
  return (
    Array.from(base)
      .filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)
      .join("")
      .trim()
      .slice(0, 140) || "file"
  );
}

function readCookie(request: Request, name: string) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name)
      return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export type Caller = { kind: "admin" } | { kind: "creator"; creatorId: string; userId: string };

/** Who is calling: the team (admin cookie) or a signed-in creator. null when neither. */
export async function caller(ns: HubNamespace, request: Request): Promise<Caller | null> {
  if (await isAdminRequest(request)) return { kind: "admin" };
  const s = await resolveSession(
    ns,
    readCookie(request, "hub_session" satisfies typeof HUB_COOKIE),
  );
  return s ? { kind: "creator", creatorId: s.user.creatorId, userId: s.user.id } : null;
}

/** Guard for every non-GET request: a signed-in caller, plus the x-hub header (CSRF). */
export async function guard(ns: HubNamespace, request: Request): Promise<Caller | Response> {
  const c = await caller(ns, request);
  if (!c) return json({ error: "unauthorized" }, 401);
  const m = request.method.toUpperCase();
  if (m !== "GET" && m !== "HEAD" && request.headers.get("x-hub") !== "1")
    return json({ error: "missing x-hub header" }, 403);
  return c;
}

const canAccess = (c: Caller, creatorId: string) => c.kind === "admin" || c.creatorId === creatorId;

/** Kinds a creator may upload. Proofs, mockups and collateral come from the team. */
const CREATOR_KINDS: FileKind[] = ["artwork"];

export async function initUpload(ns: HubNamespace, c: Caller, body: unknown) {
  const parsed = initSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "invalid" }, 400);
  const d = parsed.data;
  const creatorId = c.kind === "admin" ? d.creatorId : c.creatorId;
  if (!creatorId) return json({ error: "creatorId is required" }, 400);
  if (c.kind === "creator" && !CREATOR_KINDS.includes(d.kind))
    return json({ error: "forbidden kind" }, 403);
  if (!(await getCreator(ns, creatorId))) return json({ error: "creator not found" }, 404);
  const mime = resolveMime(d.name, d.mime);
  if (!mime)
    return json(
      {
        error:
          "That file type isn't supported. Use PNG, JPG, SVG, PDF, PSD, AI, ZIP, a font or MP4.",
      },
      415,
    );

  const id = newId(10);
  const chunks = Math.max(1, Math.ceil(d.size / HUB.chunkBytes));
  const file: HubFile = {
    id,
    creatorId,
    name: cleanName(d.name),
    mime,
    size: d.size,
    kind: d.kind,
    category: d.category,
    productId: d.productId ?? null,
    note: d.note ?? "",
    uploadedBy: c.kind === "admin" ? "medialife" : "creator",
    createdAt: Date.now(),
    chunks,
    complete: false,
  };
  await (await hubStore(ns)).setJSON(KEYS.file(creatorId, id), file);
  return json({ id, creatorId, chunkSize: HUB.chunkBytes, chunks }, 201);
}

export async function putChunk(
  ns: HubNamespace,
  c: Caller,
  creatorId: string,
  id: string,
  n: number,
  request: Request,
) {
  if (!canAccess(c, creatorId)) return json({ error: "forbidden" }, 403);
  const file = await getFile(ns, creatorId, id);
  if (!file || file.complete) return json({ error: "not found" }, 404);
  if (!Number.isInteger(n) || n < 0 || n >= file.chunks)
    return json({ error: "bad chunk index" }, 400);
  const buf = new Uint8Array(await request.arrayBuffer());
  const expected =
    n === file.chunks - 1 ? file.size - HUB.chunkBytes * (file.chunks - 1) : HUB.chunkBytes;
  if (buf.byteLength !== expected)
    return json({ error: `chunk ${n} should be ${expected} bytes` }, 400);
  await (await hubFileStore(ns)).setBytes(chunkKey(id, n), buf);
  return new Response(null, { status: 204, headers: noStore });
}

/** Checks magic bytes for the formats a browser would render, so a renamed HTML file can't pose as an image. */
function sniffOk(mime: string, head: Uint8Array) {
  const s = (i: number, bytes: number[]) => bytes.every((b, k) => head[i + k] === b);
  switch (mime) {
    case "image/png":
      return s(0, [0x89, 0x50, 0x4e, 0x47]);
    case "image/jpeg":
      return s(0, [0xff, 0xd8, 0xff]);
    case "image/gif":
      return s(0, [0x47, 0x49, 0x46]);
    case "image/webp":
      return s(0, [0x52, 0x49, 0x46, 0x46]) && s(8, [0x57, 0x45, 0x42, 0x50]);
    case "application/pdf":
      return s(0, [0x25, 0x50, 0x44, 0x46]);
    case "application/zip":
      return s(0, [0x50, 0x4b]);
    default:
      return true;
  }
}

export async function completeUpload(ns: HubNamespace, c: Caller, creatorId: string, id: string) {
  if (!canAccess(c, creatorId)) return json({ error: "forbidden" }, 403);
  const store = await hubStore(ns);
  const file = await getFile(ns, creatorId, id);
  if (!file) return json({ error: "not found" }, 404);
  if (file.complete) return json({ file });
  const bytes = await hubFileStore(ns);
  const keys = new Set(await bytes.list(`${id}/`));
  for (let n = 0; n < file.chunks; n++) {
    if (!keys.has(chunkKey(id, n))) return json({ error: `chunk ${n} is missing` }, 409);
  }
  const first = await bytes.getBytes(chunkKey(id, 0));
  if (!first || !sniffOk(file.mime, new Uint8Array(first.slice(0, 16)))) {
    await deleteFileBytes(ns, file);
    await store.del(KEYS.file(creatorId, id));
    return json(
      { error: "That file doesn't look like what its name says. Try exporting it again." },
      415,
    );
  }
  const done: HubFile = { ...file, complete: true };
  await store.setJSON(KEYS.file(creatorId, id), done);
  if (done.uploadedBy === "creator") {
    await logActivity(ns, creatorId, {
      kind: "file",
      title: `You uploaded ${done.name}`,
      body: "",
    });
  } else if (done.kind === "collateral") {
    // Launch assets from the team: tell the creator they're ready to use.
    await logActivity(ns, creatorId, {
      kind: "file",
      productId: done.productId,
      title: `New launch asset: ${done.name}`,
      body: "It's in your launch kit, ready to download.",
    });
  }
  return json({ file: done });
}

async function deleteFileBytes(ns: HubNamespace, file: HubFile) {
  const bytes = await hubFileStore(ns);
  await Promise.all(Array.from({ length: file.chunks }, (_, n) => bytes.del(chunkKey(file.id, n))));
}

export async function deleteFile(ns: HubNamespace, c: Caller, creatorId: string, id: string) {
  if (!canAccess(c, creatorId)) return json({ error: "forbidden" }, 403);
  const file = await getFile(ns, creatorId, id);
  if (!file) return new Response(null, { status: 204 });
  if (c.kind === "creator" && file.uploadedBy !== "creator")
    return json({ error: "You can only delete files you uploaded." }, 403);
  // A sent proof is part of the approval record: it stays.
  const products = await listProducts(ns, creatorId);
  if (products.some((p) => p.proofs.some((pr) => pr.fileId === id))) {
    return json(
      { error: "This file is a proof that was sent for approval, so it stays in the history." },
      409,
    );
  }
  // Nothing else may point at a file that's gone.
  for (const p of products) {
    if (p.imageFileId === id || p.artworkIds.includes(id)) {
      await saveProduct(ns, {
        ...p,
        imageFileId: p.imageFileId === id ? null : p.imageFileId,
        artworkIds: p.artworkIds.filter((a) => a !== id),
      });
    }
  }
  for (const e of await listExperiences(ns, creatorId)) {
    if (e.imageFileId === id) await saveExperience(ns, { ...e, imageFileId: null });
  }
  await deleteFileBytes(ns, file);
  await (await hubStore(ns)).del(KEYS.file(creatorId, id));
  return new Response(null, { status: 204, headers: noStore });
}

export async function fileResponse(
  ns: HubNamespace,
  c: Caller | null,
  creatorId: string,
  id: string,
  download: boolean,
  head = false,
) {
  if (!c) return json({ error: "unauthorized" }, 401);
  if (!canAccess(c, creatorId)) return json({ error: "forbidden" }, 403);
  const file = await getFile(ns, creatorId, id);
  if (!file || !file.complete) return json({ error: "not found" }, 404);
  const inline = !download && (ALLOWED[file.mime]?.inline ?? false);
  const headers: Record<string, string> = {
    "content-type": file.mime,
    "content-length": String(file.size),
    "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    // private: only the creator and the team can read it; a file never changes under its id
    "cache-control": "private, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
  };
  // An uploaded SVG (or anything else) opened directly can't run script against
  // the site. PDFs are left to the browser's own isolated viewer, which a
  // sandbox CSP would block.
  if (file.mime !== "application/pdf") {
    headers["content-security-policy"] =
      "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox";
  }
  if (head) return new Response(null, { status: 200, headers });
  const store = await hubFileStore(ns);
  let n = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (n >= file.chunks) return controller.close();
      const buf = await store.getBytes(chunkKey(file.id, n++));
      if (!buf) return controller.error(new Error("missing chunk"));
      controller.enqueue(new Uint8Array(buf));
    },
  });
  return new Response(stream, { status: 200, headers });
}

/** Server-side write of a whole file (sample data, generated collateral). */
export async function writeFile(
  ns: HubNamespace,
  meta: Omit<HubFile, "id" | "chunks" | "complete" | "size" | "createdAt"> & { createdAt?: number },
  data: Uint8Array,
): Promise<HubFile> {
  const id = newId(10);
  const chunks = Math.max(1, Math.ceil(data.byteLength / HUB.chunkBytes));
  const bytes = await hubFileStore(ns);
  for (let n = 0; n < chunks; n++) {
    await bytes.setBytes(chunkKey(id, n), data.slice(n * HUB.chunkBytes, (n + 1) * HUB.chunkBytes));
  }
  const file: HubFile = {
    ...meta,
    id,
    size: data.byteLength,
    chunks,
    complete: true,
    createdAt: meta.createdAt ?? Date.now(),
  };
  await (await hubStore(ns)).setJSON(KEYS.file(file.creatorId, id), file);
  return file;
}
