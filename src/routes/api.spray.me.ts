import { createFileRoute } from "@tanstack/react-router";

import { isAdminRequest } from "@/lib/ar/auth.server";
import { json } from "@/lib/spray/server";

// Whether this browser is signed in to /admin (the Studio is admin-only for now).

export const Route = createFileRoute("/api/spray/me")({
  server: {
    handlers: {
      GET: async ({ request }) => json({ admin: await isAdminRequest(request) }),
    },
  },
});
