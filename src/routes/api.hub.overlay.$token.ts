import { createFileRoute } from "@tanstack/react-router";

import { publicOrigin } from "@/lib/hub/auth.server";
import { overlayFeed } from "@/lib/hub/overlay.server";
import { hubNs } from "@/lib/hub/store.server";

// The Live Drop overlay's feed (polled every few seconds by /overlay/<token>).
// The token is the credential; see src/lib/hub/overlay.server.ts for what is
// and isn't exposed.

export const Route = createFileRoute("/api/hub/overlay/$token")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const ns = hubNs(request);
        const feed = await overlayFeed(ns, params.token, publicOrigin(request, ns));
        const headers = { "cache-control": "no-store", "x-robots-tag": "noindex" };
        return Response.json(feed, { headers });
      },
    },
  },
});
