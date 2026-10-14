import { randomBytes } from "node:crypto";

import { getRequest } from "@tanstack/react-start/server";

import type { Signature } from "./agreements";
import { findUserByEmail, normalizeEmail, publicOrigin } from "./auth.server";
import { listCreatorSummaries, type CreatorSummary } from "./data.server";
import { sendPartnerInvite } from "./mail.server";
import {
  PARTNER_BASE,
  PARTNER_INVITE_DAYS,
  slugifyPartner,
  type Partner,
  type PartnerInvite,
  type PartnerMember,
  type PartnerRole,
} from "./partners";
import { KEYS, hubStore, newId, readAll, sha256Hex, type HubNamespace } from "./store.server";

// Records for partners (agencies), their teams and team invitations, and the
// agreements creators sign. Every read and write goes through here.

/* ---------------------------------------------------------------------------
   Partners
   --------------------------------------------------------------------------- */

export async function getPartner(ns: HubNamespace, id: string) {
  return (await hubStore(ns)).getJSON<Partner>(KEYS.partner(id));
}

export async function savePartner(ns: HubNamespace, p: Partner) {
  p.updatedAt = Date.now();
  await (await hubStore(ns)).setJSON(KEYS.partner(p.id), p);
  return p;
}

export async function listPartners(ns: HubNamespace) {
  const all = await readAll<Partner>(await hubStore(ns), KEYS.partners());
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Creators tied to a partner. Index entries from before partners existed only
 * carry the agency's name, which invite links slugified into the id.
 */
export async function partnerCreatorSummaries(
  ns: HubNamespace,
  partnerId: string,
): Promise<CreatorSummary[]> {
  return (await listCreatorSummaries(ns)).filter((c) =>
    c.agencyId !== undefined
      ? c.agencyId === partnerId
      : !!c.agency && slugifyPartner(c.agency) === partnerId,
  );
}

/* ---------------------------------------------------------------------------
   Team
   --------------------------------------------------------------------------- */

export async function listMembers(ns: HubNamespace, partnerId: string) {
  const all = await readAll<PartnerMember>(await hubStore(ns), KEYS.partnerMembers(partnerId));
  return all.sort((a, b) => a.joinedAt - b.joinedAt);
}

export async function saveMember(ns: HubNamespace, m: PartnerMember) {
  await (await hubStore(ns)).setJSON(KEYS.partnerMember(m.partnerId, m.userId), m);
  return m;
}

export async function deleteMember(ns: HubNamespace, partnerId: string, userId: string) {
  await (await hubStore(ns)).del(KEYS.partnerMember(partnerId, userId));
}

/* ---------------------------------------------------------------------------
   Team invitations. The emailed token is "<partnerId>.<inviteId>.<secret>";
   only a hash of the secret is stored.
   --------------------------------------------------------------------------- */

type StoredInvite = PartnerInvite & { secretHash: string };

export async function createPartnerInvite(
  ns: HubNamespace,
  input: { partnerId: string; email: string; name: string; role: PartnerRole; invitedBy: string },
) {
  const secret = randomBytes(24).toString("base64url");
  const now = Date.now();
  const invite: StoredInvite = {
    id: newId(8),
    partnerId: input.partnerId,
    email: input.email.trim().toLowerCase(),
    name: input.name.trim(),
    role: input.role,
    invitedBy: input.invitedBy,
    createdAt: now,
    expiresAt: now + PARTNER_INVITE_DAYS * 86_400_000,
    acceptedAt: null,
    revokedAt: null,
    secretHash: await sha256Hex(secret),
  };
  await (await hubStore(ns)).setJSON(KEYS.partnerInvite(input.partnerId, invite.id), invite);
  return { invite: publicInvite(invite), token: `${input.partnerId}.${invite.id}.${secret}` };
}

const publicInvite = ({ secretHash: _s, ...i }: StoredInvite): PartnerInvite => i;

export async function listPartnerInvites(ns: HubNamespace, partnerId: string) {
  const all = await readAll<StoredInvite>(await hubStore(ns), KEYS.partnerInvites(partnerId));
  return all.map(publicInvite).sort((a, b) => b.createdAt - a.createdAt);
}

export async function revokePartnerInvite(ns: HubNamespace, partnerId: string, id: string) {
  const store = await hubStore(ns);
  const inv = await store.getJSON<StoredInvite>(KEYS.partnerInvite(partnerId, id));
  if (!inv || inv.acceptedAt) return false;
  await store.setJSON(KEYS.partnerInvite(partnerId, id), { ...inv, revokedAt: Date.now() });
  return true;
}

/** The invitation a token names, if it's still good to use. */
export async function resolvePartnerInvite(ns: HubNamespace, token: string) {
  const [partnerId, id, secret] = token.split(".");
  if (!partnerId || !id || !secret || !/^[a-z0-9-]{1,40}$/.test(partnerId)) return null;
  const inv = await (await hubStore(ns)).getJSON<StoredInvite>(KEYS.partnerInvite(partnerId, id));
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

export async function markInviteAccepted(ns: HubNamespace, inv: PartnerInvite) {
  const store = await hubStore(ns);
  const cur = await store.getJSON<StoredInvite>(KEYS.partnerInvite(inv.partnerId, inv.id));
  if (cur)
    await store.setJSON(KEYS.partnerInvite(inv.partnerId, inv.id), {
      ...cur,
      acceptedAt: Date.now(),
    });
}

/** Invites someone to a partner team by email (the partner's admins, or MEDIALIFE). */
export async function sendTeamInvite(
  ns: HubNamespace,
  partner: Partner,
  input: { email: string; name: string; role: "admin" | "member"; invitedBy: string },
) {
  const email = normalizeEmail(input.email);
  const existing = await findUserByEmail(ns, email);
  if (existing?.partner && existing.partner.id === partner.id)
    return { ok: false as const, error: "They're already on the team." };
  if (existing?.partner)
    return { ok: false as const, error: "That account is already on another partner's team." };
  const open = (await listPartnerInvites(ns, partner.id)).find(
    (i) => i.email === email && !i.acceptedAt && !i.revokedAt && i.expiresAt > Date.now(),
  );
  if (open) await revokePartnerInvite(ns, partner.id, open.id);
  const { invite, token } = await createPartnerInvite(ns, {
    partnerId: partner.id,
    email,
    name: input.name,
    role: input.role,
    invitedBy: input.invitedBy,
  });
  const url = `${publicOrigin(getRequest(), ns)}${PARTNER_BASE}/join?token=${encodeURIComponent(token)}`;
  const mail = await sendPartnerInvite(ns, email, {
    name: input.name,
    partnerName: partner.name,
    invitedBy: input.invitedBy,
    url,
    days: PARTNER_INVITE_DAYS,
  });
  return {
    ok: true as const,
    invite,
    emailSent: mail.sent,
    // Without email set up (previews, localhost), hand the link back to share by hand.
    link: mail.sent ? undefined : ns === "prod" ? url : (mail.devLink ?? url),
  };
}

/* ---------------------------------------------------------------------------
   Agreements
   --------------------------------------------------------------------------- */

export async function listSignatures(ns: HubNamespace, creatorId: string) {
  const all = await readAll<Signature>(await hubStore(ns), KEYS.signatures(creatorId));
  return all.sort((a, b) => b.signedAt - a.signedAt);
}

export async function saveSignature(ns: HubNamespace, s: Signature) {
  await (await hubStore(ns)).setJSON(KEYS.signature(s.creatorId, s.id), s);
  return s;
}
