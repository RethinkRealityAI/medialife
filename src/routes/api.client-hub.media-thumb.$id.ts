import { createFileRoute } from "@tanstack/react-router";

import { clientMayOpen } from "@/lib/client/content.server";
import { viewerForRequest } from "@/lib/client/session.server";
import { mediaNs } from "@/lib/media/store.server";
import { serveScoped } from "@/lib/media/uploads.server";

// A Media Library thumbnail for the Client Hub (same rules as the file).

export const Route = createFileRoute("/api/client-hub/media-thumb/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const v = await viewerForRequest(request);
        if (!v) return Response.json({ error: "unauthorized" }, { status: 401 });
        return serveScoped(
          mediaNs(request),
          request,
          params.id,
          (a) => clientMayOpen(a, v.client),
          "thumb",
        );
      },
    },
  },
});
