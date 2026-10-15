import { DEFAULT_SHELF, type ShelfProduct } from "@/lib/shelf/config";
import { shelfDemoId } from "@/lib/shelf/shelves";
import { readShelf } from "@/lib/shelf/shelves.server";

import { SAMPLE_VID, loadSessions, mapLimit } from "./analytics.server";
import { sessionKey, type StoredEvent, type StoredSession } from "./events";
import { arStore, type ArNamespace } from "./store.server";

// Sample visits to Creator Merch Shelves (demo "shelf:<slug>"), for showing the
// Partner Hub's shelf activity and /admin/analytics before real creators open a
// link. Records have exactly the shape POST /api/ar/track stores, and visitor
// ids start with SAMPLE_VID like writeSampleData's, so "Clear sample data" in
// /admin/analytics removes them too. Dev and deploy previews only.
//
// Deterministic for a seed: the same slugs and seed give the same visits at the
// same distance from now (so screenshots stay stable).

const DAY = 86_400_000;
const HOUR = 3_600_000;

type Rand = () => number;

/** mulberry32 */
function seeded(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const rid = (r: Rand, n: number) =>
  Array.from({ length: n }, () => ALPHABET[Math.floor(r() * ALPHABET.length)]).join("");
const pick = <T>(r: Rand, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const between = (r: Rand, a: number, b: number) => a + r() * (b - a);
/** a value from `xs` with the given relative weights */
function weighted<T>(r: Rand, xs: ReadonlyArray<readonly [T, number]>): T {
  const total = xs.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [v, w] of xs) if ((x -= w) < 0) return v;
  return xs[xs.length - 1][0];
}

const PLACES: ReadonlyArray<readonly [StoredSession["geo"], number]> = [
  [{ country: "CA", city: "Toronto" }, 3],
  [{ country: "US", city: "Los Angeles" }, 2.5],
  [{ country: "CA", city: "Vancouver" }, 1.5],
  [{ country: "CA", city: "Montreal" }, 1.5],
  [{ country: "GB", city: "London" }, 1.5],
];

const DEVICES = {
  iphone: { device: { mobile: true, os: "iOS", browser: "Safari" }, screen: "390x844" },
  iphonePro: { device: { mobile: true, os: "iOS", browser: "Safari" }, screen: "430x932" },
  android: { device: { mobile: true, os: "Android", browser: "Chrome" }, screen: "412x915" },
  mac: { device: { mobile: false, os: "macOS", browser: "Chrome" }, screen: "1512x982" },
  macSafari: { device: { mobile: false, os: "macOS", browser: "Safari" }, screen: "1728x1117" },
  windows: { device: { mobile: false, os: "Windows", browser: "Chrome" }, screen: "1920x1080" },
} as const;
type DeviceId = keyof typeof DEVICES;
const MOBILE: DeviceId[] = ["iphone", "iphone", "iphonePro", "android"];
const DESKTOP: DeviceId[] = ["mac", "macSafari", "windows"];

/** Where a rep's link gets opened from: DMs, email, Discord… (document.referrer) */
const REFS = [
  null,
  null,
  "https://www.instagram.com/",
  "https://discord.com/",
  "https://mail.google.com/",
  "https://www.tiktok.com/",
];

const TOUR = ["shelf", "activated", "scan", "hub", "customise", "cta"];
const APPLY_FROM = ["dock", "sheet", "tour", "estimator", "dock"];

interface Visitor {
  vid: string;
  device: DeviceId;
  geo: StoredSession["geo"];
  ref: string | null;
}

type Depth = "bounce" | "light" | "engaged";

/** The events one visit sends, as offsets from the start (ms). */
function journey(
  r: Rand,
  ctx: {
    slug: string;
    creator: string;
    products: ShelfProduct[];
    mobile: boolean;
    screen: string;
    depth: Depth;
    apply: boolean;
    audience: number;
  },
): { events: Array<{ n: string; at: number; p?: StoredEvent["p"] }>; activeMs: number } {
  const ev: Array<{ n: string; at: number; p?: StoredEvent["p"] }> = [];
  let at = 0;
  const push = (n: string, p?: StoredEvent["p"], gap: [number, number] = [2, 8]) => {
    at += between(r, gap[0], gap[1]) * 1000;
    ev.push({ n, at: Math.round(at), ...(p ? { p } : {}) });
  };
  const [w, h] = ctx.screen.split("x").map(Number);
  ev.push({
    n: "session_start",
    at: 0,
    p: { path: `/shelf/${ctx.slug}`, w, h, touch: ctx.mobile },
  });
  push(
    "enter",
    { source: "published", slug: ctx.slug, name: ctx.creator, products: ctx.products.length },
    [1.5, 4],
  );
  if (ctx.depth === "bounce") return { events: ev, activeMs: Math.round(between(r, 1400, 2900)) };

  // the guided tour runs first; light visits skip out of it early
  const steps = ctx.depth === "engaged" ? (r() < 0.65 ? TOUR.length : 3) : 1 + Math.floor(r() * 2);
  for (let i = 0; i < steps; i++) push("tour_step", { step: i + 1, id: TOUR[i] }, [3, 8]);
  if (steps === TOUR.length) push("tour_finish", { step: steps }, [3, 6]);
  else push("tour_skip", { step: steps }, [1, 3]);

  const taps =
    ctx.depth === "engaged" ? 2 + Math.floor(r() * 3) : r() < 0.55 ? 1 + Math.floor(r() * 2) : 0;
  const seen = new Set<string>();
  let applied = false;
  for (let i = 0; i < taps; i++) {
    let prod = pick(r, ctx.products);
    for (let tries = 0; seen.has(prod.id) && tries < 6; tries++) prod = pick(r, ctx.products);
    seen.add(prod.id);
    push("product_open", { id: prod.id, type: prod.type }, [4, 14]);
    if (r() < 0.5) push("sheet_details", { id: prod.id }, [3, 9]);
    if (ctx.depth === "engaged" && i === 0 && r() < 0.45) {
      push("activation_open", { id: prod.id, kind: prod.activation.kind, native: false }, [5, 12]);
    }
    if (ctx.depth === "engaged" && i === 1 && r() < 0.3) {
      push("add_to_cart", { id: prod.id, type: prod.type, qty: 1, price: prod.price }, [6, 15]);
      push("cart_open", { items: 1 }, [2, 5]);
    }
    if (ctx.apply && !applied && i === taps - 1 && r() < 0.5) {
      push("apply_open", { from: "sheet" }, [6, 20]);
      applied = true;
    }
  }
  if (ctx.depth === "engaged" && r() < 0.5) {
    push("estimator_use", { audience: ctx.audience }, [6, 18]);
  }
  if (ctx.apply && !applied) push("apply_open", { from: pick(r, APPLY_FROM) }, [5, 25]);

  const tail = between(r, 4, 30) * 1000;
  return { events: ev, activeMs: Math.round((at + tail) * between(r, 0.82, 0.97)) };
}

/**
 * Writes a believable spread of sample visits for each shelf over the last 14
 * days (6–25 opens a shelf, about 60% on phones, a few cities, product taps, a
 * few "Apply" taps and 1–3 people who came back). Earlier sample visits to the
 * same shelves are replaced, so running it again doesn't pile them up.
 */
export async function writeSampleShelfSessions(
  ns: ArNamespace,
  slugs: string[],
  opts: { seed?: number } = {},
): Promise<{ sessions: number }> {
  if (ns === "prod") throw new Error("Sample data is not available in production.");
  const demos = new Set(slugs.map(shelfDemoId));
  if (!demos.size) return { sessions: 0 };
  const store = await arStore("sessions", ns);
  const now = Date.now();

  // replace this function's earlier samples for these shelves
  const old = (await loadSessions(ns, now - 45 * DAY, now)).filter(
    ({ s }) => demos.has(s.demo) && s.vid.startsWith(SAMPLE_VID),
  );
  await mapLimit(old, 16, ({ key }) => store.del(key));

  const out: StoredSession[] = [];
  for (const slug of [...new Set(slugs)]) {
    const r = seeded(hash(slug) ^ (opts.seed ?? 12));
    const doc = await readShelf(ns, slug).catch(() => null);
    const cfg = doc?.published ?? doc?.draft ?? null;
    const known = new Set(DEFAULT_SHELF.products.map((p) => p.id));
    const fromShelf = (cfg?.products ?? []).filter((p) => p.enabled && known.has(p.id));
    const products = fromShelf.length ? fromShelf : DEFAULT_SHELF.products;
    const creator = cfg?.creator.name ?? DEFAULT_SHELF.creator.name;
    const audience = cfg?.pitch.audience ?? DEFAULT_SHELF.pitch.audience;

    const opens = 6 + Math.floor(r() * 20);

    // Start times: the link goes out ~2 weeks ago and gets passed around; the
    // most recent open is within the last few hours.
    const ago: number[] = [between(r, 0.6, 3.5) * HOUR];
    for (let i = 1; i < opens; i++) ago.push(Math.max(0.15, 13.7 * r() ** 1.35) * DAY);
    ago.sort((a, b) => b - a); // oldest first

    // Who: 1–3 people come back (2–3 opens each), everyone else opens once.
    const newVisitor = (): Visitor => {
      const mobile = r() < 0.6;
      return {
        vid: `${SAMPLE_VID}${rid(r, 10)}`,
        device: pick(r, mobile ? MOBILE : DESKTOP),
        geo: { ...weighted(r, PLACES) },
        ref: pick(r, REFS),
      };
    };
    const who: Visitor[] = [];
    // at most ~40% of a shelf's opens are repeat visits
    const budget = Math.max(2, Math.round(opens * 0.4));
    const repeaters = 1 + Math.floor(r() * 3);
    for (let i = 0; i < repeaters && who.length + 2 <= budget; i++) {
      const v = newVisitor();
      const n = Math.min(2 + Math.floor(r() * 2), budget - who.length);
      for (let k = 0; k < n; k++) who.push(v);
    }
    while (who.length < opens) who.push(newVisitor());
    // shuffle, so repeat visits spread across the fortnight
    for (let i = who.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [who[i], who[j]] = [who[j], who[i]];
    }

    let applies = 0;
    const visits = ago.map((msAgo, i) => {
      const v = who[i];
      const depth: Depth = weighted<Depth>(r, [
        ["bounce", 2],
        ["light", 3.5],
        ["engaged", 4.5],
      ]);
      const apply = depth === "engaged" && r() < 0.35;
      if (apply) applies++;
      return { msAgo, v, depth, apply };
    });
    // a shelf worth showing has at least one "Apply" tap
    if (!applies) {
      const last = [...visits].reverse().find((x) => x.depth !== "bounce") ?? visits[0];
      last.depth = "engaged";
      last.apply = true;
    }

    for (const { msAgo, v, depth, apply } of visits) {
      const dev = DEVICES[v.device];
      const startedAt = Math.round(now - msAgo);
      const { events, activeMs } = journey(r, {
        slug,
        creator,
        products,
        mobile: dev.device.mobile,
        screen: dev.screen,
        depth,
        apply,
        audience,
      });
      out.push({
        sid: `${startedAt.toString(36)}-${rid(r, 10)}`,
        vid: v.vid,
        demo: shelfDemoId(slug),
        link: null,
        client: null,
        startedAt,
        lastAt: Math.min(now, startedAt + (events[events.length - 1]?.at ?? 0) + 4000),
        activeMs,
        ref: v.ref,
        screen: dev.screen,
        device: { ...dev.device },
        geo: { ...v.geo },
        events: events.map((e) => ({ n: e.n, ts: startedAt + e.at, ...(e.p ? { p: e.p } : {}) })),
      });
    }
  }

  await mapLimit(out, 16, (s) => store.setJSON(sessionKey(s.sid), s));
  return { sessions: out.length };
}
