import { createFileRoute } from "@tanstack/react-router";

import { publicCreation } from "@/lib/spray/server";

// Public: one creation by its share link (unless taken down), with its paintable.

export const Route = createFileRoute("/api/spray/creations/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => publicCreation(request, params.id),
    },
  },
});
