// Media Library: type sniffing, read-only token auth (401 without it, never a
// write), public vs private serving, the resumable upload pipeline, search and
// filters in index.json / llms.txt, metadata updates and the dev seed.
// Run with `npm run test:media` (or `npm run test:hub`, which runs every suite).
// Runs with its cwd set to a throwaway directory, so .data/ is never touched.
import assert from "node:assert/strict";
import process from "node:process";

import { ADMIN_COOKIE, issueToken } from "@/lib/ar/auth.server";
import { deleteMedia, libraryData, updateMedia } from "@/lib/media/admin.server";
import { handleIndexJson, handleLlmsTxt, parseCatalogQuery } from "@/lib/media/catalog.server";
import { getAsset, listAssets, resetCatalog, saveAsset } from "@/lib/media/data.server";
import {
  MEDIA,
  applyMediaPatch,
  aspectLabel,
  clientPolicy,
  embedSnippet,
  imageSize,
  mediaFacets,
  mediaView,
  orientationOf,
  publicFileName,
  resolveMediaMime,
  searchMedia,
  sniffMedia,
  type MediaAsset,
} from "@/lib/media/model";
import { seedMediaSample } from "@/lib/media/sample.server";
import { mediaStorage } from "@/lib/media/storage.server";
import {
  cancelUpload,
  completeUpload,
  initUpload,
  putChunk,
  putThumb,
  serveFile,
  servePublic,
  serveThumb,
  uploadStatus,
} from "@/lib/media/uploads.server";

const ns = "dev" as const;
const ORIGIN = "http://localhost:5175";
const TOKEN = "media-test-token-0123456789abcdef";
process.env.AR_ADMIN_PASSWORD = "testpass";
process.env.MEDIA_API_TOKEN = TOKEN;

const enc = (s: string) => new TextEncoder().encode(s);
const bytes = (...parts: (number[] | string | Uint8Array)[]) => {
  const arrs = parts.map((p) =>
    typeof p === "string" ? enc(p) : p instanceof Uint8Array ? p : new Uint8Array(p),
  );
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let at = 0;
  for (const a of arrs) {
    out.set(a, at);
    at += a.length;
  }
  return out;
};
const ftyp = (brand: string, compat: string[] = []) => {
  const size = 16 + compat.length * 4;
  return bytes([0, 0, 0, size], "ftyp", brand, [0, 0, 0, 0], compat.join(""));
};
const pad = (b: Uint8Array, n: number) => bytes(b, new Uint8Array(Math.max(0, n - b.length)));

/* ---------------------------------------------------------------------------
   1. Types and magic bytes
   --------------------------------------------------------------------------- */

assert.equal(resolveMediaMime("Clip.MP4", ""), "video/mp4");
assert.equal(resolveMediaMime("clip.m4v", "video/x-m4v"), "video/mp4");
assert.equal(resolveMediaMime("model.glb", "application/octet-stream"), "model/gltf-binary");
assert.equal(resolveMediaMime("font.woff2", ""), "font/woff2");
assert.equal(resolveMediaMime("notes.md", ""), "text/markdown");
assert.equal(resolveMediaMime("page.html", "text/html"), null, "no HTML");
assert.equal(resolveMediaMime("setup.exe", ""), null);
assert.equal(resolveMediaMime("noextension", "video/mp4"), null);

const PNG = bytes(
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  [0, 0, 0, 13],
  "IHDR",
  [0, 0, 7, 128, 0, 0, 4, 56],
);
const ok: [string, Uint8Array][] = [
  ["video/mp4", ftyp("isom", ["mp41"])],
  ["video/quicktime", bytes([0, 0, 0, 20], "ftypqt  ")],
  ["video/webm", bytes([0x1a, 0x45, 0xdf, 0xa3, 0x01])],
  ["image/png", PNG],
  ["image/jpeg", bytes([0xff, 0xd8, 0xff, 0xe0])],
  ["image/webp", bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 ")],
  ["image/gif", bytes("GIF89a")],
  ["image/avif", ftyp("avif", ["mif1", "miaf"])],
  ["image/heic", ftyp("heic", ["mif1"])],
  [
    "image/svg+xml",
    bytes(
      '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="10" height="20"></svg>',
    ),
  ],
  ["audio/mpeg", bytes("ID3", [3, 0, 0])],
  ["audio/mpeg", bytes([0xff, 0xfb, 0x90, 0x00])],
  ["audio/wav", bytes("RIFF", [0, 0, 0, 0], "WAVEfmt ")],
  ["audio/ogg", bytes("OggS", [0])],
  ["audio/mp4", ftyp("M4A ", ["mp42"])],
  ["model/gltf-binary", bytes("glTF", [2, 0, 0, 0])],
  ["model/gltf+json", bytes(' {"asset":{"version":"2.0"}}')],
  ["model/vnd.usdz+zip", bytes([0x50, 0x4b, 0x03, 0x04])],
  ["application/zip", bytes([0x50, 0x4b, 0x03, 0x04])],
  ["application/pdf", bytes("%PDF-1.7\n")],
  ["font/ttf", bytes([0, 1, 0, 0, 0, 0x10])],
  ["font/otf", bytes("OTTO")],
  ["font/woff2", bytes("wOF2")],
  ["application/json", bytes('[{"a":1}]')],
  ["text/csv", bytes("name,size\nclip.mp4,12\n")],
  ["text/plain", bytes("Hello — plain text ✓")],
];
for (const [mime, head] of ok) assert.ok(sniffMedia(mime, head), `sniff accepts ${mime}`);
const bad: [string, Uint8Array, string][] = [
  ["image/png", bytes([0xff, 0xd8, 0xff]), "a JPEG named .png"],
  ["video/mp4", bytes("<html><script>alert(1)</script>"), "HTML named .mp4"],
  ["image/svg+xml", bytes("<!DOCTYPE html><html><svg></svg></html>"), "an HTML page named .svg"],
  ["image/svg+xml", bytes("just text"), "text without <svg>"],
  ["text/plain", bytes("<!doctype html><title>x</title>"), "HTML named .txt"],
  ["text/csv", bytes([0x4d, 0x5a, 0, 0]), "a binary named .csv"],
  ["application/json", bytes("hello"), "not JSON"],
  ["model/gltf-binary", bytes("PK"), "a zip named .glb"],
  ["image/avif", ftyp("isom"), "an MP4 named .avif"],
  ["application/x-msdownload", bytes("MZ"), "unknown types"],
];
for (const [mime, head, why] of bad)
  assert.equal(sniffMedia(mime, head), false, `sniff rejects ${why}`);
// a multi-byte character cut by the head limit is still text
assert.ok(sniffMedia("text/plain", enc("ab✓").subarray(0, 4)));

// dimensions from bytes, orientation and aspect
assert.deepEqual(imageSize("image/png", PNG), { width: 1920, height: 1080 });
assert.deepEqual(imageSize("image/gif", bytes("GIF89a", [0x40, 0x01, 0xf0, 0x00])), {
  width: 320,
  height: 240,
});
assert.deepEqual(
  imageSize(
    "image/jpeg",
    bytes([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, 0x05, 0xa0, 0x03, 0x20]),
  ),
  { width: 800, height: 1440 },
);
assert.deepEqual(imageSize("image/svg+xml", enc('<svg viewBox="0 0 640 360">')), {
  width: 640,
  height: 360,
});
assert.equal(orientationOf(1920, 1080), "landscape");
assert.equal(orientationOf(1080, 1920), "portrait");
assert.equal(orientationOf(1000, 1010), "square");
assert.equal(aspectLabel(1080, 1920), "9:16");
assert.equal(aspectLabel(1200, 630), "1.90:1");
assert.equal(publicFileName("Cola Run — Gameplay 01.MP4"), "cola-run-gameplay-01.mp4");
assert.equal(
  publicFileName("poster.jpg"),
  "poster-file.jpg",
  "never collides with a reserved name",
);
assert.ok(clientPolicy("EVADE")?.includes("image-to-3D"));
assert.equal(clientPolicy("MEDIALIFE"), null);

/* ---------------------------------------------------------------------------
   2. Requests
   --------------------------------------------------------------------------- */

const admin = `${ADMIN_COOKIE}=${(await issueToken()).token}`;
type Who = "admin" | "token" | "anon" | "badtoken";
function req(
  path: string,
  who: Who,
  init: { method?: string; body?: BodyInit | null; headers?: Record<string, string> } = {},
) {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (who === "admin") headers.cookie = admin;
  if (who === "token") headers.authorization = `Bearer ${TOKEN}`;
  if (who === "badtoken") headers.authorization = `Bearer ${TOKEN.slice(0, -1)}x`;
  const m = init.method ?? "GET";
  if (m !== "GET" && m !== "HEAD" && who === "admin" && !("x-media" in headers))
    headers["x-media"] = "1";
  return new Request(`${ORIGIN}${path}`, { method: m, body: init.body ?? null, headers });
}
const jsonOf = async <T = Record<string, unknown>>(r: Response) => (await r.json()) as T;

/* ---------------------------------------------------------------------------
   3. Uploads: auth, limits, sniffing, resume, complete
   --------------------------------------------------------------------------- */

const initBody = (over: Record<string, unknown> = {}) => ({
  name: "Cola Run gameplay 01.mp4",
  size: MEDIA.chunkBytes + 100,
  mime: "video/mp4",
  client: "evade",
  collection: "Cola Run gameplay",
  tags: ["gameplay", "Vertical", "gameplay"],
  durationS: 42.5,
  width: 1080,
  height: 1920,
  ...over,
});

// Nobody but an admin starts an upload. The token is read-only, whatever the endpoint.
assert.equal(
  (await initUpload(ns, req("/api/media/uploads", "anon", { method: "POST" }), initBody())).status,
  401,
);
const tokenInit = await initUpload(
  ns,
  req("/api/media/uploads", "token", { method: "POST" }),
  initBody(),
);
assert.equal(tokenInit.status, 403, "the API token never writes");
assert.match((await jsonOf<{ error: string }>(tokenInit)).error, /read-only/);
assert.equal(
  (
    await initUpload(
      ns,
      req("/api/media/uploads", "admin", { method: "POST", headers: { "x-media": "" } }),
      initBody(),
    )
  ).status,
  403,
  "x-media header required (CSRF)",
);
assert.equal(
  (await initUpload(ns, req("/api/media/uploads", "admin", { method: "POST" }), undefined)).status,
  400,
);
assert.equal(
  (
    await initUpload(
      ns,
      req("/api/media/uploads", "admin", { method: "POST" }),
      initBody({ name: "site.html", mime: "text/html" }),
    )
  ).status,
  415,
);
const huge = await initUpload(
  ns,
  req("/api/media/uploads", "admin", { method: "POST" }),
  initBody({ size: 6 * 1024 ** 3 }),
);
assert.equal(huge.status, 413, "over 5 GB per file");
assert.match((await jsonOf<{ error: string }>(huge)).error, /1080p/);

// No cap on how much: a 2 GB file is accepted, with the gentle 1080p note.
const big = await initUpload(
  ns,
  req("/api/media/uploads", "admin", { method: "POST" }),
  initBody({ size: 2 * 1024 ** 3 }),
);
assert.equal(big.status, 201);
const bigInit = await jsonOf<{ id: string; chunks: number; warning: string | null }>(big);
assert.equal(bigInit.chunks, 512);
assert.match(bigInit.warning ?? "", /1080p/);
assert.equal(
  (
    await cancelUpload(
      ns,
      req(`/api/media/uploads/${bigInit.id}`, "admin", { method: "DELETE" }),
      bigInit.id,
    )
  ).status,
  204,
);
assert.equal(await getAsset(ns, bigInit.id), null, "cancel removes the record");

// A real two-chunk upload.
const res = await initUpload(
  ns,
  req("/api/media/uploads", "admin", { method: "POST" }),
  initBody(),
);
assert.equal(res.status, 201);
const { id, chunkSize, chunks } = await jsonOf<{ id: string; chunkSize: number; chunks: number }>(
  res,
);
assert.equal(chunks, 2);
const file = pad(ftyp("isom", ["mp41"]), MEDIA.chunkBytes + 100);
const part = (n: number) => file.slice(n * chunkSize, Math.min(file.length, (n + 1) * chunkSize));
const put = (n: number, who: Who = "admin", body: Uint8Array = part(n)) =>
  putChunk(ns, req(`/api/media/uploads/${id}/chunks/${n}`, who, { method: "PUT", body }), id, n);

assert.equal((await put(1, "token")).status, 403, "token can't send chunks");
assert.equal((await put(1, "anon")).status, 401);
assert.equal((await put(1, "admin", new Uint8Array(10))).status, 400, "wrong chunk size");
assert.equal((await put(5)).status, 400, "chunk index out of range");
assert.equal((await put(1)).status, 204);
// resume: the server says what it has
const st = await jsonOf<{ received: number[]; complete: boolean }>(
  await uploadStatus(ns, req(`/api/media/uploads/${id}`, "admin"), id),
);
assert.deepEqual(st.received, [1]);
assert.equal((await uploadStatus(ns, req(`/api/media/uploads/${id}`, "token"), id)).status, 403);
const early = await completeUpload(
  ns,
  req(`/api/media/uploads/${id}/complete`, "admin", { method: "POST" }),
  id,
);
assert.equal(early.status, 409, "can't complete with a chunk missing");
assert.equal((await jsonOf<{ missing: number }>(early)).missing, 0);
assert.equal((await put(0)).status, 204);
assert.equal(
  (
    await completeUpload(
      ns,
      req(`/api/media/uploads/${id}/complete`, "token", { method: "POST" }),
      id,
    )
  ).status,
  403,
);
const done = await completeUpload(
  ns,
  req(`/api/media/uploads/${id}/complete`, "admin", { method: "POST" }),
  id,
);
assert.equal(done.status, 200);
const asset = (await jsonOf<{ asset: ReturnType<typeof mediaView> }>(done)).asset;
assert.equal(asset.kind, "video");
assert.equal(asset.complete, true);
assert.equal(asset.client, "evade");
assert.deepEqual(asset.tags, ["Gameplay", "Vertical"], "tags de-duplicated, preset spelling");
assert.equal(asset.orientation, "portrait");
assert.equal(asset.aspect, "9:16");
assert.equal(asset.public, false, "private by default");
assert.equal(asset.publicPath, null);
assert.equal(asset.purpose, "gameplay", "purpose suggested from the name");

// Thumbnail: admin only, must be an image
const jpeg = pad(bytes([0xff, 0xd8, 0xff, 0xe0]), 2000);
const thumbReq = (who: Who, body: Uint8Array, type = "image/jpeg") =>
  req(`/api/media/uploads/${id}/thumb`, who, {
    method: "PUT",
    body,
    headers: { "content-type": type },
  });
assert.equal((await putThumb(ns, thumbReq("token", jpeg), id)).status, 403);
assert.equal(
  (await putThumb(ns, thumbReq("admin", bytes("<svg>"), "image/svg+xml"), id)).status,
  415,
);
assert.equal((await putThumb(ns, thumbReq("admin", bytes("not a jpeg")), id)).status, 415);
assert.equal((await putThumb(ns, thumbReq("admin", jpeg), id)).status, 200);
assert.ok((await getAsset(ns, id))?.thumb);

// A file whose bytes don't match its name is refused on the first chunk and cleared.
{
  const r = await initUpload(
    ns,
    req("/api/media/uploads", "admin", { method: "POST" }),
    initBody({ name: "logo.png", mime: "image/png", size: 64 }),
  );
  const fake = await jsonOf<{ id: string }>(r);
  const html = pad(enc("<html><script>alert(1)</script></html>"), 64);
  const c = await putChunk(
    ns,
    req(`/api/media/uploads/${fake.id}/chunks/0`, "admin", { method: "PUT", body: html }),
    fake.id,
    0,
  );
  assert.equal(c.status, 415);
  assert.equal(await getAsset(ns, fake.id), null);
}

/* ---------------------------------------------------------------------------
   4. Serving: private vs public, Range, risky types
   --------------------------------------------------------------------------- */

const fileReq = (who: Who, headers: Record<string, string> = {}, q = "") =>
  req(`/api/media/files/${id}${q}`, who, { headers });

assert.equal((await serveFile(ns, fileReq("anon"), id)).status, 401, "private: no auth, no file");
assert.equal((await serveFile(ns, fileReq("badtoken"), id)).status, 401);
const viaToken = await serveFile(ns, fileReq("token"), id);
assert.equal(viaToken.status, 200, "the token reads files");
assert.equal((await viaToken.arrayBuffer()).byteLength, file.length);
assert.equal(viaToken.headers.get("x-content-type-options"), "nosniff");
assert.match(viaToken.headers.get("cache-control") ?? "", /^private/);
const ranged = await serveFile(ns, fileReq("admin", { range: "bytes=4194300-4194309" }), id);
assert.equal(ranged.status, 206);
assert.equal(ranged.headers.get("content-range"), `bytes 4194300-4194309/${file.length}`);
assert.deepEqual(
  new Uint8Array(await ranged.arrayBuffer()),
  file.slice(4194300, 4194310),
  "range across a chunk boundary",
);
assert.match(
  (await serveFile(ns, fileReq("admin", {}, "?download=1"), id)).headers.get(
    "content-disposition",
  ) ?? "",
  /^attachment/,
);
assert.equal(
  (await serveFile(ns, req(`/api/media/files/${id}`, "token", { method: "POST" }), id)).status,
  405,
);

const pub = (p = `/m/${id}/anything.mp4`, headers: Record<string, string> = {}) =>
  servePublic(ns, req(p, "anon", { headers }), id);
assert.equal((await pub()).status, 404, "private files aren't public");
assert.equal((await serveThumb(ns, req(`/api/media/thumbs/${id}`, "anon"), id)).status, 401);
assert.equal((await serveThumb(ns, req(`/api/media/thumbs/${id}`, "token"), id)).status, 200);

await updateMedia(ns, [id], { public: true });
const p1 = await pub(undefined, { range: "bytes=0-99" });
assert.equal(p1.status, 206, "public files stream with Range");
assert.equal(p1.headers.get("access-control-allow-origin"), "*");
assert.match(p1.headers.get("cache-control") ?? "", /^public/);
assert.equal(p1.headers.get("cross-origin-resource-policy"), "cross-origin");
const p2 = await pub();
assert.equal(p2.status, 200);
const etag = p2.headers.get("etag")!;
assert.equal((await pub(undefined, { "if-none-match": etag })).status, 304);
assert.equal(
  (await serveThumb(ns, req(`/api/media/thumbs/${id}`, "anon"), id)).status,
  200,
  "public thumb",
);
assert.equal(mediaView((await getAsset(ns, id))!).publicPath, `/m/${id}/cola-run-gameplay-01.mp4`);
await updateMedia(ns, [id], { public: false });
assert.equal((await pub()).status, 404, "turning Public off stops it");

// An SVG is served with a sandbox CSP, never as a live document.
const svg = enc(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><script>alert(1)</script></svg>',
);
const now = Date.now();
const base: MediaAsset = {
  id: "",
  name: "",
  title: "",
  mime: "",
  kind: "image",
  size: 0,
  chunks: 1,
  storage: { kind: "blobs", key: "" },
  width: null,
  height: null,
  durationS: null,
  color: null,
  thumb: null,
  tags: [],
  client: "",
  collection: "",
  purpose: null,
  description: "",
  usageNotes: "",
  rights: "",
  aiGenerated: false,
  public: false,
  uploader: "Test",
  fingerprint: null,
  complete: true,
  createdAt: now,
  updatedAt: now,
  completedAt: now,
};
async function addFile(over: Partial<MediaAsset>, data: Uint8Array = enc("x")) {
  const a: MediaAsset = {
    ...base,
    ...over,
    size: data.length,
    storage: { kind: "blobs", key: `files/${over.id}` },
  };
  await mediaStorage(ns).putChunk(a.storage, 0, data);
  return saveAsset(ns, a);
}
await addFile(
  {
    id: "svgLogo01",
    name: "logo.svg",
    title: "MEDIALIFE logo",
    mime: "image/svg+xml",
    public: true,
    client: "MEDIALIFE",
  },
  svg,
);
const s1 = await servePublic(ns, req("/m/svgLogo01/logo.svg", "anon"), "svgLogo01");
assert.equal(s1.status, 200);
assert.match(s1.headers.get("content-security-policy") ?? "", /sandbox/);
assert.match(s1.headers.get("content-security-policy") ?? "", /default-src 'none'/);
assert.equal(s1.headers.get("x-content-type-options"), "nosniff");
assert.equal(s1.headers.get("content-type"), "image/svg+xml");

/* ---------------------------------------------------------------------------
   5. index.json / llms.txt: auth, search and filters
   --------------------------------------------------------------------------- */

const DAY = 86_400_000;
await addFile({
  id: "boboArt001",
  name: "bobo-cat.png",
  title: "Bobo the cat",
  mime: "image/png",
  client: "EVADE",
  collection: "Bobo + Eclipse can art",
  purpose: "logo-brand",
  tags: ["Character", "Transparent"],
  description: "Bobo, EVADE's cat mascot",
  width: 800,
  height: 900,
  rights: "Client-supplied",
  createdAt: now - 3 * DAY,
});
await addFile({
  id: "aiPoster01",
  name: "promo-poster.jpg",
  title: "Launch poster",
  mime: "image/jpeg",
  client: "MEDIALIFE",
  collection: "Launch",
  purpose: "marketing",
  tags: ["Poster"],
  aiGenerated: true,
  width: 1920,
  height: 1080,
  public: true,
  createdAt: now - 2 * DAY,
});
await addFile({
  id: "song000001",
  name: "theme.mp3",
  title: "Cola Run theme",
  mime: "audio/mpeg",
  kind: "audio",
  client: "EVADE",
  collection: "Cola Run gameplay",
  purpose: "audio",
  tags: ["Music", "Loop"],
  durationS: 95,
  createdAt: now - 1 * DAY,
});
await addFile({
  id: "keyModel01",
  name: "keychain.glb",
  title: "Keychain model",
  mime: "model/gltf-binary",
  kind: "model",
  client: "EVADE",
  collection: "Bobo keychain",
  purpose: "3d-model",
  tags: ["Keychain"],
  usageNotes: "Compressed with meshopt",
});
await addFile({
  id: "partial001",
  name: "half.mp4",
  title: "Half uploaded",
  mime: "video/mp4",
  kind: "video",
  complete: false,
});

const idx = async (q: string, who: Who = "token") =>
  handleIndexJson(ns, req(`/api/media/index.json${q}`, who));
type Page = {
  total: number;
  count: number;
  nextOffset: number | null;
  auth: string;
  items: Array<Record<string, unknown> & { id: string }>;
  facets: ReturnType<typeof mediaFacets>;
};
const ids = async (q: string) => (await jsonOf<Page>(await idx(q))).items.map((r) => r.id);

assert.equal((await idx("", "anon")).status, 401, "index.json: 401 without auth");
assert.equal((await idx("", "badtoken")).status, 401);
assert.match((await idx("", "anon")).headers.get("www-authenticate") ?? "", /Bearer/);
assert.equal(
  (await handleLlmsTxt(ns, req("/api/media/llms.txt", "anon"))).status,
  401,
  "llms.txt: 401 without auth",
);
const all = await jsonOf<Page>(await idx(""));
assert.equal(all.auth, "token");
assert.equal(all.total, 6, "complete assets only");
assert.ok(!all.items.some((r) => r.id === "partial001"));
const rec = all.items.find((r) => r.id === "boboArt001")!;
for (const k of [
  "id",
  "title",
  "filename",
  "type",
  "mime",
  "size",
  "width",
  "height",
  "durationSeconds",
  "tags",
  "collection",
  "client",
  "description",
  "altText",
  "usageNotes",
  "rights",
  "aiGenerated",
  "public",
  "publicUrl",
  "downloadUrl",
  "createdAt",
  "updatedAt",
  "uploader",
  "clientPolicy",
])
  assert.ok(k in rec, `record has ${k}`);
assert.equal(rec.downloadUrl, `${ORIGIN}/api/media/files/boboArt001`);
assert.equal(rec.publicUrl, null);
assert.match(String(rec.clientPolicy), /EVADE forbids/);
const posterRec = all.items.find((r) => r.id === "aiPoster01")!;
assert.equal(posterRec.publicUrl, `${ORIGIN}/m/aiPoster01/promo-poster.jpg`);
assert.match(
  String(posterRec.embedHtml),
  /^<img src="http:\/\/localhost:5175\/m\/aiPoster01\/promo-poster.jpg"/,
);
assert.equal((await idx("", "admin")).status, 200, "the admin cookie works too");

assert.deepEqual(
  await ids("?q=bobo"),
  ["boboArt001", "keyModel01"],
  "search: title first, then collection",
);
assert.deepEqual(await ids("?q=MASCOT"), ["boboArt001"], "search is case-insensitive");
assert.deepEqual(await ids("?q=meshopt"), ["keyModel01"], "search: usage notes");
assert.deepEqual(await ids("?q=cola%20theme"), ["song000001"], "every word must match");
assert.deepEqual(await ids("?q=keychain.glb"), ["keyModel01"], "search: file name");
assert.deepEqual(
  (await ids("?client=evade")).sort(),
  ["boboArt001", "keyModel01", "song000001", id].sort(),
  "client, case-insensitive",
);
assert.deepEqual(
  (await ids("?property=MEDIALIFE&type=image")).sort(),
  ["aiPoster01", "svgLogo01"],
  "property is an alias of client",
);
assert.deepEqual(await ids("?type=audio"), ["song000001"]);
assert.deepEqual(await ids("?type=3d"), ["keyModel01"], "type alias 3d");
assert.deepEqual(await ids("?type=model/gltf-binary"), ["keyModel01"], "type as a MIME type");
assert.deepEqual(await ids("?type=spreadsheet"), [], "an unknown type matches nothing");
assert.deepEqual(await ids("?tags=character,transparent"), ["boboArt001"], "all tags must match");
assert.deepEqual(await ids("?tag=Poster&tag=nope"), []);
assert.deepEqual(await ids("?collection=cola%20run%20gameplay&sort=duration"), ["song000001", id]);
assert.deepEqual((await ids("?public=true")).sort(), ["aiPoster01", "svgLogo01"]);
assert.deepEqual(await ids("?ai=true"), ["aiPoster01"], "AI-generated is filterable");
assert.ok(!(await ids("?ai=false")).includes("aiPoster01"));
assert.deepEqual(await ids("?orientation=portrait&type=video"), [id]);
assert.deepEqual(await ids("?purpose=3d-model"), ["keyModel01"]);
const paged = await jsonOf<Page>(await idx("?limit=2&sort=old"));
assert.equal(paged.count, 2);
assert.equal(paged.nextOffset, 2);
assert.equal((await jsonOf<Page>(await idx("?limit=2&offset=4&sort=old"))).nextOffset, null);
assert.equal(all.facets.kinds.image, 3);
assert.equal(all.facets.aiCount, 1);
assert.equal(parseCatalogQuery(new URLSearchParams("limit=999999")).limit, MEDIA.maxPageSize);

const llms = await handleLlmsTxt(ns, req("/api/media/llms.txt?client=EVADE", "token"));
assert.equal(llms.status, 200);
assert.match(llms.headers.get("content-type") ?? "", /text\/markdown/);
const text = await llms.text();
assert.match(text, /^# MEDIALIFE Media Library/);
assert.match(text, /### Bobo the cat \(`bobo-cat.png`\)/);
assert.match(text, /POLICY: EVADE forbids/);
assert.match(text, /download \(auth\): http:\/\/localhost:5175\/api\/media\/files\/boboArt001/);
assert.ok(!text.includes("Launch poster"), "llms.txt takes the same filters");

/* ---------------------------------------------------------------------------
   6. Metadata updates (single and bulk), delete
   --------------------------------------------------------------------------- */

{
  const r = await updateMedia(ns, ["boboArt001"], {
    title: "  Bobo   the cat (transparent)  ",
    description: "Line one\r\n\r\n\r\n\r\nLine two",
    rights: "Client-supplied",
    collection: "bobo + eclipse CAN art",
    addTags: ["Mascot", "character"],
    removeTags: ["transparent"],
    aiGenerated: false,
  });
  assert.ok(r.results[0].ok);
  const a = (await getAsset(ns, "boboArt001"))!;
  assert.equal(a.title, "Bobo the cat (transparent)");
  assert.equal(a.description, "Line one\n\nLine two");
  assert.equal(a.collection, "Bobo + Eclipse can art", "existing spelling kept");
  assert.deepEqual(a.tags, ["Character", "Mascot"]);
  assert.ok(a.updatedAt >= now);
}
{
  // bulk: tag, move and publish several at once; one missing id reports an error
  const r = await updateMedia(ns, ["song000001", "keyModel01", "missing999"], {
    addTags: ["Launch kit"],
    client: "EVADE",
    collection: "EVADE launch",
    public: true,
  });
  assert.deepEqual(
    r.results.map((x) => x.ok),
    [true, true, false],
  );
  assert.deepEqual((await ids("?collection=EVADE%20launch&public=true&tags=launch%20kit")).sort(), [
    "keyModel01",
    "song000001",
  ]);
}
assert.equal(
  applyMediaPatch({ ...base, name: "a_b.png", title: "x" }, { title: "   " }).title,
  "a b",
  "a blank title falls back to the name",
);
assert.equal(
  applyMediaPatch(base, { setTags: Array.from({ length: 80 }, (_, i) => `t${i}`) }).tags.length,
  MEDIA.limits.tagsPerAsset,
);

// the catalog cache rebuilds from the records when it's dropped
await resetCatalog(ns);
assert.equal((await listAssets(ns)).length, 6);
assert.equal((await libraryData(ns)).unfinished.length, 1);

// client-side search matches the server's
const views = (await listAssets(ns)).map(mediaView);
assert.deepEqual(
  searchMedia(views, { q: "mascot" }).map((v) => v.id),
  ["boboArt001"],
);
assert.match(
  embedSnippet(
    views.find((v) => v.id === id)!,
    "https://medialife.ai/m/x/y.mp4",
    "https://medialife.ai",
  ),
  /^<video src="https:\/\/medialife.ai\/m\/x\/y.mp4" poster="https:\/\/medialife.ai\/api\/media\/thumbs\//,
);

await deleteMedia(ns, [id]);
assert.equal(await getAsset(ns, id), null);
assert.equal((await serveFile(ns, fileReq("admin"), id)).status, 404);
assert.equal(
  (await mediaStorage(ns).receivedChunks({ kind: "blobs", key: `files/${id}` })).size,
  0,
  "bytes deleted",
);

/* ---------------------------------------------------------------------------
   7. Dev seed (art files are skipped outside the repo; the clips always load)
   --------------------------------------------------------------------------- */

await assert.rejects(() => seedMediaSample("prod"), "never in production");
const seeded = await seedMediaSample(ns);
assert.equal(seeded.created, true);
assert.ok(seeded.count >= 2);
assert.equal((await seedMediaSample(ns)).created, false, "seed is idempotent");
const again = await seedMediaSample(ns, { reset: true });
assert.equal(again.created, true);
assert.equal(
  (await listAssets(ns)).filter((a) => a.sample).length,
  again.count,
  "reset replaces, never duplicates",
);

console.log("media: all assertions passed");
