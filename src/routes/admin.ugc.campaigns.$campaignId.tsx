import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";
import { z } from "zod";

import { EmptyState } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { CAMPAIGN_TABS, CampaignEditor } from "@/components/ugc/admin/campaign-editor";
import { PageSkeleton } from "@/components/ugc/admin/ui";
import { adminGetUgcCampaign, adminUgcPipeline } from "@/lib/ugc/admin.functions";

// /admin/ugc/campaigns/:id: the brief builder. Basics, messaging, shot list,
// how-to card and disclosure with a live creator-eye preview; the asset
// library (chunked uploads); assigned creators; draft / live / closed with
// "notify creators" on publish. ?tab= keeps the tab.

export const Route = createFileRoute("/admin/ugc/campaigns/$campaignId")({
  validateSearch: z.object({
    tab: z.enum(CAMPAIGN_TABS).optional().catch(undefined),
  }),
  loader: async ({ params }) => {
    const [detail, pipeline] = await Promise.all([
      adminGetUgcCampaign({ data: { id: params.campaignId } }),
      adminUgcPipeline({ data: {} }),
    ]);
    if (!detail) throw notFound();
    return { detail, creators: pipeline.creators };
  },
  staleTime: Infinity,
  gcTime: 0,
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.detail.campaign.title ?? "Campaign"} · UGC Hub | MEDIALIFE` }],
  }),
  pendingComponent: () => <PageSkeleton rows={1} />,
  notFoundComponent: () => (
    <div className="mx-auto mt-10 max-w-md px-4">
      <EmptyState
        icon={Megaphone}
        tone="slate"
        title="Campaign not found"
        action={
          <Button asChild>
            <Link to="/admin/ugc/campaigns">All campaigns</Link>
          </Button>
        }
      >
        It may have been deleted.
      </EmptyState>
    </div>
  ),
  component: CampaignRoute,
});

function CampaignRoute() {
  const { detail, creators } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <CampaignEditor
      data={detail}
      allCreators={creators}
      tab={search.tab ?? "brief"}
      onTab={(t) =>
        void navigate({
          search: (s) => ({ ...s, tab: t === "brief" ? undefined : t }),
          replace: true,
        })
      }
    />
  );
}
