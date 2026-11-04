import type { ArNamespace } from "@/lib/ar/store.server";
import { listAssets, saveAssets } from "@/lib/media/data.server";
import { normaliseTags, type MediaAsset } from "@/lib/media/model";
import { publicBytes, writeSampleFile } from "@/lib/media/sample.server";
import { mediaStorage } from "@/lib/media/storage.server";

import { boboStore } from "./events.server";
import { placeByName } from "./geo.server";
import { cleanLocation } from "./location";

// The real Bobo AR footage already in the repo, with the places it was really
// filmed: the globe's first two sightings on every deploy, production
// included. They are added to the Media Library once, as ordinary (not sample)
// files, so the team can edit, unpublish or delete them in /admin/media like
// any other upload. A marker in the bobo store stops them coming back after
// that: deleting one there is final.

const V = "evade/creators/assets/video/";

type Launch = {
  id: string;
  file: string;
  poster: string;
  title: string;
  description: string;
  city: string;
  cc: string;
  place: string;
  tags: string[];
};

const LAUNCH: Launch[] = [
  {
    id: "bobolaunchgoldengate",
    file: `${V}bobo-golden-gate.mp4`,
    poster: `${V}bobo-golden-gate.webp`,
    title: "Bobo at the Golden Gate",
    description: "Bobo in AR on a phone in front of the Golden Gate Bridge.",
    city: "San Francisco",
    cc: "US",
    place: "Golden Gate Bridge",
    tags: ["AR", "Vertical", "Landmark"],
  },
  {
    id: "bobolaunchrdc26",
    file: `${V}bobo-rdc26.mp4`,
    poster: `${V}bobo-rdc26.webp`,
    title: "Bobo at RDC",
    description: "Bobo shows up in AR at the Roblox Developers Conference.",
    city: "San Jose",
    cc: "US",
    place: "RDC 2026",
    tags: ["AR", "Vertical", "Event"],
  },
];

export const LAUNCH_IDS = new Set(LAUNCH.map((l) => l.id));
const MARKER = "launch/v1";
const done = new Set<ArNamespace>();

/** Adds the launch sightings to this namespace's library, once. Never throws. */
export async function ensureLaunchSightings(ns: ArNamespace): Promise<number> {
  if (done.has(ns)) return 0;
  try {
    const store = await boboStore(ns);
    if (await store.getJSON(MARKER)) {
      done.add(ns);
      return 0;
    }
    const have = new Set((await listAssets(ns, { includeIncomplete: true })).map((a) => a.id));
    const storage = mediaStorage(ns);
    const now = Date.now();
    const records: MediaAsset[] = [];
    for (const [i, l] of LAUNCH.entries()) {
      if (have.has(l.id)) continue;
      const [data, poster, place] = await Promise.all([
        publicBytes(l.file),
        publicBytes(l.poster),
        placeByName(l.city, l.cc),
      ]);
      if (!data || !place) return 0; // try again on the next request
      const { ref, chunks } = await writeSampleFile(ns, l.id, data);
      let thumb: MediaAsset["thumb"] = null;
      if (poster) {
        const key = `thumbs/${l.id}`;
        await storage.putObject(key, poster);
        thumb = { key, mime: "image/webp", size: poster.byteLength };
      }
      // the newest first on the globe: Golden Gate, then RDC
      const at = now - i * 60_000;
      records.push({
        id: l.id,
        name: l.file.split("/").pop()!,
        title: l.title,
        mime: "video/mp4",
        kind: "video",
        size: data.byteLength,
        chunks,
        storage: ref,
        width: 540,
        height: 1130,
        durationS: 8,
        color: null,
        thumb,
        tags: normaliseTags(["Bobo", "Where is Bobo", ...l.tags]),
        client: "EVADE",
        collection: "Where is Bobo",
        purpose: "ugc",
        description: l.description,
        usageNotes: "On the Where is Bobo? globe. Added automatically from the site's own footage.",
        rights: "Recorded in-house",
        aiGenerated: false,
        public: true,
        uploader: "Where is Bobo? launch",
        fingerprint: null,
        complete: true,
        createdAt: at,
        updatedAt: at,
        completedAt: at,
        sample: false,
        location: cleanLocation({ ...place, place: l.place, seenAt: null }),
        onGlobe: true,
        ingest: null,
      });
    }
    if (records.length) await saveAssets(ns, records);
    await store.setJSON(MARKER, { at: now, ids: LAUNCH.map((l) => l.id) });
    done.add(ns);
    return records.length;
  } catch (err) {
    console.error("[bobo] launch sightings", err);
    return 0;
  }
}
