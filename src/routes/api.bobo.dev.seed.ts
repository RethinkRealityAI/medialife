import { createFileRoute } from "@tanstack/react-router";

import { namespaceFromRequest } from "@/lib/ar/store.server";
import { seedBoboSample } from "@/lib/bobo/sample.server";
import { json, writeGuard } from "@/lib/media/auth.server";

// Loads sample sightings and AR scans for "Where is Bobo?" on localhost and
// deploy previews (admin only; production refuses). ?reset=1 replaces them.

export const Route = createFileRoute("/api/bobo/dev/seed")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ns = namespaceFromRequest(request);
        if (ns === "prod") return json({ error: "not available in production" }, 404);
        const denied = await writeGuard(request);
        if (denied) return denied;
        const reset = new URL(request.url).searchParams.get("reset") === "1";
        return json(await seedBoboSample(ns, { reset }));
      },
    },
  },
});
