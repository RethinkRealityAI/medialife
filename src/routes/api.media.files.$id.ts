import { createFileRoute } from "@tanstack/react-router";

import { mediaNs } from "@/lib/media/store.server";
import { serveFile } from "@/lib/media/uploads.server";

// An asset's file for the team (admin cookie) or a read-only token holder. Honours Range.

export const Route = createFileRoute("/api/media/files/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => serveFile(mediaNs(request), request, params.id),
      HEAD: ({ request, params }) => serveFile(mediaNs(request), request, params.id),
    },
  },
});
