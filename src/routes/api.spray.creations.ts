import { createFileRoute } from "@tanstack/react-router";

import { adminWrite, createCreation } from "@/lib/spray/server";

// Save a painting and get its share link. Admin-only for now (the Studio is admin-only); a public
// route for the AR page comes with Fan Pass.

export const Route = createFileRoute("/api/spray/creations")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const deny = await adminWrite(request);
        if (deny) return deny;
        return createCreation(request);
      },
    },
  },
});
