import { createFileRoute } from "@tanstack/react-router";

import { mediaNs } from "@/lib/media/store.server";
import { initUpload } from "@/lib/media/uploads.server";

// Media Library uploads: POST starts a resumable chunked upload (admin cookie +
// x-media header). Contract in src/lib/media/uploads.server.ts.

export const Route = createFileRoute("/api/media/uploads")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // initUpload checks who is calling before it looks at the body
        const body: unknown = await request.json().catch(() => undefined);
        return initUpload(mediaNs(request), request, body);
      },
    },
  },
});
