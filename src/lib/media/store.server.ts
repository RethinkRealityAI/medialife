import { namedStore, type ArNamespace, type ArStore } from "@/lib/ar/store.server";
import { hubNs, newId, readAll } from "@/lib/hub/store.server";

// Storage for the Media Library. Same Netlify Blobs / local-file backend and
// host namespacing as the Creator Hub and the UGC Hub (prod / preview / dev),
// but its own stores, so nothing collides with them:
//
//   media-<ns>        JSON records, keyed by path (see MKEYS)
//   media-files-<ns>  file bytes (see storage.server.ts): "files/<id>/<0000>"
//                     chunks and "thumbs/<id>" thumbnails

export type MediaNamespace = ArNamespace;
export type MediaStore = ArStore;

export const mediaStore = (ns: MediaNamespace) => namedStore(`media-${ns}`);
export const mediaFileStore = (ns: MediaNamespace) => namedStore(`media-files-${ns}`);

/** The namespace of the request being served. */
export const mediaNs = hubNs;

export { newId, readAll };

/** Every key the Media Library writes, in one place. */
export const MKEYS = {
  /** The source of truth: one record per asset. */
  asset: (id: string) => `assets/${id}`,
  assets: () => `assets/`,
  /** A derived cache of every record (rebuilt from assets/ when missing). */
  catalog: () => `catalog`,
} as const;
