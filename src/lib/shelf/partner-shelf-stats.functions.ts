import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { humanizeId, loadSessions } from "@/lib/ar/analytics.server";
import type { StoredSession } from "@/lib/ar/events";
import { namespaceFromRequest } from "@/lib/ar/store.server";
import { requirePartner } from "@/lib/hub/session.server";

import { shelfDemoId, type ShelfDoc } from "./shelves";
import { readAllShelves } from "./shelves.server";

// "Who opened your shelf": what happened on a partner team's shelves, from the
// same session records /admin/analytics reads (demo id "shelf:<slug>"). A team
// only ever sees its own shelves. Everything covers the last 30 days.
//
//   opens        sessions where the shelf loaded and the visitor got in (the
//                page's "enter" event), quick bounces included
//   visitors     distinct browsers among those
//   productTaps  products opened (each tap counts)
//   applyClicks  taps on "Apply" (the Creator Hub application), each counts

const DAY = 86_400_000;
const WINDOW_DAYS = 30;
const SERIES_DAYS = 14;
const RECENT_MAX = 20;

export interface ShelfActivityStats {
  slug: string;
  creator: string;
  opens: number;
  visitors: number;
  productTaps: number;
  applyClicks: number;
  lastAt: number | null;
  /** opens per day (rolling 24 h windows ending now), oldest first */
  series: number[];
}

export interface ShelfVisit {
  at: number;
  device: "mobile" | "desktop";
  /** "Toronto, CA", a country code, or "Unknown" */
  place: string;
  activeMs: number;
  /** product names tapped, in the order first tapped */
  products: string[];
  applied: boolean;
  /** this browser's nth open of the shelf in the window */
  visitNo: number;
}

export interface PartnerShelfStats {
  shelves: ShelfActivityStats[];
  current: (ShelfActivityStats & { recent: ShelfVisit[] }) | null;
}

const owns = (doc: ShelfDoc, partnerId: string) =>
  doc.owner?.kind === "partner" && doc.owner.partnerId === partnerId;

function placeOf(geo: StoredSession["geo"]): string {
  const city = geo.city?.trim();
  const country = geo.country?.trim();
  if (city && country) return `${city}, ${country}`;
  return city || country || "Unknown";
}

/** Product id → the name visitors saw (published first, the draft for anything newer). */
function productNames(doc: ShelfDoc): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of doc.draft.products) m.set(p.id, p.name);
  for (const p of doc.published?.products ?? []) m.set(p.id, p.name);
  return m;
}

export const partnerShelfStatsFn = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string().max(60).optional() }))
  .handler(async ({ data }): Promise<PartnerShelfStats> => {
    const { partner } = await requirePartner();
    const ns = namespaceFromRequest(getRequest());
    const now = Date.now();
    // One pass over the window's sessions (all demos: records are keyed by day).
    const [docs, sessions] = await Promise.all([
      readAllShelves(ns),
      loadSessions(ns, now - WINDOW_DAYS * DAY, now),
    ]);

    const mine = docs.filter((d) => owns(d, partner.id));
    const currentDoc = data.slug ? (mine.find((d) => d.slug === data.slug) ?? null) : null;

    type Acc = {
      stats: ShelfActivityStats;
      visitors: Set<string>;
      perVisitor: Map<string, number>;
      names: Map<string, string> | null;
      visits: ShelfVisit[];
    };
    const byDemo = new Map<string, Acc>();
    for (const doc of mine) {
      byDemo.set(shelfDemoId(doc.slug), {
        stats: {
          slug: doc.slug,
          creator: doc.draft.creator.name,
          opens: 0,
          visitors: 0,
          productTaps: 0,
          applyClicks: 0,
          lastAt: null,
          series: new Array<number>(SERIES_DAYS).fill(0),
        },
        visitors: new Set(),
        perVisitor: new Map(),
        names: doc === currentDoc ? productNames(doc) : null,
        visits: [],
      });
    }

    // oldest first, so visitNo counts up
    for (const { s } of sessions) {
      const acc = byDemo.get(s.demo);
      if (!acc || !s.events.some((e) => e.n === "enter")) continue;
      const st = acc.stats;
      st.opens++;
      acc.visitors.add(s.vid);
      st.lastAt = Math.max(st.lastAt ?? 0, s.startedAt);
      const day = Math.floor((now - s.startedAt) / DAY);
      if (day >= 0 && day < SERIES_DAYS) st.series[SERIES_DAYS - 1 - day]++;

      let applied = false;
      const tapped: string[] = [];
      for (const e of s.events) {
        if (e.n === "product_open") {
          st.productTaps++;
          const id = typeof e.p?.id === "string" ? e.p.id : null;
          if (id && !tapped.includes(id)) tapped.push(id);
        } else if (e.n === "apply_open") {
          st.applyClicks++;
          applied = true;
        }
      }

      const visitNo = (acc.perVisitor.get(s.vid) ?? 0) + 1;
      acc.perVisitor.set(s.vid, visitNo);
      if (acc.names) {
        const names = acc.names;
        acc.visits.push({
          at: s.startedAt,
          device: s.device.mobile ? "mobile" : "desktop",
          place: placeOf(s.geo),
          activeMs: s.activeMs,
          products: tapped.map((id) => names.get(id) ?? humanizeId(id)),
          applied,
          visitNo,
        });
      }
    }

    for (const acc of byDemo.values()) acc.stats.visitors = acc.visitors.size;
    const shelves = [...byDemo.values()]
      .map((a) => a.stats)
      .sort(
        (a, b) =>
          b.opens - a.opens ||
          (b.lastAt ?? 0) - (a.lastAt ?? 0) ||
          a.creator.localeCompare(b.creator),
      );

    const cur = currentDoc ? byDemo.get(shelfDemoId(currentDoc.slug)) : undefined;
    return {
      shelves,
      current: cur ? { ...cur.stats, recent: cur.visits.reverse().slice(0, RECENT_MAX) } : null,
    };
  });
