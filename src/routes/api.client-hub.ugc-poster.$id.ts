import { createFileRoute } from "@tanstack/react-router";

import { clientMaySeeSubmission } from "@/lib/client/content.server";
import { viewerForRequest } from "@/lib/client/session.server";
import { ugcNs } from "@/lib/ugc/store.server";
import { servePoster } from "@/lib/ugc/uploads.server";

// A creator video's poster frame for the Client Hub.

export const Route = createFileRoute("/api/client-hub/ugc-poster/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const v = await viewerForRequest(request);
        if (!v) return Response.json({ error: "unauthorized" }, { status: 401 });
        const ns = ugcNs(request);
        if (!v.client.features.ugc || !(await clientMaySeeSubmission(ns, params.id)))
          return Response.json({ error: "not found" }, { status: 404 });
        return servePoster(ns, { kind: "admin" }, params.id);
      },
    },
  },
});
