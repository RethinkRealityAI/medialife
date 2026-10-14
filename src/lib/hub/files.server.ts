import { z } from "zod";

import { parseRange } from "@/lib/ar/assets.server";
import { isAdminRequest } from "@/lib/ar/auth.server";

import { HUB_COOKIE, resolveSession } from "./auth.server";
import {
  getCreator,
  getFile,
  getFolder,
  listExperiences,
  listProducts,
  logActivity,
  saveExperience,
  saveProduct,
} from "./data.server";
import { ASSET_LIMITS, ASSET_SECTIONS, normaliseTags } from "./assets";
import { HUB, type FileKind, type HubFile } from "./model";
import { KIT_OWNER, isLibraryOwner, partnerOwner, type PartnerMembership } from "./partners";
import { KEYS, hubFileStore, hubStore, newId, type HubNamespace } from "./store.server";

// Files in the Creator Hub: creator artwork, MEDIALIFE proofs and collateral.
//
// Uploads are chunked (≤4 MB per request; Netlify functions take at most 6 MB)
// and private: a file is readable by its creator and by the team, never public.
// Downloads stream the chunks back in order.
//
// HTTP contract (all JSON unless noted; non-GET requests need "x-hub: 1", which a
// cross-site form cannot send):
//   POST   /api/hub/files                              {name,size,mime,kind,category,productId?,note?,creatorId? (admin),
//                                                       section?,folderId?,tags? (the asset library)}
//                                                      → 201 {id, creatorId, chunkSize, chunks}
//   PUT    /api/hub/files/:creatorId/:id/chunks/:n     raw bytes → 204
//   POST   /api/hub/files/:creatorId/:id/complete      → {file}
//   GET    /api/hub/files/:creatorId/:id[?download=1]  → the bytes; honours Range, and caps a
//                                                      206 at HUB.maxResponseBytes (a streamed
//                                                      Netlify response tops out near 20 MB), so
//                                                      players and downloadHubFile() read big
//                                                      files in pieces
//   DELETE /api/hub/files/:creatorId/:id               → 204 (creators: their own artwork only)

/**
 * What may be uploaded. `inline` types are shown in the browser (images, PDFs,
 * video, audio); everything else is served as a download. 3D models are read by
 * the hub's viewer with fetch(), which doesn't care about the disposition.
 */
const ALLOWED: Record<string, { ext: string[]; inline: boolean }> = {
  // images
  "image/png": { ext: ["png"], inline: true },
  "image/jpeg": { ext: ["jpg", "jpeg"], inline: true },
  "image/webp": { ext: ["webp"], inline: true },
  "image/gif": { ext: ["gif"], inline: true },
  "image/avif": { ext: ["avif"], inline: true },
  "image/svg+xml": { ext: ["svg"], inline: true },
  "image/heic": { ext: ["heic"], inline: false },
  "image/tiff": { ext: ["tif", "tiff"], inline: false },
  // documents
  "application/pdf": { ext: ["pdf"], inline: true },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    ext: ["docx"],
    inline: false,
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    ext: ["pptx"],
    inline: false,
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    ext: ["xlsx"],
    inline: false,
  },
  "application/vnd.apple.keynote": { ext: ["key"], inline: false },
  "text/plain": { ext: ["txt"], inline: false },
  "text/csv": { ext: ["csv"], inline: false },
  "text/markdown": { ext: ["md"], inline: false },
  // video and audio
  "video/mp4": { ext: ["mp4", "m4v"], inline: true },
  "video/quicktime": { ext: ["mov"], inline: true },
  "video/webm": { ext: ["webm"], inline: true },
  "audio/mpeg": { ext: ["mp3"], inline: true },
  "audio/wav": { ext: ["wav"], inline: true },
  "audio/mp4": { ext: ["m4a"], inline: true },
  "audio/aac": { ext: ["aac"], inline: true },
  "audio/ogg": { ext: ["ogg"], inline: true },
  "audio/flac": { ext: ["flac"], inline: true },
  // 3D
  "model/gltf-binary": { ext: ["glb"], inline: false },
  "model/gltf+json": { ext: ["gltf"], inline: false },
  "model/obj": { ext: ["obj"], inline: false },
  "model/stl": { ext: ["stl"], inline: false },
  "model/vnd.usdz+zip": { ext: ["usdz"], inline: false },
  "application/vnd.autodesk.fbx": { ext: ["fbx"], inline: false },
  "application/x-blender": { ext: ["blend"], inline: false },
  // design files and archives
  "application/zip": { ext: ["zip"], inline: false },
  "image/vnd.adobe.photoshop": { ext: ["psd"], inline: false },
  "application/postscript": { ext: ["ai", "eps"], inline: false },
  "application/illustrator": { ext: ["ai"], inline: false },
  "application/x-figma": { ext: ["fig"], inline: false },
  "application/x-sketch": { ext: ["sketch"], inline: false },
  "application/vnd.adobe.xd": { ext: ["xd"], inline: false },
  "application/x-procreate": { ext: ["procreate"], inline: false },
  "application/x-indesign": { ext: ["indd"], inline: false },
  // fonts
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

const tagSchema = z.string().max(ASSET_LIMITS.tagLength * 2);

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
  // the asset library
  section: z.enum(ASSET_SECTIONS).optional(),
  folderId: z
    .string()
    .regex(/^[A-Za-z0-9]{6,60}$/)
    .nullable()
    .optional(),
  tags: z
    .array(tagSchema)
    .max(ASSET_LIMITS.tagsPerFile * 2)
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

/**
 * Who is calling. A hub account may run a creator profile, sit on a partner
 * team, or both.
 */
export type Caller =
  | { kind: "admin" }
  | { kind: "user"; userId: string; creatorId: string | null; partner: PartnerMembership | null };

/** Who is calling: the team (admin cookie) or a signed-in hub account. null when neither. */
export async function caller(ns: HubNamespace, request: Request): Promise<Caller | null> {
  if (await isAdminRequest(request)) return { kind: "admin" };
  const s = await resolveSession(
    ns,
    readCookie(request, "hub_session" satisfies typeof HUB_COOKIE),
  );
  return s
    ? {
        kind: "user",
        userId: s.user.id,
        creatorId: s.user.creatorId,
        partner: s.user.partner ?? null,
      }
    : null;
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

/** Uploading, finishing and deleting: the team, or the creator whose library it is. */
const canWrite = (c: Caller, owner: string) => c.kind === "admin" || c.creatorId === owner;

/**
 * Reading: also a partner team, for the MEDIALIFE kit, its own library and the
 * creators tied to it (partners see everything about their creators).
 */
async function canRead(ns: HubNamespace, c: Caller, owner: string) {
  if (canWrite(c, owner)) return true;
  if (c.kind !== "user" || !c.partner) return false;
  if (owner === KIT_OWNER || owner === partnerOwner(c.partner.id)) return true;
  const creator = isLibraryOwner(owner) ? null : await getCreator(ns, owner);
  return creator?.agency?.id === c.partner.id;
}

/** Libraries that aren't a creator's: the MEDIALIFE kit and partner libraries. */
async function ownerExists(ns: HubNamespace, owner: string) {
  if (owner === KIT_OWNER) return true;
  if (owner.startsWith("partner")) return true;
  return !!(await getCreator(ns, owner));
}

/** Kinds a creator may upload. Proofs, mockups and collateral come from the team. */
const CREATOR_KINDS: FileKind[] = ["artwork"];

export async function initUpload(ns: HubNamespace, c: Caller, body: unknown) {
  const parsed = initSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "invalid" }, 400);
  const d = parsed.data;
  const creatorId = c.kind === "admin" ? d.creatorId : c.creatorId;
  if (!creatorId) return json({ error: "creatorId is required" }, 400);
  if (c.kind === "user" && !CREATOR_KINDS.includes(d.kind))
    return json({ error: "forbidden kind" }, 403);
  // Only the team uploads to the MEDIALIFE kit and partner libraries.
  if (isLibraryOwner(creatorId) && c.kind !== "admin") return json({ error: "forbidden" }, 403);
  if (!(await ownerExists(ns, creatorId))) return json({ error: "creator not found" }, 404);
  const mime = resolveMime(d.name, d.mime);
  if (!mime)
    return json(
      {
        error:
          "That file type isn't supported. Zip it and upload the ZIP, or ask us for another format.",
      },
      415,
    );
  // A folder pins the section; one that's gone (or someone else's) is ignored.
  const folder = d.folderId ? await getFolder(ns, creatorId, d.folderId) : null;

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
    ...(d.section || folder || d.tags
      ? {
          section: folder?.section ?? d.section,
          folderId: folder?.id ?? null,
          tags: normaliseTags(d.tags ?? []),
        }
      : {}),
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
  if (!canWrite(c, creatorId)) return json({ error: "forbidden" }, 403);
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
    case "video/webm":
      return s(0, [0x1a, 0x45, 0xdf, 0xa3]);
    case "model/gltf-binary":
      return s(0, [0x67, 0x6c, 0x54, 0x46]);
    default:
      return true;
  }
}

export async function completeUpload(ns: HubNamespace, c: Caller, creatorId: string, id: string) {
  if (!canWrite(c, creatorId)) return json({ error: "forbidden" }, 403);
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
  if (!canWrite(c, creatorId)) return json({ error: "forbidden" }, 403);
  const file = await getFile(ns, creatorId, id);
  if (!file) return new Response(null, { status: 204 });
  if (c.kind === "user" && file.uploadedBy !== "creator")
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
  rangeHeader: string | null = null,
) {
  if (!c) return json({ error: "unauthorized" }, 401);
  if (!(await canRead(ns, c, creatorId))) return json({ error: "forbidden" }, 403);
  const file = await getFile(ns, creatorId, id);
  if (!file || !file.complete) return json({ error: "not found" }, 404);
  const inline = !download && (ALLOWED[file.mime]?.inline ?? false);
  const headers: Record<string, string> = {
    "content-type": file.mime,
    "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    // private: only the creator and the team can read it; a file never changes under its id
    "cache-control": "private, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
    "accept-ranges": "bytes",
  };
  // An uploaded SVG (or anything else) opened directly can't run script against
  // the site. PDFs are left to the browser's own isolated viewer, which a
  // sandbox CSP would block.
  if (file.mime !== "application/pdf") {
    headers["content-security-policy"] =
      "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox";
  }

  const range = parseRange(rangeHeader, file.size);
  if (range === "invalid") {
    return new Response(null, {
      status: 416,
      headers: { ...headers, "content-range": `bytes */${file.size}` },
    });
  }
  const start = range ? range.start : 0;
  // A range answer may be shorter than asked; clients ask again for the rest.
  const end = range ? Math.min(range.end, start + HUB.maxResponseBytes - 1) : file.size - 1;
  headers["content-length"] = String(end - start + 1);
  if (range) headers["content-range"] = `bytes ${start}-${end}/${file.size}`;
  const status = range ? 206 : 200;
  if (head) return new Response(null, { status, headers });

  const store = await hubFileStore(ns);
  const cs = HUB.chunkBytes;
  const last = Math.floor(end / cs);
  let n = Math.floor(start / cs);
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const buf = await store.getBytes(chunkKey(file.id, n));
      if (!buf) return controller.error(new Error("missing chunk"));
      const from = n === Math.floor(start / cs) ? start - n * cs : 0;
      const to = n === last ? end - n * cs + 1 : buf.byteLength;
      controller.enqueue(new Uint8Array(buf, from, to - from));
      n++;
      if (n > last) controller.close();
    },
  });
  return new Response(stream, { status, headers });
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
