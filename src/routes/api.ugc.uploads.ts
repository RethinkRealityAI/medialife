import { createFileRoute } from "@tanstack/react-router";

import { json, ugcGuard } from "@/lib/ugc/auth.server";
import { ugcNs } from "@/lib/ugc/store.server";
import { initUpload } from "@/lib/ugc/uploads.server";

// UGC Hub uploads: POST starts a chunked upload (a creator's submission, or an
// admin's brief asset). Contract in src/lib/ugc/uploads.server.ts.

export const Route = createFileRoute("/api/ugc/uploads")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ns = ugcNs(request);
        const c = await ugcGuard(ns, request);
        if (c instanceof Response) return c;
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid JSON" }, 400);
        }
        return initUpload(ns, c, body);
      },
    },
  },
});
