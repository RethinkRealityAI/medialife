import { listBatches } from "@/lib/collector/admin.server";
import { KEYS as COLLECTOR_KEYS, collectorStore } from "@/lib/collector/store.server";
import { listCampaigns as listGiveaways } from "@/lib/giveaway/giveaway.server";
import { GKEYS, gwStore } from "@/lib/giveaway/store.server";
import type { HubNamespace } from "@/lib/hub/store.server";
import { listAssets } from "@/lib/media/data.server";
import type { MediaAsset } from "@/lib/media/model";
import {
  getCreator,
  getSubmission,
  listCampaigns as listUgcCampaigns,
  listCreatorSummaries,
  submissionIndex,
} from "@/lib/ugc/data.server";
import type { UgcPlatform, UgcStatus, UgcSubmissionStatus } from "@/lib/ugc/model";

import {
  clientMediaThumbUrl,
  clientMediaUrl,
  clientUgcFileUrl,
  clientUgcPosterUrl,
  type Client,
  type UgcFeedback,
} from "./model";
import { listFeedback } from "./store.server";

// What a client sees of MEDIALIFE's other tools, trimmed to what's theirs and
// safe to show: no creator emails, phone numbers or addresses (creators gave
// those to MEDIALIFE for shipping), no internal notes, no other client's files.

/* ---------------------------------------------------------------------------
   UGC
   --------------------------------------------------------------------------- */

export type ClientUgcCreator = {
  id: string;
  name: string;
  country: string;
  status: UgcStatus;
  statusChangedAt: number;
  handles: Partial<Record<UgcPlatform, string>>;
  followers: Partial<Record<string, number>>;
  reach: number | null;
  joinedAt: number;
  videos: number;
};

export type ClientUgcVideo = {
  id: string;
  creatorId: string;
  creatorName: string;
  campaign: string;
  title: string;
  mediaType: "video" | "image";
  status: UgcSubmissionStatus;
  aspect: string | null;
  durationS: number | null;
  size: number;
  platform: string | null;
  liveUrl: string | null;
  submittedAt: number;
  url: string;
  downloadUrl: string;
  posterUrl: string | null;
  feedback: UgcFeedback | null;
};

/** Sample records (the preview seed) only outside production. */
const keepSample = (ns: HubNamespace, sample?: boolean) => !sample || ns !== "prod";

export async function clientUgc(ns: HubNamespace, client: Client) {
  const [summaries, index, campaigns, feedback] = await Promise.all([
    listCreatorSummaries(ns),
    submissionIndex(ns),
    listUgcCampaigns(ns),
    listFeedback(ns, client.id),
  ]);
  const campaignTitle = new Map(campaigns.map((c) => [c.id, c.title]));
  const fb = new Map(feedback.map((f) => [f.submissionId, f]));
  const creators = summaries.filter((c) => keepSample(ns, c.sample) && !c.deletionRequested);
  const byId = new Map(creators.map((c) => [c.id, c]));

  const refs = Object.values(index).filter(
    (r) => r.status !== "uploading" && byId.has(r.creatorId),
  );
  const subs = await Promise.all(refs.map((r) => getSubmission(ns, r.creatorId, r.id)));
  const videos: ClientUgcVideo[] = [];
  const count = new Map<string, number>();
  for (const s of subs) {
    if (!s || s.status === "uploading" || !keepSample(ns, s.sample)) continue;
    const c = byId.get(s.creatorId);
    if (!c) continue;
    count.set(c.id, (count.get(c.id) ?? 0) + 1);
    videos.push({
      id: s.id,
      creatorId: c.id,
      creatorName: c.creatorName || c.name,
      campaign: campaignTitle.get(s.campaignId) ?? "",
      title: s.name,
      mediaType: s.mediaType,
      status: s.status,
      aspect: s.aspect,
      durationS: s.durationS,
      size: s.size,
      platform: s.platform,
      liveUrl: s.liveUrl,
      submittedAt: s.completedAt ?? s.createdAt,
      url: clientUgcFileUrl(s.id),
      downloadUrl: clientUgcFileUrl(s.id, true),
      posterUrl: s.poster ? clientUgcPosterUrl(s.id, s.poster.size) : null,
      feedback: fb.get(s.id) ?? null,
    });
  }
  videos.sort((a, b) => b.submittedAt - a.submittedAt);

  const out: ClientUgcCreator[] = creators.map((c) => ({
    id: c.id,
    name: c.creatorName || c.name,
    country: c.country,
    status: c.status,
    statusChangedAt: c.statusChangedAt,
    handles: c.handles ?? {},
    followers: c.followers ?? {},
    reach: c.reach ?? null,
    joinedAt: c.createdAt,
    videos: count.get(c.id) ?? 0,
  }));
  out.sort((a, b) => (b.reach ?? -1) - (a.reach ?? -1) || b.joinedAt - a.joinedAt);
  return { creators: out, videos };
}

/** The submission a client may open, or null (missing, uploading, or a creator who asked to be deleted). */
export async function clientMaySeeSubmission(ns: HubNamespace, id: string) {
  const ref = (await submissionIndex(ns))[id];
  if (!ref || ref.status === "uploading") return null;
  const creator = await getCreator(ns, ref.creatorId);
  if (!creator || creator.deletionRequest || !keepSample(ns, creator.sample)) return null;
  return ref;
}

/* ---------------------------------------------------------------------------
   Media Library
   --------------------------------------------------------------------------- */

export type ClientMediaItem = {
  id: string;
  title: string;
  name: string;
  kind: MediaAsset["kind"];
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  durationS: number | null;
  color: string | null;
  description: string;
  usageNotes: string;
  collection: string;
  purpose: MediaAsset["purpose"];
  tags: string[];
  createdAt: number;
  url: string;
  downloadUrl: string;
  thumbUrl: string | null;
  /** Who on the client's team sent it (Uploads page), or null when MEDIALIFE shared it. */
  sentBy: string | null;
  /** Who owns it, e.g. "Owned by EVADE". */
  rights: string;
};

const norm = (s: string) => s.trim().toLowerCase();

/** Is this Media Library file one of the client's? (hidden files excluded unless asked) */
export function isClientAsset(a: MediaAsset, client: Client, includeHidden = false) {
  return (
    a.complete &&
    !!client.mediaClient &&
    norm(a.client) === norm(client.mediaClient) &&
    !a.ingest &&
    (includeHidden || !client.hiddenMedia.includes(a.id))
  );
}

/** A file the hub may serve: shared with the client, or sent by their own team. */
export function clientMayOpen(a: MediaAsset, client: Client) {
  return isClientAsset(a, client) || (a.complete && a.fromClient?.clientId === client.id);
}

export function clientMediaView(a: MediaAsset): ClientMediaItem {
  return {
    id: a.id,
    title: a.title || a.name,
    name: a.name,
    kind: a.kind,
    mime: a.mime,
    size: a.size,
    width: a.width,
    height: a.height,
    durationS: a.durationS,
    color: a.color,
    description: a.description,
    usageNotes: a.usageNotes,
    collection: a.collection,
    purpose: a.purpose,
    tags: a.tags,
    createdAt: a.completedAt ?? a.createdAt,
    url: clientMediaUrl(a.id),
    downloadUrl: clientMediaUrl(a.id, true),
    thumbUrl: a.thumb ? clientMediaThumbUrl(a.id, a.thumb.size) : null,
    sentBy: a.fromClient?.name ?? null,
    rights: a.rights,
  };
}

export async function clientMedia(ns: HubNamespace, client: Client) {
  const all = await listAssets(ns);
  return all
    .filter((a) => isClientAsset(a, client) && !a.fromClient && keepSample(ns, a.sample))
    .map(clientMediaView);
}

/**
 * The content library: everything the client sees (shared by MEDIALIFE) plus
 * everything their own team sent, newest first. Their own uploads always show,
 * even ones MEDIALIFE hid from the shared pages.
 */
export async function clientLibrary(ns: HubNamespace, client: Client) {
  const all = await listAssets(ns);
  return all
    .filter(
      (a) =>
        (a.complete && a.fromClient?.clientId === client.id) ||
        (isClientAsset(a, client) && !a.fromClient && keepSample(ns, a.sample)),
    )
    .sort((x, y) => (y.completedAt ?? y.createdAt) - (x.completedAt ?? x.createdAt))
    .map(clientMediaView);
}

/** For /admin: every file of the client's, with whether the client sees it. */
export async function clientMediaForAdmin(ns: HubNamespace, client: Client) {
  const all = await listAssets(ns);
  return all
    .filter((a) => isClientAsset(a, client, true))
    .map((a) => ({
      ...clientMediaView(a),
      // the team's own preview uses the admin endpoints
      thumbUrl: a.thumb ? `/api/media/thumbs/${a.id}?v=${a.thumb.size}` : null,
      url: `/api/media/files/${a.id}`,
      hidden: client.hiddenMedia.includes(a.id),
    }));
}

/* ---------------------------------------------------------------------------
   Collector Hub and giveaways (numbers only)
   --------------------------------------------------------------------------- */

export async function clientCollector(ns: HubNamespace, client: Client) {
  try {
    const store = await collectorStore(ns);
    const [batches, owners] = await Promise.all([
      listBatches(ns),
      store.list(COLLECTOR_KEYS.owners()),
    ]);
    return {
      owners: owners.length,
      batches: batches
        .filter((b) => b.room === client.id)
        .map((b) => ({
          key: b.key,
          label: b.label || b.product,
          size: b.count,
          claimed: b.claimed,
          status: b.status,
          createdAt: b.createdAt,
        })),
    };
  } catch {
    return { owners: 0, batches: [] };
  }
}

export async function clientGiveaways(ns: HubNamespace, client: Client) {
  if (!client.giveawayIds.length) return [];
  const [all, store] = await Promise.all([listGiveaways(ns), gwStore(ns)]);
  const picked = all.filter((c) => client.giveawayIds.includes(c.id));
  return Promise.all(
    picked.map(async (c) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      status: c.status,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      heroImage: c.heroImage,
      entrants: (await store.list(GKEYS.entrants(c.id))).length,
    })),
  );
}

/** For /admin: every giveaway, to pick which the client sees. */
export async function allGiveawaysBrief(ns: HubNamespace) {
  return (await listGiveaways(ns)).map((c) => ({ id: c.id, title: c.title, status: c.status }));
}
