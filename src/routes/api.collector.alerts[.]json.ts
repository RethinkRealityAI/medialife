import { createFileRoute } from "@tanstack/react-router";

import { namespaceFromRequest } from "@/lib/ar/store.server";
import { handleAlertsFeed } from "@/lib/collector/admin.server";

// Collector Hub: the alerts the team sent to a room (?room=evade). Public and
// CDN-cached; purged the moment the team sends one.

export const Route = createFileRoute("/api/collector/alerts.json")({
  server: {
    handlers: {
      GET: ({ request }) => handleAlertsFeed(namespaceFromRequest(request), request),
    },
  },
});
