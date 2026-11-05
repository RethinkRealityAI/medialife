import { createFileRoute } from "@tanstack/react-router";

import { namespaceFromRequest } from "@/lib/ar/store.server";
import { handleUnlock, preflight } from "@/lib/collector/unlock.server";

// Collector Hub: unlock a room with a product code + email, or sign back in
// with the same pair. Contract in src/lib/collector/unlock.server.ts.

export const Route = createFileRoute("/api/collector/unlock")({
  server: {
    handlers: {
      POST: ({ request }) => handleUnlock(namespaceFromRequest(request), request),
      OPTIONS: () => preflight(),
    },
  },
});
