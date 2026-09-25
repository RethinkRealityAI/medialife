import type { ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CountRow, Dashboard } from "@/lib/ar/analytics.server";

import { countryName, pct } from "../format";
import { Panel, PanelTitle } from "../kit";
import { VIZ } from "./viz";

/**
 * A ranked list with a thin bar per row: one series, so one colour. Bars grow
 * from a square baseline to a 4px rounded end; counts are printed at the end so
 * nothing depends on hovering.
 */
function BarList({
  rows,
  total,
  label = (r) => r.label,
  unit,
  empty,
}: {
  rows: CountRow[];
  total: number;
  label?: (r: CountRow) => ReactNode;
  unit: (r: CountRow) => string;
  empty: string;
}) {
  if (!rows.length)
    return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.visits), 1);
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{label(r)}</span>
            <span className="shrink-0 tabular-nums">
              {r.visits}
              <span className="ml-2 inline-block w-9 text-right text-xs text-muted-foreground">
                {pct(r.visits, total)}
              </span>
            </span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="mt-1 h-2 w-full">
                <div
                  className="h-full rounded-r-[4px]"
                  style={{
                    width: `${(r.visits / max) * 100}%`,
                    minWidth: 3,
                    background: VIZ.visits,
                  }}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent className="border border-border bg-popover text-popover-foreground">
              {unit(r)}
            </TooltipContent>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
}

const times = (n: number) => (n === 1 ? "once" : `${n} times`);
const visitsWord = (n: number) => `${n} visit${n === 1 ? "" : "s"}`;

function DeviceSplit({ mobile, desktop }: { mobile: number; desktop: number }) {
  const total = mobile + desktop;
  const parts = [
    { label: "Mobile", value: mobile, color: VIZ.visits },
    { label: "Desktop", value: desktop, color: VIZ.second },
  ];
  return (
    <div>
      <div className="flex h-2.5 w-full gap-0.5" aria-hidden>
        {total ? (
          parts
            .filter((p) => p.value > 0)
            .map((p, i, arr) => (
              <div
                key={p.label}
                className={i === 0 ? "rounded-l-[4px]" : ""}
                style={{
                  flexGrow: p.value,
                  background: p.color,
                  borderTopRightRadius: i === arr.length - 1 ? 4 : 0,
                  borderBottomRightRadius: i === arr.length - 1 ? 4 : 0,
                }}
              />
            ))
        ) : (
          <div className="flex-1 rounded-[4px] bg-white/[0.04]" />
        )}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        {parts.map((p) => (
          <div key={p.label}>
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                aria-hidden
                className="size-2.5 rounded-[2px]"
                style={{ background: p.color }}
              />
              {p.label}
            </dt>
            <dd className="mt-0.5 text-lg font-medium">
              {pct(p.value, total)}
              <span className="ml-1.5 text-xs font-normal text-muted-foreground tabular-nums">
                {visitsWord(p.value)}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function Breakdowns({ data }: { data: Dashboard }) {
  const visits = data.totals.visits;
  return (
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
      <Panel className="p-4 sm:p-5">
        <PanelTitle title="Products opened" sub="Visits that opened each product." />
        <div className="mt-4">
          <BarList
            rows={data.products}
            total={visits}
            unit={(r) => `Opened ${times(r.events)} across ${visitsWord(r.visits)}`}
            empty="No products opened yet"
          />
        </div>
      </Panel>
      <Panel className="p-4 sm:p-5">
        <PanelTitle title="Themes switched to" sub="Property or campaign they switched to." />
        <div className="mt-4">
          <BarList
            rows={data.themes}
            total={visits}
            unit={(r) => `Switched to it ${times(r.events)} across ${visitsWord(r.visits)}`}
            empty="Nobody switched themes"
          />
        </div>
      </Panel>
      <Panel className="p-4 sm:p-5">
        <PanelTitle title="Devices" sub="What they opened the demo on." />
        <div className="mt-4">
          <DeviceSplit {...data.devices} />
          <div className="mt-5 border-t border-border pt-4">
            <BarList
              rows={data.os}
              total={visits}
              unit={(r) => visitsWord(r.visits)}
              empty="No visits yet"
            />
          </div>
        </div>
      </Panel>
      <Panel className="p-4 sm:p-5">
        <PanelTitle title="Countries" sub="From the visitor's network location." />
        <div className="mt-4">
          <BarList
            rows={data.countries}
            total={visits}
            label={(r) => countryName(r.label)}
            unit={(r) => visitsWord(r.visits)}
            empty="No visits yet"
          />
        </div>
      </Panel>
    </div>
  );
}
