import { createFileRoute } from "@tanstack/react-router";

import { capturePreflight, withCaptureCors } from "@/lib/bobo/captures.server";
import { mediaNs } from "@/lib/media/store.server";
import { putChunk } from "@/lib/media/uploads.server";

// One ≤4 MB chunk of a Media Library upload. The first is magic-byte checked.

export const Route = createFileRoute("/api/media/uploads/$id/chunks/$n")({
  server: {
    handlers: {
      // the game's record button uploads from another origin (captures.server.ts)
      OPTIONS: ({ request }) => capturePreflight(request),
      PUT: ({ request, params }) =>
        withCaptureCors(request, putChunk(mediaNs(request), request, params.id, Number(params.n))),
    },
  },
});
