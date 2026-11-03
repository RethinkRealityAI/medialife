import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import {
  UGC_DETAIL_TABS,
  UgcCreatorNotFound,
  UgcCreatorPage,
  defaultUgcTab,
} from "@/components/ugc/admin/creator-page";
import { PageSkeleton } from "@/components/ugc/admin/ui";
import { adminGetUgcCreator, adminListUgcCampaigns } from "@/lib/ugc/admin.functions";

// /admin/ugc/creators/:id: one UGC creator. Header with status control and
// join link; tabs for the profile (handles, admin-only phone and address,
// campaigns, purge), content (inline players, comments, live link), shipping,
// perks, the activity timeline and internal notes. ?tab= keeps the tab.

export const Route = createFileRoute("/admin/ugc/creators/$creatorId")({
  validateSearch: z.object({
    tab: z.enum(UGC_DETAIL_TABS).optional().catch(undefined),
  }),
  loader: async ({ params }) => {
    const [detail, campaigns] = await Promise.all([
      adminGetUgcCreator({ data: { id: params.creatorId } }),
      adminListUgcCampaigns(),
    ]);
    if (!detail) throw notFound();
    return {
      detail,
      campaigns: campaigns.map((c) => ({ id: c.id, title: c.title, status: c.status })),
    };
  },
  staleTime: Infinity,
  gcTime: 0,
  head: ({ loaderData }) => ({
    meta: [
      {
        title: `${loaderData?.detail.creator.creatorName || loaderData?.detail.creator.name || "Creator"} · UGC Hub | MEDIALIFE`,
      },
    ],
  }),
  pendingComponent: () => <PageSkeleton rows={1} />,
  notFoundComponent: UgcCreatorNotFound,
  component: CreatorRoute,
});

function CreatorRoute() {
  const { detail, campaigns } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <UgcCreatorPage
      data={detail}
      campaigns={campaigns}
      tab={search.tab ?? defaultUgcTab(detail)}
      onTab={(t) => void navigate({ search: (s) => ({ ...s, tab: t }), replace: true })}
    />
  );
}
