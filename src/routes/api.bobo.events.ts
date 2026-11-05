import { createFileRoute } from "@tanstack/react-router";

import { namespaceFromRequest } from "@/lib/ar/store.server";
import { handleEvents, handleEventsPreflight } from "@/lib/bobo/events.server";

// AR experience / Cola Run events for "Where is Bobo?". Bearer BOBO_INGEST_TOKEN
// (servers) or an allowed Origin (the game in a browser). Contract in
// src/lib/bobo/events.server.ts and the README.

export const Route = createFileRoute("/api/bobo/events")({
  server: {
    handlers: {
      POST: ({ request }) => handleEvents(namespaceFromRequest(request), request),
      OPTIONS: ({ request }) => handleEventsPreflight(namespaceFromRequest(request), request),
    },
  },
});
