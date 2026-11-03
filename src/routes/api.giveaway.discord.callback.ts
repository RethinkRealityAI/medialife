import { createFileRoute } from "@tanstack/react-router";

import { finishGiveawayDiscord } from "@/lib/giveaway/discord.server";
import { gwNs } from "@/lib/giveaway/store.server";

// Discord sends people back here; we check the server membership and return to the campaign page.

export const Route = createFileRoute("/api/giveaway/discord/callback")({
  server: {
    handlers: {
      GET: ({ request }) => finishGiveawayDiscord(request, gwNs(request)),
    },
  },
});
