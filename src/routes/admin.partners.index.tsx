import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FolderOpen, Handshake, Plus } from "lucide-react";

import { PageHeader, Panel, PanelTitle } from "@/components/admin/kit";
import { PartnerForm } from "@/components/admin/partners/partner-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/sonner";
import { adminListPartners } from "@/lib/hub/admin-partners.functions";
import { SNOWDAY_PRESET } from "@/lib/hub/partners";

// /admin/partners: agencies that bring creators into the program (Snowday
// Media first). Each has a team in the Partner Hub, creators tied to it, invite
// links and a collateral library; every partner also gets the MEDIALIFE kit.

export const Route = createFileRoute("/admin/partners/")({
  loader: () => adminListPartners(),
  head: () => ({ meta: [{ title: "Partners · Creator Hub | MEDIALIFE" }] }),
  component: Partners,
});

function Partners() {
  const d = Route.useLoaderData();
  const navigate = useNavigate();
  const [creating, setCreating] = useState<null | "blank" | "snowday">(null);
  const hasSnowday = d.partners.some((p) => p.id === SNOWDAY_PRESET.id);
  return (
    <>
      <PageHeader
        title="Partners"
        actions={
          <>
            {!hasSnowday ? (
              <Button variant="outline" onClick={() => setCreating("snowday")}>
                Set up Snowday Media
              </Button>
            ) : null}
            <Button onClick={() => setCreating("blank")}>
              <Plus aria-hidden /> New partner
            </Button>
          </>
        }
      >
        <p className="mt-1 text-sm text-muted-foreground">
          Agencies bringing creators into the program. Each gets a Partner Hub with their creators,
          collateral, playbook and links.
        </p>
      </PageHeader>
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <Panel className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
          <FolderOpen className="size-5 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="font-medium">MEDIALIFE kit</div>
            <div className="text-sm text-muted-foreground">
              Files every partner sees in their collateral ({d.kitFiles} uploaded). Partner-specific
              files go in each partner's library.
            </div>
          </div>
          <Button asChild variant="outline">
            <Link to="/admin/partners/kit">Manage kit</Link>
          </Button>
        </Panel>

        {d.partners.length ? (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {d.partners.map((p) => (
              <li key={p.id}>
                <Link
                  to="/admin/partners/$partnerId"
                  params={{ partnerId: p.id }}
                  className="block rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50 sm:p-5"
                >
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="size-9 shrink-0 rounded-lg"
                      style={{
                        background: `linear-gradient(135deg, ${p.brand.accent}, ${p.brand.primary})`,
                      }}
                    />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.status === "paused" ? "Paused · " : ""}
                        {p.id}
                      </div>
                    </div>
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Creators</dt>
                      <dd className="tabular-nums">
                        {p.creators}{" "}
                        <span className="text-xs text-muted-foreground">({p.approved} active)</span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Team</dt>
                      <dd className="tabular-nums">{p.members}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Files</dt>
                      <dd className="tabular-nums">{p.files}</dd>
                    </div>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Panel className="flex flex-col items-center p-10 text-center">
            <Handshake className="size-8 text-primary" aria-hidden />
            <PanelTitle
              className="mt-3 justify-center"
              title="No partners yet"
              sub="Create Snowday Media to get started, then invite their first admin."
            />
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button onClick={() => setCreating("snowday")}>Set up Snowday Media</Button>
              <Button variant="outline" onClick={() => setCreating("blank")}>
                <Plus aria-hidden /> New partner
              </Button>
            </div>
          </Panel>
        )}
      </div>

      <Dialog open={!!creating} onOpenChange={(o) => !o && setCreating(null)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New partner</DialogTitle>
            <DialogDescription>
              You'll invite their team next. A default invite link (their id) is created for their
              program page.
            </DialogDescription>
          </DialogHeader>
          <PartnerForm
            key={creating ?? "none"}
            partner={null}
            preset={creating === "snowday" ? SNOWDAY_PRESET : undefined}
            onSaved={(p) => {
              setCreating(null);
              void navigate({ to: "/admin/partners/$partnerId", params: { partnerId: p.id } });
            }}
          />
        </DialogContent>
      </Dialog>
      <Toaster theme="dark" position="top-center" richColors closeButton />
    </>
  );
}
