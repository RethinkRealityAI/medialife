import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  addCreator,
  adminComment,
  adminSetLiveUrl,
  assignCampaign,
  campaignDetail,
  creatorDetail,
  deleteCampaign,
  deleteCreatorData,
  editCreator,
  importPerkCodes,
  importTrackingCsv,
  markDelivered,
  markPacked,
  markShipped,
  notifyBriefUpdated,
  pipeline,
  removeAsset,
  removePerk,
  resendJoin,
  review,
  reviewQueue,
  saveCampaignInput,
  saveNotes,
  savePerkInput,
  setCampaignStatus,
  shippingCsv,
  shippingRows,
  submissionDetail,
  updateAsset,
  updateStatuses,
} from "./admin.server";
import { listCampaigns, listCreatorSummaries } from "./data.server";
import {
  importCsv,
  importLog,
  netlifyConfig,
  NETLIFY_SETUP_HELP,
  syncNetlifyForms,
} from "./import.server";
import {
  UGC_ASSET_GROUPS,
  UGC_PERK_KINDS,
  UGC_PLATFORMS,
  UGC_STATUSES,
  UGC_SUBMISSION_STATUSES,
} from "./model";
import { seedUgcSample } from "./sample.server";
import { linkOrigin, requireUgcAdmin } from "./session.server";

// The team side of the UGC Hub, under /admin/ugc. Every function starts with
// requireUgcAdmin() (the shared /admin cookie; throws HubAuthError "forbidden"
// otherwise). Reads return data; changes return { ok, … } or per-row results.

const id = z.string().regex(/^[A-Za-z0-9]{6,60}$/);
const ids = z.array(id).min(1).max(500);
const str = (max: number) => z.string().trim().max(max);
const list = (max = 30, len = 300) => z.array(z.string().max(len)).max(max);
const address = z.object({
  name: str(120),
  line1: str(200),
  line2: str(200),
  city: str(120),
  region: str(120),
  postalCode: str(30),
  country: str(80),
});

/* ---------------------------------------------------------------------------
   Pipeline and creators
   --------------------------------------------------------------------------- */

export const adminUgcPipeline = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        status: z.enum([...UGC_STATUSES, "all", "deletion-requested"]).optional(),
        campaignId: id.optional().nullable(),
        q: str(120).optional(),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const ns = await requireUgcAdmin();
    return pipeline(ns, data ?? {});
  });

export const adminGetUgcCreator = createServerFn({ method: "GET" })
  .validator(z.object({ id }))
  .handler(async ({ data }) => {
    const ns = await requireUgcAdmin();
    return creatorDetail(ns, data.id);
  });

/**
 * Moves creators to a status (single or bulk). Only moves allowed by
 * UGC_TRANSITIONS unless force. A first approval assigns the campaign (given,
 * or the only live one) and emails the join link (notify defaults to true).
 */
export const adminSetUgcStatus = createServerFn({ method: "POST" })
  .validator(
    z.object({
      ids,
      status: z.enum(UGC_STATUSES),
      force: z.boolean().optional(),
      notify: z.boolean().optional(),
      campaignId: id.optional().nullable(),
    }),
  )
  .handler(async ({ data }) => {
    const ns = await requireUgcAdmin();
    return { results: await updateStatuses(ns, linkOrigin(ns), data) };
  });

export const adminResendUgcJoinLink = createServerFn({ method: "POST" })
  .validator(z.object({ id }))
  .handler(async ({ data }) => {
    const ns = await requireUgcAdmin();
    return resendJoin(ns, linkOrigin(ns), data.id);
  });

export const adminSaveUgcNotes = createServerFn({ method: "POST" })
  .validator(z.object({ id, internalNotes: z.string().max(5000), tags: list(20, 40) }))
  .handler(async ({ data }) => {
    const ns = await requireUgcAdmin();
    return saveNotes(ns, data.id, data);
  });

export const adminEditUgcCreator = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id,
      name: str(120).optional(),
      creatorName: str(80).optional(),
      email: z.string().trim().toLowerCase().email().max(254).optional(),
      country: str(80).optional(),
      handles: z.record(z.enum(UGC_PLATFORMS), str(200)).optional(),
      mainPlatform: z.enum(UGC_PLATFORMS).nullable().optional(),
      phone: str(40).optional(),
      address: address.nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const ns = await requireUgcAdmin();
    const { id: creatorId, ...patch } = data;
    return editCreator(ns, creatorId, patch);
  });

export const adminAddUgcCreator = createServerFn({ method: "POST" })
  .validator(
    z.object({
      name: str(120),
      creatorName: str(80),
      email: z.string().trim().toLowerCase().email().max(254),
      country: str(80).optional(),
      handles: z.record(z.enum(UGC_PLATFORMS), str(200)).optional(),
      phone: str(40).optional(),
      address: address.nullable().optional(),
      notes: str(2000).optional(),
      status: z.enum(["applied", "approved"]).optional(),
      notify: z.boolean().optional(),
      campaignId: id.optional().nullable(),
    }),
  )
  .handler(async ({ data }) => {
    const ns = await requireUgcAdmin();
    return addCreator(ns, linkOrigin(ns), { ...data, address: data.address ?? undefined });
  });

/** mode "pii": phone + address purged (clears the deletion request). "all": everything, files too. */
export const adminDeleteUgcCreatorData = createServerFn({ method: "POST" })
  .validator(z.object({ id, mode: z.enum(["pii", "all"]) }))
  .handler(async ({ data }) => {
    const ns = await requireUgcAdmin();
    return deleteCreatorData(ns, data.id, data.mode);
  });

/* ---------------------------------------------------------------------------
   Import
   --------------------------------------------------------------------------- */

/** For the Import page: is the Netlify sync set up, and the last imports. */
export const adminUgcImportStatus = createServerFn({ method: "GET" }).handler(async () => {
  const ns = await requireUgcAdmin();
  const cfg = netlifyConfig();
  return {
    netlify: cfg.configured
      ? { configured: true as const, formIdSet: !!cfg.formId }
      : { configured: false as const, missing: cfg.missing, help: NETLIFY_SETUP_HELP },
    log: await importLog(ns),
  };
});

/** Pulls the landing page's sign-ups from Netlify Forms. Idempotent. */
export const adminSyncUgcNetlify = createServerFn({ method: "POST" })
  .validator(
    z
      .object({ deleteAfterImport: z.boolean().optional(), dryRun: z.boolean().optional() })
      .optional(),
  )
  .handler(async ({ data }) => {
    const ns = await requireUgcAdmin();
    return syncNetlifyForms(ns, data ?? {});
  });

/** A Netlify Forms CSV export (same mapping as the sync). Idempotent. */
export const adminImportUgcCsv = createServerFn({ method: "POST" })
  .validator(z.object({ csv: z.string().max(5_000_000), dryRun: z.boolean().optional() }))
  .handler(async ({ data }) => {
    const ns = await requireUgcAdmin();
    return importCsv(ns, data.csv, { dryRun: data.dryRun });
  });

/* ---------------------------------------------------------------------------
   Campaigns and the brief builder
   --------------------------------------------------------------------------- */

export const adminListUgcCampaigns = createServerFn({ method: "GET" }).handler(async () => {
  const ns = await requireUgcAdmin();
  const [campaigns, creators] = await Promise.all([listCampaigns(ns), listCreatorSummaries(ns)]);
  return campaigns.map((c) => ({
    ...c,
    creatorCount: creators.filter((x) => x.campaignIds.includes(c.id)).length,
  }));
});

export const adminGetUgcCampaign = createServerFn({ method: "GET" })
  .validator(z.object({ id }))
  .handler(async ({ data }) => {
    const ns = await requireUgcAdmin();
    return campaignDetail(ns, data.id);
  });

const shot = z.object({
  id: z.string().max(40).optional(),
  label: str(140).min(1),
  required: z.boolean(),
  tip: str(500).optional(),
});

/** Create (no id) or edit. Editing a live brief's content bumps its version (`bumped`). */
export const adminSaveUgcCampaign = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: id.optional(),
      title: str(140).optional(),
      drop: str(140).optional(),
      summary: str(2000).optional(),
      deadline: z.number().int().nullable().optional(),
      keyMessages: list().optional(),
      dos: list().optional(),
      donts: list().optional(),
      hashtags: list(20, 60).optional(),
      mentions: list(20, 60).optional(),
      shots: z.array(shot).max(40).optional(),
      howTo: z
        .object({ title: str(140), steps: list(12), exampleAssetId: id.nullable() })
        .nullable()
        .optional(),
      disclosure: str(1000).optional(),
      preferredAspect: z.enum(["9:16", "16:9", "1:1", "4:5", "other"]).optional(),
      items: list().optional(),
      assetFileIds: z.array(id).max(500).optional(),
      coverAssetId: id.nullable().optional(),
      zipAssetId: id.nullable().optional(),
      notify: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const ns = await requireUgcAdmin();
    const { notify, ...input } = data;
    const r = await saveCampaignInput(ns, input);
    if (r.ok && r.bumped && notify) {
      return { ...r, notified: await notifyBriefUpdated(ns, linkOrigin(ns), r.campaign) };
    }
    return { ...r, notified: 0 };
  });

/** draft → live (publish, version + 1; notify emails assigned creators), live → closed, etc. */
export const adminSetUgcCampaignStatus = createServerFn({ method: "POST" })
  .validator(
    z.object({ id, status: z.enum(["draft", "live", "closed"]), notify: z.boolean().optional() }),
  )
  .handler(async ({ data }) => {
    const ns = await requireUgcAdmin();
    return setCampaignStatus(ns, linkOrigin(ns), data.id, data.status, data.notify);
  });

export const adminDeleteUgcCampaign = createServerFn({ method: "POST" })
  .validator(z.object({ id }))
  .handler(async ({ data }) => {
    const ns = await requireUgcAdmin();
    return deleteCampaign(ns, data.id);
  });

export const adminAssignUgcCampaign = createServerFn({ method: "POST" })
  .validator(z.object({ campaignId: id, creatorIds: ids, assign: z.boolean() }))
  .handler(async ({ data }) => {
    const ns = await requireUgcAdmin();
    return assignCampaign(ns, data.campaignId, data.creatorIds, data.assign);
  });

/** Uploading brief assets goes through the upload API (target "asset"); this edits or removes them. */
export const adminUpdateUgcAsset = createServerFn({ method: "POST" })
  .validator(
    z.object({
      campaignId: id,
      id,
      name: str(140).optional(),
      group: z.enum(UGC_ASSET_GROUPS).optional(),
      note: str(500).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const ns = await requireUgcAdmin();
    const { campaignId, id: assetId, ...patch } = data;
    return updateAsset(ns, campaignId, assetId, patch);
  });

export const adminDeleteUgcAsset = createServerFn({ method: "POST" })
  .validator(z.object({ campaignId: id, id }))
  .handler(async ({ data }) => {
    const ns = await requireUgcAdmin();
    return removeAsset(ns, data.campaignId, data.id);
  });

/* ---------------------------------------------------------------------------
   Shipping
   --------------------------------------------------------------------------- */

const shipFilter = z
  .object({ campaignId: id.optional().nullable(), onlyUnshipped: z.boolean().optional() })
  .optional();

/** Approved creators (and later stages) with address, phone and shipment. */
export const adminUgcShipping = createServerFn({ method: "GET" })
  .validator(shipFilter)
  .handler(async ({ data }) => {
    const ns = await requireUgcAdmin();
    return shippingRows(ns, data ?? {});
  });

/** { filename, csv, count, missingAddress } — unshipped only unless onlyUnshipped: false. */
export const adminExportUgcShippingCsv = createServerFn({ method: "POST" })
  .validator(shipFilter)
  .handler(async ({ data }) => {
    const ns = await requireUgcAdmin();
    return shippingCsv(ns, data ?? {});
  });

export const adminMarkUgcPacked = createServerFn({ method: "POST" })
  .validator(z.object({ creatorIds: ids, campaignId: id.optional().nullable() }))
  .handler(async ({ data }) => {
    const ns = await requireUgcAdmin();
    return { results: await markPacked(ns, data.creatorIds, data.campaignId) };
  });

export const adminMarkUgcShipped = createServerFn({ method: "POST" })
  .validator(
    z.object({
      entries: z
        .array(
          z.object({
            creatorId: id,
            carrier: str(60),
            tracking: str(80),
            url: str(500).nullable().optional(),
          }),
        )
        .min(1)
        .max(500),
      campaignId: id.optional().nullable(),
      notify: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const ns = await requireUgcAdmin();
    return { results: await markShipped(ns, linkOrigin(ns), data.entries, data) };
  });

/** Bulk mark shipped from CSV: email,carrier,tracking[,url] (header optional). */
export const adminImportUgcTrackingCsv = createServerFn({ method: "POST" })
  .validator(
    z.object({
      csv: z.string().max(1_000_000),
      campaignId: id.optional().nullable(),
      notify: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const ns = await requireUgcAdmin();
    return { results: await importTrackingCsv(ns, linkOrigin(ns), data.csv, data) };
  });

/** startContent (default true) also moves them to "content-due". */
export const adminMarkUgcDelivered = createServerFn({ method: "POST" })
  .validator(
    z.object({
      creatorIds: ids,
      campaignId: id.optional().nullable(),
      startContent: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const ns = await requireUgcAdmin();
    return { results: await markDelivered(ns, data.creatorIds, data) };
  });

/* ---------------------------------------------------------------------------
   Review
   --------------------------------------------------------------------------- */

/** Oldest first. status defaults to "in-review"; "all" = everything except uploading. */
export const adminUgcReviewQueue = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        status: z.enum([...UGC_SUBMISSION_STATUSES, "all"]).optional(),
        campaignId: id.optional().nullable(),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const ns = await requireUgcAdmin();
    return reviewQueue(ns, data ?? {});
  });

export const adminGetUgcSubmission = createServerFn({ method: "GET" })
  .validator(z.object({ id }))
  .handler(async ({ data }) => {
    const ns = await requireUgcAdmin();
    return submissionDetail(ns, data.id);
  });

/** approve | changes (comment required) | reject. Emails the creator unless notify: false. */
export const adminReviewUgcSubmission = createServerFn({ method: "POST" })
  .validator(
    z.object({
      submissionId: id,
      decision: z.enum(["approve", "changes", "reject"]),
      comment: z.string().max(2000).optional(),
      notify: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const ns = await requireUgcAdmin();
    return review(ns, linkOrigin(ns), data);
  });

export const adminPostUgcComment = createServerFn({ method: "POST" })
  .validator(z.object({ submissionId: id, body: z.string().max(2000) }))
  .handler(async ({ data }) => {
    const ns = await requireUgcAdmin();
    return adminComment(ns, data.submissionId, data.body);
  });

export const adminSetUgcLiveUrl = createServerFn({ method: "POST" })
  .validator(
    z.object({ submissionId: id, url: z.string().max(600), disclosureConfirmed: z.boolean() }),
  )
  .handler(async ({ data }) => {
    const ns = await requireUgcAdmin();
    return adminSetLiveUrl(ns, data);
  });

/* ---------------------------------------------------------------------------
   Perks
   --------------------------------------------------------------------------- */

export const adminSaveUgcPerk = createServerFn({ method: "POST" })
  .validator(
    z.object({
      creatorId: id,
      id: z
        .string()
        .regex(/^[A-Za-z0-9]{4,60}$/)
        .optional(),
      kind: z.enum(UGC_PERK_KINDS),
      title: str(140).min(1),
      description: str(1000).optional(),
      code: str(60).nullable().optional(),
      url: str(500).nullable().optional(),
      percentOff: z.number().min(0).max(100).nullable().optional(),
      expiresAt: z.number().int().nullable().optional(),
      notify: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const ns = await requireUgcAdmin();
    return savePerkInput(ns, linkOrigin(ns), data);
  });

export const adminDeleteUgcPerk = createServerFn({ method: "POST" })
  .validator(z.object({ creatorId: id, id: z.string().regex(/^[A-Za-z0-9]{4,60}$/) }))
  .handler(async ({ data }) => {
    const ns = await requireUgcAdmin();
    return removePerk(ns, data.creatorId, data.id);
  });

/** Pasted email,code lines (from Shopify admin) → a discount perk per creator. */
export const adminImportUgcPerkCodes = createServerFn({ method: "POST" })
  .validator(
    z.object({
      csv: z.string().max(500_000),
      title: str(140).min(1),
      description: str(1000).optional(),
      percentOff: z.number().min(0).max(100).nullable().optional(),
      expiresAt: z.number().int().nullable().optional(),
      notify: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const ns = await requireUgcAdmin();
    return { results: await importPerkCodes(ns, linkOrigin(ns), data) };
  });

/* ---------------------------------------------------------------------------
   Sample data (localhost and deploy previews only)
   --------------------------------------------------------------------------- */

export const adminSeedUgcSample = createServerFn({ method: "POST" })
  .validator(z.object({ reset: z.boolean().optional() }).optional())
  .handler(async ({ data }) => {
    const ns = await requireUgcAdmin();
    if (ns === "prod")
      return {
        ok: false as const,
        error: "Sample data is only available on previews and localhost.",
      };
    return { ok: true as const, ...(await seedUgcSample(ns, { reset: data?.reset })) };
  });
