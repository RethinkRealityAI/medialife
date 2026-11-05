import { createFileRoute } from "@tanstack/react-router";

import { capturePreflight, withCaptureCors } from "@/lib/bobo/captures.server";
import { mediaNs } from "@/lib/media/store.server";
import { putThumb } from "@/lib/media/uploads.server";

// An asset's thumbnail / poster frame (JPEG, PNG or WebP ≤ 2 MB, made in the browser).

export const Route = createFileRoute("/api/media/uploads/$id/thumb")({
  server: {
    handlers: {
      // the game's record button uploads from another origin (captures.server.ts)
      OPTIONS: ({ request }) => capturePreflight(request),
      PUT: ({ request, params }) =>
        withCaptureCors(request, putThumb(mediaNs(request), request, params.id)),
    },
  },
});
