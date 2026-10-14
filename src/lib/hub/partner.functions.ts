import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { KIT_SCOPE } from "./collateral";
import { getCollateralSettings, listCollateral } from "./collateral.server";

import { signatureStatus } from "./agreements";
import {
  authConfigured,
  claimEmail,
  findUserByEmail,
  getUser,
  hashPassword,
  passwordProblem,
  publicOrigin,
  rateLimit,
  saveUser,
  type HubUser,
} from "./auth.server";
import { publicOrder } from "./creator.functions";
import {
  earningsFor,
  getCreator,
  listActivity,
  listExperiences,
  listFiles,
  listFolders,
  listInvites,
  listProducts,
  saveInvite,
  scansFor,
} from "./data.server";
import { earningsByDay, earningsByProduct, stageIndex, totalAudience, type Invite } from "./model";
import {
  KIT_OWNER,
  PARTNER_BASE,
  journeyStep,
  partnerOwner,
  slugifyPartner,
  type Partner,
} from "./partners";
import {
  deleteMember,
  getPartner,
  listMembers,
  listPartnerInvites,
  listSignatures,
  markInviteAccepted,
  partnerCreatorSummaries,
  resolvePartnerInvite,
  revokePartnerInvite,
  saveMember,
  sendTeamInvite,
} from "./partners.server";
import { currentUser, requirePartner, startSession } from "./session.server";
import { hubNs, newId } from "./store.server";

// The Partner Hub (/partner-hub): an agency's view of the creators it brings
// in, its collateral, its invite links and its team. Every function starts
// with requirePartner(), so a team only ever reads its own partner's records
// and the creators tied to it.

const id = z.string().regex(/^[A-Za-z0-9]{6,60}$/);

/** What a partner team may see of the partner record (no internal notes). */
const publicPartner = (p: Partner) => ({
  id: p.id,
  name: p.name,
  website: p.website,
  discordUrl: p.discordUrl,
  brand: p.brand,
  kit: p.kit,
});

/** One creator, summarised for the partner's list. */
async function creatorRow(ns: Parameters<typeof listProducts>[0], creatorId: string) {
  const [creator, products, earnings, signatures] = await Promise.all([
    getCreator(ns, creatorId),
    listProducts(ns, creatorId),
    earningsFor(ns, creatorId),
    listSignatures(ns, creatorId),
  ]);
  if (!creator) return null;
  const scans = await scansFor(
    ns,
    creatorId,
    products.map((p) => p.id),
  );
  const signed = signatureStatus(signatures).signedCurrent;
  const furthest = [...products].sort((a, b) => stageIndex(b.stage) - stageIndex(a.stage))[0];
  return {
    id: creator.id,
    displayName: creator.profile.displayName || creator.profile.email,
    email: creator.profile.email,
    status: creator.status,
    rep: creator.agency?.rep ?? "",
    platforms: creator.channels.filter((c) => c.handle.trim()).map((c) => c.platform),
    audience: totalAudience(creator.channels),
    joinedAt: creator.createdAt,
    submittedAt: creator.submittedAt,
    approvedAt: creator.approvedAt,
    signed,
    journey: journeyStep({
      status: creator.status,
      signed,
      stages: products.map((p) => p.stage),
      earned: earnings.summary.earned,
    }),
    products: products.length,
    live: products.filter((p) => p.stage === "live").length,
    furthestStage: furthest?.stage ?? null,
    waitingOnCreator: products.filter((p) => p.waitingOn === "creator" && p.stage !== "live")
      .length,
    scans: Object.values(scans).reduce((s, x) => s + x.total, 0),
    earnings: earnings.summary,
    lastActivityAt: Math.max(creator.updatedAt, ...products.map((p) => p.updatedAt)),
  };
}

export type PartnerCreatorRow = NonNullable<Awaited<ReturnType<typeof creatorRow>>>;

/** Everything the Partner Hub shows on its pages, in one round trip. */
export const getPartnerWorkspace = createServerFn({ method: "GET" }).handler(async () => {
  const { ns, user, partner, role } = await requirePartner();
  const summaries = await partnerCreatorSummaries(ns, partner.id);
  const [
    rows,
    kitFiles,
    kitFolders,
    ownFiles,
    ownFolders,
    invites,
    kitEntries,
    ownEntries,
    kitSettings,
    ownSettings,
  ] = await Promise.all([
    Promise.all(summaries.map((s) => creatorRow(ns, s.id))),
    listFiles(ns, KIT_OWNER),
    listFolders(ns, KIT_OWNER),
    listFiles(ns, partnerOwner(partner.id)),
    listFolders(ns, partnerOwner(partner.id)),
    listInvites(ns),
    listCollateral(ns, KIT_SCOPE),
    listCollateral(ns, partner.id),
    getCollateralSettings(ns, KIT_SCOPE),
    getCollateralSettings(ns, partner.id),
  ]);
  return {
    partner: publicPartner(partner),
    me: { id: user.id, email: user.email, name: user.name ?? "", role },
    origin: publicOrigin(getRequest(), ns),
    creators: rows.filter((r): r is PartnerCreatorRow => !!r),
    library: {
      files: [...ownFiles, ...kitFiles],
      folders: [...ownFolders, ...kitFolders],
      ownOwner: partnerOwner(partner.id),
    },
    // Pieces the MEDIALIFE team added for everyone and for this partner, the
    // team's own, and the built-in pieces hidden from them.
    collateral: {
      entries: [...ownEntries, ...kitEntries],
      hidden: [...new Set([...kitSettings.hidden, ...ownSettings.hidden])],
    },
    links: invites
      .filter((i) => i.agencyId === partner.id && !i.archived)
      .map((i) => ({
        code: i.code,
        rep: i.rep,
        note: i.note,
        uses: i.uses,
        createdAt: i.createdAt,
      })),
  };
});

/** One creator, in full: partners see everything about the creators they bring in. */
export const getPartnerCreator = createServerFn({ method: "GET" })
  .validator(z.object({ id }))
  .handler(async ({ data }) => {
    const { ns, partner } = await requirePartner();
    const creator = await getCreator(ns, data.id);
    if (!creator || creator.agency?.id !== partner.id) return null;
    const [row, products, experiences, files, earnings, activity, signatures] = await Promise.all([
      creatorRow(ns, creator.id),
      listProducts(ns, creator.id),
      listExperiences(ns, creator.id),
      listFiles(ns, creator.id),
      earningsFor(ns, creator.id),
      listActivity(ns, creator.id),
      listSignatures(ns, creator.id),
    ]);
    const scans = await scansFor(
      ns,
      creator.id,
      products.map((p) => p.id),
    );
    const byProduct = Object.fromEntries(earningsByProduct(earnings.orders));
    return {
      row,
      creator: {
        id: creator.id,
        status: creator.status,
        createdAt: creator.createdAt,
        submittedAt: creator.submittedAt,
        approvedAt: creator.approvedAt,
        profile: creator.profile,
        channels: creator.channels,
        contact: creator.contact,
        interests: creator.interests,
        revenueShare: creator.revenueShare,
        agency: creator.agency,
        // Where payouts go stays between the creator and MEDIALIFE.
        payoutSetUp: !!creator.payout?.email,
      },
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        campaign: p.campaign,
        stage: p.stage,
        stageUpdatedAt: p.stageUpdatedAt,
        history: p.history,
        waitingOn: p.waitingOn,
        nextStep: p.nextStep,
        eta: p.eta,
        price: p.price,
        currency: p.currency,
        revenueShare: p.revenueShare ?? creator.revenueShare,
        units: p.units,
        proofs: p.proofs.map((pr) => ({
          id: pr.id,
          version: pr.version,
          decision: pr.decision,
          sentAt: pr.createdAt,
          decidedAt: pr.decidedAt,
        })),
        imageFileId: p.imageFileId,
        experienceId: p.experienceId,
        trigger: p.trigger,
        scans: scans[p.id]?.total ?? 0,
        sales: byProduct[p.id] ?? { units: 0, net: 0, earned: 0, orders: 0 },
      })),
      experiences: experiences.map((e) => ({
        id: e.id,
        name: e.name,
        kind: e.kind,
        status: e.status,
        description: e.description,
        reward: e.reward,
        previewUrl: e.previewUrl,
      })),
      files: files.filter((f) => f.kind !== "proof"),
      earnings: earnings.summary,
      trend: earningsByDay(earnings.orders, 60),
      orders: earnings.orders.slice(0, 50).map(publicOrder),
      payouts: earnings.payouts.map((p) => ({
        id: p.id,
        amount: p.amount,
        currency: p.currency,
        paidAt: p.paidAt,
        periodLabel: p.periodLabel,
      })),
      activity: activity.slice(0, 30),
      signatures: signatures.map((s) => ({
        id: s.id,
        title: s.title,
        version: s.version,
        signedName: s.signedName,
        signedAt: s.signedAt,
      })),
    };
  });

/* ---------------------------------------------------------------------------
   Invite links (creator referral): any team member can make their own, so
   each creator is attributed to the person who brought them in.
   --------------------------------------------------------------------------- */

export const createPartnerLink = createServerFn({ method: "POST" })
  .validator(
    z.object({
      rep: z.string().trim().min(1, "Add whose link this is").max(80),
      note: z.string().trim().max(200).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { ns, partner } = await requirePartner();
    const base = [slugifyPartner(partner.name).split("-")[0], slugifyPartner(data.rep)]
      .filter(Boolean)
      .join("-")
      .slice(0, 30);
    // Archived links keep their code, so check every link ever made.
    const taken = new Set((await listInvites(ns)).map((i) => i.code));
    let code = base.length >= 2 ? base : "invite";
    for (let i = 0; taken.has(code); i++) {
      if (i > 8) return { ok: false as const, error: "Couldn't make a unique link. Try again." };
      const suffix = newId(4, false)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 4);
      code = `${base || "invite"}-${suffix}`;
    }
    const invite: Invite = {
      code,
      agencyId: partner.id,
      agencyName: partner.name,
      rep: data.rep,
      note: data.note ?? "",
      createdAt: Date.now(),
      uses: 0,
      archived: false,
    };
    await saveInvite(ns, invite);
    return { ok: true as const, code };
  });

export const archivePartnerLink = createServerFn({ method: "POST" })
  .validator(z.object({ code: z.string().max(40) }))
  .handler(async ({ data }) => {
    const { ns, partner } = await requirePartner();
    const inv = (await listInvites(ns)).find((i) => i.code === data.code);
    if (!inv || inv.agencyId !== partner.id)
      return { ok: false as const, error: "Link not found." };
    await saveInvite(ns, { ...inv, archived: true });
    return { ok: true as const };
  });

/* ---------------------------------------------------------------------------
   Team
   --------------------------------------------------------------------------- */

export const getPartnerTeam = createServerFn({ method: "GET" }).handler(async () => {
  const { ns, partner, role } = await requirePartner();
  const [members, invites] = await Promise.all([
    listMembers(ns, partner.id),
    role === "admin" ? listPartnerInvites(ns, partner.id) : Promise.resolve([]),
  ]);
  return {
    members,
    invites: invites.filter((i) => !i.acceptedAt && !i.revokedAt && i.expiresAt > Date.now()),
  };
});

const roleSchema = z.enum(["admin", "member"]);

export const invitePartnerMember = createServerFn({ method: "POST" })
  .validator(
    z.object({
      email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
      name: z.string().trim().max(80),
      role: roleSchema,
    }),
  )
  .handler(async ({ data }) => {
    const { ns, partner, user } = await requirePartner({ admin: true });
    if (!(await rateLimit(ns, "partner-invite", user.id, 30, 60 * 60_000)))
      return { ok: false as const, error: "That's a lot of invitations. Try again in an hour." };
    return sendTeamInvite(ns, partner, {
      ...data,
      invitedBy: user.name || user.email,
    });
  });

export const revokeTeamInvite = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().max(40) }))
  .handler(async ({ data }) => {
    const { ns, partner } = await requirePartner({ admin: true });
    return { ok: await revokePartnerInvite(ns, partner.id, data.id) };
  });

async function adminsLeft(
  ns: Parameters<typeof listMembers>[0],
  partnerId: string,
  without: string,
) {
  return (await listMembers(ns, partnerId)).filter(
    (m) => m.role === "admin" && m.userId !== without,
  ).length;
}

export const setMemberRole = createServerFn({ method: "POST" })
  .validator(z.object({ userId: z.string().max(60), role: roleSchema }))
  .handler(async ({ data }) => {
    const { ns, partner } = await requirePartner({ admin: true });
    const member = (await listMembers(ns, partner.id)).find((m) => m.userId === data.userId);
    const u = await getUser(ns, data.userId);
    if (!member || !u || u.partner?.id !== partner.id)
      return { ok: false as const, error: "They're not on the team." };
    if (data.role !== "admin" && !(await adminsLeft(ns, partner.id, data.userId)))
      return { ok: false as const, error: "The team needs at least one admin." };
    await saveMember(ns, { ...member, role: data.role });
    await saveUser(ns, { ...u, partner: { id: partner.id, role: data.role } });
    return { ok: true as const };
  });

/** Removes someone from the team (or yourself: leaving). Their account stays. */
export const removeMember = createServerFn({ method: "POST" })
  .validator(z.object({ userId: z.string().max(60) }))
  .handler(async ({ data }) => {
    const { ns, partner, user, role } = await requirePartner();
    const self = data.userId === user.id;
    if (!self && role !== "admin")
      return { ok: false as const, error: "Only admins can remove teammates." };
    const u = await getUser(ns, data.userId);
    if (!u || u.partner?.id !== partner.id)
      return { ok: false as const, error: "They're not on the team." };
    if (u.partner.role === "admin" && !(await adminsLeft(ns, partner.id, u.id)))
      return {
        ok: false as const,
        error: "The team needs at least one admin. Make someone else an admin first.",
      };
    await deleteMember(ns, partner.id, u.id);
    await saveUser(ns, { ...u, partner: null });
    return { ok: true as const, self };
  });

/* ---------------------------------------------------------------------------
   Joining a team from an emailed invitation
   --------------------------------------------------------------------------- */

const tokenSchema = z.string().min(10).max(200);

/** Public: what an invitation is for, for the join page. Never confirms whether an account exists to strangers. */
export const lookupPartnerInvite = createServerFn({ method: "GET" })
  .validator(z.object({ token: tokenSchema }))
  .handler(async ({ data }) => {
    const ns = hubNs();
    const r = await resolvePartnerInvite(ns, data.token);
    if (!r) return { state: "invalid" as const };
    const partner = await getPartner(ns, r.invite.partnerId);
    if (!partner || partner.status !== "active") return { state: "invalid" as const };
    const s = await currentUser();
    return {
      state: r.state,
      partnerName: partner.name,
      email: r.invite.email,
      name: r.invite.name,
      role: r.invite.role,
      invitedBy: r.invite.invitedBy,
      signedInAs: s ? s.user.email : null,
      signedInMatches: !!s && s.user.email === r.invite.email,
      accountExists: !s ? !!(await findUserByEmail(ns, r.invite.email)) : false,
    };
  });

async function joinTeam(
  ns: Parameters<typeof listMembers>[0],
  user: HubUser,
  inv: {
    partnerId: string;
    role: "admin" | "member";
    invitedBy: string;
    name: string;
  },
) {
  const name = user.name || inv.name || user.email.split("@")[0];
  await saveUser(ns, { ...user, name, partner: { id: inv.partnerId, role: inv.role } });
  await saveMember(ns, {
    userId: user.id,
    partnerId: inv.partnerId,
    email: user.email,
    name,
    role: inv.role,
    joinedAt: Date.now(),
    invitedBy: inv.invitedBy,
  });
}

/**
 * Accepts an invitation. Signed in with the invited email: joins the team.
 * No account yet: creates one (the emailed link proves the address).
 */
export const acceptPartnerInvite = createServerFn({ method: "POST" })
  .validator(
    z.object({
      token: tokenSchema,
      name: z.string().trim().max(80).optional(),
      password: z.string().max(200).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const ns = hubNs();
    if (!authConfigured(ns))
      return {
        ok: false as const,
        error: "Accounts aren't available yet. Please try again later.",
      };
    const r = await resolvePartnerInvite(ns, data.token);
    if (!r || r.state !== "open")
      return {
        ok: false as const,
        error:
          r?.state === "accepted"
            ? "This invitation has already been used. Sign in instead."
            : r?.state === "expired"
              ? "This invitation has expired. Ask your team admin for a new one."
              : "This invitation isn't valid any more. Ask your team admin for a new one.",
      };
    const partner = await getPartner(ns, r.invite.partnerId);
    if (!partner || partner.status !== "active")
      return { ok: false as const, error: "This team isn't active." };

    const s = await currentUser();
    if (s) {
      if (s.user.email !== r.invite.email)
        return {
          ok: false as const,
          error: `This invitation is for ${r.invite.email}. Sign out, then open the link again.`,
        };
      if (s.user.partner && s.user.partner.id !== partner.id)
        return { ok: false as const, error: "Your account is already on another partner's team." };
      await joinTeam(ns, { ...s.user, name: s.user.name || data.name }, r.invite);
      await markInviteAccepted(ns, r.invite);
      return { ok: true as const, next: PARTNER_BASE };
    }

    if (await findUserByEmail(ns, r.invite.email))
      return {
        ok: false as const,
        error: "You already have an account. Sign in to accept.",
        signIn: true,
      };
    const name = (data.name ?? "").trim();
    if (!name) return { ok: false as const, error: "Add your name.", field: "name" as const };
    const problem = passwordProblem(data.password ?? "", r.invite.email);
    if (problem) return { ok: false as const, error: problem, field: "password" as const };
    const userId = newId();
    if (!(await claimEmail(ns, r.invite.email, userId)))
      return {
        ok: false as const,
        error: "You already have an account. Sign in to accept.",
        signIn: true,
      };
    const now = Date.now();
    const user: HubUser = {
      id: userId,
      email: r.invite.email,
      // The invitation was emailed to this address and opened from it.
      emailVerified: true,
      passwordHash: await hashPassword(data.password ?? ""),
      discord: null,
      creatorId: null,
      name,
      createdAt: now,
      lastLoginAt: now,
      disabled: false,
    };
    await saveUser(ns, user);
    await joinTeam(ns, user, r.invite);
    await markInviteAccepted(ns, r.invite);
    await startSession(ns, userId);
    return { ok: true as const, next: PARTNER_BASE };
  });

/** For the Partner Hub's account page. */
export const updatePartnerProfile = createServerFn({ method: "POST" })
  .validator(z.object({ name: z.string().trim().min(1, "Add your name").max(80) }))
  .handler(async ({ data }) => {
    const { ns, user, partner } = await requirePartner();
    await saveUser(ns, { ...user, name: data.name });
    const m = (await listMembers(ns, partner.id)).find((x) => x.userId === user.id);
    if (m) await saveMember(ns, { ...m, name: data.name });
    return { ok: true as const };
  });

/* ---------------------------------------------------------------------------
   The public, co-branded program page (/with/<partner>)
   --------------------------------------------------------------------------- */

/** Public: what the program page needs. The invite must be one of this partner's links. */
export const getPartnerLanding = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().max(40), invite: z.string().max(40).optional() }))
  .handler(async ({ data }) => {
    const ns = hubNs();
    const partner = await getPartner(ns, data.id);
    if (!partner || partner.status !== "active") return null;
    const links = (await listInvites(ns)).filter((i) => i.agencyId === partner.id && !i.archived);
    const asked = data.invite?.trim().toLowerCase();
    const invite =
      links.find((l) => l.code === asked)?.code ??
      links.find((l) => l.code === partner.id)?.code ??
      links[0]?.code ??
      null;
    return {
      partner: { id: partner.id, name: partner.name, kit: partner.kit, brand: partner.brand },
      invite,
    };
  });
