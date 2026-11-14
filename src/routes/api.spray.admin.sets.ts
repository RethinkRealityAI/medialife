import { createFileRoute } from "@tanstack/react-router";

import {
  adminRead,
  adminWrite,
  json,
  listPaintables,
  savePaintable,
  withTargetData,
} from "@/lib/spray/server";

// Admin: every paintable (drafts too); POST creates one from the admin page's converted pictures.

export const Route = createFileRoute("/api/spray/admin/sets")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const deny = await adminRead(request);
        if (deny) return deny;
        return json({ sets: (await listPaintables(request, true)).map(withTargetData) });
      },
      POST: async ({ request }) => {
        const deny = await adminWrite(request);
        if (deny) return deny;
        return savePaintable(request, null);
      },
    },
  },
});
