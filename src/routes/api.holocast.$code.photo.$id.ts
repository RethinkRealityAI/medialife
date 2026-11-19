import { createFileRoute } from "@tanstack/react-router";

import { getPhoto } from "@/lib/holocast/server";

// MEDIALIFE Holocast: a dropped photo's bytes.

export const Route = createFileRoute("/api/holocast/$code/photo/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => getPhoto(request, params.code, params.id),
    },
  },
});
