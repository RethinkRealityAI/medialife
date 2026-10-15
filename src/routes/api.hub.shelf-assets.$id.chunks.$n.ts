import { createFileRoute } from "@tanstack/react-router";

import { json, putChunk } from "@/lib/ar/assets.server";
import { namespaceFromRequest } from "@/lib/ar/store.server";
import { partnerUploadGuard } from "@/lib/shelf/partner-assets.server";

// Partner Hub: one ≤4 MB piece of a shelf image upload. Idempotent.

export const Route = createFileRoute("/api/hub/shelf-assets/$id/chunks/$n")({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        const g = await partnerUploadGuard(request);
        if (g instanceof Response) return g;
        const n = /^\d{1,4}$/.test(params.n) ? Number(params.n) : -1;
        const r = await putChunk(namespaceFromRequest(request), params.id, n, request);
        return r.ok ? new Response(null, { status: 204 }) : json({ error: r.error }, r.status);
      },
    },
  },
});
