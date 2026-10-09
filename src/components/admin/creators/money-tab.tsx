import { useEffect, useId, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { adminRecordOrder, adminRecordPayout } from "@/lib/hub/admin.functions";
import { HUB, lineEarning, lineNet, money, shortDate, type Order } from "@/lib/hub/model";
import { cn } from "@/lib/utils";

import { Panel, PanelTitle, StatTile } from "../kit";
import type { CreatorDetail } from "./types";
import { CheckRow, Field, Pill, ghostBtn, parseNum, todayIso, useRun } from "./ui";

const ORDER_STATUS: Record<
  Order["status"],
  { tone: "live" | "watch" | "muted" | "danger"; label: string }
> = {
  paid: { tone: "live", label: "Paid" },
  "partially-refunded": { tone: "watch", label: "Part refunded" },
  refunded: { tone: "muted", label: "Refunded" },
  cancelled: { tone: "danger", label: "Cancelled" },
};

const th = "px-3 py-2.5 font-normal";
const thead =
  "mono border-b border-border text-left text-[10px] tracking-[0.12em] text-muted-foreground uppercase";

export function MoneyTab({ data }: { data: CreatorDetail }) {
  const e = data.earnings;
  const [orderOpen, setOrderOpen] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const cur = e.currency;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 @4xl/inset:grid-cols-4">
        <StatTile
          label="Net revenue"
          value={money(e.net, cur)}
          hint={`${e.orders} orders · ${e.units} units · ${money(e.gross, cur)} gross`}
        />
        <StatTile
          label="Creator earned"
          value={money(e.earned, cur)}
          hint={`${money(e.pending, cur)} still in the ${HUB.holdDays}-day returns window`}
        />
        <StatTile
          label="Available to pay"
          value={money(e.available, cur)}
          hint="Out of the returns window, unpaid"
        />
        <StatTile
          label="Paid out"
          value={money(e.paid, cur)}
          hint={`${data.payouts.length} payout${data.payouts.length === 1 ? "" : "s"}`}
        />
      </div>

      <Panel>
        <PanelTitle
          className="p-4 sm:p-5"
          title={`Orders (${data.orders.length})`}
          sub="From Shopify and the ingest API automatically. Record sales from other channels by hand."
          actions={
            <Button
              size="sm"
              onClick={() => setOrderOpen(true)}
              disabled={!data.products.length}
              title={data.products.length ? undefined : "Create a product first"}
            >
              <Plus aria-hidden />
              Record order
            </Button>
          }
        />
        {!data.orders.length ? (
          <p className="border-t border-border px-4 py-10 text-center text-sm text-muted-foreground">
            No orders yet.
          </p>
        ) : (
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className={thead}>
                  <th className={cn(th, "pl-5")}>Order</th>
                  <th className={th}>Date</th>
                  <th className={th}>Items</th>
                  <th className={cn(th, "text-right")}>Net</th>
                  <th className={cn(th, "text-right")}>Creator</th>
                  <th className={cn(th, "pr-5")}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.orders.map((o) => {
                  const net = o.lines.reduce((s, l) => s + lineNet(l), 0);
                  const earned = o.lines.reduce((s, l) => s + lineEarning(l), 0);
                  const st = ORDER_STATUS[o.status];
                  return (
                    <tr
                      key={o.id}
                      className={cn("align-top", o.status === "cancelled" && "opacity-60")}
                    >
                      <td className="px-3 py-2.5 pl-5">
                        <div className="font-medium">#{o.number.replace(/^#/, "")}</div>
                        <div className="text-xs text-muted-foreground">
                          {o.channel}
                          {o.source === "manual" ? " · manual" : ""}
                          {o.country ? ` · ${o.country}` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                        {shortDate(o.createdAt)}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {o.lines.map((l, i) => (
                          <div key={i}>
                            {l.qty} × {l.name}{" "}
                            <span className="text-muted-foreground">
                              @ {money(l.unitPrice, o.currency)}
                              {l.discount ? ` −${money(l.discount, o.currency)}` : ""}
                              {l.refunded ? ` · refunded ${money(l.refunded, o.currency)}` : ""}
                            </span>
                          </div>
                        ))}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {money(net, o.currency)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {money(earned, o.currency)}
                      </td>
                      <td className="px-3 py-2.5 pr-5">
                        <Pill tone={st.tone}>{st.label}</Pill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel>
        <PanelTitle
          className="p-4 sm:p-5"
          title={`Payouts (${data.payouts.length})`}
          sub="Record a payout after sending it through PayPal, Wise or the bank."
          actions={
            <Button size="sm" onClick={() => setPayoutOpen(true)}>
              <Plus aria-hidden />
              Record payout
            </Button>
          }
        />
        {!data.payouts.length ? (
          <p className="border-t border-border px-4 py-10 text-center text-sm text-muted-foreground">
            No payouts yet.
          </p>
        ) : (
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className={thead}>
                  <th className={cn(th, "pl-5")}>Paid</th>
                  <th className={th}>Period</th>
                  <th className={th}>Reference</th>
                  <th className={cn(th, "pr-5 text-right")}>Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...data.payouts]
                  .sort((a, b) => b.paidAt - a.paidAt)
                  .map((p) => (
                    <tr key={p.id}>
                      <td className="px-3 py-2.5 pl-5 text-xs whitespace-nowrap">
                        {shortDate(p.paidAt)}
                      </td>
                      <td className="px-3 py-2.5">{p.periodLabel}</td>
                      <td className="mono px-3 py-2.5 text-xs text-muted-foreground">
                        {p.reference || "–"}
                      </td>
                      <td className="px-3 py-2.5 pr-5 text-right font-medium tabular-nums">
                        {money(p.amount, p.currency)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <OrderDialog data={data} open={orderOpen} onOpenChange={setOrderOpen} />
      <PayoutDialog data={data} open={payoutOpen} onOpenChange={setPayoutOpen} />
    </div>
  );
}

type Line = { key: number; productId: string; qty: string; unitPrice: string; discount: string };

function OrderDialog({
  data,
  open,
  onOpenChange,
}: {
  data: CreatorDetail;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const uid = useId();
  const { pending, run } = useRun();
  const [channel, setChannel] = useState("");
  const [number, setNumber] = useState("");
  const [date, setDate] = useState("");
  const [country, setCountry] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);

  const priceOf = (id: string) => {
    const p = data.products.find((x) => x.id === id);
    return p?.price != null ? String(p.price / 100) : "";
  };
  const newLine = (key: number): Line => {
    const first = data.products.find((p) => p.stage === "live") ?? data.products[0];
    return {
      key,
      productId: first?.id ?? "",
      qty: "1",
      unitPrice: first ? priceOf(first.id) : "",
      discount: "",
    };
  };

  useEffect(() => {
    if (!open) return;
    setChannel("");
    setNumber("");
    setDate(todayIso());
    setCountry("");
    setCurrency("USD");
    setLines([newLine(1)]);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const setLine = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const total = lines.reduce(
    (s, l) =>
      s +
      Math.max(0, (Number(l.qty) || 0) * (Number(l.unitPrice) || 0) - (Number(l.discount) || 0)),
    0,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!channel.trim()) return setError("Which channel was it sold on?");
    if (!number.trim()) return setError("Add the order number");
    if (!/^[A-Z]{3}$/.test(currency)) return setError("Currency is 3 letters, e.g. USD");
    if (country && !/^[A-Z]{2}$/.test(country))
      return setError("Country is a 2-letter code, e.g. US, or blank");
    const parsed = lines.map((l) => ({
      productId: l.productId,
      qty: Number(l.qty),
      unitPrice: parseNum(l.unitPrice) ?? NaN,
      discount: parseNum(l.discount) ?? 0,
    }));
    if (
      parsed.some(
        (l) =>
          !l.productId ||
          !Number.isInteger(l.qty) ||
          l.qty < 1 ||
          !Number.isFinite(l.unitPrice) ||
          l.unitPrice < 0 ||
          !Number.isFinite(l.discount) ||
          l.discount < 0,
      )
    )
      return setError("Each line needs a product, a whole quantity and a price");
    setError(null);
    const r = await run(
      "order",
      () =>
        adminRecordOrder({
          data: {
            creatorId: data.creator.id,
            channel: channel.trim(),
            number: number.trim(),
            date,
            country,
            currency,
            lines: parsed,
          },
        }),
      `Order #${number.trim()} recorded`,
    );
    if (r) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record an order</DialogTitle>
          <DialogDescription>
            For channels without an integration (TikTok Shop, events, wholesale). Each line earns
            the product's share at today's terms. Recording the same channel and number again
            replaces it.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_5rem_5rem]">
            <Field label="Channel" htmlFor={`${uid}-ch`}>
              <Input
                id={`${uid}-ch`}
                value={channel}
                maxLength={80}
                placeholder="TikTok Shop"
                onChange={(e) => setChannel(e.target.value)}
              />
            </Field>
            <Field label="Order number" htmlFor={`${uid}-num`}>
              <Input
                id={`${uid}-num`}
                value={number}
                maxLength={60}
                onChange={(e) => setNumber(e.target.value)}
              />
            </Field>
            <Field label="Date" htmlFor={`${uid}-date`}>
              <Input
                id={`${uid}-date`}
                type="date"
                value={date}
                max={todayIso()}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field label="Country" htmlFor={`${uid}-cc`}>
              <Input
                id={`${uid}-cc`}
                value={country}
                maxLength={2}
                placeholder="US"
                className="mono uppercase"
                onChange={(e) => setCountry(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
              />
            </Field>
            <Field label="Currency" htmlFor={`${uid}-cur`}>
              <Input
                id={`${uid}-cur`}
                value={currency}
                maxLength={3}
                className="mono uppercase"
                onChange={(e) => setCurrency(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
              />
            </Field>
          </div>

          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Lines</legend>
            <div className="hidden grid-cols-[minmax(0,1fr)_4.5rem_6rem_6rem_2rem] gap-2 text-xs text-muted-foreground sm:grid">
              <span>Product</span>
              <span>Qty</span>
              <span>Unit price</span>
              <span>Discount</span>
              <span />
            </div>
            {lines.map((l, i) => (
              <div
                key={l.key}
                className="grid grid-cols-[minmax(0,1fr)_4.5rem_6rem_6rem_2rem] items-center gap-2 max-sm:grid-cols-3"
              >
                <Select
                  value={l.productId}
                  onValueChange={(v) => setLine(l.key, { productId: v, unitPrice: priceOf(v) })}
                >
                  <SelectTrigger aria-label={`Line ${i + 1} product`} className="max-sm:col-span-3">
                    <SelectValue placeholder="Product" />
                  </SelectTrigger>
                  <SelectContent>
                    {data.products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  aria-label={`Line ${i + 1} quantity`}
                  type="number"
                  min={1}
                  step={1}
                  value={l.qty}
                  onChange={(e) => setLine(l.key, { qty: e.target.value })}
                  className="tabular-nums"
                />
                <Input
                  aria-label={`Line ${i + 1} unit price`}
                  type="number"
                  min={0}
                  step="0.01"
                  value={l.unitPrice}
                  placeholder="$"
                  onChange={(e) => setLine(l.key, { unitPrice: e.target.value })}
                  className="tabular-nums"
                />
                <Input
                  aria-label={`Line ${i + 1} discount`}
                  type="number"
                  min={0}
                  step="0.01"
                  value={l.discount}
                  placeholder="0"
                  onChange={(e) => setLine(l.key, { discount: e.target.value })}
                  className="tabular-nums"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn("size-8 text-muted-foreground", ghostBtn)}
                  disabled={lines.length === 1}
                  onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                  aria-label={`Remove line ${i + 1}`}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn("-ml-2 text-muted-foreground", ghostBtn)}
                onClick={() =>
                  setLines((ls) => [...ls, newLine(Math.max(0, ...ls.map((x) => x.key)) + 1)])
                }
              >
                <Plus aria-hidden />
                Add line
              </Button>
              <span className="text-sm tabular-nums">
                <span className="text-muted-foreground">Net </span>
                {Number.isFinite(total)
                  ? money(Math.round(total * 100), /^[A-Z]{3}$/.test(currency) ? currency : "USD")
                  : "–"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Prices and discounts in dollars, before tax and shipping. Discount is per line.
            </p>
          </fieldset>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter className="gap-2 sm:space-x-0">
            <Button
              type="button"
              variant="ghost"
              className={ghostBtn}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!!pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Record order
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PayoutDialog({
  data,
  open,
  onOpenChange,
}: {
  data: CreatorDetail;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const uid = useId();
  const { pending, run } = useRun();
  const e = data.earnings;
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [period, setPeriod] = useState("");
  const [date, setDate] = useState("");
  const [reference, setReference] = useState("");
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAmount(e.available ? (e.available / 100).toFixed(2) : "");
    setCurrency(e.currency);
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() - 1);
    setPeriod(d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }));
    setDate(todayIso());
    setReference("");
    setNotify(true);
    setError(null);
  }, [open, e.available, e.currency]);

  const payout = data.creator.payout;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record a payout</DialogTitle>
          <DialogDescription>
            {money(e.available, e.currency)} is available to pay.{" "}
            {payout
              ? `They're paid by ${payout.method === "paypal" ? "PayPal" : payout.method === "wise" ? "Wise" : "other"}${payout.email ? ` at ${payout.email}` : ""}.`
              : "They haven't added payout details yet."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (ev) => {
            ev.preventDefault();
            const n = Number(amount);
            if (!amount.trim() || !Number.isFinite(n) || n <= 0)
              return setError("Enter the amount paid");
            if (!period.trim()) return setError("Add the period it covers");
            if (!/^[A-Z]{3}$/.test(currency)) return setError("Currency is 3 letters");
            setError(null);
            const r = await run(
              "payout",
              () =>
                adminRecordPayout({
                  data: {
                    creatorId: data.creator.id,
                    amount: n,
                    currency,
                    periodLabel: period.trim(),
                    date,
                    reference: reference.trim(),
                    notify,
                  },
                }),
              "Payout recorded",
            );
            if (r) onOpenChange(false);
          }}
        >
          <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-3">
            <Field
              label="Amount"
              htmlFor={`${uid}-amt`}
              hint={e.available ? "Prefilled with what's available." : undefined}
            >
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  id={`${uid}-amt`}
                  type="number"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(ev) => setAmount(ev.target.value)}
                  className="pl-6 tabular-nums"
                />
              </div>
            </Field>
            <Field label="Currency" htmlFor={`${uid}-cur`}>
              <Input
                id={`${uid}-cur`}
                value={currency}
                maxLength={3}
                className="mono uppercase"
                onChange={(ev) => setCurrency(ev.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Period" htmlFor={`${uid}-period`}>
              <Input
                id={`${uid}-period`}
                value={period}
                maxLength={80}
                onChange={(ev) => setPeriod(ev.target.value)}
              />
            </Field>
            <Field label="Date paid" htmlFor={`${uid}-date`}>
              <Input
                id={`${uid}-date`}
                type="date"
                value={date}
                onChange={(ev) => setDate(ev.target.value)}
              />
            </Field>
          </div>
          <Field
            label="Reference"
            htmlFor={`${uid}-ref`}
            optional
            hint="PayPal or Wise transaction id."
          >
            <Input
              id={`${uid}-ref`}
              value={reference}
              maxLength={120}
              className="mono text-xs"
              onChange={(ev) => setReference(ev.target.value)}
            />
          </Field>
          <CheckRow id={`${uid}-notify`} checked={notify} onChange={setNotify}>
            Email the creator
          </CheckRow>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter className="gap-2 sm:space-x-0">
            <Button
              type="button"
              variant="ghost"
              className={ghostBtn}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!!pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Record payout
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
