import { createFileRoute } from "@tanstack/react-router";

import { linkSchema } from "@/lib/ar/events";
import { arStore, namespaceFromRequest } from "@/lib/ar/store.server";

// Public client-link lookup for the demo pages (public/vendor/ar-kit/track.js):
//   GET /api/ar/link?c=CODE → 200 {code, name, demo, unlock} | 404
// Only what the page needs to greet the visitor; the internal note never leaves.
// Archived links answer 404, like missing ones. Never cached: renaming,
// archiving or unlocking a link takes effect on the next page load.

const HEADERS = { "cache-control": "no-store" };

function notFound() {
  return Response.json({ error: "not-found" }, { status: 404, headers: HEADERS });
}

export const Route = createFileRoute("/api/ar/link")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const code = (new URL(request.url).searchParams.get("c") ?? "").trim().toLowerCase();
        if (!/^[a-z0-9_-]{2,40}$/.test(code)) return notFound();
        const store = await arStore("links", namespaceFromRequest(request));
        const parsed = linkSchema.safeParse(await store.getJSON(`${code}.json`).catch(() => null));
        if (!parsed.success || parsed.data.archived) return notFound();
        const { name, demo, unlock } = parsed.data;
        return Response.json({ code, name, demo, unlock }, { headers: HEADERS });
      },
    },
  },
});
