import { createFileRoute } from "@tanstack/react-router";

import { isAdminRequest } from "@/lib/ar/auth.server";
import { seedUgcSample } from "@/lib/ugc/sample.server";
import { ugcNs } from "@/lib/ugc/store.server";

// Loads the UGC Hub sample data (src/lib/ugc/sample.server.ts) on localhost and
// deploy previews. Admin-only; production refuses. ?reset=1 replaces it.
// The admin UI can do the same through adminSeedUgcSample.

export const Route = createFileRoute("/api/ugc/dev/seed")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ns = ugcNs(request);
        if (ns === "prod")
          return Response.json({ error: "not available in production" }, { status: 404 });
        if (!(await isAdminRequest(request)))
          return Response.json({ error: "unauthorized" }, { status: 401 });
        if (request.headers.get("x-ugc") !== "1")
          return Response.json({ error: "missing x-ugc header" }, { status: 403 });
        const reset = new URL(request.url).searchParams.get("reset") === "1";
        return Response.json(await seedUgcSample(ns, { reset }), {
          headers: { "cache-control": "no-store" },
        });
      },
    },
  },
});
