import type { ArNamespace } from "@/lib/ar/store.server";
import { deleteAssets, listAssets, saveAssets } from "@/lib/media/data.server";
import { imageSize, normaliseTags, resolveMediaMime, type MediaAsset } from "@/lib/media/model";
import { publicBytes, writeSampleFile } from "@/lib/media/sample.server";
import { mediaStorage } from "@/lib/media/storage.server";

import { clearEvents, makeEvent, recordEvents } from "./events.server";
import { placeByName } from "./geo.server";
import { cleanLocation } from "./location";
import type { BoboEvent, BoboEventType } from "./model";

// Sample sightings for "Where is Bobo?" on localhost and deploy previews, so
// the globe has something to show before the team tags real footage. Uses the
// real Bobo AR clips and EVADE photos from the repo; the LOCATIONS are made up
// (except the Golden Gate clip). Every record is `sample: true` and every
// event has source "sample". Production refuses (the route checks the namespace).

const DAY = 86_400_000;

type Spec = {
  id: string;
  file: string;
  poster?: string;
  title: string;
  description: string;
  city: string;
  cc: string;
  place: string;
  daysAgo: number;
  tags: string[];
  durationS?: number;
  width?: number;
  height?: number;
};

const V = "evade/creators/assets/video/";
const SPECS: Spec[] = [
  {
    id: "boboseedgoldengate",
    file: `${V}bobo-golden-gate.mp4`,
    poster: `${V}bobo-golden-gate.webp`,
    title: "Bobo at the Golden Gate",
    description: "Bobo in AR on a phone in front of the Golden Gate Bridge.",
    city: "San Francisco",
    cc: "US",
    place: "Golden Gate Bridge",
    daysAgo: 1.2,
    tags: ["AR", "Vertical", "Landmark"],
    durationS: 8,
    width: 540,
    height: 1130,
  },
  {
    id: "boboseedrdc26",
    file: `${V}bobo-rdc26.mp4`,
    poster: `${V}bobo-rdc26.webp`,
    title: "Bobo at RDC",
    description: "Bobo shows up in AR at the Roblox Developers Conference.",
    city: "San Jose",
    cc: "US",
    place: "RDC 2026",
    daysAgo: 6,
    tags: ["AR", "Vertical", "Event"],
    durationS: 8,
    width: 540,
    height: 1130,
  },
  {
    id: "boboseedmeetup",
    file: `${V}bobo-meetup.mp4`,
    poster: `${V}bobo-meetup.webp`,
    title: "Meet & greet",
    description: "A fan meets Bobo in AR next to the mascot.",
    city: "Tokyo",
    cc: "JP",
    place: "Fan meet-up",
    daysAgo: 13,
    tags: ["AR", "Vertical", "Fans"],
    durationS: 8,
    width: 540,
    height: 1130,
  },
  {
    id: "boboseedexhibit",
    file: `${V}bobo-exhibit.mp4`,
    poster: `${V}bobo-exhibit.webp`,
    title: "Outdoor exhibit",
    description: "Bobo walks through an outdoor exhibit in AR.",
    city: "London",
    cc: "GB",
    place: "Outdoor exhibit",
    daysAgo: 20,
    tags: ["AR", "Vertical"],
    durationS: 8,
    width: 540,
    height: 1130,
  },
  {
    id: "boboseedbridge",
    file: `${V}bobo-bridge.mp4`,
    poster: `${V}bobo-bridge.webp`,
    title: "On the bridge",
    description: "Bobo crossing a bridge in AR.",
    city: "Sydney",
    cc: "AU",
    place: "Harbour walk",
    daysAgo: 27,
    tags: ["AR", "Vertical"],
    durationS: 8,
    width: 540,
    height: 1130,
  },
  {
    id: "boboseedlagos",
    file: "merch/keychain-hand.webp",
    title: "Keychain in hand",
    description: "The Bobo + Eclipse keychain, ready to scan.",
    city: "Lagos",
    cc: "NG",
    place: "",
    daysAgo: 9,
    tags: ["Keychain", "Merch"],
  },
  {
    id: "boboseedsaopaulo",
    file: "roblox/portal/img/evade/keychain-set.webp",
    title: "The keychain set",
    description: "Bobo and Eclipse keychains.",
    city: "São Paulo",
    cc: "BR",
    place: "Creator unboxing",
    daysAgo: 16,
    tags: ["Keychain", "Merch", "UGC"],
  },
  {
    id: "boboseedmanila",
    file: "roblox/portal/img/evade/bobo-reward.webp",
    title: "Reward unlocked",
    description: "The in-game Bobo reward a keychain scan unlocks.",
    city: "Manila",
    cc: "PH",
    place: "",
    daysAgo: 3.5,
    tags: ["Reward", "Gameplay"],
  },
  {
    id: "boboseedmexico",
    file: "evade/creators/assets/img/cola-run-splash.webp",
    title: "Cola Run takeover",
    description: "Cola Run on the big screen.",
    city: "Mexico City",
    cc: "MX",
    place: "",
    daysAgo: 34,
    tags: ["Cola Run", "Key art"],
  },
];

/** Cities that get sample scans, weighted. */
const EVENT_CITIES: [string, string, number][] = [
  ["San Francisco", "US", 30],
  ["Los Angeles", "US", 44],
  ["New York City", "US", 38],
  ["Chicago", "US", 14],
  ["Toronto", "CA", 18],
  ["Mexico City", "MX", 26],
  ["São Paulo", "BR", 41],
  ["Buenos Aires", "AR", 17],
  ["Bogotá", "CO", 12],
  ["Lima", "PE", 9],
  ["London", "GB", 27],
  ["Paris", "FR", 12],
  ["Berlin", "DE", 10],
  ["Madrid", "ES", 11],
  ["Lagos", "NG", 22],
  ["Nairobi", "KE", 8],
  ["Johannesburg", "ZA", 9],
  ["Cairo", "EG", 7],
  ["Dubai", "AE", 9],
  ["Mumbai", "IN", 13],
  ["Jakarta", "ID", 29],
  ["Manila", "PH", 35],
  ["Ho Chi Minh City", "VN", 16],
  ["Bangkok", "TH", 19],
  ["Kuala Lumpur", "MY", 12],
  ["Singapore", "SG", 10],
  ["Tokyo", "JP", 21],
  ["Seoul", "KR", 15],
  ["Sydney", "AU", 14],
  ["Auckland", "NZ", 5],
];

export async function seedBoboSample(
  ns: ArNamespace,
  opts: { reset?: boolean } = {},
): Promise<{ created: boolean; media: number; events: number; skipped: string[] }> {
  if (ns === "prod") throw new Error("The Bobo seed never runs in production.");
  const existing = await listAssets(ns, { includeIncomplete: true });
  const ours = existing.filter((a) => a.sample && a.id.startsWith("boboseed"));
  if (ours.length && !opts.reset)
    return { created: false, media: ours.length, events: 0, skipped: [] };
  if (ours.length) await deleteAssets(ns, ours);
  await clearEvents(ns, true);

  const now = Date.now();
  const storage = mediaStorage(ns);
  const records: MediaAsset[] = [];
  const skipped: string[] = [];
  for (const s of SPECS) {
    const data = await publicBytes(s.file);
    const name = s.file.split("/").pop()!;
    const mime = resolveMediaMime(name);
    const place = await placeByName(s.city, s.cc);
    if (!data || !mime || !place) {
      skipped.push(s.file);
      continue;
    }
    const { ref, chunks } = await writeSampleFile(ns, s.id, data);
    let thumb: MediaAsset["thumb"] = null;
    if (s.poster) {
      const p = await publicBytes(s.poster);
      if (p) {
        const key = `thumbs/${s.id}`;
        await storage.putObject(key, p);
        thumb = { key, mime: "image/webp", size: p.byteLength };
      }
    }
    const isImage = mime.startsWith("image/");
    const dims = isImage ? imageSize(mime, data) : null;
    const seenAt = Math.round(now - s.daysAgo * DAY);
    records.push({
      id: s.id,
      name,
      title: s.title,
      mime,
      kind: isImage ? "image" : "video",
      size: data.byteLength,
      chunks,
      storage: ref,
      width: dims?.width ?? s.width ?? null,
      height: dims?.height ?? s.height ?? null,
      durationS: s.durationS ?? null,
      color: null,
      thumb,
      tags: normaliseTags(["Bobo", "Where is Bobo", ...s.tags]),
      client: "EVADE",
      collection: "Where is Bobo · sample",
      purpose: "ugc",
      description: s.description,
      usageNotes: "Sample sighting for previews: the location is made up.",
      rights: "Recorded in-house",
      aiGenerated: false,
      public: true,
      uploader: "Dev seed",
      fingerprint: null,
      complete: true,
      createdAt: seenAt,
      updatedAt: seenAt,
      completedAt: seenAt,
      sample: true,
      location: cleanLocation({ ...place, place: s.place, seenAt }),
      onGlobe: true,
      ingest: null,
    });
  }
  await saveAssets(ns, records);

  // ~600 scans / plays / rewards over the last week, a few in the last hour
  const events: BoboEvent[] = [];
  const types: BoboEventType[] = ["scan", "scan", "scan", "play", "play", "reward", "share"];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (const [city, cc, weight] of EVENT_CITIES) {
    const p = await placeByName(city, cc);
    if (!p) continue;
    const n = Math.round(weight * (0.8 + rnd() * 0.6));
    for (let i = 0; i < n; i++) {
      const ago = rnd() ** 2 * 7 * DAY;
      events.push(makeEvent(types[Math.floor(rnd() * types.length)], now - ago, p));
    }
  }
  for (const [city, cc] of [
    ["Manila", "PH"],
    ["São Paulo", "BR"],
    ["Los Angeles", "US"],
    ["Lagos", "NG"],
  ] as const) {
    const p = await placeByName(city, cc);
    if (p) events.push(makeEvent("scan", now - rnd() * 40 * 60_000, p));
  }
  // folded into the totals only (no per-event log), so a reset rebuilds from real events alone
  await recordEvents(ns, events, { log: false });
  return { created: true, media: records.length, events: events.length, skipped };
}
