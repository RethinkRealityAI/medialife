import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import type { Dashboard } from "@/lib/ar/analytics.server";

import { Panel, PanelTitle } from "../kit";
import { VIZ } from "./viz";

type Point = Dashboard["series"][number];
type Bucket = Dashboard["range"]["bucket"];

const config = {
  visits: { label: "Visits", color: VIZ.visits },
  bounced: { label: "Bounced opens", color: VIZ.context },
} satisfies ChartConfig;

function tickLabel(t: number, bucket: Bucket) {
  const d = new Date(t);
  return bucket === "hour"
    ? d.toLocaleTimeString(undefined, { hour: "numeric" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function longLabel(t: number, bucket: Bucket) {
  const d = new Date(t);
  if (bucket === "hour") {
    const end = new Date(t + 3_600_000);
    const f = (x: Date) => x.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return `${f(d)} – ${f(end)}`;
  }
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

interface ShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  payload?: Point;
}

/**
 * One segment of the stacked column. The data end (top of whichever segment is
 * highest) gets a 4px radius and the baseline stays square; a 2px gap in the
 * surface colour separates the two segments instead of a stroke.
 */
function Segment({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  fill,
  payload,
  part,
}: ShapeProps & { part: "base" | "top" }) {
  if (height <= 0 || width <= 0 || !payload) return null;
  let h = height;
  if (part === "top" && payload.visits > 0) h = Math.max(1, height - 2);
  const rounded = part === "top" || payload.bounced === 0;
  const r = rounded ? Math.min(4, width / 2, h) : 0;
  const d = `M${x},${y + h}L${x},${y + r}Q${x},${y} ${x + r},${y}L${x + width - r},${y}Q${x + width},${y} ${x + width},${y + r}L${x + width},${y + h}Z`;
  return <path d={d} fill={fill} />;
}

function VisitsTooltip({
  active,
  payload,
  bucket,
}: {
  active?: boolean;
  payload?: Array<{ payload: Point }>;
  bucket: Bucket;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="grid gap-1 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-xl">
      <div className="mb-0.5 text-muted-foreground">{longLabel(p.t, bucket)}</div>
      {(
        [
          ["Visits", p.visits, VIZ.visits],
          ["Bounced opens", p.bounced, VIZ.context],
        ] as const
      ).map(([label, value, color]) => (
        <div key={label} className="flex items-center gap-2">
          <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: color }} />
          <span className="font-medium text-foreground tabular-nums">{value}</span>
          <span className="text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  );
}

export function VisitsChart({ data, className }: { data: Dashboard; className?: string }) {
  const { series, range } = data;
  const bucket = range.bucket;
  const empty = series.every((p) => !p.visits && !p.bounced);
  const title = bucket === "hour" ? "Visits by hour" : "Visits per day";

  return (
    <Panel className={className}>
      <div className="p-4 sm:p-5">
        <PanelTitle
          title={title}
          sub={
            bucket === "hour"
              ? "Today, in your time zone."
              : "Bounced opens: the page loaded, nothing was done, and it closed within 3 seconds."
          }
        />
        <div className="relative mt-4">
          <ChartContainer config={config} className="aspect-auto h-[240px] w-full">
            <BarChart
              data={series}
              margin={{ top: 8, right: 4, bottom: 0, left: -12 }}
              barCategoryGap="18%"
            >
              <CartesianGrid vertical={false} stroke={VIZ.grid} />
              <XAxis
                dataKey="t"
                tickFormatter={(t: number) => tickLabel(t, bucket)}
                tickLine={false}
                axisLine={{ stroke: VIZ.grid }}
                tickMargin={8}
                minTickGap={16}
                className="tabular-nums"
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={36}
                tickMargin={4}
                className="tabular-nums"
              />
              <ChartTooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                content={<VisitsTooltip bucket={bucket} />}
              />
              <Bar
                dataKey="visits"
                stackId="v"
                fill="var(--color-visits)"
                maxBarSize={24}
                isAnimationActive={false}
                shape={(p: ShapeProps) => <Segment {...p} part="base" />}
              />
              <Bar
                dataKey="bounced"
                stackId="v"
                fill="var(--color-bounced)"
                maxBarSize={24}
                isAnimationActive={false}
                shape={(p: ShapeProps) => <Segment {...p} part="top" />}
              />
            </BarChart>
          </ChartContainer>
          {empty ? (
            <p className="pointer-events-none absolute inset-0 grid place-items-center pb-6 text-sm text-muted-foreground">
              No visits in this range
            </p>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {(
            [
              ["Visits", VIZ.visits],
              ["Bounced opens", VIZ.context],
            ] as const
          ).map(([label, color]) => (
            <span key={label} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-[2px]" style={{ background: color }} />
              {label}
            </span>
          ))}
        </div>

        {/* The table twin: every value without hovering. */}
        <details className="mt-3 border-t border-border pt-3">
          <summary className="mono cursor-pointer text-[10px] tracking-[0.14em] text-muted-foreground uppercase hover:text-foreground">
            View as a table
          </summary>
          <div className="mt-3 max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr className="mono border-b border-border text-left text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                  <th scope="col" className="py-2 font-normal">
                    {bucket === "hour" ? "Hour" : "Day"}
                  </th>
                  <th scope="col" className="py-2 text-right font-normal">
                    Visits
                  </th>
                  <th scope="col" className="py-2 text-right font-normal">
                    Bounced opens
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...series].reverse().map((p) => (
                  <tr key={p.t}>
                    <th scope="row" className="py-1.5 text-left font-normal">
                      {longLabel(p.t, bucket)}
                    </th>
                    <td className="py-1.5 text-right tabular-nums">{p.visits}</td>
                    <td className="py-1.5 text-right text-muted-foreground tabular-nums">
                      {p.bounced}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </Panel>
  );
}
