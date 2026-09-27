import { getCookie } from "@tanstack/react-start/server";

import { ADMIN_COOKIE, verifyToken } from "./auth.server";
import {
  linkSchema,
  sessionKey,
  type ArLink,
  type StoredEvent,
  type StoredSession,
} from "./events";
import type { ProjectDoc } from "./project";
import { arStore, type ArNamespace, type ArStore } from "./store.server";

// Server side of /admin/analytics and /admin/links: loads session records from
// the "sessions" store and turns them into small, pre-aggregated JSON, so the
// browser never downloads raw sessions (except the one opened in the drawer).
//
// Volume is small (tens to a few thousand sessions per range), so every request
// recomputes from the records. Records of days that are over are cached in
// memory per function instance; the key listing is always fresh.

const DAY = 86_400_000;

export async function assertAdmin(): Promise<void> {
  if (!(await verifyToken(getCookie(ADMIN_COOKIE)))) throw new Error("unauthorized");
}

/** Run fn over items with at most `limit` calls in flight. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// ---------------------------------------------------------------------------
// Demos
// ---------------------------------------------------------------------------

export interface DemoOption {
  id: string;
  /** full name for pickers */
  label: string;
  /** compact name for tables and chips */
  short: string;
  /** the demo's shared password, for pasting next to a link (built-in demos only) */
  password: string | null;
  builder: boolean;
}

export const BUILTIN_DEMOS: DemoOption[] = [
  {
    id: "roblox",
    label: "Roblox (MEDIALIFE × Roblox)",
    short: "Roblox",
    password: "robloxamp",
    builder: false,
  },
  {
    id: "monkey-quest",
    label: "Monkey Quest (Toei × Hypergalactic)",
    short: "Monkey Quest",
    password: "toeimq",
    builder: false,
  },
];

/** Published builder endcaps ("x:<slug>"). The projects store may be empty. */
export async function listBuilderDemos(ns: ArNamespace): Promise<DemoOption[]> {
  const store = await arStore("projects", ns);
  const keys = (await store.list("")).filter((k) => /^[a-z0-9-]+\.json$/.test(k));
  const docs = await mapLimit(keys, 16, (k) => store.getJSON<ProjectDoc>(k).catch(() => null));
  const out: DemoOption[] = [];
  docs.forEach((doc, i) => {
    if (!doc || typeof doc !== "object" || !doc.published) return;
    const slug = typeof doc.slug === "string" ? doc.slug : keys[i].replace(/\.json$/, "");
    const name = (doc.published.name || slug).trim();
    out.push({
      id: `x:${slug}`,
      label: `${name} (endcap)`,
      short: name,
      password: null,
      builder: true,
    });
  });
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

export async function listDemoOptions(ns: ArNamespace): Promise<DemoOption[]> {
  return [...BUILTIN_DEMOS, ...(await listBuilderDemos(ns).catch(() => []))];
}

/** A readable name for a demo id, even one that is no longer listed. */
function fallbackDemo(id: string): DemoOption {
  const builtin = BUILTIN_DEMOS.find((d) => d.id === id);
  if (builtin) return builtin;
  const name = id.startsWith("x:") ? id.slice(2) : id;
  return { id, label: name, short: name, password: null, builder: id.startsWith("x:") };
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

export async function readLinks(ns: ArNamespace): Promise<ArLink[]> {
  const store = await arStore("links", ns);
  const keys = (await store.list("")).filter((k) => /^[a-z0-9_-]{2,40}\.json$/.test(k));
  const raw = await mapLimit(keys, 16, (k) => store.getJSON(k).catch(() => null));
  const links: ArLink[] = [];
  for (const r of raw) {
    const p = linkSchema.safeParse(r);
    if (p.success) links.push(p.data);
  }
  return links.sort((a, b) => b.createdAt - a.createdAt);
}

// ---------------------------------------------------------------------------
// Loading sessions
// ---------------------------------------------------------------------------

export interface LoadedSession {
  key: string;
  s: StoredSession;
}

// Records of finished days rarely change (only a tab left open for days keeps
// appending), so they are kept in memory for the life of the function instance.
const recordCache = new Map<string, StoredSession>();
const RECORD_CACHE_MAX = 20_000;

const utcDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const KEY_RE = /^\d{4}-\d{2}-\d{2}\/[0-9a-z]{6,12}-[0-9a-z]{4,16}$/;

function isSession(v: unknown): v is StoredSession {
  const s = v as StoredSession;
  return (
    !!s &&
    typeof s === "object" &&
    typeof s.sid === "string" &&
    typeof s.startedAt === "number" &&
    Array.isArray(s.events) &&
    !!s.device &&
    !!s.geo
  );
}

/** Session keys whose UTC start day falls between the two instants. */
async function sessionKeys(store: ArStore, fromMs: number, toMs: number): Promise<string[]> {
  const days: string[] = [];
  const first = Date.parse(`${utcDate(fromMs)}T00:00:00Z`);
  for (let t = first; t <= toMs; t += DAY) days.push(utcDate(t));
  // One listing per month when most of a month is needed, otherwise per day.
  const byMonth = new Map<string, string[]>();
  for (const d of days) {
    const m = d.slice(0, 8);
    byMonth.set(m, [...(byMonth.get(m) ?? []), d]);
  }
  const prefixes: string[] = [];
  for (const [month, ds] of byMonth) {
    if (ds.length > 3) prefixes.push(month);
    else prefixes.push(...ds.map((d) => `${d}/`));
  }
  const wanted = new Set(days);
  const lists = await mapLimit(prefixes, 8, (p) => store.list(p));
  return lists.flat().filter((k) => KEY_RE.test(k) && wanted.has(k.slice(0, 10)));
}

/** Every session that started in [fromMs, toMs], oldest first. */
export async function loadSessions(
  ns: ArNamespace,
  fromMs: number,
  toMs = Date.now(),
): Promise<LoadedSession[]> {
  const store = await arStore("sessions", ns);
  const keys = await sessionKeys(store, fromMs, toMs);
  const settled = utcDate(Date.now() - 2 * DAY);
  const records = await mapLimit(keys, 16, async (key) => {
    const ck = `${ns}|${key}`;
    const hit = recordCache.get(ck);
    if (hit) return hit;
    const s = await store.getJSON<StoredSession>(key).catch(() => null);
    if (isSession(s) && key.slice(0, 10) <= settled) {
      recordCache.set(ck, s);
      if (recordCache.size > RECORD_CACHE_MAX) {
        const oldest = recordCache.keys().next().value;
        if (oldest) recordCache.delete(oldest);
      }
    }
    return s;
  });
  const out: LoadedSession[] = [];
  records.forEach((s, i) => {
    if (isSession(s) && s.startedAt >= fromMs && s.startedAt <= toMs) out.push({ key: keys[i], s });
  });
  return out.sort((a, b) => a.s.startedAt - b.s.startedAt);
}

export async function loadSession(ns: ArNamespace, key: string): Promise<StoredSession | null> {
  if (!KEY_RE.test(key)) return null;
  const store = await arStore("sessions", ns);
  const s = await store.getJSON<StoredSession>(key).catch(() => null);
  return isSession(s) ? s : null;
}

// ---------------------------------------------------------------------------
// What a session did
// ---------------------------------------------------------------------------

// Events the page sends on its own, without the visitor doing anything. They
// don't make a session count as a visit and aren't counted as actions.
const PASSIVE = new Set(["session_start", "link_resolved", "gate_view", "tour_step"]);

export function actionCount(s: StoredSession): number {
  let n = 0;
  for (const e of s.events) if (!PASSIVE.has(e.n)) n++;
  return n;
}

/** Opened and left: nothing done beyond loading the page, and under 3 s on screen. */
export function isBounce(s: StoredSession): boolean {
  return s.activeMs < 3000 && actionCount(s) === 0;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** "mouse_pad" → "Mouse pad": for events that only carry an id. */
function humanizeId(id: string): string {
  const s = id.replace(/[_-]+/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : id;
}

/** A stable label for the thing an event is about (product, theme…). */
function subject(e: StoredEvent): string | null {
  const p = e.p ?? {};
  const named = str(p.label) ?? str(p.name) ?? str(p.title);
  if (named) return named;
  const id = str(p.id) ?? str(p.theme);
  return id ? humanizeId(id) : null;
}

interface Traits {
  entered: boolean;
  explored: boolean;
  activation: boolean;
  launched: boolean;
  ar: boolean;
  arEvents: number;
  cta: boolean;
  lead: boolean;
  leads: number;
  cart: boolean;
  tourFinished: boolean;
  tourSkipped: boolean;
  products: Set<string>;
  themes: Set<string>;
}

function traitsOf(s: StoredSession): Traits {
  const t: Traits = {
    entered: false,
    explored: false,
    activation: false,
    launched: false,
    ar: false,
    arEvents: 0,
    cta: false,
    lead: false,
    leads: 0,
    cart: false,
    tourFinished: false,
    tourSkipped: false,
    products: new Set(),
    themes: new Set(),
  };
  for (const e of s.events) {
    switch (e.n) {
      case "gate_unlock":
      case "enter":
        t.entered = true;
        break;
      case "hotspot":
        t.explored = true;
        break;
      case "product_open": {
        t.explored = true;
        const k = subject(e);
        if (k) t.products.add(k);
        break;
      }
      case "theme": {
        const k = subject(e);
        if (k) t.themes.add(k);
        break;
      }
      case "activation_open":
        t.activation = true;
        break;
      case "activation_launch":
      case "game_start":
        t.activation = true;
        t.launched = true;
        break;
      case "ar_open":
      case "ar_qr":
        t.ar = true;
        t.arEvents++;
        break;
      case "cta_open":
        t.cta = true;
        break;
      case "lead_submit":
        t.cta = true;
        t.lead = true;
        t.leads++;
        break;
      case "add_to_cart":
      case "cart_open":
      case "checkout":
      case "order":
        t.cart = true;
        break;
      case "tour_finish":
        t.tourFinished = true;
        break;
      case "tour_skip":
        t.tourSkipped = true;
        break;
    }
  }
  return t;
}

/** How far down the funnel a session got (0 = opened … 5 = got in touch). */
function funnelDepth(t: Traits): number {
  if (t.cta) return 5;
  if (t.ar) return 4;
  if (t.activation) return 3;
  if (t.explored) return 2;
  if (t.entered) return 1;
  return 0;
}

export const FUNNEL_STEPS = [
  { id: "opened", label: "Opened the demo" },
  { id: "entered", label: "Entered the store" },
  { id: "explored", label: "Explored products" },
  { id: "activation", label: "Tried the activation" },
  { id: "ar", label: "Viewed in AR" },
  { id: "contact", label: "Got in touch" },
] as const;

/** What a visit (or all of a client's visits) did, for the highlight chips. */
export interface Highlights {
  products: number;
  tour: "finished" | "skipped" | null;
  activation: boolean;
  launched: boolean;
  ar: boolean;
  cart: boolean;
  cta: boolean;
  leads: number;
}

function highlightsOf(t: Traits): Highlights {
  return {
    products: t.products.size,
    tour: t.tourFinished ? "finished" : t.tourSkipped ? "skipped" : null,
    activation: t.activation,
    launched: t.launched,
    ar: t.ar,
    cart: t.cart,
    cta: t.cta,
    leads: t.leads,
  };
}

// ---------------------------------------------------------------------------
// Time zones: ranges and chart buckets follow the viewer's local calendar
// ---------------------------------------------------------------------------

export function safeTimeZone(tz: string | undefined): string {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

function zoned(tz: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = (ms: number) => {
    const o: Record<string, number> = {};
    for (const p of fmt.formatToParts(ms)) if (p.type !== "literal") o[p.type] = Number(p.value);
    return o as {
      year: number;
      month: number;
      day: number;
      hour: number;
      minute: number;
      second: number;
    };
  };
  /** local wall clock minus UTC, in ms, at an instant */
  const offset = (ms: number) => {
    const p = parts(ms);
    return (
      Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) -
      Math.floor(ms / 1000) * 1000
    );
  };
  /** the instant local midnight falls on, `daysBack` days before the local day of `ms` */
  const startOfDay = (ms: number, daysBack = 0) => {
    const p = parts(ms);
    const wall = Date.UTC(p.year, p.month - 1, p.day - daysBack);
    let at = wall - offset(wall);
    at = wall - offset(at);
    return at;
  };
  const dayKey = (ms: number) => {
    const p = parts(ms);
    return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  };
  return { parts, startOfDay, dayKey };
}

// ---------------------------------------------------------------------------
// The dashboard
// ---------------------------------------------------------------------------

export const RANGE_DAYS = { today: 1, "7d": 7, "30d": 30, "90d": 90 } as const;
export type RangeId = keyof typeof RANGE_DAYS;

export interface DashboardQuery {
  range: RangeId;
  /** "all" or a demo id */
  demo: string;
  /** "all", "none" (no link, no name), a link code, or "to:<name>" for ?to= visits */
  client: string;
  tz: string;
}

export interface CountRow {
  key: string;
  label: string;
  /** visits that did it */
  visits: number;
  /** times it happened */
  events: number;
}

export interface ClientRow {
  /** the client filter value for this row */
  id: string;
  kind: "link" | "name" | "direct";
  name: string;
  code: string | null;
  /** the link's demo; for other rows the one demo they opened, null when several */
  demo: string | null;
  linkState: "active" | "archived" | "deleted" | null;
  opens: number;
  visits: number;
  visitors: number;
  lastAt: number | null;
  engagedMs: number;
  products: number;
  themes: number;
  tour: "finished" | "skipped" | null;
  activation: boolean;
  launched: boolean;
  ar: boolean;
  cart: boolean;
  cta: boolean;
  leads: number;
}

export interface SessionRow {
  key: string;
  startedAt: number;
  lastAt: number;
  demo: string;
  clientId: string;
  client: string | null;
  code: string | null;
  activeMs: number;
  actions: number;
  bounced: boolean;
  mobile: boolean;
  os: string;
  browser: string;
  country: string | null;
  city: string | null;
  /** nth visit from this browser within the range, and how many it made */
  visitNo: number;
  visitorVisits: number;
  highlights: Highlights;
}

export interface Dashboard {
  ns: ArNamespace;
  generatedAt: number;
  range: { id: RangeId; from: number; to: number; bucket: "hour" | "day"; tz: string };
  /** false until the first session is ever recorded (first-run empty state) */
  hasAnyData: boolean;
  /** sample sessions in the range (dev / preview only) */
  sampleCount: number;
  totals: {
    opens: number;
    visits: number;
    bounced: number;
    visitors: number;
    engagedMs: number;
    avgEngagedMs: number;
    tourFinished: number;
    tourSkipped: number;
    productVisits: number;
    activationVisits: number;
    arOpens: number;
    arVisits: number;
    leads: number;
  };
  series: Array<{ t: number; visits: number; bounced: number }>;
  funnel: Array<{ id: string; label: string; count: number }>;
  clients: ClientRow[];
  products: CountRow[];
  themes: CountRow[];
  devices: { mobile: number; desktop: number };
  os: CountRow[];
  countries: CountRow[];
  sessions: SessionRow[];
  filters: {
    demos: Array<{ id: string; label: string }>;
    clients: Array<{ id: string; label: string; kind: ClientRow["kind"]; hint: string | null }>;
  };
}

const MAX_SESSION_ROWS = 200;
const TOP_N = 8;

export function clientIdOf(s: StoredSession): string {
  if (s.link) return s.link;
  const name = str(s.client);
  if (name) return `to:${name.toLowerCase()}`;
  return "none";
}

function topRows(
  map: Map<string, { label: string; visits: Set<string>; events: number }>,
): CountRow[] {
  return [...map.entries()]
    .map(([key, v]) => ({ key, label: v.label, visits: v.visits.size, events: v.events }))
    .sort((a, b) => b.visits - a.visits || b.events - a.events || a.label.localeCompare(b.label))
    .slice(0, TOP_N);
}

function bump(
  map: Map<string, { label: string; visits: Set<string>; events: number }>,
  key: string,
  label: string,
  sid: string,
) {
  let v = map.get(key);
  if (!v) map.set(key, (v = { label, visits: new Set(), events: 0 }));
  v.visits.add(sid);
  v.events++;
}

export async function buildDashboard(ns: ArNamespace, q: DashboardQuery): Promise<Dashboard> {
  const now = Date.now();
  const tz = safeTimeZone(q.tz);
  const z = zoned(tz);
  const days = RANGE_DAYS[q.range];
  const from = z.startOfDay(now, days - 1);
  const bucket: "hour" | "day" = q.range === "today" ? "hour" : "day";

  const [all, links, demoOptions] = await Promise.all([
    loadSessions(ns, from, now),
    readLinks(ns),
    listDemoOptions(ns),
  ]);
  const linkByCode = new Map(links.map((l) => [l.code, l]));
  const demoById = new Map(demoOptions.map((d) => [d.id, d]));
  const demoName = (id: string) => (demoById.get(id) ?? fallbackDemo(id)).short;

  const matchesDemo = (s: StoredSession) => q.demo === "all" || s.demo === q.demo;
  const matchesClient = (s: StoredSession) => q.client === "all" || clientIdOf(s) === q.client;
  const rows = all.filter(({ s }) => matchesDemo(s) && matchesClient(s));

  // ---- chart buckets ----
  const series: Dashboard["series"] = [];
  const bucketIndex = new Map<string, number>();
  if (bucket === "hour") {
    const hours = z.parts(now).hour;
    for (let h = 0; h <= hours; h++) {
      bucketIndex.set(String(h), series.length);
      series.push({ t: from + h * 3_600_000, visits: 0, bounced: 0 });
    }
  } else {
    for (let d = days - 1; d >= 0; d--) {
      const t = z.startOfDay(now, d);
      bucketIndex.set(z.dayKey(t), series.length);
      series.push({ t, visits: 0, bounced: 0 });
    }
  }
  const bucketOf = (ms: number) =>
    bucketIndex.get(bucket === "hour" ? String(z.parts(ms).hour) : z.dayKey(ms));

  // ---- one pass over the filtered sessions ----
  const totals: Dashboard["totals"] = {
    opens: 0,
    visits: 0,
    bounced: 0,
    visitors: 0,
    engagedMs: 0,
    avgEngagedMs: 0,
    tourFinished: 0,
    tourSkipped: 0,
    productVisits: 0,
    activationVisits: 0,
    arOpens: 0,
    arVisits: 0,
    leads: 0,
  };
  const funnelAtLeast = new Array<number>(FUNNEL_STEPS.length).fill(0);
  const visitors = new Set<string>();
  const products = new Map<string, { label: string; visits: Set<string>; events: number }>();
  const themes = new Map<string, { label: string; visits: Set<string>; events: number }>();
  const os = new Map<string, { label: string; visits: Set<string>; events: number }>();
  const countries = new Map<string, { label: string; visits: Set<string>; events: number }>();
  const devices = { mobile: 0, desktop: 0 };

  type Acc = ClientRow & {
    visitorSet: Set<string>;
    productSet: Set<string>;
    themeSet: Set<string>;
    demoSet: Set<string>;
  };
  const clients = new Map<string, Acc>();
  const newAcc = (id: string, kind: ClientRow["kind"], name: string): Acc => ({
    id,
    kind,
    name,
    code: null,
    demo: null,
    linkState: null,
    opens: 0,
    visits: 0,
    visitors: 0,
    lastAt: null,
    engagedMs: 0,
    products: 0,
    themes: 0,
    tour: null,
    activation: false,
    launched: false,
    ar: false,
    cart: false,
    cta: false,
    leads: 0,
    visitorSet: new Set(),
    demoSet: new Set(),
    productSet: new Set(),
    themeSet: new Set(),
  });

  const perVisitor = new Map<string, number>();
  const sessionRows: SessionRow[] = [];

  for (const { key, s } of rows) {
    const t = traitsOf(s);
    const bounced = isBounce(s);
    const cid = clientIdOf(s);
    totals.opens++;
    funnelAtLeast[funnelDepth(t)]++;
    const b = bucketOf(s.startedAt);

    // client row
    let acc = clients.get(cid);
    if (!acc) {
      const link = s.link ? linkByCode.get(s.link) : undefined;
      const kind: ClientRow["kind"] = s.link ? "link" : cid === "none" ? "direct" : "name";
      const name =
        kind === "direct" ? "Direct" : (link?.name ?? str(s.client) ?? s.link ?? "Unknown");
      acc = newAcc(cid, kind, name);
      if (s.link) {
        acc.code = s.link;
        acc.demo = link?.demo ?? s.demo;
        acc.linkState = link ? (link.archived ? "archived" : "active") : "deleted";
      }
      clients.set(cid, acc);
    }
    acc.demoSet.add(s.demo);
    acc.opens++;
    acc.lastAt = Math.max(acc.lastAt ?? 0, s.startedAt);

    const n = (perVisitor.get(s.vid) ?? 0) + 1;
    perVisitor.set(s.vid, n);

    sessionRows.push({
      key,
      startedAt: s.startedAt,
      lastAt: s.lastAt,
      demo: s.demo,
      clientId: cid,
      client: acc.kind === "direct" ? null : acc.name,
      code: s.link,
      activeMs: s.activeMs,
      actions: actionCount(s),
      bounced,
      mobile: !!s.device.mobile,
      os: s.device.os || "Other",
      browser: s.device.browser || "Other",
      country: s.geo.country,
      city: s.geo.city,
      visitNo: n,
      visitorVisits: 0,
      highlights: highlightsOf(t),
    });

    if (bounced) {
      totals.bounced++;
      if (b !== undefined) series[b].bounced++;
      continue;
    }

    totals.visits++;
    if (b !== undefined) series[b].visits++;
    visitors.add(s.vid);
    totals.engagedMs += s.activeMs;
    if (t.tourFinished) totals.tourFinished++;
    else if (t.tourSkipped) totals.tourSkipped++;
    if (t.products.size) totals.productVisits++;
    if (t.activation) totals.activationVisits++;
    if (t.ar) totals.arVisits++;
    totals.arOpens += t.arEvents;
    totals.leads += t.leads;

    for (const e of s.events) {
      if (e.n === "product_open") {
        const label = subject(e) ?? "Unnamed product";
        bump(products, label.toLowerCase(), label, s.sid);
      } else if (e.n === "theme") {
        const label = subject(e) ?? "Unnamed";
        bump(themes, label.toLowerCase(), label, s.sid);
      }
    }
    if (s.device.mobile) devices.mobile++;
    else devices.desktop++;
    bump(os, s.device.os || "Other", s.device.os || "Other", s.sid);
    const cc = s.geo.country || "";
    bump(countries, cc || "unknown", cc || "Unknown", s.sid);

    acc.visits++;
    acc.visitorSet.add(s.vid);
    acc.engagedMs += s.activeMs;
    t.products.forEach((p) => acc.productSet.add(p));
    t.themes.forEach((p) => acc.themeSet.add(p));
    if (t.tourFinished) acc.tour = "finished";
    else if (t.tourSkipped && !acc.tour) acc.tour = "skipped";
    acc.activation ||= t.activation;
    acc.launched ||= t.launched;
    acc.ar ||= t.ar;
    acc.cart ||= t.cart;
    acc.cta ||= t.cta;
    acc.leads += t.leads;
  }

  totals.visitors = visitors.size;
  totals.avgEngagedMs = totals.visits ? Math.round(totals.engagedMs / totals.visits) : 0;
  const vidOfKey = new Map(rows.map(({ key, s }) => [key, s.vid]));
  for (const r of sessionRows) r.visitorVisits = perVisitor.get(vidOfKey.get(r.key) ?? "") ?? 1;

  // Links that nobody opened in the range still get a row: "sent, not opened"
  // is what a follow-up needs to know.
  for (const l of links) {
    if (l.archived || clients.has(l.code)) continue;
    if (q.demo !== "all" && l.demo !== q.demo) continue;
    if (q.client !== "all" && q.client !== l.code) continue;
    const acc = newAcc(l.code, "link", l.name);
    acc.code = l.code;
    acc.demo = l.demo;
    acc.linkState = "active";
    clients.set(l.code, acc);
  }

  const created = new Map(links.map((l) => [l.code, l.createdAt]));
  const clientRows: ClientRow[] = [...clients.values()]
    .map(({ visitorSet, productSet, themeSet, demoSet, ...r }) => ({
      ...r,
      demo: r.kind === "link" ? r.demo : demoSet.size === 1 ? [...demoSet][0] : null,
      visitors: visitorSet.size,
      products: productSet.size,
      themes: themeSet.size,
    }))
    .sort((a, b) => {
      if ((a.kind === "direct") !== (b.kind === "direct")) return a.kind === "direct" ? 1 : -1;
      if (a.lastAt !== b.lastAt) return (b.lastAt ?? 0) - (a.lastAt ?? 0);
      return (created.get(b.code ?? "") ?? 0) - (created.get(a.code ?? "") ?? 0);
    });

  // ---- filter options come from the unfiltered range, so they don't shrink ----
  const seenDemos = new Set(all.map(({ s }) => s.demo));
  const demoFilter = [
    ...demoOptions.map((d) => ({ id: d.id, label: d.short })),
    ...[...seenDemos]
      .filter((id) => !demoById.has(id))
      .map((id) => ({ id, label: fallbackDemo(id).short })),
  ];
  const clientFilter: Dashboard["filters"]["clients"] = [];
  const seenClient = new Map<string, StoredSession>();
  for (const { s } of all) seenClient.set(clientIdOf(s), s);
  for (const l of links) {
    if (l.archived && !seenClient.has(l.code)) continue;
    clientFilter.push({
      id: l.code,
      label: l.name,
      kind: "link",
      hint: `${demoName(l.demo)}${l.archived ? " · archived" : ""}`,
    });
  }
  for (const [id, s] of seenClient) {
    if (id === "none" || linkByCode.has(id)) continue;
    clientFilter.push({
      id,
      label: str(s.client) ?? id,
      kind: s.link ? "link" : "name",
      hint: s.link ? "deleted link" : "name only",
    });
  }

  let hasAnyData = all.length > 0;
  if (!hasAnyData) {
    const store = await arStore("sessions", ns);
    hasAnyData = (await store.list("")).some((k) => KEY_RE.test(k));
  }

  return {
    ns,
    generatedAt: now,
    range: { id: q.range, from, to: now, bucket, tz },
    hasAnyData,
    sampleCount: rows.filter(({ s }) => s.vid.startsWith(SAMPLE_VID)).length,
    totals,
    series,
    funnel: FUNNEL_STEPS.map((step, i) => ({
      id: step.id,
      label: step.label,
      // "reached at least this step", so the bars never grow further down
      count: funnelAtLeast.slice(i).reduce((a, b) => a + b, 0),
    })),
    clients: clientRows,
    products: topRows(products),
    themes: topRows(themes),
    devices,
    os: topRows(os),
    countries: topRows(countries),
    sessions: sessionRows.reverse().slice(0, MAX_SESSION_ROWS),
    filters: { demos: demoFilter, clients: clientFilter },
  };
}

// ---------------------------------------------------------------------------
// Session detail (the drawer)
// ---------------------------------------------------------------------------

export interface SessionDetail {
  key: string;
  session: StoredSession;
  demo: string;
  client: string | null;
  link: { code: string; name: string; state: "active" | "archived" | "deleted" } | null;
  actions: number;
  bounced: boolean;
}

export async function sessionDetail(ns: ArNamespace, key: string): Promise<SessionDetail | null> {
  const s = await loadSession(ns, key);
  if (!s) return null;
  let link: SessionDetail["link"] = null;
  if (s.link) {
    const raw = await (await arStore("links", ns)).getJSON(`${s.link}.json`).catch(() => null);
    const l = linkSchema.safeParse(raw);
    link = l.success
      ? { code: s.link, name: l.data.name, state: l.data.archived ? "archived" : "active" }
      : { code: s.link, name: str(s.client) ?? s.link, state: "deleted" };
  }
  const demos = await listDemoOptions(ns);
  return {
    key,
    session: { ...s, events: [...s.events].sort((a, b) => a.ts - b.ts) },
    demo: (demos.find((d) => d.id === s.demo) ?? fallbackDemo(s.demo)).short,
    client: link?.name ?? str(s.client),
    link,
    actions: actionCount(s),
    bounced: isBounce(s),
  };
}

// ---------------------------------------------------------------------------
// Per-link stats for /admin/links
// ---------------------------------------------------------------------------

export const LINK_STATS_DAYS = 90;

export async function linkStats(
  ns: ArNamespace,
): Promise<Record<string, { visits: number; opens: number; lastAt: number }>> {
  const sessions = await loadSessions(ns, Date.now() - LINK_STATS_DAYS * DAY);
  const out: Record<string, { visits: number; opens: number; lastAt: number }> = {};
  for (const { s } of sessions) {
    if (!s.link) continue;
    const r = (out[s.link] ??= { visits: 0, opens: 0, lastAt: 0 });
    r.opens++;
    if (!isBounce(s)) r.visits++;
    r.lastAt = Math.max(r.lastAt, s.startedAt);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sample data (dev and preview namespaces only)
// ---------------------------------------------------------------------------

// Sample sessions carry a visitor id starting "sample-" (real ids never contain
// a dash) and sample links a fixed code prefix plus note, so they can be removed
// without touching anything real.
const SAMPLE_VID = "sample-";
const SAMPLE_LINK_PREFIX = "sample-";
export const SAMPLE_NOTE = "Sample data: remove it from Analytics.";

type Props = Record<string, string | number | boolean | null>;

const CATALOG: Record<
  string,
  { themes: Array<[string, string]>; products: Record<string, string[]> }
> = {
  roblox: {
    themes: [
      ["roblox", "Roblox"],
      ["skyrift", "Skyrift Racers"],
      ["evade", "EVADE"],
    ],
    products: {
      cap: ["Activated Cap", "BOBO Cap"],
      plush: ["Collector Plush", "Cat Bobo Plush"],
      keychain: ["Activated Keychain", "EVADE Activated Keychain"],
      mousepad: ["Activated Desk Mat", "EVADE Desk Mat"],
      tee: ["Activated Tee", "EVADE Activated Tee"],
      hoodie: ["Activated Hoodie", "Cat Bobo Hoodie"],
      figure: ["Boxed Collectible", "Eclipse Cola Collectible"],
    },
  },
  "monkey-quest": {
    themes: [
      ["game", "Monkey Quest · Game"],
      ["film", "Monkey Quest · Film"],
    ],
    products: {
      plush: ["Mini-Might Plush"],
      keychain: ["Mini-Might Keychain"],
      tee: ["Monkey Quest Tee"],
      hoodie: ["Monkey Quest Hoodie"],
      cap: ["Monkey Quest Cap"],
      mousepad: ["Sled Run Desk Mat"],
      figure: ["Movie Collector Box"],
    },
  },
};

const TOUR = [
  "The endcap",
  "Hero screen",
  "Activated merch",
  "Tap to unlock",
  "Your IP here",
  "Retail dashboard",
];

const DEVICES = {
  iphone: { device: { mobile: true, os: "iOS", browser: "Safari" }, screen: "390x844" },
  android: { device: { mobile: true, os: "Android", browser: "Chrome" }, screen: "412x915" },
  ipad: { device: { mobile: true, os: "iOS", browser: "Safari" }, screen: "820x1180" },
  mac: { device: { mobile: false, os: "macOS", browser: "Chrome" }, screen: "1512x982" },
  macSafari: { device: { mobile: false, os: "macOS", browser: "Safari" }, screen: "1728x1117" },
  windows: { device: { mobile: false, os: "Windows", browser: "Edge" }, screen: "1920x1080" },
} as const;
type DeviceId = keyof typeof DEVICES;

interface Persona {
  code: string | null;
  name: string | null;
  demo: string;
  unlock: boolean;
  geo: StoredSession["geo"];
  devices: DeviceId[];
  /** [days ago, depth 0–3] per visit */
  visits: Array<[number, number]>;
}

const PERSONAS: Persona[] = [
  {
    code: "sample-toei",
    name: "Toei Animation",
    demo: "monkey-quest",
    unlock: false,
    geo: { country: "JP", city: "Tokyo" },
    devices: ["mac", "iphone"],
    visits: [
      [12, 2],
      [9, 0],
      [6, 3],
      [3, 2],
      [0.15, 3],
    ],
  },
  {
    code: "sample-hypergalactic",
    name: "Hypergalactic",
    demo: "monkey-quest",
    unlock: true,
    geo: { country: "US", city: "Los Angeles" },
    devices: ["macSafari"],
    visits: [
      [10, 1],
      [4, 2],
      [1, 3],
    ],
  },
  {
    code: "sample-walmart",
    name: "Walmart Entertainment",
    demo: "roblox",
    unlock: true,
    geo: { country: "US", city: "Bentonville" },
    devices: ["windows", "iphone", "windows"],
    visits: [
      [13, 1],
      [11, 2],
      [8, 3],
      [5, 0],
      [2, 2],
      [0.4, 1],
    ],
  },
  {
    code: "sample-roblox",
    name: "Roblox Partnerships",
    demo: "roblox",
    unlock: false,
    geo: { country: "US", city: "San Mateo" },
    devices: ["mac", "android"],
    visits: [
      [7, 2],
      [7, 1],
      [2, 3],
      [1, 0],
    ],
  },
  {
    code: "sample-hasbro",
    name: "Hasbro Licensing",
    demo: "roblox",
    unlock: false,
    geo: { country: "US", city: "Pawtucket" },
    devices: ["windows"],
    visits: [
      [6, 0],
      [6, 1],
    ],
  },
  // a link that was sent but never opened
  {
    code: "sample-crunchyroll",
    name: "Crunchyroll Consumer Products",
    demo: "monkey-quest",
    unlock: false,
    geo: { country: null, city: null },
    devices: [],
    visits: [],
  },
  // a ?to=Name visit without a link code
  {
    code: null,
    name: "Paramount Consumer Products",
    demo: "roblox",
    unlock: false,
    geo: { country: "US", city: "Los Angeles" },
    devices: ["mac"],
    visits: [
      [4, 2],
      [3, 1],
    ],
  },
];

const DIRECT_GEOS: Array<StoredSession["geo"]> = [
  { country: "US", city: "New York" },
  { country: "GB", city: "London" },
  { country: "CA", city: "Toronto" },
  { country: "US", city: "Seattle" },
  { country: "FR", city: "Paris" },
  { country: "DE", city: "Berlin" },
  { country: "AE", city: "Dubai" },
  { country: "US", city: "Austin" },
];

function rid(n: number): string {
  const a = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
const between = (a: number, b: number) => a + Math.random() * (b - a);

/** A plausible event sequence for one visit, at depth 0 (bounce) to 3 (did everything). */
function sampleJourney(
  demo: string,
  depth: number,
  opts: { gate: boolean; link: { code: string; name: string } | null; mobile: boolean },
): { events: Array<{ n: string; at: number; p?: Props }>; activeMs: number } {
  const cat = CATALOG[demo] ?? CATALOG.roblox;
  const ev: Array<{ n: string; at: number; p?: Props }> = [];
  let at = 0;
  const push = (n: string, p?: Props, gap: [number, number] = [2, 9]) => {
    at += between(gap[0], gap[1]) * 1000;
    ev.push({ n, at: Math.round(at), ...(p ? { p } : {}) });
  };
  ev.push({ n: "session_start", at: 0, p: { path: `/${demo}/activated-retail/` } });
  if (opts.link) push("link_resolved", { code: opts.link.code, name: opts.link.name }, [0.3, 0.8]);
  if (opts.gate) push("gate_view", undefined, [0.2, 0.6]);
  if (depth === 0) return { events: ev, activeMs: Math.round(between(900, 2800)) };

  if (opts.gate) {
    if (Math.random() < 0.2) push("gate_fail", undefined, [4, 9]);
    push("gate_unlock", undefined, [3, 8]);
  }
  push("enter", undefined, [2, 5]);

  const steps = depth >= 2 ? TOUR.length : Math.ceil(between(1, 3));
  for (let i = 0; i < steps; i++) push("tour_step", { step: i + 1, title: TOUR[i] }, [5, 11]);
  if (depth >= 2 && Math.random() < 0.8) push("tour_finish", { steps: TOUR.length }, [3, 6]);
  else push("tour_skip", { step: steps }, [2, 4]);

  const themes = cat.themes;
  let theme = 0;
  const productIds = Object.keys(cat.products);
  // light visits sometimes just take the tour and leave
  const productCount = depth === 1 ? Math.floor(between(0, 2.6)) : depth === 2 ? 3 : 5;
  const seen = new Set<string>();
  for (let i = 0; i < productCount; i++) {
    if (i === 1 && depth >= 2 && themes.length > 1) {
      theme = 1 + Math.floor(Math.random() * (themes.length - 1));
      push("theme", { id: themes[theme][0], name: themes[theme][1] }, [5, 15]);
    }
    let id = pick(productIds);
    for (let tries = 0; seen.has(id) && tries < 6; tries++) id = pick(productIds);
    seen.add(id);
    const labels = cat.products[id];
    const label = labels[Math.min(theme, labels.length - 1)] ?? labels[0];
    push("hotspot", { id }, [4, 14]);
    push("product_open", { id, label }, [0.5, 1.5]);
    if (depth >= 2 && i === 0 && Math.random() < 0.6) {
      push("add_to_cart", { id, label, size: pick(["S", "M", "L", "XL"]) }, [8, 20]);
      push("cart_open", undefined, [2, 6]);
      if (depth === 3) {
        push("checkout", undefined, [5, 12]);
        push("order", { items: 1 }, [10, 25]);
      }
    }
  }
  if (depth >= 2) {
    push("activation_open", { id: pick(productIds) }, [6, 18]);
    if (demo === "roblox" && themes[theme][0] === "evade") {
      push("activation_launch", { url: "https://evade.medialife.ai" }, [4, 10]);
    } else {
      push("game_start", undefined, [3, 8]);
      push("game_end", { score: Math.round(between(8, 40)) }, [12, 14]);
    }
    push("reward_redeem", undefined, [4, 10]);
    if (Math.random() < 0.5) push("light", { mode: "night" }, [5, 15]);
  }
  if (depth === 3) {
    push(opts.mobile ? "ar_open" : "ar_qr", { id: pick(productIds) }, [8, 20]);
    if (Math.random() < 0.6) push("custom_ip", undefined, [10, 30]);
    push("dash_open", undefined, [8, 20]);
    push("mode", { mode: pick(["build", "walk"]) }, [6, 15]);
    push("cta_open", { label: "Book a call" }, [10, 30]);
    if (Math.random() < 0.6)
      push("lead_submit", { company: opts.link?.name ?? "Studio" }, [30, 70]);
  }
  const tail = between(5, 40) * 1000;
  return { events: ev, activeMs: Math.round((at + tail) * between(0.82, 0.97)) };
}

function sampleSession(
  demo: string,
  daysAgo: number,
  depth: number,
  who: { vid: string; device: DeviceId; geo: StoredSession["geo"]; persona: Persona | null },
): StoredSession {
  const now = Date.now();
  const startedAt = Math.min(
    now - 10 * 60_000,
    Math.round(now - daysAgo * DAY + between(-3, 3) * 3_600_000),
  );
  const sid = `${startedAt.toString(36)}-${rid(10)}`;
  const dev = DEVICES[who.device];
  const p = who.persona;
  const link = p?.code && p.name ? { code: p.code, name: p.name } : null;
  const gate = !(p?.unlock ?? false);
  const { events, activeMs } = sampleJourney(demo, depth, {
    gate,
    link,
    mobile: dev.device.mobile,
  });
  return {
    sid,
    vid: who.vid,
    demo,
    link: p?.code ?? null,
    client: p?.name ?? null,
    startedAt,
    lastAt: startedAt + (events[events.length - 1]?.at ?? 0) + 4000,
    activeMs,
    ref: link ? "https://mail.google.com/" : pick([null, null, "https://www.linkedin.com/"]),
    screen: dev.screen,
    device: { ...dev.device },
    geo: { ...who.geo },
    events: events.map((e) => ({ n: e.n, ts: startedAt + e.at, ...(e.p ? { p: e.p } : {}) })),
  };
}

export async function removeSampleData(
  ns: ArNamespace,
): Promise<{ sessions: number; links: number }> {
  if (ns === "prod") throw new Error("Sample data is not available in production.");
  const sessions = await loadSessions(ns, Date.now() - 45 * DAY);
  const store = await arStore("sessions", ns);
  const doomed = sessions.filter(({ s }) => s.vid.startsWith(SAMPLE_VID));
  await mapLimit(doomed, 16, async ({ key }) => {
    await store.del(key);
    recordCache.delete(`${ns}|${key}`);
  });
  const linkStore = await arStore("links", ns);
  const links = (await readLinks(ns)).filter(
    (l) => l.code.startsWith(SAMPLE_LINK_PREFIX) && l.note === SAMPLE_NOTE,
  );
  await mapLimit(links, 16, (l) => linkStore.del(`${l.code}.json`));
  return { sessions: doomed.length, links: links.length };
}

/** About 40 realistic sessions over the last 14 days, plus the sample client links. */
export async function writeSampleData(
  ns: ArNamespace,
): Promise<{ sessions: number; links: number }> {
  if (ns === "prod") throw new Error("Sample data is not available in production.");
  await removeSampleData(ns);
  const now = Date.now();
  const out: StoredSession[] = [];

  for (const p of PERSONAS) {
    const vids = p.devices.map(() => `${SAMPLE_VID}${rid(10)}`);
    p.visits.forEach(([daysAgo, depth], i) => {
      const d = i % Math.max(1, p.devices.length);
      out.push(
        sampleSession(p.demo, daysAgo, depth, {
          vid: vids[d],
          device: p.devices[d],
          geo: p.geo,
          persona: p,
        }),
      );
    });
  }
  // direct visits (no link): colleagues forwarding the URL, people who saw it on LinkedIn…
  const depths = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 1];
  depths.forEach((depth, i) => {
    const device = pick<DeviceId>(["iphone", "iphone", "android", "mac", "windows", "ipad"]);
    out.push(
      sampleSession(Math.random() < 0.6 ? "roblox" : "monkey-quest", between(0.05, 14), depth, {
        vid: `${SAMPLE_VID}${rid(10)}`,
        device,
        geo: DIRECT_GEOS[i % DIRECT_GEOS.length],
        persona: null,
      }),
    );
  });

  const sessions = await arStore("sessions", ns);
  await mapLimit(out, 16, (s) => sessions.setJSON(sessionKey(s.sid), s));

  const links = await arStore("links", ns);
  const linkRows = PERSONAS.filter((p) => p.code && p.name).map((p, i) =>
    linkSchema.parse({
      code: p.code,
      name: p.name,
      demo: p.demo,
      unlock: p.unlock,
      note: SAMPLE_NOTE,
      createdAt: now - (15 + i) * DAY,
    }),
  );
  await mapLimit(linkRows, 16, (l) => links.setJSON(`${l.code}.json`, l));
  return { sessions: out.length, links: linkRows.length };
}
