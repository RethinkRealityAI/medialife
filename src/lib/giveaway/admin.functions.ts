import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { publicOrigin } from "@/lib/hub/auth.server";
import { mailConfigured } from "@/lib/hub/mail.server";
import { requireHubAdmin } from "@/lib/hub/session.server";

import { discordGiveawayConfigured } from "./discord.server";
import {
  FLAG_LABELS,
  adjustPoints,
  adminRows,
  createCampaign,
  emailWinner,
  entrantsCsv,
  getCampaign,
  getEntrant,
  listCampaigns,
  listDraws,
  listEntrants,
  runDraw,
  saveCampaign,
  setEntrantVoid,
  setPickStatus,
  subscribersCsv,
} from "./giveaway.server";
import {
  CAMPAIGN_STATUSES,
  FOLLOW_PLATFORMS,
  TASK_KINDS,
  goLiveProblems,
  slugProblem,
  type GiveawayCampaign,
} from "./model";
import { GKEYS, gwStore } from "./store.server";
import { turnstileSiteKey } from "./turnstile.server";

// The team side of giveaways, under /admin/giveaways. Every function starts with
// requireHubAdmin() (the shared /admin cookie). Reads return data or null;
// changes return { ok: true, … } | { ok: false, error }.

const id = z.string().regex(/^[A-Za-z0-9]{4,60}$/);
const str = (max: number) => z.string().trim().max(max);
const ms = z.number().int().positive().nullable();

const taskSchema = z.object({
  id,
  kind: z.enum(TASK_KINDS),
  title: str(120),
  description: str(300),
  points: z.number().int().min(0).max(1000),
  url: z.union([z.literal(""), z.string().trim().url().max(500)]),
  platform: z.enum(FOLLOW_PLATFORMS).nullable(),
  listId: str(40).nullable(),
  guildId: str(30).nullable(),
  codes: z.array(str(60)).max(50),
  codeHint: str(300),
  enabled: z.boolean(),
});

const campaignSchema = z.object({
  id,
  slug: z
    .string()
    .refine((s) => !slugProblem(s), "Use 3 to 48 lowercase letters, numbers and dashes."),
  status: z.enum(CAMPAIGN_STATUSES),
  title: str(120),
  tagline: str(300),
  sponsor: str(160),
  sponsorAddress: str(300),
  brandLine: str(80),
  heroImage: z.union([
    z.literal(""),
    z
      .string()
      .trim()
      .max(500)
      .regex(/^(https:\/\/|\/)/, "Use a /path or https:// link"),
  ]),
  startsAt: ms,
  endsAt: ms,
  drawAt: ms,
  timeZoneLabel: str(40),
  prizes: z
    .array(
      z.object({
        id,
        title: str(120),
        description: str(300),
        retailValue: z.number().min(0).max(1_000_000),
        quantity: z.number().int().min(1).max(1000),
      }),
    )
    .max(10),
  currency: z.string().regex(/^[A-Z]{3}$/),
  countries: z.array(z.string().regex(/^[A-Z]{2}$/)).max(60),
  excludedRegions: z.array(z.string().regex(/^[A-Z]{2}-[A-Z0-9]{1,3}$/)).max(60),
  minAge: z.number().int().min(13).max(21),
  entryPoints: z.number().int().min(0).max(1000),
  referralPoints: z.number().int().min(0).max(1000),
  referralCap: z.number().int().min(0).max(1000),
  honourCap: z.number().int().min(0).max(10000),
  optIns: z.array(z.object({ id: z.string().regex(/^[a-z0-9-]{2,40}$/), label: str(200) })).max(10),
  tasks: z.array(taskSchema).max(30),
  rulesText: z.string().max(60_000),
  howItWorks: z.string().max(10_000).default(""),
});

export const adminListGiveaways = createServerFn({ method: "GET" }).handler(async () => {
  const ns = await requireHubAdmin();
  const store = await gwStore(ns);
  const campaigns = await listCampaigns(ns);
  return {
    ns,
    campaigns: await Promise.all(
      campaigns.map(async (c) => ({
        id: c.id,
        slug: c.slug,
        title: c.title,
        status: c.status,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
        heroImage: c.heroImage,
        entrants: (await store.list(GKEYS.entrants(c.id))).length,
        problems: goLiveProblems(c).length,
        updatedAt: c.updatedAt,
      })),
    ),
  };
});

export const adminCreateGiveaway = createServerFn({ method: "POST" })
  .validator(z.object({ slug: z.string().trim().toLowerCase().max(48) }))
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    const p = slugProblem(data.slug);
    if (p) return { ok: false as const, error: p };
    const r = await createCampaign(ns, data.slug);
    return r.ok ? { ok: true as const, id: r.campaign.id } : r;
  });

export const adminGetGiveaway = createServerFn({ method: "GET" })
  .validator(z.object({ id }))
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    const c = await getCampaign(ns, data.id);
    if (!c) return null;
    const entrants = await listEntrants(ns, c.id);
    const rows = adminRows(c, entrants);
    const confirmed = rows.filter((r) => r.status === "confirmed");
    const taskCounts: Record<string, number> = {};
    for (const e of entrants)
      for (const t of Object.keys(e.completed)) taskCounts[t] = (taskCounts[t] ?? 0) + 1;
    return {
      ns,
      origin: publicOrigin(getRequest(), ns),
      campaign: c,
      problems: goLiveProblems(c),
      rows,
      flagLabels: FLAG_LABELS,
      draws: await listDraws(ns, c.id),
      stats: {
        entrants: rows.length,
        confirmed: confirmed.length,
        pending: rows.filter((r) => r.status === "pending").length,
        voided: rows.filter((r) => r.status === "void").length,
        flagged: rows.filter((r) => r.flags.length && r.status !== "void").length,
        tickets: confirmed.reduce((s, r) => s + r.points, 0),
        optIns: Object.fromEntries(
          c.optIns.map((o) => [o.id, confirmed.filter((r) => r.optIns.includes(o.id)).length]),
        ),
        taskCounts,
      },
      setup: {
        email: mailConfigured(),
        turnstile: !!turnstileSiteKey(),
        discord: discordGiveawayConfigured(),
      },
    };
  });

export const adminSaveGiveaway = createServerFn({ method: "POST" })
  .validator(campaignSchema)
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    const r = await saveCampaign(ns, data as GiveawayCampaign);
    return r.ok ? { ok: true as const, campaign: r.campaign } : r;
  });

export const adminGetEntrant = createServerFn({ method: "GET" })
  .validator(z.object({ campaignId: id, entrantId: id }))
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    return getEntrant(ns, data.campaignId, data.entrantId);
  });

export const adminVoidEntrant = createServerFn({ method: "POST" })
  .validator(
    z.object({ campaignId: id, entrantId: id, voided: z.boolean(), reason: str(200).default("") }),
  )
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    return setEntrantVoid(ns, data.campaignId, data.entrantId, data.voided, data.reason);
  });

export const adminAdjustPoints = createServerFn({ method: "POST" })
  .validator(
    z.object({
      campaignId: id,
      entrantId: id,
      points: z.number().int().min(-1000).max(1000).optional(),
      note: str(200).optional(),
      rowId: id.optional(),
      voided: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    const r = await adjustPoints(ns, data.campaignId, data.entrantId, data);
    return r.ok ? { ok: true as const } : r;
  });

export const adminRunDraw = createServerFn({ method: "POST" })
  .validator(z.object({ campaignId: id }))
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    const c = await getCampaign(ns, data.campaignId);
    if (!c) return { ok: false as const, error: "That campaign doesn't exist." };
    return runDraw(ns, c);
  });

export const adminSetPick = createServerFn({ method: "POST" })
  .validator(
    z.object({
      campaignId: id,
      drawId: id,
      entrantId: id,
      status: z.enum(["pending", "verified", "claimed", "forfeited"]),
      notes: str(500).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    return setPickStatus(ns, data.campaignId, data.drawId, data.entrantId, data.status, data.notes);
  });

export const adminEmailWinner = createServerFn({ method: "POST" })
  .validator(z.object({ campaignId: id, drawId: id, entrantId: id }))
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    const c = await getCampaign(ns, data.campaignId);
    const draw = (await listDraws(ns, data.campaignId)).find((d) => d.id === data.drawId);
    if (!c || !draw) return { ok: false as const, error: "That draw doesn't exist." };
    return emailWinner(ns, c, draw, data.entrantId, publicOrigin(getRequest(), ns));
  });

export const adminExportCsv = createServerFn({ method: "GET" })
  .validator(
    z.object({
      campaignId: id,
      kind: z.enum(["entrants", "subscribers"]),
      listId: z.string().max(40).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    const c = await getCampaign(ns, data.campaignId);
    if (!c) return null;
    const entrants = await listEntrants(ns, c.id);
    return data.kind === "entrants"
      ? { filename: `${c.slug}-entrants.csv`, csv: entrantsCsv(c, entrants) }
      : {
          filename: `${c.slug}-${data.listId}-subscribers.csv`,
          csv: subscribersCsv(entrants, data.listId ?? ""),
        };
  });
