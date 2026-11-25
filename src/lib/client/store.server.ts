import { randomBytes } from "node:crypto";

import { getRequest } from "@tanstack/react-start/server";

import {
  findUserByEmail,
  getUser,
  normalizeEmail,
  publicOrigin,
  saveUser,
} from "@/lib/hub/auth.server";
import { sendProgramEmail } from "@/lib/hub/mail.server";
import { hubStore, newId, readAll, sha256Hex, type HubNamespace } from "@/lib/hub/store.server";

import {
  ALL_FEATURES_ON,
  CLIENT_BASE,
  CLIENT_INVITE_DAYS,
  DEFAULT_CLIENTS,
  type Client,
  type ClientInvite,
  type ClientLink,
  type ClientMember,
  type ClientPost,
  type ClientRole,
  type MerchItem,
  type UgcFeedback,
} from "./model";

// Every Client Hub record, in the hub's Blobs store under "clients/…". Kept in
// one file so the keys live in one place.

export const CKEYS = {
  client: (id: string) => `clients/${id}`,
  clients: () => `clients/`,
  member: (c: string, userId: string) => `client-members/${c}/${userId}`,
  members: (c: string) => `client-members/${c}/`,
  invite: (c: string, id: string) => `client-invites/${c}/${id}`,
  invites: (c: string) => `client-invites/${c}/`,
  post: (c: string, id: string) => `client-posts/${c}/${id}`,
  posts: (c: string) => `client-posts/${c}/`,
  merch: (c: string, id: string) => `client-merch/${c}/${id}`,
  merchAll: (c: string) => `client-merch/${c}/`,
  link: (c: string, id: string) => `client-links/${c}/${id}`,
  links: (c: string) => `client-links/${c}/`,
  feedback: (c: string, submissionId: string) => `client-ugc-feedback/${c}/${submissionId}`,
  feedbackAll: (c: string) => `client-ugc-feedback/${c}/`,
} as const;

const store = (ns: HubNamespace) => hubStore(ns);

/* ---------------------------------------------------------------------------
   Clients
   --------------------------------------------------------------------------- */

/** Fills fields added after a record was saved. */
function withDefaults(c: Client): Client {
  const d = DEFAULT_CLIENTS[c.id];
  return {
    ...(d ?? {}),
    ...c,
    features: { ...ALL_FEATURES_ON, ...(d?.features ?? {}), ...c.features } as Client["features"],
    brand: { ...(d?.brand ?? { accent: "#3d8bff", ink: "#05070d" }), ...c.brand },
    contact: { ...(d?.contact ?? { name: "", email: "" }), ...c.contact },
    hiddenMedia: c.hiddenMedia ?? [],
    giveawayIds: c.giveawayIds ?? [],
  };
}

export async function getClient(ns: HubNamespace, id: string): Promise<Client | null> {
  const saved = await (await store(ns)).getJSON<Client>(CKEYS.client(id));
  if (saved) return withDefaults(saved);
  const d = DEFAULT_CLIENTS[id];
  if (!d) return null;
  const now = Date.now();
  return { ...d, createdAt: now, updatedAt: now };
}

export async function saveClient(ns: HubNamespace, c: Client) {
  const next = { ...c, updatedAt: Date.now() };
  await (await store(ns)).setJSON(CKEYS.client(c.id), next);
  return next;
}

export async function listClients(ns: HubNamespace): Promise<Client[]> {
  const saved = (await readAll<Client>(await store(ns), CKEYS.clients())).map(withDefaults);
  const ids = new Set(saved.map((c) => c.id));
  const now = Date.now();
  for (const d of Object.values(DEFAULT_CLIENTS))
    if (!ids.has(d.id)) saved.push({ ...d, createdAt: now, updatedAt: now });
  return saved.sort((a, b) => a.name.localeCompare(b.name));
}

/* ---------------------------------------------------------------------------
   Team
   --------------------------------------------------------------------------- */

export async function listMembers(ns: HubNamespace, clientId: string) {
  const all = await readAll<ClientMember>(await store(ns), CKEYS.members(clientId));
  return all.sort((a, b) => a.joinedAt - b.joinedAt);
}

export async function getMember(ns: HubNamespace, clientId: string, userId: string) {
  return (await store(ns)).getJSON<ClientMember>(CKEYS.member(clientId, userId));
}

export async function saveMember(ns: HubNamespace, m: ClientMember) {
  await (await store(ns)).setJSON(CKEYS.member(m.clientId, m.userId), m);
}

export async function deleteMember(ns: HubNamespace, clientId: string, userId: string) {
  await (await store(ns)).del(CKEYS.member(clientId, userId));
}

/** Takes someone off a client team (the member record and the account's membership). */
export async function removeFromTeam(ns: HubNamespace, clientId: string, userId: string) {
  await deleteMember(ns, clientId, userId);
  const u = await getUser(ns, userId);
  if (u?.client?.id === clientId) await saveUser(ns, { ...u, client: null });
}

type StoredInvite = ClientInvite & { secretHash: string };
const publicInvite = ({ secretHash: _s, ...i }: StoredInvite): ClientInvite => i;

export async function listInvites(ns: HubNamespace, clientId: string) {
  const all = await readAll<StoredInvite>(await store(ns), CKEYS.invites(clientId));
  return all.map(publicInvite).sort((a, b) => b.createdAt - a.createdAt);
}

export async function revokeInvite(ns: HubNamespace, clientId: string, id: string) {
  const s = await store(ns);
  const inv = await s.getJSON<StoredInvite>(CKEYS.invite(clientId, id));
  if (!inv || inv.acceptedAt) return false;
  await s.setJSON(CKEYS.invite(clientId, id), { ...inv, revokedAt: Date.now() });
  return true;
}

/** The invitation a token ("<clientId>.<inviteId>.<secret>") names, and whether it's still usable. */
export async function resolveInvite(ns: HubNamespace, token: string) {
  const [clientId, id, secret] = token.split(".");
  if (!clientId || !id || !secret || !/^[a-z0-9-]{1,40}$/.test(clientId)) return null;
  if (!/^[A-Za-z0-9]{4,60}$/.test(id)) return null;
  const inv = await (await store(ns)).getJSON<StoredInvite>(CKEYS.invite(clientId, id));
  if (!inv) return null;
  const hash = await sha256Hex(secret);
  if (hash.length !== inv.secretHash.length) return null;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ inv.secretHash.charCodeAt(i);
  if (diff) return null;
  const state = inv.acceptedAt
    ? ("accepted" as const)
    : inv.revokedAt
      ? ("revoked" as const)
      : inv.expiresAt < Date.now()
        ? ("expired" as const)
        : ("open" as const);
  return { invite: publicInvite(inv), state };
}

export async function markInviteAccepted(ns: HubNamespace, inv: ClientInvite) {
  const s = await store(ns);
  const cur = await s.getJSON<StoredInvite>(CKEYS.invite(inv.clientId, inv.id));
  if (cur) await s.setJSON(CKEYS.invite(inv.clientId, inv.id), { ...cur, acceptedAt: Date.now() });
}

/**
 * Invites someone to a client team. Emails the link when email is set up;
 * the link always comes back too, so the MEDIALIFE team can send it by hand.
 */
export async function sendInvite(
  ns: HubNamespace,
  client: Client,
  input: { email: string; name: string; role: ClientRole; invitedBy: string },
) {
  const email = normalizeEmail(input.email);
  const existing = await findUserByEmail(ns, email);
  if (existing?.client && existing.client.id === client.id)
    return { ok: false as const, error: "They're already on the team." };
  if (existing?.client)
    return { ok: false as const, error: "That account is already on another client's team." };
  const open = (await listInvites(ns, client.id)).filter(
    (i) => i.email === email && !i.acceptedAt && !i.revokedAt,
  );
  for (const o of open) await revokeInvite(ns, client.id, o.id);

  const secret = randomBytes(24).toString("base64url");
  const now = Date.now();
  const invite: StoredInvite = {
    id: newId(8),
    clientId: client.id,
    email,
    name: input.name.trim(),
    role: input.role,
    invitedBy: input.invitedBy,
    createdAt: now,
    expiresAt: now + CLIENT_INVITE_DAYS * 86_400_000,
    acceptedAt: null,
    revokedAt: null,
    secretHash: await sha256Hex(secret),
  };
  await (await store(ns)).setJSON(CKEYS.invite(client.id, invite.id), invite);
  const token = `${client.id}.${invite.id}.${secret}`;
  const url = `${publicOrigin(getRequest(), ns)}${CLIENT_BASE}/join?token=${encodeURIComponent(token)}`;
  const hi = invite.name ? `Hi ${invite.name},\n\n` : "";
  const mail = await sendProgramEmail(ns, email, {
    subject: `Your ${client.name} hub on MEDIALIFE`,
    eyebrow: `${client.name} × MEDIALIFE`,
    heading: `Join the ${client.name} hub`,
    body: `${hi}${input.invitedBy} invited you to the ${client.name} hub on MEDIALIFE: your creators and their videos, updates, merch, files and every ${client.name} experience in one place.\n\nYou'll choose your own password when you open the link.`,
    cta: "Open the invitation",
    url,
    footer: `The invitation works for ${CLIENT_INVITE_DAYS} days and only for this email address. If you weren't expecting it, you can ignore it.`,
  });
  return {
    ok: true as const,
    invite: publicInvite(invite),
    emailSent: mail.sent,
    /** Always returned: the person sending the invite can copy it. */
    link: url,
  };
}

/* ---------------------------------------------------------------------------
   Posts, merch, links, feedback
   --------------------------------------------------------------------------- */

export async function listPosts(ns: HubNamespace, clientId: string) {
  const all = await readAll<ClientPost>(await store(ns), CKEYS.posts(clientId));
  return all.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt);
}
export async function getPost(ns: HubNamespace, clientId: string, id: string) {
  return (await store(ns)).getJSON<ClientPost>(CKEYS.post(clientId, id));
}
export async function savePost(ns: HubNamespace, p: ClientPost) {
  await (await store(ns)).setJSON(CKEYS.post(p.clientId, p.id), p);
  return p;
}
export async function deletePost(ns: HubNamespace, clientId: string, id: string) {
  await (await store(ns)).del(CKEYS.post(clientId, id));
}

export async function listMerch(ns: HubNamespace, clientId: string) {
  const all = await readAll<MerchItem>(await store(ns), CKEYS.merchAll(clientId));
  return all.sort((a, b) => a.order - b.order || b.updatedAt - a.updatedAt);
}
export async function getMerch(ns: HubNamespace, clientId: string, id: string) {
  return (await store(ns)).getJSON<MerchItem>(CKEYS.merch(clientId, id));
}
export async function saveMerch(ns: HubNamespace, m: MerchItem) {
  await (await store(ns)).setJSON(CKEYS.merch(m.clientId, m.id), m);
  return m;
}
export async function deleteMerch(ns: HubNamespace, clientId: string, id: string) {
  await (await store(ns)).del(CKEYS.merch(clientId, id));
}

export async function listLinks(ns: HubNamespace, clientId: string) {
  const all = await readAll<ClientLink>(await store(ns), CKEYS.links(clientId));
  return all.sort((a, b) => b.createdAt - a.createdAt);
}
export async function getLink(ns: HubNamespace, clientId: string, id: string) {
  return (await store(ns)).getJSON<ClientLink>(CKEYS.link(clientId, id));
}
export async function saveLink(ns: HubNamespace, l: ClientLink) {
  await (await store(ns)).setJSON(CKEYS.link(l.clientId, l.id), l);
  return l;
}
export async function deleteLink(ns: HubNamespace, clientId: string, id: string) {
  await (await store(ns)).del(CKEYS.link(clientId, id));
}

export async function listFeedback(ns: HubNamespace, clientId: string) {
  return readAll<UgcFeedback>(await store(ns), CKEYS.feedbackAll(clientId));
}
export async function saveFeedback(ns: HubNamespace, f: UgcFeedback) {
  await (await store(ns)).setJSON(CKEYS.feedback(f.clientId, f.submissionId), f);
  return f;
}

export { newId };
