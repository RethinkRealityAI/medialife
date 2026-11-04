import { timingSafeEqual } from "node:crypto";
import process from "node:process";

import { z } from "zod";

import { namedStore, type ArNamespace } from "@/lib/ar/store.server";
import { newId, sha256Hex } from "@/lib/hub/store.server";

import { countryPlace, nearestPlace, placeByName } from "./geo.server";
import { cleanLocation, placeKey, type MediaLocation, type PlaceHit } from "./location";
import {
  BOBO,
  BOBO_EVENT_TYPES,
  type BoboAggregate,
  type BoboCell,
  type BoboEvent,
  type FeedEvent,
} from "./model";

// POST /api/bobo/events: the AR experience / Cola Run reports what players do
// (scan, play, reward, sighting, share, capture) so the globe can show it live.
//
// Two ways in:
//   - Trusted (a server, a build pipeline, a moderation tool):
//       Authorization: Bearer <BOBO_INGEST_TOKEN>
//     Exact coordinates are kept (the feed still only shows city level).
//   - Browser (the game itself, where no secret can be kept): a request whose
//     Origin is on the allowlist (BOBO_INGEST_ORIGINS, comma separated; the
//     site itself and https://evade.medialife.ai by default). Coordinates are
//     rounded to ~5 km, and with none the city comes from the visitor's IP
//     (Netlify's geo header), so the game never has to ask for location.
//     Rate limited per visitor. Browser events can never publish media.
//
// Storage (Netlify Blobs, store "bobo-<ns>"):
//   events/<yyyy-mm-dd>/<id>  every event, as received (session ids hashed)
//   agg                       running totals per city + the recent list (the feed reads this)

export const boboStore = (ns: ArNamespace) => namedStore(`bobo-${ns}`);

const KEYS = {
  event: (e: Pick<BoboEvent, "id" | "at">) =>
    `events/${new Date(e.at).toISOString().slice(0, 10)}/${e.id}`,
  agg: () => "agg",
} as const;

/* ── Auth and CORS ─────────────────────────────────────────────────────────── */

function ingestToken(): string | null {
  const t = process.env.BOBO_INGEST_TOKEN?.trim();
  return t && t.length >= 24 ? t : null;
}
export const ingestTokenConfigured = () => ingestToken() !== null;

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** True when the request carries BOBO_INGEST_TOKEN. */
export function hasIngestToken(request: Request): boolean {
  const want = ingestToken();
  const m = /^Bearer\s+(\S+)\s*$/i.exec(request.headers.get("authorization") ?? "");
  return !!want && !!m && safeEqual(m[1], want);
}

const DEFAULT_ORIGINS = ["https://evade.medialife.ai", "https://medialife.ai"];

export function allowedOrigins(): string[] {
  const env = (process.env.BOBO_INGEST_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter((s) => /^https?:\/\/[^/\s]+$/.test(s));
  return env.length ? env : DEFAULT_ORIGINS;
}

function selfOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || url.host;
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

/** The Origin header when it may post browser events, else null. */
export function allowedOrigin(request: Request, ns: ArNamespace): string | null {
  const origin = request.headers.get("origin")?.replace(/\/+$/, "");
  if (!origin) return null;
  if (origin === selfOrigin(request)) return origin;
  if (ns === "dev" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return allowedOrigins().includes(origin) ? origin : null;
}

export function corsHeaders(origin: string | null): Record<string, string> {
  return origin
    ? {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type, authorization",
        "access-control-max-age": "86400",
        vary: "Origin",
      }
    : { vary: "Origin" };
}

/* ── Rate limit (browser mode) ─────────────────────────────────────────────── */

// Best effort: per function instance, a sliding minute per visitor. Enough to
// stop a runaway loop in the game; a determined attacker is out of scope for a
// public, anonymous counter (and can't publish anything).
const buckets = new Map<string, { t: number; n: number }>();
function rateOk(key: string, n: number, now: number): boolean {
  const b = buckets.get(key);
  if (!b || now - b.t > 60_000) {
    buckets.set(key, { t: now, n });
    if (buckets.size > 5000)
      for (const [k, v] of buckets) if (now - v.t > 60_000) buckets.delete(k);
    return n <= BOBO.ratePerMinute;
  }
  b.n += n;
  return b.n <= BOBO.ratePerMinute;
}

function clientIp(request: Request): string {
  return (
    request.headers.get("x-nf-client-connection-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "0"
  );
}

/** Netlify's x-nf-geo header (base64 JSON): the visitor's city from their IP. */
function ipGeo(request: Request): { city: string; cc: string; lat: number; lng: number } | null {
  const raw = request.headers.get("x-nf-geo");
  if (!raw) return null;
  try {
    const g = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    const cc = String(g?.country?.code ?? "").toUpperCase();
    const lat = Number(g?.latitude);
    const lng = Number(g?.longitude);
    if (!/^[A-Z]{2}$/.test(cc)) return null;
    return {
      city: String(g?.city ?? ""),
      cc,
      lat: Number.isFinite(lat) ? lat : NaN,
      lng: Number.isFinite(lng) ? lng : NaN,
    };
  } catch {
    return null;
  }
}

/* ── Parsing ───────────────────────────────────────────────────────────────── */

const propValue = z.union([z.string().max(200), z.number().finite(), z.boolean()]);

const eventSchema = z.object({
  type: z.enum(BOBO_EVENT_TYPES),
  /** ISO string or ms; defaults to now. Clamped to the last 7 days. */
  at: z.union([z.string().max(40), z.number()]).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  city: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
  countryCode: z
    .string()
    .regex(/^[A-Za-z]{2}$/)
    .optional(),
  /** "cola-run", "ar-keychain"… */
  source: z
    .string()
    .max(40)
    .regex(/^[\w.-]*$/)
    .optional(),
  /** An anonymous id for the play session; hashed before it's stored. */
  sessionId: z.string().max(120).optional(),
  /** A Media Library asset this event refers to (an uploaded capture). */
  mediaId: z
    .string()
    .regex(/^[A-Za-z0-9]{6,60}$/)
    .optional(),
  props: z
    .record(z.string().max(40), propValue)
    .refine((o) => Object.keys(o).length <= 20, "at most 20 props")
    .optional(),
});
export type BoboEventInput = z.input<typeof eventSchema>;

const bodySchema = z.union([
  z.object({ events: z.array(z.unknown()).min(1).max(BOBO.maxBatch) }),
  z.object({ type: z.string() }).passthrough(),
]);

const round = (v: number, step: number) => Math.round(v / step) * step;

function parseAt(at: string | number | undefined, now: number): number {
  const t = typeof at === "number" ? at : at ? Date.parse(at) : NaN;
  if (!Number.isFinite(t)) return now;
  // a clock that's off shouldn't put events in the future or years back
  return Math.min(now, Math.max(now - 7 * 86_400_000, Math.round(t)));
}

async function resolveLocation(
  e: z.infer<typeof eventSchema>,
  _trusted: boolean,
  request: Request,
): Promise<{ loc: BoboEvent["location"]; by: BoboEvent["locatedBy"] }> {
  const toLoc = (p: PlaceHit): BoboEvent["location"] => ({
    city: p.city,
    region: p.region,
    country: p.country,
    countryCode: p.countryCode,
    lat: p.lat,
    lng: p.lng,
  });
  if (e.lat !== undefined && e.lng !== undefined) {
    // the hotspot is the nearest city; the raw point is kept on the event only
    const near = await nearestPlace(e.lat, e.lng);
    if (near) return { loc: toLoc(near), by: "coords" };
    const cc = e.countryCode?.toUpperCase();
    const cp = cc ? await countryPlace(cc) : null;
    return cp ? { loc: toLoc(cp), by: "coords" } : { loc: null, by: null };
  }
  if (e.city) {
    const p = await placeByName(e.city, e.countryCode);
    if (p) return { loc: toLoc(p), by: "name" };
  }
  if (e.countryCode) {
    const cp = await countryPlace(e.countryCode);
    if (cp) return { loc: toLoc(cp), by: "country" };
  }
  if (!_trusted) {
    const g = ipGeo(request);
    if (g) {
      const p =
        (Number.isFinite(g.lat) ? await nearestPlace(g.lat, g.lng, 80) : null) ??
        (g.city ? await placeByName(g.city, g.cc) : null) ??
        (await countryPlace(g.cc));
      if (p) return { loc: toLoc(p), by: "ip" };
    }
  }
  return { loc: null, by: null };
}

/* ── Aggregate ─────────────────────────────────────────────────────────────── */

const emptyAgg = (): BoboAggregate => ({
  v: 1,
  total: 0,
  unlocated: 0,
  byType: {},
  cells: {},
  recent: [],
  updatedAt: 0,
});

export function foldEvents(agg: BoboAggregate | null, events: BoboEvent[]): BoboAggregate {
  const next: BoboAggregate = agg?.v === 1 ? structuredClone(agg) : emptyAgg();
  for (const e of events) {
    next.total++;
    next.byType[e.type] = (next.byType[e.type] ?? 0) + 1;
    let key: string | null = null;
    if (e.location) {
      key = placeKey(e.location);
      const c: BoboCell = next.cells[key] ?? {
        key,
        city: e.location.city,
        region: e.location.region,
        country: e.location.country,
        countryCode: e.location.countryCode,
        // the city's point, not the visitor's
        lat: e.location.lat,
        lng: e.location.lng,
        count: 0,
        byType: {},
        firstAt: e.at,
        lastAt: e.at,
      };
      c.count++;
      c.byType[e.type] = (c.byType[e.type] ?? 0) + 1;
      c.firstAt = Math.min(c.firstAt, e.at);
      c.lastAt = Math.max(c.lastAt, e.at);
      next.cells[key] = c;
    } else next.unlocated++;
    const fe: FeedEvent = {
      type: e.type,
      at: new Date(e.at).toISOString(),
      key,
      city: e.location?.city ?? "",
      country: e.location?.country ?? "",
      countryCode: e.location?.countryCode ?? "",
    };
    next.recent.unshift(fe);
  }
  next.recent = next.recent.sort((a, b) => b.at.localeCompare(a.at)).slice(0, BOBO.recentEvents);
  next.updatedAt = Date.now();
  return next;
}

export async function readAggregate(ns: ArNamespace): Promise<BoboAggregate> {
  const a = await (await boboStore(ns)).getJSON<BoboAggregate>(KEYS.agg());
  return a?.v === 1 ? a : emptyAgg();
}

/** Stores events and folds them into the aggregate. */
export async function recordEvents(
  ns: ArNamespace,
  events: BoboEvent[],
  opts: { log?: boolean } = {},
): Promise<void> {
  if (!events.length) return;
  const store = await boboStore(ns);
  if (opts.log !== false) await Promise.all(events.map((e) => store.setJSON(KEYS.event(e), e)));
  await store.update<BoboAggregate>(KEYS.agg(), (cur) => foldEvents(cur, events));
}

/** Clears every event (sample reset on previews). */
export async function clearEvents(ns: ArNamespace, onlySample = false): Promise<number> {
  const store = await boboStore(ns);
  const keys = await store.list("events/");
  let n = 0;
  for (const k of keys) {
    if (onlySample) {
      const e = await store.getJSON<BoboEvent>(k);
      if (e?.source !== "sample") continue;
    }
    await store.del(k);
    n++;
  }
  await store.del(KEYS.agg());
  if (onlySample) {
    // rebuild from what's left
    const rest = (
      await Promise.all((await store.list("events/")).map((k) => store.getJSON<BoboEvent>(k)))
    ).filter((e): e is BoboEvent => !!e);
    if (rest.length) await store.setJSON(KEYS.agg(), foldEvents(null, rest));
  }
  return n;
}

/* ── The endpoint ──────────────────────────────────────────────────────────── */

const reply = (body: unknown, status: number, headers: Record<string, string>) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });

export function handleEventsPreflight(ns: ArNamespace, request: Request): Response {
  const origin = allowedOrigin(request, ns);
  return new Response(null, { status: origin ? 204 : 403, headers: corsHeaders(origin) });
}

export async function handleEvents(ns: ArNamespace, request: Request): Promise<Response> {
  const trusted = hasIngestToken(request);
  const origin = allowedOrigin(request, ns);
  const cors = corsHeaders(origin);
  if (!trusted && !origin)
    return reply(
      {
        error: "unauthorized",
        help: "Send Authorization: Bearer <BOBO_INGEST_TOKEN> from a server, or post from an allowed origin (BOBO_INGEST_ORIGINS).",
      },
      401,
      cors,
    );
  if ((request.headers.get("content-type") ?? "").split(";")[0].trim() !== "application/json")
    return reply({ error: "send JSON (content-type: application/json)" }, 415, cors);
  const len = Number(request.headers.get("content-length") ?? "0");
  if (len > 64 * 1024) return reply({ error: "body too large (64 KB max)" }, 413, cors);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply({ error: "invalid JSON" }, 400, cors);
  }
  const shape = bodySchema.safeParse(body);
  if (!shape.success)
    return reply(
      { error: `send { "events": [ … ] } (1–${BOBO.maxBatch}) or a single event object` },
      400,
      cors,
    );
  const raw: unknown[] = "events" in shape.data ? (shape.data.events as unknown[]) : [shape.data];
  const now = Date.now();
  if (!trusted) {
    const who = await sha256Hex(`${clientIp(request)}|${request.headers.get("user-agent") ?? ""}`);
    if (!rateOk(who, raw.length, now))
      return reply({ error: "slow down" }, 429, { ...cors, "retry-after": "60" });
  }
  const accepted: BoboEvent[] = [];
  const rejected: { index: number; error: string }[] = [];
  for (const [index, item] of raw.entries()) {
    const p = eventSchema.safeParse(item);
    if (!p.success) {
      const issue = p.error.issues[0];
      rejected.push({
        index,
        error: `${issue?.path.join(".") || "event"}: ${issue?.message ?? "invalid"}`,
      });
      continue;
    }
    const e = p.data;
    const { loc, by } = await resolveLocation(e, trusted, request);
    accepted.push({
      id: newId(8),
      type: e.type,
      at: parseAt(e.at, now),
      receivedAt: now,
      trusted,
      source: e.source || (trusted ? "server" : "web"),
      session: e.sessionId ? (await sha256Hex(`bobo|${e.sessionId}`)).slice(0, 24) : null,
      location: loc,
      locatedBy: by,
      coords:
        e.lat !== undefined && e.lng !== undefined
          ? trusted
            ? { lat: e.lat, lng: e.lng }
            : {
                lat: +round(e.lat, BOBO.publicGridDeg).toFixed(2),
                lng: +round(e.lng, BOBO.publicGridDeg).toFixed(2),
              }
          : null,
      mediaId: trusted ? (e.mediaId ?? null) : null,
      props: e.props ?? {},
    });
  }
  await recordEvents(ns, accepted);
  return reply(
    {
      accepted: accepted.length,
      rejected,
      events: accepted.map((e) => ({
        id: e.id,
        type: e.type,
        city: e.location?.city ?? null,
        countryCode: e.location?.countryCode ?? null,
        locatedBy: e.locatedBy,
      })),
    },
    accepted.length ? 202 : 400,
    cors,
  );
}

/** For the sample seed: events built in code skip parsing. */
export function makeEvent(
  type: BoboEvent["type"],
  at: number,
  loc: Pick<MediaLocation, "city" | "region" | "country" | "countryCode" | "lat" | "lng">,
): BoboEvent {
  const l = cleanLocation({ ...loc, place: "", seenAt: null });
  return {
    id: newId(8),
    type,
    at,
    receivedAt: at,
    trusted: true,
    source: "sample",
    session: null,
    location: l
      ? {
          city: l.city,
          region: l.region,
          country: l.country,
          countryCode: l.countryCode,
          lat: l.lat,
          lng: l.lng,
        }
      : null,
    locatedBy: "coords",
    coords: null,
    mediaId: null,
    props: {},
  };
}
