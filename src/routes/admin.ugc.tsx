import { createFileRoute, Outlet } from "@tanstack/react-router";

import { Toaster } from "@/components/ui/sonner";
import { UgcNav } from "@/components/ugc/admin/ui";

// /admin/ugc/*: the team side of the EVADE UGC Hub. The /admin layout already
// enforces the admin password; this adds the section nav (Pipeline, Review,
// Shipping, Campaigns, Import) above every page. Contract: src/lib/ugc/README.md.

export const Route = createFileRoute("/admin/ugc")({
  head: () => ({ meta: [{ title: "UGC Hub | MEDIALIFE" }] }),
  component: UgcAdminLayout,
});

function UgcAdminLayout() {
  return (
    <>
      <Toaster theme="dark" position="bottom-right" />
      <UgcNav />
      <Outlet />
    </>
  );
}
