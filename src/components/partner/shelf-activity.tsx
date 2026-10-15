/**
 * "Who opened your shelf": a partner team's view of what happened on the
 * shelves it sends creators. The numbers come from the same visit records as
 * /admin/analytics (src/lib/shelf/partner-shelf-stats.functions.ts), last 30
 * days, the team's own shelves only.
 *
 *  - ShelfActivitySheet: one shelf's opens, visitors, taps and recent visits
 *  - ShelfActivityCard: the Home card with the team's most-opened shelves
 *  - useShelfOpens: the opens count for the editor's toolbar
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Eye,
  Hand,
  Monitor,
  RotateCcw,
  Send,
  Smartphone,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { Sparkline } from "@/components/hub/app/earnings-chart";
import { HubLink } from "@/components/hub/app/hub-link";
import { Monogram } from "@/components/hub/app/ui";
import { IconTile, Surface, Tag, type TileTone } from "@/components/partner/ui";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { timeAgo } from "@/lib/hub/model";
import {
  partnerShelfStatsFn,
  type PartnerShelfStats,
  type ShelfVisit,
} from "@/lib/shelf/partner-shelf-stats.functions";
import { cn } from "@/lib/utils";

const STALE = 30_000;

const statsKey = (slug: string | null) => ["partner-shelf-stats", slug] as const;

/** One shelf's stats (and the team's list). Shared by the toolbar count and the sheet. */
function useShelfStats(slug: string, enabled = true) {
  return useQuery({
    queryKey: statsKey(slug),
    queryFn: () => partnerShelfStatsFn({ data: { slug } }),
    staleTime: STALE,
    enabled,
  });
}

/** The opens count for a shelf, for the editor's toolbar. */
export function useShelfOpens(slug: string): { opens: number; lastAt: number | null } | undefined {
  const { data } = useShelfStats(slug);
  const cur = data?.current;
  return cur ? { opens: cur.opens, lastAt: cur.lastAt } : undefined;
}

/** "1m 20s", "45s", "1h 5m" */
function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

const ordinal = (n: number) => {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};

/* ---------------------------------------------------------------------------
   The sheet
   --------------------------------------------------------------------------- */

export function ShelfActivitySheet({
  slug,
  open,
  onOpenChange,
}: {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const phone = useIsMobile();
  // Refreshes when opened (after 30 s), so a rep watching for a creator sees it land.
  const q = useShelfStats(slug, open);
  const cur = q.data?.current ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={phone ? "bottom" : "right"}
        className={cn(
          "glass-strong flex flex-col gap-0 overflow-hidden p-0",
          phone ? "max-h-[88dvh] rounded-t-[28px]" : "w-full sm:max-w-md",
        )}
        style={phone ? { paddingBottom: "env(safe-area-inset-bottom)" } : undefined}
      >
        <SheetHeader className="shrink-0 border-b border-white/[0.06] px-5 pt-5 pb-4 text-left">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-[var(--partner)] uppercase">
            Shelf activity
          </p>
          <SheetTitle className="pr-8 text-xl font-semibold tracking-tight">
            {cur ? `Who opened ${cur.creator}'s shelf` : "Who opened this shelf"}
          </SheetTitle>
          <SheetDescription>Last 30 days, from the link you send creators.</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-6">
          {q.isPending ? (
            <SheetSkeleton />
          ) : q.isError || !cur ? (
            <div className="grid justify-items-start gap-3 py-6 text-sm text-muted-foreground">
              <p>Couldn't load this shelf's activity.</p>
              <Button variant="outline" size="sm" onClick={() => void q.refetch()}>
                <RotateCcw aria-hidden /> Try again
              </Button>
            </div>
          ) : (
            <>
              <ul className="grid grid-cols-2 gap-2.5">
                <StatTile icon={Eye} tone="ice" label="Opens" value={cur.opens} />
                <StatTile icon={UserRound} tone="blue" label="Visitors" value={cur.visitors} />
                <StatTile icon={Hand} tone="violet" label="Product taps" value={cur.productTaps} />
                <StatTile icon={Send} tone="mint" label="Apply clicks" value={cur.applyClicks} />
              </ul>

              <Surface className="mt-2.5 px-4 pt-3 pb-2">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="font-medium">Opens, last 14 days</span>
                  <span className="text-muted-foreground tabular-nums">
                    {cur.series.reduce((a, b) => a + b, 0)}
                  </span>
                </div>
                <Sparkline values={cur.series} color="var(--partner)" className="mt-1.5 h-14" />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>2 weeks ago</span>
                  <span>Today</span>
                </div>
              </Surface>

              <h3 className="mt-6 mb-2.5 text-sm font-semibold">Recent visits</h3>
              {cur.recent.length ? (
                <ul className="grid gap-2">
                  {cur.recent.map((v, i) => (
                    <VisitRow key={`${v.at}-${i}`} v={v} />
                  ))}
                </ul>
              ) : (
                <EmptyState>No opens yet. Send the link and every open shows up here.</EmptyState>
              )}
              <p className="mt-4 text-xs text-muted-foreground">
                Opening the shelf from this editor isn't counted.
              </p>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function StatTile({
  icon,
  tone,
  label,
  value,
}: {
  icon: LucideIcon;
  tone: TileTone;
  label: string;
  value: number;
}) {
  return (
    <Surface as="li" className="flex items-center gap-3 p-3">
      <IconTile icon={icon} tone={tone} size="sm" />
      <span className="min-w-0">
        <span className="block text-xl leading-tight font-semibold tracking-tight tabular-nums">
          {value.toLocaleString()}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{label}</span>
      </span>
    </Surface>
  );
}

function VisitRow({ v }: { v: ShelfVisit }) {
  const Device = v.device === "mobile" ? Smartphone : Monitor;
  return (
    <Surface as="li" className="rounded-xl p-3">
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-white/[0.06] text-muted-foreground ring-1 ring-white/10 ring-inset"
          title={v.device === "mobile" ? "Phone" : "Computer"}
        >
          <Device className="size-4" aria-hidden />
          <span className="sr-only">{v.device === "mobile" ? "On a phone" : "On a computer"}</span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{v.place}</span>
            {v.applied ? (
              <Tag tone="mint" className="shrink-0">
                Applied
              </Tag>
            ) : null}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            <time dateTime={new Date(v.at).toISOString()}>{timeAgo(v.at)}</time>
            {" · "}
            {formatDuration(v.activeMs)}
            {v.visitNo > 1 ? ` · ${ordinal(v.visitNo)} visit` : null}
          </div>
          {v.products.length ? (
            <ul className="mt-2 flex flex-wrap gap-1" aria-label="Products tapped">
              {v.products.map((p) => (
                <li key={p}>
                  <Tag tone="ice" className="h-5 px-2 text-[10.5px]">
                    {p}
                  </Tag>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </Surface>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-white/[0.12] p-4 text-sm text-muted-foreground">
      <IconTile icon={Send} tone="ice" size="sm" />
      <p>{children}</p>
    </div>
  );
}

function SheetSkeleton() {
  return (
    <div aria-busy aria-label="Loading">
      <div className="grid grid-cols-2 gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[62px] rounded-2xl bg-white/[0.06]" />
        ))}
      </div>
      <Skeleton className="mt-2.5 h-[104px] rounded-2xl bg-white/[0.06]" />
      <Skeleton className="mt-6 mb-2.5 h-4 w-28 bg-white/[0.06]" />
      <div className="grid gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[68px] rounded-xl bg-white/[0.06]" />
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   The Home card
   --------------------------------------------------------------------------- */

/** An element's width, for leaving the sparkline out of narrow cards. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export function ShelfActivityCard({ className }: { className?: string }) {
  const q = useQuery({
    queryKey: statsKey(null),
    queryFn: () => partnerShelfStatsFn({ data: {} }),
    staleTime: STALE,
  });
  const top = (q.data?.shelves ?? []).filter((s) => s.opens > 0).slice(0, 3);
  const [box, width] = useWidth<HTMLDivElement>();

  return (
    <Surface as="section" className={cn("p-4 sm:p-5", className)}>
      <div ref={box} className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">Shelf activity</h2>
          <p className="text-sm text-muted-foreground">Your most-opened shelves, last 30 days.</p>
        </div>
        <HubLink
          to="/partner-hub/shelves"
          className="shrink-0 pt-1 text-sm text-[var(--partner)] hover:underline focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none"
        >
          All shelves
        </HubLink>
      </div>

      {q.isPending ? (
        <div className="mt-3 grid gap-2" aria-busy aria-label="Loading">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[58px] rounded-xl bg-white/[0.06]" />
          ))}
        </div>
      ) : q.isError ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Couldn't load shelf activity.{" "}
          <button
            type="button"
            onClick={() => void q.refetch()}
            className="text-[var(--partner)] underline-offset-2 hover:underline"
          >
            Try again
          </button>
        </p>
      ) : top.length ? (
        <ul className="mt-3 grid gap-2">
          {top.map((s) => (
            <ActivityRow key={s.slug} s={s} spark={width >= 380} />
          ))}
        </ul>
      ) : (
        <div className="mt-3">
          <EmptyState>
            No opens yet. Send a creator their shelf link and every open shows up here.
          </EmptyState>
        </div>
      )}
    </Surface>
  );
}

function ActivityRow({ s, spark }: { s: PartnerShelfStats["shelves"][number]; spark: boolean }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <Monogram name={s.creator} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{s.creator}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {s.lastAt ? `Opened ${timeAgo(s.lastAt)}` : "Not opened yet"}
        </span>
      </span>
      {spark ? (
        <Sparkline values={s.series} color="var(--partner)" className="h-8 w-20 shrink-0" />
      ) : null}
      <span className="w-12 shrink-0 text-right">
        <span className="block text-base leading-tight font-semibold tabular-nums">
          {s.opens.toLocaleString()}
        </span>
        <span className="block text-[11px] text-muted-foreground">
          {s.opens === 1 ? "open" : "opens"}
        </span>
      </span>
      <HubLink
        to={`/partner-hub/shelves?shelf=${encodeURIComponent(s.slug)}`}
        aria-label={`View ${s.creator}'s shelf`}
        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-[var(--partner)]/15 px-3 text-xs font-medium text-[var(--partner)] transition-colors hover:bg-[var(--partner)] hover:text-[var(--partner-ink)] focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none"
      >
        View <ArrowRight className="size-3.5" aria-hidden />
      </HubLink>
    </li>
  );
}
