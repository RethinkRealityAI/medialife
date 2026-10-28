import { normalizeEmail } from "@/lib/hub/auth.server";

import {
  UGC,
  nextCreatorStatus,
  type UgcActivity,
  type UgcActivityKind,
  type UgcAdminFields,
  type UgcAsset,
  type UgcCampaign,
  type UgcComment,
  type UgcCreator,
  type UgcPerk,
  type UgcPii,
  type UgcShipment,
  type UgcStatus,
  type UgcSubmission,
  type UgcSubmissionStatus,
} from "./model";
import { ugcStorage } from "./storage.server";
import { UKEYS, newId, readAll, sha256Hex, ugcStore, type UgcNamespace } from "./store.server";

// Repositories for the UGC Hub. Every read and write of UGC records goes
// through here, so server functions, API routes and the seed agree on keys and
// side effects (indexes, activity entries, the creator's derived status).

/* ---------------------------------------------------------------------------
   Creators
   --------------------------------------------------------------------------- */

/** What the admin pipeline shows without reading every record. */
export type UgcCreatorSummary = {
  id: string;
  name: string;
  creatorName: string;
  email: string;
  status: UgcStatus;
  statusChangedAt: number;
  country: string;
  platforms: string[];
  mainPlatform: string | null;
  campaignIds: string[];
  createdAt: number;
  approvedAt: number | null;
  deletionRequested: boolean;
  sample: boolean;
  /** For the admin pipeline's handle links and audience column (absent on rows indexed before they were added). */
  handles?: UgcCreator["handles"];
  audiences?: UgcCreator["audiences"];
  /** Latest of the record's last change and last sign-in. */
  lastActiveAt?: number;
};

const summarize = (c: UgcCreator): UgcCreatorSummary => ({
  id: c.id,
  name: c.name,
  creatorName: c.creatorName,
  email: c.email,
  status: c.status,
  statusChangedAt: c.statusChangedAt,
  country: c.country,
  platforms: c.platforms,
  mainPlatform: c.mainPlatform,
  campaignIds: c.campaignIds,
  createdAt: c.createdAt,
  approvedAt: c.approvedAt,
  deletionRequested: !!c.deletionRequest,
  sample: !!c.sample,
  handles: c.handles,
  audiences: c.audiences,
  lastActiveAt: Math.max(c.updatedAt, c.lastLoginAt ?? 0),
});

export async function getCreator(ns: UgcNamespace, id: string | null | undefined) {
  if (!id) return null;
  return (await ugcStore(ns)).getJSON<UgcCreator>(UKEYS.creator(id));
}

export async function saveCreator(ns: UgcNamespace, c: UgcCreator) {
  const store = await ugcStore(ns);
  c.updatedAt = Date.now();
  await store.setJSON(UKEYS.creator(c.id), c);
  await store.update<Record<string, UgcCreatorSummary>>(UKEYS.creatorIndex(), (cur) => ({
    ...(cur ?? {}),
    [c.id]: summarize(c),
  }));
  return c;
}

/**
 * Claims an email for a creator. Returns the creator id that holds it: this
 * one, or an existing creator's (then the caller treats it as a duplicate).
 */
export async function claimCreatorEmail(ns: UgcNamespace, email: string, creatorId: string) {
  const store = await ugcStore(ns);
  const key = UKEYS.byEmail(await sha256Hex(normalizeEmail(email)));
  const ref = await store.update<{ creatorId: string }>(key, (cur) => {
    // a claim whose creator record is gone (deleted) can be taken over
    return cur ?? { creatorId };
  });
  if (ref.creatorId === creatorId) return creatorId;
  if (!(await store.getJSON(UKEYS.creator(ref.creatorId)))) {
    await store.setJSON(key, { creatorId });
    return creatorId;
  }
  return ref.creatorId;
}

export async function releaseCreatorEmail(ns: UgcNamespace, email: string, creatorId: string) {
  const store = await ugcStore(ns);
  const key = UKEYS.byEmail(await sha256Hex(normalizeEmail(email)));
  const ref = await store.getJSON<{ creatorId: string }>(key);
  if (ref?.creatorId === creatorId) await store.del(key);
}

export async function listCreatorSummaries(ns: UgcNamespace): Promise<UgcCreatorSummary[]> {
  const idx =
    (await (await ugcStore(ns)).getJSON<Record<string, UgcCreatorSummary>>(UKEYS.creatorIndex())) ??
    {};
  return Object.values(idx).sort((a, b) => b.createdAt - a.createdAt);
}

/** Sets a status, stamps the change and logs it. Returns the saved creator. */
export async function setCreatorStatus(
  ns: UgcNamespace,
  c: UgcCreator,
  status: UgcStatus,
  actor: UgcActivity["actor"] = "medialife",
) {
  if (c.status === status) return c;
  const now = Date.now();
  c.status = status;
  c.statusChangedAt = now;
  if (status === "approved" && !c.approvedAt) c.approvedAt = now;
  await saveCreator(ns, c);
  await logActivity(ns, c.id, {
    kind: "status",
    actor,
    title: `Status: ${status}`,
    body: "",
  });
  return c;
}

/** Re-derives a creator's status from their submissions (after an upload, review or post). */
export async function syncCreatorStatus(ns: UgcNamespace, creatorId: string) {
  const c = await getCreator(ns, creatorId);
  if (!c) return null;
  const subs = await listSubmissions(ns, creatorId);
  const next = nextCreatorStatus(c.status, subs);
  if (next !== c.status) await setCreatorStatus(ns, c, next, "system");
  return c;
}

/* ---------------------------------------------------------------------------
   Admin fields and PII
   --------------------------------------------------------------------------- */

export async function getAdminFields(ns: UgcNamespace, id: string): Promise<UgcAdminFields> {
  return {
    internalNotes: "",
    tags: [],
    ...((await (await ugcStore(ns)).getJSON<UgcAdminFields>(UKEYS.admin(id))) ?? {}),
  };
}

export async function saveAdminFields(ns: UgcNamespace, id: string, f: UgcAdminFields) {
  await (await ugcStore(ns)).setJSON(UKEYS.admin(id), f);
}

export async function getPii(ns: UgcNamespace, creatorId: string): Promise<UgcPii> {
  return (
    (await (await ugcStore(ns)).getJSON<UgcPii>(UKEYS.pii(creatorId))) ?? {
      creatorId,
      phone: "",
      address: null,
      purgeAfter: null,
      purgedAt: null,
      updatedAt: 0,
    }
  );
}

export async function savePii(ns: UgcNamespace, p: UgcPii) {
  p.updatedAt = Date.now();
  await (await ugcStore(ns)).setJSON(UKEYS.pii(p.creatorId), p);
  return p;
}

/** Purges addresses whose 90 days after delivery have passed. Cheap enough to run on admin loads. */
export async function purgeExpiredPii(ns: UgcNamespace, now = Date.now()) {
  const store = await ugcStore(ns);
  const all = await readAll<UgcPii>(store, UKEYS.pis());
  let purged = 0;
  for (const p of all) {
    if (p.purgeAfter && p.purgeAfter < now && p.address) {
      await savePii(ns, { ...p, address: null, purgeAfter: null, purgedAt: now });
      purged++;
    }
  }
  return purged;
}

/* ---------------------------------------------------------------------------
   Campaigns and brief assets
   --------------------------------------------------------------------------- */

export async function getCampaign(ns: UgcNamespace, id: string | null | undefined) {
  if (!id) return null;
  return (await ugcStore(ns)).getJSON<UgcCampaign>(UKEYS.campaign(id));
}

export async function saveCampaign(ns: UgcNamespace, c: UgcCampaign) {
  c.updatedAt = Date.now();
  await (await ugcStore(ns)).setJSON(UKEYS.campaign(c.id), c);
  return c;
}

export async function listCampaigns(ns: UgcNamespace) {
  const all = await readAll<UgcCampaign>(await ugcStore(ns), UKEYS.campaigns());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteCampaignRecord(ns: UgcNamespace, id: string) {
  await (await ugcStore(ns)).del(UKEYS.campaign(id));
}

/**
 * The campaign a creator works on now: the most recently assigned one that is
 * live (else closed, so a finished creator still sees their brief).
 */
export async function currentCampaign(
  ns: UgcNamespace,
  c: Pick<UgcCreator, "campaignIds">,
): Promise<UgcCampaign | null> {
  const all = (await Promise.all(c.campaignIds.map((id) => getCampaign(ns, id)))).filter(
    (x): x is UgcCampaign => !!x && x.status !== "draft",
  );
  const live = all.filter((x) => x.status === "live");
  return live.at(-1) ?? all.at(-1) ?? null;
}

export async function getAsset(ns: UgcNamespace, campaignId: string, id: string) {
  return (await ugcStore(ns)).getJSON<UgcAsset>(UKEYS.asset(campaignId, id));
}

export async function saveAsset(ns: UgcNamespace, a: UgcAsset) {
  await (await ugcStore(ns)).setJSON(UKEYS.asset(a.campaignId, a.id), a);
  return a;
}

/** Complete assets in the campaign's display order (unordered ones last, newest first). */
export async function listAssets(
  ns: UgcNamespace,
  campaign: UgcCampaign,
  includeIncomplete = false,
) {
  const all = await readAll<UgcAsset>(await ugcStore(ns), UKEYS.assets(campaign.id));
  const order = new Map(campaign.assetFileIds.map((id, i) => [id, i]));
  return all
    .filter((a) => includeIncomplete || a.complete)
    .sort(
      (a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9) || b.createdAt - a.createdAt,
    );
}

export async function deleteAsset(ns: UgcNamespace, a: UgcAsset) {
  await ugcStorage(ns, a.storage.kind).remove(a.storage, a.chunks);
  const store = await ugcStore(ns);
  await store.del(UKEYS.asset(a.campaignId, a.id));
  await store.del(UKEYS.upload(a.id));
  const c = await getCampaign(ns, a.campaignId);
  if (c) {
    await saveCampaign(ns, {
      ...c,
      assetFileIds: c.assetFileIds.filter((x) => x !== a.id),
      coverAssetId: c.coverAssetId === a.id ? null : c.coverAssetId,
      zipAssetId: c.zipAssetId === a.id ? null : c.zipAssetId,
      howTo:
        c.howTo && c.howTo.exampleAssetId === a.id ? { ...c.howTo, exampleAssetId: null } : c.howTo,
    });
  }
}

/* ---------------------------------------------------------------------------
   Shipments
   --------------------------------------------------------------------------- */

export async function getShipment(ns: UgcNamespace, creatorId: string, campaignId: string) {
  return (await ugcStore(ns)).getJSON<UgcShipment>(UKEYS.shipment(creatorId, campaignId));
}

export async function saveShipment(ns: UgcNamespace, s: UgcShipment) {
  s.updatedAt = Date.now();
  await (await ugcStore(ns)).setJSON(UKEYS.shipment(s.creatorId, s.campaignId), s);
  return s;
}

export async function listShipments(ns: UgcNamespace, creatorId: string) {
  return readAll<UgcShipment>(await ugcStore(ns), UKEYS.shipments(creatorId));
}

export const emptyShipment = (
  creatorId: string,
  campaignId: string,
  items: string[] = [],
): UgcShipment => ({
  id: campaignId,
  creatorId,
  campaignId,
  items,
  carrier: "",
  tracking: "",
  trackingUrl: null,
  packedAt: null,
  shippedAt: null,
  deliveredAt: null,
  updatedAt: Date.now(),
});

/* ---------------------------------------------------------------------------
   Submissions and comments
   --------------------------------------------------------------------------- */

export type UgcSubmissionRef = {
  id: string;
  creatorId: string;
  campaignId: string;
  status: UgcSubmissionStatus;
  createdAt: number;
  completedAt: number | null;
};

export async function getSubmission(ns: UgcNamespace, creatorId: string, id: string) {
  return (await ugcStore(ns)).getJSON<UgcSubmission>(UKEYS.submission(creatorId, id));
}

/** A submission by id alone (through the index). */
export async function findSubmission(ns: UgcNamespace, id: string) {
  const ref = (await submissionIndex(ns))[id];
  return ref ? getSubmission(ns, ref.creatorId, id) : null;
}

export async function saveSubmission(ns: UgcNamespace, s: UgcSubmission) {
  const store = await ugcStore(ns);
  s.updatedAt = Date.now();
  await store.setJSON(UKEYS.submission(s.creatorId, s.id), s);
  await store.update<Record<string, UgcSubmissionRef>>(UKEYS.submissionIndex(), (cur) => ({
    ...(cur ?? {}),
    [s.id]: {
      id: s.id,
      creatorId: s.creatorId,
      campaignId: s.campaignId,
      status: s.status,
      createdAt: s.createdAt,
      completedAt: s.completedAt,
    },
  }));
  return s;
}

export async function submissionIndex(ns: UgcNamespace) {
  return (
    (await (
      await ugcStore(ns)
    ).getJSON<Record<string, UgcSubmissionRef>>(UKEYS.submissionIndex())) ?? {}
  );
}

export async function listSubmissions(ns: UgcNamespace, creatorId: string) {
  const all = await readAll<UgcSubmission>(await ugcStore(ns), UKEYS.submissions(creatorId));
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteSubmission(ns: UgcNamespace, s: UgcSubmission) {
  const storage = ugcStorage(ns, s.storage.kind);
  await storage.remove(s.storage, s.chunks);
  if (s.poster) await storage.removeObject(s.poster.key);
  const store = await ugcStore(ns);
  await store.del(UKEYS.submission(s.creatorId, s.id));
  await store.del(UKEYS.comments(s.id));
  await store.del(UKEYS.upload(s.id));
  await store.update<Record<string, UgcSubmissionRef>>(UKEYS.submissionIndex(), (cur) => {
    const next = { ...(cur ?? {}) };
    delete next[s.id];
    return next;
  });
}

/** Clears a creator's uploads that never finished (older than UGC.staleUploadMs). */
export async function purgeStaleUploads(ns: UgcNamespace, creatorId: string, now = Date.now()) {
  const subs = await listSubmissions(ns, creatorId);
  const stale = subs.filter(
    (s) => s.status === "uploading" && s.createdAt < now - UGC.staleUploadMs,
  );
  for (const s of stale) await deleteSubmission(ns, s);
  return subs.filter((s) => !stale.includes(s));
}

export async function listComments(ns: UgcNamespace, submissionId: string) {
  return (await (await ugcStore(ns)).getJSON<UgcComment[]>(UKEYS.comments(submissionId))) ?? [];
}

export async function addComment(
  ns: UgcNamespace,
  submissionId: string,
  c: Omit<UgcComment, "id" | "at" | "submissionId" | "atSeconds"> & { atSeconds?: number | null },
) {
  const comment: UgcComment = {
    id: newId(6),
    submissionId,
    author: c.author,
    name: c.name,
    body: c.body,
    atSeconds: c.atSeconds ?? null,
    at: Date.now(),
  };
  await (
    await ugcStore(ns)
  ).update<UgcComment[]>(UKEYS.comments(submissionId), (cur) =>
    [...(cur ?? []), comment].slice(-300),
  );
  return comment;
}

/* ---------------------------------------------------------------------------
   Perks, activity, brief progress
   --------------------------------------------------------------------------- */

export async function listPerks(ns: UgcNamespace, creatorId: string) {
  const all = await readAll<UgcPerk>(await ugcStore(ns), UKEYS.perks(creatorId));
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getPerk(ns: UgcNamespace, creatorId: string, id: string) {
  return (await ugcStore(ns)).getJSON<UgcPerk>(UKEYS.perk(creatorId, id));
}

export async function savePerk(ns: UgcNamespace, p: UgcPerk) {
  p.updatedAt = Date.now();
  await (await ugcStore(ns)).setJSON(UKEYS.perk(p.creatorId, p.id), p);
  return p;
}

export async function deletePerk(ns: UgcNamespace, creatorId: string, id: string) {
  await (await ugcStore(ns)).del(UKEYS.perk(creatorId, id));
}

const ACTIVITY_CAP = 200;

export async function logActivity(
  ns: UgcNamespace,
  creatorId: string,
  a: {
    kind: UgcActivityKind;
    title: string;
    body?: string;
    actor?: UgcActivity["actor"];
    submissionId?: string | null;
    at?: number;
  },
) {
  const entry: UgcActivity = {
    id: newId(6),
    at: a.at ?? Date.now(),
    kind: a.kind,
    title: a.title,
    body: a.body ?? "",
    actor: a.actor ?? "system",
    submissionId: a.submissionId ?? null,
  };
  await (
    await ugcStore(ns)
  ).update<UgcActivity[]>(UKEYS.activity(creatorId), (cur) =>
    [entry, ...(cur ?? [])].sort((x, y) => y.at - x.at).slice(0, ACTIVITY_CAP),
  );
  return entry;
}

export async function listActivity(ns: UgcNamespace, creatorId: string) {
  return (await (await ugcStore(ns)).getJSON<UgcActivity[]>(UKEYS.activity(creatorId))) ?? [];
}

export type BriefProgress = { shotIds: string[]; seenVersion: number; updatedAt: number };

export async function getBriefProgress(
  ns: UgcNamespace,
  creatorId: string,
  campaignId: string,
): Promise<BriefProgress> {
  return (
    (await (await ugcStore(ns)).getJSON<BriefProgress>(UKEYS.brief(creatorId, campaignId))) ?? {
      shotIds: [],
      seenVersion: 0,
      updatedAt: 0,
    }
  );
}

export async function saveBriefProgress(
  ns: UgcNamespace,
  creatorId: string,
  campaignId: string,
  p: BriefProgress,
) {
  p.updatedAt = Date.now();
  await (await ugcStore(ns)).setJSON(UKEYS.brief(creatorId, campaignId), p);
  return p;
}

/** imports/<submissionId>: which creator a form submission became (null once deleted). */
export type ImportRef = { creatorId: string | null; at?: number; deletedAt?: number };

/* ---------------------------------------------------------------------------
   Deleting a creator's data
   --------------------------------------------------------------------------- */

/** Removes phone and address (keeps the creator and their content). */
export async function purgePii(ns: UgcNamespace, creatorId: string) {
  const p = await getPii(ns, creatorId);
  await savePii(ns, { ...p, phone: "", address: null, purgeAfter: null, purgedAt: Date.now() });
}

/** Removes everything held about a creator: records, files, sessions, indexes. */
export async function deleteCreatorEverything(ns: UgcNamespace, creatorId: string) {
  const c = await getCreator(ns, creatorId);
  const store = await ugcStore(ns);
  for (const s of await listSubmissions(ns, creatorId)) await deleteSubmission(ns, s);
  for (const p of await listPerks(ns, creatorId)) await deletePerk(ns, creatorId, p.id);
  for (const s of await listShipments(ns, creatorId))
    await store.del(UKEYS.shipment(creatorId, s.campaignId));
  for (const k of await store.list(`briefs/${creatorId}/`)) await store.del(k);
  const sessions = (await store.getJSON<string[]>(UKEYS.creatorSessions(creatorId))) ?? [];
  await Promise.all(sessions.map((id) => store.del(UKEYS.session(id))));
  await store.del(UKEYS.creatorSessions(creatorId));
  await store.del(UKEYS.pii(creatorId));
  await store.del(UKEYS.admin(creatorId));
  await store.del(UKEYS.activity(creatorId));
  if (c) await releaseCreatorEmail(ns, c.email, creatorId);
  // Keep the import markers (without the creator) so a re-sync from Netlify
  // doesn't bring the deleted sign-up back.
  for (const k of await store.list("imports/")) {
    const ref = await store.getJSON<ImportRef>(k);
    if (ref?.creatorId === creatorId)
      await store.setJSON(k, { creatorId: null, deletedAt: Date.now() } satisfies ImportRef);
  }
  await store.del(UKEYS.creator(creatorId));
  await store.update<Record<string, UgcCreatorSummary>>(UKEYS.creatorIndex(), (cur) => {
    const next = { ...(cur ?? {}) };
    delete next[creatorId];
    return next;
  });
}
