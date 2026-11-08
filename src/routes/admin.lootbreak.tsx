import { createFileRoute } from "@tanstack/react-router";

import { LootBreakPage } from "@/components/admin/lootbreak/lootbreak-page";

// /admin/lootbreak: LOOT BREAK reward codes and the bonus quest (TBH).

export const Route = createFileRoute("/admin/lootbreak")({
  head: () => ({ meta: [{ title: "LOOT BREAK rewards | MEDIALIFE" }] }),
  component: LootBreakPage,
});
