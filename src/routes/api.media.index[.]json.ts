import { createFileRoute } from "@tanstack/react-router";

import { handleIndexJson } from "@/lib/media/catalog.server";
import { mediaNs } from "@/lib/media/store.server";

// The Media Library catalogue as JSON, for agents and LLMs. Admin cookie or
// `Authorization: Bearer $MEDIA_API_TOKEN` (read-only); 401 otherwise.
// Filters and record shape: src/lib/media/catalog.server.ts and the README.

export const Route = createFileRoute("/api/media/index.json")({
  server: {
    handlers: {
      GET: ({ request }) => handleIndexJson(mediaNs(request), request),
    },
  },
});
