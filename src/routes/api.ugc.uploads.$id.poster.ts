import { createFileRoute } from "@tanstack/react-router";

import { ugcGuard } from "@/lib/ugc/auth.server";
import { ugcNs } from "@/lib/ugc/store.server";
import { putPoster } from "@/lib/ugc/uploads.server";

// A submission's poster frame (JPEG/PNG/WebP ≤ 2 MB, extracted in the browser).

export const Route = createFileRoute("/api/ugc/uploads/$id/poster")({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        const ns = ugcNs(request);
        const c = await ugcGuard(ns, request);
        if (c instanceof Response) return c;
        return putPoster(ns, c, params.id, request);
      },
    },
  },
});
