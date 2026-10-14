import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { PageHeader, Panel } from "@/components/admin/kit";
import { AssetLibrary, type LibraryNav } from "@/components/hub/assets/library";
import { Toaster } from "@/components/ui/sonner";
import { adminGetKit } from "@/lib/hub/admin-partners.functions";

// The MEDIALIFE kit: files every partner sees in their Partner Hub collateral,
// under "From the MEDIALIFE team". Case studies, product photos, decks.

export const Route = createFileRoute("/admin/partners/kit")({
  loader: () => adminGetKit(),
  head: () => ({ meta: [{ title: "MEDIALIFE kit · Partners | MEDIALIFE" }] }),
  component: Kit,
});

function Kit() {
  const d = Route.useLoaderData();
  const [nav, setNav] = useState<LibraryNav>({});
  return (
    <>
      <PageHeader title="MEDIALIFE kit">
        <Link
          to="/admin/partners"
          className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden /> Partners
        </Link>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Every partner sees these in their collateral, marked “New” for three weeks. Use sections
          and tags so they can find things; anything meant for one partner only goes in that
          partner's library instead.
        </p>
      </PageHeader>
      <div className="p-4 sm:p-6 lg:p-8">
        <Panel className="p-4 sm:p-5">
          <AssetLibrary
            mode="admin"
            creatorId={d.owner}
            files={d.files}
            folders={d.folders}
            products={[]}
            nav={nav}
            onNav={setNav}
          />
        </Panel>
      </div>
      <Toaster theme="dark" position="top-center" richColors closeButton />
    </>
  );
}
