import { createFileRoute } from "@tanstack/react-router";

import { ImportPage } from "@/components/ugc/admin/import-page";
import { PageSkeleton } from "@/components/ugc/admin/ui";
import { adminListUgcCampaigns, adminUgcImportStatus } from "@/lib/ugc/admin.functions";

// /admin/ugc/import: bring sign-ups in. "Sync from Netlify Forms" (or the setup
// steps when NETLIFY_API_TOKEN / NETLIFY_SITE_ID are missing), a CSV upload of
// the Netlify Forms export with a preview, adding a creator by hand, and the
// import history.

export const Route = createFileRoute("/admin/ugc/import")({
  loader: async () => {
    const [status, campaigns] = await Promise.all([
      adminUgcImportStatus(),
      adminListUgcCampaigns(),
    ]);
    return {
      status,
      campaigns: campaigns.map((c) => ({ id: c.id, title: c.title, status: c.status })),
    };
  },
  head: () => ({ meta: [{ title: "Import · UGC Hub | MEDIALIFE" }] }),
  pendingComponent: () => <PageSkeleton rows={1} />,
  component: ImportRoute,
});

function ImportRoute() {
  const { status, campaigns } = Route.useLoaderData();
  return <ImportPage status={status} campaigns={campaigns} />;
}
