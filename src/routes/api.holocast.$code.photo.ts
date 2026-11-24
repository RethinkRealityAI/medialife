import { createFileRoute } from "@tanstack/react-router";

import { postPhoto } from "@/lib/holocast/server";

// MEDIALIFE Holocast: drop a photo into the hologram (raw image body, x-holo-key header).

export const Route = createFileRoute("/api/holocast/$code/photo")({
  server: {
    handlers: {
      POST: ({ request, params }) => postPhoto(request, params.code),
    },
  },
});
