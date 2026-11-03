import { createFileRoute } from "@tanstack/react-router";

import { mediaNs } from "@/lib/media/store.server";
import { completeUpload } from "@/lib/media/uploads.server";

// Finishes an upload once every chunk has arrived (magic-byte check, dimensions fallback).

export const Route = createFileRoute("/api/media/uploads/$id/complete")({
  server: {
    handlers: {
      POST: ({ request, params }) => completeUpload(mediaNs(request), request, params.id),
    },
  },
});
