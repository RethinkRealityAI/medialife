import { getRequest } from "@tanstack/react-start/server";

import {
  namedStore,
  namespaceFromRequest,
  type ArNamespace,
  type ArStore,
} from "@/lib/ar/store.server";

// Storage for the Creator Hub. Same Netlify Blobs / local-file backend and the
// same host namespacing as the activated-retail tools (prod / preview / dev), so
// testing on a deploy preview never touches a real creator's data.
//
// Two stores per namespace:
//   hub-<ns>        JSON records, keyed by path (see KEYS)
//   hub-files-<ns>  file bytes, in ≤4 MB chunks: "<fileId>/<0000>"

export type { ArNamespace as HubNamespace } from "@/lib/ar/store.server";
export type HubStore = ArStore;

export const hubStore = (ns: ArNamespace) => namedStore(`hub-${ns}`);
export const hubFileStore = (ns: ArNamespace) => namedStore(`hub-files-${ns}`);

/** The namespace of the request being served (server functions and API routes). */
export function hubNs(request?: Request): ArNamespace {
  return namespaceFromRequest(request ?? getRequest());
}

/** Every key the hub writes, in one place. */
export const KEYS = {
  user: (id: string) => `users/${id}`,
  userByEmail: (emailHash: string) => `users-by-email/${emailHash}`,
  userByDiscord: (discordId: string) => `users-by-discord/${discordId}`,
  session: (id: string) => `sessions/${id}`,
  token: (hash: string) => `tokens/${hash}`,
  limit: (bucket: string, keyHash: string) => `limits/${bucket}/${keyHash}`,

  creator: (id: string) => `creators/${id}`,
  creatorAdmin: (id: string) => `creator-admin/${id}`,
  creatorIndex: () => `index/creators`,

  product: (creatorId: string, id: string) => `products/${creatorId}/${id}`,
  products: (creatorId: string) => `products/${creatorId}/`,
  code: (code: string) => `codes/${code}`,
  scans: (creatorId: string, productId: string) => `scans/${creatorId}/${productId}`,

  experience: (creatorId: string, id: string) => `experiences/${creatorId}/${id}`,
  experiences: (creatorId: string) => `experiences/${creatorId}/`,

  file: (creatorId: string, id: string) => `files/${creatorId}/${id}`,
  files: (creatorId: string) => `files/${creatorId}/`,

  order: (creatorId: string, id: string) => `orders/${creatorId}/${id}`,
  orders: (creatorId: string) => `orders/${creatorId}/`,
  unmatched: (id: string) => `unmatched-orders/${id}`,
  unmatchedAll: () => `unmatched-orders/`,
  payout: (creatorId: string, id: string) => `payouts/${creatorId}/${id}`,
  payouts: (creatorId: string) => `payouts/${creatorId}/`,

  activity: (creatorId: string) => `activity/${creatorId}`,
  thread: (creatorId: string, productId: string) => `threads/${creatorId}/${productId}`,

  invite: (code: string) => `invites/${code}`,
  invites: () => `invites/`,
} as const;

/** Read every JSON record under a prefix. Records that vanish mid-read are skipped. */
export async function readAll<T>(store: HubStore, prefix: string): Promise<T[]> {
  const keys = await store.list(prefix);
  const out = await Promise.all(keys.map((k) => store.getJSON<T>(k)));
  return out.filter((x): x is Awaited<T> & T => x != null);
}

/** Random, URL-safe id. Sortable by creation time when `timePrefix` is set. */
export function newId(bytes = 12, timePrefix = true): string {
  const rnd = crypto.getRandomValues(new Uint8Array(bytes));
  const body = Buffer.from(rnd).toString("base64url").replace(/[-_]/g, "x");
  return timePrefix ? `${Date.now().toString(36)}${body}` : body;
}

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Buffer.from(d).toString("hex");
}
