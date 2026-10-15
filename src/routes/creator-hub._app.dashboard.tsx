import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity as ActivityIcon,
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  Clock,
  Clock3,
  Coins,
  Factory,
  FolderOpen,
  Hand,
  Hourglass,
  Info,
  Kanban,
  LineChart,
  Mail,
  Package,
  Palette,
  PauseCircle,
  Radio,
  ScanLine,
  ShoppingBag,
  Sparkles,
  Store,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { ActivityFeed } from "@/components/hub/app/activity-feed";
import { HubLink } from "@/components/hub/app/hub-link";
import { METRICS, Sparkline, TrendChart, periodDelta } from "@/components/hub/app/earnings-chart";
import { Delta, Kpi } from "@/components/hub/app/kpi";
import {
  ART,
  GoChip,
  ImageAction,
  NewBadge,
  PanelTitle,
  Surface,
  Tile,
  accentEdge,
  cornerLink,
  lift,
  surface,
  type Tone,
} from "@/components/hub/app/look";
import {
  ActionButton,
  ActionThumb,
  NeedsYouRows,
  useNeedsYou,
} from "@/components/hub/app/needs-you";
import { ProductThumb, waitingOnYou } from "@/components/hub/app/product-card";
import { ResponsiveDrawer } from "@/components/hub/app/responsive-drawer";
import { STAGE_COLORS } from "@/components/hub/app/stage-track";
import { Page } from "@/components/hub/app/ui";
import {
  PHASES,
  PRE_APPROVAL,
  phaseOf,
  pipelineOrder,
  productImage,
  useHubSession,
  useWorkspace,
  type PhaseId,
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

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function Dashboard() {
  const ws = useWorkspace();
  const name = ws.creator.profile.displayName || "there";

  if (PRE_APPROVAL.has(ws.creator.status)) return <PreApproval ws={ws} name={name} />;

  return (
    <Page>
      <Hero ws={ws} name={name} />
      <Kpis ws={ws} />
      <QuickActions ws={ws} />

      {/* Desktop: two columns. Phones: one, most actionable first. */}
      <div className="mt-8 flex flex-col gap-4 @5xl/inset:grid @5xl/inset:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] @5xl/inset:items-start">
        <div className="contents @5xl/inset:flex @5xl/inset:flex-col @5xl/inset:gap-4">
          <PipelineCard ws={ws} className="order-2 @5xl/inset:order-none" />
          <EarningsCard ws={ws} className="order-3 @5xl/inset:order-none" />
        </div>
        <div className="contents @5xl/inset:flex @5xl/inset:flex-col @5xl/inset:gap-4">
          <AlsoNeedsYou className="order-1 @5xl/inset:order-none" />
          <ActivityCard ws={ws} className="order-4 @5xl/inset:order-none" />
          <GoLiveCard className="order-5 @5xl/inset:order-none" />
        </div>
      </div>
    </Page>
  );
}

/* ---------------------------------------------------------------------------
   Hero: the greeting, and the single most important thing
   --------------------------------------------------------------------------- */

function Hero({ ws, name }: { ws: Workspace; name: string }) {
  const session = useHubSession();
  const e = Route.useLoaderData();
  const live = ws.products.filter((p) => p.stage === "live").length;
  const month = periodDelta(e.trend, "earned").cur;
  const facts = ws.products.length
    ? [
        `${ws.products.length} product${ws.products.length === 1 ? "" : "s"}`,
        `${live} on sale`,
        `${money(month, ws.earnings.currency)} in 30 days`,
      ]
    : ["Your first product is set up after your welcome call"];

  return (
    <section
      aria-labelledby="hello-title"
      className={cn(
        "relative isolate overflow-hidden rounded-3xl border bg-[var(--partner-ink)]",
        accentEdge,
        "shadow-[0_30px_60px_-30px_color-mix(in_oklab,var(--partner-2)_80%,black)]",
      )}
    >
      <img
        src={ART.drop}
        alt=""
        className="absolute inset-0 -z-10 size-full object-cover object-[70%_50%] opacity-85"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgb(8_10_24/0.55)_0%,rgb(8_10_24/0.92)_70%)] @4xl/inset:bg-[linear-gradient(90deg,rgb(8_10_24/0.96)_0%,rgb(8_10_24/0.8)_45%,rgb(8_10_24/0.15)_100%)]"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-[var(--partner)] to-transparent"
      />
      <div className="grid gap-5 p-5 sm:p-7 @4xl/inset:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] @4xl/inset:items-end">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <img src="/brand/medialife-wordmark.webp" alt="MEDIALIFE" className="h-3.5 w-auto" />
            <span className="text-[11px] font-semibold tracking-[0.18em] text-[var(--partner)] uppercase">
              Creator Hub
            </span>
          </div>
          <h1
            id="hello-title"
            className="mt-4 text-2xl font-semibold tracking-tight text-balance sm:text-[2rem]"
          >
            <span suppressHydrationWarning>{greeting()}</span>, {name}.
          </h1>
          <ul className="mt-2 flex flex-wrap gap-1.5 text-xs text-white/80">
            {facts.map((f) => (
              <li
                key={f}
                className="rounded-full bg-white/[0.08] px-2.5 py-1 ring-1 ring-white/10 backdrop-blur ring-inset"
              >
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild className="rounded-full">
              <Link to="/creator-hub/products">
                <Package aria-hidden /> Your products
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full bg-black/30 backdrop-blur">
              <Link to="/creator-hub/launch-kit">
                <BriefcaseBusiness aria-hidden /> Launch kit
              </Link>
            </Button>
          </div>
          {session.user.emailVerified ? null : (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-200">
              <Mail className="size-3.5" aria-hidden /> Confirm your email to keep payouts safe
            </p>
          )}
        </div>
        <NextUp ws={ws} />
      </div>
    </section>
  );
}

function NextUp({ ws }: { ws: Workspace }) {
  const { items, open } = useNeedsYou();
  const first = items[0];
  const more = items.length - 1;

  if (!first) {
    const upcoming = ws.products
      .filter((p) => p.stage !== "live" && p.eta)
      .sort((a, b) => (a.eta ?? "").localeCompare(b.eta ?? ""))[0];
    return (
      <section aria-labelledby="next-title" className="glass rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-emerald-300 uppercase">
          <CheckCircle2 className="size-4" aria-hidden /> All caught up
        </div>
        <h2 id="next-title" className="mt-2 text-lg leading-snug font-semibold tracking-tight">
          {upcoming
            ? `${upcoming.name} goes on sale around ${shortDate(upcoming.eta!)}`
            : "Nothing needs you right now"}
        </h2>
        <p className="mt-1 line-clamp-2 text-sm text-white/70">
          {upcoming
            ? upcoming.nextStep || "The team is on it. We'll shout if we need anything."
            : "We'll let you know the moment something does."}
        </p>
        {upcoming ? (
          <Button asChild variant="outline" size="sm" className="mt-3 rounded-full bg-black/20">
            <Link to="/creator-hub/products/$productId" params={{ productId: upcoming.id }}>
              Open product <ArrowRight aria-hidden />
            </Link>
          </Button>
        ) : null}
      </section>
    );
  }

  return (
    <section aria-labelledby="next-title" className="glass rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-semibold tracking-wide text-amber-300 uppercase">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full rounded-full bg-amber-400 opacity-60 motion-safe:animate-ping" />
            <span className="relative inline-flex size-2 rounded-full bg-amber-400" />
          </span>
          Next up
        </span>
        {more > 0 ? (
          <button
            type="button"
            onClick={open}
            aria-haspopup="dialog"
            aria-label={`See all: ${more} more ${more === 1 ? "thing needs" : "things need"} you`}
            className="rounded-full px-2 py-0.5 text-xs text-white/70 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            +{more} more
          </button>
        ) : null}
      </div>
      <div className="mt-3 flex gap-3.5">
        <ActionThumb item={first} className="size-16 rounded-xl border-white/15 sm:size-20" />
        <div className="min-w-0 flex-1">
          <h2 id="next-title" className="text-base leading-snug font-semibold tracking-tight">
            {first.title}
          </h2>
          <p className="mt-1 line-clamp-2 text-sm text-white/70">{first.body}</p>
        </div>
      </div>
      <ActionButton item={first} size="default" className="mt-4 w-full rounded-full" />
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
    .slice(0, 2);
  const scanMax = Math.max(1, ...scanRows.map((p) => p.scans));

  return (
    <ul className="mt-4 grid grid-cols-2 gap-3 @4xl/inset:grid-cols-4">
      <li className="flex">
        <Kpi
          className="w-full"
          label="Earned"
          icon={Coins}
          tone="mint"
          value={money(s.earned, cur)}
          delta={earned.change}
          hint={`${money(earned.cur, cur)} in 30 days`}
          chart={<Sparkline values={last30.map((d) => d.earned)} />}
          link={{ to: "/creator-hub/earnings", label: "View earnings" }}
          emphasis
        />
      </li>
      <li className="flex">
        <Kpi
          className="w-full"
          label="Ready to pay"
          icon={Wallet}
          tone="ice"
          value={money(s.available, cur)}
          explain={`Earnings from orders older than ${HUB.holdDays} days (the returns window) that we haven't paid you yet. They go out with the next payout.`}
          hint={`${money(s.pending, cur)} pending`}
          chart={<EarnedSplit paid={s.paid} available={s.available} pending={s.pending} />}
          link={{ to: "/creator-hub/earnings", label: "View payouts" }}
        />
      </li>
      <li className="flex">
        <Kpi
          className="w-full"
          label="Units sold"
          icon={ShoppingBag}
          tone="violet"
          value={compact(s.units)}
          delta={units.change}
          hint={`${compact(units.cur)} in 30 days`}
          chart={<Sparkline values={last30.map((d) => d.units)} color={METRICS.units.color} />}
          link={{ to: "/creator-hub/earnings", label: "View sales" }}
        />
      </li>
      <li className="flex">
        <Kpi
          className="w-full"
          label="Scans"
          icon={ScanLine}
          tone="pink"
          value={compact(ws.scansTotal)}
          explain="How many times fans opened an experience by scanning a QR code or tapping an NFC tag."
          hint={scanRows.length ? "Top products" : "Starts when fans have your merch"}
          chart={
            scanRows.length ? (
              <ul className="space-y-1" aria-hidden>
                {scanRows.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-2 text-[11px] text-muted-foreground"
                  >
                    <span className="w-16 truncate">{p.name}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                      <span
                        className="block h-full rounded-full bg-gradient-to-r from-[#f472b6] to-[var(--partner)]"
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
      </li>
    </ul>
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
   Quick actions
   --------------------------------------------------------------------------- */

function QuickActions({ ws }: { ws: Workspace }) {
  const top = [...ws.products].sort(pipelineOrder)[0];
  const actions: Array<{
    href: string;
    image: string;
    position?: string;
    icon: LucideIcon;
    tone: Tone;
    title: string;
    body: string;
    isNew?: boolean;
  }> = [
    {
      href: "/creator-hub/products",
      image: top ? productImage(top) : ART.figure,
      icon: Package,
      tone: "blue",
      title: "Products",
      body: "Every drop, brief to on sale",
    },
    {
      href: "/creator-hub/launch-kit",
      image: ART.mat,
      position: "object-[42%_50%]",
      icon: BriefcaseBusiness,
      tone: "amber",
      title: "Launch kit",
      body: "Posts, QR code and promo files",
    },
    {
      href: "/creator-hub/assets",
      image: ART.cutout,
      position: "object-[50%_35%]",
      icon: FolderOpen,
      tone: "violet",
      title: "Upload assets",
      body: "Logos, art, 3D and video",
    },
    {
      href: "/creator-hub/live",
      image: ART.hoodie,
      position: "object-[50%_30%]",
      icon: Radio,
      tone: "pink",
      title: "Go live",
      body: "Sales alerts on your stream",
      isNew: true,
    },
    {
      href: "/creator-hub/earnings",
      image: ART.fans,
      position: "object-[50%_40%]",
      icon: Coins,
      tone: "mint",
      title: "Earnings",
      body: "Orders, payouts and trends",
    },
  ];

  return (
    <section aria-labelledby="actions-title" className="mt-8">
      <h2 id="actions-title" className="mb-3 text-lg font-semibold tracking-tight">
        Quick actions
      </h2>
      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pt-1 pb-3 [scrollbar-width:none] sm:-mx-6 sm:px-6 @5xl/inset:mx-0 @5xl/inset:grid @5xl/inset:grid-cols-5 @5xl/inset:overflow-visible @5xl/inset:px-0 [&::-webkit-scrollbar]:hidden">
        {actions.map((a) => (
          <li
            key={a.href}
            className="w-[44%] shrink-0 snap-start @3xl/inset:w-[30%] @5xl/inset:w-auto"
          >
            <ImageAction
              href={a.href}
              image={a.image}
              imageClassName={a.position}
              icon={a.icon}
              tone={a.tone}
              title={a.title}
              body={a.body}
              badge={a.isNew ? <NewBadge /> : undefined}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   Pipeline, earnings, activity
   --------------------------------------------------------------------------- */

const PHASE_LOOK: Record<PhaseId, { icon: LucideIcon; tone: Tone; bar: string }> = {
  design: { icon: Palette, tone: "violet", bar: "from-[#a78bfa] to-[var(--partner)]" },
  making: { icon: Factory, tone: "blue", bar: "from-[#6f86d6] to-[var(--partner)]" },
  live: { icon: Store, tone: "mint", bar: "from-emerald-500 to-emerald-300" },
};

function PipelineCard({ ws, className }: { ws: Workspace; className?: string }) {
  const sorted = [...ws.products].sort(pipelineOrder);
  const top = sorted.slice(0, 3);
  const count = (id: PhaseId) => ws.products.filter((p) => phaseOf(p.stage) === id).length;
  const max = Math.max(1, ...PHASES.map((ph) => count(ph.id)));
  return (
    <section
      aria-labelledby="pipeline-title"
      className={cn(surface, accentEdge, "p-4 sm:p-5", className)}
    >
      <PanelTitle
        id="pipeline-title"
        icon={Kanban}
        tone="blue"
        title="Pipeline"
        sub="Where your products are. Pick a phase to see them."
        action={
          <Link to="/creator-hub/products" className={cornerLink}>
            All products <ArrowRight aria-hidden />
          </Link>
        }
      />
      {ws.products.length ? (
        <>
          <ul className="mt-4 grid grid-cols-3 gap-2.5">
            {PHASES.map((ph) => {
              const look = PHASE_LOOK[ph.id];
              const n = count(ph.id);
              return (
                <li key={ph.id}>
                  <Link
                    to="/creator-hub/products"
                    search={{ phase: ph.id }}
                    className={cn(surface, lift, "flex h-full flex-col rounded-xl p-3")}
                  >
                    <Tile icon={look.icon} tone={look.tone} size="sm" />
                    <span className="mt-2.5 truncate text-xs font-medium text-muted-foreground sm:text-sm">
                      {ph.label}
                    </span>
                    <span className="text-2xl font-semibold tracking-tight tabular-nums">{n}</span>
                    <span
                      aria-hidden
                      className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]"
                    >
                      <span
                        className={cn("block h-full rounded-full bg-gradient-to-r", look.bar)}
                        style={{ width: `${(n / max) * 100}%` }}
                      />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <ul className="mt-4 grid grid-cols-1 gap-2">
            {top.map((p) => (
              <ProductRow key={p.id} product={p} currency={ws.earnings.currency} />
            ))}
          </ul>
        </>
      ) : (
        <div className="mt-4 flex items-center gap-4 rounded-xl border border-dashed border-white/10 p-4">
          <img
            src={ART.figure}
            alt=""
            className="size-16 shrink-0 rounded-xl object-cover ring-1 ring-white/10"
          />
          <p className="text-sm text-muted-foreground">
            Your manager sets up your first product after your welcome call. Follow it here from
            brief to on sale.
          </p>
        </div>
      )}
    </section>
  );
}

function ProductRow({ product: p, currency }: { product: WsProduct; currency: string }) {
  const stage = stageOf(p.stage);
  const yours = waitingOnYou(p);
  return (
    <li>
      <Link
        to="/creator-hub/products/$productId"
        params={{ productId: p.id }}
        className={cn(
          surface,
          lift,
          "group flex items-center gap-3 rounded-xl p-2.5 pr-3",
          yours && "border-amber-300/30 bg-amber-300/[0.05]",
        )}
      >
        <ProductThumb product={p} className="size-12 rounded-lg border-white/10" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{p.name}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: STAGE_COLORS[p.stage] }}
            />
            <span className="truncate">{stage.name}</span>
            {p.stage !== "live" ? (
              yours ? (
                <span className="flex shrink-0 items-center gap-1 font-medium text-amber-300">
                  · <Hand className="size-3" aria-hidden /> you
                </span>
              ) : (
                <span className="hidden shrink-0 items-center gap-1 sm:flex">
                  · <Clock className="size-3" aria-hidden /> MEDIALIFE
                </span>
              )
            ) : null}
          </div>
        </div>
        <div className="shrink-0 text-right text-xs tabular-nums">
          {p.stage === "live" ? (
            <>
              <div className="font-semibold text-foreground">{money(p.sales.earned, currency)}</div>
              <div className="text-muted-foreground">{compact(p.sales.units)} sold</div>
            </>
          ) : (
            <>
              <div className="text-muted-foreground">On sale</div>
              <div className="font-semibold text-foreground">
                {p.eta ? shortDate(p.eta).replace(/, \d{4}$/, "") : "TBC"}
              </div>
            </>
          )}
        </div>
        <GoChip className="hidden sm:grid" />
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
    <section
      aria-labelledby="earnings-title"
      className={cn(surface, "flex flex-col p-4 sm:p-5", className)}
    >
      <PanelTitle
        id="earnings-title"
        icon={LineChart}
        tone="mint"
        title="Earnings"
        sub="Last 30 days"
        action={
          <Link to="/creator-hub/earnings" className={cornerLink}>
            Details <ArrowRight aria-hidden />
          </Link>
        }
      />
      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-3xl font-semibold tracking-tight tabular-nums">
          {money(d.cur, cur)}
        </span>
        <Delta value={d.change} label="vs previous 30 days" />
      </div>
      {d.cur > 0 ? (
        <TrendChart data={last30} currency={cur} minimal className="mt-3 h-40" />
      ) : (
        <div className="mt-3 grid h-40 place-items-center rounded-xl border border-dashed border-white/10 p-4 text-center text-sm text-muted-foreground">
          Your earnings chart starts with your first sale.
        </div>
      )}
    </section>
  );
}

/** Everything after the first item (the first is in the hero). */
function AlsoNeedsYou({ className }: { className?: string }) {
  const { items } = useNeedsYou();
  const rest = items.slice(1);
  if (!rest.length) return null;
  return (
    <section
      aria-labelledby="also-title"
      className={cn(surface, "border-amber-300/25 p-4 sm:p-5", className)}
    >
      <PanelTitle
        id="also-title"
        icon={Hand}
        tone="amber"
        title="Also needs you"
        sub={`${rest.length} more thing${rest.length === 1 ? "" : "s"} to do`}
      />
      <ul className="mt-3 grid grid-cols-1 gap-2">
        {rest.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] p-3"
          >
            <ActionThumb item={item} className="size-11 rounded-lg" />
            <div className="min-w-0 flex-1 basis-40">
              <div className="text-sm leading-snug font-medium">{item.title}</div>
              <div className="line-clamp-2 text-xs text-muted-foreground">{item.body}</div>
            </div>
            <ActionButton
              item={item}
              variant="outline"
              className="ml-auto shrink-0 rounded-full bg-transparent"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ActivityCard({ ws, className }: { ws: Workspace; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-labelledby="activity-title" className={cn(surface, "p-4 sm:p-5", className)}>
      <PanelTitle
        id="activity-title"
        icon={ActivityIcon}
        tone="violet"
        title="Activity"
        action={
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={cornerLink}
            aria-haspopup="dialog"
          >
            View all <ArrowRight aria-hidden />
          </button>
        }
      />
      <div className="mt-3">
        <ActivityFeed items={ws.activity} limit={4} compact />
      </div>
      <ResponsiveDrawer
        open={open}
        onOpenChange={setOpen}
        title="Activity"
        description="Everything that's happened in your program, newest first."
      >
        <ActivityFeed items={ws.activity} onNavigate={() => setOpen(false)} />
      </ResponsiveDrawer>
    </section>
  );
}

function GoLiveCard({ className }: { className?: string }) {
  return (
    <HubLink
      to="/creator-hub/live"
      className={cn(
        surface,
        lift,
        "group relative isolate flex min-h-52 flex-col justify-end overflow-hidden p-4",
        className,
      )}
    >
      <img
        src={ART.hoodie}
        alt=""
        loading="lazy"
        className="absolute inset-0 -z-10 size-full object-cover object-[50%_30%] transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
      />
      <span
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-t from-[#0b0d1a] via-[#0b0d1a]/50 to-transparent"
      />
      <span className="absolute top-3 right-3">
        <NewBadge />
      </span>
      <span className="glass flex items-center gap-3 rounded-2xl p-3">
        <Tile icon={Radio} tone="pink" size="md" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Go live with your merch</span>
          <span className="block text-xs text-white/75">
            Every order pops up on stream while you're live.
          </span>
        </span>
        <GoChip />
      </span>
    </HubLink>
  );
}

/* ---------------------------------------------------------------------------
   Before approval: where the application is, and what happens next
   --------------------------------------------------------------------------- */

const HERO: Record<
  "submitted" | "waitlist" | "declined" | "paused",
  { icon: LucideIcon; title: string; body: (email: string) => string; tone: Tone }
> = {
  submitted: {
    icon: Clock3,
    title: "Your application is in review",
    body: (email) =>
      `A real person reads every application. You'll hear from us within 2 business days at ${email}.`,
    tone: "ice",
  },
  waitlist: {
    icon: Hourglass,
    title: "You're on the waitlist",
    body: () =>
      "We launch creators in small groups. Your application is saved and we'll email you when a spot opens.",
    tone: "amber",
  },
  declined: {
    icon: Info,
    title: "Not a fit right now",
    body: () =>
      "We can't take your channel into the program at the moment. If anything changes, update your details and write to us.",
    tone: "violet",
  },
  paused: {
    icon: PauseCircle,
    title: "Your account is paused",
    body: () =>
      "Your products, files and earnings are safe. Write to us and we'll explain what's needed to pick things back up.",
    tone: "amber",
  },
};

const STEPS: Array<{ id: string; label: string; icon: LucideIcon }> = [
  { id: "applied", label: "You applied", icon: CheckCircle2 },
  { id: "review", label: "We review your channel", icon: ScanLine },
  { id: "call", label: "Welcome call", icon: Sparkles },
  { id: "brief", label: "First product brief", icon: Package },
];

function PreApproval({ ws, name }: { ws: Workspace; name: string }) {
  const { items } = useNeedsYou();
  const verify = items.filter((i) => i.kind === "verify");
  const status = ws.creator.status as keyof typeof HERO;
  const hero = HERO[status];
  const at = status === "submitted" || status === "waitlist" ? 1 : -1;

  return (
    <Page>
      <section
        aria-labelledby="status-title"
        className={cn(
          "relative isolate overflow-hidden rounded-3xl border bg-[var(--partner-ink)]",
          accentEdge,
        )}
      >
        <img
          src={ART.figure}
          alt=""
          className="absolute inset-0 -z-10 size-full object-cover object-[50%_45%] opacity-80"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgb(8_10_24/0.6),rgb(8_10_24/0.95)_65%)] @4xl/inset:bg-[linear-gradient(90deg,rgb(8_10_24/0.97)_0%,rgb(8_10_24/0.85)_50%,rgb(8_10_24/0.2)_100%)]"
        />
        <div className="max-w-2xl p-5 sm:p-8">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-[var(--partner)] uppercase">
            Hi, {name}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Tile icon={hero.icon} tone={hero.tone} size="lg" />
            <h1
              id="status-title"
              className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl"
            >
              {hero.title}
            </h1>
          </div>
          <p className="mt-3 leading-relaxed text-white/75">
            {hero.body(ws.creator.profile.email || "your email")}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild className="rounded-full">
              <Link to="/creator-hub/account">Edit your details</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full bg-black/30 backdrop-blur">
              <a href={`mailto:${HUB.supportEmail}`}>
                <Mail aria-hidden /> Write to us
              </a>
            </Button>
          </div>
        </div>
      </section>

      {at >= 0 ? (
        <ol className="mt-4 grid grid-cols-2 gap-3 @3xl/inset:grid-cols-4" aria-label="What's next">
          {STEPS.map((s, i) => (
            <li
              key={s.id}
              className={cn(
                surface,
                "flex flex-col gap-3 p-4",
                i === at && accentEdge,
                i > at && "opacity-70",
              )}
            >
              <div className="flex items-center justify-between">
                <Tile
                  icon={i < at ? CheckCircle2 : s.icon}
                  tone={i < at ? "mint" : i === at ? "ice" : "blue"}
                  size="sm"
                />
                <span className="text-[11px] text-muted-foreground tabular-nums">Step {i + 1}</span>
              </div>
              <span className="text-sm font-medium">
                {status === "waitlist" && s.id === "review" ? "Waiting for a spot" : s.label}
                {i === 0 && ws.creator.submittedAt ? (
                  <span className="block text-xs font-normal text-muted-foreground">
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
      {verify.length ? (
        <div className="mt-4 max-w-xl">
          <NeedsYouRows items={verify} />
        </div>
      ) : null}
      <Surface className="mt-4 flex items-center gap-3 p-4">
        <Tile icon={Sparkles} tone="pink" size="sm" />
        <p className="text-sm text-muted-foreground">
          Once you're approved, your products, earnings and launch kit appear here.
        </p>
      </Surface>
    </Page>
  );
}

/* ---------------------------------------------------------------------------
   Loading
   --------------------------------------------------------------------------- */

function HomeSkeleton() {
  return (
    <Page>
      <Skeleton className="h-64 rounded-3xl @4xl/inset:h-56" />
      <div className="mt-4 grid grid-cols-2 gap-3 @4xl/inset:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-36 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="mt-8 h-6 w-36" />
      <div className="mt-3 flex gap-3 overflow-hidden @5xl/inset:grid @5xl/inset:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-48 w-[44%] shrink-0 rounded-2xl @5xl/inset:w-auto" />
        ))}
      </div>
      <div className="mt-8 grid gap-4 @5xl/inset:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    </Page>
  );
}
