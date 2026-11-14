import { createFileRoute } from "@tanstack/react-router";

import { adminRead, json, listCreations } from "@/lib/spray/server";

// Admin: every creation, newest first.

export const Route = createFileRoute("/api/spray/admin/creations")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const deny = await adminRead(request);
        if (deny) return deny;
        return json({ creations: await listCreations(request) });
      },
    },
  },
});
