import { createFileRoute } from "@tanstack/react-router";

import { handleShowcase } from "@/lib/media/showcase.server";
import { mediaNs } from "@/lib/media/store.server";

// Public: Media Library videos picked for the interaction cards. See
// src/lib/media/showcase.server.ts for the rule (public + "Showcase" tag + name).

export const Route = createFileRoute("/api/showcase.json")({
  server: {
    handlers: {
      GET: ({ request }) => handleShowcase(mediaNs(request)),
    },
  },
});
