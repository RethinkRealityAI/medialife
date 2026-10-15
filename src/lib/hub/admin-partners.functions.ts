import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { getUser, publicOrigin, saveUser } from "./auth.server";
import {
  getCreator,
  listCreatorSummaries,
  listFiles,
  listFolders,
  listInvites,
  logActivity,
  saveCreator,
  saveInvite,
} from "./data.server";
import { KIT_OWNER, partnerIdOk, partnerOwner, slugifyPartner, type Partner } from "./partners";
import {
  deleteMember,
  getPartner,
  listMembers,
  listPartnerInvites,
  listPartners,
  partnerCreatorSummaries,
  revokePartnerInvite,
  savePartner,
  sendTeamInvite,
} from "./partners.server";
import { requireHubAdmin } from "./session.server";

// /admin/partners: the MEDIALIFE team's side of partners. Create a partner and
// invite its first admin, see its team and creators, tie creators to it, and
// keep its collateral library (and the MEDIALIFE kit every partner gets) full.

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "A hex colour like #405d96");

export const adminListPartners = createServerFn({ method: "GET" }).handler(async () => {
  const ns = await requireHubAdmin();
  const [partners, summaries, kitFiles] = await Promise.all([
    listPartners(ns),
    listCreatorSummaries(ns),
    listFiles(ns, KIT_OWNER),
  ]);
  const rows = await Promise.all(
    partners.map(async (p) => {
      const [members, files] = await Promise.all([
        listMembers(ns, p.id),
        listFiles(ns, partnerOwner(p.id)),
      ]);
      const creators = summaries.filter((c) =>
        c.agencyId !== undefined
          ? c.agencyId === p.id
          : !!c.agency && slugifyPartner(c.agency) === p.id,
      );
      return {
        ...p,
        members: members.length,
        creators: creators.length,
        approved: creators.filter((c) => c.status === "approved").length,
        files: files.length,
      };
    }),
  );
  return { partners: rows, kitFiles: kitFiles.length };
});

export const adminGetPartner = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().max(40) }))
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    const partner = await getPartner(ns, data.id);
    if (!partner) return null;
    const [members, invites, creators, links, files, folders, kitFiles, kitFolders, all] =
      await Promise.all([
        listMembers(ns, partner.id),
        listPartnerInvites(ns, partner.id),
        partnerCreatorSummaries(ns, partner.id),
        listInvites(ns),
        listFiles(ns, partnerOwner(partner.id)),
        listFolders(ns, partnerOwner(partner.id)),
        listFiles(ns, KIT_OWNER),
        listFolders(ns, KIT_OWNER),
        listCreatorSummaries(ns),
      ]);
    return {
      partner,
      origin: publicOrigin(getRequest(), ns),
      members,
      invites: invites.filter((i) => !i.acceptedAt && !i.revokedAt),
      creators,
      // For "tie a creator": everyone not already with this partner.
      otherCreators: all
        .filter((c) => !creators.some((x) => x.id === c.id))
        .map((c) => ({ id: c.id, displayName: c.displayName, agency: c.agency })),
      links: links.filter((l) => l.agencyId === partner.id),
      library: { owner: partnerOwner(partner.id), files, folders },
      kit: { owner: KIT_OWNER, files: kitFiles, folders: kitFolders },
    };
  });

export const adminGetKit = createServerFn({ method: "GET" }).handler(async () => {
  const ns = await requireHubAdmin();
  const [files, folders] = await Promise.all([
    listFiles(ns, KIT_OWNER),
    listFolders(ns, KIT_OWNER),
  ]);
  return { owner: KIT_OWNER, files, folders };
});

const partnerInput = z.object({
  id: z.string().trim().toLowerCase().max(40).optional(),
  name: z.string().trim().min(2, "Add the partner's name").max(80),
  website: z.string().trim().max(200).url("A full URL, e.g. https://…").or(z.literal("")),
  discordUrl: z
    .string()
    .trim()
    .max(200)
    .url("A full URL, e.g. https://discord.gg/…")
    .or(z.literal("")),
  brand: z.object({ primary: hex, accent: hex, ink: hex }),
  kit: z.string().trim().max(40),
  notes: z.string().max(4000),
  status: z.enum(["active", "paused"]),
});

/** Create (no existing id) or update a partner. */
export const adminSavePartner = createServerFn({ method: "POST" })
  .validator(partnerInput.extend({ create: z.boolean() }))
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    const id = data.create ? data.id || slugifyPartner(data.name) : (data.id ?? "");
    if (!partnerIdOk(id))
      return { ok: false as const, error: "The id needs 2–40 lowercase letters, numbers or -." };
    const existing = await getPartner(ns, id);
    if (data.create && existing)
      return { ok: false as const, error: `There's already a partner with the id “${id}”.` };
    if (!data.create && !existing) return { ok: false as const, error: "Partner not found." };
    const now = Date.now();
    const partner: Partner = {
      id,
      name: data.name,
      status: data.status,
      website: data.website,
      discordUrl: data.discordUrl,
      brand: data.brand,
      kit: data.kit,
      notes: data.notes,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await savePartner(ns, partner);
    // The partner's default invite link (its id), behind its program page and
    // shelf links. Rep links come on top.
    if (data.create) {
      const taken = (await listInvites(ns)).find((i) => i.code === id);
      if (!taken)
        await saveInvite(ns, {
          code: id,
          agencyId: id,
          agencyName: partner.name,
          rep: "",
          note: "Default link",
          createdAt: now,
          uses: 0,
          archived: false,
        });
    }
    return { ok: true as const, partner };
  });

export const adminInvitePartnerMember = createServerFn({ method: "POST" })
  .validator(
    z.object({
      partnerId: z.string().max(40),
      email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
      name: z.string().trim().max(80),
      role: z.enum(["admin", "member"]),
    }),
  )
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    const partner = await getPartner(ns, data.partnerId);
    if (!partner) return { ok: false as const, error: "Partner not found." };
    return sendTeamInvite(ns, partner, { ...data, invitedBy: "The MEDIALIFE team" });
  });

export const adminRevokePartnerInvite = createServerFn({ method: "POST" })
  .validator(z.object({ partnerId: z.string().max(40), id: z.string().max(40) }))
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    return { ok: await revokePartnerInvite(ns, data.partnerId, data.id) };
  });

export const adminRemovePartnerMember = createServerFn({ method: "POST" })
  .validator(z.object({ partnerId: z.string().max(40), userId: z.string().max(60) }))
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    const u = await getUser(ns, data.userId);
    await deleteMember(ns, data.partnerId, data.userId);
    if (u?.partner?.id === data.partnerId) await saveUser(ns, { ...u, partner: null });
    return { ok: true as const };
  });

/** Ties a creator to a partner (or unties them: partnerId null). */
export const adminSetCreatorPartner = createServerFn({ method: "POST" })
  .validator(
    z.object({
      creatorId: z.string().max(60),
      partnerId: z.string().max(40).nullable(),
      rep: z.string().trim().max(80).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    const creator = await getCreator(ns, data.creatorId);
    if (!creator) return { ok: false as const, error: "Creator not found." };
    const partner = data.partnerId ? await getPartner(ns, data.partnerId) : null;
    if (data.partnerId && !partner) return { ok: false as const, error: "Partner not found." };
    await saveCreator(ns, {
      ...creator,
      agency: partner
        ? { id: partner.id, name: partner.name, rep: data.rep ?? creator.agency?.rep ?? "" }
        : null,
    });
    await logActivity(ns, creator.id, {
      kind: "account",
      title: partner ? `Now supported by ${partner.name}` : "No longer tied to a partner",
    });
    return { ok: true as const };
  });
