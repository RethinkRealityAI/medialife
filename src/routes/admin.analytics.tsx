import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AnalyticsDashboard, type AnalyticsSearch } from "@/components/admin/analytics/dashboard";

// /admin/analytics: first-party analytics for the activated-retail demos.
// Filters live in the URL so a view can be shared with the team.

const searchSchema = z.object({
  range: z.enum(["today", "7d", "30d", "90d"]).optional().catch(undefined),
  demo: z.string().max(80).optional().catch(undefined),
  client: z.string().max(120).optional().catch(undefined),
  s: z.string().max(80).optional().catch(undefined),
});

export const Route = createFileRoute("/admin/analytics")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Analytics · Activated Retail | MEDIALIFE" }] }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <AnalyticsDashboard
      search={search}
      onSearch={(patch: Partial<AnalyticsSearch>) =>
        void navigate({
          search: (prev) => ({ ...prev, ...patch }),
          replace: typeof patch.s !== "string",
          resetScroll: false,
        })
      }
    />
  );
}
