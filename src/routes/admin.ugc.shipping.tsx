import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { SHIPPING_VIEWS, ShippingPage } from "@/components/ugc/admin/shipping-page";
import { PageSkeleton } from "@/components/ugc/admin/ui";
import { adminListUgcCampaigns, adminUgcShipping } from "@/lib/ugc/admin.functions";

// /admin/ugc/shipping: packages for approved creators. Addresses and phones,
// "Export CSV" (unshipped, fulfilment column order), mark packed / shipped
// (carrier + tracking) / delivered, and bulk tracking from a CSV.
// ?view picks to-ship / in-transit / delivered / all, ?campaign the campaign.

export const Route = createFileRoute("/admin/ugc/shipping")({
  validateSearch: z.object({
    view: z.enum(SHIPPING_VIEWS).optional().catch(undefined),
    campaign: z
      .string()
      .regex(/^[A-Za-z0-9]{6,60}$/)
      .optional()
      .catch(undefined),
  }),
  loaderDeps: ({ search }) => ({ campaign: search.campaign }),
  loader: async ({ deps }) => {
    const [rows, campaigns] = await Promise.all([
      adminUgcShipping({ data: { campaignId: deps.campaign } }),
      adminListUgcCampaigns(),
    ]);
    return {
      rows,
      campaigns: campaigns.map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        items: c.items,
      })),
    };
  },
  staleTime: Infinity,
  gcTime: 0,
  head: () => ({ meta: [{ title: "Shipping · UGC Hub | MEDIALIFE" }] }),
  pendingComponent: () => <PageSkeleton rows={1} />,
  component: ShippingRoute,
});

function ShippingRoute() {
  const { rows, campaigns } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <ShippingPage
      rows={rows}
      campaigns={campaigns}
      view={search.view ?? "to-ship"}
      campaignId={search.campaign ?? ""}
      onView={(v) =>
        void navigate({
          search: (s) => ({ ...s, view: v === "to-ship" ? undefined : v }),
          replace: true,
        })
      }
      onCampaign={(id) =>
        void navigate({ search: (s) => ({ ...s, campaign: id || undefined }), replace: true })
      }
    />
  );
}
