import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { releaseGenerated } from "@/lib/ar/assets.server";
import { ADMIN_COOKIE, verifyToken } from "@/lib/ar/auth.server";
import { purgeCacheTags } from "@/lib/ar/cdn.server";
import { namespaceFromRequest } from "@/lib/ar/store.server";
import { getInvite } from "@/lib/hub/data.server";

import { shelfSlugSchema } from "./shelves";
import {
  createShelf,
  deleteShelf,
  duplicateShelf,
  freeShelfSlug,
  listShelves,
  moveShelf,
  publishShelf,
  readShelf,
  renameShelf,
  saveShelfDraft,
  snapshotRef,
  summarizeShelf,
  unpublishShelf,
} from "./shelves.server";

// Server functions behind /admin/shelves. Every one needs the admin session
// (the same signed cookie as the endcap builder). Public pages are served by
// src/routes/shelf.$slug.ts and shelf.index.ts.

async function adminNs() {
  if (!(await verifyToken(getCookie(ADMIN_COOKIE)))) throw new Error("unauthorized");
  return namespaceFromRequest(getRequest());
}

/** /shelf/<slug> is cached on the CDN for a minute under this tag. */
const purgeShelf = (slug: string) => purgeCacheTags([`shelf-${slug}`]);

const anySlug = z.string().max(60);
const slugOnly = z.object({ slug: shelfSlugSchema });
const nameSchema = z.string().trim().min(1, "Add a name").max(80);
const assetId = z.string().regex(/^[a-z0-9]{10,40}$/);

export const listShelvesFn = createServerFn({ method: "GET" }).handler(async () => {
  return listShelves(await adminNs());
});

export const getShelfFn = createServerFn({ method: "GET" })
  .validator(z.object({ slug: anySlug }))
  .handler(async ({ data }) => {
    const doc = await readShelf(await adminNs(), data.slug);
    if (!doc) return null;
    return { doc, summary: summarizeShelf(doc) };
  });

/** Is the slug usable? Also suggests a free one from `base` (a name) when asked. */
export const shelfSlugCheckFn = createServerFn({ method: "GET" })
  .validator(z.object({ slug: anySlug.optional(), base: z.string().max(60).optional() }))
  .handler(async ({ data }) => {
    const ns = await adminNs();
    const suggestion = data.base ? await freeShelfSlug(ns, data.base) : null;
    if (!data.slug) return { valid: false, available: false, suggestion, reason: null };
    const parsed = shelfSlugSchema.safeParse(data.slug);
    if (!parsed.success) {
      return {
        valid: false,
        available: false,
        suggestion,
        reason: parsed.error.issues[0]?.message ?? "Not a valid link",
      };
    }
    const taken = !!(await readShelf(ns, data.slug));
    return {
      valid: true,
      available: !taken,
      suggestion,
      reason: taken ? "That link is taken" : null,
    };
  });

export const createShelfFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      slug: anySlug,
      name: nameSchema,
      creator: z.string().trim().max(28).optional(),
      /** duplicate this shelf's draft instead of starting from the default */
      from: shelfSlugSchema.nullish(),
    }),
  )
  .handler(async ({ data }) => {
    const r = await createShelf(await adminNs(), data);
    return r.ok ? { ok: true as const, slug: r.doc.slug } : r;
  });

export const duplicateShelfFn = createServerFn({ method: "POST" })
  .validator(slugOnly)
  .handler(async ({ data }) => {
    const r = await duplicateShelf(await adminNs(), data.slug);
    return r.ok ? { ok: true as const, summary: summarizeShelf(r.doc) } : r;
  });

/** Autosave. `base` is the updatedAt the editor last saw (see saveShelfDraft). */
export const saveShelfDraftFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      slug: shelfSlugSchema,
      draft: z.unknown(),
      base: z.number().int().optional(),
      force: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) =>
    saveShelfDraft(await adminNs(), data.slug, data.draft, {
      base: data.base,
      force: data.force,
    }),
  );

export const renameShelfFn = createServerFn({ method: "POST" })
  .validator(z.object({ slug: shelfSlugSchema, name: nameSchema }))
  .handler(async ({ data }) => renameShelf(await adminNs(), data.slug, data.name));

/** Change the link; refused once the shelf has been published. */
export const moveShelfFn = createServerFn({ method: "POST" })
  .validator(z.object({ from: shelfSlugSchema, to: anySlug }))
  .handler(async ({ data }) => {
    const r = await moveShelf(await adminNs(), data.from, data.to);
    return r.ok ? { ok: true as const, slug: r.doc.slug, updatedAt: r.doc.updatedAt } : r;
  });

export const publishShelfFn = createServerFn({ method: "POST" })
  .validator(z.object({ slug: shelfSlugSchema, snapshotAssetId: assetId.nullish() }))
  .handler(async ({ data }) => {
    const ns = await adminNs();
    const r = await publishShelf(ns, data.slug, { snapshotAssetId: data.snapshotAssetId });
    if (!r.ok) return r;
    await purgeShelf(data.slug);
    // the previous og image, unless something else still uses it
    if (r.previousSnapshot) await releaseGenerated(ns, [snapshotRef(r.previousSnapshot)]);
    return { ok: true as const, doc: r.doc, summary: r.summary };
  });

export const unpublishShelfFn = createServerFn({ method: "POST" })
  .validator(slugOnly)
  .handler(async ({ data }) => {
    const r = await unpublishShelf(await adminNs(), data.slug);
    await purgeShelf(data.slug);
    return r;
  });

export const deleteShelfFn = createServerFn({ method: "POST" })
  .validator(slugOnly)
  .handler(async ({ data }) => {
    const ns = await adminNs();
    const r = await deleteShelf(ns, data.slug);
    await purgeShelf(data.slug);
    if (r.snapshot) await releaseGenerated(ns, [snapshotRef(r.snapshot)]).catch(() => {});
    return { ok: true as const };
  });

/**
 * Does this Creator Hub invite code exist (and isn't archived)? Only a hint for
 * the editor: an unknown code still saves, the application just won't be tagged.
 */
export const checkInviteFn = createServerFn({ method: "GET" })
  .validator(z.object({ code: z.string().trim().toLowerCase().max(60) }))
  .handler(async ({ data }) => {
    const ns = await adminNs();
    if (!/^[a-z0-9-]{2,40}$/.test(data.code)) return { exists: false, agency: null };
    try {
      const inv = await getInvite(ns, data.code);
      return { exists: !!inv, agency: inv?.agencyName ?? null };
    } catch {
      return { exists: null, agency: null }; // couldn't check
    }
  });
