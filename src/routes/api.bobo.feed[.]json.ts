import { createFileRoute } from "@tanstack/react-router";

import { namespaceFromRequest } from "@/lib/ar/store.server";
import { handleFeed } from "@/lib/bobo/feed.server";

// "Where is Bobo?" globe data: public, CDN-cached for a minute. Shape:
// BoboFeed in src/lib/bobo/model.ts.

export const Route = createFileRoute("/api/bobo/feed.json")({
  server: {
    handlers: {
      GET: ({ request }) => handleFeed(namespaceFromRequest(request), request),
    },
  },
});
