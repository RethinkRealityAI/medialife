import { createFileRoute } from "@tanstack/react-router";

import { guard, initUpload, json } from "@/lib/hub/files.server";
import { hubNs } from "@/lib/hub/store.server";

// Creator Hub uploads: POST starts a chunked upload. Contract in src/lib/hub/files.server.ts.

export const Route = createFileRoute("/api/hub/files")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ns = hubNs(request);
        const c = await guard(ns, request);
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
