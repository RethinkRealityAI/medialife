import { createFileRoute } from "@tanstack/react-router";

import { publicProject } from "@/lib/ar/project";
import { readProject } from "@/lib/ar/projects.server";
import { namespaceFromRequest } from "@/lib/ar/store.server";

// Public: the published version of a builder endcap, without admin-only fields
// (the plain password never leaves the server; only its gate hash does).

export const Route = createFileRoute("/api/ar/project/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const doc = await readProject(namespaceFromRequest(request), params.slug);
        if (!doc?.published) {
          return Response.json(
            { error: "not found" },
            { status: 404, headers: { "cache-control": "no-store" } },
          );
        }
        return Response.json(publicProject(doc.published), {
          headers: {
            "cache-control": "public, max-age=0, must-revalidate",
            "netlify-cdn-cache-control": "public, max-age=60, stale-while-revalidate=600",
            "access-control-allow-origin": "*",
          },
        });
      },
    },
  },
});
