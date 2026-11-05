import { createFileRoute } from "@tanstack/react-router";

import { isAdminRequest } from "@/lib/ar/auth.server";
import { hasIngestToken } from "@/lib/bobo/events.server";
import { searchPlaces } from "@/lib/bobo/geo.server";

// City search for the Media Library's location picker (and the AR team's
// tooling): GET /api/bobo/places?q=lagos. Admin cookie or the ingest token.

export const Route = createFileRoute("/api/bobo/places")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAdminRequest(request)) && !hasIngestToken(request))
          return Response.json({ error: "unauthorized" }, { status: 401 });
        const q = new URL(request.url).searchParams.get("q")?.slice(0, 80) ?? "";
        const places = await searchPlaces(q, 8);
        return Response.json({ places }, { headers: { "cache-control": "private, max-age=3600" } });
      },
    },
  },
});
