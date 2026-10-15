import { createFileRoute } from "@tanstack/react-router";

import {
  headTags,
  injectHead,
  shelfMessagePage,
  shelfPageHtml,
  shelfTitle,
} from "@/lib/shelf/page.server";

// /shelf: the Creator Merch Shelf with no stored config. The page reads quick-link
// parameters itself (/shelf?name=PixelPine&neon=ff37ae&invite=snowday, see
// QUICK_LINK_PARAMS in src/lib/shelf/shelves.ts) and falls back to
// /merch-shelf/default.json. Here we only add the title and link-preview tags,
// named for ?name= so a quick link unfurls as "PixelPine's activated merch".

export const Route = createFileRoute("/shelf/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const html = await shelfPageHtml(request);
        if (!html) {
          return shelfMessagePage(
            503,
            "This shelf is loading slowly",
            "We couldn't load it just now. Please try again in a minute.",
            { href: url.pathname + url.search, label: "Try again" },
          );
        }
        const name = (url.searchParams.get("name") ?? "").trim().slice(0, 28);
        const out = injectHead(
          html,
          headTags({
            origin: url.origin,
            path: name ? `/shelf?name=${encodeURIComponent(name)}` : "/shelf",
            title: shelfTitle(name),
            image: null,
          }),
        );
        return new Response(out, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "public, max-age=0, must-revalidate",
            "netlify-cdn-cache-control": "public, max-age=60, stale-while-revalidate=600",
            // the head only depends on ?name=; everything else is read by the page
            "netlify-vary": "query=name",
          },
        });
      },
    },
  },
});
