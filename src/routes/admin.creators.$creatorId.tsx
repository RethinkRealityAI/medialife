import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import {
  CreatorNotFound,
  CreatorPage,
  CreatorSkeleton,
  DETAIL_TABS,
  defaultTab,
} from "@/components/admin/creators/creator-page";
import { adminGetCreator } from "@/lib/hub/admin.functions";

// /admin/creators/:id: one creator. Header with status, revenue share and
// earnings; tabs for the application, products (pipeline, proofs, collateral,
// messages), experiences, files, orders & payouts, activity and internal notes.
// ?tab= keeps the tab, ?product= the open product.

export const Route = createFileRoute("/admin/creators/$creatorId")({
  validateSearch: z.object({
    tab: z.enum(DETAIL_TABS).optional().catch(undefined),
    product: z
      .string()
      .regex(/^[A-Za-z0-9]{1,60}$/)
      .optional()
      .catch(undefined),
  }),
  loader: async ({ params }) => {
    const r = await adminGetCreator({ data: { id: params.creatorId } });
    if (!r) throw notFound();
    return r;
  },
  // tab and product live in the URL; switching them must not refetch. router.invalidate() still does.
  staleTime: Infinity,
  gcTime: 0,
  head: ({ loaderData }) => ({
    meta: [
      {
        title: `${loaderData?.creator.profile.displayName || "Creator"} · Creators | MEDIALIFE`,
      },
    ],
  }),
  pendingComponent: CreatorSkeleton,
  notFoundComponent: CreatorNotFound,
  component: CreatorRoute,
});

function CreatorRoute() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const tab = search.tab ?? (search.product ? "products" : defaultTab(data));
  return (
    <CreatorPage
      data={data}
      tab={tab}
      productId={search.product}
      onTab={(t) => void navigate({ search: (s) => ({ ...s, tab: t }), replace: true })}
      onProduct={(id) =>
        void navigate({
          search: (s) => ({ ...s, tab: "products", product: id }),
          // opening a product is a step the back button should undo
          replace: false,
        })
      }
    />
  );
}
