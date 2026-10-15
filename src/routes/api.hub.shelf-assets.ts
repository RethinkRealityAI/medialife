import { createFileRoute } from "@tanstack/react-router";

import { initUpload, json } from "@/lib/ar/assets.server";
import { namespaceFromRequest } from "@/lib/ar/store.server";
import { partnerInitBody, partnerUploadGuard } from "@/lib/shelf/partner-assets.server";

// Partner Hub: start an image upload for a merch shelf (logo, print, link-preview
// snapshot). Same chunked contract as /api/ar/admin/assets; images only.

export const Route = createFileRoute("/api/hub/shelf-assets")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const g = await partnerUploadGuard(request);
        if (g instanceof Response) return g;
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid JSON" }, 400);
        }
        const input = partnerInitBody(body, g.partnerId);
        if (!input) return json({ error: "images only (PNG, JPEG or WebP)" }, 400);
        const r = await initUpload(namespaceFromRequest(request), input);
        if (!r.ok) return json({ error: r.error }, r.status);
        return json({ id: r.id, chunkSize: r.chunkSize, chunks: r.chunks }, 201);
      },
    },
  },
});
