/**
 * Daily earnings as one cyan area. A single series, so no legend: the section
 * title names it. Net revenue and units ride along in the tooltip rather than
 * as a second mark on a second scale.
 */
import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { money, shortDate } from "@/lib/hub/model";

export type TrendPoint = { date: string; net: number; earned: number; units: number };

const axisMoney = (cents: number, currency: string) => {
  const v = cents / 100;
  const sym = (0)
    .toLocaleString("en-US", { style: "currency", currency, maximumFractionDigits: 0 })
    .replace(/[\d\s.,]/g, "");
  if (v >= 1000) return `${sym}${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)}k`;
  return `${sym}${Math.round(v)}`;
};

const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/**
 * Sums daily points into weeks, each labelled by its first day, for long
 * ranges. Counted back from today, so only the oldest week can be partial.
 */
export function byWeek(data: TrendPoint[]): TrendPoint[] {
  const out: TrendPoint[] = [];
  for (let end = data.length; end > 0; end -= 7) {
    const chunk = data.slice(Math.max(0, end - 7), end);
    out.unshift({
      date: chunk[0].date,
      net: chunk.reduce((s, d) => s + d.net, 0),
      earned: chunk.reduce((s, d) => s + d.earned, 0),
      units: chunk.reduce((s, d) => s + d.units, 0),
    });
  }
  // A stub of a week at the start would read as a dip; drop it.
  return out.length > 1 && data.length % 7 !== 0 && data.length % 7 < 4 ? out.slice(1) : out;
}

export function EarningsChart({
  data,
  currency,
  height = 260,
  minimal = false,
  weekly = false,
}: {
  data: TrendPoint[];
  currency: string;
  height?: number;
  minimal?: boolean;
  /** The points are weeks (see byWeek), not days. */
  weekly?: boolean;
}) {
  const gradientId = useId().replace(/:/g, "");
  const total = data.reduce((s, d) => s + d.earned, 0);
  const tickEvery = Math.max(1, Math.ceil(data.length / (minimal ? 4 : 6)));

  return (
    <figure className="m-0">
      <div style={{ height }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: minimal ? 4 : 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.32} />
                <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--grid-line-strong)" />
            <XAxis
              dataKey="date"
              tickFormatter={dayLabel}
              interval={tickEvery - 1}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
              tickMargin={8}
              minTickGap={12}
              padding={{ left: 12, right: 12 }}
            />
            {minimal ? null : (
              <YAxis
                tickFormatter={(v: number) => axisMoney(v, currency)}
                tickLine={false}
                axisLine={false}
                width={48}
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
              />
            )}
            <Tooltip
              cursor={{
                stroke: "var(--color-muted-foreground)",
                strokeWidth: 1,
                strokeDasharray: "3 3",
              }}
              content={({ active, payload }) => {
                const p = active && payload?.[0] ? (payload[0].payload as TrendPoint) : null;
                if (!p) return null;
                return (
                  <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
                    <div className="font-medium">
                      {weekly ? `Week of ${shortDate(p.date)}` : shortDate(p.date)}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span aria-hidden className="size-2 rounded-full bg-primary" />
                      <span className="text-muted-foreground">Your earnings</span>
                      <span className="ml-auto pl-3 font-medium tabular-nums">
                        {money(p.earned, currency)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 pl-4">
                      <span className="text-muted-foreground">Net revenue</span>
                      <span className="ml-auto pl-3 tabular-nums">{money(p.net, currency)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 pl-4">
                      <span className="text-muted-foreground">Units</span>
                      <span className="ml-auto pl-3 tabular-nums">{p.units}</span>
                    </div>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="earned"
              stroke="var(--color-primary)"
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              activeDot={{
                r: 4,
                stroke: "var(--color-background)",
                strokeWidth: 2,
                fill: "var(--color-primary)",
              }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        {weekly ? "Weekly" : "Daily"} earnings over the last{" "}
        {weekly ? `${data.length} weeks` : `${data.length} days`}, {money(total, currency)} in
        total.
        {data.length
          ? ` Best day: ${(() => {
              const best = data.reduce((a, b) => (b.earned > a.earned ? b : a));
              return `${shortDate(best.date)}, ${money(best.earned, currency)}`;
            })()}.`
          : ""}
      </figcaption>
    </figure>
  );
}
