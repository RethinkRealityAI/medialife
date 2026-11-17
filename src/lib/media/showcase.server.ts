import { INTERACTIONS, type ShowcaseMap } from "@/lib/interactions";
import { listAssets } from "./data.server";
import { mediaPublicPath, mediaThumbUrl, type MediaAsset } from "./model";
import type { MediaNamespace } from "./store.server";

// /api/showcase.json: for each interaction card (src/lib/interactions.ts), the
// newest PUBLIC, complete video in the Media Library that has the tag
// "Showcase" and the experience's name as a tag or its collection. Public and
// CDN-cached; only public file URLs leave the server.

const norm = (s: string) => s.trim().toLowerCase();

export function pickShowcase(assets: MediaAsset[]): ShowcaseMap {
  const out: ShowcaseMap = {};
  const candidates = assets
    .filter((a) => a.public && a.complete && a.kind === "video")
    .filter((a) => a.tags.some((t) => norm(t) === "showcase"))
    .sort((a, b) => b.createdAt - a.createdAt);
  for (const it of INTERACTIONS) {
    const names = new Set(it.aliases.map(norm).concat(norm(it.name), it.slug));
    const hit = candidates.find(
      (a) => names.has(norm(a.collection || "")) || a.tags.some((t) => names.has(norm(t))),
    );
    if (hit)
      out[it.slug] = {
        src: mediaPublicPath(hit),
        poster: mediaThumbUrl(hit),
        title: hit.title || it.name,
      };
  }
  return out;
}

export async function handleShowcase(ns: MediaNamespace): Promise<Response> {
  let clips: ShowcaseMap = {};
  try {
    clips = pickShowcase(await listAssets(ns));
  } catch {
    // the library being unreachable must never break the page: cards keep their bundled clips
  }
  return new Response(JSON.stringify({ clips }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60",
      "netlify-cdn-cache-control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
}
