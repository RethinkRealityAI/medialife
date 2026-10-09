import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ExternalLink, FlaskConical, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/sonner";
import { adminSeedSample } from "@/lib/hub/admin.functions";
import { HUB } from "@/lib/hub/model";

import { CopyButton, NamespaceBadge, PageHeader, Panel, StatTile } from "../kit";
import { CreatorsTable, type Filters } from "./creators-table";
import { IntegrationsPanel } from "./integrations";
import { InvitesPanel } from "./invites";
import type { CreatorsList, UnmatchedOrder } from "./types";
import { ghostBtn, outlineBtn, useRun } from "./ui";
import { UnmatchedPanel } from "./unmatched";

export function CreatorsPage({
  data,
  unmatched,
  filters,
  onFilters,
}: {
  data: CreatorsList;
  unmatched: UnmatchedOrder[];
  filters: Filters;
  onFilters: (f: Partial<Filters>) => void;
}) {
  const { counts, creators } = data;
  const drafts = counts.draft;
  return (
    <>
      <Toaster theme="dark" position="bottom-right" />
      <PageHeader
        title="Creators"
        badge={<NamespaceBadge ns={data.ns} />}
        actions={data.ns !== "prod" ? <SeedButton /> : null}
      >
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          The {HUB.program}: review applications, set terms, and run each creator's products from
          brief to live.
        </p>
      </PageHeader>

      <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-3 @4xl/inset:grid-cols-4">
          <StatTile
            label="Applications to review"
            value={counts.submitted}
            hint={counts.submitted ? "Waiting on a decision" : "All caught up"}
          />
          <StatTile label="Active creators" value={counts.approved} hint="Approved and onboarded" />
          <StatTile label="Waitlist" value={counts.waitlist} hint="Approved for later" />
          <StatTile
            label="Total creators"
            value={creators.length}
            hint={
              drafts
                ? `Including ${drafts} unfinished draft${drafts === 1 ? "" : "s"}`
                : "No drafts"
            }
          />
        </div>

        {unmatched.length ? (
          <a
            href="#unmatched"
            className="flex items-center gap-3 rounded-xl border border-amber-400/35 bg-amber-400/[0.07] px-4 py-3 text-sm hover:bg-amber-400/[0.1]"
          >
            <AlertTriangle className="size-4 shrink-0 text-amber-300" aria-hidden />
            <span className="flex-1">
              {unmatched.length} Shopify order{unmatched.length === 1 ? "" : "s"} didn't match a
              product, so no creator earned on {unmatched.length === 1 ? "it" : "them"} yet.
            </span>
            <span className="text-xs text-amber-200 underline underline-offset-2">Review</span>
          </a>
        ) : null}

        <CreatorsTable
          creators={creators}
          counts={counts}
          filters={filters}
          onFilters={onFilters}
        />

        <div className="grid items-start gap-5 @5xl/inset:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <InvitesPanel invites={data.invites} />
          <IntegrationsPanel data={data} />
        </div>

        <UnmatchedPanel orders={unmatched} />
      </div>
    </>
  );
}

function SeedButton() {
  const { pending, run } = useRun();
  const [result, setResult] = useState<{
    creatorId: string | null;
    login: { email: string; password: string };
    created: boolean;
  } | null>(null);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={`h-9 ${outlineBtn}`}
        disabled={!!pending}
        onClick={async () => {
          const r = await run("seed", () => adminSeedSample());
          if (r && r.ok) setResult(r);
        }}
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <FlaskConical aria-hidden />}
        Load sample creator
      </Button>
      <Dialog open={!!result} onOpenChange={(o) => !o && setResult(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {result?.created ? "Sample creator loaded" : "Sample creator is already here"}
            </DialogTitle>
            <DialogDescription>
              PixelPine has products at every stage, a live experience, a proof waiting for
              approval, orders and a payout. Sign in to the Creator Hub with this login to see the
              creator side.
            </DialogDescription>
          </DialogHeader>
          {result ? (
            <div className="divide-y divide-border rounded-md border border-border text-sm">
              {(
                [
                  ["Email", result.login.email],
                  ["Password", result.login.password],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex items-center gap-3 py-1 pr-1 pl-3">
                  <span className="w-20 text-muted-foreground">{k}</span>
                  <span className="mono min-w-0 flex-1 truncate text-xs">{v}</span>
                  <CopyButton
                    text={v}
                    label={`Copy ${k.toLowerCase()}`}
                    toastText={`${k} copied`}
                  />
                </div>
              ))}
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:space-x-0">
            <Button asChild variant="ghost" className={ghostBtn}>
              <a href={HUB.base} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden />
                Open the Creator Hub
              </a>
            </Button>
            {result?.creatorId ? (
              <Button asChild>
                <Link to="/admin/creators/$creatorId" params={{ creatorId: result.creatorId }}>
                  Open PixelPine
                </Link>
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CreatorsSkeleton() {
  return (
    <div className="space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <div className="h-9 w-48 animate-pulse rounded bg-white/[0.06]" />
      <div className="grid grid-cols-2 gap-3 @4xl/inset:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Panel key={i} className="h-28 animate-pulse" />
        ))}
      </div>
      <Panel className="h-96 animate-pulse" />
    </div>
  );
}
