import process from "node:process";

import { namespaceFromRequest } from "@/lib/ar/store.server";
import { newId, sha256Hex } from "@/lib/hub/store.server";

import { GLOBE_KINDS, tagKey, type MediaAsset } from "@/lib/media/model";

import { allowedOrigin, clientIp, ipGeo } from "./events.server";
import { countryPlace, nearestPlace, placeByName } from "./geo.server";
import { cleanLocation, type MediaLocation } from "./location";
import { BOBO } from "./model";

// Player captures straight from the AR game in a browser ("web captures").
//
// The game runs on a phone, where no secret can be kept, so it can't hold
// BOBO_INGEST_TOKEN. Instead the Media Library's normal chunked upload API
// (/api/media/uploads…) also accepts a request whose Origin is on the Bobo
// allowlist (BOBO_INGEST_ORIGINS; the site itself; localhost on dev), with
// much tighter rules than the token:
//
//   - videos and images only, up to BOBO.maxWebCaptureBytes
//   - a few uploads per visitor per window (best effort, per function instance)
//   - always private, tagged "Needs review", in the AR captures collection;
//     the player can set a title and a description, nothing else
//   - the city comes from the visitor's IP (Netlify geo), or from coordinates
//     the game sends, rounded to ~5 km first; never anything more exact
//   - init returns a one-time captureKey; every later call for that upload
//     (chunks, thumb, complete, cancel) must send it as x-capture-key, so
//     nobody else can write into it. It only works for 24 hours.
//   - init also returns a viewKey: read-only, it lets the player watch their
//     own clip on the globe (GET /api/bobo/clips/<id>?k=…) while it waits for
//     review. Everyone else sees an "in review" pin at the city, no clip.
//
// BOBO_WEB_CAPTURES=off turns the whole path off without a deploy of the game.
// BOBO_CAPTURE_REVIEW=off publishes game clips straight to the globe (tagged
// "Auto-published"): for a supervised event or a demo, not for everyday use.

export const webCapturesEnabled = () =>
  (process.env.BOBO_WEB_CAPTURES ?? "").trim().toLowerCase() !== "off";

/** The calling page's Origin when it may upload web captures, else null. */
export function webCaptureOrigin(request: Request): string | null {
  if (!webCapturesEnabled()) return null;
  return allowedOrigin(request, namespaceFromRequest(request));
}

/** False when BOBO_CAPTURE_REVIEW=off: game clips go public without review. */
export const captureReviewOn = () =>
  (process.env.BOBO_CAPTURE_REVIEW ?? "").trim().toLowerCase() !== "off";

export const newCaptureKey = () => newId(18, false);
export const captureKeyHash = (key: string) => sha256Hex(`bobo-capture|${key}`);
export const captureViewHash = (key: string) => sha256Hex(`bobo-view|${key}`);

const DAY = 86_400_000;

/** A game clip on the globe that the team hasn't checked yet (shown as an "in review" pin). */
export function awaitingReview(
  a: Pick<
    MediaAsset,
    "complete" | "public" | "onGlobe" | "location" | "kind" | "tags" | "ingest" | "createdAt"
  >,
  now = Date.now(),
): boolean {
  return !!(
    a.complete &&
    !a.public &&
    a.onGlobe &&
    a.location &&
    a.ingest &&
    GLOBE_KINDS.includes(a.kind) &&
    a.tags.some((t) => tagKey(t) === tagKey(BOBO.reviewTag)) &&
    now - a.createdAt < BOBO.reviewPinDays * DAY
  );
}

/** True when `key` is the view key the player got for this clip, and it hasn't expired. */
export async function viewKeyOk(a: MediaAsset, key: string | null, now = Date.now()) {
  if (!key || !/^[A-Za-z0-9]{12,64}$/.test(key) || !a.ingest?.viewHash) return false;
  if (now - a.createdAt > BOBO.viewKeyDays * DAY) return false;
  return (await captureViewHash(key)) === a.ingest.viewHash;
}

/* ── CORS for the upload routes ────────────────────────────────────────────── */

const ALLOW_HEADERS = "content-type, x-capture-key";

function corsFor(origin: string): Record<string, string> {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
    "access-control-allow-headers": ALLOW_HEADERS,
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

/** OPTIONS on an upload route: 204 for an allowed game origin, else 403. */
export function capturePreflight(request: Request): Response {
  const origin = webCaptureOrigin(request);
  return new Response(null, {
    status: origin ? 204 : 403,
    headers: origin ? corsFor(origin) : { vary: "Origin" },
  });
}

/** Adds CORS headers to an upload route's response when the caller is an allowed game origin. */
export async function withCaptureCors(
  request: Request,
  res: Response | Promise<Response>,
): Promise<Response> {
  const r = await res;
  const origin = request.headers.get("origin") ? webCaptureOrigin(request) : null;
  if (!origin) return r;
  const headers = new Headers(r.headers);
  for (const [k, v] of Object.entries(corsFor(origin))) headers.set(k, v);
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers });
}

/* ── Rate limit ────────────────────────────────────────────────────────────── */

// Best effort, like the events limit: enough to stop a stuck retry loop or a
// casual spammer; captures are private until reviewed, so abuse can't publish.
const starts = new Map<string, number[]>();
export async function webCaptureRateOk(request: Request, now = Date.now()): Promise<boolean> {
  const who = await sha256Hex(`${clientIp(request)}|${request.headers.get("user-agent") ?? ""}`);
  const win = BOBO.webCaptureWindowMs;
  const list = (starts.get(who) ?? []).filter((t) => now - t < win);
  if (list.length >= BOBO.webCapturesPerWindow) {
    starts.set(who, list);
    return false;
  }
  list.push(now);
  starts.set(who, list);
  if (starts.size > 5000)
    for (const [k, v] of starts) if (!v.some((t) => now - t < win)) starts.delete(k);
  return true;
}

/* ── Where it was filmed ───────────────────────────────────────────────────── */

const round = (v: number, step: number) => Math.round(v / step) * step;

/**
 * City-level location for a web capture: rounded coordinates from the game if
 * it sent any, otherwise the visitor's IP. Null when neither is known (local
 * dev); the team can set it in the drawer.
 */
export async function webCaptureLocation(
  request: Request,
  raw: { lat: number; lng: number } | null | undefined,
): Promise<MediaLocation | null> {
  const g = BOBO.publicGridDeg;
  let hit =
    raw && Number.isFinite(raw.lat) && Number.isFinite(raw.lng)
      ? await nearestPlace(+round(raw.lat, g).toFixed(2), +round(raw.lng, g).toFixed(2))
      : null;
  if (!hit) {
    const ip = ipGeo(request);
    if (ip)
      hit =
        (Number.isFinite(ip.lat) ? await nearestPlace(ip.lat, ip.lng, 80) : null) ??
        (ip.city ? await placeByName(ip.city, ip.cc) : null) ??
        (await countryPlace(ip.cc));
  }
  if (!hit) return null;
  // the city's own coordinates, never the player's
  return cleanLocation({
    place: "",
    city: hit.city,
    region: hit.region,
    country: hit.country,
    countryCode: hit.countryCode,
    lat: hit.lat,
    lng: hit.lng,
    seenAt: Date.now(),
  });
}
