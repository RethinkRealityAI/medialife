import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { releaseGenerated } from "@/lib/ar/assets.server";
import { purgeCacheTags } from "@/lib/ar/cdn.server";
import { namespaceFromRequest, type ArNamespace } from "@/lib/ar/store.server";
import { listInvites } from "@/lib/hub/data.server";
import type { Partner } from "@/lib/hub/partners";
import { requirePartner } from "@/lib/hub/session.server";

import { shelfConfigSchema, type ShelfConfig } from "./config";
import { partnerShelfConfig } from "./partner-presets";
import { shelfSlugSchema, shelfSlugify, type ShelfDoc } from "./shelves";
import {
  createShelf,
  deleteShelf,
  freeShelfSlug,
  publishShelf,
  readAllShelves,
  readShelf,
  renameShelf,
  saveShelfDraft,
  snapshotRef,
  summarizeShelf,
} from "./shelves.server";

// The Partner Hub's merch shelves (/partner-hub/shelves). A partner team sees,
// edits and publishes only its own shelves; every partner starts with one made
// from its kit (src/lib/shelf/partner-presets.ts). Invite codes on a shelf must
// be the team's own, so creators who apply are credited to it.

const shelfNs = () => namespaceFromRequest(getRequest());

const owns = (doc: ShelfDoc | null, partnerId: string): doc is ShelfDoc =>
  !!doc && doc.owner?.kind === "partner" && doc.owner.partnerId === partnerId;

async function ownedShelves(ns: ArNamespace, partnerId: string) {
  return (await readAllShelves(ns))
    .filter((d) => owns(d, partnerId))
    .sort(
      (a, b) =>
        Number(!!b.owner?.isDefault) - Number(!!a.owner?.isDefault) || b.updatedAt - a.updatedAt,
    );
}

/** The partner's starting shelf, made (and put live) the first time it's needed. */
async function ensureDefault(ns: ArNamespace, partner: Partner) {
  const mine = await ownedShelves(ns, partner.id);
  if (mine.length) return mine;
  const slug = await freeShelfSlug(ns, partner.id);
  await createShelf(ns, {
    slug,
    name: `${partner.name} shelf`,
    config: partnerShelfConfig(partner),
    owner: { kind: "partner", partnerId: partner.id, partnerName: partner.name, isDefault: true },
    publish: true,
  });
  return ownedShelves(ns, partner.id);
}

async function teamCodes(partnerId: string) {
  const { ns } = await requirePartner();
  return (await listInvites(ns))
    .filter((i) => i.agencyId === partnerId && !i.archived)
    .map((i) => ({ code: i.code, rep: i.rep }));
}

/** A shelf must carry one of the team's own invite codes (or none). */
async function inviteIssue(draft: unknown, partnerId: string) {
  const code = (draft as ShelfConfig | null)?.pitch?.inviteCode ?? "";
  if (!code) return null;
  const codes = await teamCodes(partnerId);
  return codes.some((c) => c.code === code)
    ? null
    : {
        ok: false as const,
        error: "invalid" as const,
        issues: [{ path: "pitch.inviteCode", message: "Use one of your team's invite codes." }],
      };
}

const slugOnly = z.object({ slug: shelfSlugSchema });

/** Everything the shelves page needs: the team's shelves and the one being edited. */
export const partnerShelvesFn = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string().max(60).optional() }))
  .handler(async ({ data }) => {
    const { partner } = await requirePartner();
    const ns = shelfNs();
    const mine = await ensureDefault(ns, partner);
    const current = mine.find((d) => d.slug === data.slug) ?? mine[0];
    return {
      shelves: mine.map(summarizeShelf),
      current: { doc: current, summary: summarizeShelf(current) },
      invites: await teamCodes(partner.id),
    };
  });

export const partnerCreateShelfFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      creator: z.string().trim().min(1, "Add the creator's name").max(28),
      label: z.string().trim().max(80).optional(),
      /** "preset" = the partner's starting design; "copy" = a copy of `from` */
      start: z.enum(["preset", "copy", "blank"]),
      from: shelfSlugSchema.optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { partner } = await requirePartner();
    const ns = shelfNs();
    let config: ShelfConfig;
    if (data.start === "copy") {
      const src = data.from ? await readShelf(ns, data.from) : null;
      if (!owns(src, partner.id)) return { ok: false as const, error: "That shelf is gone." };
      config = structuredClone(src.draft);
      // A copy for another creator: the handle and logo were the last one's.
      if (data.creator !== config.creator.name) {
        config.creator.handle = "";
        config.creator.logo = null;
      }
    } else {
      config = partnerShelfConfig(partner, {
        creator: data.creator,
        classic: data.start === "blank",
      });
    }
    const slug = await freeShelfSlug(ns, shelfSlugify(data.creator) || partner.id);
    const r = await createShelf(ns, {
      slug,
      name: data.label || `${data.creator} · ${partner.name}`,
      creator: data.creator,
      config,
      owner: { kind: "partner", partnerId: partner.id, partnerName: partner.name },
    });
    return r.ok
      ? { ok: true as const, slug: r.doc.slug }
      : { ok: false as const, error: "Couldn't create it. Try again." };
  });

export const partnerSaveShelfDraftFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      slug: shelfSlugSchema,
      draft: z.unknown(),
      base: z.number().int().optional(),
      force: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { partner } = await requirePartner();
    const ns = shelfNs();
    if (!owns(await readShelf(ns, data.slug), partner.id))
      return { ok: false as const, error: "not-found" as const };
    const bad = await inviteIssue(data.draft, partner.id);
    if (bad) return bad;
    return saveShelfDraft(ns, data.slug, data.draft, { base: data.base, force: data.force });
  });

export const partnerPublishShelfFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      slug: shelfSlugSchema,
      snapshotAssetId: z
        .string()
        .regex(/^[a-z0-9]{10,40}$/)
        .nullish(),
    }),
  )
  .handler(async ({ data }) => {
    const { partner } = await requirePartner();
    const ns = shelfNs();
    const doc = await readShelf(ns, data.slug);
    if (!owns(doc, partner.id)) return { ok: false as const, error: "not-found" as const };
    const bad = await inviteIssue(doc.draft, partner.id);
    if (bad)
      return { ok: false as const, error: "invalid" as const, message: bad.issues[0].message };
    const r = await publishShelf(ns, data.slug, { snapshotAssetId: data.snapshotAssetId });
    if (!r.ok) return r;
    await purgeCacheTags([`shelf-${data.slug}`]);
    if (r.previousSnapshot) await releaseGenerated(ns, [snapshotRef(r.previousSnapshot)]);
    return { ok: true as const, doc: r.doc, summary: r.summary };
  });

export const partnerRenameShelfFn = createServerFn({ method: "POST" })
  .validator(z.object({ slug: shelfSlugSchema, name: z.string().trim().min(1).max(80) }))
  .handler(async ({ data }) => {
    const { partner } = await requirePartner();
    const ns = shelfNs();
    if (!owns(await readShelf(ns, data.slug), partner.id))
      return { ok: false as const, error: "not-found" as const };
    return renameShelf(ns, data.slug, data.name);
  });

/** The starting shelf goes back to the partner's design (it can't be deleted). */
export const partnerResetShelfFn = createServerFn({ method: "POST" })
  .validator(slugOnly)
  .handler(async ({ data }) => {
    const { partner } = await requirePartner();
    const ns = shelfNs();
    const doc = await readShelf(ns, data.slug);
    if (!owns(doc, partner.id) || !doc.owner?.isDefault)
      return { ok: false as const, error: "not-found" as const };
    return saveShelfDraft(ns, data.slug, shelfConfigSchema.parse(partnerShelfConfig(partner)), {
      force: true,
    });
  });

export const partnerDeleteShelfFn = createServerFn({ method: "POST" })
  .validator(slugOnly)
  .handler(async ({ data }) => {
    const { partner } = await requirePartner();
    const ns = shelfNs();
    const doc = await readShelf(ns, data.slug);
    if (!owns(doc, partner.id)) return { ok: true as const };
    if (doc.owner?.isDefault)
      return { ok: false as const, error: "Your starting shelf can be reset, not deleted." };
    const r = await deleteShelf(ns, data.slug);
    await purgeCacheTags([`shelf-${data.slug}`]);
    if (r.snapshot) await releaseGenerated(ns, [snapshotRef(r.snapshot)]).catch(() => {});
    return { ok: true as const };
  });

/** For the invite field: is this one of the team's codes? */
export const partnerCheckInviteFn = createServerFn({ method: "GET" })
  .validator(z.object({ code: z.string().trim().toLowerCase().max(60) }))
  .handler(async ({ data }) => {
    const { partner } = await requirePartner();
    const codes = await teamCodes(partner.id);
    const hit = codes.find((c) => c.code === data.code);
    return { exists: !!hit, agency: hit ? partner.name : null };
  });
