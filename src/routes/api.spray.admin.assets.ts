import { createFileRoute } from "@tanstack/react-router";

import { adminRead, adminWrite, createAsset, listAssets } from "@/lib/spray/server";

// Admin: the shared asset library (models, pictures, video any piece of merch can use).
// GET lists it ({ assets, max }); POST (multipart) makes the record for a finished upload. See
// createAsset(); the file itself goes up in pieces through /api/spray/admin/assets/upload.

export const Route = createFileRoute("/api/spray/admin/assets")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const deny = await adminRead(request);
        if (deny) return deny;
        return listAssets(request);
      },
      POST: async ({ request }) => {
        const deny = await adminWrite(request);
        if (deny) return deny;
        return createAsset(request);
      },
    },
  },
});
