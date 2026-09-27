import { createFileRoute } from "@tanstack/react-router";

import { adminGuard, deleteAsset, json, readAsset } from "@/lib/ar/assets.server";
import { namespaceFromRequest } from "@/lib/ar/store.server";

// Admin: one library file. DELETE refuses (409, with the projects using it)
// unless ?force=1, so the UI can warn before breaking an endcap.

export const Route = createFileRoute("/api/ar/admin/assets/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const deny = await adminGuard(request);
        if (deny) return deny;
        const meta = await readAsset(namespaceFromRequest(request), params.id);
        return meta ? json(meta) : json({ error: "not found" }, 404);
      },
      DELETE: async ({ request, params }) => {
        const deny = await adminGuard(request);
        if (deny) return deny;
        const force = new URL(request.url).searchParams.get("force") === "1";
        const r = await deleteAsset(namespaceFromRequest(request), params.id, force);
        if (r.ok) return new Response(null, { status: 204 });
        return json(r.error === "in-use" && "usedBy" in r ? r : { error: r.error }, r.status);
      },
    },
  },
});
