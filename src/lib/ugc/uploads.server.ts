import { z } from "zod";

import { parseRange } from "@/lib/ar/assets.server";

import { json, noStore, type UgcCaller } from "./auth.server";
import {
  currentCampaign,
  getAsset,
  getCampaign,
  getSubmission,
  listSubmissions,
  logActivity,
  purgeStaleUploads,
  saveAsset,
  saveCampaign,
  saveSubmission,
  deleteSubmission,
  syncCreatorStatus,
} from "./data.server";
import {
  UGC,
  UGC_ASSET_GROUPS,
  UGC_ASSET_TYPES,
  UGC_POST_PLATFORMS,
  UGC_SUBMISSION_TYPES,
  aspectOf,
  assetView,
  canUpload,
  overQuota,
  quotaUsed,
  resolveUgcMime,
  sniffUgc,
  submissionView,
  type UgcAsset,
  type UgcQuota,
  type UgcStorageRef,
  type UgcSubmission,
} from "./model";
import { configuredStorageKind, ugcStorage, type UploadPlan } from "./storage.server";
import { UKEYS, newId, ugcStore, type UgcNamespace } from "./store.server";

// Uploads and downloads for the UGC Hub. Same shape as the Creator Hub's
// chunked pipeline (src/lib/hub/files.server.ts), with UGC's own limits, types,
// quota and records, and a storage adapter in between (storage.server.ts).
//
// HTTP contract (JSON unless noted; non-GET requests need "x-ugc: 1"):
//   POST   /api/ugc/uploads                    init (body: InitBody) → 201 InitResult
//   GET    /api/ugc/uploads/:id                → UploadStatus (chunks received, for resume)
//   PUT    /api/ugc/uploads/:id/chunks/:n      raw bytes (exactly chunkSize, last one shorter) → 204
//   POST   /api/ugc/uploads/:id/complete       → { submission } | { asset }
//   PUT    /api/ugc/uploads/:id/poster         raw JPEG/PNG/WebP ≤ 2 MB → { posterUrl }
//   DELETE /api/ugc/uploads/:id                cancel an unfinished upload → 204
//   GET    /api/ugc/files/submissions/:id[?download=1]        Range; owner creator or admin
//   GET    /api/ugc/files/posters/:id                          owner creator or admin
//   GET    /api/ugc/files/assets/:campaignId/:id[?download=1] Range; admin, or a creator on that (non-draft) campaign
//
// Limits: 2 GiB per file; 5 GiB per creator (every stored submission, finished
// or uploading), checked at init and again on every chunk.

type UploadRef = {
  id: string;
  target: "submission" | "asset";
  creatorId: string | null;
  campaignId: string;
  createdAt: number;
};

const idRe = /^[A-Za-z0-9]{6,60}$/;
const ugcId = z.string().regex(idRe);

const common = {
  name: z.string().min(1).max(300),
  size: z.number().int().positive(),
  mime: z.string().max(100).default(""),
  note: z.string().trim().max(1000).optional(),
};

export const initSchema = z.discriminatedUnion("target", [
  z.object({
    target: z.literal("submission"),
    ...common,
    /** Defaults to the creator's current campaign. */
    campaignId: ugcId.optional(),
    platform: z.enum(UGC_POST_PLATFORMS).nullable().optional(),
    shotIds: z.array(z.string().max(40)).max(40).optional(),
    durationS: z
      .number()
      .nonnegative()
      .max(24 * 3600)
      .nullable()
      .optional(),
    width: z.number().int().positive().max(20000).nullable().optional(),
    height: z.number().int().positive().max(20000).nullable().optional(),
    fingerprint: z
      .string()
      .regex(/^[a-f0-9]{16,128}$/)
      .nullable()
      .optional(),
  }),
  z.object({
    target: z.literal("asset"),
    ...common,
    campaignId: ugcId,
    group: z.enum(UGC_ASSET_GROUPS).optional(),
  }),
]);
export type InitBody = z.input<typeof initSchema>;

export type InitResult = {
  id: string;
  target: "submission" | "asset";
  plan: UploadPlan;
  /** Shortcuts for plan.mode === "chunks". */
  chunkSize: number;
  chunks: number;
  quota: UgcQuota | null;
};

export type UploadStatus = {
  id: string;
  target: "submission" | "asset";
  size: number;
  chunkSize: number;
  chunks: number;
  received: number[];
  complete: boolean;
};

const gb = (n: number) => `${Math.round((n / 1024 ** 3) * 10) / 10} GB`;

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

export async function quotaFor(ns: UgcNamespace, creatorId: string): Promise<UgcQuota> {
  return {
    usedBytes: quotaUsed(await listSubmissions(ns, creatorId)),
    limitBytes: UGC.quotaBytes,
    fileLimitBytes: UGC.maxFileBytes,
  };
}

async function getRef(ns: UgcNamespace, id: string) {
  if (!idRe.test(id)) return null;
  return (await ugcStore(ns)).getJSON<UploadRef>(UKEYS.upload(id));
}

/** The record behind an upload, if the caller may write to it. */
async function target(
  ns: UgcNamespace,
  c: UgcCaller,
  id: string,
): Promise<
  | { kind: "submission"; ref: UploadRef; rec: UgcSubmission }
  | { kind: "asset"; ref: UploadRef; rec: UgcAsset }
  | Response
> {
  const ref = await getRef(ns, id);
  if (!ref) return json({ error: "not found" }, 404);
  if (ref.target === "submission") {
    if (c.kind === "creator" && c.creator.id !== ref.creatorId)
      return json({ error: "forbidden" }, 403);
    const rec = await getSubmission(ns, ref.creatorId!, id);
    if (!rec) return json({ error: "not found" }, 404);
    return { kind: "submission", ref, rec };
  }
  if (c.kind !== "admin") return json({ error: "forbidden" }, 403);
  const rec = await getAsset(ns, ref.campaignId, id);
  if (!rec) return json({ error: "not found" }, 404);
  return { kind: "asset", ref, rec };
}

const fileMeta = (
  t: { kind: "submission"; rec: UgcSubmission } | { kind: "asset"; rec: UgcAsset },
) => ({
  storage: t.rec.storage,
  size: t.rec.size,
  chunks: t.rec.chunks,
  mime: t.rec.mime,
  done: t.kind === "submission" ? t.rec.status !== "uploading" : t.rec.complete,
});

/* ---------------------------------------------------------------------------
   Init
   --------------------------------------------------------------------------- */

export async function initUpload(ns: UgcNamespace, c: UgcCaller, body: unknown) {
  const parsed = initSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "invalid" }, 400);
  const d = parsed.data;
  if (d.size > UGC.maxFileBytes)
    return json(
      {
        error: `That file is ${gb(d.size)}. Files can be up to ${gb(UGC.maxFileBytes)}; export at 1080p to make it smaller.`,
      },
      413,
    );
  const id = newId(10);
  const storageKind = configuredStorageKind();
  const storage = ugcStorage(ns, storageKind);
  const ref: UgcStorageRef = { kind: storageKind, key: `files/${id}` };
  const plan = await storage.plan(ref, d.size);
  const chunks = plan.mode === "chunks" ? plan.chunks : plan.parts;
  const store = await ugcStore(ns);
  const now = Date.now();

  if (d.target === "asset") {
    if (c.kind !== "admin") return json({ error: "forbidden" }, 403);
    const campaign = await getCampaign(ns, d.campaignId);
    if (!campaign) return json({ error: "campaign not found" }, 404);
    const mime = resolveUgcMime(d.name, d.mime, UGC_ASSET_TYPES);
    if (!mime) return json({ error: "That file type isn't supported for brief assets." }, 415);
    const asset: UgcAsset = {
      id,
      campaignId: campaign.id,
      name: cleanName(d.name),
      mime,
      size: d.size,
      chunks,
      storage: ref,
      group: d.group ?? (mime === "application/zip" ? "zip" : "other"),
      note: d.note ?? "",
      complete: false,
      createdAt: now,
    };
    await saveAsset(ns, asset);
    await store.setJSON(UKEYS.upload(id), {
      id,
      target: "asset",
      creatorId: null,
      campaignId: campaign.id,
      createdAt: now,
    } satisfies UploadRef);
    return json(
      {
        id,
        target: "asset",
        plan,
        chunkSize: plan.mode === "chunks" ? plan.chunkSize : 0,
        chunks,
        quota: null,
      } satisfies InitResult,
      201,
    );
  }

  if (c.kind !== "creator") return json({ error: "Only creators upload submissions." }, 403);
  const creator = c.creator;
  if (!canUpload(creator.status))
    return json({ error: "Uploads are closed for your account right now." }, 403);
  const campaign = d.campaignId
    ? creator.campaignIds.includes(d.campaignId)
      ? await getCampaign(ns, d.campaignId)
      : null
    : await currentCampaign(ns, creator);
  if (!campaign || campaign.status !== "live")
    return json({ error: "This campaign isn't taking uploads." }, 409);
  const mime = resolveUgcMime(d.name, d.mime);
  if (!mime)
    return json(
      { error: "Upload a video (MP4, MOV, WebM) or a photo (JPG, PNG, WebP, HEIC)." },
      415,
    );

  const subs = await purgeStaleUploads(ns, creator.id, now);
  const used = quotaUsed(subs);
  const quota: UgcQuota = {
    usedBytes: used,
    limitBytes: UGC.quotaBytes,
    fileLimitBytes: UGC.maxFileBytes,
  };
  if (used + d.size > UGC.quotaBytes)
    return json(
      {
        error: `That would take you past your ${gb(UGC.quotaBytes)} upload space (${gb(used)} used). Remove an older upload first.`,
        quota,
      },
      413,
    );

  const shots = new Set(campaign.shots.map((s) => s.id));
  const width = d.width ?? null;
  const height = d.height ?? null;
  const sub: UgcSubmission = {
    id,
    creatorId: creator.id,
    campaignId: campaign.id,
    storage: ref,
    name: cleanName(d.name),
    mime,
    size: d.size,
    chunks,
    mediaType: UGC_SUBMISSION_TYPES[mime].media,
    durationS: d.durationS ?? null,
    width,
    height,
    aspect: aspectOf(width, height),
    poster: null,
    fingerprint: d.fingerprint ?? null,
    shotIds: (d.shotIds ?? []).filter((s) => shots.has(s)),
    platform: d.platform ?? null,
    note: d.note ?? "",
    status: "uploading",
    liveUrl: null,
    disclosureConfirmed: false,
    postedAt: null,
    reviewedAt: null,
    briefVersion: campaign.version,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  await saveSubmission(ns, sub);
  await store.setJSON(UKEYS.upload(id), {
    id,
    target: "submission",
    creatorId: creator.id,
    campaignId: campaign.id,
    createdAt: now,
  } satisfies UploadRef);
  return json(
    {
      id,
      target: "submission",
      plan,
      chunkSize: plan.mode === "chunks" ? plan.chunkSize : 0,
      chunks,
      quota: { ...quota, usedBytes: used + d.size },
    } satisfies InitResult,
    201,
  );
}

/* ---------------------------------------------------------------------------
   Chunks, status, complete, cancel
   --------------------------------------------------------------------------- */

async function discard(ns: UgcNamespace, t: Exclude<Awaited<ReturnType<typeof target>>, Response>) {
  if (t.kind === "submission") await deleteSubmission(ns, t.rec);
  else {
    await ugcStorage(ns, t.rec.storage.kind).remove(t.rec.storage, t.rec.chunks);
    const store = await ugcStore(ns);
    await store.del(UKEYS.asset(t.rec.campaignId, t.rec.id));
    await store.del(UKEYS.upload(t.rec.id));
  }
}

const NOT_WHAT_IT_SAYS =
  "That file doesn't look like what its name says. Export it again as MP4, MOV, JPG or PNG.";

export async function putChunk(
  ns: UgcNamespace,
  c: UgcCaller,
  id: string,
  n: number,
  request: Request,
) {
  const t = await target(ns, c, id);
  if (t instanceof Response) return t;
  const m = fileMeta(t);
  if (m.done) return json({ error: "already complete" }, 409);
  if (!Number.isInteger(n) || n < 0 || n >= m.chunks)
    return json({ error: "bad chunk index" }, 400);
  const expected = n === m.chunks - 1 ? m.size - UGC.chunkBytes * (m.chunks - 1) : UGC.chunkBytes;
  const declared = Number(request.headers.get("content-length") ?? "NaN");
  if (Number.isFinite(declared) && declared !== expected)
    return json({ error: `chunk ${n} should be ${expected} bytes` }, 400);
  if (t.kind === "submission") {
    const subs = await listSubmissions(ns, t.rec.creatorId);
    if (overQuota(subs, t.rec.id))
      return json({ error: `You've used your ${gb(UGC.quotaBytes)} upload space.` }, 413);
  }
  const buf = new Uint8Array(await request.arrayBuffer());
  if (buf.byteLength !== expected)
    return json({ error: `chunk ${n} should be ${expected} bytes` }, 400);
  if (n === 0 && !sniffUgc(m.mime, buf.subarray(0, 64))) {
    await discard(ns, t);
    return json({ error: NOT_WHAT_IT_SAYS }, 415);
  }
  await ugcStorage(ns, m.storage.kind).putChunk(m.storage, n, buf);
  return new Response(null, { status: 204, headers: noStore });
}

export async function uploadStatus(ns: UgcNamespace, c: UgcCaller, id: string) {
  const t = await target(ns, c, id);
  if (t instanceof Response) return t;
  const m = fileMeta(t);
  const received = m.done
    ? Array.from({ length: m.chunks }, (_, i) => i)
    : [...(await ugcStorage(ns, m.storage.kind).receivedChunks(m.storage))].sort((a, b) => a - b);
  return json({
    id,
    target: t.kind,
    size: m.size,
    chunkSize: UGC.chunkBytes,
    chunks: m.chunks,
    received,
    complete: m.done,
  } satisfies UploadStatus);
}

export async function completeUpload(ns: UgcNamespace, c: UgcCaller, id: string) {
  const t = await target(ns, c, id);
  if (t instanceof Response) return t;
  const m = fileMeta(t);
  if (m.done)
    return json(
      t.kind === "submission" ? { submission: submissionView(t.rec) } : { asset: assetView(t.rec) },
    );
  const storage = ugcStorage(ns, m.storage.kind);
  const got = await storage.receivedChunks(m.storage);
  for (let n = 0; n < m.chunks; n++) {
    if (!got.has(n)) return json({ error: `chunk ${n} is missing`, missing: n }, 409);
  }
  const head = await storage.readHead(m.storage, 64);
  if (!head || !sniffUgc(m.mime, head)) {
    await discard(ns, t);
    return json({ error: NOT_WHAT_IT_SAYS }, 415);
  }
  const now = Date.now();
  if (t.kind === "asset") {
    const asset = await saveAsset(ns, { ...t.rec, complete: true });
    const campaign = await getCampaign(ns, asset.campaignId);
    if (campaign) {
      await saveCampaign(ns, {
        ...campaign,
        assetFileIds: campaign.assetFileIds.includes(asset.id)
          ? campaign.assetFileIds
          : [...campaign.assetFileIds, asset.id],
        zipAssetId: campaign.zipAssetId ?? (asset.group === "zip" ? asset.id : null),
      });
    }
    return json({ asset: assetView(asset) });
  }
  const sub = await saveSubmission(ns, {
    ...t.rec,
    status: "in-review",
    completedAt: now,
  });
  await logActivity(ns, sub.creatorId, {
    kind: "upload",
    actor: "creator",
    title: `You uploaded ${sub.name}`,
    body: "It's in review. We'll email you when it's approved or if we need changes.",
    submissionId: sub.id,
  });
  await syncCreatorStatus(ns, sub.creatorId);
  return json({ submission: submissionView(sub) });
}

export async function cancelUpload(ns: UgcNamespace, c: UgcCaller, id: string) {
  const t = await target(ns, c, id);
  if (t instanceof Response) return t.status === 404 ? new Response(null, { status: 204 }) : t;
  if (fileMeta(t).done)
    return json({ error: "That upload is finished. Delete it from My content instead." }, 409);
  await discard(ns, t);
  return new Response(null, { status: 204, headers: noStore });
}

/* ---------------------------------------------------------------------------
   Posters
   --------------------------------------------------------------------------- */

const POSTER_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function putPoster(ns: UgcNamespace, c: UgcCaller, id: string, request: Request) {
  const t = await target(ns, c, id);
  if (t instanceof Response) return t;
  if (t.kind !== "submission") return json({ error: "posters are for submissions" }, 400);
  const mime = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!POSTER_TYPES.includes(mime)) return json({ error: "poster must be JPEG, PNG or WebP" }, 415);
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > UGC.maxPosterBytes) return json({ error: "poster is too big" }, 413);
  const buf = new Uint8Array(await request.arrayBuffer());
  if (!buf.byteLength || buf.byteLength > UGC.maxPosterBytes)
    return json({ error: "poster is empty or too big" }, 413);
  if (!sniffUgc(mime, buf.subarray(0, 64))) return json({ error: NOT_WHAT_IT_SAYS }, 415);
  const key = `posters/${id}`;
  await ugcStorage(ns, t.rec.storage.kind).putObject(key, buf);
  const sub = await saveSubmission(ns, {
    ...t.rec,
    poster: { key, mime, size: buf.byteLength },
  });
  return json({ posterUrl: submissionView(sub).posterUrl });
}

/* ---------------------------------------------------------------------------
   Downloads
   --------------------------------------------------------------------------- */

const INLINE = /^(image\/(png|jpeg|webp|gif|svg\+xml)|video\/|audio\/|application\/pdf)/;

function rangeResponse(
  ns: UgcNamespace,
  f: { storage: UgcStorageRef; name: string; mime: string; size: number },
  opts: { download: boolean; head: boolean; range: string | null },
) {
  const inline = !opts.download && INLINE.test(f.mime);
  const headers: Record<string, string> = {
    "content-type": f.mime,
    "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
    "cache-control": "private, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
    "accept-ranges": "bytes",
  };
  if (f.mime !== "application/pdf")
    headers["content-security-policy"] =
      "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox";
  const range = parseRange(opts.range, f.size);
  if (range === "invalid")
    return new Response(null, {
      status: 416,
      headers: { ...headers, "content-range": `bytes */${f.size}` },
    });
  const start = range ? range.start : 0;
  // A range answer may be shorter than asked; clients ask again for the rest.
  const end = range ? Math.min(range.end, start + UGC.maxResponseBytes - 1) : f.size - 1;
  headers["content-length"] = String(end - start + 1);
  if (range) headers["content-range"] = `bytes ${start}-${end}/${f.size}`;
  const status = range ? 206 : 200;
  if (opts.head) return new Response(null, { status, headers });
  return new Response(ugcStorage(ns, f.storage.kind).stream(f.storage, start, end), {
    status,
    headers,
  });
}

type ServeOpts = { download: boolean; head: boolean; range: string | null };

export async function serveSubmission(
  ns: UgcNamespace,
  c: UgcCaller | null,
  id: string,
  opts: ServeOpts,
) {
  if (!c) return json({ error: "unauthorized" }, 401);
  const ref = await getRef(ns, id);
  if (!ref || ref.target !== "submission") return json({ error: "not found" }, 404);
  if (c.kind === "creator" && c.creator.id !== ref.creatorId)
    return json({ error: "forbidden" }, 403);
  const sub = await getSubmission(ns, ref.creatorId!, id);
  if (!sub || sub.status === "uploading") return json({ error: "not found" }, 404);
  return rangeResponse(ns, sub, opts);
}

export async function servePoster(ns: UgcNamespace, c: UgcCaller | null, id: string) {
  if (!c) return json({ error: "unauthorized" }, 401);
  const ref = await getRef(ns, id);
  if (!ref || ref.target !== "submission") return json({ error: "not found" }, 404);
  if (c.kind === "creator" && c.creator.id !== ref.creatorId)
    return json({ error: "forbidden" }, 403);
  const sub = await getSubmission(ns, ref.creatorId!, id);
  if (!sub?.poster) return json({ error: "not found" }, 404);
  const buf = await ugcStorage(ns, sub.storage.kind).getObject(sub.poster.key);
  if (!buf) return json({ error: "not found" }, 404);
  return new Response(buf, {
    headers: {
      "content-type": sub.poster.mime,
      // the URL carries ?v=<size>, so a replaced poster gets a new URL
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}

export async function serveAsset(
  ns: UgcNamespace,
  c: UgcCaller | null,
  campaignId: string,
  id: string,
  opts: ServeOpts,
) {
  if (!c) return json({ error: "unauthorized" }, 401);
  if (!idRe.test(campaignId) || !idRe.test(id)) return json({ error: "not found" }, 404);
  if (c.kind === "creator") {
    if (!c.creator.campaignIds.includes(campaignId)) return json({ error: "forbidden" }, 403);
    const campaign = await getCampaign(ns, campaignId);
    if (!campaign || campaign.status === "draft") return json({ error: "forbidden" }, 403);
  }
  const asset = await getAsset(ns, campaignId, id);
  if (!asset || !asset.complete) return json({ error: "not found" }, 404);
  return rangeResponse(ns, asset, opts);
}
