import { createFileRoute } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { PageHeader, Panel, Pill, Section, Stat } from "@/components/portal/kit";
import {
  ACTIVE,
  BY_REGION,
  BY_SKU,
  COMMERCIAL_MEASURES,
  ENGAGEMENT_MEASURES,
  PILOT,
  REVIEW,
  WEEKLY,
  money,
  pct,
} from "@/lib/roblox-portal";

export const Route = createFileRoute("/roblox/portal/performance")({
  component: Performance,
});

/**
 * Chart series colours.
 *
 * These are NOT the site's --primary and --accent used directly: those sit at
 * OKLCH L 0.72 and 0.68, above the 0.48–0.67 band a mark needs to stay inside on
 * a near-black surface. These are the same hues re-stepped into that band and
 * validated — lightness, chroma, CVD separation and contrast against the panel
 * surface all pass, with a worst adjacent deuteranope ΔE of 12.
 */
const SERIES = {
  units: "#069ce4",
  activations: "#ec2fa0",
  outbound: "#b98a00",
} as const;

const weeklyConfig = {
  units: { label: "Units sold", color: SERIES.units },
  activations: { label: "First activations", color: SERIES.activations },
  outbound: { label: "Outbound to Roblox", color: SERIES.outbound },
} satisfies ChartConfig;

const skuConfig = {
  units: { label: "Units sold", color: SERIES.units },
} satisfies ChartConfig;

const regionConfig = {
  units: { label: "Units sold", color: SERIES.units },
} satisfies ChartConfig;

function Performance() {
  return (
    <>
      <PageHeader
        eyebrow="The pilot / Performance"
        title="Does it sell, and does the activation work?"
        lede="Two families of measures. Commercial says whether the product moves; engagement says whether the chip in it keeps doing its job after the sale. The program review reads both together."
        actions={
          <Pill tone="active">
            Day {REVIEW.dayOf} of {REVIEW.totalDays}
          </Pill>
        }
      />

      {/* HEADLINE */}
      <Section className="border-b border-border">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Units sold" value={PILOT.unitsSold.toLocaleString("en-US")} delta={0.31} />
          <Stat label="Gross merchandise value" value={money(PILOT.gmv)} delta={0.28} />
          <Stat label="Activation rate" value={pct(PILOT.activationRate)} delta={0.09} />
          <Stat
            label="Outbound to Roblox"
            value={PILOT.outboundSessions.toLocaleString("en-US")}
            delta={0.24}
          />
        </div>
      </Section>

      {/* THE TREND */}
      <Section
        title="Week by week"
        hint="Units, first activations and outbound sessions since the pilot opened. Activations tracking units is the signal that the activation is not a novelty."
      >
        <Panel className="p-4 sm:p-5">
          <ChartContainer config={weeklyConfig} className="h-[320px] w-full">
            <LineChart data={WEEKLY} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="week"
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                className="text-xs"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={48}
                className="text-xs"
              />
              <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
              <ChartLegend content={<ChartLegendContent />} />
              {(["units", "activations", "outbound"] as const).map((k) => (
                <Line
                  key={k}
                  dataKey={k}
                  type="monotone"
                  stroke={`var(--color-${k})`}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-background)" }}
                />
              ))}
            </LineChart>
          </ChartContainer>

          {/* The table view the chart owes a screen-reader and anyone who wants the numbers. */}
          <details className="mt-4 border-t border-border pt-3">
            <summary className="mono cursor-pointer text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
              View as a table
            </summary>
            <table className="mt-3 w-full text-sm">
              <caption className="sr-only">
                {ACTIVE.property} weekly units, first activations and outbound sessions
              </caption>
              <thead>
                <tr className="mono border-b border-border text-left text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                  <th scope="col" className="py-2 font-normal">
                    Week
                  </th>
                  <th scope="col" className="py-2 text-right font-normal">
                    Units
                  </th>
                  <th scope="col" className="py-2 text-right font-normal">
                    First activations
                  </th>
                  <th scope="col" className="py-2 text-right font-normal">
                    Outbound
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {WEEKLY.map((w) => (
                  <tr key={w.week}>
                    <th scope="row" className="py-1.5 text-left font-normal">
                      {w.week}
                    </th>
                    <td className="py-1.5 text-right tabular-nums">{w.units}</td>
                    <td className="py-1.5 text-right tabular-nums">{w.activations}</td>
                    <td className="py-1.5 text-right tabular-nums">{w.outbound}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </Panel>
      </Section>

      {/* SKU AND REGION */}
      <Section className="border-t border-border">
        {/* min-w-0 on the items: a grid item defaults to min-width:auto, which
            lets Recharts' measured width push the track past the viewport. */}
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel className="min-w-0 p-4 sm:p-5">
            <h3 className="text-sm font-medium">Units by SKU</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              The price-point read. The cheapest unit is carrying the pilot.
            </p>
            <ChartContainer config={skuConfig} className="mt-4 h-[220px] w-full">
              <BarChart data={BY_SKU} margin={{ top: 20, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid
                  vertical={false}
                  stroke="var(--color-border)"
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="sku"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                  className="text-xs"
                />
                <YAxis tickLine={false} axisLine={false} width={52} className="text-xs" />
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Bar
                  dataKey="units"
                  fill="var(--color-units)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={64}
                >
                  <LabelList
                    dataKey="units"
                    position="top"
                    offset={8}
                    className="fill-foreground text-xs tabular-nums"
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
          </Panel>

          <Panel className="min-w-0 p-4 sm:p-5">
            <h3 className="text-sm font-medium">Demand by region</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Where the units went. Informs which retail conversations are worth having.
            </p>
            <ChartContainer config={regionConfig} className="mt-4 h-[220px] w-full">
              <BarChart
                data={BY_REGION}
                layout="vertical"
                margin={{ top: 4, right: 48, bottom: 4, left: 8 }}
              >
                <CartesianGrid
                  horizontal={false}
                  stroke="var(--color-border)"
                  strokeDasharray="3 3"
                />
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="region"
                  tickLine={false}
                  axisLine={false}
                  width={132}
                  className="text-xs"
                />
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Bar dataKey="units" radius={[0, 4, 4, 0]} maxBarSize={20}>
                  {BY_REGION.map((r) => (
                    <Cell key={r.region} fill="var(--color-units)" />
                  ))}
                  <LabelList
                    dataKey="share"
                    position="right"
                    offset={8}
                    className="fill-muted-foreground text-xs tabular-nums"
                    formatter={(v: number) => pct(v)}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
          </Panel>
        </div>
      </Section>

      {/* THE FULL MEASURE SETS */}
      <Section
        title="Commercial measures"
        hint="Whether the product moves, and at what price."
        className="border-t border-border"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {COMMERCIAL_MEASURES.map((m) => (
            <Stat
              key={m.id}
              label={m.label}
              value={m.value}
              delta={m.delta}
              hint={m.hint}
              lowerIsBetter={m.id === "reorder"}
            />
          ))}
        </div>
      </Section>

      <Section
        title="Engagement measures"
        hint="Whether the activation keeps working after the sale — and whether it sends anyone back."
        className="border-t border-border"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ENGAGEMENT_MEASURES.map((m) => (
            <Stat key={m.id} label={m.label} value={m.value} delta={m.delta} hint={m.hint} />
          ))}
        </div>
      </Section>
    </>
  );
}
