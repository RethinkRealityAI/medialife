/**
 * The hub's charts, all on recharts through the shadcn ChartContainer so the
 * tooltips and colours are consistent.
 *
 * One series per chart (so no legend box — the card title names it), the
 * brand cyan for money and a quieter tone for everything else, thin 2px lines,
 * a soft gradient under areas, and a crosshair tooltip on hover.
 */
import { useId } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { compact, money, shortDate } from "@/lib/hub/model";
import { cn } from "@/lib/utils";

export type TrendPoint = { date: string; net: number; earned: number; units: number };
export type Metric = "earned" | "units" | "net";

export const METRICS: Record<Metric, { label: string; color: string; money: boolean }> = {
  earned: { label: "Your earnings", color: "var(--color-primary)", money: true },
  units: { label: "Units sold", color: "oklch(0.78 0.13 175)", money: false },
  net: { label: "Net revenue", color: "oklch(0.72 0.17 300)", money: true },
};

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

const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

function axisValue(v: number, metric: Metric, currency: string) {
  if (!METRICS[metric].money) return compact(v);
  const d = v / 100;
  const sym = (0)
    .toLocaleString("en-US", { style: "currency", currency, maximumFractionDigits: 0 })
    .replace(/[\d\s.,]/g, "");
  return d >= 1000 ? `${sym}${(d / 1000).toFixed(d >= 10_000 ? 0 : 1)}k` : `${sym}${Math.round(d)}`;
}

export const formatMetric = (v: number, metric: Metric, currency: string) =>
  METRICS[metric].money ? money(v, currency) : `${v.toLocaleString("en-US")} units`;

/** The hero chart: one metric over time. */
export function TrendChart({
  data,
  metric = "earned",
  currency,
  weekly = false,
  minimal = false,
  className,
}: {
  data: TrendPoint[];
  metric?: Metric;
  currency: string;
  weekly?: boolean;
  /** No y-axis and fewer ticks, for small cards. */
  minimal?: boolean;
  className?: string;
}) {
  const gid = `g${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const m = METRICS[metric];
  const config = { [metric]: { label: m.label, color: m.color } } satisfies ChartConfig;
  const total = data.reduce((s, d) => s + d[metric], 0);
  const best = data.length ? data.reduce((a, b) => (b[metric] > a[metric] ? b : a)) : null;

  return (
    <figure className={cn("m-0", className)}>
      <ChartContainer config={config} className="aspect-auto size-full" aria-hidden>
        <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: minimal ? 6 : 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`var(--color-${metric})`} stopOpacity={0.38} />
              <stop offset="70%" stopColor={`var(--color-${metric})`} stopOpacity={0.06} />
              <stop offset="100%" stopColor={`var(--color-${metric})`} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--grid-line)" />
          <XAxis
            dataKey="date"
            tickFormatter={dayLabel}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={minimal ? 40 : 28}
            tick={{ fontSize: 11 }}
          />
          {minimal ? null : (
            <YAxis
              tickFormatter={(v: number) => axisValue(v, metric, currency)}
              tickLine={false}
              axisLine={false}
              width={44}
              tick={{ fontSize: 11 }}
            />
          )}
          <ChartTooltip
            cursor={{
              stroke: "var(--color-muted-foreground)",
              strokeWidth: 1,
              strokeDasharray: "3 3",
            }}
            content={({ active, payload }) => {
              const p = active && payload?.[0] ? (payload[0].payload as TrendPoint) : null;
              if (!p) return null;
              return (
                <div className="min-w-44 rounded-lg border border-border bg-popover/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
                  <div className="font-medium">
                    {weekly ? `Week of ${shortDate(p.date)}` : shortDate(p.date)}
                  </div>
                  {(["earned", "net", "units"] as Metric[]).map((k) => (
                    <div key={k} className="mt-1 flex items-center gap-2">
                      <span
                        aria-hidden
                        className={cn("size-2 rounded-full", k !== metric && "opacity-0")}
                        style={{ background: METRICS[k].color }}
                      />
                      <span className={k === metric ? "text-foreground" : "text-muted-foreground"}>
                        {METRICS[k].label}
                      </span>
                      <span className="ml-auto pl-3 font-medium tabular-nums">
                        {METRICS[k].money ? money(p[k], currency) : p[k]}
                      </span>
                    </div>
                  ))}
                </div>
              );
            }}
          />
          <Area
            type={minimal ? "basis" : "monotone"}
            dataKey={metric}
            stroke={`var(--color-${metric})`}
            strokeWidth={2}
            fill={`url(#${gid})`}
            activeDot={{ r: 4, stroke: "var(--color-background)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>
      <figcaption className="sr-only">
        {m.label}, {weekly ? "by week" : "by day"}, {data.length} points:{" "}
        {formatMetric(total, metric, currency)} in total.
        {best
          ? ` Highest: ${shortDate(best.date)}, ${formatMetric(best[metric], metric, currency)}.`
          : ""}
      </figcaption>
    </figure>
  );
}

/** A tiny trend line for a KPI tile. Decorative: the tile states the number. */
export function Sparkline({
  values,
  color = "var(--color-primary)",
  className,
}: {
  values: number[];
  color?: string;
  className?: string;
}) {
  const gid = `s${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const data = values.map((v, i) => ({ i, v }));
  return (
    <ChartContainer
      config={{ v: { label: "Trend", color } }}
      className={cn("aspect-auto h-10 w-full", className)}
      aria-hidden
    >
      <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-v)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--color-v)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke="var(--color-v)"
          strokeWidth={1.5}
          fill={`url(#${gid})`}
          isAnimationActive={false}
          dot={false}
          activeDot={false}
        />
      </AreaChart>
    </ChartContainer>
  );
}

/** Sum of a metric over the last `days` points and the `days` before them. */
export function periodDelta(data: TrendPoint[], metric: Metric, days = 30) {
  const cur = data.slice(-days).reduce((s, d) => s + d[metric], 0);
  const prev = data.slice(-days * 2, -days).reduce((s, d) => s + d[metric], 0);
  return { cur, prev, change: prev > 0 ? (cur - prev) / prev : null };
}
