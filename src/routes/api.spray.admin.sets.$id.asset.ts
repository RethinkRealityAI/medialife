import { createFileRoute } from "@tanstack/react-router";

import { adminWrite, uploadSceneAsset } from "@/lib/spray/server";

// Admin: upload a scene file (GLB model, PNG/JPEG/WebP picture, MP4 video) in ≤4 MB pieces
// (POST multipart: file, kind, size, part, upload). See uploadSceneAsset().

export const Route = createFileRoute("/api/spray/admin/sets/$id/asset")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const deny = await adminWrite(request);
        if (deny) return deny;
        return uploadSceneAsset(request, params.id);
      },
    },
  },
});
