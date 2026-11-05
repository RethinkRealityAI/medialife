import { createFileRoute } from "@tanstack/react-router";

import { mediaNs } from "@/lib/media/store.server";
import { serveOwnClip } from "@/lib/media/uploads.server";

// The player's own game clip, opened with the view key the record button got
// at upload (?k=…): JSON, or as=file (Range) / as=poster. Lets the sender watch
// their clip on the globe before the team has reviewed it.

export const Route = createFileRoute("/api/bobo/clips/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => serveOwnClip(mediaNs(request), request, params.id),
      HEAD: ({ request, params }) => serveOwnClip(mediaNs(request), request, params.id),
    },
  },
});
