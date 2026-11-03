import { createFileRoute } from "@tanstack/react-router";

import { json, writeGuard } from "@/lib/media/auth.server";
import { seedMediaSample } from "@/lib/media/sample.server";
import { mediaNs } from "@/lib/media/store.server";

// Loads the Media Library sample (the real EVADE art, product shots and GLBs
// from the repo, plus two labelled placeholder clips) on localhost and deploy
// previews. Admin-only; production refuses. ?reset=1 replaces it.

export const Route = createFileRoute("/api/media/dev/seed")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ns = mediaNs(request);
        if (ns === "prod") return json({ error: "not available in production" }, 404);
        const denied = await writeGuard(request);
        if (denied) return denied;
        const reset = new URL(request.url).searchParams.get("reset") === "1";
        return json(await seedMediaSample(ns, { reset }));
      },
    },
  },
});
