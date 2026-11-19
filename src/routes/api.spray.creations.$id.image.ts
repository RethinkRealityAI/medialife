import { createFileRoute } from "@tanstack/react-router";

import { creationImage } from "@/lib/spray/server";

// Public: a creation's paint layer (768x1024 PNG), unless taken down.

export const Route = createFileRoute("/api/spray/creations/$id/image")({
  server: {
    handlers: {
      GET: ({ request, params }) => creationImage(request, params.id),
    },
  },
});
