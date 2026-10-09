import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Banknote,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock,
  Coins,
  HelpCircle,
  Receipt,
  Wallet,
} from "lucide-react";
import { Bar, BarChart, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { z } from "zod";

import {
  METRICS,
  TrendChart,
  byWeek,
  formatMetric,
  type Metric,
} from "@/components/hub/app/earnings-chart";
import { Kpi } from "@/components/hub/app/kpi";
import { ResponsiveDrawer } from "@/components/hub/app/responsive-drawer";
import { Card, EmptyState, Facts, Page, PageHeader, Pill } from "@/components/hub/app/ui";
import { useWorkspace } from "@/components/hub/app/workspace";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getEarnings } from "@/lib/hub/creator.functions";
import {
  HUB,
  compact,
  lineEarning,
  lineNet,
  lineUnits,
  money,
  pct,
  shortDate,
  type Order,
  type Tone,
} from "@/lib/hub/model";
import { cn } from "@/lib/utils";

const RANGES = [30, 90, 365] as const;
const TABS = ["overview", "orders", "payouts"] as const;

export const Route = createFileRoute("/creator-hub/_app/earnings")({
  validateSearch: z.object({
    days: z.coerce
      .number()
      .refine((n) => (RANGES as readonly number[]).includes(n))
      .optional()
      .catch(undefined),
    tab: z.enum(TABS).optional().catch(undefined),
  }),
  loaderDeps: ({ search }) => ({ days: search.days ?? 30 }),
  loader: ({ deps }) => getEarnings({ data: { days: deps.days } }),
  head: () => ({ meta: [{ title: "Earnings · Creator Hub | MEDIALIFE" }] }),
  pendingComponent: EarningsSkeleton,
  component: Earnings,
});

type Data = Awaited<ReturnType<typeof getEarnings>>;
type PublicOrder = Data["orders"][number];

const STATUS: Record<Order["status"], { label: string; tone: Tone }> = {
  paid: { label: "Paid", tone: "live" },
  "partially-refunded": { label: "Part refunded", tone: "watch" },
  refunded: { label: "Refunded", tone: "muted" },
  cancelled: { label: "Cancelled", tone: "muted" },
};

/** Categorical slots for the dark surface (validated palette, fixed order). */
const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#9085e9"];

function countryName(code: string) {
  if (!/^[A-Z]{2}$/.test(code)) return code === "—" ? "Unknown" : code;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function orderTotals(o: PublicOrder) {
  let net = 0;
  let cut = 0;
  let qty = 0;
  for (const l of o.lines) {
    net += lineNet(l);
    cut += lineEarning(l);
    qty += lineUnits(l);
  }
  return { net, cut, qty, names: [...new Set(o.lines.map((l) => l.name))].join(", ") };
}

function EarningsSkeleton() {
  return (
    <Page className="lg:pt-8">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-2 h-4 w-80 max-w-full" />
      <div className="mt-5 grid grid-cols-2 gap-3 @4xl/inset:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-4 h-80 rounded-xl" />
    </Page>
  );
}

function Earnings() {
  const d = Route.useLoaderData();
  const ws = useWorkspace();
  const { days } = Route.useLoaderDeps();
  const { tab = "overview" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [metric, setMetric] = useState<Metric>("earned");
  const cur = d.summary.currency;
  const total = d.trend.reduce((s, x) => s + x[metric], 0);
  const weekly = days > 31;

  return (
    <Page className="lg:pt-8">
      <PageHeader
        title="Earnings"
        description={
          <>
            You earn <span className="font-medium text-foreground">{pct(d.revenueShare)}</span> of
            net merch revenue — after discounts and refunds, before tax and shipping.
          </>
        }
      />

      {!d.payoutSetUp && ws.creator.status === "approved" ? (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/45 bg-amber-400/[0.07] px-4 py-3">
          <Wallet className="size-5 shrink-0 text-amber-300" aria-hidden />
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-medium">Add your payout details so we can pay you.</span>{" "}
            <span className="text-muted-foreground">Your earnings are safe until then.</span>
          </p>
          <Button asChild size="sm">
            <Link to="/creator-hub/account" search={{ section: "payout" }}>
              Add payout details <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-3 @4xl/inset:grid-cols-4">
        <Kpi
          label="Total earned"
          icon={Coins}
          value={money(d.summary.earned, cur)}
          hint={`${compact(d.summary.units)} units sold`}
          emphasis
        />
        <Kpi
          label="Available"
          icon={Wallet}
          value={money(d.summary.available, cur)}
          hint="Ready for your next payout"
          explain={`Earnings from orders older than ${d.holdDays} days that we haven't paid you yet. They go out with your next payout.`}
        />
        <Kpi
          label="Pending"
          icon={Clock}
          value={money(d.summary.pending, cur)}
          hint={`In the ${d.holdDays}-day returns window`}
          explain={`Earnings from orders in the last ${d.holdDays} days. Fans can still return items in that window, so these move to Available once it closes.`}
        />
        <Kpi
          label="Paid out"
          icon={Banknote}
          value={money(d.summary.paid, cur)}
          hint={`${d.payouts.length} payout${d.payouts.length === 1 ? "" : "s"}`}
        />
      </div>

      <section
        aria-labelledby="trend-title"
        className="mt-4 rounded-xl border border-border bg-gradient-to-b from-white/[0.035] to-white/[0.01] p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="trend-title" className="text-sm text-muted-foreground">
              {METRICS[metric].label}, last {days === 365 ? "year" : `${days} days`}
            </h2>
            <div className="mt-1 text-2xl font-medium tracking-tight tabular-nums">
              {formatMetric(total, metric, cur)}
            </div>
            {weekly ? <div className="text-xs text-muted-foreground">Shown by week</div> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <ToggleGroup
              type="single"
              value={metric}
              onValueChange={(v) => v && setMetric(v as Metric)}
              aria-label="Measure"
              className="rounded-lg border border-border p-0.5"
            >
              {(
                [
                  ["earned", "Earnings"],
                  ["units", "Units"],
                  ["net", "Revenue"],
                ] as Array<[Metric, string]>
              ).map(([v, l]) => (
                <ToggleGroupItem
                  key={v}
                  value={v}
                  className="h-8 rounded-md px-2.5 text-xs data-[state=on]:bg-white/10 data-[state=on]:text-foreground data-[state=on]:text-foreground"
                >
                  {l}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <ToggleGroup
              type="single"
              value={String(days)}
              onValueChange={(v) =>
                v &&
                navigate({
                  search: (p) => ({ ...p, days: Number(v) }),
                  replace: true,
                  resetScroll: false,
                })
              }
              aria-label="Date range"
              className="rounded-lg border border-border p-0.5"
            >
              {RANGES.map((r) => (
                <ToggleGroupItem
                  key={r}
                  value={String(r)}
                  aria-label={`Last ${r} days`}
                  className="h-8 rounded-md px-2.5 text-xs data-[state=on]:bg-white/10 data-[state=on]:text-foreground data-[state=on]:text-foreground"
                >
                  {r === 365 ? "1y" : `${r}d`}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>
        {total === 0 && metric !== "units" && d.trend.every((x) => !x.units) ? (
          <div className="mt-4 grid h-56 place-items-center rounded-lg border border-dashed border-border px-4 text-center text-sm text-muted-foreground">
            No sales in this period. The chart fills in with your first order.
          </div>
        ) : (
          <TrendChart
            data={weekly ? byWeek(d.trend) : d.trend}
            metric={metric}
            currency={cur}
            weekly={weekly}
            className="mt-4 h-56 sm:h-64"
          />
        )}
      </section>

      <Tabs
        value={tab}
        onValueChange={(t) =>
          navigate({
            search: (p) => ({
              ...p,
              tab: t === "overview" ? undefined : (t as (typeof TABS)[number]),
            }),
            replace: true,
            resetScroll: false,
          })
        }
        className="mt-6"
      >
        <TabsList className="h-10 w-full justify-start rounded-lg bg-white/[0.04] p-1 sm:w-auto">
          <TabsTrigger value="overview" className="flex-1 sm:flex-none">
            Breakdown
          </TabsTrigger>
          <TabsTrigger value="orders" className="flex-1 sm:flex-none">
            Orders{" "}
            <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">
              {d.orders.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="payouts" className="flex-1 sm:flex-none">
            Payouts
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className={TAB_ANIM}>
          <Breakdown d={d} />
        </TabsContent>
        <TabsContent value="orders" className={TAB_ANIM}>
          <Orders orders={d.orders} currency={cur} />
        </TabsContent>
        <TabsContent value="payouts" className={TAB_ANIM}>
          <Payouts d={d} />
        </TabsContent>
      </Tabs>

      <p className="mt-8 text-xs text-muted-foreground">
        Orders sync from our stores automatically. Figures in {cur}.
      </p>
    </Page>
  );
}

const TAB_ANIM =
  "mt-4 focus-visible:outline-none motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300";

/* ---------------------------------------------------------------------------
   Breakdown: by product, by channel, by country
   --------------------------------------------------------------------------- */

function Breakdown({ d }: { d: Data }) {
  const cur = d.summary.currency;
  const products = d.byProduct.filter((p) => p.earned > 0).sort((a, b) => b.earned - a.earned);
  const waiting = d.byProduct.length - products.length;
  const channels = d.byChannel;
  const totalOrders = channels.reduce((s, c) => s + c.orders, 0);
  const countries = d.byCountry.slice(0, 6);
  const cMax = Math.max(1, ...countries.map((c) => c.units));

  return (
    <div className="grid grid-cols-1 gap-4 @4xl/inset:grid-cols-2 @6xl/inset:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <Card
        title="By product"
        labelledBy="bp-title"
        className="@4xl/inset:col-span-2 @6xl/inset:col-span-1"
      >
        {products.length ? (
          <figure className="m-0">
            <ChartContainer
              config={{ earned: { label: "Your earnings", color: "var(--color-primary)" } }}
              className="aspect-auto w-full"
              style={{ height: products.length * 44 + 8 }}
              aria-hidden
            >
              <BarChart
                data={products}
                layout="vertical"
                margin={{ top: 0, right: 64, bottom: 0, left: 0 }}
                barCategoryGap={10}
              >
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={118}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: "var(--color-foreground)" }}
                />
                <ChartTooltip
                  cursor={{ fill: "oklch(1 0 0 / 4%)" }}
                  content={({ active, payload }) => {
                    const r =
                      active && payload?.[0]
                        ? (payload[0].payload as (typeof products)[number])
                        : null;
                    return r ? (
                      <div className="rounded-lg border border-border bg-popover/95 px-3 py-2 text-xs shadow-xl">
                        <div className="font-medium">{r.name}</div>
                        <div className="mt-1 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 tabular-nums">
                          <span className="text-muted-foreground">Your earnings</span>
                          <span className="text-right font-medium">{money(r.earned, cur)}</span>
                          <span className="text-muted-foreground">Net revenue</span>
                          <span className="text-right">{money(r.net, cur)}</span>
                          <span className="text-muted-foreground">Units</span>
                          <span className="text-right">{r.units}</span>
                          <span className="text-muted-foreground">Your share</span>
                          <span className="text-right">{pct(r.share)}</span>
                        </div>
                      </div>
                    ) : null;
                  }}
                />
                <Bar
                  dataKey="earned"
                  fill="var(--color-earned)"
                  radius={[0, 4, 4, 0]}
                  isAnimationActive={false}
                  label={{
                    position: "right",
                    fill: "var(--color-muted-foreground)",
                    fontSize: 11,
                    formatter: (v: number) => money(v, cur),
                  }}
                />
              </BarChart>
            </ChartContainer>
            <figcaption className="sr-only">
              Your earnings by product:{" "}
              {products
                .map((p) => `${p.name} ${money(p.earned, cur)} from ${p.units} units`)
                .join("; ")}
              .
            </figcaption>
          </figure>
        ) : (
          <p className="text-sm text-muted-foreground">No sales yet.</p>
        )}
        {waiting > 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {waiting} product{waiting === 1 ? "" : "s"} not on sale yet.
          </p>
        ) : null}
      </Card>

      <Card title="Where fans bought" labelledBy="ch-title">
        {channels.length ? (
          <div className="flex items-center gap-4">
            <figure className="relative m-0 size-32 shrink-0">
              <ChartContainer config={{}} className="aspect-square size-32" aria-hidden>
                <PieChart>
                  <Pie
                    data={channels}
                    dataKey="orders"
                    nameKey="channel"
                    innerRadius={42}
                    outerRadius={62}
                    paddingAngle={2}
                    strokeWidth={0}
                    isAnimationActive={false}
                  >
                    {channels.map((c, i) => (
                      <Cell key={c.channel} fill={SERIES[i % SERIES.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                <div>
                  <div className="text-lg font-medium tabular-nums">{compact(totalOrders)}</div>
                  <div className="text-[10px] text-muted-foreground">orders</div>
                </div>
              </div>
              <figcaption className="sr-only">
                Orders by channel: {channels.map((c) => `${c.channel} ${c.orders}`).join(", ")}.
              </figcaption>
            </figure>
            <ul className="min-w-0 flex-1 space-y-2.5 text-sm">
              {channels.map((c, i) => (
                <li key={c.channel} className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-[3px]"
                      style={{ background: SERIES[i % SERIES.length] }}
                    />
                    <span className="truncate font-medium">{c.channel}</span>
                  </div>
                  <div className="pl-[18px] text-xs text-muted-foreground tabular-nums">
                    {pct(c.orders / Math.max(1, totalOrders))} ·{" "}
                    {money(c.earned, d.summary.currency)} yours
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No sales yet.</p>
        )}
      </Card>

      <Card title="Top countries" labelledBy="co-title">
        {countries.length ? (
          <ol className="space-y-2.5">
            {countries.map((c) => (
              <li key={c.country} className="text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate">{countryName(c.country)}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {compact(c.units)} units
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-white/[0.06]" aria-hidden>
                  <div
                    className="h-full rounded-full bg-primary/80"
                    style={{ width: `${(c.units / cMax) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">No sales yet.</p>
        )}
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Orders: a paginated table, each row opens the order
   --------------------------------------------------------------------------- */

const PAGE = 10;

function Orders({ orders, currency }: { orders: PublicOrder[]; currency: string }) {
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  if (!orders.length) {
    return (
      <EmptyState icon={Receipt} title="No orders yet">
        Orders appear here within minutes of a fan buying, once a product is on sale.
      </EmptyState>
    );
  }
  const pages = Math.ceil(orders.length / PAGE);
  const list = orders.slice(page * PAGE, page * PAGE + PAGE);
  const open = orders.find((o) => o.id === openId) ?? null;

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Orders, newest first. Select an order to see its details.
          </caption>
          <thead className="hidden border-b border-border bg-white/[0.02] text-left text-xs text-muted-foreground @3xl/inset:table-header-group">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-normal">
                Order
              </th>
              <th scope="col" className="px-4 py-2.5 font-normal">
                Date
              </th>
              <th scope="col" className="px-4 py-2.5 font-normal">
                Products
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-normal">
                Qty
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-normal">
                Net
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-normal">
                Your cut
              </th>
              <th scope="col" className="px-4 py-2.5 font-normal">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {list.map((o) => {
              const t = orderTotals(o);
              const s = STATUS[o.status];
              const c = o.currency || currency;
              return (
                <tr
                  key={o.id}
                  onClick={() => setOpenId(o.id)}
                  className="grid cursor-pointer grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 px-4 py-3 transition-colors hover:bg-white/[0.03] @3xl/inset:table-row @3xl/inset:p-0"
                >
                  <th
                    scope="row"
                    className="text-left font-medium tabular-nums @3xl/inset:px-4 @3xl/inset:py-2.5"
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenId(o.id);
                      }}
                      className="rounded hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {o.number}
                      <span className="sr-only"> — view order</span>
                    </button>
                    <span className="font-normal text-muted-foreground @3xl/inset:hidden">
                      {" "}
                      · {shortDate(o.createdAt)}
                    </span>
                  </th>
                  <td className="text-right font-medium tabular-nums @3xl/inset:hidden">
                    {money(t.cut, c)}
                  </td>
                  <td className="hidden px-4 py-2.5 whitespace-nowrap text-muted-foreground tabular-nums @3xl/inset:table-cell">
                    {shortDate(o.createdAt)}
                  </td>
                  <td className="min-w-0 truncate text-xs text-muted-foreground @3xl/inset:max-w-64 @3xl/inset:px-4 @3xl/inset:py-2.5 @3xl/inset:text-sm">
                    <span className="@3xl/inset:hidden">{t.qty} × </span>
                    {t.names}
                  </td>
                  <td className="justify-self-end @3xl/inset:hidden">
                    <Pill tone={s.tone}>{s.label}</Pill>
                  </td>
                  <td className="hidden px-4 py-2.5 text-right tabular-nums @3xl/inset:table-cell">
                    {t.qty}
                  </td>
                  <td className="hidden px-4 py-2.5 text-right tabular-nums @3xl/inset:table-cell">
                    {money(t.net, c)}
                  </td>
                  <td className="hidden px-4 py-2.5 text-right font-medium tabular-nums @3xl/inset:table-cell">
                    {money(t.cut, c)}
                  </td>
                  <td className="hidden px-4 py-2.5 @3xl/inset:table-cell">
                    <Pill tone={s.tone}>{s.label}</Pill>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <nav
        aria-label="Orders pages"
        className="mt-3 flex items-center justify-between gap-3 text-sm text-muted-foreground"
      >
        <span className="tabular-nums" aria-live="polite">
          {page * PAGE + 1}–{Math.min(orders.length, (page + 1) * PAGE)} of {orders.length}
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft aria-hidden />
          </Button>
          <span className="px-1 tabular-nums">
            {page + 1} / {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages - 1}
            onClick={() => setPage((p) => p + 1)}
            aria-label="Next page"
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </nav>
      <ResponsiveDrawer
        open={!!open}
        onOpenChange={(o) => !o && setOpenId(null)}
        title={open ? `Order ${open.number}` : "Order"}
        description={open ? `${shortDate(open.createdAt)} · ${open.channel}` : undefined}
      >
        {open ? <OrderDetail order={open} currency={currency} /> : null}
      </ResponsiveDrawer>
    </>
  );
}

function OrderDetail({ order: o, currency }: { order: PublicOrder; currency: string }) {
  const t = orderTotals(o);
  const c = o.currency || currency;
  const s = STATUS[o.status];
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/35 bg-primary/[0.06] p-4">
        <div>
          <div className="text-xs text-muted-foreground">Your cut</div>
          <div className="text-2xl font-medium tracking-tight tabular-nums">{money(t.cut, c)}</div>
        </div>
        <Pill tone={s.tone}>{s.label}</Pill>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-medium">Items</h3>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {o.lines.map((l, i) => (
            <li key={`${l.productId}-${i}`} className="p-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">
                  {l.qty} × {l.name}
                </span>
                <span className="tabular-nums">{money(lineEarning(l), c)}</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                {money(l.unitPrice, c)} each
                {l.discount ? ` · −${money(l.discount, c)} discount` : ""}
                {l.refunded ? ` · −${money(l.refunded, c)} refunded` : ""} · net{" "}
                {money(lineNet(l), c)} · {pct(l.share)} yours
              </div>
            </li>
          ))}
        </ul>
      </div>
      <Facts
        rows={[
          ["Units (after refunds)", String(t.qty)],
          ["Net revenue", money(t.net, c)],
          ["Channel", o.channel],
          ["Country", o.country ? countryName(o.country) : "Unknown"],
          ["Ordered", shortDate(o.createdAt)],
        ]}
      />
      <p className="text-xs leading-relaxed text-muted-foreground">
        Net revenue is what the fan paid for the items after discounts and refunds — tax and
        shipping are never in it. We don't store buyers' names or emails.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Payouts
   --------------------------------------------------------------------------- */

function Payouts({ d }: { d: Data }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {d.payouts.length
            ? `${d.payouts.length} payout${d.payouts.length === 1 ? "" : "s"} · ${money(d.summary.paid, d.summary.currency)} in total`
            : "No payouts yet"}
        </p>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <HelpCircle aria-hidden /> How payouts work
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 text-sm leading-relaxed">
            <ol className="list-decimal space-y-2 pl-4 text-muted-foreground">
              <li>
                <span className="text-foreground">A fan orders.</span> Your share of the net revenue
                is added to <em>Pending</em>.
              </li>
              <li>
                <span className="text-foreground">{d.holdDays} days later</span> the returns window
                closes and it moves to <em>Available</em>.
              </li>
              <li>
                <span className="text-foreground">Once a month</span> we send everything Available
                to your PayPal or Wise email, with a reference you'll see here.
              </li>
            </ol>
            <p className="mt-3 text-xs text-muted-foreground">
              Questions? Write to {HUB.supportEmail}.
            </p>
          </PopoverContent>
        </Popover>
      </div>
      {d.payouts.length ? (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {d.payouts.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 text-sm">
              <CircleDollarSign className="size-5 shrink-0 text-emerald-400" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{p.periodLabel}</div>
                <div className="text-xs text-muted-foreground">
                  Paid {shortDate(p.paidAt)}
                  {p.reference ? (
                    <>
                      {" "}
                      · Ref <span className="font-mono">{p.reference}</span>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="font-medium tabular-nums">{money(p.amount, p.currency)}</div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={Banknote} title="No payouts yet">
          We pay out monthly once your available balance is ready. Each payout shows up here with
          its reference.
        </EmptyState>
      )}
    </div>
  );
}
