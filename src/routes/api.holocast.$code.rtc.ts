import { createFileRoute } from "@tanstack/react-router";

import { getRtc, postRtc } from "@/lib/holocast/server";

// MEDIALIFE Holocast: WebRTC signalling for the control room's live camera (offer / answer, polled).

export const Route = createFileRoute("/api/holocast/$code/rtc")({
  server: {
    handlers: {
      GET: ({ request, params }) => getRtc(request, params.code),
      POST: ({ request, params }) => postRtc(request, params.code),
    },
  },
});
