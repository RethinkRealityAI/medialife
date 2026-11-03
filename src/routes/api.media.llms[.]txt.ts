import { createFileRoute } from "@tanstack/react-router";

import { handleLlmsTxt } from "@/lib/media/catalog.server";
import { mediaNs } from "@/lib/media/store.server";

// The Media Library catalogue as Markdown (same filters as index.json).
// Admin cookie or `Authorization: Bearer $MEDIA_API_TOKEN` (read-only).

export const Route = createFileRoute("/api/media/llms.txt")({
  server: {
    handlers: {
      GET: ({ request }) => handleLlmsTxt(mediaNs(request), request),
    },
  },
});
