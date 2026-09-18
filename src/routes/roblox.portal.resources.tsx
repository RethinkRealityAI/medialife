import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ExternalLink } from "lucide-react";

import { PageHeader, Panel, Pill, Section } from "@/components/portal/kit";
import { ECONOMICS, RESOURCES, money, pct } from "@/lib/roblox-portal";

export const Route = createFileRoute("/roblox/portal/resources")({
  component: Resources,
});

function Resources() {
  return (
    <>
      <PageHeader eyebrow="Reference" title="Resources" />

      <Section>
        <div className="grid gap-3 md:grid-cols-2">
          {RESOURCES.map((r) => (
            <Panel
              key={r.id}
              className="flex flex-col p-5 transition-colors hover:border-primary/40"
            >
              <Pill tone="muted">{r.kind}</Pill>
              <h2 className="mt-3 text-base font-medium tracking-tight">{r.title}</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{r.body}</p>
              {r.external ? (
                <a
                  href={r.href}
                  className="mono mt-4 inline-flex items-center gap-1.5 text-[11px] tracking-[0.12em] text-primary uppercase hover:underline"
                >
                  {r.action} <ExternalLink className="size-3" aria-hidden />
                </a>
              ) : (
                <Link
                  to={r.href}
                  className="mono mt-4 inline-flex items-center gap-1.5 text-[11px] tracking-[0.12em] text-primary uppercase hover:underline"
                >
                  {r.action} <ArrowRight className="size-3" aria-hidden />
                </Link>
              )}
            </Panel>
          ))}
        </div>
      </Section>

      <Section title="Program economics" className="border-t border-border">
        <Panel className="overflow-hidden">
          {/* The Panel clips for its rounded corners, so the table needs its own
              scroller or the last column is unreachable on a phone. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] text-sm">
              <caption className="sr-only">Modelled economics by channel</caption>
              <thead>
                <tr className="mono border-b border-border text-left text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                  <th scope="col" className="px-4 py-3 font-normal">
                    Assumption
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-normal">
                    {ECONOMICS.onPlatform.label}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-normal">
                    {ECONOMICS.retail.label}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(
                  [
                    [
                      "Roblox economics",
                      pct(ECONOMICS.onPlatform.robloxEconomics),
                      pct(ECONOMICS.retail.robloxEconomics),
                    ],
                    [
                      "IP-holder royalty",
                      pct(ECONOMICS.onPlatform.ipRoyalty),
                      pct(ECONOMICS.retail.ipRoyalty),
                    ],
                    [
                      "Commerce fee",
                      pct(ECONOMICS.onPlatform.commerceFee, 2),
                      ECONOMICS.retail.commerceFee == null
                        ? "N/A"
                        : pct(ECONOMICS.retail.commerceFee),
                    ],
                    [
                      "Contingency",
                      pct(ECONOMICS.onPlatform.contingency),
                      pct(ECONOMICS.retail.contingency),
                    ],
                    [
                      "Modelled contribution margin",
                      `${pct(ECONOMICS.onPlatform.marginLow)}–${pct(ECONOMICS.onPlatform.marginHigh)}`,
                      `${pct(ECONOMICS.retail.marginLow)}–${pct(ECONOMICS.retail.marginHigh)}`,
                    ],
                  ] as Array<[string, string, string]>
                ).map(([label, a, b]) => (
                  <tr key={label}>
                    <th scope="row" className="px-4 py-3 text-left font-normal">
                      {label}
                    </th>
                    <td className="px-4 py-3 text-right tabular-nums">{a}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{b}</td>
                  </tr>
                ))}
                {ECONOMICS.leadTimes.map((l) => (
                  <tr key={l.region}>
                    <th scope="row" className="px-4 py-3 text-left font-normal">
                      {l.region}
                      <span className="block text-xs text-muted-foreground">{l.use}</span>
                    </th>
                    <td className="px-4 py-3 text-right tabular-nums" colSpan={2}>
                      {l.weeks} weeks
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <p className="mt-4 max-w-3xl text-xs leading-relaxed text-muted-foreground">
          Suggested on-platform pricing runs {money(ECONOMICS.priceFloor)}–
          {money(ECONOMICS.priceCeiling)} across {ECONOMICS.categoriesModelled} modelled categories.{" "}
          {ECONOMICS.disclaimer}
        </p>
      </Section>
    </>
  );
}
