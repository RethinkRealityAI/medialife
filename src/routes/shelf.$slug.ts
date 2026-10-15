import { createFileRoute } from "@tanstack/react-router";

import { isAdminRequest } from "@/lib/ar/auth.server";
import { namespaceFromRequest } from "@/lib/ar/store.server";
import {
  headTags,
  injectHead,
  shelfMessagePage,
  shelfPageHtml,
  shelfTitle,
} from "@/lib/shelf/page.server";
import { readShelf, snapshotRef } from "@/lib/shelf/shelves.server";

// A published Creator Merch Shelf: the static page (public/merch-shelf/index.html)
// with the config injected at its <!--SHELF_CONFIG--> marker as window.__SHELF
// (and window.__SHELF_SLUG), plus the title and link-preview tags outreach emails,
// Discord and iMessage show. ?draft=1 with an admin session serves the draft
// (never cached). Unknown or unpublished slugs get a friendly 404.

export const Route = createFileRoute("/shelf/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const doc = await readShelf(namespaceFromRequest(request), params.slug);
        const wantsDraft = url.searchParams.get("draft") === "1";
        const draft = wantsDraft && !!doc && (await isAdminRequest(request));
        const config = draft ? doc!.draft : (doc?.published ?? null);
        if (!doc || !config) {
          return shelfMessagePage(
            404,
            "This shelf isn't available",
            "The link may be out of date, or the shelf was taken offline. Ask the person who shared it for a new link.",
          );
        }
        const html = await shelfPageHtml(request);
        if (!html) {
          return shelfMessagePage(
            503,
            "This shelf is loading slowly",
            "We couldn't load it just now. Please try again in a minute.",
            { href: url.pathname, label: "Try again" },
          );
        }
        const out = injectHead(
          html,
          headTags({
            origin: url.origin,
            path: `/shelf/${doc.slug}`,
            title: shelfTitle(config.creator.name),
            image: snapshotRef(doc.snapshotAssetId),
            shelf: { config, slug: doc.slug },
          }),
        );
        return new Response(out, {
          // any ?draft=1 response stays out of the CDN: the cache key can't see the cookie
          headers: wantsDraft
            ? {
                "content-type": "text/html; charset=utf-8",
                "cache-control": "private, no-store",
                "netlify-cdn-cache-control": "no-store",
              }
            : {
                "content-type": "text/html; charset=utf-8",
                "cache-control": "public, max-age=0, must-revalidate",
                "netlify-cdn-cache-control": "public, max-age=60, stale-while-revalidate=600",
                // one cached copy per shelf, whatever ?c= a client link adds
                "netlify-vary": "query=draft",
                // publish / unpublish / delete purge exactly this page
                "netlify-cache-tag": `shelf-${doc.slug}`,
              },
        });
      },
    },
  },
});
