import { createFileRoute } from "@tanstack/react-router";

import { json } from "@/lib/spray/server";

// Where the Spray Studio's rooms (studio <-> phones as spray cans) connect: a Supabase project's URL and
// its publishable (browser) key, from the site's environment. Public on purpose: phones that join a room
// are not signed in, and a publishable key is made to be shipped to browsers. Realtime broadcast uses no
// tables. Not set: the Studio still paints, phones just can't join.

export const Route = createFileRoute("/api/spray/realtime")({
  server: {
    handlers: {
      GET: async () =>
        json({
          url: process.env.SPRAY_SUPABASE_URL || null,
          key: process.env.SPRAY_SUPABASE_KEY || null,
        }),
    },
  },
});
