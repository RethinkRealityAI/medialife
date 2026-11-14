import { createFileRoute } from "@tanstack/react-router";

import { GiveawayListPage } from "@/components/giveaway/admin/list-page";
import { adminListGiveaways } from "@/lib/giveaway/admin.functions";

// /admin/giveaways: every points giveaway, live first; "New giveaway" creates a draft.

export const Route = createFileRoute("/admin/giveaways/")({
  loader: () => adminListGiveaways(),
  head: () => ({ meta: [{ title: "Giveaways | MEDIALIFE" }] }),
  component: ListRoute,
});

function ListRoute() {
  return <GiveawayListPage data={Route.useLoaderData()} />;
}
