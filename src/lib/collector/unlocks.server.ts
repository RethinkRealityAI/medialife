import type { ArNamespace } from "@/lib/ar/store.server";
import { purgeCacheTags } from "@/lib/ar/cdn.server";

import { roomById } from "./model";
import { cleanUnlocks, type UnlockConfig } from "./unlocks";
import { collectorStore } from "./store.server";

// Bobo's Hideout unlock rules (see unlocks.ts): stored per room in the Collector Hub's Blobs store, edited in
// /admin/collector, served publicly to the EVADE Hub at /api/collector/unlocks.json?room=evade.

const key = (room: string) => `unlocks/${room}`;
export const unlocksTag = (room: string) => `collector-unlocks-${room}`;

const productIds = (room: string) => roomById(room)?.products.map((p) => p.id) ?? [];

export async function getUnlocks(ns: ArNamespace, room: string): Promise<UnlockConfig> {
  const raw = await (await collectorStore(ns)).getJSON<UnlockConfig>(key(room));
  return cleanUnlocks(raw, productIds(room), room);
}

export async function saveUnlocks(
  ns: ArNamespace,
  room: string,
  input: unknown,
): Promise<UnlockConfig> {
  if (!roomById(room)) throw new Error("Unknown room");
  const cfg = cleanUnlocks(input, productIds(room), room);
  cfg.updatedAt = new Date().toISOString();
  await (await collectorStore(ns)).setJSON(key(room), cfg);
  await purgeCacheTags([unlocksTag(room)]);
  return cfg;
}

export async function resetUnlocks(ns: ArNamespace, room: string): Promise<UnlockConfig> {
  await (await collectorStore(ns)).del(key(room));
  await purgeCacheTags([unlocksTag(room)]);
  return getUnlocks(ns, room);
}

/** GET /api/collector/unlocks.json?room=evade — public, read by every fan's hub on load. */
export async function handleUnlocksFeed(ns: ArNamespace, request: Request): Promise<Response> {
  const room = roomById(new URL(request.url).searchParams.get("room") || "evade");
  if (!room) return new Response("unknown room", { status: 400 });
  const body = JSON.stringify(await getUnlocks(ns, room.id));
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=10, must-revalidate",
      "netlify-cdn-cache-control": "public, s-maxage=60, stale-while-revalidate=120",
      "netlify-cache-tag": unlocksTag(room.id),
      "access-control-allow-origin": "*",
    },
  });
}
