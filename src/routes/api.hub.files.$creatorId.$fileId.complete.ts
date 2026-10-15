import { createFileRoute } from "@tanstack/react-router";

import { completeUpload, guard } from "@/lib/hub/files.server";
import { hubNs } from "@/lib/hub/store.server";

// Finishes a Creator Hub upload once every chunk has arrived.

export const Route = createFileRoute("/api/hub/files/$creatorId/$fileId/complete")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const ns = hubNs(request);
        const c = await guard(ns, request);
        if (c instanceof Response) return c;
        return completeUpload(ns, c, params.creatorId, params.fileId);
      },
    },
  },
});
