import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Ban,
  CheckCheck,
  ChevronRight,
  Clapperboard,
  FileInput,
  FlaskConical,
  Loader2,
  Megaphone,
  Package,
  PauseCircle,
  Search,
  SearchX,
  ShieldAlert,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { relativeTime } from "@/components/admin/format";
import { Avatar, EmptyState, PageBody, PageHeader, Panel, StatTile } from "@/components/admin/kit";
import { CheckRow, Field, ghostBtn, outlineBtn, useRun } from "@/components/admin/creators/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  adminAssignUgcCampaign,
  adminSeedUgcSample,
  adminSetUgcStatus,
} from "@/lib/ugc/admin.functions";
import { UGC_STATUS_LABELS, UGC_STATUSES, canTransition, type UgcStatus } from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

import type { CreatorSummary, Pipeline } from "./types";
import { JoinLinksDialog, MainHandle, UgcStatusPill, mainAudience, plural, useBulk } from "./ui";

export const PIPELINE_FILTERS = [...UGC_STATUSES, "all", "deletion-requested"] as const;
export type PipelineFilter = (typeof PIPELINE_FILTERS)[number];

export type PipelineFilters = { status: PipelineFilter; q: string; campaign: string };

const CHIPS: PipelineFilter[] = ["all", ...UGC_STATUSES, "deletion-requested"];
const CHIP_LABEL = (f: PipelineFilter) =>
  f === "all" ? "All" : f === "deletion-requested" ? "Deletion requests" : UGC_STATUS_LABELS[f];

export type NeedsYou = {
  toShip: number;
  toReview: number;
  oldestReviewAt: number | null;
};

export function PipelinePage({
  data,
  needs,
  filters,
  onFilters,
}: {
  data: Pipeline;
  needs: NeedsYou;
  filters: PipelineFilters;
  onFilters: (f: Partial<PipelineFilters>) => void;
}) {
  const navigate = useNavigate();
  const { counts, creators, campaigns } = data;
  const deletions = counts["deletion-requested"];
  const toggle = (s: PipelineFilter) => onFilters({ status: filters.status === s ? "all" : s });
  const hasSample = creators.some((c) => c.sample);

  return (
    <>
      <PageHeader
        title="UGC Hub"
        eyebrow="EVADE creators"
        icon={Clapperboard}
        tone="amber"
        image="/evade/creators/assets/img/cola-run-splash.webp"
        imageClassName="object-[50%_40%] opacity-50"
        description="Sign-ups, packages, briefs and content for the EVADE creator program, from approval to posted."
        actions={
          <>
            {hasSample || !counts.all ? <SeedButton reset={hasSample} /> : null}
            <Button
              asChild
              variant="outline"
              size="sm"
              className={`h-9 bg-black/30 backdrop-blur ${outlineBtn}`}
            >
              <Link to="/admin/ugc/import">
                <FileInput aria-hidden />
                Import sign-ups
              </Link>
            </Button>
          </>
        }
      />
      <PageBody>
        <section aria-labelledby="needs-you">
          <h2
            id="needs-you"
            className="mb-2.5 text-[11px] font-semibold tracking-[0.14em] text-white/55 uppercase"
          >
            Needs you
          </h2>
          <div className="grid grid-cols-2 gap-3 @4xl/inset:grid-cols-4">
            <StatTile
              label="New sign-ups"
              value={counts.applied}
              icon={UserPlus}
              tone={counts.applied ? "amber" : "slate"}
              hint={counts.applied ? "Approve or decline" : "All caught up"}
              onClick={() => toggle("applied")}
              active={filters.status === "applied"}
            />
            <StatTile
              label="Packages to ship"
              value={needs.toShip}
              icon={Package}
              tone={needs.toShip ? "sky" : "slate"}
              hint={needs.toShip ? "Approved, not shipped yet" : "Nothing waiting"}
              onClick={() => void navigate({ to: "/admin/ugc/shipping" })}
            />
            <StatTile
              label="Content to review"
              value={needs.toReview}
              icon={Clapperboard}
              tone={needs.toReview ? "violet" : "slate"}
              hint={
                needs.oldestReviewAt
                  ? `Oldest uploaded ${relativeTime(needs.oldestReviewAt)}`
                  : "Queue is empty"
              }
              onClick={() => void navigate({ to: "/admin/ugc/review" })}
            />
            <StatTile
              label="Data deletion requests"
              value={deletions}
              icon={ShieldAlert}
              tone={deletions ? "rose" : "slate"}
              hint={deletions ? "Purge their phone and address" : "None open"}
              onClick={() => toggle("deletion-requested")}
              active={filters.status === "deletion-requested"}
            />
          </div>
        </section>

        <PipelineTable data={data} filters={filters} onFilters={onFilters} campaigns={campaigns} />
      </PageBody>
    </>
  );
}

function PipelineTable({
  data,
  filters,
  onFilters,
  campaigns,
}: {
  data: Pipeline;
  filters: PipelineFilters;
  onFilters: (f: Partial<PipelineFilters>) => void;
  campaigns: Pipeline["campaigns"];
}) {
  const navigate = useNavigate();
  const { counts, creators } = data;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // lives here, not in the bulk bar: the bar unmounts once the selection clears
  const [links, setLinks] = useState<{ name: string; email: string; devLink: string }[]>([]);
  const titles = useMemo(() => new Map(campaigns.map((c) => [c.id, c.title])), [campaigns]);

  const q = filters.q.trim().toLowerCase();
  const shown = useMemo(
    () =>
      creators.filter(
        (c) =>
          (filters.status === "all" ||
            (filters.status === "deletion-requested"
              ? c.deletionRequested
              : c.status === filters.status)) &&
          (!filters.campaign || c.campaignIds.includes(filters.campaign)) &&
          (!q ||
            [c.name, c.creatorName, c.email, c.country, ...Object.values(c.handles ?? {})].some(
              (v) => v?.toLowerCase().includes(q),
            )),
      ),
    [creators, filters.status, filters.campaign, q],
  );
  const shownIds = shown.map((c) => c.id);
  const picked = shown.filter((c) => selected.has(c.id));
  const allPicked = shown.length > 0 && picked.length === shown.length;
  const somePicked = picked.length > 0 && !allPicked;

  const pick = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  const pickAll = (on: boolean) => setSelected(on ? new Set(shownIds) : new Set());
  const open = (id: string) =>
    void navigate({ to: "/admin/ugc/creators/$creatorId", params: { creatorId: id } });
  const campaignOf = (c: CreatorSummary) => {
    const id = c.campaignIds[c.campaignIds.length - 1];
    return id ? (titles.get(id) ?? null) : null;
  };
  const filtered = q || filters.campaign;

  return (
    <Panel className="overflow-hidden">
      <div className="space-y-3 p-3 sm:p-4">
        <div
          role="group"
          aria-label="Filter by status"
          className="-mx-3 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] sm:-mx-4 sm:px-4 @4xl/inset:mx-0 @4xl/inset:flex-wrap @4xl/inset:overflow-visible @4xl/inset:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {CHIPS.map((f) => {
            const n = counts[f];
            const on = filters.status === f;
            if (f === "deletion-requested" && !n && !on) return null;
            return (
              <button
                key={f}
                type="button"
                aria-pressed={on}
                onClick={() => onFilters({ status: f })}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium ring-1 transition-colors ring-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--partner)]",
                  on
                    ? "bg-[color-mix(in_oklab,var(--partner)_22%,transparent)] text-white ring-[color-mix(in_oklab,var(--partner)_55%,transparent)]"
                    : n
                      ? "bg-white/[0.04] text-white/75 ring-white/[0.1] hover:bg-white/[0.08] hover:text-white"
                      : "bg-transparent text-white/40 ring-white/[0.06] hover:text-white/70",
                  f === "deletion-requested" && n && !on && "text-red-200 ring-red-400/35",
                )}
              >
                {CHIP_LABEL(f)}
                <span
                  className={cn(
                    "tabular-nums",
                    on
                      ? "text-white"
                      : f === "applied" && n
                        ? "font-semibold text-amber-300"
                        : "opacity-60",
                  )}
                >
                  {n}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-0 flex-1 basis-56">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={filters.q}
              onChange={(e) => onFilters({ q: e.target.value })}
              placeholder="Name, email, handle or country"
              aria-label="Search creators"
              className="h-10 rounded-xl bg-black/30 pl-8"
            />
          </div>
          <Select
            value={filters.campaign || "__any"}
            onValueChange={(v) => onFilters({ campaign: v === "__any" ? "" : v })}
          >
            <SelectTrigger
              className="h-10 w-full rounded-xl bg-black/30 sm:w-60"
              aria-label="Filter by campaign"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__any">All campaigns</SelectItem>
              {campaigns.length ? <SelectSeparator /> : null}
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {picked.length ? (
        <BulkBar
          picked={picked}
          campaigns={campaigns}
          onDone={() => setSelected(new Set())}
          onLinks={setLinks}
        />
      ) : null}

      {!shown.length ? (
        <div className="border-t border-white/[0.06] p-4">
          <EmptyState
            icon={!creators.length ? Users : SearchX}
            tone={!creators.length ? "amber" : "slate"}
            title={
              !creators.length
                ? "No sign-ups yet"
                : filtered
                  ? "No matches"
                  : filters.status === "applied"
                    ? "No new sign-ups"
                    : `Nobody is ${CHIP_LABEL(filters.status).toLowerCase()}`
            }
            action={
              !creators.length ? (
                <>
                  <Button asChild>
                    <Link to="/admin/ugc/import">
                      <FileInput aria-hidden />
                      Import sign-ups
                    </Link>
                  </Button>
                  <SeedButton reset={false} />
                </>
              ) : filtered ? (
                <button
                  type="button"
                  onClick={() => onFilters({ q: "", campaign: "" })}
                  className="text-sm font-medium text-sky-300 underline-offset-2 hover:underline"
                >
                  Clear search and campaign
                </button>
              ) : null
            }
          >
            {!creators.length
              ? "Sync the landing page's Netlify form, upload its CSV export, or add someone by hand."
              : filtered
                ? "Nobody matches these filters."
                : "Creators move here as the pipeline runs."}
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="hidden border-t border-white/[0.06] @4xl/inset:block">
            <table className="w-full text-sm">
              <caption className="sr-only">UGC creators</caption>
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.02] text-left text-[11px] font-medium tracking-wide text-white/55 uppercase">
                  <th scope="col" className="w-11 py-2.5 pr-1 pl-5">
                    <Checkbox
                      checked={allPicked ? true : somePicked ? "indeterminate" : false}
                      onCheckedChange={(v) => pickAll(v === true)}
                      aria-label="Select all shown"
                    />
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-normal">
                    Creator
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-normal">
                    Main platform
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-normal">
                    Audience
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-normal">
                    Status
                  </th>
                  <th scope="col" className="hidden px-3 py-2.5 font-normal @5xl/inset:table-cell">
                    Campaign
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-normal">
                    Last activity
                  </th>
                  <th scope="col" className="w-10 px-3 py-2.5">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {shown.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => open(c.id)}
                    data-selected={selected.has(c.id) || undefined}
                    className="group cursor-pointer align-middle transition-colors hover:bg-[linear-gradient(90deg,color-mix(in_oklab,var(--partner)_9%,transparent),transparent_60%)] data-[selected]:bg-[color-mix(in_oklab,var(--partner)_7%,transparent)]"
                  >
                    <td className="py-3 pr-1 pl-5" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(c.id)}
                        onCheckedChange={(v) => pick(c.id, v === true)}
                        aria-label={`Select ${c.creatorName || c.name}`}
                      />
                    </td>
                    <td className="max-w-[18rem] px-3 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={c.creatorName || c.name || c.email} />
                        <div className="min-w-0">
                          <Link
                            to="/admin/ugc/creators/$creatorId"
                            params={{ creatorId: c.id }}
                            onClick={(e) => e.stopPropagation()}
                            className="block truncate font-medium outline-none hover:underline focus-visible:underline"
                          >
                            {c.creatorName || c.name || "Unnamed"}
                          </Link>
                          <div className="truncate text-xs text-muted-foreground">
                            {[c.name, c.email].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[16rem] px-3 py-2.5">
                      <MainHandle
                        mainPlatform={c.mainPlatform}
                        platforms={c.platforms}
                        handles={c.handles}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                      {mainAudience(c) ?? <span className="text-muted-foreground/60">–</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-1">
                        <UgcStatusPill status={c.status} />
                        {c.deletionRequested ? (
                          <ShieldAlert
                            className="size-4 text-red-300"
                            aria-label="Asked for their data to be deleted"
                          />
                        ) : null}
                      </div>
                    </td>
                    <td className="hidden max-w-[14rem] truncate px-3 py-2.5 text-xs text-white/75 @5xl/inset:table-cell">
                      {campaignOf(c) ?? <span className="text-muted-foreground/60">None</span>}
                    </td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                      <LastActive c={c} />
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      <ChevronRight
                        className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground motion-reduce:transition-none"
                        aria-hidden
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3 border-t border-white/[0.06] bg-white/[0.02] px-4 py-2 @4xl/inset:hidden">
            <Checkbox
              id="pick-all-mobile"
              checked={allPicked ? true : somePicked ? "indeterminate" : false}
              onCheckedChange={(v) => pickAll(v === true)}
            />
            <label htmlFor="pick-all-mobile" className="text-xs text-muted-foreground">
              Select all {shown.length}
            </label>
          </div>
          <ul className="divide-y divide-white/[0.05] border-t border-white/[0.06] @4xl/inset:hidden">
            {shown.map((c) => (
              <li
                key={c.id}
                className={cn(
                  "flex items-start",
                  selected.has(c.id) && "bg-[color-mix(in_oklab,var(--partner)_7%,transparent)]",
                )}
              >
                <div className="py-4 pl-4">
                  <Checkbox
                    checked={selected.has(c.id)}
                    onCheckedChange={(v) => pick(c.id, v === true)}
                    aria-label={`Select ${c.creatorName || c.name}`}
                    className="size-5"
                  />
                </div>
                <Link
                  to="/admin/ugc/creators/$creatorId"
                  params={{ creatorId: c.id }}
                  className="flex min-w-0 flex-1 items-start gap-3 py-3.5 pr-4 pl-3 hover:bg-white/[0.03] focus-visible:bg-white/[0.04] focus-visible:outline-none"
                >
                  <Avatar name={c.creatorName || c.name || c.email} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate font-medium">
                        {c.creatorName || c.name || "Unnamed"}
                      </span>
                      <UgcStatusPill status={c.status} />
                      {c.deletionRequested ? (
                        <ShieldAlert
                          className="size-4 text-red-300"
                          aria-label="Deletion request"
                        />
                      ) : null}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[c.name, c.email].filter(Boolean).join(" · ")}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                      <MainHandle
                        mainPlatform={c.mainPlatform}
                        platforms={c.platforms}
                        handles={c.handles}
                        plain
                      />
                      {mainAudience(c) ? (
                        <span className="text-sky-200">{mainAudience(c)}</span>
                      ) : null}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      {campaignOf(c) ? <span className="truncate">{campaignOf(c)}</span> : null}
                      <LastActive c={c} />
                    </div>
                  </div>
                  <ChevronRight
                    className="mt-1 size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      <JoinLinksDialog links={links} onClose={() => setLinks([])} />
    </Panel>
  );
}

function LastActive({ c }: { c: CreatorSummary }) {
  const at = Math.max(c.lastActiveAt ?? 0, c.statusChangedAt);
  return (
    <time dateTime={new Date(at).toISOString()} suppressHydrationWarning>
      {relativeTime(at)}
    </time>
  );
}

type Confirm = null | "approve" | "decline" | "pause";

/** The bar that appears once rows are picked. */
function BulkBar({
  picked,
  campaigns,
  onDone,
  onLinks,
}: {
  picked: CreatorSummary[];
  campaigns: Pipeline["campaigns"];
  onDone: () => void;
  onLinks: (links: { name: string; email: string; devLink: string }[]) => void;
}) {
  const bulk = useBulk();
  const single = useRun();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [notify, setNotify] = useState(true);
  const live = campaigns.filter((c) => c.status === "live");
  const [campaignId, setCampaignId] = useState<string>(live.length === 1 ? live[0].id : "");

  const can = (to: UgcStatus) => picked.filter((c) => canTransition(c.status, to));
  const approvable = can("approved");
  const declinable = can("declined");
  const pausable = can("paused");
  const target = confirm === "approve" ? approvable : confirm === "decline" ? declinable : pausable;

  async function apply() {
    if (!confirm || !target.length) return;
    const status: UgcStatus =
      confirm === "approve" ? "approved" : confirm === "decline" ? "declined" : "paused";
    const verb = confirm === "approve" ? "Approved" : confirm === "decline" ? "Declined" : "Paused";
    const results = await bulk.run(
      confirm,
      () =>
        adminSetUgcStatus({
          data: {
            ids: target.map((c) => c.id),
            status,
            notify: confirm === "approve" ? notify : undefined,
            campaignId: confirm === "approve" && campaignId ? campaignId : undefined,
          },
        }),
      verb,
    );
    setConfirm(null);
    if (!results) return;
    const byId = new Map(target.map((c) => [c.id, c]));
    const dev = results
      .filter((r) => r.ok && r.devLink)
      .map((r) => {
        const c = byId.get(r.id)!;
        return { name: c.creatorName || c.name, email: c.email, devLink: r.devLink! };
      });
    if (dev.length) onLinks(dev);
    onDone();
  }

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="sticky top-14 z-20 flex flex-wrap items-center gap-2 border-t border-[color-mix(in_oklab,var(--partner)_35%,transparent)] bg-[color-mix(in_oklab,var(--partner-ink)_88%,transparent)] px-3 py-2.5 backdrop-blur-xl sm:px-4"
    >
      <span className="mr-1 text-sm font-medium tabular-nums">{picked.length} selected</span>
      <Button
        size="sm"
        onClick={() => setConfirm("approve")}
        disabled={!approvable.length || bulk.busy}
        title={
          approvable.length ? undefined : "Only applicants and declined creators can be approved"
        }
      >
        <CheckCheck aria-hidden />
        Approve
        {approvable.length && approvable.length !== picked.length ? ` ${approvable.length}` : ""}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className={outlineBtn}
        onClick={() => setConfirm("decline")}
        disabled={!declinable.length || bulk.busy}
      >
        <Ban aria-hidden />
        Decline
      </Button>
      <Button
        size="sm"
        variant="outline"
        className={outlineBtn}
        onClick={() => setConfirm("pause")}
        disabled={!pausable.length || bulk.busy}
      >
        <PauseCircle aria-hidden />
        Pause
      </Button>
      {campaigns.length ? (
        <Select
          value=""
          onValueChange={async (v) => {
            const c = campaigns.find((x) => x.id === v);
            const r = await single.run(
              "assign",
              () =>
                adminAssignUgcCampaign({
                  data: { campaignId: v, creatorIds: picked.map((p) => p.id), assign: true },
                }),
              (res) =>
                !res.ok
                  ? null
                  : res.updated
                    ? `Added ${plural(res.updated, "creator")} to ${c?.title ?? "the campaign"}`
                    : `Everyone picked is already on ${c?.title ?? "that campaign"}`,
            );
            if (r) onDone();
          }}
          disabled={single.busy}
        >
          <SelectTrigger
            className="h-8 w-auto gap-2 rounded-md border-white/15 bg-transparent text-sm"
            aria-label="Assign to campaign"
          >
            <Megaphone className="size-4" aria-hidden />
            <span>Assign to campaign</span>
          </SelectTrigger>
          <SelectContent>
            {campaigns.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.title}
                {c.status !== "live" ? ` (${c.status})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      <Button size="sm" variant="ghost" className={cn("ml-auto", ghostBtn)} onClick={onDone}>
        <X aria-hidden />
        Clear
      </Button>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "approve"
                ? `Approve ${plural(target.length, "creator")}?`
                : confirm === "decline"
                  ? `Decline ${plural(target.length, "creator")}?`
                  : `Pause ${plural(target.length, "creator")}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "approve"
                ? "Each gets a join email with a one-time link to the UGC Hub (valid 7 days), then shows up in Shipping."
                : confirm === "decline"
                  ? "They're signed out and can't sign in. Nothing is emailed. You can approve them later."
                  : "Paused creators can still sign in and read the brief, but can't upload."}
              {target.length < picked.length
                ? ` ${plural(picked.length - target.length, "picked creator is", "picked creators are")} skipped: their status can't move there.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirm === "approve" ? (
            <div className="space-y-4">
              {campaigns.length ? (
                <Field label="Campaign" htmlFor="approve-campaign" hint="New approvals join it.">
                  <Select
                    value={campaignId || "__none"}
                    onValueChange={(v) => setCampaignId(v === "__none" ? "" : v)}
                  >
                    <SelectTrigger id="approve-campaign">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">
                        {live.length === 1 ? "The live campaign" : "Don't assign yet"}
                      </SelectItem>
                      {campaigns.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.title}
                          {c.status !== "live" ? ` (${c.status})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ) : null}
              <CheckRow id="approve-notify" checked={notify} onChange={setNotify}>
                Send the join email
              </CheckRow>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void apply();
              }}
              disabled={bulk.busy || !target.length}
              className={
                confirm === "decline"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
            >
              {bulk.busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {confirm === "approve" ? "Approve" : confirm === "decline" ? "Decline" : "Pause"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SeedButton({ reset }: { reset: boolean }) {
  const { pending, run } = useRun();
  const [logins, setLogins] = useState<{ email: string; creatorName: string; status: string }[]>(
    [],
  );
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={`h-9 bg-black/30 backdrop-blur ${outlineBtn}`}
        disabled={!!pending}
        onClick={async () => {
          const r = await run(
            "seed",
            () => adminSeedUgcSample({ data: { reset } }),
            (res) =>
              res.ok ? `Sample data loaded (${plural(res.logins.length, "creator")})` : null,
          );
          if (r?.ok) setLogins(r.logins);
        }}
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <FlaskConical aria-hidden />}
        {reset ? "Reset sample data" : "Load sample data"}
      </Button>
      <AlertDialog open={logins.length > 0} onOpenChange={(o) => !o && setLogins([])}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Sample creators</AlertDialogTitle>
            <AlertDialogDescription>
              Sign in as any of these at /ugc-hub/sign-in (the link shows on the next screen, since
              email isn't set up here). Applicants and declined creators can't sign in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-72 divide-y divide-white/[0.06] overflow-y-auto rounded-xl border border-white/[0.06] bg-black/25 text-sm">
            {logins.map((l) => (
              <li key={l.email} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{l.creatorName}</span>
                  <span className="mono block truncate text-[11px] text-muted-foreground">
                    {l.email}
                  </span>
                </span>
                <UgcStatusPill status={l.status as UgcStatus} />
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogAction>Done</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
