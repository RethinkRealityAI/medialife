import { createFileRoute } from "@tanstack/react-router";

import { namespaceFromRequest } from "@/lib/ar/store.server";
import { handleConfig, preflight } from "@/lib/lootbreak/api.server";

// LOOT BREAK rewards: what the game shows (reward ladder, bonus quest, shop link).
// Contract in src/lib/lootbreak/api.server.ts.

export const Route = createFileRoute("/api/lootbreak/config")({
  server: {
    handlers: {
      GET: ({ request }) => handleConfig(namespaceFromRequest(request)),
      OPTIONS: () => preflight(),
    },
  },
});
