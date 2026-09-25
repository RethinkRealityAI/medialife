import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Dashboard } from "@/lib/ar/analytics.server";

import { pct } from "../format";
import { Panel, PanelTitle } from "../kit";
import { VIZ } from "./viz";

/**
 * How far visitors got, as ordered horizontal bars. Stages are ordinal, so they
 * take one hue stepped light → deep. Every value is printed; the hover adds the
 * step-to-step conversion.
 */
export function Funnel({ data, className }: { data: Dashboard; className?: string }) {
  const steps = data.funnel;
  const top = steps[0]?.count ?? 0;

  return (
    <Panel className={className}>
      <div className="p-4 sm:p-5">
        <PanelTitle
          title="How far they got"
          sub="Each step counts the opens that got at least that far."
        />
        <ol className="mt-5 space-y-3.5">
          {steps.map((s, i) => {
            const prev = i > 0 ? steps[i - 1].count : null;
            const width = top ? (s.count / top) * 100 : 0;
            return (
              <li key={s.id}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{s.label}</span>
                  <span className="shrink-0 tabular-nums">
                    <span className="font-medium">{s.count}</span>
                    <span className="ml-2 inline-block w-10 text-right text-xs text-muted-foreground">
                      {pct(s.count, top)}
                    </span>
                  </span>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="mt-1.5 h-2.5 w-full rounded-r-[4px] bg-white/[0.04]">
                      <div
                        className="h-full rounded-r-[4px] transition-[width] duration-500"
                        style={{
                          width: `${width}%`,
                          minWidth: s.count ? 3 : 0,
                          background: VIZ.funnel[i] ?? VIZ.funnel[VIZ.funnel.length - 1],
                        }}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="border border-border bg-popover text-popover-foreground">
                    <span className="font-medium tabular-nums">{s.count}</span> of {top} opens (
                    {pct(s.count, top)})
                    {prev !== null ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {pct(s.count, prev)} of the step before
                      </span>
                    ) : null}
                  </TooltipContent>
                </Tooltip>
              </li>
            );
          })}
        </ol>
      </div>
    </Panel>
  );
}
