import { createFileRoute } from "@tanstack/react-router";

import { capturePreflight, withCaptureCors } from "@/lib/bobo/captures.server";
import { mediaNs } from "@/lib/media/store.server";
import { cancelUpload, uploadStatus } from "@/lib/media/uploads.server";

// GET: which chunks of an upload have arrived (to resume it). DELETE: cancel an unfinished upload.

export const Route = createFileRoute("/api/media/uploads/$id")({
  server: {
    handlers: {
      // the game's record button uploads from another origin (captures.server.ts)
      OPTIONS: ({ request }) => capturePreflight(request),
      GET: ({ request, params }) =>
        withCaptureCors(request, uploadStatus(mediaNs(request), request, params.id)),
      DELETE: ({ request, params }) =>
        withCaptureCors(request, cancelUpload(mediaNs(request), request, params.id)),
    },
  },
});
