import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { SprayAdmin } from "@/components/spray/spray-admin";

// /admin/spray: the Spray Bobo CMS (paintables + creations). The tab lives in the URL.

export const Route = createFileRoute("/admin/spray")({
  validateSearch: z.object({ tab: z.enum(["paintables", "creations"]).optional() }),
  head: () => ({ meta: [{ title: "Spray Bobo | MEDIALIFE" }] }),
  component: SprayPage,
});

function SprayPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <SprayAdmin
      tab={tab ?? "paintables"}
      onTab={(t) =>
        void navigate({ search: { tab: t === "paintables" ? undefined : t }, replace: true })
      }
    />
  );
}
