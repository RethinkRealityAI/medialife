import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  authConfigured,
  claimEmail,
  findUserByEmail,
  getUser,
  hashPassword,
  passwordProblem,
  saveUser,
  type HubUser,
} from "@/lib/hub/auth.server";
import { currentUser, startSession } from "@/lib/hub/session.server";
import { hubNs, newId } from "@/lib/hub/store.server";

import {
  clientCollector,
  clientGiveaways,
  clientMedia,
  clientLibrary,
  clientMaySeeSubmission,
  clientUgc,
} from "./content.server";
import { CLIENT_BASE, LIMITS, UGC_VERDICTS, type Client, type ClientRole } from "./model";
import { currentViewer, requireClient, type ClientViewer } from "./session.server";
import {
  getClient,
  getMember,
  removeFromTeam,
  listInvites,
  listLinks,
  listMembers,
  listMerch,
  listPosts,
  markInviteAccepted,
  resolveInvite,
  revokeInvite,
  saveFeedback,
  saveMember,
  sendInvite,
} from "./store.server";

// The Client Hub's server functions (/client-hub). Every one starts from the
// viewer: a member of the client's team, or the MEDIALIFE team (admin cookie).

/** What the hub frame shows about a client: never the internal notes. */
function publicClient(c: Client) {
  return {
    id: c.id,
    name: c.name,
    brand: c.brand,
    logo: c.logo,
    features: c.features,
    welcome: c.welcome,
    contact: c.contact,
    experiencesUrl: c.experiencesUrl,
    catalogClient: c.catalogClient,
  };
}
export type PublicClient = ReturnType<typeof publicClient>;

function me(v: ClientViewer) {
  return { name: v.name, email: v.email, role: v.role, medialife: v.medialife };
}

/** Safe to call signed out: the route guard redirects on null. */
export const getClientSession = createServerFn({ method: "GET" }).handler(async () => {
  const v = await currentViewer();
  if (!v) {
    const s = await currentUser();
    return { viewer: null, signedInAs: s?.user.email ?? null };
  }
  return { viewer: { client: publicClient(v.client), me: me(v) }, signedInAs: v.email || null };
});

/* ---------------------------------------------------------------------------
   Pages
   --------------------------------------------------------------------------- */

export const getClientHome = createServerFn({ method: "GET" }).handler(async () => {
  const v = await requireClient();
  const f = v.client.features;
  const [posts, merch, ugc, collector, giveaways, media] = await Promise.all([
    f.updates ? listPosts(v.ns, v.client.id) : [],
    f.merch ? listMerch(v.ns, v.client.id) : [],
    f.ugc ? clientUgc(v.ns, v.client) : null,
    f.collector ? clientCollector(v.ns, v.client) : null,
    f.giveaways ? clientGiveaways(v.ns, v.client) : [],
    f.videos || f.files ? clientMedia(v.ns, v.client) : [],
  ]);
  return {
    posts: posts.slice(0, 4),
    merch: merch.slice(0, 6),
    ugc: ugc
      ? {
          creators: ugc.creators.length,
          reach: ugc.creators.reduce((s, c) => s + (c.reach ?? 0), 0),
          videos: ugc.videos.length,
          toReview: ugc.videos.filter((x) => x.status === "in-review" && !x.feedback?.verdict)
            .length,
          posted: ugc.videos.filter((x) => x.status === "posted").length,
          latest: ugc.videos.slice(0, 4),
        }
      : null,
    collector,
    giveaways,
    videos: media.filter((m) => m.kind === "video").length,
    files: media.filter((m) => m.kind !== "video").length,
    latestVideos: media.filter((m) => m.kind === "video").slice(0, 3),
  };
});

export const getClientUpdates = createServerFn({ method: "GET" }).handler(async () => {
  const v = await requireClient();
  return { posts: await listPosts(v.ns, v.client.id) };
});

export const getClientMerch = createServerFn({ method: "GET" }).handler(async () => {
  const v = await requireClient();
  const [merch, posts] = await Promise.all([
    listMerch(v.ns, v.client.id),
    listPosts(v.ns, v.client.id),
  ]);
  return { merch, posts: posts.filter((p) => p.kind === "merch") };
});

export const getClientUgc = createServerFn({ method: "GET" }).handler(async () => {
  const v = await requireClient();
  return clientUgc(v.ns, v.client);
});

export const getClientMedia = createServerFn({ method: "GET" }).handler(async () => {
  const v = await requireClient();
  const [media, links] = await Promise.all([
    clientMedia(v.ns, v.client),
    listLinks(v.ns, v.client.id),
  ]);
  return { media, links };
});

export const getClientUploads = createServerFn({ method: "GET" }).handler(async () => {
  const v = await requireClient();
  return { items: await clientLibrary(v.ns, v.client), canUpload: v.client.features.uploads };
});

export const getClientInsights = createServerFn({ method: "GET" }).handler(async () => {
  const v = await requireClient();
  const [collector, giveaways] = await Promise.all([
    v.client.features.collector ? clientCollector(v.ns, v.client) : null,
    v.client.features.giveaways ? clientGiveaways(v.ns, v.client) : [],
  ]);
  return { collector, giveaways };
});

/** Love it / needs changes / not for us, and a note. Seen by the client's team and MEDIALIFE only. */
export const saveUgcFeedbackFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      submissionId: z.string().regex(/^[A-Za-z0-9]{6,60}$/),
      verdict: z.enum(UGC_VERDICTS).nullable(),
      note: z.string().max(LIMITS.note * 2),
    }),
  )
  .handler(async ({ data }) => {
    const v = await requireClient();
    if (!v.client.features.ugc) return { ok: false as const, error: "Not available." };
    if (!(await clientMaySeeSubmission(v.ns, data.submissionId)))
      return { ok: false as const, error: "That video isn't available any more." };
    const saved = await saveFeedback(v.ns, {
      submissionId: data.submissionId,
      clientId: v.client.id,
      verdict: data.verdict,
      note: data.note.trim().slice(0, LIMITS.note),
      byName: v.medialife ? "MEDIALIFE team" : v.name,
      byUserId: v.user?.id ?? null,
      at: Date.now(),
    });
    return { ok: true as const, feedback: saved };
  });

/* ---------------------------------------------------------------------------
   Team
   --------------------------------------------------------------------------- */

export const getClientTeam = createServerFn({ method: "GET" }).handler(async () => {
  const v = await requireClient();
  const [members, invites] = await Promise.all([
    listMembers(v.ns, v.client.id),
    v.role === "admin" ? listInvites(v.ns, v.client.id) : [],
  ]);
  return {
    members,
    invites: invites.filter((i) => !i.acceptedAt && !i.revokedAt && i.expiresAt > Date.now()),
    myUserId: v.user?.id ?? null,
  };
});

const roleSchema = z.enum(["admin", "member"]);

export const inviteClientMember = createServerFn({ method: "POST" })
  .validator(
    z.object({
      email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
      name: z.string().trim().max(LIMITS.name),
      role: roleSchema,
    }),
  )
  .handler(async ({ data }) => {
    const v = await requireClient({ admin: true });
    return sendInvite(v.ns, v.client, {
      ...data,
      invitedBy: v.medialife ? "The MEDIALIFE team" : v.name,
    });
  });

export const revokeClientInvite = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().max(60) }))
  .handler(async ({ data }) => {
    const v = await requireClient({ admin: true });
    return { ok: await revokeInvite(v.ns, v.client.id, data.id) };
  });

export const setClientMemberRole = createServerFn({ method: "POST" })
  .validator(z.object({ userId: z.string().max(60), role: roleSchema }))
  .handler(async ({ data }) => {
    const v = await requireClient({ admin: true });
    const m = await getMember(v.ns, v.client.id, data.userId);
    if (!m) return { ok: false as const, error: "They're not on the team." };
    if (m.role === "admin" && data.role !== "admin") {
      const admins = (await listMembers(v.ns, v.client.id)).filter((x) => x.role === "admin");
      if (admins.length <= 1)
        return { ok: false as const, error: "The team needs at least one admin." };
    }
    await saveMember(v.ns, { ...m, role: data.role });
    const u = await getUser(v.ns, data.userId);
    if (u?.client?.id === v.client.id)
      await saveUser(v.ns, { ...u, client: { id: v.client.id, role: data.role } });
    return { ok: true as const };
  });

export const removeClientMember = createServerFn({ method: "POST" })
  .validator(z.object({ userId: z.string().max(60) }))
  .handler(async ({ data }) => {
    const v = await requireClient({ admin: true });
    if (v.user?.id === data.userId)
      return { ok: false as const, error: "You can't remove yourself. Ask another admin." };
    await removeFromTeam(v.ns, v.client.id, data.userId);
    return { ok: true as const };
  });

export const updateClientProfile = createServerFn({ method: "POST" })
  .validator(z.object({ name: z.string().trim().min(1, "Add your name").max(LIMITS.name) }))
  .handler(async ({ data }) => {
    const v = await requireClient();
    if (!v.user) return { ok: false as const, error: "The MEDIALIFE team has no profile here." };
    await saveUser(v.ns, { ...v.user, name: data.name });
    const m = await getMember(v.ns, v.client.id, v.user.id);
    if (m) await saveMember(v.ns, { ...m, name: data.name });
    return { ok: true as const };
  });

/* ---------------------------------------------------------------------------
   Joining from an invitation
   --------------------------------------------------------------------------- */

const tokenSchema = z.string().min(10).max(200);

/** Public: what an invitation is for. */
export const lookupClientInvite = createServerFn({ method: "GET" })
  .validator(z.object({ token: tokenSchema }))
  .handler(async ({ data }) => {
    const ns = hubNs();
    const r = await resolveInvite(ns, data.token);
    if (!r) return { state: "invalid" as const };
    const client = await getClient(ns, r.invite.clientId);
    if (!client || client.status !== "active") return { state: "invalid" as const };
    const s = await currentUser();
    return {
      state: r.state,
      clientName: client.name,
      brand: client.brand,
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
  ns: ClientViewer["ns"],
  user: HubUser,
  inv: { clientId: string; role: ClientRole; invitedBy: string; name: string },
) {
  const name = user.name || inv.name || user.email.split("@")[0];
  await saveUser(ns, { ...user, name, client: { id: inv.clientId, role: inv.role } });
  await saveMember(ns, {
    userId: user.id,
    clientId: inv.clientId,
    email: user.email,
    name,
    role: inv.role,
    joinedAt: Date.now(),
    invitedBy: inv.invitedBy,
  });
}

/** Signed in with the invited email: joins. No account yet: creates one with the password they choose. */
export const acceptClientInvite = createServerFn({ method: "POST" })
  .validator(
    z.object({
      token: tokenSchema,
      name: z.string().trim().max(LIMITS.name).optional(),
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
    const r = await resolveInvite(ns, data.token);
    if (!r || r.state !== "open")
      return {
        ok: false as const,
        error:
          r?.state === "accepted"
            ? "This invitation has already been used. Sign in instead."
            : r?.state === "expired"
              ? "This invitation has expired. Ask for a new one."
              : "This invitation isn't valid any more. Ask for a new one.",
      };
    const client = await getClient(ns, r.invite.clientId);
    if (!client || client.status !== "active")
      return { ok: false as const, error: "This hub isn't active." };

    const s = await currentUser();
    if (s) {
      if (s.user.email !== r.invite.email)
        return {
          ok: false as const,
          error: `This invitation is for ${r.invite.email}. Sign out, then open the link again.`,
        };
      if (s.user.client && s.user.client.id !== client.id)
        return { ok: false as const, error: "Your account is already on another client's team." };
      await joinTeam(ns, { ...s.user, name: s.user.name || data.name }, r.invite);
      await markInviteAccepted(ns, r.invite);
      return { ok: true as const, next: CLIENT_BASE };
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
      // the invitation went to this address
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
    return { ok: true as const, next: CLIENT_BASE };
  });
