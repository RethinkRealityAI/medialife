import { createFileRoute } from "@tanstack/react-router";

import { namespaceFromRequest } from "@/lib/ar/store.server";
import { handleMe, preflight } from "@/lib/collector/unlock.server";

// Collector Hub: the signed-in fan's items in a room (Bearer owner token).

export const Route = createFileRoute("/api/collector/me")({
  server: {
    handlers: {
      GET: ({ request }) => handleMe(namespaceFromRequest(request), request),
      OPTIONS: () => preflight(),
    },
  },
});
