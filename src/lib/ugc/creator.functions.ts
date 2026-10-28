import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  assetsFor,
  briefFor,
  creatorComment,
  homeFor,
  profileFor,
  removeSubmission,
  requestDeletion,
  setLiveUrl,
  setShotTicks,
  submissionsFor,
  updateProfile,
  updateSubmission,
} from "./creator.server";
import { listPerks } from "./data.server";
import { UGC, UGC_PLATFORMS, UGC_POST_PLATFORMS } from "./model";
import { requireUgcCreator } from "./session.server";

// Creator-facing server functions for /ugc-hub. Every one starts with
// requireUgcCreator() (throws UgcAuthError "signed-out" when there's no valid
// ugc_session), so a creator only ever reads and writes their own records.
// Reads return data; changes return { ok: true, … } | { ok: false, error }.

const id = z.string().regex(/^[A-Za-z0-9]{6,60}$/);
const optCampaign = z.object({ campaignId: id.optional().nullable() }).optional();
const str = (max: number) => z.string().trim().max(max);

const addressSchema = z.object({
  name: str(120),
  line1: str(200),
  line2: str(200),
  city: str(120),
  region: str(120),
  postalCode: str(30),
  country: str(80),
});

/** Home: status timeline, "What's next", shipment, perks, quota, activity. */
export const getUgcHome = createServerFn({ method: "GET" }).handler(async () => {
  const { ns, creator } = await requireUgcCreator();
  return homeFor(ns, creator);
});

/** The brief (current campaign unless campaignId). null when they have no live brief yet. */
export const getUgcBrief = createServerFn({ method: "GET" })
  .validator(optCampaign)
  .handler(async ({ data }) => {
    const { ns, creator } = await requireUgcCreator();
    return briefFor(ns, creator, data?.campaignId);
  });

/** Saves the shot-list ticks (the whole list each time). */
export const setUgcShotTicks = createServerFn({ method: "POST" })
  .validator(z.object({ campaignId: id, shotIds: z.array(z.string().max(40)).max(60) }))
  .handler(async ({ data }) => {
    const { ns, creator } = await requireUgcCreator();
    return setShotTicks(ns, creator, data.campaignId, data.shotIds);
  });

/** Brief assets grouped for the Assets page, plus the "Download all" ZIP if the team made one. */
export const listUgcAssets = createServerFn({ method: "GET" })
  .validator(optCampaign)
  .handler(async ({ data }) => {
    const { ns, creator } = await requireUgcCreator();
    return assetsFor(ns, creator, data?.campaignId);
  });

/** My content: submissions with comments, the shot list, and the quota. */
export const listUgcSubmissions = createServerFn({ method: "GET" })
  .validator(optCampaign)
  .handler(async ({ data }) => {
    const { ns, creator } = await requireUgcCreator();
    return submissionsFor(ns, creator, data?.campaignId);
  });

export const updateUgcSubmission = createServerFn({ method: "POST" })
  .validator(
    z.object({
      submissionId: id,
      platform: z.enum(UGC_POST_PLATFORMS).nullable().optional(),
      shotIds: z.array(z.string().max(40)).max(40).optional(),
      note: str(1000).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { ns, creator } = await requireUgcCreator();
    return updateSubmission(ns, creator, data);
  });

/** Removes an upload that isn't approved (frees quota). */
export const deleteUgcSubmission = createServerFn({ method: "POST" })
  .validator(z.object({ submissionId: id }))
  .handler(async ({ data }) => {
    const { ns, creator } = await requireUgcCreator();
    return removeSubmission(ns, creator, data.submissionId);
  });

export const postUgcComment = createServerFn({ method: "POST" })
  .validator(z.object({ submissionId: id, body: z.string().max(UGC.maxCommentChars) }))
  .handler(async ({ data }) => {
    const { ns, creator } = await requireUgcCreator();
    return creatorComment(ns, creator, data.submissionId, data.body);
  });

/** Approved → posted. Needs disclosureConfirmed: true and an https link. */
export const setUgcLiveUrl = createServerFn({ method: "POST" })
  .validator(
    z.object({
      submissionId: id,
      url: z.string().max(600),
      disclosureConfirmed: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    const { ns, creator } = await requireUgcCreator();
    return setLiveUrl(ns, creator, data);
  });

export const listUgcPerks = createServerFn({ method: "GET" }).handler(async () => {
  const { ns, creator } = await requireUgcCreator();
  const now = Date.now();
  return (await listPerks(ns, creator.id)).filter(
    (p) => !p.expiresAt || p.expiresAt > now - 7 * 86_400_000,
  );
});

export const getUgcProfile = createServerFn({ method: "GET" }).handler(async () => {
  const { ns, creator } = await requireUgcCreator();
  return profileFor(ns, creator);
});

/** Any subset of fields. Handles: send "" to clear one. Address/phone go to the admin-only PII record. */
export const updateUgcProfile = createServerFn({ method: "POST" })
  .validator(
    z.object({
      creatorName: str(80).optional(),
      name: str(120).optional(),
      country: str(80).optional(),
      handles: z.record(z.enum(UGC_PLATFORMS), str(200)).optional(),
      phone: str(40).optional(),
      address: addressSchema.nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { ns, creator } = await requireUgcCreator();
    return updateProfile(ns, creator, data);
  });

/** "Delete my data": flags the request for the team (cancel: true withdraws it). */
export const requestUgcDataDeletion = createServerFn({ method: "POST" })
  .validator(z.object({ note: str(1000).optional(), cancel: z.boolean().optional() }))
  .handler(async ({ data }) => {
    const { ns, creator } = await requireUgcCreator();
    return requestDeletion(ns, creator, data.note ?? "", data.cancel ?? false);
  });
