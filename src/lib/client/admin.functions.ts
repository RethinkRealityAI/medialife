import { createServerFn } from "@tanstack/react-start";
import { setCookie } from "@tanstack/react-start/server";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireHubAdmin } from "@/lib/hub/session.server";

import { allGiveawaysBrief, clientMediaForAdmin, clientUgc } from "./content.server";
import {
  CLIENT_FEATURES,
  DEFAULT_CLIENTS,
  LIMITS,
  LINK_KINDS,
  MERCH_STAGES,
  POST_KINDS,
  safeUrl,
  slugifyClient,
  type Client,
} from "./model";
import { VIEW_COOKIE } from "./session.server";
import {
  deleteLink,
  deleteMerch,
  deletePost,
  getClient,
  getLink,
  getMerch,
  getPost,
  listClients,
  listInvites,
  listLinks,
  listMembers,
  listMerch,
  listPosts,
  newId,
  removeFromTeam,
  revokeInvite,
  saveClient,
  saveLink,
  saveMerch,
  savePost,
  sendInvite,
} from "./store.server";

// The team side of the Client Hub, for /admin/clients. Every function checks the
// shared /admin cookie (throws "forbidden" otherwise).

const clientId = z.string().regex(/^[a-z0-9-]{1,40}$/);
const recId = z.string().regex(/^[A-Za-z0-9]{4,60}$/);
const str = (max: number) => z.string().max(max * 2);
const linkSchema = z.object({ label: str(LIMITS.title), url: str(LIMITS.url) }).nullable();

async function mustClient(ns: Awaited<ReturnType<typeof requireHubAdmin>>, id: string) {
  const c = await getClient(ns, id);
  if (!c) throw new Error("Client not found.");
  return c;
}

const cleanLink = (l: { label: string; url: string } | null) => {
  if (!l) return null;
  const url = safeUrl(l.url);
  return url ? { label: l.label.trim().slice(0, LIMITS.title) || "Open", url } : null;
};

export const adminListClients = createServerFn({ method: "GET" }).handler(async () => {
  const ns = await requireHubAdmin();
  const clients = await listClients(ns);
  return {
    ns,
    clients: await Promise.all(
      clients.map(async (c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        brand: c.brand,
        members: (await listMembers(ns, c.id)).length,
        posts: (await listPosts(ns, c.id)).length,
        updatedAt: c.updatedAt,
      })),
    ),
  };
});

export const adminGetClient = createServerFn({ method: "GET" })
  .validator(z.object({ id: clientId }))
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    const client = await getClient(ns, data.id);
    if (!client) return null;
    const [members, invites, posts, merch, links, media, giveaways, ugc] = await Promise.all([
      listMembers(ns, client.id),
      listInvites(ns, client.id),
      listPosts(ns, client.id),
      listMerch(ns, client.id),
      listLinks(ns, client.id),
      clientMediaForAdmin(ns, client),
      allGiveawaysBrief(ns),
      clientUgc(ns, client),
    ]);
    return {
      ns,
      client,
      members,
      invites: invites.filter((i) => !i.acceptedAt && !i.revokedAt),
      posts,
      merch,
      links,
      media,
      giveaways,
      feedback: ugc.videos
        .filter((v) => v.feedback && (v.feedback.verdict || v.feedback.note))
        .map((v) => ({
          submissionId: v.id,
          title: v.title,
          creatorName: v.creatorName,
          status: v.status,
          posterUrl: v.posterUrl,
          feedback: v.feedback!,
        })),
      ugcCounts: { creators: ugc.creators.length, videos: ugc.videos.length },
    };
  });

export const adminCreateClient = createServerFn({ method: "POST" })
  .validator(z.object({ name: z.string().trim().min(1).max(LIMITS.name) }))
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    const id = slugifyClient(data.name);
    if (!id) return { ok: false as const, error: "Use letters or numbers in the name." };
    if ((await listClients(ns)).some((c) => c.id === id))
      return { ok: false as const, error: "There's already a client with that name." };
    const now = Date.now();
    const base = DEFAULT_CLIENTS.evade;
    const c: Client = {
      ...base,
      id,
      name: data.name,
      mediaClient: data.name,
      catalogClient: data.name,
      experiencesUrl: "",
      hiddenMedia: [],
      giveawayIds: [],
      welcome: `Everything MEDIALIFE is running for ${data.name}, in one place.`,
      notes: "",
      createdAt: now,
      updatedAt: now,
    };
    await saveClient(ns, c);
    return { ok: true as const, id };
  });

export const adminSaveClient = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: clientId,
      patch: z
        .object({
          name: str(LIMITS.name),
          status: z.enum(["active", "paused"]),
          accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
          logo: str(LIMITS.url),
          mediaClient: str(LIMITS.name),
          catalogClient: str(LIMITS.name),
          experiencesUrl: str(LIMITS.url),
          features: z.record(z.enum(CLIENT_FEATURES), z.boolean()),
          hiddenMedia: z.array(recId).max(5000),
          giveawayIds: z.array(recId).max(200),
          welcome: str(LIMITS.welcome),
          contactName: str(LIMITS.name),
          contactEmail: z.string().trim().max(254),
          notes: str(LIMITS.notes),
        })
        .partial(),
    }),
  )
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    const c = await mustClient(ns, data.id);
    const p = data.patch;
    const next: Client = {
      ...c,
      name: p.name?.trim().slice(0, LIMITS.name) || c.name,
      status: p.status ?? c.status,
      brand: p.accent ? { ...c.brand, accent: p.accent.toLowerCase() } : c.brand,
      logo: p.logo !== undefined ? safeUrl(p.logo) : c.logo,
      mediaClient: p.mediaClient !== undefined ? p.mediaClient.trim() : c.mediaClient,
      catalogClient: p.catalogClient !== undefined ? p.catalogClient.trim() : c.catalogClient,
      experiencesUrl: p.experiencesUrl !== undefined ? safeUrl(p.experiencesUrl) : c.experiencesUrl,
      features: p.features ? { ...c.features, ...p.features } : c.features,
      hiddenMedia: p.hiddenMedia ? [...new Set(p.hiddenMedia)] : c.hiddenMedia,
      giveawayIds: p.giveawayIds ? [...new Set(p.giveawayIds)] : c.giveawayIds,
      welcome: p.welcome !== undefined ? p.welcome.trim().slice(0, LIMITS.welcome) : c.welcome,
      contact: {
        name: p.contactName !== undefined ? p.contactName.trim() : c.contact.name,
        email: p.contactEmail !== undefined ? p.contactEmail.trim() : c.contact.email,
      },
      notes: p.notes !== undefined ? p.notes.slice(0, LIMITS.notes) : c.notes,
    };
    return { ok: true as const, client: await saveClient(ns, next) };
  });

/** Opens the Client Hub as this client sees it (sets which client the team views). */
export const adminViewClientHub = createServerFn({ method: "POST" })
  .validator(z.object({ id: clientId }))
  .handler(async ({ data }) => {
    await requireHubAdmin();
    const secure = (getRequest()?.url ?? "").startsWith("https:");
    setCookie(VIEW_COOKIE, data.id, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 14,
    });
    return { ok: true as const };
  });

/* ---------------------------------------------------------------------------
   Team
   --------------------------------------------------------------------------- */

export const adminInviteClientMember = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: clientId,
      email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
      name: z.string().trim().max(LIMITS.name),
      role: z.enum(["admin", "member"]),
    }),
  )
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    const c = await mustClient(ns, data.id);
    return sendInvite(ns, c, { ...data, invitedBy: "The MEDIALIFE team" });
  });

export const adminRevokeClientInvite = createServerFn({ method: "POST" })
  .validator(z.object({ id: clientId, inviteId: recId }))
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    return { ok: await revokeInvite(ns, data.id, data.inviteId) };
  });

export const adminRemoveClientMember = createServerFn({ method: "POST" })
  .validator(z.object({ id: clientId, userId: z.string().max(60) }))
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    await removeFromTeam(ns, data.id, data.userId);
    return { ok: true as const };
  });

/* ---------------------------------------------------------------------------
   Updates, merch, links
   --------------------------------------------------------------------------- */

export const adminSavePost = createServerFn({ method: "POST" })
  .validator(
    z.object({
      clientId,
      id: recId.nullable(),
      kind: z.enum(POST_KINDS),
      title: str(LIMITS.title),
      body: str(LIMITS.body),
      link: linkSchema,
      pinned: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    await mustClient(ns, data.clientId);
    const title = data.title.trim().slice(0, LIMITS.title);
    if (!title) return { ok: false as const, error: "Add a title." };
    const prev = data.id ? await getPost(ns, data.clientId, data.id) : null;
    const now = Date.now();
    const post = await savePost(ns, {
      id: prev?.id ?? newId(8),
      clientId: data.clientId,
      kind: data.kind,
      title,
      body: data.body.trim().slice(0, LIMITS.body),
      link: cleanLink(data.link),
      pinned: data.pinned,
      author: "MEDIALIFE",
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    });
    return { ok: true as const, post };
  });

export const adminDeletePost = createServerFn({ method: "POST" })
  .validator(z.object({ clientId, id: recId }))
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    await deletePost(ns, data.clientId, data.id);
    return { ok: true as const };
  });

export const adminSaveMerch = createServerFn({ method: "POST" })
  .validator(
    z.object({
      clientId,
      id: recId.nullable(),
      name: str(LIMITS.title),
      stage: z.enum(MERCH_STAGES),
      description: str(LIMITS.description),
      image: str(LIMITS.url),
      eta: str(60),
      link: linkSchema,
      order: z.number().int().min(-1000).max(1000),
    }),
  )
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    await mustClient(ns, data.clientId);
    const name = data.name.trim().slice(0, LIMITS.title);
    if (!name) return { ok: false as const, error: "Add a name." };
    const prev = data.id ? await getMerch(ns, data.clientId, data.id) : null;
    const now = Date.now();
    const item = await saveMerch(ns, {
      id: prev?.id ?? newId(8),
      clientId: data.clientId,
      name,
      stage: data.stage,
      description: data.description.trim().slice(0, LIMITS.description),
      image: safeUrl(data.image),
      eta: data.eta.trim().slice(0, 60),
      link: cleanLink(data.link),
      order: data.order,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    });
    return { ok: true as const, item };
  });

export const adminDeleteMerch = createServerFn({ method: "POST" })
  .validator(z.object({ clientId, id: recId }))
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    await deleteMerch(ns, data.clientId, data.id);
    return { ok: true as const };
  });

export const adminSaveLink = createServerFn({ method: "POST" })
  .validator(
    z.object({
      clientId,
      id: recId.nullable(),
      title: str(LIMITS.title),
      url: str(LIMITS.url),
      description: str(LIMITS.description),
      kind: z.enum(LINK_KINDS),
    }),
  )
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    await mustClient(ns, data.clientId);
    const title = data.title.trim().slice(0, LIMITS.title);
    const url = safeUrl(data.url);
    if (!title) return { ok: false as const, error: "Add a title." };
    if (!url) return { ok: false as const, error: "Add a link that starts with https:// or /." };
    const prev = data.id ? await getLink(ns, data.clientId, data.id) : null;
    const now = Date.now();
    const link = await saveLink(ns, {
      id: prev?.id ?? newId(8),
      clientId: data.clientId,
      title,
      url,
      description: data.description.trim().slice(0, LIMITS.description),
      kind: data.kind,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    });
    return { ok: true as const, link };
  });

export const adminDeleteLink = createServerFn({ method: "POST" })
  .validator(z.object({ clientId, id: recId }))
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    await deleteLink(ns, data.clientId, data.id);
    return { ok: true as const };
  });
