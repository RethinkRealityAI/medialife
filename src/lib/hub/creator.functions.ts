import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import process from "node:process";
import { z } from "zod";

import { getUser, publicOrigin } from "./auth.server";
import {
  creatorWorkspace,
  getExperience,
  getProduct,
  getScans,
  getThread,
  listFiles,
  listOrders,
  logActivity,
  postToThread,
  saveCreator,
  saveProduct,
} from "./data.server";
import { sendNotice } from "./mail.server";
import {
  CONTENT_CATEGORIES,
  HUB,
  PLATFORM_IDS,
  SKU_IDS,
  STAGE_IDS,
  channelUrl,
  earningsByDay,
  earningsByProduct,
  intakeGaps,
  type Creator,
  type Order,
  type StageId,
} from "./model";
import { requireCreator } from "./session.server";
import { hubNs } from "./store.server";

// Creator-facing server functions: the intake (application), the dashboard
// workspace, a product's detail, proof decisions and messages, and earnings.
// Every one starts with requireCreator(), so a creator only ever reads and
// writes their own records.

/* ---------------------------------------------------------------------------
   The application / profile
   --------------------------------------------------------------------------- */

const str = (max: number) => z.string().trim().max(max);

export const profileSchema = z.object({
  displayName: str(80),
  legalName: str(120),
  email: z.string().trim().toLowerCase().email().max(254).or(z.literal("")),
  country: str(60),
  timezone: str(60),
  bio: str(600),
  categories: z.array(z.string().max(40)).max(CONTENT_CATEGORIES.length),
  audienceRegions: str(120),
});

export const channelSchema = z.object({
  platform: z.enum(PLATFORM_IDS as [string, ...string[]]),
  handle: str(200),
  audience: z.number().int().min(0).max(2_000_000_000).nullable(),
  primary: z.boolean(),
});

export const contactSchema = z.object({
  discordId: z
    .string()
    .trim()
    .regex(/^(\d{15,22})?$/, "A Discord user ID is 17–20 digits"),
  discordUsername: str(40),
  businessEmail: z.string().trim().toLowerCase().email().max(254).or(z.literal("")),
  phone: str(40),
  managerName: str(80),
  managerEmail: z.string().trim().toLowerCase().email().max(254).or(z.literal("")),
});

export const interestsSchema = z.object({
  skus: z.array(z.enum(SKU_IDS as [string, ...string[]])).max(SKU_IDS.length),
  designSupport: z.enum(["have-art", "need-design", "mix"]),
  timing: z.enum(["asap", "1-3-months", "3-6-months", "exploring"]),
  hasExistingMerch: z.boolean(),
  existingMerchUrl: str(300),
  experienceIdeas: str(1000),
  notes: str(2000),
});

export const shippingSchema = z.object({
  name: str(120),
  line1: str(200),
  line2: str(200),
  city: str(100),
  region: str(100),
  postalCode: str(20),
  country: str(60),
});

export const payoutSchema = z.object({
  method: z.enum(["paypal", "wise", "other"]),
  email: z.string().trim().toLowerCase().email().max(254).or(z.literal("")),
  note: str(300),
});

const saveProfileInput = z.object({
  profile: profileSchema.partial().optional(),
  channels: z.array(channelSchema).max(12).optional(),
  contact: contactSchema.partial().optional(),
  interests: interestsSchema.partial().optional(),
  shipping: shippingSchema.nullable().optional(),
  payout: payoutSchema.nullable().optional(),
  marketing: z.boolean().optional(),
  /** Accepts the program terms (Discord sign-ups do this on the review step). */
  acceptTerms: z.literal(true).optional(),
  /** The intake step the creator is on, so a draft resumes there. */
  intakeStep: z.number().int().min(0).max(10).optional(),
});

/** The creator's own record, for the intake form and the profile page. */
export const getMyCreator = createServerFn({ method: "GET" }).handler(async () => {
  const { creator, user } = await requireCreator();
  return {
    creator,
    gaps: intakeGaps(creator),
    account: {
      email: user.email,
      emailVerified: user.emailVerified,
      hasPassword: !!user.passwordHash,
      discord: user.discord,
    },
  };
});

/** Saves any part of the profile. Used by the intake (autosave per step) and the profile page. */
export const saveProfile = createServerFn({ method: "POST" })
  .validator(saveProfileInput)
  .handler(async ({ data }) => {
    const { ns, creator } = await requireCreator();
    const c: Creator = structuredClone(creator);
    if (data.profile) c.profile = { ...c.profile, ...data.profile };
    if (data.channels) {
      let primarySeen = false;
      c.channels = data.channels
        .filter((ch) => ch.handle.trim())
        .map((ch) => {
          const primary = ch.primary && !primarySeen;
          if (primary) primarySeen = true;
          return {
            platform: ch.platform as Creator["channels"][number]["platform"],
            handle: ch.handle.trim(),
            url: channelUrl(ch.platform as Creator["channels"][number]["platform"], ch.handle),
            audience: ch.audience,
            primary,
          };
        });
      if (!primarySeen && c.channels[0]) c.channels[0].primary = true;
    }
    if (data.contact) c.contact = { ...c.contact, ...data.contact };
    if (data.interests)
      c.interests = { ...c.interests, ...(data.interests as Partial<Creator["interests"]>) };
    if (data.shipping !== undefined) c.shipping = data.shipping;
    if (data.payout !== undefined) c.payout = data.payout;
    if (data.marketing !== undefined) c.consent = { ...c.consent, marketing: data.marketing };
    if (data.acceptTerms && !c.consent.termsAt) c.consent = { ...c.consent, termsAt: Date.now() };
    if (data.intakeStep !== undefined) c.intakeStep = data.intakeStep;
    await saveCreator(ns, c);
    return { ok: true as const, creator: c, gaps: intakeGaps(c) };
  });

/** Sends the application for review. */
export const submitApplication = createServerFn({ method: "POST" }).handler(async () => {
  const { ns, creator } = await requireCreator();
  const gaps = intakeGaps(creator);
  if (gaps.length) return { ok: false as const, gaps };
  if (creator.status !== "draft") return { ok: true as const, already: true };
  const now = Date.now();
  await saveCreator(ns, { ...creator, status: "submitted", submittedAt: now });
  await logActivity(ns, creator.id, {
    kind: "application",
    title: "Application submitted",
    body: "Your application is with the team. You'll hear from us within 2 business days.",
  });
  // Tell the team, if an inbox is configured.
  const inbox = process.env.HUB_TEAM_EMAIL;
  if (inbox) {
    const url = `${publicOrigin(getRequest(), ns)}/admin/creators/${creator.id}`;
    await sendNotice(
      ns,
      inbox,
      `New creator application: ${creator.profile.displayName}`,
      `${creator.profile.displayName} applied`,
      `${creator.profile.displayName}${creator.agency ? ` (via ${creator.agency.name})` : ""} applied for: ${creator.interests.skus.join(", ")}.`,
      url,
      "Review application",
    );
  }
  return { ok: true as const, already: false };
});

/* ---------------------------------------------------------------------------
   The dashboard
   --------------------------------------------------------------------------- */

/** What a creator may see of an order: no internal ids beyond the order number. */
const publicOrder = (o: Order) => ({
  id: o.id,
  number: o.number,
  channel: o.channel,
  createdAt: o.createdAt,
  currency: o.currency,
  status: o.status,
  country: o.country,
  lines: o.lines,
});

/** Everything the dashboard shows, in one round trip. */
export const getWorkspace = createServerFn({ method: "GET" }).handler(async () => {
  const { ns, creator } = await requireCreator();
  const w = await creatorWorkspace(ns, creator.id);
  const byProduct = Object.fromEntries(earningsByProduct(w.earnings.orders));
  return {
    creator,
    origin: publicOrigin(getRequest(), ns),
    products: w.products.map((p) => ({
      ...p,
      scans: w.scans[p.id]?.total ?? 0,
      sales: byProduct[p.id] ?? { units: 0, net: 0, earned: 0, orders: 0 },
    })),
    experiences: w.experiences,
    files: w.files,
    activity: w.activity.slice(0, 40),
    manager: w.manager,
    earnings: w.earnings.summary,
    recentOrders: w.earnings.orders.slice(0, 8).map(publicOrder),
    trend: earningsByDay(w.earnings.orders, 30),
    scansTotal: Object.values(w.scans).reduce((s, x) => s + x.total, 0),
  };
});

export const getProductDetail = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().regex(/^[A-Za-z0-9]{6,60}$/) }))
  .handler(async ({ data }) => {
    const { ns, creator } = await requireCreator();
    const product = await getProduct(ns, creator.id, data.id);
    if (!product) return null;
    const [experience, files, thread, scans, orders] = await Promise.all([
      product.experienceId
        ? getExperience(ns, creator.id, product.experienceId)
        : Promise.resolve(null),
      listFiles(ns, creator.id),
      getThread(ns, creator.id, product.id),
      getScans(ns, creator.id, product.id),
      listOrders(ns, creator.id),
    ]);
    const mine = orders.filter((o) => o.lines.some((l) => l.productId === product.id));
    const sales = earningsByProduct(mine).get(product.id) ?? {
      units: 0,
      net: 0,
      earned: 0,
      orders: 0,
    };
    return {
      product,
      experience,
      origin: publicOrigin(getRequest(), ns),
      files: files.filter(
        (f) =>
          f.productId === product.id ||
          product.artworkIds.includes(f.id) ||
          f.id === product.imageFileId,
      ),
      artworkLibrary: files.filter((f) => f.kind === "artwork"),
      thread,
      scans,
      sales,
      revenueShare: product.revenueShare ?? creator.revenueShare,
    };
  });

export const decideProof = createServerFn({ method: "POST" })
  .validator(
    z.object({
      productId: z.string().regex(/^[A-Za-z0-9]{6,60}$/),
      proofId: z.string().max(60),
      decision: z.enum(["approved", "changes"]),
      feedback: str(2000),
    }),
  )
  .handler(async ({ data }) => {
    const { ns, creator, user } = await requireCreator();
    const product = await getProduct(ns, creator.id, data.productId);
    if (!product) return { ok: false as const, error: "Product not found." };
    const latest = product.proofs[product.proofs.length - 1];
    if (!latest || latest.id !== data.proofId)
      return { ok: false as const, error: "There's a newer proof. Reload to see it." };
    if (latest.decision !== "pending")
      return { ok: false as const, error: "You've already answered this proof." };
    if (data.decision === "changes" && !data.feedback) {
      return { ok: false as const, error: "Tell us what to change." };
    }
    const now = Date.now();
    latest.decision = data.decision;
    latest.decidedAt = now;
    latest.feedback = data.feedback;
    if (data.decision === "approved") {
      if (product.stage === "approval") {
        const next: StageId = STAGE_IDS[STAGE_IDS.indexOf("approval") + 1];
        product.stage = next;
        product.stageUpdatedAt = now;
        product.history.push({ stage: next, at: now, note: `Design v${latest.version} approved` });
      }
      product.waitingOn = "medialife";
      product.nextStep = "We're making your sample.";
    } else {
      product.waitingOn = "medialife";
      product.nextStep = `We're revising the design (v${latest.version + 1} on its way).`;
    }
    await saveProduct(ns, product);
    await postToThread(ns, creator.id, product.id, {
      author: "creator",
      name: creator.profile.displayName || user.email,
      body:
        data.decision === "approved"
          ? `Approved design v${latest.version}.${data.feedback ? `\n\n${data.feedback}` : ""}`
          : `Requested changes to v${latest.version}:\n\n${data.feedback}`,
    });
    await logActivity(ns, creator.id, {
      kind: "decision",
      productId: product.id,
      title:
        data.decision === "approved"
          ? `You approved ${product.name} v${latest.version}`
          : `You asked for changes to ${product.name}`,
      body: data.feedback,
    });
    const inbox = process.env.HUB_TEAM_EMAIL;
    if (inbox) {
      await sendNotice(
        ns,
        inbox,
        `${creator.profile.displayName}: ${data.decision === "approved" ? "approved" : "changes requested"} — ${product.name}`,
        `${product.name} v${latest.version}: ${data.decision === "approved" ? "approved" : "changes requested"}`,
        data.feedback || "No comment.",
        `${publicOrigin(getRequest(), ns)}/admin/creators/${creator.id}`,
        "Open in admin",
      );
    }
    return { ok: true as const, product };
  });

export const postMessage = createServerFn({ method: "POST" })
  .validator(
    z.object({
      productId: z.string().regex(/^[A-Za-z0-9]{6,60}$/),
      body: z.string().trim().min(1).max(4000),
    }),
  )
  .handler(async ({ data }) => {
    const { ns, creator, user } = await requireCreator();
    const product = await getProduct(ns, creator.id, data.productId);
    if (!product) return { ok: false as const, error: "Product not found." };
    const msg = await postToThread(ns, creator.id, product.id, {
      author: "creator",
      name: creator.profile.displayName || user.email,
      body: data.body,
    });
    return { ok: true as const, message: msg };
  });

/** Orders, payouts and the breakdowns for the earnings page. */
export const getEarnings = createServerFn({ method: "GET" })
  .validator(z.object({ days: z.number().int().min(7).max(365).optional() }).optional())
  .handler(async ({ data }) => {
    const { ns, creator } = await requireCreator();
    const w = await creatorWorkspace(ns, creator.id);
    const days = data?.days ?? 90;
    const byChannel = new Map<
      string,
      { channel: string; orders: number; net: number; earned: number }
    >();
    const byCountry = new Map<string, { country: string; units: number }>();
    for (const o of w.earnings.orders) {
      if (o.status === "cancelled") continue;
      const ch = byChannel.get(o.channel) ?? { channel: o.channel, orders: 0, net: 0, earned: 0 };
      ch.orders++;
      for (const l of o.lines) {
        const net = Math.max(0, l.unitPrice * l.qty - l.discount - l.refunded);
        ch.net += net;
        ch.earned += Math.round(net * l.share);
        const k = o.country ?? "—";
        const c = byCountry.get(k) ?? { country: k, units: 0 };
        c.units += Math.max(0, l.qty - l.refundedQty);
        byCountry.set(k, c);
      }
      byChannel.set(o.channel, ch);
    }
    const byProduct = earningsByProduct(w.earnings.orders);
    return {
      summary: w.earnings.summary,
      revenueShare: creator.revenueShare,
      holdDays: HUB.holdDays,
      orders: w.earnings.orders.map(publicOrder),
      payouts: w.earnings.payouts,
      trend: earningsByDay(w.earnings.orders, days),
      byProduct: w.products.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        stage: p.stage,
        share: p.revenueShare ?? creator.revenueShare,
        ...(byProduct.get(p.id) ?? { units: 0, net: 0, earned: 0, orders: 0 }),
      })),
      byChannel: [...byChannel.values()].sort((a, b) => b.net - a.net),
      byCountry: [...byCountry.values()].sort((a, b) => b.units - a.units),
      payoutSetUp: !!creator.payout?.email,
    };
  });

/** For the account page: refreshes what the session knows about the user. */
export const getAccount = createServerFn({ method: "GET" }).handler(async () => {
  const { ns, user } = await requireCreator();
  const fresh = await getUser(ns, user.id);
  return {
    email: fresh?.email ?? user.email,
    emailVerified: fresh?.emailVerified ?? user.emailVerified,
    hasPassword: !!fresh?.passwordHash,
    discord: fresh?.discord ?? null,
    discordEnabled: !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET),
    ns: hubNs(),
  };
});
