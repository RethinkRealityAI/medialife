import { createFileRoute } from "@tanstack/react-router";

import { adminGuard, initUpload, json, listAssets } from "@/lib/ar/assets.server";
import { namespaceFromRequest } from "@/lib/ar/store.server";

// Admin: the builder's asset library. GET lists every file (with the projects
// that use it); POST starts a chunked upload. Contract in src/lib/ar/assets.ts.

export const Route = createFileRoute("/api/ar/admin/assets")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const deny = await adminGuard(request);
        if (deny) return deny;
        return json({ assets: await listAssets(namespaceFromRequest(request)) });
      },
      POST: async ({ request }) => {
        const deny = await adminGuard(request);
        if (deny) return deny;
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid JSON" }, 400);
        }
        const r = await initUpload(namespaceFromRequest(request), body);
        if (!r.ok) return json({ error: r.error }, r.status);
        return json({ id: r.id, chunkSize: r.chunkSize, chunks: r.chunks }, 201);
      },
    },
  },
});
