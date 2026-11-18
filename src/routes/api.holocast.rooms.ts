import { createFileRoute } from "@tanstack/react-router";

import { createRoom } from "@/lib/holocast/server";

// MEDIALIFE Holocast: make a new hologram room (code + write key). See src/lib/holocast/server.ts.

export const Route = createFileRoute("/api/holocast/rooms")({
  server: {
    handlers: {
      POST: ({ request }) => createRoom(request),
    },
  },
});
