import { createFileRoute } from "@tanstack/react-router";

import { adminWrite, deletePaintable, json, savePaintable, setPaintableStatus } from "@/lib/spray/server";

// Admin: update a paintable (POST multipart, same fields as create), publish/unpublish (PATCH
// { status }), or delete it (DELETE; refused while it has creations).

export const Route = createFileRoute("/api/spray/admin/sets/$id")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const deny = await adminWrite(request);
        if (deny) return deny;
        return savePaintable(request, params.id);
      },
      PATCH: async ({ request, params }) => {
        const deny = await adminWrite(request);
        if (deny) return deny;
        let body: { status?: string };
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid JSON" }, 400);
        }
        return setPaintableStatus(request, params.id, String(body.status ?? ""));
      },
      DELETE: async ({ request, params }) => {
        const deny = await adminWrite(request);
        if (deny) return deny;
        return deletePaintable(request, params.id);
      },
    },
  },
});
