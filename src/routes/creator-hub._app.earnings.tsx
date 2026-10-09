import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Banknote,
  CircleDollarSign,
  Clock,
  Coins,
  Receipt,
  Wallet,
} from "lucide-react";
import { z } from "zod";

import { EarningsChart, byWeek } from "@/components/hub/app/earnings-chart";
import { Kpi } from "@/components/hub/app/kpi";
import { EmptyState, Page, PageHeader, Panel, Pill, Section } from "@/components/hub/app/ui";
import { useWorkspace } from "@/components/hub/app/workspace";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getEarnings } from "@/lib/hub/creator.functions";
import {
  SKUS,
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

const RANGES = [30, 90, 365] as const;

export const Route = createFileRoute("/creator-hub/_app/earnings")({
  validateSearch: z.object({
    days: z.coerce
      .number()
      .refine((n) => (RANGES as readonly number[]).includes(n))
      .optional()
      .catch(undefined),
  }),
  loaderDeps: ({ search }) => ({ days: search.days ?? 90 }),
  loader: ({ deps }) => getEarnings({ data: { days: deps.days } }),
  head: () => ({ meta: [{ title: "Earnings · Creator Hub | MEDIALIFE" }] }),
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

function Earnings() {
  const d = Route.useLoaderData();
  const ws = useWorkspace();
  const { days } = Route.useLoaderDeps();
  const navigate = useNavigate({ from: Route.fullPath });
  const cur = d.summary.currency;
  const rangeTotal = d.trend.reduce((s, x) => s + x.earned, 0);
  const rangeUnits = d.trend.reduce((s, x) => s + x.units, 0);
  const shareText = pct(d.revenueShare);

  return (
    <Page>
      <PageHeader
        title="Earnings"
        description={
          <>
            You earn <span className="font-medium text-foreground">{shareText}</span> of net merch
            revenue — after discounts and refunds, before tax and shipping.
          </>
        }
      />

      {!d.payoutSetUp && ws.creator.status === "approved" ? (
        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-amber-400/45 bg-amber-400/[0.07] p-4 sm:flex-row sm:items-center">
          <Wallet className="size-5 shrink-0 text-amber-300" aria-hidden />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">Add your payout details so we can pay you</p>
            <p className="mt-0.5 text-muted-foreground">
              A PayPal or Wise email is all we need. Your earnings are safe until then.
            </p>
          </div>
          <Button asChild>
            <Link to="/creator-hub/account" hash="payout">
              Add payout details <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-3 @4xl/inset:grid-cols-4">
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

      <Section id="trend" className="mt-8 sm:mt-8">
        <Panel className="p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm text-muted-foreground">Your earnings, last {days} days</h2>
              <div className="mt-1 text-2xl font-medium tracking-tight tabular-nums">
                {money(rangeTotal, cur)}
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {compact(rangeUnits)} units{days > 31 ? " · shown by week" : ""}
              </div>
            </div>
            <ToggleGroup
              type="single"
              value={String(days)}
              onValueChange={(v) =>
                v && navigate({ search: { days: Number(v) }, replace: true, resetScroll: false })
              }
              aria-label="Date range"
              className="rounded-lg border border-border p-1"
            >
              {RANGES.map((r) => (
                <ToggleGroupItem
                  key={r}
                  value={String(r)}
                  className="h-8 rounded-md px-3 text-xs data-[state=on]:bg-white/10 data-[state=on]:text-foreground"
                  aria-label={`Last ${r} days`}
                >
                  {r === 365 ? "1 year" : `${r} days`}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="mt-4">
            {rangeTotal === 0 ? (
              <div className="grid h-40 place-items-center rounded-lg border border-dashed border-border px-4 text-center text-sm text-muted-foreground">
                No earnings in this period. The chart fills in with your first sale.
              </div>
            ) : days > 31 ? (
              <EarningsChart data={byWeek(d.trend)} currency={cur} height={260} weekly />
            ) : (
              <EarningsChart data={d.trend} currency={cur} height={260} />
            )}
          </div>
        </Panel>
      </Section>

      <Section title="By product" description="All-time.">
        <ByProduct rows={d.byProduct} currency={cur} />
      </Section>

      <div className="mt-10 grid grid-cols-1 gap-x-6 gap-y-10 sm:mt-12 @4xl/inset:grid-cols-2">
        <Section title="By channel" description="Where fans bought." className="mt-0 sm:mt-0">
          {d.byChannel.length ? (
            <Panel className="divide-y divide-border">
              {d.byChannel.map((c) => (
                <div
                  key={c.channel}
                  className="flex items-center justify-between gap-4 p-4 text-sm"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{c.channel}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {c.orders} order{c.orders === 1 ? "" : "s"} · {money(c.net, cur)} net
                    </div>
                  </div>
                  <div className="text-right tabular-nums">
                    <div className="font-medium">{money(c.earned, cur)}</div>
                    <div className="text-xs text-muted-foreground">yours</div>
                  </div>
                </div>
              ))}
            </Panel>
          ) : (
            <p className="text-sm text-muted-foreground">No sales yet.</p>
          )}
        </Section>

        <Section title="Top countries" description="Units sold." className="mt-0 sm:mt-0">
          {d.byCountry.length ? (
            <Countries rows={d.byCountry.slice(0, 8)} />
          ) : (
            <p className="text-sm text-muted-foreground">No sales yet.</p>
          )}
        </Section>
      </div>

      <Section
        title="Orders"
        description="Only your share of each order is shown. No buyer details are stored."
      >
        <Orders orders={d.orders} currency={cur} />
      </Section>

      <Section title="Payouts">
        {d.payouts.length ? (
          <Panel className="divide-y divide-border">
            {d.payouts.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 text-sm">
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
              </div>
            ))}
          </Panel>
        ) : (
          <EmptyState icon={Banknote} title="No payouts yet">
            We pay out monthly once your available balance is ready. Each payout shows up here with
            its reference.
          </EmptyState>
        )}
      </Section>

      <p className="mt-10 text-xs text-muted-foreground">
        Orders sync from our stores automatically. Figures in {cur}.
      </p>
    </Page>
  );
}

function ByProduct({ rows, currency }: { rows: Data["byProduct"]; currency: string }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No products yet.</p>;
  const sorted = [...rows].sort((a, b) => b.earned - a.earned);
  return (
    <Panel className="overflow-hidden">
      <table className="w-full text-sm">
        <caption className="sr-only">Units, revenue and earnings by product</caption>
        <thead className="hidden border-b border-border text-left text-xs text-muted-foreground @2xl/inset:table-header-group">
          <tr>
            <th scope="col" className="px-4 py-3 font-normal">
              Product
            </th>
            <th scope="col" className="px-4 py-3 text-right font-normal">
              Units
            </th>
            <th scope="col" className="px-4 py-3 text-right font-normal">
              Net revenue
            </th>
            <th scope="col" className="px-4 py-3 text-right font-normal">
              Your share
            </th>
            <th scope="col" className="px-4 py-3 text-right font-normal">
              Your earnings
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map((r) => (
            <tr
              key={r.id}
              className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 p-4 @2xl/inset:table-row @2xl/inset:p-0"
            >
              <th
                scope="row"
                className="min-w-0 text-left font-normal @2xl/inset:px-4 @2xl/inset:py-3"
              >
                <Link
                  to="/creator-hub/products/$productId"
                  params={{ productId: r.id }}
                  className="font-medium hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {r.name}
                </Link>
                <div className="text-xs text-muted-foreground">
                  {SKUS[r.sku].short}
                  {r.stage !== "live" ? " · not on sale yet" : ""}
                </div>
              </th>
              <td className="row-span-2 self-center text-right font-medium tabular-nums @2xl/inset:hidden">
                {money(r.earned, currency)}
              </td>
              <td className="text-xs text-muted-foreground tabular-nums @2xl/inset:hidden">
                {compact(r.units)} units · {money(r.net, currency)} net · {pct(r.share)}
              </td>
              <td className="hidden px-4 py-3 text-right tabular-nums @2xl/inset:table-cell">
                {compact(r.units)}
              </td>
              <td className="hidden px-4 py-3 text-right tabular-nums @2xl/inset:table-cell">
                {money(r.net, currency)}
              </td>
              <td className="hidden px-4 py-3 text-right tabular-nums @2xl/inset:table-cell">
                {pct(r.share)}
              </td>
              <td className="hidden px-4 py-3 text-right font-medium tabular-nums @2xl/inset:table-cell">
                {money(r.earned, currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function Countries({ rows }: { rows: Data["byCountry"] }) {
  const max = Math.max(1, ...rows.map((r) => r.units));
  return (
    <Panel className="p-4">
      <ol className="space-y-3">
        {rows.map((r) => (
          <li key={r.country} className="text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate">{countryName(r.country)}</span>
              <span className="tabular-nums">{compact(r.units)}</span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.06]" aria-hidden>
              <div
                className="h-full rounded-full bg-primary/80"
                style={{ width: `${(r.units / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

const PAGE = 15;

function Orders({ orders, currency }: { orders: PublicOrder[]; currency: string }) {
  const [shown, setShown] = useState(PAGE);
  if (!orders.length) {
    return (
      <EmptyState icon={Receipt} title="No orders yet">
        Orders appear here within minutes of a fan buying, once a product is on sale.
      </EmptyState>
    );
  }
  const list = orders.slice(0, shown);
  return (
    <>
      <Panel className="overflow-hidden">
        <table className="w-full text-sm">
          <caption className="sr-only">Orders, newest first</caption>
          <thead className="hidden border-b border-border text-left text-xs text-muted-foreground @3xl/inset:table-header-group">
            <tr>
              <th scope="col" className="px-4 py-3 font-normal">
                Order
              </th>
              <th scope="col" className="px-4 py-3 font-normal">
                Date
              </th>
              <th scope="col" className="px-4 py-3 font-normal">
                Products
              </th>
              <th scope="col" className="px-4 py-3 text-right font-normal">
                Qty
              </th>
              <th scope="col" className="px-4 py-3 text-right font-normal">
                Net
              </th>
              <th scope="col" className="px-4 py-3 text-right font-normal">
                Your cut
              </th>
              <th scope="col" className="px-4 py-3 font-normal">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {list.map((o) => {
              const t = orderTotals(o);
              const s = STATUS[o.status];
              return (
                <tr
                  key={o.id}
                  className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 p-4 @3xl/inset:table-row @3xl/inset:p-0"
                >
                  <th
                    scope="row"
                    className="text-left font-medium tabular-nums @3xl/inset:px-4 @3xl/inset:py-3"
                  >
                    {o.number}
                    <span className="font-normal text-muted-foreground @3xl/inset:hidden">
                      {" "}
                      · {shortDate(o.createdAt)}
                    </span>
                  </th>
                  <td className="text-right font-medium tabular-nums @3xl/inset:hidden">
                    {money(t.cut, o.currency || currency)}
                  </td>
                  <td className="hidden px-4 py-3 whitespace-nowrap text-muted-foreground tabular-nums @3xl/inset:table-cell">
                    {shortDate(o.createdAt)}
                  </td>
                  <td className="min-w-0 truncate text-muted-foreground @3xl/inset:max-w-64 @3xl/inset:px-4 @3xl/inset:py-3">
                    <span className="@3xl/inset:hidden">{t.qty} × </span>
                    {t.names}
                  </td>
                  <td className="justify-self-end @3xl/inset:hidden">
                    <Pill tone={s.tone}>{s.label}</Pill>
                  </td>
                  <td className="hidden px-4 py-3 text-right tabular-nums @3xl/inset:table-cell">
                    {t.qty}
                  </td>
                  <td className="hidden px-4 py-3 text-right tabular-nums @3xl/inset:table-cell">
                    {money(t.net, o.currency || currency)}
                  </td>
                  <td className="hidden px-4 py-3 text-right font-medium tabular-nums @3xl/inset:table-cell">
                    {money(t.cut, o.currency || currency)}
                  </td>
                  <td className="hidden px-4 py-3 @3xl/inset:table-cell">
                    <Pill tone={s.tone}>{s.label}</Pill>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span className="tabular-nums" aria-live="polite">
          Showing {list.length} of {orders.length}
        </span>
        {shown < orders.length ? (
          <Button variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE * 2)}>
            Show more
          </Button>
        ) : null}
      </div>
    </>
  );
}
