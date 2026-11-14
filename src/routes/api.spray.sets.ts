import { createFileRoute } from "@tanstack/react-router";

import { isAdminRequest } from "@/lib/ar/auth.server";
import { json, listPaintables, withTargetData } from "@/lib/spray/server";

// Spray Bobo paintables, with their 8th Wall image-target data. Public: live ones only.
// Admins with ?all=1 also get drafts (the Studio's camera preview of a draft).

export const Route = createFileRoute("/api/spray/sets")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const all = new URL(request.url).searchParams.get("all") === "1" && (await isAdminRequest(request));
        const sets = (await listPaintables(request, all)).map(withTargetData);
        return json({ sets }, 200, { "cache-control": all ? "no-store" : "public, max-age=30" });
      },
    },
  },
});
