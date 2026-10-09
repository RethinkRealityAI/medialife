import { namedStore, type ArNamespace, type ArStore } from "@/lib/ar/store.server";

import { DEFAULT_SHELF, shelfConfigSchema, type ShelfConfig } from "./config";
import { isValidShelfSlug, type ShelfDoc, type ShelfStatus, type ShelfSummary } from "./shelves";

// Creator Merch Shelves: one ShelfDoc per shelf in the "ar-shelves-<ns>" store,
// key "<slug>.json", beside the endcap builder's projects (same Blobs / local
// files, same prod / preview / dev split by host). The draft autosaves from
// /admin/shelves; publishing copies it to `published`, which /shelf/<slug> serves.

const docKey = (slug: string) => `${slug}.json`;
const store = (ns: ArNamespace): Promise<ArStore> => namedStore(`ar-shelves-${ns}`);
const ASSET_ID = /^[a-z0-9]{10,40}$/;

type Fail<E extends string = string> = { ok: false; error: E; message?: string };

const sameJSON = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Strictly increasing, so the conflict check can't miss a save in the same ms. */
const bump = (doc: ShelfDoc) => Math.max(Date.now(), doc.updatedAt + 1);

export async function readShelf(ns: ArNamespace, slug: string): Promise<ShelfDoc | null> {
  if (!isValidShelfSlug(slug)) return null;
  const doc = await (await store(ns)).getJSON<ShelfDoc>(docKey(slug)).catch(() => null);
  return doc && typeof doc === "object" && doc.draft ? doc : null;
}

async function writeShelf(ns: ArNamespace, doc: ShelfDoc) {
  await (await store(ns)).setJSON(docKey(doc.slug), doc);
}

/** Every stored shelf (unsorted). Small numbers: tens, not thousands. */
export async function readAllShelves(ns: ArNamespace): Promise<ShelfDoc[]> {
  const s = await store(ns);
  const keys = (await s.list("")).filter((k) => /^[a-z0-9-]+\.json$/.test(k));
  const docs = await Promise.all(keys.map((k) => s.getJSON<ShelfDoc>(k).catch(() => null)));
  return docs.filter((d): d is ShelfDoc => !!d && typeof d === "object" && !!d.draft);
}

export function shelfStatus(doc: ShelfDoc): ShelfStatus {
  if (!doc.published) return "draft";
  return sameJSON(doc.draft, doc.published) ? "published" : "changed";
}

export const snapshotRef = (id: string | null) => (id ? `/api/ar/asset/${id}` : null);

export function summarizeShelf(doc: ShelfDoc): ShelfSummary {
  const shown = doc.published ?? doc.draft;
  return {
    slug: doc.slug,
    name: doc.name || doc.slug,
    creator: doc.draft.creator.name,
    handle: doc.draft.creator.handle,
    neon: shown.theme.neon,
    status: shelfStatus(doc),
    snapshot: snapshotRef(doc.snapshotAssetId),
    publishedAt: doc.publishedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function listShelves(ns: ArNamespace): Promise<ShelfSummary[]> {
  return (await readAllShelves(ns)).map(summarizeShelf).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** First free, valid slug from `base`: base, base-2, base-3… */
export async function freeShelfSlug(ns: ArNamespace, base: string): Promise<string> {
  let root = base.slice(0, 36).replace(/-+$/, "");
  if (root.length < 2) root = `shelf-${root}`.replace(/-+$/, "") || "shelf";
  for (let i = 1; i < 500; i++) {
    const slug = i === 1 ? root : `${root}-${i}`;
    if (!isValidShelfSlug(slug)) continue;
    if (!(await readShelf(ns, slug))) return slug;
  }
  return `${root.slice(0, 30)}-${Date.now().toString(36)}`;
}

/** A starting draft: the default shelf, renamed for the creator when a name is given. */
function startingConfig(creatorName: string | undefined): ShelfConfig {
  const cfg = structuredClone(DEFAULT_SHELF);
  const n = (creatorName ?? "").trim().slice(0, 28);
  if (n) {
    cfg.creator.name = n;
    cfg.pitch.preparedFor = n.slice(0, 60);
  }
  return cfg;
}

export async function createShelf(
  ns: ArNamespace,
  input: { slug: string; name: string; creator?: string; from?: string | null },
): Promise<{ ok: true; doc: ShelfDoc } | Fail<"bad-slug" | "taken" | "not-found">> {
  if (!isValidShelfSlug(input.slug)) return { ok: false, error: "bad-slug" };
  if (await readShelf(ns, input.slug)) return { ok: false, error: "taken" };
  let draft: ShelfConfig;
  let snapshotAssetId: string | null = null;
  if (input.from) {
    const src = await readShelf(ns, input.from);
    if (!src) return { ok: false, error: "not-found" };
    draft = structuredClone(src.draft);
    snapshotAssetId = src.snapshotAssetId;
    // a copy made for another creator: their name on the sign, the rest kept
    const n = (input.creator ?? "").trim().slice(0, 28);
    if (n && n !== draft.creator.name) {
      draft.creator.name = n;
      draft.pitch.preparedFor = draft.pitch.preparedFor ? n : "";
      snapshotAssetId = null; // the old image shows the other name
    }
  } else {
    draft = startingConfig(input.creator);
  }
  const now = Date.now();
  const doc: ShelfDoc = {
    slug: input.slug,
    name: input.name.trim().slice(0, 80) || input.slug,
    draft: shelfConfigSchema.parse(draft),
    published: null,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
    snapshotAssetId,
  };
  await writeShelf(ns, doc);
  return { ok: true, doc };
}

export async function duplicateShelf(
  ns: ArNamespace,
  slug: string,
): Promise<{ ok: true; doc: ShelfDoc } | Fail<"bad-slug" | "taken" | "not-found">> {
  const src = await readShelf(ns, slug);
  if (!src) return { ok: false, error: "not-found" };
  const copySlug = await freeShelfSlug(ns, `${slug}-copy`);
  return createShelf(ns, { slug: copySlug, name: `${src.name} (copy)`, from: slug });
}

export type SaveShelfResult =
  | { ok: true; updatedAt: number; summary: ShelfSummary }
  | Fail<"not-found">
  | { ok: false; error: "invalid"; issues: { path: string; message: string }[] }
  | { ok: false; error: "conflict"; updatedAt: number };

/**
 * Store a draft (validated with shelfConfigSchema). `base` is the updatedAt the
 * editor last saw: when someone saved in between (another tab), the save is
 * refused unless `force`, so two tabs never silently overwrite each other.
 */
export async function saveShelfDraft(
  ns: ArNamespace,
  slug: string,
  input: unknown,
  opts: { base?: number; force?: boolean } = {},
): Promise<SaveShelfResult> {
  const doc = await readShelf(ns, slug);
  if (!doc) return { ok: false, error: "not-found" };
  if (!opts.force && opts.base != null && opts.base !== doc.updatedAt) {
    return { ok: false, error: "conflict", updatedAt: doc.updatedAt };
  }
  const parsed = shelfConfigSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid",
      issues: parsed.error.issues.slice(0, 20).map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    };
  }
  doc.draft = parsed.data;
  doc.updatedAt = bump(doc);
  await writeShelf(ns, doc);
  return { ok: true, updatedAt: doc.updatedAt, summary: summarizeShelf(doc) };
}

/** The internal label; any time. */
export async function renameShelf(
  ns: ArNamespace,
  slug: string,
  name: string,
): Promise<{ ok: true; summary: ShelfSummary; updatedAt: number } | Fail<"not-found">> {
  const doc = await readShelf(ns, slug);
  if (!doc) return { ok: false, error: "not-found" };
  doc.name = name.trim().slice(0, 80) || slug;
  doc.updatedAt = bump(doc);
  await writeShelf(ns, doc);
  return { ok: true, summary: summarizeShelf(doc), updatedAt: doc.updatedAt };
}

/** Change the slug; only while the shelf has never been published (its link may be out). */
export async function moveShelf(
  ns: ArNamespace,
  from: string,
  to: string,
): Promise<{ ok: true; doc: ShelfDoc } | Fail<"not-found" | "bad-slug" | "taken" | "published">> {
  const doc = await readShelf(ns, from);
  if (!doc) return { ok: false, error: "not-found" };
  if (from === to) return { ok: true, doc };
  if (doc.published || doc.publishedAt) return { ok: false, error: "published" };
  if (!isValidShelfSlug(to)) return { ok: false, error: "bad-slug" };
  if (await readShelf(ns, to)) return { ok: false, error: "taken" };
  const moved: ShelfDoc = { ...doc, slug: to, updatedAt: bump(doc) };
  await writeShelf(ns, moved);
  await (await store(ns)).del(docKey(from));
  return { ok: true, doc: moved };
}

export async function publishShelf(
  ns: ArNamespace,
  slug: string,
  opts: { snapshotAssetId?: string | null } = {},
): Promise<
  | { ok: true; doc: ShelfDoc; summary: ShelfSummary; previousSnapshot: string | null }
  | Fail<"not-found" | "invalid">
> {
  const doc = await readShelf(ns, slug);
  if (!doc) return { ok: false, error: "not-found" };
  const parsed = shelfConfigSchema.safeParse(doc.draft);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!parsed.data.products.some((p) => p.enabled)) {
    return { ok: false, error: "invalid", message: "Turn on at least one product." };
  }
  const previous = doc.snapshotAssetId;
  const now = Date.now();
  doc.draft = parsed.data;
  doc.published = structuredClone(parsed.data);
  doc.publishedAt = now;
  doc.updatedAt = Math.max(now, doc.updatedAt + 1);
  if (opts.snapshotAssetId && ASSET_ID.test(opts.snapshotAssetId)) {
    doc.snapshotAssetId = opts.snapshotAssetId;
  }
  await writeShelf(ns, doc);
  return {
    ok: true,
    doc,
    summary: summarizeShelf(doc),
    previousSnapshot: previous && previous !== doc.snapshotAssetId ? previous : null,
  };
}

export async function unpublishShelf(
  ns: ArNamespace,
  slug: string,
): Promise<{ ok: true; summary: ShelfSummary; updatedAt: number } | Fail<"not-found">> {
  const doc = await readShelf(ns, slug);
  if (!doc) return { ok: false, error: "not-found" };
  // publishedAt stays: the slug has been shared, so it remains locked
  doc.published = null;
  doc.updatedAt = bump(doc);
  await writeShelf(ns, doc);
  return { ok: true, summary: summarizeShelf(doc), updatedAt: doc.updatedAt };
}

export async function deleteShelf(
  ns: ArNamespace,
  slug: string,
): Promise<{ ok: true; snapshot: string | null }> {
  const doc = await readShelf(ns, slug);
  if (!doc) return { ok: true, snapshot: null };
  await (await store(ns)).del(docKey(slug));
  return { ok: true, snapshot: doc.snapshotAssetId };
}

/** asset id → shelves that use it (logo, prints, snapshot), for the asset library. */
export async function shelfAssetUsage(
  ns: ArNamespace,
): Promise<Map<string, { slug: string; name: string }[]>> {
  const usage = new Map<string, { slug: string; name: string }[]>();
  for (const doc of await readAllShelves(ns).catch(() => [])) {
    const text = JSON.stringify([doc.draft, doc.published, snapshotRef(doc.snapshotAssetId)]);
    const ids = new Set<string>();
    for (const m of text.matchAll(/"\/api\/ar\/asset\/([a-z0-9]{10,40})"/g)) ids.add(m[1]);
    for (const id of ids) {
      const list = usage.get(id) ?? [];
      list.push({ slug: `shelf:${doc.slug}`, name: `${doc.name} (merch shelf)` });
      usage.set(id, list);
    }
  }
  return usage;
}
