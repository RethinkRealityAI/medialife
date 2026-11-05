import { createFileRoute } from "@tanstack/react-router";

import { capturePreflight, withCaptureCors } from "@/lib/bobo/captures.server";
import { mediaNs } from "@/lib/media/store.server";
import { completeUpload } from "@/lib/media/uploads.server";

// Finishes an upload once every chunk has arrived (magic-byte check, dimensions fallback).

export const Route = createFileRoute("/api/media/uploads/$id/complete")({
  server: {
    handlers: {
      // the game's record button uploads from another origin (captures.server.ts)
      OPTIONS: ({ request }) => capturePreflight(request),
      POST: ({ request, params }) =>
        withCaptureCors(request, completeUpload(mediaNs(request), request, params.id)),
    },
  },
});
