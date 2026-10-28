import { createFileRoute } from "@tanstack/react-router";

import { ugcCaller } from "@/lib/ugc/auth.server";
import { ugcNs } from "@/lib/ugc/store.server";
import { serveAsset } from "@/lib/ugc/uploads.server";

// A brief asset: readable by the team and by creators on that (published) campaign. Honours Range.

export const Route = createFileRoute("/api/ugc/files/assets/$campaignId/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const ns = ugcNs(request);
        return serveAsset(ns, await ugcCaller(ns, request), params.campaignId, params.id, {
          download: new URL(request.url).searchParams.get("download") === "1",
          head: false,
          range: request.headers.get("range"),
        });
      },
      HEAD: async ({ request, params }) => {
        const ns = ugcNs(request);
        return serveAsset(ns, await ugcCaller(ns, request), params.campaignId, params.id, {
          download: false,
          head: true,
          range: request.headers.get("range"),
        });
      },
    },
  },
});
