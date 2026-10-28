import { namedStore, type ArNamespace, type ArStore } from "@/lib/ar/store.server";
import { hubNs, newId, readAll, sha256Hex } from "@/lib/hub/store.server";

// Storage for the EVADE UGC Hub. Same Netlify Blobs / local-file backend and
// host namespacing as the Creator Hub (prod / preview / dev), but its own
// stores, so UGC records can never collide with Creator Hub ones:
//
//   ugc-<ns>        JSON records, keyed by path (see UKEYS)
//   ugc-files-<ns>  file bytes (see storage.server.ts): "<fileId>/<0000>" chunks
//                   and "posters/<submissionId>"

export type UgcNamespace = ArNamespace;
export type UgcStore = ArStore;

export const ugcStore = (ns: UgcNamespace) => namedStore(`ugc-${ns}`);
export const ugcFileStore = (ns: UgcNamespace) => namedStore(`ugc-files-${ns}`);

/** The namespace of the request being served. */
export const ugcNs = hubNs;

export { newId, readAll, sha256Hex };

/** Every key the UGC Hub writes, in one place. */
export const UKEYS = {
  creator: (id: string) => `creators/${id}`,
  creators: () => `creators/`,
  creatorIndex: () => `index/creators`,
  byEmail: (emailHash: string) => `by-email/${emailHash}`,
  /** Netlify submission id (or CSV row fingerprint) → creator id: makes imports idempotent. */
  imported: (submissionId: string) => `imports/${submissionId}`,
  importLog: () => `import-log`,
  admin: (id: string) => `admin/${id}`,
  pii: (id: string) => `pii/${id}`,
  pis: () => `pii/`,

  session: (id: string) => `sessions/${id}`,
  creatorSessions: (creatorId: string) => `creator-sessions/${creatorId}`,
  token: (hash: string) => `tokens/${hash}`,

  campaign: (id: string) => `campaigns/${id}`,
  campaigns: () => `campaigns/`,
  asset: (campaignId: string, id: string) => `assets/${campaignId}/${id}`,
  assets: (campaignId: string) => `assets/${campaignId}/`,

  shipment: (creatorId: string, campaignId: string) => `shipments/${creatorId}/${campaignId}`,
  shipments: (creatorId: string) => `shipments/${creatorId}/`,

  submission: (creatorId: string, id: string) => `submissions/${creatorId}/${id}`,
  submissions: (creatorId: string) => `submissions/${creatorId}/`,
  submissionIndex: () => `index/submissions`,
  comments: (submissionId: string) => `comments/${submissionId}`,

  /** Upload id → what it's for (a submission or a brief asset). */
  upload: (id: string) => `uploads/${id}`,

  perk: (creatorId: string, id: string) => `perks/${creatorId}/${id}`,
  perks: (creatorId: string) => `perks/${creatorId}/`,

  activity: (creatorId: string) => `activity/${creatorId}`,
  /** Ticked shots + last brief version seen, per creator per campaign. */
  brief: (creatorId: string, campaignId: string) => `briefs/${creatorId}/${campaignId}`,
} as const;
