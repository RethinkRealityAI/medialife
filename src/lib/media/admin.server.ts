import { mediaTokenConfigured } from "./auth.server";
import { deleteAssets, getAsset, knownValues, listAssets, saveAssets } from "./data.server";
import {
  applyMediaPatch,
  mediaFacets,
  mediaView,
  type MediaAssetView,
  type MediaFacets,
  type MediaKnown,
  type MediaPatch,
} from "./model";
import type { MediaNamespace } from "./store.server";

// What the /admin/media page reads and changes. The server functions in
// admin.functions.ts check the admin cookie and call these.

export type MediaLibraryData = {
  ns: MediaNamespace;
  assets: MediaAssetView[];
  /** Uploads that started but haven't finished (resume them by adding the same file). */
  unfinished: (MediaAssetView & { receivedFraction: number | null })[];
  facets: MediaFacets;
  known: MediaKnown;
  tokenConfigured: boolean;
};

export async function libraryData(ns: MediaNamespace): Promise<MediaLibraryData> {
  const all = await listAssets(ns, { includeIncomplete: true });
  const complete = all.filter((a) => a.complete);
  return {
    ns,
    assets: complete.map(mediaView),
    unfinished: all
      .filter((a) => !a.complete)
      .map((a) => ({ ...mediaView(a), receivedFraction: null })),
    facets: mediaFacets(complete),
    known: knownValues(complete),
    tokenConfigured: mediaTokenConfigured(),
  };
}

export type RowResult = { id: string; ok: boolean; error?: string };

/** One patch for many assets (bulk tag, move, toggle public) or one (the detail drawer). */
export async function updateMedia(
  ns: MediaNamespace,
  ids: string[],
  patch: MediaPatch,
): Promise<{ results: RowResult[]; assets: MediaAssetView[] }> {
  const known = knownValues(await listAssets(ns));
  const now = Date.now();
  const results: RowResult[] = [];
  const changed = [];
  for (const id of [...new Set(ids)]) {
    const a = await getAsset(ns, id);
    if (!a || !a.complete) {
      results.push({ id, ok: false, error: "That file isn't in the library any more." });
      continue;
    }
    changed.push(applyMediaPatch(a, patch, known, now));
    results.push({ id, ok: true });
  }
  await saveAssets(ns, changed);
  return { results, assets: changed.map(mediaView) };
}

export async function deleteMedia(
  ns: MediaNamespace,
  ids: string[],
): Promise<{ results: RowResult[] }> {
  const results: RowResult[] = [];
  const gone = [];
  for (const id of [...new Set(ids)]) {
    const a = await getAsset(ns, id);
    if (!a) {
      results.push({ id, ok: true });
      continue;
    }
    gone.push(a);
    results.push({ id, ok: true });
  }
  await deleteAssets(ns, gone);
  return { results };
}
