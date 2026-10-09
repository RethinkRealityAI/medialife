import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { CreatorsPage, CreatorsSkeleton } from "@/components/admin/creators/creators-page";
import { LIST_TABS } from "@/components/admin/creators/creators-table";
import { adminListCreators, adminListUnmatched } from "@/lib/hub/admin.functions";

// /admin/creators: the Creator Hub roster. Applications to review, active
// creators, agency invite links, integration status and Shopify orders that
// matched no product. ?status, ?q and ?agency keep the list's filters.

export const Route = createFileRoute("/admin/creators/")({
  validateSearch: z.object({
    status: z.enum(LIST_TABS).optional().catch(undefined),
    q: z.string().max(80).optional().catch(undefined),
    agency: z.string().max(80).optional().catch(undefined),
  }),
  loader: async () => {
    const [list, unmatched] = await Promise.all([adminListCreators(), adminListUnmatched()]);
    return { list, unmatched };
  },
  // filters live in the URL; changing them must not refetch. router.invalidate() still does.
  staleTime: Infinity,
  gcTime: 0,
  head: () => ({ meta: [{ title: "Creators · Creator Hub | MEDIALIFE" }] }),
  pendingComponent: CreatorsSkeleton,
  component: CreatorsRoute,
});

function CreatorsRoute() {
  const { list, unmatched } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <CreatorsPage
      data={list}
      unmatched={unmatched}
      filters={{ status: search.status ?? "all", q: search.q ?? "", agency: search.agency ?? "" }}
      onFilters={(f) =>
        void navigate({
          search: (s) => ({
            ...s,
            status: f.status === undefined ? s.status : f.status === "all" ? undefined : f.status,
            q: f.q === undefined ? s.q : f.q || undefined,
            agency: f.agency === undefined ? s.agency : f.agency || undefined,
          }),
          replace: true,
        })
      }
    />
  );
}
