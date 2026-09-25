import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { LinksPage } from "@/components/admin/links/links-page";

// /admin/links: personal demo links per client. ?demo=<id> preselects the demo
// (the endcap builder links here as /admin/links?demo=x:<slug>).

export const Route = createFileRoute("/admin/links")({
  validateSearch: z.object({
    demo: z
      .string()
      .regex(/^[a-z0-9:_-]{1,64}$/)
      .optional()
      .catch(undefined),
  }),
  head: () => ({ meta: [{ title: "Client links · Activated Retail | MEDIALIFE" }] }),
  component: LinksRoute,
});

function LinksRoute() {
  const { demo } = Route.useSearch();
  return <LinksPage initialDemo={demo} />;
}
