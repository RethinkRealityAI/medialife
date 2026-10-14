import type { CollateralEntry, CollateralSettings } from "./collateral";
import { scopeOwner } from "./collateral";
import { removeLibraryFile } from "./files.server";
import { KEYS, hubStore, readAll, type HubNamespace } from "./store.server";

// Managed collateral (see src/lib/hub/collateral.ts): entries per scope, and the
// built-in pieces each scope hides. Every read and write goes through here.

export async function listCollateral(ns: HubNamespace, scope: string) {
  const all = await readAll<CollateralEntry>(await hubStore(ns), KEYS.collaterals(scope));
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getCollateral(ns: HubNamespace, scope: string, id: string) {
  return (await hubStore(ns)).getJSON<CollateralEntry>(KEYS.collateral(scope, id));
}

export async function saveCollateral(ns: HubNamespace, e: CollateralEntry) {
  await (await hubStore(ns)).setJSON(KEYS.collateral(e.scope, e.id), e);
  return e;
}

/** Removes an entry and the files that were uploaded with it. */
export async function deleteCollateral(ns: HubNamespace, e: CollateralEntry) {
  const owner = scopeOwner(e.scope);
  for (const id of [e.fileId, e.previewFileId]) if (id) await removeLibraryFile(ns, owner, id);
  await (await hubStore(ns)).del(KEYS.collateral(e.scope, e.id));
}

export async function getCollateralSettings(
  ns: HubNamespace,
  scope: string,
): Promise<CollateralSettings> {
  return (
    (await (await hubStore(ns)).getJSON<CollateralSettings>(KEYS.collateralSettings(scope))) ?? {
      hidden: [],
      updatedAt: 0,
    }
  );
}

export async function setBuiltinHidden(
  ns: HubNamespace,
  scope: string,
  id: string,
  hidden: boolean,
) {
  const s = await getCollateralSettings(ns, scope);
  const set = new Set(s.hidden);
  if (hidden) set.add(id);
  else set.delete(id);
  const next = { hidden: [...set], updatedAt: Date.now() };
  await (await hubStore(ns)).setJSON(KEYS.collateralSettings(scope), next);
  return next;
}
