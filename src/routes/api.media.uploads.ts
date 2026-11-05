import { createFileRoute } from "@tanstack/react-router";

import { capturePreflight, withCaptureCors } from "@/lib/bobo/captures.server";
import { mediaNs } from "@/lib/media/store.server";
import { initUpload } from "@/lib/media/uploads.server";

// Media Library uploads: POST starts a resumable chunked upload (admin cookie +
// x-media header). Contract in src/lib/media/uploads.server.ts.

export const Route = createFileRoute("/api/media/uploads")({
  server: {
    handlers: {
      // the game's record button uploads from another origin (captures.server.ts)
      OPTIONS: ({ request }) => capturePreflight(request),
      POST: async ({ request }) => {
        // initUpload checks who is calling before it looks at the body
        const body: unknown = await request.json().catch(() => undefined);
        return withCaptureCors(request, initUpload(mediaNs(request), request, body));
      },
    },
  },
});
