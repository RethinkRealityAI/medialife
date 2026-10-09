/**
 * Daily scans as bars (recharts). One series, so no legend; the hover tooltip
 * gives each day, and a text summary is there for screen readers.
 */
import { Bar, BarChart, XAxis } from "recharts";

import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

const label = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

function lastDays(byDay: Record<string, number>, days: number, now = Date.now()) {
  const out: Array<{ date: string; n: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now - i * 86_400_000).toISOString().slice(0, 10);
    out.push({ date, n: byDay[date] ?? 0 });
  }
  return out;
}

export function ScanBars({
  byDay,
  days = 14,
  className,
}: {
  byDay: Record<string, number>;
  days?: number;
  className?: string;
}) {
  const data = lastDays(byDay, days);
  const total = data.reduce((s, d) => s + d.n, 0);

  return (
    <figure className={cn("m-0", className)}>
      <ChartContainer
        config={{ n: { label: "Scans", color: "var(--color-primary)" } }}
        className="aspect-auto h-28 w-full"
        aria-hidden
      >
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap={3}>
          <XAxis
            dataKey="date"
            tickFormatter={label}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={40}
            tick={{ fontSize: 11 }}
          />
          <ChartTooltip
            cursor={{ fill: "oklch(1 0 0 / 5%)" }}
            content={({ active, payload }) => {
              const p =
                active && payload?.[0] ? (payload[0].payload as { date: string; n: number }) : null;
              return p ? (
                <div className="rounded-lg border border-border bg-popover/95 px-3 py-1.5 text-xs shadow-xl">
                  {label(p.date)}: <span className="font-medium tabular-nums">{p.n} scans</span>
                </div>
              ) : null;
            }}
          />
          <Bar
            dataKey="n"
            fill="var(--color-n)"
            radius={[4, 4, 0, 0]}
            minPointSize={2}
            isAnimationActive={false}
          />
        </BarChart>
      </ChartContainer>
      <figcaption className="sr-only">
        {total} scans in the last {days} days.{" "}
        {data
          .filter((d) => d.n)
          .map((d) => `${label(d.date)}: ${d.n}`)
          .join(", ")}
      </figcaption>
    </figure>
  );
}
