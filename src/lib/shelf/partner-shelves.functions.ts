import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { releaseGenerated } from "@/lib/ar/assets.server";
import { purgeCacheTags } from "@/lib/ar/cdn.server";
import { namespaceFromRequest } from "@/lib/ar/store.server";
import { getCreator, listInvites } from "@/lib/hub/data.server";
import { requirePartner } from "@/lib/hub/session.server";

import { shelfConfigSchema, type ShelfConfig } from "./config";
import { partnerShelfConfig } from "./partner-presets";
import { ensureDefaultShelf, ownedShelves, ownsShelf as owns } from "./partner-seed.server";
import { shelfSlugSchema, shelfSlugify, type ShelfStatus } from "./shelves";
import {
  createShelf,
  deleteShelf,
  freeShelfSlug,
  publishShelf,
  readShelf,
  renameShelf,
  saveShelfDraft,
  shelfStatus,
  snapshotRef,
  summarizeShelf,
} from "./shelves.server";

// The Partner Hub's merch shelves (/partner-hub/shelves). A partner team sees,
// edits and publishes only its own shelves; every partner starts with one made
// from its kit (src/lib/shelf/partner-presets.ts). Invite codes on a shelf must
// be the team's own, so creators who apply are credited to it.

const shelfNs = () => namespaceFromRequest(getRequest());

/** A Creator Hub creator id, as the hub's own routes accept it. */
const creatorIdSchema = z.string().regex(/^[A-Za-z0-9]{6,60}$/);

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
    const mine = await ensureDefaultShelf(ns, partner);
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
      /** One of the team's creators: the shelf then shows on their page. */
      creatorId: creatorIdSchema.optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { partner, ns: hubNs } = await requirePartner();
    const ns = shelfNs();
    if (data.creatorId) {
      const creator = await getCreator(hubNs, data.creatorId);
      if (creator?.agency?.id !== partner.id)
        return { ok: false as const, error: "That creator isn't on your team." };
      // One shelf per creator from here: a second click opens the first.
      const have = (await ownedShelves(ns, partner.id)).find(
        (d) => d.owner?.creatorId === data.creatorId,
      );
      if (have) return { ok: true as const, slug: have.slug };
    }
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
      owner: {
        kind: "partner",
        partnerId: partner.id,
        partnerName: partner.name,
        ...(data.creatorId ? { creatorId: data.creatorId } : {}),
      },
    });
    return r.ok
      ? { ok: true as const, slug: r.doc.slug }
      : { ok: false as const, error: "Couldn't create it. Try again." };
  });

export type CreatorShelf = {
  slug: string;
  status: ShelfStatus;
  /** "/api/ar/asset/<id>" once published from the builder, else null */
  snapshot: string | null;
  updatedAt: number;
};

/** creatorId → the team's shelf for that creator (the newest, if there are several). */
export const partnerCreatorShelvesFn = createServerFn({ method: "GET" }).handler(async () => {
  const { partner } = await requirePartner();
  const out: Record<string, CreatorShelf> = {};
  for (const d of await ownedShelves(shelfNs(), partner.id)) {
    const id = d.owner?.creatorId;
    if (!id || out[id]) continue;
    out[id] = {
      slug: d.slug,
      status: shelfStatus(d),
      snapshot: snapshotRef(d.snapshotAssetId),
      updatedAt: d.updatedAt,
    };
  }
  return out;
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
