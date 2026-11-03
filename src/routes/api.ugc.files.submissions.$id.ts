import { createFileRoute } from "@tanstack/react-router";

import { ugcCaller } from "@/lib/ugc/auth.server";
import { ugcNs } from "@/lib/ugc/store.server";
import { serveSubmission } from "@/lib/ugc/uploads.server";

// A creator's uploaded video or photo: readable by that creator and the team only. Honours Range.

export const Route = createFileRoute("/api/ugc/files/submissions/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const ns = ugcNs(request);
        return serveSubmission(ns, await ugcCaller(ns, request), params.id, {
          download: new URL(request.url).searchParams.get("download") === "1",
          head: false,
          range: request.headers.get("range"),
        });
      },
      HEAD: async ({ request, params }) => {
        const ns = ugcNs(request);
        return serveSubmission(ns, await ugcCaller(ns, request), params.id, {
          download: false,
          head: true,
          range: request.headers.get("range"),
        });
      },
    },
  },
});
