import { createFileRoute } from "@tanstack/react-router";

import { getRoom, postRoom } from "@/lib/holocast/server";

// MEDIALIFE Holocast room: GET the hologram's live state, POST a change (notice, stroke, theme, reaction...).

export const Route = createFileRoute("/api/holocast/$code")({
  server: {
    handlers: {
      GET: ({ request, params }) => getRoom(request, params.code),
      POST: ({ request, params }) => postRoom(request, params.code),
    },
  },
});
