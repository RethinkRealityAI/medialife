import { MEDIA, type MediaAsset, type MediaKnown } from "./model";
import { mediaStorage } from "./storage.server";
import { MKEYS, mediaStore, readAll, type MediaNamespace } from "./store.server";

// Records for the Media Library.
//
// Each asset is one JSON record ("assets/<id>"): that's the source of truth.
// Listing thousands of records one blob at a time would be slow, so a derived
// "catalog" record holds every asset in one document. Every write updates it
// (read-modify-write with retries); if that ever loses a race, the catalog is
// dropped and the next read rebuilds it from assets/. Nothing caps the number
// of assets; the catalog is a few KB per hundred files.

type Catalog = { v: 1; builtAt: number; assets: Record<string, MediaAsset> };

async function rebuildCatalog(ns: MediaNamespace): Promise<Catalog> {
  const store = await mediaStore(ns);
  const all = await readAll<MediaAsset>(store, MKEYS.assets());
  const cat: Catalog = { v: 1, builtAt: Date.now(), assets: {} };
  for (const a of all) cat.assets[a.id] = a;
  await store.setJSON(MKEYS.catalog(), cat);
  return cat;
}

async function catalog(ns: MediaNamespace): Promise<Catalog> {
  const store = await mediaStore(ns);
  const cat = await store.getJSON<Catalog>(MKEYS.catalog());
  if (cat?.v === 1 && cat.assets) return cat;
  return rebuildCatalog(ns);
}

/** Applies a change to the catalog; drops it (forcing a rebuild) if the change didn't stick. */
async function touchCatalog(
  ns: MediaNamespace,
  change: (assets: Record<string, MediaAsset>) => void,
  check: (assets: Record<string, MediaAsset>) => boolean,
) {
  const store = await mediaStore(ns);
  try {
    const existing = await store.getJSON<Catalog>(MKEYS.catalog());
    if (!existing) return; // the next read rebuilds it, this change included
    await store.update<Catalog>(MKEYS.catalog(), (cur) => {
      const next: Catalog =
        cur?.v === 1 ? { ...cur, assets: { ...cur.assets } } : { v: 1, builtAt: 0, assets: {} };
      change(next.assets);
      return next;
    });
    const after = await store.getJSON<Catalog>(MKEYS.catalog());
    if (!after || !check(after.assets)) await store.del(MKEYS.catalog());
  } catch {
    await store.del(MKEYS.catalog()).catch(() => undefined);
  }
}

export async function getAsset(ns: MediaNamespace, id: string): Promise<MediaAsset | null> {
  if (!/^[A-Za-z0-9]{6,60}$/.test(id)) return null;
  return (await mediaStore(ns)).getJSON<MediaAsset>(MKEYS.asset(id));
}

export async function saveAsset(ns: MediaNamespace, a: MediaAsset): Promise<MediaAsset> {
  await (await mediaStore(ns)).setJSON(MKEYS.asset(a.id), a);
  await touchCatalog(
    ns,
    (all) => {
      all[a.id] = a;
    },
    (all) => all[a.id]?.updatedAt === a.updatedAt,
  );
  return a;
}

/** Saves several records with one catalog write (bulk edits). */
export async function saveAssets(ns: MediaNamespace, list: MediaAsset[]): Promise<void> {
  if (!list.length) return;
  const store = await mediaStore(ns);
  for (let i = 0; i < list.length; i += 25)
    await Promise.all(list.slice(i, i + 25).map((a) => store.setJSON(MKEYS.asset(a.id), a)));
  await touchCatalog(
    ns,
    (all) => {
      for (const a of list) all[a.id] = a;
    },
    (all) => list.every((a) => all[a.id]?.updatedAt === a.updatedAt),
  );
}

/** Deletes records and their bytes. */
export async function deleteAssets(ns: MediaNamespace, list: MediaAsset[]): Promise<void> {
  if (!list.length) return;
  const store = await mediaStore(ns);
  for (const a of list) {
    const storage = mediaStorage(ns, a.storage.kind);
    await storage.remove(a.storage, a.chunks);
    if (a.thumb) await storage.removeObject(a.thumb.key).catch(() => undefined);
    await store.del(MKEYS.asset(a.id));
  }
  const ids = new Set(list.map((a) => a.id));
  await touchCatalog(
    ns,
    (all) => {
      for (const id of ids) delete all[id];
    },
    (all) => [...ids].every((id) => !all[id]),
  );
}

/**
 * Every asset, newest first. Unfinished uploads older than MEDIA.staleUploadMs
 * are cleared on the way (their chunks too).
 */
export async function listAssets(
  ns: MediaNamespace,
  opts: { includeIncomplete?: boolean; now?: number } = {},
): Promise<MediaAsset[]> {
  const now = opts.now ?? Date.now();
  const all = Object.values((await catalog(ns)).assets);
  const stale = all.filter((a) => !a.complete && now - a.createdAt > MEDIA.staleUploadMs);
  if (stale.length) await deleteAssets(ns, stale).catch(() => undefined);
  const staleIds = new Set(stale.map((a) => a.id));
  return all
    .filter((a) => !staleIds.has(a.id) && (opts.includeIncomplete || a.complete))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Existing spellings of clients, collections and tags, so new values line up with them. */
export function knownValues(list: MediaAsset[]): MediaKnown {
  const uniq = (xs: string[]) => {
    const m = new Map<string, string>();
    for (const x of xs) if (x.trim() && !m.has(x.toLowerCase())) m.set(x.toLowerCase(), x);
    return [...m.values()];
  };
  return {
    clients: uniq(list.map((a) => a.client)),
    collections: uniq(list.map((a) => a.collection)),
    tags: uniq(list.flatMap((a) => a.tags)),
  };
}

/** Drops the catalog cache (tests; or after editing records by hand). */
export async function resetCatalog(ns: MediaNamespace) {
  await (await mediaStore(ns)).del(MKEYS.catalog());
}
