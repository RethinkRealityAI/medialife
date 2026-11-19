import { createFileRoute } from "@tanstack/react-router";

import { namespaceFromRequest } from "@/lib/ar/store.server";
import { handleRound, preflight } from "@/lib/lootbreak/api.server";

// LOOT BREAK rewards: a signed round ticket, asked for when a round starts.
// Contract in src/lib/lootbreak/api.server.ts.

export const Route = createFileRoute("/api/lootbreak/round")({
  server: {
    handlers: {
      POST: ({ request }) => handleRound(namespaceFromRequest(request), request),
      OPTIONS: () => preflight(),
    },
  },
});
