import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { buildDashboard } from "@/lib/ar/analytics.server";
import { namespaceFromRequest } from "@/lib/ar/store.server";
import { readAllShelves } from "@/lib/shelf/shelves.server";

import { signatureStatus } from "./agreements";
import { earningsFor, listActivity, listCreatorSummaries, listProducts } from "./data.server";
import { SKUS, STAGES, earningsByDay, stageOf, type ActivityKind } from "./model";
import { slugifyPartner } from "./partners";
import { listMembers, listPartners, listSignatures } from "./partners.server";
import { requireHubAdmin } from "./session.server";
import { KEYS, hubStore, readAll } from "./store.server";

// /admin, the team's home: what needs the team today, how the program is
// doing, partners, and the demos side at a glance, in one round trip.

const DAY = 86_400_000;

export const adminHomeFn = createServerFn({ method: "GET" }).handler(async () => {
  const ns = await requireHubAdmin();
  const arNs = namespaceFromRequest(getRequest());
  const summaries = await listCreatorSummaries(ns);
  // Creators with work in flight: products, orders and agreements.
  const working = summaries.filter((s) => s.status === "approved" || s.status === "paused");

  const [rows, partners, unmatched, analytics, shelves] = await Promise.all([
    Promise.all(
      working.map(async (s) => {
        const [products, earnings, signatures, activity] = await Promise.all([
          listProducts(ns, s.id),
          earningsFor(ns, s.id),
          listSignatures(ns, s.id),
          listActivity(ns, s.id),
        ]);
        return {
          s,
          products,
          earnings,
          signed: signatureStatus(signatures).signedCurrent,
          activity,
        };
      }),
    ),
    listPartners(ns).then((ps) =>
      Promise.all(ps.map(async (p) => ({ p, members: (await listMembers(ns, p.id)).length }))),
    ),
    hubStore(ns)
      .then((store) => readAll(store, KEYS.unmatchedAll()))
      .then((a) => a.length)
      .catch(() => 0),
    // The demos side is a bonus here: the page still loads if it fails.
    buildDashboard(arNs, { range: "7d", demo: "all", client: "all", tz: "UTC" }).catch(() => null),
    readAllShelves(arNs).catch(() => []),
  ]);

  const now = Date.now();
  const counts = {
    submitted: summaries.filter((s) => s.status === "submitted").length,
    approved: summaries.filter((s) => s.status === "approved").length,
    paused: summaries.filter((s) => s.status === "paused").length,
    waitlist: summaries.filter((s) => s.status === "waitlist").length,
    total: summaries.filter((s) => s.status !== "draft").length,
  };

  // Oldest first: whoever has waited longest is at the top.
  const toReview = summaries
    .filter((s) => s.status === "submitted")
    .sort((a, b) => (a.submittedAt ?? a.createdAt) - (b.submittedAt ?? b.createdAt))
    .slice(0, 6)
    .map((s) => ({
      id: s.id,
      name: s.displayName,
      agency: s.agency,
      audience: s.audience,
      platforms: s.platforms,
      submittedAt: s.submittedAt ?? s.createdAt,
    }));

  const products = rows.flatMap((r) =>
    r.products.map((p) => ({ p, creatorId: r.s.id, creatorName: r.s.displayName })),
  );
  const open = products.filter(({ p }) => p.stage !== "live");
  const waitingOnUs = open
    .filter(({ p }) => p.waitingOn === "medialife")
    .sort((a, b) => a.p.stageUpdatedAt - b.p.stageUpdatedAt)
    .slice(0, 8)
    .map(({ p, creatorId, creatorName }) => ({
      creatorId,
      creatorName,
      productId: p.id,
      name: p.name,
      image: SKUS[p.sku]?.image ?? null,
      stage: stageOf(p.stage).name,
      since: p.stageUpdatedAt,
    }));

  const payouts = rows
    .filter((r) => r.earnings.summary.available > 0)
    .map((r) => ({
      creatorId: r.s.id,
      name: r.s.displayName,
      amount: r.earnings.summary.available,
      currency: r.earnings.summary.currency,
    }))
    .sort((a, b) => b.amount - a.amount);

  const unsigned = rows
    .filter((r) => r.s.status === "approved" && !r.signed)
    .map((r) => ({ id: r.s.id, name: r.s.displayName }));

  const pipeline = STAGES.map((st) => ({
    id: st.id,
    name: st.name,
    count: products.filter(({ p }) => p.stage === st.id).length,
  }));

  // Sales across every creator: the last 30 days against the 30 before.
  const orders = rows.flatMap((r) => r.earnings.orders);
  const days = earningsByDay(orders, 60, now);
  const cur = days.slice(-30);
  const prev = days.slice(0, 30);
  const sum = (d: typeof days, k: "net" | "earned" | "units") => d.reduce((s, x) => s + x[k], 0);
  const topCreators = rows
    .map((r) => ({
      id: r.s.id,
      name: r.s.displayName,
      net: sum(earningsByDay(r.earnings.orders, 30, now), "net"),
    }))
    .filter((c) => c.net > 0)
    .sort((a, b) => b.net - a.net)
    .slice(0, 4);

  const partnerRows = partners.map(({ p, members }) => {
    const mine = summaries.filter((c) =>
      c.agencyId ? c.agencyId === p.id : !!c.agency && slugifyPartner(c.agency) === p.id,
    );
    return {
      id: p.id,
      name: p.name,
      kit: p.kit,
      brand: p.brand,
      members,
      creators: mine.filter((c) => c.status !== "draft").length,
      active: mine.filter((c) => c.status === "approved").length,
      toReview: mine.filter((c) => c.status === "submitted").length,
    };
  });

  // Recent happenings across creators, plus new applications.
  type Feed = {
    id: string;
    kind: ActivityKind;
    at: number;
    creatorId: string;
    creatorName: string;
    title: string;
  };
  const feed: Feed[] = [
    ...rows.flatMap((r) =>
      r.activity
        .filter((a) => a.kind !== "account" && a.kind !== "message")
        .map((a) => ({
          id: `${r.s.id}:${a.id}`,
          kind: a.kind,
          at: a.at,
          creatorId: r.s.id,
          creatorName: r.s.displayName,
          title: a.title,
        })),
    ),
    ...summaries
      .filter((s) => s.submittedAt && now - s.submittedAt < 30 * DAY)
      .map((s) => ({
        id: `${s.id}:applied`,
        kind: "application" as const,
        at: s.submittedAt!,
        creatorId: s.id,
        creatorName: s.displayName,
        title: s.agency ? `Applied through ${s.agency}` : "Applied to the program",
      })),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 8);

  return {
    generatedAt: now,
    counts,
    toReview,
    waitingOnUs,
    waitingOnUsTotal: open.filter(({ p }) => p.waitingOn === "medialife").length,
    waitingOnCreator: open.filter(({ p }) => p.waitingOn === "creator").length,
    payouts,
    unsigned,
    unmatched,
    pipeline,
    liveProducts: products.filter(({ p }) => p.stage === "live").length,
    sales: {
      currency: orders[0]?.currency ?? "USD",
      series: cur,
      net: sum(cur, "net"),
      prevNet: sum(prev, "net"),
      earned: sum(cur, "earned"),
      units: sum(cur, "units"),
      orders: orders.filter((o) => o.status !== "cancelled" && now - o.createdAt < 30 * DAY).length,
      readyToPay: payouts.reduce((s, p) => s + p.amount, 0),
      top: topCreators,
    },
    partners: partnerRows,
    feed,
    demos: analytics
      ? {
          hasAnyData: analytics.hasAnyData,
          visits: analytics.totals.visits,
          visitors: analytics.totals.visitors,
          leads: analytics.totals.leads,
          avgEngagedMs: analytics.totals.avgEngagedMs,
          series: analytics.series.map((x) => x.visits),
          topClients: analytics.clients
            .filter((c) => c.kind !== "direct" && c.visits > 0)
            .slice(0, 3)
            .map((c) => ({ id: c.id, name: c.name, visits: c.visits })),
        }
      : null,
    shelves: {
      total: shelves.length,
      published: shelves.filter((s) => s.published).length,
      partner: shelves.filter((s) => s.owner?.kind === "partner").length,
    },
  };
});

export type AdminHome = Awaited<ReturnType<typeof adminHomeFn>>;
