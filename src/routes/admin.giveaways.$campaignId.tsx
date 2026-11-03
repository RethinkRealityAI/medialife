import { createFileRoute, notFound } from "@tanstack/react-router";

import { GiveawayDetailPage } from "@/components/giveaway/admin/detail-page";
import { adminGetGiveaway } from "@/lib/giveaway/admin.functions";

// /admin/giveaways/<id>: the campaign builder, entrants and the draw.

export const Route = createFileRoute("/admin/giveaways/$campaignId")({
  loader: async ({ params }) => {
    const data = await adminGetGiveaway({ data: { id: params.campaignId } });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.campaign.title ?? "Giveaway"} · Giveaways | MEDIALIFE` }],
  }),
  component: DetailRoute,
});

function DetailRoute() {
  return <GiveawayDetailPage data={Route.useLoaderData()} />;
}
