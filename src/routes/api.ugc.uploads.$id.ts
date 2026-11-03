import { createFileRoute } from "@tanstack/react-router";

import { ugcGuard } from "@/lib/ugc/auth.server";
import { ugcNs } from "@/lib/ugc/store.server";
import { cancelUpload, uploadStatus } from "@/lib/ugc/uploads.server";

// GET: which chunks of an upload have arrived (to resume it). DELETE: cancel an unfinished upload.

export const Route = createFileRoute("/api/ugc/uploads/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const ns = ugcNs(request);
        const c = await ugcGuard(ns, request);
        if (c instanceof Response) return c;
        return uploadStatus(ns, c, params.id);
      },
      DELETE: async ({ request, params }) => {
        const ns = ugcNs(request);
        const c = await ugcGuard(ns, request);
        if (c instanceof Response) return c;
        return cancelUpload(ns, c, params.id);
      },
    },
  },
});
