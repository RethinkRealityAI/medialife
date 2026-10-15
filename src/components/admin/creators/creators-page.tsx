import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  FlaskConical,
  Hourglass,
  Inbox,
  Link2,
  Loader2,
  Rocket,
  ShoppingBag,
  Users,
} from "lucide-react";

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

import {
  AdminTab,
  AdminTabs,
  CopyButton,
  NamespaceBadge,
  PageBody,
  PageHeader,
  Panel,
  StatTile,
  TabCount,
  well,
} from "../kit";
import { CreatorsTable, type Filters } from "./creators-table";
import { InvitesPanel } from "./invites";
import type { CreatorsList, UnmatchedOrder } from "./types";
import { ghostBtn, outlineBtn, useRun } from "./ui";
import { UnmatchedPanel } from "./unmatched";

export const CREATORS_VIEWS = ["roster", "invites", "unmatched"] as const;
export type CreatorsView = (typeof CREATORS_VIEWS)[number];

export function CreatorsPage({
  data,
  unmatched,
  view,
  filters,
  onFilters,
}: {
  data: CreatorsList;
  unmatched: UnmatchedOrder[];
  view: CreatorsView;
  filters: Filters;
  onFilters: (f: Partial<Filters> & { view?: CreatorsView }) => void;
}) {
  const { counts, creators } = data;
  const drafts = counts.draft;
  const activeInvites = data.invites.filter((i) => !i.archived).length;
  const showRoster = (status: Filters["status"]) =>
    onFilters({ view: "roster", status: filters.status === status ? "all" : status });
  const on = (status: Filters["status"]) => view === "roster" && filters.status === status;

  return (
    <>
      <Toaster theme="dark" position="bottom-right" />
      <PageHeader
        title="Creators"
        icon={Users}
        badge={<NamespaceBadge ns={data.ns} />}
        image="/partner-kit/medialife/shelf-preview.webp"
        imageClassName="object-[50%_58%] opacity-55"
        description="Review applications, set terms and run every product from brief to live."
        actions={data.ns !== "prod" ? <SeedButton /> : null}
      />

      <PageBody>
        <div className="grid grid-cols-2 gap-3 @4xl/inset:grid-cols-4">
          <StatTile
            label="To review"
            value={counts.submitted}
            icon={Inbox}
            tone={counts.submitted ? "amber" : "slate"}
            hint={counts.submitted ? "Waiting on a decision" : "All caught up"}
            onClick={() => showRoster("submitted")}
            active={on("submitted")}
          />
          <StatTile
            label="Active creators"
            value={counts.approved}
            icon={Rocket}
            tone="mint"
            hint="Approved and onboarded"
            onClick={() => showRoster("approved")}
            active={on("approved")}
          />
          <StatTile
            label="Waitlist"
            value={counts.waitlist}
            icon={Hourglass}
            tone="violet"
            hint="Approved for later"
            onClick={() => showRoster("waitlist")}
            active={on("waitlist")}
          />
          <StatTile
            label="All creators"
            value={creators.length}
            icon={Users}
            tone="sky"
            hint={drafts ? `Including ${drafts} draft${drafts === 1 ? "" : "s"}` : "No drafts"}
            onClick={() => onFilters({ view: "roster", status: "all" })}
            active={on("all")}
          />
        </div>

        {unmatched.length && view !== "unmatched" ? (
          <button
            type="button"
            onClick={() => onFilters({ view: "unmatched" })}
            className="flex w-full items-center gap-3 rounded-2xl border border-amber-400/35 bg-[linear-gradient(90deg,rgb(251_191_36/0.12),rgb(251_191_36/0.03))] px-4 py-3 text-left text-sm shadow-[0_14px_30px_-22px_rgb(251_191_36/0.6)] transition-colors hover:border-amber-400/60 focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:outline-none"
          >
            <AlertTriangle className="size-4 shrink-0 text-amber-300" aria-hidden />
            <span className="flex-1">
              <span className="font-medium">
                {unmatched.length} Shopify order{unmatched.length === 1 ? "" : "s"} matched no
                product
              </span>
              <span className="text-muted-foreground"> · no creator has earned on them yet</span>
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-200">
              Review <ArrowRight className="size-3.5" aria-hidden />
            </span>
          </button>
        ) : null}

        <AdminTabs
          label="Creator sections"
          value={view}
          onChange={(v) => onFilters({ view: v })}
          tabs={[
            {
              id: "roster",
              label: "Roster",
              icon: Users,
              badge: <TabCount n={creators.length} />,
            },
            {
              id: "invites",
              label: "Invite links",
              icon: Link2,
              badge: <TabCount n={activeInvites} />,
            },
            {
              id: "unmatched",
              label: "Unmatched orders",
              icon: ShoppingBag,
              badge: unmatched.length ? <TabCount n={unmatched.length} alert="amber" /> : null,
            },
          ]}
        >
          <AdminTab value="roster">
            <CreatorsTable
              creators={creators}
              counts={counts}
              filters={filters}
              onFilters={onFilters}
            />
          </AdminTab>
          <AdminTab value="invites">
            <InvitesPanel invites={data.invites} />
          </AdminTab>
          <AdminTab value="unmatched">
            <UnmatchedPanel orders={unmatched} />
          </AdminTab>
        </AdminTabs>
      </PageBody>
    </>
  );
}

function SeedButton() {
  const { pending, run } = useRun();
  const [result, setResult] = useState<{
    creatorId: string | null;
    login: { email: string; password: string };
    partnerLogin?: { email: string; password: string };
    created: boolean;
  } | null>(null);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={`h-9 bg-black/30 backdrop-blur ${outlineBtn}`}
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
              PixelPine has products at every stage, a live experience, a proof to approve, orders
              and a payout. Use the first login for the Creator Hub, the second for Snowday Media's
              Partner Hub.
            </DialogDescription>
          </DialogHeader>
          {result ? (
            <div className={`divide-y divide-white/[0.06] text-sm ${well}`}>
              {(
                [
                  ["Creator", result.login.email],
                  ["Password", result.login.password],
                  ...(result.partnerLogin
                    ? ([
                        ["Partner", result.partnerLogin.email],
                        ["Password ", result.partnerLogin.password],
                      ] as const)
                    : []),
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex items-center gap-3 py-1 pr-1 pl-3">
                  <span className="w-20 text-muted-foreground">{k}</span>
                  <span className="mono min-w-0 flex-1 truncate text-xs">{v}</span>
                  <CopyButton
                    text={v}
                    label={`Copy ${k.trim().toLowerCase()}`}
                    toastText={`${k.trim()} copied`}
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
    <div className="space-y-5 px-4 pt-4 pb-6 sm:px-6 sm:pt-6 lg:px-8">
      <Panel className="h-32 animate-pulse rounded-3xl" />
      <div className="grid grid-cols-2 gap-3 @4xl/inset:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Panel key={i} className="h-28 animate-pulse" />
        ))}
      </div>
      <Panel className="h-12 animate-pulse" />
      <Panel className="h-96 animate-pulse" />
    </div>
  );
}
