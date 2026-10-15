import { purgeCacheTags } from "@/lib/ar/cdn.server";
import type { ArNamespace } from "@/lib/ar/store.server";

import { partnerShelfConfig, type ShelfPartner } from "./partner-presets";
import { shelfSlugify, type ShelfDoc } from "./shelves";
import { createShelf, freeShelfSlug, readAllShelves } from "./shelves.server";

// Partner shelves made on the server, not in the editor: every partner's own
// starting shelf, and shelves "already built" for the creators a partner brings
// in (the sample data seeds one per Snowday creator). Shared by the Partner Hub's
// server functions (partner-shelves.functions.ts) and src/lib/hub/sample.server.ts.

export const ownsShelf = (doc: ShelfDoc | null, partnerId: string): doc is ShelfDoc =>
  !!doc && doc.owner?.kind === "partner" && doc.owner.partnerId === partnerId;

/** The partner's shelves: their own (default) first, then the newest. */
export async function ownedShelves(ns: ArNamespace, partnerId: string) {
  return (await readAllShelves(ns))
    .filter((d) => ownsShelf(d, partnerId))
    .sort(
      (a, b) =>
        Number(!!b.owner?.isDefault) - Number(!!a.owner?.isDefault) || b.updatedAt - a.updatedAt,
    );
}

/**
 * The partner's starting shelf, made (and put live) the first time it's needed.
 * Checked by `isDefault`, not "any shelf": seeded creator shelves can exist
 * before the team first opens the builder.
 */
export async function ensureDefaultShelf(ns: ArNamespace, partner: ShelfPartner) {
  const mine = await ownedShelves(ns, partner.id);
  if (mine.some((d) => d.owner?.isDefault)) return mine;
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

/**
 * A live shelf for each creator that doesn't have one yet: the partner's look
 * with the creator's name in neon and, when given, their picture (a site path
 * such as /partner-kit/snowday/creators/jellybean.webp) printed on the merch.
 * Safe to run again. Returns creatorId → slug for every creator passed in.
 * No snapshot is taken here (that happens in the browser on publish), so cards
 * show their placeholder until someone publishes from the builder.
 */
export async function ensurePartnerCreatorShelves(
  arNs: ArNamespace,
  partner: ShelfPartner,
  creators: Array<{ id: string; name: string; logo?: string; handle?: string }>,
): Promise<Record<string, string>> {
  const mine = await ensureDefaultShelf(arNs, partner);
  const out: Record<string, string> = {};
  const made: string[] = [];
  for (const c of creators) {
    const have = mine.find((d) => d.owner?.creatorId === c.id);
    if (have) {
      out[c.id] = have.slug;
      continue;
    }
    const config = partnerShelfConfig(partner, { creator: c.name });
    if (c.logo && (c.logo.startsWith("/") || c.logo.startsWith("https://")))
      config.creator.logo = c.logo;
    if (c.handle) config.creator.handle = c.handle.trim().slice(0, 40);
    const slug = await freeShelfSlug(arNs, shelfSlugify(c.name) || partner.id);
    const r = await createShelf(arNs, {
      slug,
      name: `${c.name} · ${partner.name}`,
      config,
      owner: {
        kind: "partner",
        partnerId: partner.id,
        partnerName: partner.name,
        creatorId: c.id,
      },
      publish: true,
    });
    if (r.ok) {
      out[c.id] = r.doc.slug;
      made.push(`shelf-${r.doc.slug}`);
    }
  }
  // A 404 for the slug may be sitting in the CDN from before it existed.
  if (made.length) await purgeCacheTags(made);
  return out;
}
