import { createFileRoute } from "@tanstack/react-router";

import { serveSetFile } from "@/lib/spray/server";

// Public files of a Spray Bobo paintable: tracking pictures, canvas overlay, outline, thumbnail.

export const Route = createFileRoute("/api/spray/file/$")({
  server: {
    handlers: {
      GET: ({ request, params }) => serveSetFile(request, params._splat ?? ""),
    },
  },
});
