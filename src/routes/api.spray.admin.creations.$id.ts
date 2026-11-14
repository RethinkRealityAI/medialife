import { createFileRoute } from "@tanstack/react-router";

import { adminWrite, deleteCreation, updateCreation } from "@/lib/spray/server";

// Admin: moderate a creation (PATCH { status: unlisted | featured | hidden, event }) or delete it.

export const Route = createFileRoute("/api/spray/admin/creations/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const deny = await adminWrite(request);
        if (deny) return deny;
        return updateCreation(request, params.id);
      },
      DELETE: async ({ request, params }) => {
        const deny = await adminWrite(request);
        if (deny) return deny;
        return deleteCreation(request, params.id);
      },
    },
  },
});
