import { findCreatorByEmail, issueUgcToken, safeNext } from "./auth.server";
import {
  addComment,
  currentCampaign,
  deleteSubmission,
  getBriefProgress,
  getCampaign,
  getPii,
  getShipment,
  getSubmission,
  listActivity,
  listAssets,
  listComments,
  listPerks,
  listSubmissions,
  logActivity,
  saveBriefProgress,
  saveCreator,
  savePii,
  saveSubmission,
  syncCreatorStatus,
} from "./data.server";
import { sendSignInEmail, type MailResult } from "./mail.server";
import {
  UGC,
  UGC_ASSET_GROUPS,
  UGC_ASSET_GROUP_LABELS,
  UGC_PLATFORMS,
  UGC_ROUTES,
  assetView,
  canSignIn,
  creatorView,
  liveUrlProblem,
  quotaUsed,
  submissionView,
  ugcNextAction,
  ugcTimeline,
  type ShippingAddress,
  type UgcActivity,
  type UgcAssetGroup,
  type UgcAssetView,
  type UgcCampaign,
  type UgcCreator,
  type UgcCreatorView,
  type UgcNextAction,
  type UgcPerk,
  type UgcPlatform,
  type UgcPostPlatform,
  type UgcQuota,
  type UgcShipment,
  type UgcSubmissionStatus,
  type UgcSubmissionView,
  type UgcTimelineStep,
} from "./model";
import type { UgcNamespace } from "./store.server";

// What a signed-in UGC creator can read and change. Every function takes the
// creator resolved from their session, so a creator only ever touches their
// own records. The server functions (creator.functions.ts) are thin wrappers.

export type Ok<T = object> = { ok: true } & T;
export type Fail = { ok: false; error: string };

/** The brief without anything a creator shouldn't see (none today), plus derived bits. */
export type UgcCampaignSummary = Pick<
  UgcCampaign,
  "id" | "title" | "drop" | "summary" | "status" | "version" | "deadline" | "preferredAspect"
> & { coverUrl: string | null };

const summary = (c: UgcCampaign): UgcCampaignSummary => ({
  id: c.id,
  title: c.title,
  drop: c.drop,
  summary: c.summary,
  status: c.status,
  version: c.version,
  deadline: c.deadline,
  preferredAspect: c.preferredAspect,
  coverUrl: c.coverAssetId ? `/api/ugc/files/assets/${c.id}/${c.coverAssetId}` : null,
});

export type UgcHome = {
  creator: UgcCreatorView;
  campaign: UgcCampaignSummary | null;
  shipment: UgcShipment | null;
  timeline: UgcTimelineStep[];
  nextAction: UgcNextAction;
  perks: UgcPerk[];
  quota: UgcQuota;
  submissionCounts: Partial<Record<UgcSubmissionStatus, number>>;
  activity: UgcActivity[];
  /** The brief changed since they last opened it. */
  briefUpdated: boolean;
};

export async function homeFor(ns: UgcNamespace, creator: UgcCreator): Promise<UgcHome> {
  const campaign = await currentCampaign(ns, creator);
  const [shipment, subsAll, perks, activity, progress] = await Promise.all([
    campaign ? getShipment(ns, creator.id, campaign.id) : null,
    listSubmissions(ns, creator.id),
    listPerks(ns, creator.id),
    listActivity(ns, creator.id),
    campaign ? getBriefProgress(ns, creator.id, campaign.id) : null,
  ]);
  const subs = campaign ? subsAll.filter((s) => s.campaignId === campaign.id) : [];
  const input = { creator, campaign, shipment, submissions: subs, perks };
  const counts: Partial<Record<UgcSubmissionStatus, number>> = {};
  for (const s of subs) counts[s.status] = (counts[s.status] ?? 0) + 1;
  return {
    creator: creatorView(creator),
    campaign: campaign ? summary(campaign) : null,
    shipment,
    timeline: ugcTimeline(input),
    nextAction: ugcNextAction(input),
    perks: visiblePerks(perks),
    quota: {
      usedBytes: quotaUsed(subsAll),
      limitBytes: UGC.quotaBytes,
      fileLimitBytes: UGC.maxFileBytes,
    },
    submissionCounts: counts,
    activity: activity.slice(0, 20),
    briefUpdated:
      !!campaign &&
      !!progress &&
      progress.seenVersion > 0 &&
      progress.seenVersion < campaign.version,
  };
}

/** Expired codes stay visible for a week (so "it expired" is explainable), then drop off. */
const visiblePerks = (perks: UgcPerk[], now = Date.now()) =>
  perks.filter((p) => !p.expiresAt || p.expiresAt > now - 7 * 86_400_000);

/* ---------------------------------------------------------------------------
   Brief and assets
   --------------------------------------------------------------------------- */

async function campaignFor(ns: UgcNamespace, creator: UgcCreator, campaignId?: string | null) {
  if (!campaignId) return currentCampaign(ns, creator);
  if (!creator.campaignIds.includes(campaignId)) return null;
  const c = await getCampaign(ns, campaignId);
  return c && c.status !== "draft" ? c : null;
}

export type UgcBrief = {
  campaign: UgcCampaign;
  /** Shots the creator ticked. */
  tickedShotIds: string[];
  /** The version they had seen before this visit (0 = first visit). */
  lastSeenVersion: number;
  cover: UgcAssetView | null;
  howToExample: UgcAssetView | null;
  /** Other campaigns they're on (for a switcher; usually empty). */
  otherCampaigns: UgcCampaignSummary[];
};

/** Reading the brief also records the version as seen. */
export async function briefFor(
  ns: UgcNamespace,
  creator: UgcCreator,
  campaignId?: string | null,
): Promise<UgcBrief | null> {
  const campaign = await campaignFor(ns, creator, campaignId);
  if (!campaign) return null;
  const progress = await getBriefProgress(ns, creator.id, campaign.id);
  if (progress.seenVersion !== campaign.version)
    await saveBriefProgress(ns, creator.id, campaign.id, {
      ...progress,
      seenVersion: campaign.version,
    });
  const assets = await listAssets(ns, campaign);
  const byId = new Map(assets.map((a) => [a.id, a]));
  const others = (
    await Promise.all(
      creator.campaignIds.filter((id) => id !== campaign.id).map((id) => getCampaign(ns, id)),
    )
  ).filter((c): c is UgcCampaign => !!c && c.status !== "draft");
  const shotIds = new Set(campaign.shots.map((s) => s.id));
  return {
    campaign,
    tickedShotIds: progress.shotIds.filter((s) => shotIds.has(s)),
    lastSeenVersion: progress.seenVersion,
    cover:
      campaign.coverAssetId && byId.has(campaign.coverAssetId)
        ? assetView(byId.get(campaign.coverAssetId)!)
        : null,
    howToExample:
      campaign.howTo?.exampleAssetId && byId.has(campaign.howTo.exampleAssetId)
        ? assetView(byId.get(campaign.howTo.exampleAssetId)!)
        : null,
    otherCampaigns: others.map(summary),
  };
}

export async function setShotTicks(
  ns: UgcNamespace,
  creator: UgcCreator,
  campaignId: string,
  shotIds: string[],
): Promise<Ok<{ tickedShotIds: string[] }> | Fail> {
  const campaign = await campaignFor(ns, creator, campaignId);
  if (!campaign) return { ok: false, error: "Campaign not found." };
  const valid = new Set(campaign.shots.map((s) => s.id));
  const ticked = [...new Set(shotIds)].filter((s) => valid.has(s));
  const p = await getBriefProgress(ns, creator.id, campaign.id);
  await saveBriefProgress(ns, creator.id, campaign.id, { ...p, shotIds: ticked });
  return { ok: true, tickedShotIds: ticked };
}

export type UgcAssetGroupView = { group: UgcAssetGroup; label: string; assets: UgcAssetView[] };

export async function assetsFor(
  ns: UgcNamespace,
  creator: UgcCreator,
  campaignId?: string | null,
): Promise<{
  campaign: UgcCampaignSummary;
  groups: UgcAssetGroupView[];
  zip: UgcAssetView | null;
} | null> {
  const campaign = await campaignFor(ns, creator, campaignId);
  if (!campaign) return null;
  const assets = (await listAssets(ns, campaign)).map(assetView);
  const zip = assets.find((a) => a.id === campaign.zipAssetId) ?? null;
  const groups = UGC_ASSET_GROUPS.filter((g) => g !== "zip")
    .map((g) => ({
      group: g,
      label: UGC_ASSET_GROUP_LABELS[g],
      assets: assets.filter((a) => a.group === g),
    }))
    .filter((g) => g.assets.length);
  return { campaign: summary(campaign), groups, zip };
}

/* ---------------------------------------------------------------------------
   Submissions
   --------------------------------------------------------------------------- */

export async function submissionsFor(
  ns: UgcNamespace,
  creator: UgcCreator,
  campaignId?: string | null,
): Promise<{
  campaign: UgcCampaignSummary | null;
  shots: UgcCampaign["shots"];
  tickedShotIds: string[];
  submissions: UgcSubmissionView[];
  quota: UgcQuota;
}> {
  const campaign = await campaignFor(ns, creator, campaignId);
  const all = await listSubmissions(ns, creator.id);
  const subs = campaign ? all.filter((s) => s.campaignId === campaign.id) : all;
  const views = await Promise.all(
    subs.map(async (s) => submissionView(s, await listComments(ns, s.id))),
  );
  const progress = campaign ? await getBriefProgress(ns, creator.id, campaign.id) : null;
  return {
    campaign: campaign ? summary(campaign) : null,
    shots: campaign?.shots ?? [],
    tickedShotIds: progress?.shotIds ?? [],
    submissions: views,
    quota: {
      usedBytes: quotaUsed(all),
      limitBytes: UGC.quotaBytes,
      fileLimitBytes: UGC.maxFileBytes,
    },
  };
}

/** A submission of this creator's, or null (another creator's id reads as not found). */
async function ownSubmission(ns: UgcNamespace, creator: UgcCreator, id: string) {
  return getSubmission(ns, creator.id, id);
}

export async function creatorComment(
  ns: UgcNamespace,
  creator: UgcCreator,
  submissionId: string,
  body: string,
): Promise<Ok<{ comment: Awaited<ReturnType<typeof addComment>> }> | Fail> {
  const sub = await ownSubmission(ns, creator, submissionId);
  if (!sub) return { ok: false, error: "Upload not found." };
  const text = body.trim().slice(0, UGC.maxCommentChars);
  if (!text) return { ok: false, error: "Write a message first." };
  const comment = await addComment(ns, sub.id, {
    author: "creator",
    name: creator.creatorName || creator.name,
    body: text,
  });
  await logActivity(ns, creator.id, {
    kind: "comment",
    actor: "creator",
    title: `You commented on ${sub.name}`,
    body: text.slice(0, 140),
    submissionId: sub.id,
  });
  return { ok: true, comment };
}

export async function setLiveUrl(
  ns: UgcNamespace,
  creator: UgcCreator,
  input: { submissionId: string; url: string; disclosureConfirmed: boolean },
): Promise<Ok<{ submission: UgcSubmissionView }> | Fail> {
  const sub = await ownSubmission(ns, creator, input.submissionId);
  if (!sub) return { ok: false, error: "Upload not found." };
  if (sub.status !== "approved" && sub.status !== "posted")
    return { ok: false, error: "You can add the live link once this upload is approved." };
  if (input.disclosureConfirmed !== true)
    return {
      ok: false,
      error: "Confirm your caption includes #ad or the platform's paid-partnership label.",
    };
  const problem = liveUrlProblem(input.url);
  if (problem) return { ok: false, error: problem };
  const now = Date.now();
  const saved = await saveSubmission(ns, {
    ...sub,
    status: "posted",
    liveUrl: new URL(input.url.trim()).toString(),
    disclosureConfirmed: true,
    postedAt: sub.postedAt ?? now,
  });
  await logActivity(ns, creator.id, {
    kind: "posted",
    actor: "creator",
    title: `You posted ${sub.name}`,
    body: saved.liveUrl ?? "",
    submissionId: sub.id,
  });
  await syncCreatorStatus(ns, creator.id);
  return { ok: true, submission: submissionView(saved, await listComments(ns, sub.id)) };
}

export async function updateSubmission(
  ns: UgcNamespace,
  creator: UgcCreator,
  input: {
    submissionId: string;
    platform?: UgcPostPlatform | null;
    shotIds?: string[];
    note?: string;
  },
): Promise<Ok<{ submission: UgcSubmissionView }> | Fail> {
  const sub = await ownSubmission(ns, creator, input.submissionId);
  if (!sub) return { ok: false, error: "Upload not found." };
  if (sub.status === "approved" || sub.status === "posted")
    return { ok: false, error: "Approved uploads can't be changed." };
  const campaign = await getCampaign(ns, sub.campaignId);
  const valid = new Set(campaign?.shots.map((s) => s.id) ?? []);
  const saved = await saveSubmission(ns, {
    ...sub,
    platform: input.platform !== undefined ? input.platform : sub.platform,
    shotIds: input.shotIds ? input.shotIds.filter((s) => valid.has(s)) : sub.shotIds,
    note: input.note !== undefined ? input.note.trim().slice(0, 1000) : sub.note,
  });
  return { ok: true, submission: submissionView(saved, await listComments(ns, sub.id)) };
}

/** Creators can remove uploads that aren't approved, to free space or replace them. */
export async function removeSubmission(
  ns: UgcNamespace,
  creator: UgcCreator,
  submissionId: string,
): Promise<Ok | Fail> {
  const sub = await ownSubmission(ns, creator, submissionId);
  if (!sub) return { ok: true };
  if (sub.status === "approved" || sub.status === "posted")
    return { ok: false, error: "Approved content stays in your record. Ask us if it needs to go." };
  await deleteSubmission(ns, sub);
  await logActivity(ns, creator.id, {
    kind: "upload",
    actor: "creator",
    title: `You removed ${sub.name}`,
  });
  await syncCreatorStatus(ns, creator.id);
  return { ok: true };
}

/* ---------------------------------------------------------------------------
   Profile and data requests
   --------------------------------------------------------------------------- */

export type UgcProfile = {
  creator: UgcCreatorView;
  phone: string;
  address: ShippingAddress | null;
  /** The address was purged after delivery. */
  addressPurged: boolean;
};

export async function profileFor(ns: UgcNamespace, creator: UgcCreator): Promise<UgcProfile> {
  const pii = await getPii(ns, creator.id);
  return {
    creator: creatorView(creator),
    phone: pii.phone,
    address: pii.address,
    addressPurged: !!pii.purgedAt && !pii.address,
  };
}

export type ProfileInput = {
  creatorName?: string;
  name?: string;
  country?: string;
  handles?: Partial<Record<UgcPlatform, string>>;
  phone?: string;
  address?: ShippingAddress | null;
};

export async function updateProfile(
  ns: UgcNamespace,
  creator: UgcCreator,
  input: ProfileInput,
): Promise<Ok<{ profile: UgcProfile }> | Fail> {
  const c = { ...creator };
  if (input.creatorName !== undefined) c.creatorName = input.creatorName.trim().slice(0, 80);
  if (input.name !== undefined) c.name = input.name.trim().slice(0, 120);
  if (input.country !== undefined) c.country = input.country.trim().slice(0, 80);
  if (input.handles) {
    const handles = { ...c.handles };
    for (const p of UGC_PLATFORMS) {
      if (!(p in input.handles)) continue;
      const v = (input.handles[p] ?? "").trim().slice(0, 200);
      if (v) handles[p] = v;
      else delete handles[p];
    }
    c.handles = handles;
    c.platforms = UGC_PLATFORMS.filter((p) => handles[p]);
    if (c.mainPlatform && !handles[c.mainPlatform]) c.mainPlatform = c.platforms[0] ?? null;
  }
  await saveCreator(ns, c);
  if (input.phone !== undefined || input.address !== undefined) {
    const pii = await getPii(ns, c.id);
    await savePii(ns, {
      ...pii,
      phone: input.phone !== undefined ? input.phone.trim().slice(0, 40) : pii.phone,
      address: input.address !== undefined ? input.address : pii.address,
      purgedAt: input.address ? null : pii.purgedAt,
    });
  }
  await logActivity(ns, c.id, {
    kind: "profile",
    actor: "creator",
    title: "You updated your profile",
  });
  return { ok: true, profile: await profileFor(ns, c) };
}

export async function requestDeletion(
  ns: UgcNamespace,
  creator: UgcCreator,
  note: string,
  cancel = false,
): Promise<Ok<{ deletionRequest: UgcCreator["deletionRequest"] }> | Fail> {
  const c = {
    ...creator,
    deletionRequest: cancel ? null : { at: Date.now(), note: note.trim().slice(0, 1000) },
  };
  await saveCreator(ns, c);
  await logActivity(ns, c.id, {
    kind: "account",
    actor: "creator",
    title: cancel ? "You cancelled your data deletion request" : "You asked us to delete your data",
    body: cancel ? "" : "We'll confirm by email once it's done.",
  });
  return { ok: true, deletionRequest: c.deletionRequest };
}

/* ---------------------------------------------------------------------------
   Sign-in links
   --------------------------------------------------------------------------- */

export async function sendSignInLink(
  ns: UgcNamespace,
  origin: string,
  email: string,
  next?: string | null,
): Promise<{ sent: boolean; devLink?: string }> {
  const creator = await findCreatorByEmail(ns, email);
  // Unknown, still-applied or declined: same answer as success, nothing sent.
  if (!creator || !canSignIn(creator.status)) return { sent: false };
  const token = await issueUgcToken(ns, "login", creator, safeNext(next));
  const url = `${origin}${UGC_ROUTES.auth}?token=${token}`;
  const r: MailResult = await sendSignInEmail(ns, creator.email, url);
  return r.sent ? { sent: true } : { sent: false, devLink: r.devLink };
}
