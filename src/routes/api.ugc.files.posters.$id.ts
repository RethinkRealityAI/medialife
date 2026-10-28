import { createFileRoute } from "@tanstack/react-router";

import { ugcCaller } from "@/lib/ugc/auth.server";
import { ugcNs } from "@/lib/ugc/store.server";
import { servePoster } from "@/lib/ugc/uploads.server";

// A submission's poster frame: readable by that creator and the team only.

export const Route = createFileRoute("/api/ugc/files/posters/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const ns = ugcNs(request);
        return servePoster(ns, await ugcCaller(ns, request), params.id);
      },
    },
  },
});
