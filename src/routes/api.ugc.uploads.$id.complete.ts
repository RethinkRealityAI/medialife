import { createFileRoute } from "@tanstack/react-router";

import { ugcGuard } from "@/lib/ugc/auth.server";
import { ugcNs } from "@/lib/ugc/store.server";
import { completeUpload } from "@/lib/ugc/uploads.server";

// Finishes a UGC upload once every chunk has arrived (magic-byte check, then in review).

export const Route = createFileRoute("/api/ugc/uploads/$id/complete")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const ns = ugcNs(request);
        const c = await ugcGuard(ns, request);
        if (c instanceof Response) return c;
        return completeUpload(ns, c, params.id);
      },
    },
  },
});
