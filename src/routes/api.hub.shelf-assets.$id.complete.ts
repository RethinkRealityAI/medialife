import { createFileRoute } from "@tanstack/react-router";

import { completeUpload, json } from "@/lib/ar/assets.server";
import { namespaceFromRequest } from "@/lib/ar/store.server";
import { partnerUploadGuard } from "@/lib/shelf/partner-assets.server";

// Partner Hub: finish a shelf image upload (checks every chunk and the bytes).

export const Route = createFileRoute("/api/hub/shelf-assets/$id/complete")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const g = await partnerUploadGuard(request);
        if (g instanceof Response) return g;
        const r = await completeUpload(namespaceFromRequest(request), params.id);
        return r.ok ? json(r.asset) : json({ error: r.error }, r.status);
      },
    },
  },
});
