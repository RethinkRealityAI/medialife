import { createFileRoute } from "@tanstack/react-router";

import { startGiveawayDiscord } from "@/lib/giveaway/discord.server";
import { gwNs } from "@/lib/giveaway/store.server";

// Starts the "Join our Discord" check for a giveaway task: ?slug=<campaign>&task=<task id>.

export const Route = createFileRoute("/api/giveaway/discord")({
  server: {
    handlers: {
      GET: ({ request }) => startGiveawayDiscord(request, gwNs(request)),
    },
  },
});
