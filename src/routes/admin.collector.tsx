import { createFileRoute } from "@tanstack/react-router";

import { CollectorPage } from "@/components/admin/collector/collector-page";

// /admin/collector: Collector Hub alerts and unlock-code batches.

export const Route = createFileRoute("/admin/collector")({
  head: () => ({ meta: [{ title: "Collector Hub | MEDIALIFE" }] }),
  component: CollectorPage,
});
