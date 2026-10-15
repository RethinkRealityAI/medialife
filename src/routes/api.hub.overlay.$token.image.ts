import { createFileRoute } from "@tanstack/react-router";

import { fileResponse } from "@/lib/hub/files.server";
import { overlayImage } from "@/lib/hub/overlay.server";
import { hubNs } from "@/lib/hub/store.server";

// The overlay product's hero image. OBS has no hub cookie, so the overlay token
// stands in for it — for this one image only.

export const Route = createFileRoute("/api/hub/overlay/$token/image")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const ns = hubNs(request);
        const file = await overlayImage(ns, params.token);
        if (!file) return new Response(null, { status: 404 });
        return fileResponse(ns, { kind: "admin" }, file.creatorId, file.id, false);
      },
    },
  },
});
