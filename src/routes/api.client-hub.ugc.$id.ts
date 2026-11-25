import { createFileRoute } from "@tanstack/react-router";

import { clientMaySeeSubmission } from "@/lib/client/content.server";
import { viewerForRequest } from "@/lib/client/session.server";
import { ugcNs } from "@/lib/ugc/store.server";
import { serveSubmission } from "@/lib/ugc/uploads.server";

// A creator's video or photo for the Client Hub (UGC switched on for the client). Honours Range.

async function handle(request: Request, id: string, head: boolean) {
  const v = await viewerForRequest(request);
  if (!v) return Response.json({ error: "unauthorized" }, { status: 401 });
  const ns = ugcNs(request);
  if (!v.client.features.ugc || !(await clientMaySeeSubmission(ns, id)))
    return Response.json({ error: "not found" }, { status: 404 });
  // The viewer is checked above; the UGC store serves it as it would for the team.
  return serveSubmission(ns, { kind: "admin" }, id, {
    download: new URL(request.url).searchParams.get("download") === "1",
    head,
    range: request.headers.get("range"),
  });
}

export const Route = createFileRoute("/api/client-hub/ugc/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => handle(request, params.id, false),
      HEAD: ({ request, params }) => handle(request, params.id, true),
    },
  },
});
