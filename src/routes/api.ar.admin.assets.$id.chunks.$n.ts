import { createFileRoute } from "@tanstack/react-router";

import { adminGuard, json, putChunk } from "@/lib/ar/assets.server";
import { namespaceFromRequest } from "@/lib/ar/store.server";

// Admin: one ≤4 MB piece of an upload started with POST /api/ar/admin/assets.
// Idempotent, so the browser can retry a chunk that failed.

export const Route = createFileRoute("/api/ar/admin/assets/$id/chunks/$n")({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        const deny = await adminGuard(request);
        if (deny) return deny;
        const n = /^\d{1,4}$/.test(params.n) ? Number(params.n) : -1;
        const r = await putChunk(namespaceFromRequest(request), params.id, n, request);
        return r.ok ? new Response(null, { status: 204 }) : json({ error: r.error }, r.status);
      },
    },
  },
});
