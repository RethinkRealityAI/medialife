import { createFileRoute } from "@tanstack/react-router";

import { isClientAsset } from "@/lib/client/content.server";
import { viewerForRequest } from "@/lib/client/session.server";
import { mediaNs } from "@/lib/media/store.server";
import { serveScoped } from "@/lib/media/uploads.server";

// A Media Library file for the Client Hub: only files of the viewer's own client
// that the team hasn't hidden. Honours Range.

async function handle(request: Request, id: string) {
  const v = await viewerForRequest(request);
  if (!v) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!v.client.features.videos && !v.client.features.files)
    return Response.json({ error: "not found" }, { status: 404 });
  return serveScoped(mediaNs(request), request, id, (a) => isClientAsset(a, v.client), "file");
}

export const Route = createFileRoute("/api/client-hub/media/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => handle(request, params.id),
      HEAD: ({ request, params }) => handle(request, params.id),
    },
  },
});
