import { createFileRoute } from "@tanstack/react-router";

import { mediaNs } from "@/lib/media/store.server";
import { putThumb } from "@/lib/media/uploads.server";

// An asset's thumbnail / poster frame (JPEG, PNG or WebP ≤ 2 MB, made in the browser).

export const Route = createFileRoute("/api/media/uploads/$id/thumb")({
  server: {
    handlers: {
      PUT: ({ request, params }) => putThumb(mediaNs(request), request, params.id),
    },
  },
});
