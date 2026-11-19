import { createFileRoute } from "@tanstack/react-router";

import { getPaintable, json, withTargetData } from "@/lib/spray/server";

// One paintable by id, drafts included: ids are unguessable, and a phone joining a Studio room (or the
// AR camera preview) needs the draft the team is trying before it goes live.

export const Route = createFileRoute("/api/spray/sets/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const p = await getPaintable(request, params.id);
        if (!p) return json({ error: "not found" }, 404);
        return json({ set: withTargetData(p) }, 200, { "cache-control": "public, max-age=30" });
      },
    },
  },
});
