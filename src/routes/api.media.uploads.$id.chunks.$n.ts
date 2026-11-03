import { createFileRoute } from "@tanstack/react-router";

import { mediaNs } from "@/lib/media/store.server";
import { putChunk } from "@/lib/media/uploads.server";

// One ≤4 MB chunk of a Media Library upload. The first is magic-byte checked.

export const Route = createFileRoute("/api/media/uploads/$id/chunks/$n")({
  server: {
    handlers: {
      PUT: ({ request, params }) =>
        putChunk(mediaNs(request), request, params.id, Number(params.n)),
    },
  },
});
