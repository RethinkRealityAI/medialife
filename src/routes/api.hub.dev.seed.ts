import { createFileRoute } from "@tanstack/react-router";

import { isAdminRequest } from "@/lib/ar/auth.server";
import { seedSampleCreator } from "@/lib/hub/sample.server";
import { hubNs } from "@/lib/hub/store.server";

// Loads the sample creator (see src/lib/hub/sample.server.ts) on localhost and
// deploy previews. Admin-only; production refuses. The admin UI's "Load sample
// creator" button does the same through a server function.

export const Route = createFileRoute("/api/hub/dev/seed")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ns = hubNs(request);
        if (ns === "prod")
          return Response.json({ error: "not available in production" }, { status: 404 });
        if (!(await isAdminRequest(request)))
          return Response.json({ error: "unauthorized" }, { status: 401 });
        if (request.headers.get("x-hub") !== "1")
          return Response.json({ error: "missing x-hub header" }, { status: 403 });
        return Response.json(await seedSampleCreator(ns), {
          headers: { "cache-control": "no-store" },
        });
      },
    },
  },
});
