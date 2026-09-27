import { createFileRoute } from "@tanstack/react-router";

import { adminGuard, completeUpload, json } from "@/lib/ar/assets.server";
import { namespaceFromRequest } from "@/lib/ar/store.server";

// Admin: finish an upload. Checks every chunk arrived and that the bytes are
// what they claim to be (glTF / USDZ / PNG / JPEG / WebP signature).

export const Route = createFileRoute("/api/ar/admin/assets/$id/complete")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const deny = await adminGuard(request);
        if (deny) return deny;
        const r = await completeUpload(namespaceFromRequest(request), params.id);
        return r.ok ? json(r.asset) : json({ error: r.error }, r.status);
      },
    },
  },
});
