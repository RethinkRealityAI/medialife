import { createFileRoute } from "@tanstack/react-router";

import { adminWrite, uploadLibraryPiece } from "@/lib/spray/server";

// Admin: upload a library file in ≤4 MB pieces (POST multipart: file, kind, size, part, upload).
// Same answers as the scene upload, with `upload` (the file's name) instead of `file` when done.

export const Route = createFileRoute("/api/spray/admin/assets/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const deny = await adminWrite(request);
        if (deny) return deny;
        return uploadLibraryPiece(request);
      },
    },
  },
});
