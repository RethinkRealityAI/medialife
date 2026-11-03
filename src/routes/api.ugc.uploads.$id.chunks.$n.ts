import { createFileRoute } from "@tanstack/react-router";

import { ugcGuard } from "@/lib/ugc/auth.server";
import { ugcNs } from "@/lib/ugc/store.server";
import { putChunk } from "@/lib/ugc/uploads.server";

// One ≤4 MB chunk of a UGC upload. Quota is checked again on every chunk.

export const Route = createFileRoute("/api/ugc/uploads/$id/chunks/$n")({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        const ns = ugcNs(request);
        const c = await ugcGuard(ns, request);
        if (c instanceof Response) return c;
        return putChunk(ns, c, params.id, Number(params.n), request);
      },
    },
  },
});
