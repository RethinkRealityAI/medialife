import { createFileRoute } from "@tanstack/react-router";

import { mediaNs } from "@/lib/media/store.server";
import { cancelUpload, uploadStatus } from "@/lib/media/uploads.server";

// GET: which chunks of an upload have arrived (to resume it). DELETE: cancel an unfinished upload.

export const Route = createFileRoute("/api/media/uploads/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => uploadStatus(mediaNs(request), request, params.id),
      DELETE: ({ request, params }) => cancelUpload(mediaNs(request), request, params.id),
    },
  },
});
