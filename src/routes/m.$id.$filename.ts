import { createFileRoute } from "@tanstack/react-router";

import { mediaNs } from "@/lib/media/store.server";
import { servePublic } from "@/lib/media/uploads.server";

// /m/<id>/<filename>: a Media Library file marked Public. No auth, cacheable,
// Range-capable (so <video> streams), CORS open. The file name is cosmetic:
// the id finds the file, so renaming never breaks an embed. Private or missing
// assets are a plain 404.

export const Route = createFileRoute("/m/$id/$filename")({
  server: {
    handlers: {
      GET: ({ request, params }) => servePublic(mediaNs(request), request, params.id),
      HEAD: ({ request, params }) => servePublic(mediaNs(request), request, params.id),
    },
  },
});
