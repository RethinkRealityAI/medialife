import { endAllUgcSessions, findCreatorByEmail, issueUgcToken } from "./auth.server";
import {
  addComment,
  claimCreatorEmail,
  releaseCreatorEmail,
  currentCampaign,
  deleteAsset,
  deleteCampaignRecord,
  deleteCreatorEverything,
  deletePerk,
  emptyShipment,
  getAdminFields,
  getAsset,
  getCampaign,
  getCreator,
  getPerk,
  getPii,
  getShipment,
  getSubmission,
  listActivity,
  listAssets,
  listCampaigns,
  listComments,
  listCreatorSummaries,
  listPerks,
  listShipments,
  listSubmissions,
  logActivity,
  purgeExpiredPii,
  purgePii,
  saveAdminFields,
  saveAsset,
  saveCampaign,
  saveCreator,
  savePerk,
  savePii,
  saveShipment,
  saveSubmission,
  setCreatorStatus,
  submissionIndex,
  syncCreatorStatus,
  type UgcCreatorSummary,
} from "./data.server";
import { parseCodesCsv, parseTrackingCsv, toCsv } from "./import";
import { importSignup, manualSignup, type ManualCreatorInput } from "./import.server";
import { sendJoinEmail, sendUgcNotice } from "./mail.server";
import {
  UGC,
  UGC_DEFAULT_DISCLOSURE,
  UGC_PIPELINE,
  UGC_ROUTES,
  UGC_STATUSES,
  assetView,
  canSignIn,
  canTransition,
  liveUrlProblem,
  quotaUsed,
  submissionView,
  trackingUrlFor,
  type ShippingAddress,
  type UgcActivity,
  type UgcAdminFields,
  type UgcAssetGroup,
  type UgcAssetView,
  type UgcCampaign,
  type UgcCreator,
  type UgcPerk,
  type UgcPerkKind,
  type UgcPii,
  type UgcQuota,
  type UgcShipment,
  type UgcShot,
  type UgcStatus,
  type UgcSubmission,
  type UgcSubmissionStatus,
  type UgcSubmissionView,
} from "./model";
import { newId, type UgcNamespace } from "./store.server";
import type { Fail, Ok } from "./creator.server";

// The MEDIALIFE side of the UGC Hub (/admin/ugc). Callers have already passed
// the admin check (requireHubAdmin in admin.functions.ts). `origin` is the
// public origin for links in emails (publicOrigin()).

const MAILABLE = (c: UgcCreator) => canSignIn(c.status) && !!c.email;
const hubUrl = (origin: string, path: string = UGC_ROUTES.home) => `${origin}${path}`;

/* ---------------------------------------------------------------------------
   Pipeline
   --------------------------------------------------------------------------- */

export type PipelineFilters = {
  status?: UgcStatus | "all" | "deletion-requested";
  campaignId?: string | null;
  q?: string;
};

export type PipelineResult = {
  creators: UgcCreatorSummary[];
  /** Over every creator (ignores the filters), for the tabs. */
  counts: Record<UgcStatus | "all" | "deletion-requested", number>;
  campaigns: { id: string; title: string; status: UgcCampaign["status"] }[];
};

export async function pipeline(ns: UgcNamespace, f: PipelineFilters = {}): Promise<PipelineResult> {
  await purgeExpiredPii(ns);
  const all = await listCreatorSummaries(ns);
  const counts = Object.fromEntries(
    [...UGC_STATUSES, "all", "deletion-requested"].map((s) => [s, 0]),
  ) as PipelineResult["counts"];
  for (const c of all) {
    counts[c.status]++;
    counts.all++;
    if (c.deletionRequested) counts["deletion-requested"]++;
  }
  const q = f.q?.trim().toLowerCase();
  const creators = all.filter(
    (c) =>
      (!f.status ||
        f.status === "all" ||
        (f.status === "deletion-requested" ? c.deletionRequested : c.status === f.status)) &&
      (!f.campaignId || c.campaignIds.includes(f.campaignId)) &&
      (!q || [c.name, c.creatorName, c.email, c.country].some((v) => v.toLowerCase().includes(q))),
  );
  const campaigns = (await listCampaigns(ns)).map((c) => ({
    id: c.id,
    title: c.title,
    status: c.status,
  }));
  return { creators, counts, campaigns };
}

export type AdminCreatorDetail = {
  creator: UgcCreator;
  admin: UgcAdminFields;
  pii: UgcPii;
  campaigns: { id: string; title: string; status: UgcCampaign["status"] }[];
  shipments: UgcShipment[];
  submissions: UgcSubmissionView[];
  perks: UgcPerk[];
  activity: UgcActivity[];
  quota: UgcQuota;
};

export async function creatorDetail(
  ns: UgcNamespace,
  id: string,
): Promise<AdminCreatorDetail | null> {
  const creator = await getCreator(ns, id);
  if (!creator) return null;
  const [admin, pii, shipments, subs, perks, activity] = await Promise.all([
    getAdminFields(ns, id),
    getPii(ns, id),
    listShipments(ns, id),
    listSubmissions(ns, id),
    listPerks(ns, id),
    listActivity(ns, id),
  ]);
  const campaigns = (await Promise.all(creator.campaignIds.map((c) => getCampaign(ns, c))))
    .filter((c): c is UgcCampaign => !!c)
    .map((c) => ({ id: c.id, title: c.title, status: c.status }));
  return {
    creator,
    admin,
    pii,
    campaigns,
    shipments,
    submissions: await Promise.all(
      subs.map(async (s) => submissionView(s, await listComments(ns, s.id))),
    ),
    perks,
    activity,
    quota: {
      usedBytes: quotaUsed(subs),
      limitBytes: UGC.quotaBytes,
      fileLimitBytes: UGC.maxFileBytes,
    },
  };
}

/* ---------------------------------------------------------------------------
   Status changes
   --------------------------------------------------------------------------- */

export type StatusResult = {
  id: string;
  ok: boolean;
  error?: string;
  status?: UgcStatus;
  /** Join link (localhost and previews without RESEND_API_KEY). */
  devLink?: string;
  emailed?: boolean;
};

async function assignDefaultCampaign(ns: UgcNamespace, c: UgcCreator, campaignId?: string | null) {
  if (campaignId) {
    const campaign = await getCampaign(ns, campaignId);
    if (campaign && !c.campaignIds.includes(campaignId))
      c.campaignIds = [...c.campaignIds, campaignId];
    return;
  }
  if (c.campaignIds.length) return;
  const live = (await listCampaigns(ns)).filter((x) => x.status === "live");
  if (live.length === 1) c.campaignIds = [live[0].id];
}

/** Issues and emails a join link. */
export async function sendJoinLink(ns: UgcNamespace, origin: string, c: UgcCreator) {
  const token = await issueUgcToken(ns, "join", c, UGC_ROUTES.home);
  const r = await sendJoinEmail(
    ns,
    c.email,
    c.creatorName || c.name.split(" ")[0] || "",
    `${origin}${UGC_ROUTES.auth}?token=${token}`,
  );
  return r.sent ? { emailed: true } : { emailed: false, devLink: r.devLink };
}

export async function updateStatuses(
  ns: UgcNamespace,
  origin: string,
  input: {
    ids: string[];
    status: UgcStatus;
    force?: boolean;
    notify?: boolean;
    campaignId?: string | null;
  },
): Promise<StatusResult[]> {
  const out: StatusResult[] = [];
  for (const id of input.ids) {
    const c = await getCreator(ns, id);
    if (!c) {
      out.push({ id, ok: false, error: "not found" });
      continue;
    }
    if (c.status === input.status) {
      out.push({ id, ok: true, status: c.status });
      continue;
    }
    if (!input.force && !canTransition(c.status, input.status)) {
      out.push({ id, ok: false, error: `Can't move from ${c.status} to ${input.status}.` });
      continue;
    }
    const firstApproval =
      input.status === "approved" && (c.status === "applied" || c.status === "declined");
    if (input.status === "approved") await assignDefaultCampaign(ns, c, input.campaignId);
    await setCreatorStatus(ns, c, input.status, "medialife");
    const r: StatusResult = { id, ok: true, status: c.status };

    if (firstApproval && input.notify !== false)
      Object.assign(r, await sendJoinLink(ns, origin, c));
    const campaign = await currentCampaign(ns, c);
    if (campaign && (input.status === "shipped" || input.status === "delivered")) {
      const sh =
        (await getShipment(ns, c.id, campaign.id)) ??
        emptyShipment(c.id, campaign.id, campaign.items);
      const now = Date.now();
      if (input.status === "shipped") sh.shippedAt ??= now;
      if (input.status === "delivered") {
        sh.shippedAt ??= now;
        sh.deliveredAt ??= now;
        await schedulePurge(ns, c.id, sh.deliveredAt);
      }
      sh.packedAt ??= sh.shippedAt;
      await saveShipment(ns, sh);
    }
    if (input.status === "declined") await endAllUgcSessions(ns, c.id);
    out.push(r);
  }
  return out;
}

export async function resendJoin(
  ns: UgcNamespace,
  origin: string,
  id: string,
): Promise<StatusResult> {
  const c = await getCreator(ns, id);
  if (!c) return { id, ok: false, error: "not found" };
  if (!canSignIn(c.status)) return { id, ok: false, error: "Approve them first." };
  return { id, ok: true, status: c.status, ...(await sendJoinLink(ns, origin, c)) };
}

export async function saveNotes(ns: UgcNamespace, id: string, f: UgcAdminFields) {
  if (!(await getCreator(ns, id))) return { ok: false as const, error: "not found" };
  await saveAdminFields(ns, id, {
    internalNotes: f.internalNotes.slice(0, 5000),
    tags: [...new Set(f.tags.map((t) => t.trim().slice(0, 32)).filter(Boolean))].slice(0, 20),
  });
  return { ok: true as const };
}

export type AdminCreatorEdit = Partial<
  Pick<UgcCreator, "name" | "creatorName" | "email" | "country" | "handles" | "mainPlatform">
> & { phone?: string; address?: ShippingAddress | null };

export async function editCreator(
  ns: UgcNamespace,
  id: string,
  patch: AdminCreatorEdit,
): Promise<Ok<{ creator: UgcCreator }> | Fail> {
  const c = await getCreator(ns, id);
  if (!c) return { ok: false, error: "not found" };
  if (patch.email && patch.email.toLowerCase() !== c.email) {
    const other = await findCreatorByEmail(ns, patch.email);
    if (other && other.id !== id) return { ok: false, error: "Another creator has that email." };
    await claimCreatorEmail(ns, patch.email.toLowerCase(), id);
    await releaseCreatorEmail(ns, c.email, id);
    c.email = patch.email.toLowerCase();
  }
  if (patch.name !== undefined) c.name = patch.name;
  if (patch.creatorName !== undefined) c.creatorName = patch.creatorName;
  if (patch.country !== undefined) c.country = patch.country;
  if (patch.handles) {
    c.handles = Object.fromEntries(Object.entries(patch.handles).filter(([, v]) => v?.trim()));
    c.platforms = (Object.keys(c.handles) as UgcCreator["platforms"]).filter(Boolean);
  }
  if (patch.mainPlatform !== undefined) c.mainPlatform = patch.mainPlatform;
  await saveCreator(ns, c);
  if (patch.phone !== undefined || patch.address !== undefined) {
    const p = await getPii(ns, id);
    await savePii(ns, {
      ...p,
      phone: patch.phone ?? p.phone,
      address: patch.address !== undefined ? patch.address : p.address,
    });
  }
  return { ok: true, creator: c };
}

export async function addCreator(
  ns: UgcNamespace,
  origin: string,
  input: ManualCreatorInput & { notify?: boolean; campaignId?: string | null },
): Promise<Ok<{ creatorId: string; result: string; devLink?: string }> | Fail> {
  const signup = manualSignup(input);
  if ("error" in signup) return { ok: false, error: signup.error };
  const r = await importSignup(ns, signup);
  if (r.result !== "created" || !r.creatorId)
    return { ok: false, error: "A creator with that email already exists." };
  let devLink: string | undefined;
  if (input.status === "approved") {
    const [res] = await updateStatuses(ns, origin, {
      ids: [r.creatorId],
      status: "approved",
      notify: input.notify,
      campaignId: input.campaignId,
    });
    devLink = res?.devLink;
  }
  return { ok: true, creatorId: r.creatorId, result: r.result, devLink };
}

/* ---------------------------------------------------------------------------
   Campaigns
   --------------------------------------------------------------------------- */

export type CampaignInput = Partial<
  Omit<
    UgcCampaign,
    "id" | "status" | "version" | "publishedAt" | "createdAt" | "updatedAt" | "shots"
  >
> & { id?: string; shots?: (Omit<UgcShot, "id"> & { id?: string })[] };

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32) || "shot";

const BRIEF_FIELDS = [
  "title",
  "drop",
  "summary",
  "deadline",
  "keyMessages",
  "dos",
  "donts",
  "hashtags",
  "mentions",
  "shots",
  "howTo",
  "disclosure",
  "preferredAspect",
  "items",
] as const;
const briefHash = (c: UgcCampaign) => JSON.stringify(BRIEF_FIELDS.map((k) => c[k]));

export function emptyCampaign(id: string, now = Date.now()): UgcCampaign {
  return {
    id,
    title: "Untitled campaign",
    drop: "",
    summary: "",
    status: "draft",
    version: 0,
    publishedAt: null,
    deadline: null,
    keyMessages: [],
    dos: [],
    donts: [],
    hashtags: ["#ad"],
    mentions: [],
    shots: [],
    howTo: null,
    disclosure: UGC_DEFAULT_DISCLOSURE,
    preferredAspect: "9:16",
    items: [],
    assetFileIds: [],
    coverAssetId: null,
    zipAssetId: null,
    createdAt: now,
    updatedAt: now,
  };
}

const cleanList = (xs: string[] | undefined, max = 30, len = 300) =>
  xs
    ?.map((x) => x.trim().slice(0, len))
    .filter(Boolean)
    .slice(0, max);

/** Creates or edits a campaign. Editing a live brief's content bumps its version. */
export async function saveCampaignInput(
  ns: UgcNamespace,
  input: CampaignInput,
): Promise<Ok<{ campaign: UgcCampaign; bumped: boolean }> | Fail> {
  const existing = input.id ? await getCampaign(ns, input.id) : null;
  if (input.id && !existing) return { ok: false, error: "Campaign not found." };
  const base = existing ?? emptyCampaign(newId());
  const before = briefHash(base);
  const next: UgcCampaign = { ...base };
  if (input.title !== undefined) next.title = input.title.trim().slice(0, 140) || base.title;
  if (input.drop !== undefined) next.drop = input.drop.trim().slice(0, 140);
  if (input.summary !== undefined) next.summary = input.summary.trim().slice(0, 2000);
  if (input.deadline !== undefined) next.deadline = input.deadline;
  if (input.disclosure !== undefined)
    next.disclosure = input.disclosure.trim().slice(0, 1000) || UGC_DEFAULT_DISCLOSURE;
  if (input.preferredAspect !== undefined) next.preferredAspect = input.preferredAspect;
  for (const k of ["keyMessages", "dos", "donts", "items"] as const)
    if (input[k] !== undefined) next[k] = cleanList(input[k])!;
  if (input.hashtags !== undefined)
    next.hashtags = cleanList(input.hashtags, 20, 60)!.map((h) =>
      h.startsWith("#") ? h : `#${h}`,
    );
  if (input.mentions !== undefined)
    next.mentions = cleanList(input.mentions, 20, 60)!.map((h) =>
      h.startsWith("@") ? h : `@${h}`,
    );
  if (input.shots !== undefined) {
    const seen = new Set<string>();
    next.shots = input.shots.slice(0, 40).map((s) => {
      let id = (s.id && /^[a-z0-9-]{1,40}$/.test(s.id) ? s.id : slug(s.label)) || "shot";
      for (let i = 2; seen.has(id); i++) id = `${slug(s.label)}-${i}`;
      seen.add(id);
      return {
        id,
        label: s.label.trim().slice(0, 140),
        required: !!s.required,
        ...(s.tip?.trim() ? { tip: s.tip.trim().slice(0, 500) } : {}),
      };
    });
  }
  if (input.howTo !== undefined)
    next.howTo = input.howTo
      ? {
          title: input.howTo.title.trim().slice(0, 140),
          steps: cleanList(input.howTo.steps, 12)!,
          exampleAssetId: input.howTo.exampleAssetId,
        }
      : null;
  if (input.assetFileIds !== undefined) next.assetFileIds = input.assetFileIds;
  if (input.coverAssetId !== undefined) next.coverAssetId = input.coverAssetId;
  if (input.zipAssetId !== undefined) next.zipAssetId = input.zipAssetId;
  const bumped = next.status === "live" && briefHash(next) !== before;
  if (bumped) {
    next.version += 1;
    next.publishedAt = Date.now();
  }
  await saveCampaign(ns, next);
  return { ok: true, campaign: next, bumped };
}

async function assignedCreators(ns: UgcNamespace, campaignId: string) {
  const summaries = (await listCreatorSummaries(ns)).filter((c) =>
    c.campaignIds.includes(campaignId),
  );
  return (await Promise.all(summaries.map((s) => getCreator(ns, s.id)))).filter(
    (c): c is UgcCreator => !!c,
  );
}

/** Emails everyone on the campaign that the brief changed. */
export async function notifyBriefUpdated(ns: UgcNamespace, origin: string, campaign: UgcCampaign) {
  let sent = 0;
  for (const c of await assignedCreators(ns, campaign.id)) {
    if (!MAILABLE(c) || c.status === "paused") continue;
    await sendUgcNotice(ns, c.email, {
      subject: `Brief updated: ${campaign.title}`,
      heading: "Your brief was updated",
      body: `We updated the brief for ${campaign.title} (version ${campaign.version}). Have a look before you film.`,
      cta: "Read the brief",
      url: hubUrl(origin, UGC_ROUTES.brief),
    });
    await logActivity(ns, c.id, {
      kind: "brief",
      title: `Brief updated to version ${campaign.version}`,
    });
    sent++;
  }
  return sent;
}

export async function setCampaignStatus(
  ns: UgcNamespace,
  origin: string,
  id: string,
  status: UgcCampaign["status"],
  notify = false,
): Promise<Ok<{ campaign: UgcCampaign; notified: number }> | Fail> {
  const c = await getCampaign(ns, id);
  if (!c) return { ok: false, error: "Campaign not found." };
  const next = { ...c, status };
  if (status === "live" && c.status !== "live") {
    next.version = c.version + 1;
    next.publishedAt = Date.now();
  }
  await saveCampaign(ns, next);
  const notified = status === "live" && notify ? await notifyBriefUpdated(ns, origin, next) : 0;
  return { ok: true, campaign: next, notified };
}

export async function deleteCampaign(ns: UgcNamespace, id: string): Promise<Ok | Fail> {
  const c = await getCampaign(ns, id);
  if (!c) return { ok: true };
  if (c.status !== "draft")
    return { ok: false, error: "Only draft campaigns can be deleted. Close it instead." };
  const idx = await submissionIndex(ns);
  if (Object.values(idx).some((s) => s.campaignId === id))
    return { ok: false, error: "This campaign has uploads." };
  for (const a of await listAssets(ns, c, true)) await deleteAsset(ns, a);
  for (const cr of await assignedCreators(ns, id))
    await saveCreator(ns, { ...cr, campaignIds: cr.campaignIds.filter((x) => x !== id) });
  await deleteCampaignRecord(ns, id);
  return { ok: true };
}

export async function campaignDetail(ns: UgcNamespace, id: string) {
  const campaign = await getCampaign(ns, id);
  if (!campaign) return null;
  const assets = (await listAssets(ns, campaign, false)).map(assetView);
  const creators = (await listCreatorSummaries(ns)).filter((c) => c.campaignIds.includes(id));
  return { campaign, assets, creators };
}

export async function assignCampaign(
  ns: UgcNamespace,
  campaignId: string,
  creatorIds: string[],
  assign: boolean,
): Promise<Ok<{ updated: number }> | Fail> {
  const campaign = await getCampaign(ns, campaignId);
  if (!campaign) return { ok: false, error: "Campaign not found." };
  let updated = 0;
  for (const id of creatorIds) {
    const c = await getCreator(ns, id);
    if (!c) continue;
    const has = c.campaignIds.includes(campaignId);
    if (assign === has) continue;
    c.campaignIds = assign
      ? [...c.campaignIds, campaignId]
      : c.campaignIds.filter((x) => x !== campaignId);
    await saveCreator(ns, c);
    if (assign && campaign.status === "live")
      await logActivity(ns, c.id, { kind: "brief", title: `New brief: ${campaign.title}` });
    updated++;
  }
  return { ok: true, updated };
}

export async function updateAsset(
  ns: UgcNamespace,
  campaignId: string,
  id: string,
  patch: { name?: string; group?: UgcAssetGroup; note?: string },
): Promise<Ok<{ asset: UgcAssetView }> | Fail> {
  const a = await getAsset(ns, campaignId, id);
  if (!a) return { ok: false, error: "Asset not found." };
  const next = {
    ...a,
    name: patch.name?.trim().slice(0, 140) || a.name,
    group: patch.group ?? a.group,
    note: patch.note !== undefined ? patch.note.trim().slice(0, 500) : a.note,
  };
  await saveAsset(ns, next);
  return { ok: true, asset: assetView(next) };
}

export async function removeAsset(ns: UgcNamespace, campaignId: string, id: string) {
  const a = await getAsset(ns, campaignId, id);
  if (a) await deleteAsset(ns, a);
  return { ok: true as const };
}

/* ---------------------------------------------------------------------------
   Shipping
   --------------------------------------------------------------------------- */

const SHIPPABLE = UGC_PIPELINE.slice(UGC_PIPELINE.indexOf("approved"));

export type ShippingRow = {
  creatorId: string;
  name: string;
  creatorName: string;
  email: string;
  status: UgcStatus;
  campaignId: string | null;
  campaignTitle: string | null;
  phone: string;
  address: ShippingAddress | null;
  shipment: UgcShipment | null;
};

export async function shippingRows(
  ns: UgcNamespace,
  opts: { campaignId?: string | null; onlyUnshipped?: boolean } = {},
): Promise<ShippingRow[]> {
  const summaries = (await listCreatorSummaries(ns)).filter(
    (c) =>
      (SHIPPABLE.includes(c.status) || c.status === "paused") &&
      (!opts.campaignId || c.campaignIds.includes(opts.campaignId)),
  );
  const rows: ShippingRow[] = [];
  for (const s of summaries) {
    const c = await getCreator(ns, s.id);
    if (!c) continue;
    const campaign = opts.campaignId
      ? await getCampaign(ns, opts.campaignId)
      : await currentCampaign(ns, c);
    const shipment = campaign ? await getShipment(ns, c.id, campaign.id) : null;
    if (opts.onlyUnshipped && shipment?.shippedAt) continue;
    const pii = await getPii(ns, c.id);
    rows.push({
      creatorId: c.id,
      name: c.name,
      creatorName: c.creatorName,
      email: c.email,
      status: c.status,
      campaignId: campaign?.id ?? null,
      campaignTitle: campaign?.title ?? null,
      phone: pii.phone,
      address: pii.address,
      shipment,
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** Column order most fulfilment tools (Shopify, ShipStation, Pirate Ship) map without edits. */
export const SHIPPING_CSV_COLUMNS = [
  "reference",
  "name",
  "address_line1",
  "address_line2",
  "city",
  "region",
  "postal_code",
  "country",
  "phone",
  "email",
  "items",
  "creator_name",
  "campaign",
  "carrier",
  "tracking",
] as const;

export async function shippingCsv(
  ns: UgcNamespace,
  opts: { campaignId?: string | null; onlyUnshipped?: boolean } = {},
) {
  const rows = await shippingRows(ns, { onlyUnshipped: true, ...opts });
  const campaigns = new Map<string, UgcCampaign | null>();
  const body: string[][] = [];
  for (const r of rows) {
    if (r.campaignId && !campaigns.has(r.campaignId))
      campaigns.set(r.campaignId, await getCampaign(ns, r.campaignId));
    const items = r.shipment?.items.length
      ? r.shipment.items
      : ((r.campaignId ? campaigns.get(r.campaignId)?.items : null) ?? []);
    body.push([
      r.creatorId,
      r.address?.name || r.name,
      r.address?.line1 ?? "",
      r.address?.line2 ?? "",
      r.address?.city ?? "",
      r.address?.region ?? "",
      r.address?.postalCode ?? "",
      r.address?.country ?? "",
      r.phone,
      r.email,
      items.join(" + "),
      r.creatorName,
      r.campaignTitle ?? "",
      r.shipment?.carrier ?? "",
      r.shipment?.tracking ?? "",
    ]);
  }
  const date = new Date().toISOString().slice(0, 10);
  return {
    filename: `ugc-shipping-${date}.csv`,
    csv: toCsv([...SHIPPING_CSV_COLUMNS], body),
    count: body.length,
    missingAddress: rows.filter((r) => !r.address).map((r) => r.creatorId),
  };
}

async function schedulePurge(ns: UgcNamespace, creatorId: string, deliveredAt: number) {
  const p = await getPii(ns, creatorId);
  await savePii(ns, { ...p, purgeAfter: deliveredAt + UGC.piiPurgeAfterDeliveryMs });
}

async function shipmentFor(ns: UgcNamespace, c: UgcCreator, campaignId?: string | null) {
  const campaign = campaignId ? await getCampaign(ns, campaignId) : await currentCampaign(ns, c);
  if (!campaign) return null;
  if (!c.campaignIds.includes(campaign.id)) return null;
  return {
    campaign,
    shipment:
      (await getShipment(ns, c.id, campaign.id)) ??
      emptyShipment(c.id, campaign.id, campaign.items),
  };
}

export type ShipResult = { creatorId: string | null; email?: string; ok: boolean; error?: string };

export async function markPacked(
  ns: UgcNamespace,
  creatorIds: string[],
  campaignId?: string | null,
) {
  const out: ShipResult[] = [];
  for (const id of creatorIds) {
    const c = await getCreator(ns, id);
    const s = c ? await shipmentFor(ns, c, campaignId) : null;
    if (!c || !s) {
      out.push({ creatorId: id, ok: false, error: c ? "not on a campaign" : "not found" });
      continue;
    }
    s.shipment.packedAt ??= Date.now();
    await saveShipment(ns, s.shipment);
    out.push({ creatorId: id, ok: true });
  }
  return out;
}

export async function markShipped(
  ns: UgcNamespace,
  origin: string,
  entries: { creatorId: string; carrier: string; tracking: string; url?: string | null }[],
  opts: { campaignId?: string | null; notify?: boolean } = {},
): Promise<ShipResult[]> {
  const out: ShipResult[] = [];
  for (const e of entries) {
    const c = await getCreator(ns, e.creatorId);
    const s = c ? await shipmentFor(ns, c, opts.campaignId) : null;
    if (!c || !s) {
      out.push({ creatorId: e.creatorId, ok: false, error: c ? "not on a campaign" : "not found" });
      continue;
    }
    if (!canSignIn(c.status)) {
      out.push({ creatorId: c.id, ok: false, error: `status is ${c.status}` });
      continue;
    }
    const now = Date.now();
    const url = e.url?.trim();
    const sh: UgcShipment = {
      ...s.shipment,
      carrier: e.carrier.trim().slice(0, 60),
      tracking: e.tracking.trim().slice(0, 80),
      trackingUrl:
        (url && !liveUrlProblem(url) ? url : null) ?? trackingUrlFor(e.carrier, e.tracking),
      packedAt: s.shipment.packedAt ?? now,
      shippedAt: s.shipment.shippedAt ?? now,
    };
    await saveShipment(ns, sh);
    if (c.status === "approved") await setCreatorStatus(ns, c, "shipped", "medialife");
    await logActivity(ns, c.id, {
      kind: "shipment",
      actor: "medialife",
      title: "Your package shipped",
      body: [sh.carrier, sh.tracking].filter(Boolean).join(" · "),
    });
    if (opts.notify !== false)
      await sendUgcNotice(ns, c.email, {
        subject: "Your EVADE package is on its way",
        heading: "Your package shipped",
        body: `${[sh.carrier, sh.tracking].filter(Boolean).join(" · ") || "It's on its way."}\n\nYour brief and assets are ready in the UGC Hub, so you can plan your shots before it lands.`,
        cta: sh.trackingUrl ? "Track your package" : "Open the UGC Hub",
        url: sh.trackingUrl ?? hubUrl(origin),
      });
    out.push({ creatorId: c.id, ok: true });
  }
  return out;
}

/** Bulk "mark shipped" from a CSV of email,carrier,tracking[,url]. */
export async function importTrackingCsv(
  ns: UgcNamespace,
  origin: string,
  csv: string,
  opts: { campaignId?: string | null; notify?: boolean } = {},
) {
  const rows = parseTrackingCsv(csv);
  const out: ShipResult[] = [];
  const entries: {
    creatorId: string;
    email: string;
    carrier: string;
    tracking: string;
    url: string;
  }[] = [];
  for (const r of rows) {
    if (!r.email || !r.tracking) {
      out.push({ creatorId: null, email: r.email, ok: false, error: "needs email and tracking" });
      continue;
    }
    const c = await findCreatorByEmail(ns, r.email);
    if (!c) {
      out.push({ creatorId: null, email: r.email, ok: false, error: "no creator with that email" });
      continue;
    }
    entries.push({
      creatorId: c.id,
      email: r.email,
      carrier: r.carrier,
      tracking: r.tracking,
      url: r.url,
    });
  }
  const shipped = await markShipped(ns, origin, entries, opts);
  return [...out, ...shipped.map((s, i) => ({ ...s, email: entries[i].email }))];
}

export async function markDelivered(
  ns: UgcNamespace,
  creatorIds: string[],
  opts: { campaignId?: string | null; startContent?: boolean } = {},
): Promise<ShipResult[]> {
  const out: ShipResult[] = [];
  for (const id of creatorIds) {
    const c = await getCreator(ns, id);
    const s = c ? await shipmentFor(ns, c, opts.campaignId) : null;
    if (!c || !s) {
      out.push({ creatorId: id, ok: false, error: c ? "not on a campaign" : "not found" });
      continue;
    }
    const now = Date.now();
    const sh = {
      ...s.shipment,
      packedAt: s.shipment.packedAt ?? now,
      shippedAt: s.shipment.shippedAt ?? now,
      deliveredAt: s.shipment.deliveredAt ?? now,
    };
    await saveShipment(ns, sh);
    await schedulePurge(ns, c.id, sh.deliveredAt);
    if (c.status === "approved" || c.status === "shipped")
      await setCreatorStatus(
        ns,
        c,
        opts.startContent === false ? "delivered" : "content-due",
        "medialife",
      );
    else if (c.status === "delivered" && opts.startContent !== false)
      await setCreatorStatus(ns, c, "content-due", "medialife");
    await logActivity(ns, c.id, {
      kind: "shipment",
      actor: "medialife",
      title: "Your package was delivered",
    });
    out.push({ creatorId: id, ok: true });
  }
  return out;
}

/* ---------------------------------------------------------------------------
   Review
   --------------------------------------------------------------------------- */

export type ReviewItem = {
  submission: UgcSubmissionView;
  creator: Pick<UgcCreator, "id" | "name" | "creatorName" | "email" | "status" | "handles"> | null;
  campaign: {
    id: string;
    title: string;
    shots: UgcShot[];
    preferredAspect: UgcCampaign["preferredAspect"];
  } | null;
};

export async function reviewQueue(
  ns: UgcNamespace,
  opts: { status?: UgcSubmissionStatus | "all"; campaignId?: string | null } = {},
): Promise<ReviewItem[]> {
  const status = opts.status ?? "in-review";
  const refs = Object.values(await submissionIndex(ns))
    .filter(
      (r) =>
        (status === "all" ? r.status !== "uploading" : r.status === status) &&
        (!opts.campaignId || r.campaignId === opts.campaignId),
    )
    .sort((a, b) => (a.completedAt ?? a.createdAt) - (b.completedAt ?? b.createdAt));
  const campaigns = new Map<string, UgcCampaign | null>();
  const out: ReviewItem[] = [];
  for (const r of refs) {
    const s = await getSubmission(ns, r.creatorId, r.id);
    if (!s) continue;
    if (!campaigns.has(s.campaignId))
      campaigns.set(s.campaignId, await getCampaign(ns, s.campaignId));
    out.push(await reviewItem(ns, s, campaigns.get(s.campaignId) ?? null));
  }
  return out;
}

async function reviewItem(
  ns: UgcNamespace,
  s: UgcSubmission,
  campaign: UgcCampaign | null,
): Promise<ReviewItem> {
  const c = await getCreator(ns, s.creatorId);
  return {
    submission: submissionView(s, await listComments(ns, s.id)),
    creator: c
      ? {
          id: c.id,
          name: c.name,
          creatorName: c.creatorName,
          email: c.email,
          status: c.status,
          handles: c.handles,
        }
      : null,
    campaign: campaign
      ? {
          id: campaign.id,
          title: campaign.title,
          shots: campaign.shots,
          preferredAspect: campaign.preferredAspect,
        }
      : null,
  };
}

export async function submissionDetail(ns: UgcNamespace, id: string) {
  const ref = (await submissionIndex(ns))[id];
  const s = ref ? await getSubmission(ns, ref.creatorId, id) : null;
  if (!s) return null;
  return reviewItem(ns, s, await getCampaign(ns, s.campaignId));
}

export type Decision = "approve" | "changes" | "reject";

export async function review(
  ns: UgcNamespace,
  origin: string,
  input: { submissionId: string; decision: Decision; comment?: string; notify?: boolean },
): Promise<Ok<{ submission: UgcSubmissionView }> | Fail> {
  const ref = (await submissionIndex(ns))[input.submissionId];
  const s = ref ? await getSubmission(ns, ref.creatorId, input.submissionId) : null;
  if (!s) return { ok: false, error: "Upload not found." };
  if (s.status === "uploading") return { ok: false, error: "That upload hasn't finished." };
  if (s.status === "posted") return { ok: false, error: "That content is already posted." };
  const comment = input.comment?.trim().slice(0, UGC.maxCommentChars) ?? "";
  if (input.decision === "changes" && !comment)
    return { ok: false, error: "Say what needs to change." };
  const status: UgcSubmissionStatus =
    input.decision === "approve"
      ? "approved"
      : input.decision === "changes"
        ? "changes-requested"
        : "rejected";
  const saved = await saveSubmission(ns, { ...s, status, reviewedAt: Date.now() });
  if (comment)
    await addComment(ns, s.id, { author: "medialife", name: "MEDIALIFE", body: comment });
  const titles: Record<Decision, string> = {
    approve: `${s.name} was approved`,
    changes: `Changes requested on ${s.name}`,
    reject: `${s.name} won't be used`,
  };
  await logActivity(ns, s.creatorId, {
    kind: "review",
    actor: "medialife",
    title: titles[input.decision],
    body: comment.slice(0, 200),
    submissionId: s.id,
  });
  const creator = await syncCreatorStatus(ns, s.creatorId);
  if (creator && input.notify !== false && MAILABLE(creator)) {
    const copy: Record<Decision, { subject: string; heading: string; body: string; cta: string }> =
      {
        approve: {
          subject: "Approved! Time to post",
          heading: "Your content was approved",
          body: `${s.name} is approved. Post it with #ad or the platform's paid-partnership label, then paste your live link in the hub.${comment ? `\n\n${comment}` : ""}`,
          cta: "Add your live link",
        },
        changes: {
          subject: "A few changes on your upload",
          heading: "We asked for a few changes",
          body: `${s.name}: ${comment}`,
          cta: "See feedback",
        },
        reject: {
          subject: "About your upload",
          heading: "We won't use this one",
          body: `${s.name} won't be used for this campaign.${comment ? `\n\n${comment}` : ""}`,
          cta: "Open the UGC Hub",
        },
      };
    await sendUgcNotice(ns, creator.email, {
      ...copy[input.decision],
      url: hubUrl(origin, UGC_ROUTES.upload),
    });
  }
  return { ok: true, submission: submissionView(saved, await listComments(ns, s.id)) };
}

export async function adminComment(ns: UgcNamespace, submissionId: string, body: string) {
  const ref = (await submissionIndex(ns))[submissionId];
  const s = ref ? await getSubmission(ns, ref.creatorId, submissionId) : null;
  if (!s) return { ok: false as const, error: "Upload not found." };
  const text = body.trim().slice(0, UGC.maxCommentChars);
  if (!text) return { ok: false as const, error: "Write a message first." };
  const comment = await addComment(ns, s.id, {
    author: "medialife",
    name: "MEDIALIFE",
    body: text,
  });
  await logActivity(ns, s.creatorId, {
    kind: "comment",
    actor: "medialife",
    title: `New comment on ${s.name}`,
    body: text.slice(0, 140),
    submissionId: s.id,
  });
  return { ok: true as const, comment };
}

/** The team records a live link on the creator's behalf (they confirm disclosure themselves). */
export async function adminSetLiveUrl(
  ns: UgcNamespace,
  input: { submissionId: string; url: string; disclosureConfirmed: boolean },
): Promise<Ok<{ submission: UgcSubmissionView }> | Fail> {
  const ref = (await submissionIndex(ns))[input.submissionId];
  const s = ref ? await getSubmission(ns, ref.creatorId, input.submissionId) : null;
  if (!s) return { ok: false, error: "Upload not found." };
  if (s.status !== "approved" && s.status !== "posted")
    return { ok: false, error: "Approve it first." };
  if (input.disclosureConfirmed !== true)
    return { ok: false, error: "Confirm the post is disclosed (#ad)." };
  const problem = liveUrlProblem(input.url);
  if (problem) return { ok: false, error: problem };
  const saved = await saveSubmission(ns, {
    ...s,
    status: "posted",
    liveUrl: new URL(input.url.trim()).toString(),
    disclosureConfirmed: true,
    postedAt: s.postedAt ?? Date.now(),
  });
  await logActivity(ns, s.creatorId, {
    kind: "posted",
    actor: "medialife",
    title: `${s.name} is live`,
    submissionId: s.id,
  });
  await syncCreatorStatus(ns, s.creatorId);
  return { ok: true, submission: submissionView(saved, await listComments(ns, s.id)) };
}

/* ---------------------------------------------------------------------------
   Perks
   --------------------------------------------------------------------------- */

export type PerkInput = {
  creatorId: string;
  id?: string;
  kind: UgcPerkKind;
  title: string;
  description?: string;
  code?: string | null;
  url?: string | null;
  percentOff?: number | null;
  expiresAt?: number | null;
};

export async function savePerkInput(
  ns: UgcNamespace,
  origin: string,
  input: PerkInput & { notify?: boolean },
): Promise<Ok<{ perk: UgcPerk }> | Fail> {
  const c = await getCreator(ns, input.creatorId);
  if (!c) return { ok: false, error: "Creator not found." };
  const existing = input.id ? await getPerk(ns, c.id, input.id) : null;
  if (input.id && !existing) return { ok: false, error: "Perk not found." };
  if (input.url && liveUrlProblem(input.url)) return { ok: false, error: "Use an https:// link." };
  const now = Date.now();
  const perk: UgcPerk = {
    id: existing?.id ?? newId(8),
    creatorId: c.id,
    kind: input.kind,
    title: input.title.trim().slice(0, 140),
    description: (input.description ?? "").trim().slice(0, 1000),
    code: input.code?.trim().slice(0, 60) || null,
    url: input.url?.trim() || null,
    percentOff: input.percentOff ?? null,
    expiresAt: input.expiresAt ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  if (!perk.title) return { ok: false, error: "Give the perk a title." };
  await savePerk(ns, perk);
  if (!existing) {
    await logActivity(ns, c.id, {
      kind: "perk",
      actor: "medialife",
      title: `Perk unlocked: ${perk.title}`,
    });
    if (input.notify && MAILABLE(c))
      await sendUgcNotice(ns, c.email, {
        subject: "You unlocked a perk",
        heading: perk.title,
        body: perk.description || "A new perk is waiting for you in the UGC Hub.",
        cta: "See your perks",
        url: hubUrl(origin, UGC_ROUTES.perks),
      });
  }
  return { ok: true, perk };
}

export async function removePerk(ns: UgcNamespace, creatorId: string, id: string) {
  await deletePerk(ns, creatorId, id);
  return { ok: true as const };
}

/** Pasted email,code lines → one discount perk each. */
export async function importPerkCodes(
  ns: UgcNamespace,
  origin: string,
  input: {
    csv: string;
    title: string;
    description?: string;
    percentOff?: number | null;
    expiresAt?: number | null;
    notify?: boolean;
  },
) {
  const out: { email: string; ok: boolean; error?: string; creatorId?: string }[] = [];
  for (const r of parseCodesCsv(input.csv)) {
    if (!r.email || !r.code) {
      out.push({ email: r.email, ok: false, error: "needs email and code" });
      continue;
    }
    const c = await findCreatorByEmail(ns, r.email);
    if (!c) {
      out.push({ email: r.email, ok: false, error: "no creator with that email" });
      continue;
    }
    const res = await savePerkInput(ns, origin, {
      creatorId: c.id,
      kind: "discount",
      title: input.title,
      description: input.description,
      code: r.code,
      percentOff: input.percentOff,
      expiresAt: input.expiresAt,
      notify: input.notify,
    });
    out.push(
      res.ok
        ? { email: r.email, ok: true, creatorId: c.id }
        : { email: r.email, ok: false, error: res.error },
    );
  }
  return out;
}

/* ---------------------------------------------------------------------------
   Data deletion
   --------------------------------------------------------------------------- */

export async function deleteCreatorData(
  ns: UgcNamespace,
  id: string,
  mode: "pii" | "all",
): Promise<Ok | Fail> {
  const c = await getCreator(ns, id);
  if (!c) return { ok: true };
  if (mode === "all") {
    await deleteCreatorEverything(ns, id);
    return { ok: true };
  }
  await purgePii(ns, id);
  await saveCreator(ns, { ...c, deletionRequest: null });
  await logActivity(ns, id, {
    kind: "account",
    actor: "medialife",
    title: "Your phone and address were deleted",
  });
  return { ok: true };
}
