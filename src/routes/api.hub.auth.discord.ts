import { createFileRoute } from "@tanstack/react-router";

import { startDiscord } from "@/lib/hub/discord.server";
import { hubNs } from "@/lib/hub/store.server";

// Starts "Continue with Discord": ?next=<hub path>, ?mode=link to connect Discord
// to the signed-in account, ?invite=<code> to keep an agency invite on sign-up.

export const Route = createFileRoute("/api/hub/auth/discord")({
  server: {
    handlers: {
      GET: ({ request }) => startDiscord(request, hubNs(request)),
    },
  },
});
