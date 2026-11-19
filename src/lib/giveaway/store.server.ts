import { namedStore, type ArNamespace, type ArStore } from "@/lib/ar/store.server";
import { hubNs, newId, sha256Hex } from "@/lib/hub/store.server";

// Storage for points giveaways. Same Netlify Blobs / local-file backend and the
// same host namespacing (prod / preview / dev) as the hubs, in its own store
// "giveaway-<ns>" so records never collide with theirs.

export type GwNamespace = ArNamespace;
export type GwStore = ArStore;

export const gwStore = (ns: GwNamespace) => namedStore(`giveaway-${ns}`);
export const gwNs = hubNs;
export { newId, sha256Hex };

export const GKEYS = {
  campaign: (id: string) => `campaigns/${id}`,
  campaigns: () => `campaigns/`,
  slug: (slug: string) => `slugs/${slug}`,

  entrant: (campaignId: string, id: string) => `entrants/${campaignId}/${id}`,
  entrants: (campaignId: string) => `entrants/${campaignId}/`,
  byEmail: (campaignId: string, emailHash: string) => `by-email/${campaignId}/${emailHash}`,
  byRef: (campaignId: string, refCode: string) => `by-ref/${campaignId}/${refCode}`,
  byDiscord: (campaignId: string, discordId: string) => `by-discord/${campaignId}/${discordId}`,

  session: (id: string) => `sessions/${id}`,
  token: (hash: string) => `tokens/${hash}`,

  draw: (campaignId: string, id: string) => `draws/${campaignId}/${id}`,
  draws: (campaignId: string) => `draws/${campaignId}/`,
} as const;

/** Read every JSON record under a prefix, a few at a time (campaigns can have thousands of entrants). */
export async function readAllLimited<T>(store: GwStore, prefix: string, limit = 40): Promise<T[]> {
  const keys = await store.list(prefix);
  const out: T[] = [];
  for (let i = 0; i < keys.length; i += limit) {
    const batch = await Promise.all(keys.slice(i, i + limit).map((k) => store.getJSON<T>(k)));
    for (const x of batch) if (x != null) out.push(x);
  }
  return out;
}
