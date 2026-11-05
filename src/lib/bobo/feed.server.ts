import { ensureLaunchSightings } from "./launch.server";
import type { ArNamespace } from "@/lib/ar/store.server";
import { listAssets } from "@/lib/media/data.server";
import { isOnGlobe, mediaPublicPath, mediaThumbUrl, type MediaAsset } from "@/lib/media/model";

import { readAggregate } from "./events.server";
import { haversineKm, placeKey } from "./location";
import type { BoboAggregate, BoboEventType, BoboFeed, FeedMedia, FeedPlace } from "./model";

// GET /api/bobo/feed.json: everything the globe draws, public and cacheable.
// Built from the Media Library (public + located + "on the globe") and the
// AR event aggregate. Nothing private leaves: only public files' URLs, and
// events as city-level counts.

const iso = (ms: number) => new Date(ms).toISOString();

function feedMedia(a: MediaAsset): FeedMedia {
  return {
    id: a.id,
    kind: a.kind === "video" ? "video" : "image",
    title: a.title,
    description: a.description,
    url: mediaPublicPath(a),
    poster: mediaThumbUrl(a),
    width: a.width,
    height: a.height,
    durationS: a.durationS,
    seenAt: iso(a.location?.seenAt ?? a.createdAt),
    place: a.location?.place ?? "",
    tags: a.tags,
    sample: !!a.sample,
  };
}

export function buildFeed(assets: MediaAsset[], agg: BoboAggregate, now = Date.now()): BoboFeed {
  const places = new Map<string, FeedPlace>();
  const seen = (m: FeedMedia) => Date.parse(m.seenAt);
  for (const a of assets) {
    if (!isOnGlobe(a) || !a.location) continue;
    const l = a.location;
    const key = placeKey(l);
    let p = places.get(key);
    if (!p) {
      p = {
        key,
        city: l.city,
        region: l.region,
        country: l.country,
        countryCode: l.countryCode,
        lat: l.lat,
        lng: l.lng,
        media: [],
        events: 0,
        byType: {},
        firstSeen: null,
        lastSeen: null,
      };
      places.set(key, p);
    }
    p.media.push(feedMedia(a));
  }
  // hotspots sit on the city: the average of its media's points
  for (const p of places.values()) {
    p.media.sort((x, y) => seen(y) - seen(x));
    const locs = assets.filter((a) => isOnGlobe(a) && a.location && placeKey(a.location) === p.key);
    if (locs.length > 1) {
      p.lat = +(locs.reduce((s, a) => s + a.location!.lat, 0) / locs.length).toFixed(4);
      p.lng = +(locs.reduce((s, a) => s + a.location!.lng, 0) / locs.length).toFixed(4);
    }
    p.firstSeen = p.media.at(-1)?.seenAt ?? null;
    p.lastSeen = p.media[0]?.seenAt ?? null;
  }
  for (const c of Object.values(agg.cells)) {
    let p = places.get(c.key);
    if (!p) {
      p = {
        key: c.key,
        city: c.city,
        region: c.region,
        country: c.country,
        countryCode: c.countryCode,
        lat: c.lat,
        lng: c.lng,
        media: [],
        events: 0,
        byType: {},
        firstSeen: iso(c.firstAt),
        lastSeen: iso(c.lastAt),
      };
      places.set(c.key, p);
    } else {
      if (!p.lastSeen || c.lastAt > Date.parse(p.lastSeen)) p.lastSeen = iso(c.lastAt);
    }
    p.events += c.count;
    for (const [t, n] of Object.entries(c.byType) as [BoboEventType, number][])
      p.byType[t] = (p.byType[t] ?? 0) + (n ?? 0);
  }

  const withMedia = [...places.values()].filter((p) => p.media.length);
  const eventOnly = [...places.values()].filter((p) => !p.media.length);
  withMedia.sort((a, b) => Date.parse(b.media[0].seenAt) - Date.parse(a.media[0].seenAt));
  eventOnly.sort((a, b) => b.events - a.events);

  const journey = [...withMedia]
    .sort((a, b) => Date.parse(a.firstSeen!) - Date.parse(b.firstSeen!))
    .map((p) => p.key);
  let km = 0;
  for (let i = 1; i < journey.length; i++)
    km += haversineKm(places.get(journey[i - 1])!, places.get(journey[i])!);

  const allMedia = withMedia.flatMap((p) => p.media);
  const countries = [...new Set([...places.values()].map((p) => p.countryCode))].sort();
  return {
    v: 1,
    generatedAt: iso(now),
    stats: {
      places: withMedia.length,
      countries: countries.length,
      media: allMedia.length,
      events: agg.total,
      km: Math.round(km),
    },
    places: [...withMedia, ...eventOnly],
    journey,
    countries,
    recent: agg.recent,
    sample: allMedia.length > 0 && allMedia.every((m) => m.sample),
  };
}

export async function boboFeed(ns: ArNamespace): Promise<BoboFeed> {
  await ensureLaunchSightings(ns);
  const [assets, agg] = await Promise.all([listAssets(ns), readAggregate(ns)]);
  return buildFeed(assets, agg);
}

export async function handleFeed(ns: ArNamespace, request: Request): Promise<Response> {
  const feed = await boboFeed(ns);
  const body = JSON.stringify(feed);
  const etag = `"${(await sha1(body)).slice(0, 20)}"`;
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    // browsers revalidate quickly; Netlify's CDN serves a minute-old copy while it refreshes
    "cache-control": "public, max-age=15, must-revalidate",
    "netlify-cdn-cache-control": "public, s-maxage=60, stale-while-revalidate=600",
    "access-control-allow-origin": "*",
    etag,
  };
  if (request.headers.get("if-none-match") === etag)
    return new Response(null, { status: 304, headers });
  return new Response(body, { headers });
}

async function sha1(s: string) {
  const d = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return Buffer.from(d).toString("hex");
}
