import { createFileRoute } from "@tanstack/react-router";

import { getFrame, postFrame } from "@/lib/holocast/server";

// MEDIALIFE Holocast: the live feed's JPEG relay (for phones that can't make a direct WebRTC connection).

export const Route = createFileRoute("/api/holocast/$code/frame")({
  server: {
    handlers: {
      GET: ({ request, params }) => getFrame(request, params.code),
      POST: ({ request, params }) => postFrame(request, params.code),
    },
  },
});
