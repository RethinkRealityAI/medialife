import { createFileRoute } from "@tanstack/react-router";

import { CampaignsPage } from "@/components/ugc/admin/campaigns-page";
import { PageSkeleton } from "@/components/ugc/admin/ui";
import { adminListUgcCampaigns } from "@/lib/ugc/admin.functions";

// /admin/ugc/campaigns: every campaign (live first) with its cover, creators,
// shot list and assets; "New campaign" opens the brief builder.

export const Route = createFileRoute("/admin/ugc/campaigns/")({
  loader: () => adminListUgcCampaigns(),
  head: () => ({ meta: [{ title: "Campaigns · UGC Hub | MEDIALIFE" }] }),
  pendingComponent: () => <PageSkeleton rows={1} />,
  component: CampaignsRoute,
});

function CampaignsRoute() {
  return <CampaignsPage campaigns={Route.useLoaderData()} />;
}
