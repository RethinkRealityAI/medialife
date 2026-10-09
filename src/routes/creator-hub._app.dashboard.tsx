import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity as ActivityIcon,
  ArrowRight,
  CheckCircle2,
  Clock,
  Clock3,
  Coins,
  Hand,
  Hourglass,
  Info,
  Kanban,
  LineChart,
  PauseCircle,
  Radio,
  ScanLine,
  ShoppingBag,
  Sparkles,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { ActivityFeed } from "@/components/hub/app/activity-feed";
import { HubLink } from "@/components/hub/app/app-shell";
import { METRICS, Sparkline, TrendChart, periodDelta } from "@/components/hub/app/earnings-chart";
import { Delta, Kpi } from "@/components/hub/app/kpi";
import {
  ActionButton,
  ActionThumb,
  NeedsYouRows,
  useNeedsYou,
} from "@/components/hub/app/needs-you";
import { ProductThumb } from "@/components/hub/app/product-card";
import { ResponsiveDrawer } from "@/components/hub/app/responsive-drawer";
import { STAGE_COLORS, StageDistribution } from "@/components/hub/app/stage-track";
import { Card, Page, cardActionClass } from "@/components/hub/app/ui";
import {
  PRE_APPROVAL,
  pipelineOrder,
  useHubSession,
  useWorkspace,
  type Workspace,
  type WsProduct,
} from "@/components/hub/app/workspace";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getEarnings } from "@/lib/hub/creator.functions";
import { HUB, compact, money, shortDate, stageOf } from "@/lib/hub/model";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/creator-hub/_app/dashboard")({
  head: () => ({ meta: [{ title: "Home · Creator Hub | MEDIALIFE" }] }),
  // Sixty days, so every trend can be compared with the thirty days before it.
  loader: () => getEarnings({ data: { days: 60 } }),
  staleTime: 30_000,
  pendingComponent: HomeSkeleton,
  component: Dashboard,
});

const BENTO = "grid grid-cols-2 gap-3 sm:gap-4 @3xl/inset:grid-cols-6 @5xl/inset:grid-cols-12";

function Dashboard() {
  const ws = useWorkspace();
  const session = useHubSession();
  const name = ws.creator.profile.displayName || "there";

  if (PRE_APPROVAL.has(ws.creator.status)) return <PreApproval ws={ws} name={name} />;

  const live = ws.products.filter((p) => p.stage === "live").length;

  return (
    <Page className="lg:pt-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
        <div>
          <h1 className="text-2xl font-medium tracking-tight sm:text-[1.75rem]">Hi, {name}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {ws.products.length
              ? `${ws.products.length} product${ws.products.length === 1 ? "" : "s"} in your program · ${live} on sale`
              : "Your products will appear here once your manager sets them up."}
          </p>
        </div>
        {session.user.emailVerified ? null : (
          <span className="text-xs text-amber-300">Confirm your email to keep payouts safe</span>
        )}
      </header>

      <div className={BENTO}>
        <NextUp ws={ws} className="col-span-2 @3xl/inset:col-span-6 @5xl/inset:col-span-8" />
        <GoLiveCard className="order-last col-span-2 @3xl/inset:col-span-6 @5xl/inset:order-none @5xl/inset:col-span-4" />
        <Kpis ws={ws} />
        <PipelineCard ws={ws} className="col-span-2 @3xl/inset:col-span-6 @5xl/inset:col-span-5" />
        <EarningsCard ws={ws} className="col-span-2 @3xl/inset:col-span-3 @5xl/inset:col-span-4" />
        <ActivityCard ws={ws} className="col-span-2 @3xl/inset:col-span-3 @5xl/inset:col-span-3" />
      </div>
    </Page>
  );
}

/* ---------------------------------------------------------------------------
   Next up — the single most important thing
   --------------------------------------------------------------------------- */

function NextUp({ ws, className }: { ws: Workspace; className?: string }) {
  const { items, open } = useNeedsYou();
  const first = items[0];
  const more = items.length - 1;

  if (!first) {
    const upcoming = ws.products
      .filter((p) => p.stage !== "live" && p.eta)
      .sort((a, b) => (a.eta ?? "").localeCompare(b.eta ?? ""))[0];
    return (
      <section
        aria-labelledby="next-title"
        className={cn(
          "flex flex-col justify-center rounded-xl border border-emerald-400/30 bg-[radial-gradient(ellipse_at_top_left,oklch(0.7_0.15_160/14%),transparent_60%)] p-5 sm:p-6",
          className,
        )}
      >
        <div className="flex items-center gap-2 text-sm text-emerald-300">
          <CheckCircle2 className="size-4" aria-hidden /> You're all caught up
        </div>
        <h2 id="next-title" className="mt-2 text-xl font-medium tracking-tight">
          {upcoming
            ? `${upcoming.name} goes on sale around ${shortDate(upcoming.eta!)}`
            : "Nothing needs you right now"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {upcoming
            ? upcoming.nextStep || "The team is on it. We'll let you know if we need anything."
            : "We'll let you know the moment something does."}
        </p>
        {upcoming ? (
          <div className="mt-4">
            <Button asChild variant="outline" size="sm">
              <Link to="/creator-hub/products/$productId" params={{ productId: upcoming.id }}>
                Open product <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section
      aria-labelledby="next-title"
      className={cn(
        "relative flex gap-4 overflow-hidden rounded-xl border border-amber-400/40 bg-[radial-gradient(ellipse_at_top_left,oklch(0.8_0.15_80/12%),transparent_55%)] p-4 sm:gap-5 sm:p-5",
        className,
      )}
    >
      <ActionThumb item={first} className="size-24 rounded-xl sm:size-32 @5xl/inset:size-36" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-amber-300 uppercase">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full rounded-full bg-amber-400 opacity-60 motion-safe:animate-ping" />
            <span className="relative inline-flex size-2 rounded-full bg-amber-400" />
          </span>
          Next up
        </div>
        <h2
          id="next-title"
          className="mt-1.5 text-lg leading-snug font-medium tracking-tight sm:text-xl"
        >
          {first.title}
        </h2>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{first.body}</p>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
          <ActionButton item={first} size="default" />
          {more > 0 ? (
            <Button type="button" variant="ghost" onClick={open} className="text-muted-foreground">
              +{more} more need{more === 1 ? "s" : ""} you
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   Go live promo
   --------------------------------------------------------------------------- */

function GoLiveCard({ className }: { className?: string }) {
  return (
    <section
      aria-labelledby="golive-title"
      className={cn(
        "relative flex flex-col overflow-hidden rounded-xl border border-accent/35 p-5",
        className,
      )}
      style={{
        background:
          "radial-gradient(120% 90% at 100% 0%, oklch(0.68 0.26 350 / 22%), transparent 55%), radial-gradient(90% 80% at 0% 100%, oklch(0.72 0.16 240 / 18%), transparent 60%)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="grid size-9 place-items-center rounded-full bg-accent/15 text-[oklch(0.85_0.13_350)]">
          <Radio className="size-4 motion-safe:animate-pulse" aria-hidden />
        </span>
        <span className="rounded-full border border-accent/40 px-2 py-0.5 text-[10px] font-medium tracking-wide text-[oklch(0.85_0.13_350)] uppercase">
          New
        </span>
      </div>
      <h2 id="golive-title" className="mt-3 text-base font-medium">
        Go live with your merch
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        Add a sales overlay to OBS. Every order pops up on stream while you're live.
      </p>
      <div className="mt-auto pt-4">
        <HubLink
          to="/creator-hub/live"
          className="btn-pill btn-ember inline-flex h-9 items-center gap-2 px-4 text-sm font-medium"
        >
          Set up the overlay <ArrowRight className="size-4" aria-hidden />
        </HubLink>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   KPI tiles
   --------------------------------------------------------------------------- */

function Kpis({ ws }: { ws: Workspace }) {
  const e = Route.useLoaderData();
  const cur = ws.earnings.currency;
  const earned = periodDelta(e.trend, "earned");
  const units = periodDelta(e.trend, "units");
  const last30 = e.trend.slice(-30);
  const s = e.summary;
  const scanRows = [...ws.products]
    .filter((p) => p.scans > 0)
    .sort((a, b) => b.scans - a.scans)
    .slice(0, 4);
  const scanMax = Math.max(1, ...scanRows.map((p) => p.scans));
  const span = "col-span-1 @3xl/inset:col-span-3 @5xl/inset:col-span-3";

  return (
    <>
      <Kpi
        className={span}
        label="Earned all-time"
        icon={Coins}
        value={money(s.earned, cur)}
        delta={earned.change}
        hint={`${money(earned.cur, cur)} in the last 30 days`}
        chart={<Sparkline values={last30.map((d) => d.earned)} />}
        link={{ to: "/creator-hub/earnings", label: "View earnings" }}
        emphasis
      />
      <Kpi
        className={span}
        label="Ready to pay out"
        icon={Wallet}
        value={money(s.available, cur)}
        explain={`Earnings from orders older than ${HUB.holdDays} days (the returns window) that we haven't paid you yet. They go out with the next payout.`}
        hint={`${money(s.pending, cur)} pending · ${money(s.paid, cur)} paid`}
        chart={<EarnedSplit paid={s.paid} available={s.available} pending={s.pending} />}
        link={{ to: "/creator-hub/earnings", label: "View payouts" }}
      />
      <Kpi
        className={span}
        label="Units sold"
        icon={ShoppingBag}
        value={compact(s.units)}
        delta={units.change}
        hint={`${compact(units.cur)} in the last 30 days`}
        chart={<Sparkline values={last30.map((d) => d.units)} color={METRICS.units.color} />}
        link={{ to: "/creator-hub/earnings", label: "View sales" }}
      />
      <Kpi
        className={span}
        label="Scans"
        icon={ScanLine}
        value={compact(ws.scansTotal)}
        explain="How many times fans opened an experience by scanning a QR code or tapping an NFC tag."
        hint={
          scanRows.length
            ? `Across ${scanRows.length} product${scanRows.length === 1 ? "" : "s"}`
            : "Starts when fans have your merch"
        }
        chart={
          scanRows.length ? (
            <ul className="space-y-1" aria-hidden>
              {scanRows.slice(0, 2).map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-2 text-[11px] text-muted-foreground"
                >
                  <span className="w-16 truncate">{p.name}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <span
                      className="block h-full rounded-full bg-primary/80"
                      style={{ width: `${(p.scans / scanMax) * 100}%` }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          ) : null
        }
        link={{ to: "/creator-hub/products", label: "View products" }}
      />
    </>
  );
}

/** Paid / ready / pending as one thin bar: where all-time earnings are now. */
function EarnedSplit({
  paid,
  available,
  pending,
}: {
  paid: number;
  available: number;
  pending: number;
}) {
  const total = paid + available + pending || 1;
  const parts = [
    { k: "Paid", v: paid, c: "bg-emerald-400/80" },
    { k: "Ready", v: available, c: "bg-primary" },
    { k: "Pending", v: pending, c: "bg-white/25" },
  ];
  return (
    <div aria-hidden>
      <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
        {parts.map((p) =>
          p.v ? (
            <span key={p.k} className={p.c} style={{ flexGrow: p.v / total, flexBasis: 0 }} />
          ) : null,
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10px] text-muted-foreground">
        {parts.map((p) => (
          <span key={p.k} className="flex items-center gap-1">
            <span className={cn("size-1.5 rounded-full", p.c)} />
            {p.k}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Pipeline, earnings, activity
   --------------------------------------------------------------------------- */

function PipelineCard({ ws, className }: { ws: Workspace; className?: string }) {
  const top = [...ws.products].sort(pipelineOrder).slice(0, 3);
  return (
    <Card
      title="Pipeline"
      icon={Kanban}
      labelledBy="pipeline-title"
      className={cn("@container", className)}
      action={
        <Link to="/creator-hub/products" className={cardActionClass}>
          All products <ArrowRight aria-hidden />
        </Link>
      }
    >
      {ws.products.length ? (
        <>
          <StageDistribution stages={ws.products.map((p) => p.stage)} />
          <ul className="mt-4 space-y-1 border-t border-border pt-3">
            {top.map((p) => (
              <SlimProductRow key={p.id} product={p} currency={ws.earnings.currency} />
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Your manager sets up your first product after your welcome call. You'll follow it here
          from brief to on sale.
        </p>
      )}
    </Card>
  );
}

function SlimProductRow({ product: p, currency }: { product: WsProduct; currency: string }) {
  const stage = stageOf(p.stage);
  const yours = p.waitingOn === "creator" || p.proofs[p.proofs.length - 1]?.decision === "pending";
  return (
    <li>
      <Link
        to="/creator-hub/products/$productId"
        params={{ productId: p.id }}
        className="group flex items-center gap-3 rounded-lg px-1.5 py-1.5 hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ProductThumb product={p} className="size-9 rounded-md" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium group-hover:text-primary">{p.name}</div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              aria-hidden
              className="size-1.5 rounded-full"
              style={{ background: STAGE_COLORS[p.stage] }}
            />
            {stage.name}
            {p.stage !== "live" ? (
              yours ? (
                <span className="flex items-center gap-1 text-amber-300">
                  · <Hand className="size-3" aria-hidden /> you
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  · <Clock className="size-3" aria-hidden /> MEDIALIFE
                </span>
              )
            ) : null}
          </div>
        </div>
        <div className="shrink-0 text-right text-xs tabular-nums">
          {p.stage === "live" ? (
            <>
              <div className="font-medium text-foreground">{money(p.sales.earned, currency)}</div>
              <div className="text-muted-foreground">{compact(p.sales.units)} sold</div>
            </>
          ) : (
            <>
              <div className="text-muted-foreground">On sale</div>
              <div className="font-medium text-foreground">
                {p.eta ? shortDate(p.eta).replace(/, \d{4}$/, "") : "TBC"}
              </div>
            </>
          )}
        </div>
      </Link>
    </li>
  );
}

function EarningsCard({ ws, className }: { ws: Workspace; className?: string }) {
  const e = Route.useLoaderData();
  const cur = ws.earnings.currency;
  const d = periodDelta(e.trend, "earned");
  const last30 = e.trend.slice(-30);
  return (
    <Card
      title="Earnings · 30 days"
      icon={LineChart}
      labelledBy="earnings-title"
      className={className}
      action={
        <Link to="/creator-hub/earnings" className={cardActionClass}>
          View earnings <ArrowRight aria-hidden />
        </Link>
      }
    >
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-medium tracking-tight tabular-nums">
          {money(d.cur, cur)}
        </span>
        <Delta value={d.change} label="vs previous 30 days" />
      </div>
      {d.cur > 0 ? (
        <TrendChart
          data={last30}
          currency={cur}
          minimal
          className="mt-2 h-36 @5xl/inset:h-auto @5xl/inset:min-h-32 @5xl/inset:flex-1"
        />
      ) : (
        <div className="mt-3 grid flex-1 place-items-center rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          Your earnings show here from your first sale.
        </div>
      )}
    </Card>
  );
}

function ActivityCard({ ws, className }: { ws: Workspace; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Card
      title="Activity"
      icon={ActivityIcon}
      labelledBy="activity-title"
      className={className}
      action={
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cardActionClass}
          aria-haspopup="dialog"
        >
          View all <ArrowRight aria-hidden />
        </button>
      }
    >
      <ActivityFeed items={ws.activity} limit={4} compact />
      <ResponsiveDrawer
        open={open}
        onOpenChange={setOpen}
        title="Activity"
        description="Everything that's happened in your program, newest first."
      >
        <ActivityFeed items={ws.activity} onNavigate={() => setOpen(false)} />
      </ResponsiveDrawer>
    </Card>
  );
}

/* ---------------------------------------------------------------------------
   Before approval: where the application is, and what happens next
   --------------------------------------------------------------------------- */

const HERO: Record<
  "submitted" | "waitlist" | "declined" | "paused",
  { icon: LucideIcon; title: string; body: (email: string) => string; tone: string }
> = {
  submitted: {
    icon: Clock3,
    title: "Your application is in review",
    body: (email) =>
      `Thanks for applying. A real person reads every application. You'll hear from us within 2 business days at ${email}. There's nothing else you need to do.`,
    tone: "border-primary/40 bg-primary/[0.06]",
  },
  waitlist: {
    icon: Hourglass,
    title: "You're on the waitlist",
    body: () =>
      "We launch creators in small groups so every drop gets proper attention. Your application is saved and we'll email you as soon as a spot opens. You don't need to reapply.",
    tone: "border-amber-400/40 bg-amber-400/[0.06]",
  },
  declined: {
    icon: Info,
    title: "Not a fit right now",
    body: () =>
      "Thanks for applying. We can't take your channel into the program at the moment. Channels grow and our catalogue changes, so if anything's different, update your details and write to us.",
    tone: "border-border bg-white/[0.03]",
  },
  paused: {
    icon: PauseCircle,
    title: "Your account is paused",
    body: () =>
      "Your products, files and earnings are safe. Nothing new is being made while the account is paused. Write to us and we'll explain what's needed to pick things back up.",
    tone: "border-amber-400/40 bg-amber-400/[0.06]",
  },
};

const STEPS = [
  { id: "applied", label: "You applied" },
  { id: "review", label: "We review your channel" },
  { id: "call", label: "Welcome call with your manager" },
  { id: "brief", label: "Your first product brief" },
];

function PreApproval({ ws, name }: { ws: Workspace; name: string }) {
  const { items } = useNeedsYou();
  const verify = items.filter((i) => i.kind === "verify");
  const status = ws.creator.status as keyof typeof HERO;
  const hero = HERO[status];
  const at = status === "submitted" || status === "waitlist" ? 1 : -1;

  return (
    <Page className="lg:pt-8">
      <h1 className="text-2xl font-medium tracking-tight sm:text-[1.75rem]">Hi, {name}</h1>
      <section
        aria-labelledby="status-title"
        className={cn("mt-5 rounded-2xl border p-5 sm:p-7", hero.tone)}
      >
        <hero.icon className="size-7 text-primary" aria-hidden />
        <h2 id="status-title" className="mt-3 text-xl font-medium tracking-tight sm:text-2xl">
          {hero.title}
        </h2>
        <p className="mt-2 max-w-2xl leading-relaxed text-muted-foreground">
          {hero.body(ws.creator.profile.email || "your email")}
        </p>
        {at >= 0 ? (
          <ol className="mt-5 grid grid-cols-1 gap-2 @3xl/inset:grid-cols-4">
            {STEPS.map((s, i) => (
              <li
                key={s.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3 text-sm",
                  i < at && "border-border bg-white/[0.03]",
                  i === at && "border-primary/50 bg-background/40",
                  i > at && "border-dashed border-border text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
                    i < at
                      ? "bg-primary text-background"
                      : i === at
                        ? "border-2 border-primary"
                        : "border border-border",
                  )}
                >
                  {i < at ? <CheckCircle2 className="size-4" aria-hidden /> : i + 1}
                </span>
                <span className="min-w-0">
                  {status === "waitlist" && s.id === "review" ? "Waiting for a spot" : s.label}
                  {i === 0 && ws.creator.submittedAt ? (
                    <span className="block text-xs text-muted-foreground">
                      {shortDate(ws.creator.submittedAt)}
                    </span>
                  ) : null}
                  <span className="sr-only">
                    {i < at ? " (done)" : i === at ? " (now)" : " (next)"}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/creator-hub/account">Edit your application details</Link>
          </Button>
          <Button asChild variant="outline">
            <a href={`mailto:${HUB.supportEmail}`}>Write to {HUB.supportEmail}</a>
          </Button>
        </div>
      </section>
      {verify.length ? (
        <div className="mt-4 max-w-xl">
          <NeedsYouRows items={verify} />
        </div>
      ) : null}
      <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkles className="size-4 text-primary" aria-hidden />
        Once you're approved, your products, earnings and launch kit appear here.
      </p>
    </Page>
  );
}

/* ---------------------------------------------------------------------------
   Loading
   --------------------------------------------------------------------------- */

function HomeSkeleton() {
  return (
    <Page className="lg:pt-8">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="mt-2 h-4 w-64" />
      <div className={cn(BENTO, "mt-5")}>
        <Skeleton className="col-span-2 h-44 rounded-xl @3xl/inset:col-span-6 @5xl/inset:col-span-8" />
        <Skeleton className="col-span-2 h-44 rounded-xl @3xl/inset:col-span-6 @5xl/inset:col-span-4" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="col-span-1 h-32 rounded-xl @3xl/inset:col-span-3" />
        ))}
        <Skeleton className="col-span-2 h-72 rounded-xl @3xl/inset:col-span-6 @5xl/inset:col-span-5" />
        <Skeleton className="col-span-2 h-72 rounded-xl @3xl/inset:col-span-3 @5xl/inset:col-span-4" />
        <Skeleton className="col-span-2 h-72 rounded-xl @3xl/inset:col-span-3 @5xl/inset:col-span-3" />
      </div>
    </Page>
  );
}
