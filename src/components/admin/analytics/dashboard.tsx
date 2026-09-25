import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { clearSampleData, getDashboard, loadSampleData } from "@/lib/ar/analytics.functions";
import type { RangeId } from "@/lib/ar/analytics.server";
import { cn } from "@/lib/utils";

import { formatTime, isUnauthorized } from "../format";
import { NamespaceBadge, PageHeader, Panel, SignInAgain } from "../kit";
import { TrackingToggle } from "../tracking-toggle";
import { Breakdowns } from "./breakdowns";
import { ClientsTable } from "./clients-table";
import { EmptyState } from "./empty-state";
import { FilterBar, type Filters } from "./filters";
import { Funnel } from "./funnel";
import { KpiRow } from "./kpis";
import { SessionSheet } from "./session-sheet";
import { SessionsList } from "./sessions-list";
import { VisitsChart } from "./visits-chart";

export interface AnalyticsSearch {
  range?: RangeId;
  demo?: string;
  client?: string;
  /** the visit open in the drawer */
  s?: string;
}

const DEFAULT_RANGE: RangeId = "30d";

function SkeletonPanel({ className }: { className?: string }) {
  return (
    <Panel className={cn("p-5", className)}>
      <div className="h-4 w-32 animate-pulse rounded bg-white/[0.06]" />
      <div className="mt-2 h-3 w-56 max-w-full animate-pulse rounded bg-white/[0.04]" />
      <div className="mt-6 h-[calc(100%-4rem)] min-h-24 animate-pulse rounded-md bg-white/[0.03]" />
    </Panel>
  );
}

export function AnalyticsDashboard({
  search,
  onSearch,
}: {
  search: AnalyticsSearch;
  onSearch: (patch: Partial<AnalyticsSearch>) => void;
}) {
  const filters: Filters = {
    range: search.range ?? DEFAULT_RANGE,
    demo: search.demo ?? "all",
    client: search.client ?? "all",
  };

  // Ranges and day buckets follow the viewer's calendar, which only the browser knows.
  const [tz, setTz] = useState<string | null>(null);
  useEffect(() => {
    let zone = "UTC";
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      /* keep UTC */
    }
    setTz(zone);
  }, []);

  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["ar-dashboard", filters.range, filters.demo, filters.client, tz],
    queryFn: () =>
      getDashboard({
        data: { range: filters.range, demo: filters.demo, client: filters.client, tz: tz ?? "UTC" },
      }),
    enabled: tz !== null,
    placeholderData: keepPreviousData,
    // every minute while the tab is visible (react-query pauses it in the background)
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: (n, err) => !isUnauthorized(err) && n < 2,
  });
  const data = q.data;

  const sample = useMutation({
    mutationFn: () => loadSampleData(),
    onSuccess: (r) => {
      toast.success(`Added ${r.sessions} sample visits and ${r.links} sample client links`);
      void qc.invalidateQueries({ queryKey: ["ar-dashboard"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't add sample data"),
  });
  const clear = useMutation({
    mutationFn: () => clearSampleData(),
    onSuccess: (r) => {
      toast.success(`Removed ${r.sessions} sample visits and ${r.links} sample links`);
      void qc.invalidateQueries({ queryKey: ["ar-dashboard"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't remove sample data"),
  });

  function setFilters(patch: Partial<Filters>) {
    const next: Partial<AnalyticsSearch> = {};
    if (patch.range) next.range = patch.range === DEFAULT_RANGE ? undefined : patch.range;
    if (patch.demo !== undefined) next.demo = patch.demo === "all" ? undefined : patch.demo;
    if (patch.client !== undefined) next.client = patch.client === "all" ? undefined : patch.client;
    onSearch(next);
  }

  function selectClient(id: string) {
    setFilters({ client: filters.client === id ? "all" : id });
    document.getElementById("ar-filters")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const demoLabels = new Map((data?.filters.demos ?? []).map((d) => [d.id, d.label]));
  const openRow = data?.sessions.find((r) => r.key === search.s);
  const unauthorized = q.isError && isUnauthorized(q.error);
  const filtered = filters.demo !== "all" || filters.client !== "all";

  return (
    <>
      <Toaster theme="dark" position="bottom-right" />
      <PageHeader
        title="Analytics"
        badge={<NamespaceBadge ns={data?.ns} />}
        actions={
          <div className="flex flex-wrap items-start gap-2">
            <TrackingToggle className="max-w-[15rem]" />
            <div className="flex flex-col items-start gap-1 sm:items-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void q.refetch()}
                disabled={q.isFetching || tz === null}
                className="h-9 bg-transparent hover:bg-white/[0.06] hover:text-foreground"
              >
                <RefreshCw className={cn(q.isFetching && "animate-spin")} aria-hidden />
                Refresh
              </Button>
              <span className="text-[11px] text-muted-foreground" aria-live="polite">
                {data ? `Updated ${formatTime(data.generatedAt)}` : " "}
              </span>
            </div>
          </div>
        }
      >
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Who opened the demos, for how long, and what they did.
        </p>
      </PageHeader>

      <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        {unauthorized ? (
          <SignInAgain />
        ) : q.isError && !data ? (
          <Panel className="mx-auto max-w-md p-6 text-center">
            <h2 className="text-base font-medium">Couldn't load analytics</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Check your connection and try again.
            </p>
            <Button className="mt-4" onClick={() => void q.refetch()}>
              Try again
            </Button>
          </Panel>
        ) : data && !data.hasAnyData ? (
          <EmptyState
            ns={data.ns}
            onLoadSample={() => sample.mutate()}
            loadingSample={sample.isPending}
          />
        ) : (
          <>
            <div id="ar-filters" className="scroll-mt-20">
              <FilterBar value={filters} options={data?.filters} onChange={setFilters} />
            </div>

            {data && data.ns !== "prod" && data.sampleCount > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-amber-400/30 bg-amber-400/[0.06] px-4 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <FlaskConical className="size-4 shrink-0 text-amber-300" aria-hidden />
                  Includes {data.sampleCount} sample visit{data.sampleCount === 1 ? "" : "s"}:
                  made-up data for trying the dashboard.
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => clear.mutate()}
                  disabled={clear.isPending}
                  className="-mr-2 text-amber-200 hover:bg-amber-400/10 hover:text-amber-100"
                >
                  {clear.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                  Remove sample data
                </Button>
              </div>
            ) : null}

            {data && filtered && data.totals.opens === 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground">
                Nothing matches these filters in this range.
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFilters({ demo: "all", client: "all" })}
                  className="-mr-2 hover:bg-white/[0.06] hover:text-foreground"
                >
                  Clear filters
                </Button>
              </div>
            ) : null}

            {/* A refetch holds the previous numbers, dimmed, instead of flashing skeletons. */}
            <div
              className={cn(
                "space-y-5 transition-opacity duration-200",
                q.isPlaceholderData && q.isFetching && "opacity-60",
              )}
              aria-busy={q.isFetching}
            >
              <KpiRow data={data} />
              {data ? (
                <>
                  <ClientsTable data={data} selected={filters.client} onSelect={selectClient} />
                  <div className="grid gap-4 @5xl/inset:grid-cols-5">
                    <VisitsChart data={data} className="@5xl/inset:col-span-3" />
                    <Funnel data={data} className="@5xl/inset:col-span-2" />
                  </div>
                  <SessionsList data={data} onOpen={(key) => onSearch({ s: key })} />
                  <Breakdowns data={data} />
                </>
              ) : (
                <>
                  <SkeletonPanel className="h-72" />
                  <div className="grid gap-4 @5xl/inset:grid-cols-5">
                    <SkeletonPanel className="h-80 @5xl/inset:col-span-3" />
                    <SkeletonPanel className="h-80 @5xl/inset:col-span-2" />
                  </div>
                  <SkeletonPanel className="h-96" />
                </>
              )}
            </div>
          </>
        )}
      </div>

      <SessionSheet
        sessionKey={search.s ?? null}
        row={openRow}
        demoName={(id) => demoLabels.get(id) ?? id}
        onOpenChange={(open) => !open && onSearch({ s: undefined })}
        onFilterClient={(id) => {
          onSearch({ s: undefined, client: id });
        }}
      />
    </>
  );
}
