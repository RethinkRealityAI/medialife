import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FolderOpen, Library } from "lucide-react";

import { BackLink, PageBody, PageHeader, Panel, Tag } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
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
      <PageHeader
        title="MEDIALIFE kit"
        icon={Library}
        tone="violet"
        badge={<Tag tone="violet">{d.files.length} files</Tag>}
        back={<BackLink to="/admin/partners">Partners</BackLink>}
        description="Every partner sees these in Collateral, marked “New” for three weeks. Use sections and tags so they're easy to find; files for one partner go in that partner's library."
        actions={
          <Button asChild variant="outline" className="bg-black/30 backdrop-blur">
            <Link to="/admin/partners/collateral">
              <FolderOpen aria-hidden /> Collateral
            </Link>
          </Button>
        }
      />
      <PageBody>
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
      </PageBody>
      <Toaster theme="dark" position="top-center" richColors closeButton />
    </>
  );
}
