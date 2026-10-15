import { createFileRoute } from "@tanstack/react-router";

import { guard, putChunk } from "@/lib/hub/files.server";
import { hubNs } from "@/lib/hub/store.server";

// One ≤4 MB chunk of a Creator Hub upload.

export const Route = createFileRoute("/api/hub/files/$creatorId/$fileId/chunks/$n")({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        const ns = hubNs(request);
        const c = await guard(ns, request);
        if (c instanceof Response) return c;
        return putChunk(ns, c, params.creatorId, params.fileId, Number(params.n), request);
      },
    },
  },
});
