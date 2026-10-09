import { createFileRoute } from "@tanstack/react-router";

import { caller, deleteFile, fileResponse, guard } from "@/lib/hub/files.server";
import { hubNs } from "@/lib/hub/store.server";

// A Creator Hub file: readable by its creator and the team, never public.

export const Route = createFileRoute("/api/hub/files/$creatorId/$fileId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const ns = hubNs(request);
        const download = new URL(request.url).searchParams.get("download") === "1";
        return fileResponse(
          ns,
          await caller(ns, request),
          params.creatorId,
          params.fileId,
          download,
        );
      },
      HEAD: async ({ request, params }) => {
        const ns = hubNs(request);
        return fileResponse(
          ns,
          await caller(ns, request),
          params.creatorId,
          params.fileId,
          false,
          true,
        );
      },
      DELETE: async ({ request, params }) => {
        const ns = hubNs(request);
        const c = await guard(ns, request);
        if (c instanceof Response) return c;
        return deleteFile(ns, c, params.creatorId, params.fileId);
      },
    },
  },
});
