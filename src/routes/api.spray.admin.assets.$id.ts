import { createFileRoute } from "@tanstack/react-router";

import { adminWrite, deleteAsset, renameAsset } from "@/lib/spray/server";

// Admin: rename a library asset (PATCH { name }) or delete it (DELETE; 409 with usedOn while a scene
// uses it, unless ?force=1, which also takes it out of those scenes).

export const Route = createFileRoute("/api/spray/admin/assets/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const deny = await adminWrite(request);
        if (deny) return deny;
        return renameAsset(request, params.id);
      },
      DELETE: async ({ request, params }) => {
        const deny = await adminWrite(request);
        if (deny) return deny;
        return deleteAsset(
          request,
          params.id,
          new URL(request.url).searchParams.get("force") === "1",
        );
      },
    },
  },
});
