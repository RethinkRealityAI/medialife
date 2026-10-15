import { createFileRoute } from "@tanstack/react-router";

import { finishDiscord } from "@/lib/hub/discord.server";
import { hubNs } from "@/lib/hub/store.server";

// Discord sends the creator back here after they approve (or cancel) sign-in.

export const Route = createFileRoute("/api/hub/auth/discord/callback")({
  server: {
    handlers: {
      GET: ({ request }) => finishDiscord(request, hubNs(request)),
    },
  },
});
