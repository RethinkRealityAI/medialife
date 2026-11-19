import { createFileRoute } from "@tanstack/react-router";

import { reportCreation } from "@/lib/spray/server";

// Public: report a creation. A few separate reports take the link down until the team reviews it.

export const Route = createFileRoute("/api/spray/creations/$id/report")({
  server: {
    handlers: {
      POST: ({ request, params }) => reportCreation(request, params.id),
    },
  },
});
