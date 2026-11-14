import { createFileRoute } from "@tanstack/react-router";

import { namespaceFromRequest } from "@/lib/ar/store.server";
import { handleClaim, preflight } from "@/lib/lootbreak/api.server";

// LOOT BREAK rewards: claim a score code or the bonus-quest code.
// Contract in src/lib/lootbreak/api.server.ts.

export const Route = createFileRoute("/api/lootbreak/claim")({
  server: {
    handlers: {
      POST: ({ request }) => handleClaim(namespaceFromRequest(request), request),
      OPTIONS: () => preflight(),
    },
  },
});
