import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import process from "node:process";
import { z } from "zod";

import { getUser, publicOrigin } from "./auth.server";
import {
  commerceConflicts,
  deleteProduct,
  getCreator,
  getCreatorAdmin,
  getExperience,
  getFile,
  getProduct,
  getThread,
  listActivity,
  listCreatorSummaries,
  listExperiences,
  listFiles,
  listInvites,
  listOrders,
  listPayouts,
  listProducts,
  logActivity,
  newTriggerCode,
  postToThread,
  saveCreator,
  saveCreatorAdmin,
  saveExperience,
  saveInvite,
  saveOrder,
  savePayout,
  saveProduct,
  scansFor,
  getInvite,
} from "./data.server";
import { mailConfigured, sendNotice } from "./mail.server";
import {
  CREATOR_STATUS,
  HUB,
  SKUS,
  SKU_IDS,
  STAGE_IDS,
  stageOf,
  summarizeEarnings,
  type Creator,
  type CreatorStatus,
  type Experience,
  type Order,
  type Product,
  type StageId,
} from "./model";
import { seedSampleCreator } from "./sample.server";
import { requireHubAdmin } from "./session.server";
import { KEYS, hubStore, newId, readAll, type HubNamespace } from "./store.server";

// The team side of the Creator Hub, under /admin/creators: review applications,
// set terms, create products and move them through the pipeline, send proofs,
// attach experiences and collateral, record orders and payouts, and make invite
// links for agency partners. Guarded by the shared /admin password.

const id = z.string().regex(/^[A-Za-z0-9]{6,60}$/);
const str = (max: number) => z.string().trim().max(max);

async function notifyCreator(
  ns: HubNamespace,
  creator: Creator,
  subject: string,
  heading: string,
  body: string,
  path: string,
  cta: string,
) {
  const user = await getUser(ns, creator.userId);
  const to = user?.email ?? creator.profile.email;
  if (!to) return;
  await sendNotice(ns, to, subject, heading, body, `${publicOrigin(getRequest(), ns)}${path}`, cta);
}

/* ---------------------------------------------------------------------------
   Creators
   --------------------------------------------------------------------------- */

export const adminListCreators = createServerFn({ method: "GET" }).handler(async () => {
  const ns = await requireHubAdmin();
  const [creators, invites] = await Promise.all([listCreatorSummaries(ns), listInvites(ns)]);
  const counts = Object.fromEntries(
    (Object.keys(CREATOR_STATUS) as CreatorStatus[]).map((s) => [
      s,
      creators.filter((c) => c.status === s).length,
    ]),
  ) as Record<CreatorStatus, number>;
  return {
    ns,
    creators,
    counts,
    invites,
    mailConfigured: mailConfigured(),
    shopifyConfigured: !!process.env.SHOPIFY_WEBHOOK_SECRET,
    ingestConfigured: !!process.env.HUB_INGEST_KEY,
    discordConfigured: !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET),
  };
});

export const adminGetCreator = createServerFn({ method: "GET" })
  .validator(z.object({ id }))
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    const creator = await getCreator(ns, data.id);
    if (!creator) return null;
    const [admin, user, products, experiences, files, orders, payouts, activity] =
      await Promise.all([
        getCreatorAdmin(ns, creator.id),
        getUser(ns, creator.userId),
        listProducts(ns, creator.id),
        listExperiences(ns, creator.id),
        listFiles(ns, creator.id),
        listOrders(ns, creator.id),
        listPayouts(ns, creator.id),
        listActivity(ns, creator.id),
      ]);
    const scans = await scansFor(
      ns,
      creator.id,
      products.map((p) => p.id),
    );
    const threads = Object.fromEntries(
      await Promise.all(
        products.map(async (p) => [p.id, await getThread(ns, creator.id, p.id)] as const),
      ),
    );
    return {
      creator,
      admin,
      account: user
        ? {
            email: user.email,
            emailVerified: user.emailVerified,
            discord: user.discord,
            createdAt: user.createdAt,
            lastLoginAt: user.lastLoginAt,
          }
        : null,
      products,
      experiences,
      files,
      orders,
      payouts,
      activity,
      scans,
      threads,
      earnings: summarizeEarnings(orders, payouts),
      origin: publicOrigin(getRequest(), ns),
    };
  });

export const adminUpdateCreator = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id,
      status: z.enum(Object.keys(CREATOR_STATUS) as [CreatorStatus, ...CreatorStatus[]]).optional(),
      revenueShare: z.number().min(0).max(1).optional(),
      /** Sent to the creator with a status change, when there is something to say. */
      message: str(1000).optional(),
      notify: z.boolean().optional(),
      admin: z
        .object({
          internalNotes: str(10_000),
          manager: z.object({
            name: str(80),
            email: z.string().trim().email().max(254).or(z.literal("")),
            discord: str(60),
          }),
          tags: z.array(str(30)).max(20),
        })
        .partial()
        .optional(),
    }),
  )
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    const creator = await getCreator(ns, data.id);
    if (!creator) return { ok: false as const, error: "Creator not found." };
    const before = creator.status;
    if (data.revenueShare !== undefined) creator.revenueShare = data.revenueShare;
    if (data.status && data.status !== before) {
      creator.status = data.status;
      if (data.status === "approved" && !creator.approvedAt) creator.approvedAt = Date.now();
      if (data.status === "submitted" && !creator.submittedAt) creator.submittedAt = Date.now();
    }
    await saveCreator(ns, creator);
    if (data.admin) {
      const cur = await getCreatorAdmin(ns, creator.id);
      await saveCreatorAdmin(ns, creator.id, {
        ...cur,
        ...data.admin,
        manager: { ...cur.manager, ...(data.admin.manager ?? {}) },
      });
    }
    if (data.status && data.status !== before) {
      const copy: Partial<Record<CreatorStatus, { title: string; body: string }>> = {
        approved: {
          title: "You're in",
          body: "Your application was approved. Your first products are being set up in the hub.",
        },
        waitlist: {
          title: "You're on the waitlist",
          body: "We'd love to work together. We'll reach out as soon as a production slot opens.",
        },
        declined: {
          title: "Application update",
          body: "We're not able to take this on right now. Thanks for applying.",
        },
        paused: { title: "Your account is paused", body: "Your manager will be in touch." },
      };
      const c = copy[data.status];
      if (c) {
        const body = data.message ? `${c.body}\n\n${data.message}` : c.body;
        await logActivity(ns, creator.id, { kind: "application", title: c.title, body });
        if (data.notify !== false) {
          await notifyCreator(
            ns,
            creator,
            `Creator Hub: ${c.title}`,
            c.title,
            body,
            `${HUB.base}/dashboard`,
            "Open the Creator Hub",
          );
        }
      }
    }
    return { ok: true as const, creator };
  });

/* ---------------------------------------------------------------------------
   Products
   --------------------------------------------------------------------------- */

const productInput = z.object({
  creatorId: id,
  /** Omit to create. */
  id: id.optional(),
  sku: z.enum(SKU_IDS as [string, ...string[]]),
  name: str(120).min(1),
  campaign: str(120),
  eta: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  /** Dollars as entered; stored as cents. */
  price: z.number().min(0).max(10_000).nullable(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default("USD"),
  revenueShare: z.number().min(0).max(1).nullable(),
  units: z.number().int().min(0).max(10_000_000).nullable(),
  waitingOn: z.enum(["creator", "medialife"]),
  nextStep: str(300),
  experienceId: id.nullable(),
  imageFileId: z.string().max(60).nullable(),
  artworkIds: z.array(z.string().max(60)).max(50),
  trigger: z.object({ method: z.enum(["qr", "nfc", "both"]), placement: str(200) }),
  commerce: z.object({
    shopUrl: z.string().trim().url().max(500).or(z.literal("")),
    shopifyProductIds: z
      .array(
        z
          .string()
          .trim()
          .regex(/^\d{1,20}$/, "Shopify product ids are numbers"),
      )
      .max(20),
    skus: z.array(str(80).min(1)).max(50),
  }),
});

export const adminSaveProduct = createServerFn({ method: "POST" })
  .validator(productInput)
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    const creator = await getCreator(ns, data.creatorId);
    if (!creator) return { ok: false as const, error: "Creator not found." };
    const now = Date.now();
    const existing = data.id ? await getProduct(ns, creator.id, data.id) : null;
    if (data.id && !existing) return { ok: false as const, error: "Product not found." };
    const p: Product = existing ?? {
      id: newId(),
      creatorId: creator.id,
      sku: data.sku as Product["sku"],
      name: data.name,
      campaign: "",
      stage: "brief",
      stageUpdatedAt: now,
      history: [{ stage: "brief", at: now, note: "Product created" }],
      waitingOn: "medialife",
      nextStep: "",
      eta: null,
      price: null,
      currency: "USD",
      revenueShare: null,
      units: null,
      proofs: [],
      artworkIds: [],
      imageFileId: null,
      experienceId: null,
      trigger: { method: "qr", code: await newTriggerCode(ns), placement: "" },
      commerce: { shopUrl: "", shopifyProductIds: [], skus: [] },
      createdAt: now,
      updatedAt: now,
    };
    p.sku = data.sku as Product["sku"];
    p.name = data.name;
    p.campaign = data.campaign;
    p.eta = data.eta;
    p.price = data.price == null ? null : Math.round(data.price * 100);
    p.currency = data.currency;
    p.revenueShare = data.revenueShare;
    p.units = data.units;
    p.waitingOn = data.waitingOn;
    p.nextStep = data.nextStep;
    p.experienceId = data.experienceId;
    p.imageFileId = data.imageFileId;
    p.artworkIds = data.artworkIds;
    p.trigger = { ...p.trigger, method: data.trigger.method, placement: data.trigger.placement };
    p.commerce = {
      shopUrl: data.commerce.shopUrl,
      shopifyProductIds: [...new Set(data.commerce.shopifyProductIds)],
      skus: [...new Set(data.commerce.skus)],
    };
    const conflicts = await commerceConflicts(ns, p);
    if (conflicts.length) {
      return {
        ok: false as const,
        error: `Already linked to another product: ${conflicts.map((k) => k.replace(/^(pid|sku):/, "")).join(", ")}`,
      };
    }
    await saveProduct(ns, p);
    if (!existing) {
      await logActivity(ns, creator.id, {
        kind: "stage",
        productId: p.id,
        title: `New product: ${p.name}`,
        body: `${SKUS[p.sku].name}${p.campaign ? ` · ${p.campaign}` : ""}. We've started the brief.`,
      });
    }
    return { ok: true as const, product: p };
  });

export const adminSetStage = createServerFn({ method: "POST" })
  .validator(
    z.object({
      creatorId: id,
      productId: id,
      stage: z.enum(STAGE_IDS as [StageId, ...StageId[]]),
      note: str(500),
      waitingOn: z.enum(["creator", "medialife"]),
      nextStep: str(300),
      notify: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    const creator = await getCreator(ns, data.creatorId);
    const p = creator ? await getProduct(ns, creator.id, data.productId) : null;
    if (!creator || !p) return { ok: false as const, error: "Product not found." };
    const now = Date.now();
    const moved = p.stage !== data.stage;
    if (moved) {
      p.stage = data.stage;
      p.stageUpdatedAt = now;
      p.history.push({ stage: data.stage, at: now, note: data.note });
    }
    p.waitingOn = data.waitingOn;
    p.nextStep = data.nextStep;
    await saveProduct(ns, p);
    if (moved) {
      const s = stageOf(data.stage);
      await logActivity(ns, creator.id, {
        kind: "stage",
        productId: p.id,
        title: data.stage === "live" ? `${p.name} is live` : `${p.name}: ${s.name}`,
        body: data.note || s.blurb,
        actionable: data.waitingOn === "creator",
      });
      if (data.notify) {
        await notifyCreator(
          ns,
          creator,
          data.stage === "live" ? `${p.name} is live` : `${p.name} moved to ${s.name}`,
          data.stage === "live" ? `${p.name} is on sale` : `${p.name}: ${s.name}`,
          [
            data.note || s.blurb,
            data.waitingOn === "creator" && data.nextStep ? `Next: ${data.nextStep}` : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
          `${HUB.base}/products/${p.id}`,
          "See the product",
        );
      }
    }
    return { ok: true as const, product: p };
  });

/** Sends a new design proof: the file must already be uploaded (kind "proof") for this creator. */
export const adminAddProof = createServerFn({ method: "POST" })
  .validator(
    z.object({
      creatorId: id,
      productId: id,
      fileId: z.string().max(60),
      note: str(2000),
      notify: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    const creator = await getCreator(ns, data.creatorId);
    const p = creator ? await getProduct(ns, creator.id, data.productId) : null;
    const file = creator ? await getFile(ns, creator.id, data.fileId) : null;
    if (!creator || !p) return { ok: false as const, error: "Product not found." };
    if (!file || !file.complete)
      return { ok: false as const, error: "Upload the proof file first." };
    const now = Date.now();
    const version = (p.proofs[p.proofs.length - 1]?.version ?? 0) + 1;
    // an unanswered older proof is superseded
    for (const pr of p.proofs) if (pr.decision === "pending") pr.decision = "changes";
    p.proofs.push({
      id: newId(6),
      version,
      fileId: file.id,
      note: data.note,
      createdAt: now,
      decision: "pending",
      decidedAt: null,
      feedback: "",
    });
    if (STAGE_IDS.indexOf(p.stage) < STAGE_IDS.indexOf("approval")) {
      p.stage = "approval";
      p.stageUpdatedAt = now;
      p.history.push({ stage: "approval", at: now, note: `Design v${version} sent for approval` });
    }
    if (!p.imageFileId) p.imageFileId = file.id;
    p.waitingOn = "creator";
    p.nextStep = `Review design v${version} and approve it or ask for changes.`;
    await saveProduct(ns, p);
    await logActivity(ns, creator.id, {
      kind: "proof",
      productId: p.id,
      title: `Design v${version} of ${p.name} is ready for you`,
      body: data.note || "Approve it, or tell us what to change.",
      actionable: true,
    });
    if (data.notify) {
      await notifyCreator(
        ns,
        creator,
        `Approve your ${p.name} design (v${version})`,
        `Design v${version} is ready`,
        data.note ||
          `Your ${p.name} design is ready. Approve it, or tell us what to change — nothing is made until you approve.`,
        `${HUB.base}/products/${p.id}`,
        "Review the design",
      );
    }
    return { ok: true as const, product: p };
  });

export const adminDeleteProduct = createServerFn({ method: "POST" })
  .validator(z.object({ creatorId: id, productId: id }))
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    const p = await getProduct(ns, data.creatorId, data.productId);
    if (!p) return { ok: false as const, error: "Product not found." };
    const orders = await listOrders(ns, data.creatorId);
    if (orders.some((o) => o.lines.some((l) => l.productId === p.id))) {
      return {
        ok: false as const,
        error:
          "This product has orders, so it can't be deleted. Move it back a stage or rename it instead.",
      };
    }
    await deleteProduct(ns, p);
    return { ok: true as const };
  });

/* ---------------------------------------------------------------------------
   Experiences
   --------------------------------------------------------------------------- */

export const adminSaveExperience = createServerFn({ method: "POST" })
  .validator(
    z.object({
      creatorId: id,
      id: id.optional(),
      name: str(120).min(1),
      kind: z.enum(["ar", "model", "video", "game", "unlock", "web"]),
      status: z.enum(["concept", "in-build", "review", "live"]),
      description: str(2000),
      reward: str(300),
      url: z.string().trim().url().max(1000).or(z.literal("")),
      previewUrl: z.string().trim().url().max(1000).or(z.literal("")),
      imageFileId: z.string().max(60).nullable(),
      notify: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    const creator = await getCreator(ns, data.creatorId);
    if (!creator) return { ok: false as const, error: "Creator not found." };
    const now = Date.now();
    const existing = data.id ? await getExperience(ns, creator.id, data.id) : null;
    const before = existing?.status;
    const e: Experience = {
      ...(existing ?? { id: newId(), creatorId: creator.id, createdAt: now, updatedAt: now }),
      name: data.name,
      kind: data.kind,
      status: data.status,
      description: data.description,
      reward: data.reward,
      url: data.url,
      previewUrl: data.previewUrl,
      imageFileId: data.imageFileId,
    } as Experience;
    await saveExperience(ns, e);
    if (before !== e.status && (e.status === "review" || e.status === "live")) {
      const title =
        e.status === "review" ? `${e.name} is ready for you to try` : `${e.name} is live`;
      await logActivity(ns, creator.id, {
        kind: "experience",
        title,
        body:
          e.status === "review"
            ? "Open the preview and tell your manager what you think."
            : "Every scan of your merch now opens it.",
        actionable: e.status === "review",
      });
      if (data.notify) {
        await notifyCreator(
          ns,
          creator,
          title,
          title,
          e.description || title,
          `${HUB.base}/experiences`,
          "Open it",
        );
      }
    }
    return { ok: true as const, experience: e };
  });

/* ---------------------------------------------------------------------------
   Messages, orders, payouts
   --------------------------------------------------------------------------- */

export const adminPostMessage = createServerFn({ method: "POST" })
  .validator(
    z.object({
      creatorId: id,
      productId: id,
      name: str(80).min(1),
      body: z.string().trim().min(1).max(4000),
      notify: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    const creator = await getCreator(ns, data.creatorId);
    const p = creator ? await getProduct(ns, creator.id, data.productId) : null;
    if (!creator || !p) return { ok: false as const, error: "Product not found." };
    const msg = await postToThread(ns, creator.id, p.id, {
      author: "medialife",
      name: data.name,
      body: data.body,
    });
    await logActivity(ns, creator.id, {
      kind: "message",
      productId: p.id,
      title: `New message about ${p.name}`,
      body: data.body.slice(0, 200),
    });
    if (data.notify) {
      await notifyCreator(
        ns,
        creator,
        `New message about ${p.name}`,
        `${data.name} wrote about ${p.name}`,
        data.body,
        `${HUB.base}/products/${p.id}`,
        "Reply in the hub",
      );
    }
    return { ok: true as const, message: msg };
  });

/** For channels without an integration: record an order by hand. */
export const adminRecordOrder = createServerFn({ method: "POST" })
  .validator(
    z.object({
      creatorId: id,
      channel: str(80).min(1),
      number: str(60).min(1),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      country: z.string().regex(/^([A-Z]{2})?$/),
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .default("USD"),
      lines: z
        .array(
          z.object({
            productId: id,
            qty: z.number().int().min(1).max(100_000),
            unitPrice: z.number().min(0).max(100_000),
            discount: z.number().min(0).max(10_000_000),
          }),
        )
        .min(1)
        .max(50),
    }),
  )
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    const creator = await getCreator(ns, data.creatorId);
    if (!creator) return { ok: false as const, error: "Creator not found." };
    const products = await listProducts(ns, creator.id);
    const byId = new Map(products.map((p) => [p.id, p]));
    if (data.lines.some((l) => !byId.has(l.productId)))
      return { ok: false as const, error: "Unknown product in a line." };
    const externalId = `${data.channel}-${data.number}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    const order: Order = {
      id: `manual-${externalId}`,
      creatorId: creator.id,
      source: "manual",
      channel: data.channel,
      externalId,
      number: data.number,
      createdAt: Date.parse(`${data.date}T12:00:00Z`),
      currency: data.currency,
      status: "paid",
      country: data.country || null,
      lines: data.lines.map((l) => {
        const p = byId.get(l.productId)!;
        return {
          productId: p.id,
          name: p.name,
          sku: p.commerce.skus[0] ?? p.sku,
          qty: l.qty,
          unitPrice: Math.round(l.unitPrice * 100),
          discount: Math.round(l.discount * 100),
          refunded: 0,
          refundedQty: 0,
          share: p.revenueShare ?? creator.revenueShare,
        };
      }),
    };
    await saveOrder(ns, order);
    return { ok: true as const, order };
  });

export const adminRecordPayout = createServerFn({ method: "POST" })
  .validator(
    z.object({
      creatorId: id,
      amount: z.number().positive().max(10_000_000),
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .default("USD"),
      periodLabel: str(80).min(1),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      reference: str(120),
      notify: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    const creator = await getCreator(ns, data.creatorId);
    if (!creator) return { ok: false as const, error: "Creator not found." };
    const payout = {
      id: newId(),
      creatorId: creator.id,
      amount: Math.round(data.amount * 100),
      currency: data.currency,
      periodLabel: data.periodLabel,
      paidAt: Date.parse(`${data.date}T12:00:00Z`),
      reference: data.reference,
    };
    await savePayout(ns, payout);
    const amount = (payout.amount / 100).toLocaleString("en-US", {
      style: "currency",
      currency: payout.currency,
    });
    await logActivity(ns, creator.id, {
      kind: "payout",
      title: `Payout sent: ${amount}`,
      body: data.periodLabel,
    });
    if (data.notify) {
      await notifyCreator(
        ns,
        creator,
        `Payout sent: ${amount}`,
        `You've been paid ${amount}`,
        `Earnings for ${data.periodLabel}.`,
        `${HUB.base}/earnings`,
        "See your earnings",
      );
    }
    return { ok: true as const, payout };
  });

/** Orders that came in from Shopify with no matching product — usually a product missing its Shopify id or SKU. */
export const adminListUnmatched = createServerFn({ method: "GET" }).handler(async () => {
  const ns = await requireHubAdmin();
  const store = await hubStore(ns);
  const all = await readAll<{
    id: string;
    at: number;
    channel: string;
    number: string;
    lines: Array<{ title: string; sku: string; productId: string; qty: number }>;
  }>(store, KEYS.unmatchedAll());
  return all.sort((a, b) => b.at - a.at).slice(0, 200);
});

export const adminDismissUnmatched = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().max(120) }))
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    await (await hubStore(ns)).del(KEYS.unmatched(data.id));
    return { ok: true as const };
  });

/* ---------------------------------------------------------------------------
   Invites
   --------------------------------------------------------------------------- */

export const adminCreateInvite = createServerFn({ method: "POST" })
  .validator(
    z.object({
      code: z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9-]{2,40}$/, "2–40 lowercase letters, numbers or -"),
      agencyName: str(80),
      rep: str(80),
      note: str(300),
    }),
  )
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    if (await getInvite(ns, data.code)) return { ok: false as const, error: "That code is taken." };
    const agencyId = data.agencyName
      ? data.agencyName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
      : null;
    const invite = {
      code: data.code,
      agencyId,
      agencyName: data.agencyName || null,
      rep: data.rep,
      note: data.note,
      createdAt: Date.now(),
      uses: 0,
      archived: false,
    };
    await saveInvite(ns, invite);
    return {
      ok: true as const,
      invite,
      url: `${publicOrigin(getRequest(), ns)}${HUB.base}/join?invite=${invite.code}`,
    };
  });

export const adminArchiveInvite = createServerFn({ method: "POST" })
  .validator(z.object({ code: z.string().max(40), archived: z.boolean() }))
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    const all = await listInvites(ns);
    const inv = all.find((i) => i.code === data.code);
    if (!inv) return { ok: false as const, error: "Invite not found." };
    await saveInvite(ns, { ...inv, archived: data.archived });
    return { ok: true as const };
  });

/* ---------------------------------------------------------------------------
   Sample data (deploy previews and localhost only)
   --------------------------------------------------------------------------- */

export const adminSeedSample = createServerFn({ method: "POST" }).handler(async () => {
  const ns = await requireHubAdmin();
  if (ns === "prod")
    return {
      ok: false as const,
      error: "Sample data is only available on previews and localhost.",
    };
  const r = await seedSampleCreator(ns);
  return { ok: true as const, ...r };
});
