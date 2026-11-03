import { createFileRoute } from "@tanstack/react-router";

import { mediaNs } from "@/lib/media/store.server";
import { serveThumb } from "@/lib/media/uploads.server";

// An asset's thumbnail: open for public assets, otherwise admin cookie or token.

export const Route = createFileRoute("/api/media/thumbs/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => serveThumb(mediaNs(request), request, params.id),
    },
  },
});
