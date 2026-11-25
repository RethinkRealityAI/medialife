import { createFileRoute } from "@tanstack/react-router";

import { namespaceFromRequest } from "@/lib/ar/store.server";
import { handleUnlocksFeed } from "@/lib/collector/unlocks.server";

// Bobo's Hideout: which arcade machines are open and how fans unlock the rest (?room=evade). Public and
// CDN-cached; purged the moment the team saves new rules in /admin/collector.

export const Route = createFileRoute("/api/collector/unlocks.json")({
  server: {
    handlers: {
      GET: ({ request }) => handleUnlocksFeed(namespaceFromRequest(request), request),
    },
  },
});
