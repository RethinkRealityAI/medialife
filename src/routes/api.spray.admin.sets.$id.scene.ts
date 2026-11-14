import { createFileRoute } from "@tanstack/react-router";

import { adminWrite, saveScene } from "@/lib/spray/server";

// Admin: save the things placed around a paintable's print (PUT JSON { scene, heightMm? }).
// Built-in charms too: their scene is stored beside the code record.

export const Route = createFileRoute("/api/spray/admin/sets/$id/scene")({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        const deny = await adminWrite(request);
        if (deny) return deny;
        return saveScene(request, params.id);
      },
    },
  },
});
