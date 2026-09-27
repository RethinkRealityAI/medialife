import { createFileRoute } from "@tanstack/react-router";

import { assetResponse } from "@/lib/ar/assets.server";
import { namespaceFromRequest } from "@/lib/ar/store.server";

// Public: an uploaded builder asset (model, image, AR file), streamed chunk by
// chunk. No cookies needed and CORS is open, so Scene Viewer, Quick Look and
// other viewers can fetch it. Ids are never reused, so responses cache for a year.

export const Route = createFileRoute("/api/ar/asset/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        assetResponse(namespaceFromRequest(request), params.id, request),
      HEAD: ({ request, params }) =>
        assetResponse(namespaceFromRequest(request), params.id, request, true),
      OPTIONS: () =>
        new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET, HEAD, OPTIONS",
            "access-control-allow-headers": "range, if-none-match",
            "access-control-max-age": "86400",
          },
        }),
    },
  },
});
