import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Check } from "lucide-react";

import { PageHeader, Panel, Pill, Section, type Tone } from "@/components/portal/kit";
import { ACTIVE, PROGRAM, REVIEW, shortDate } from "@/lib/roblox-portal";

export const Route = createFileRoute("/roblox/portal/review")({
  component: ProgramReview,
});

const GATE_LABEL: Record<string, string> = {
  clear: "Clear",
  "on-track": "On track",
  watch: "Watch",
};

function ProgramReview() {
  const cleared = REVIEW.gates.filter((g) => g.state === "clear").length;
  const left = REVIEW.totalDays - REVIEW.dayOf;

  return (
    <>
      <PageHeader
        eyebrow={`The pilot / ${PROGRAM.reviewDays}-day program review`}
        title="The conversation this data is for."
        lede={`At the end of the test period Roblox, the IP holder and MEDIALIFE read the same numbers together and decide what happens next: reorders, a wider assortment, or retail. This is that review, as it stands on day ${REVIEW.dayOf}.`}
        actions={
          <Pill tone={cleared === REVIEW.gates.length ? "clear" : "primary"}>
            {cleared} of {REVIEW.gates.length} gates clear
          </Pill>
        }
      />

      {/* THE WINDOW */}
      <Section className="border-b border-border">
        <Panel className="p-5" glow>
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <div>
              <div className="mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                Validation window
              </div>
              <div className="mt-1.5 text-sm">
                {shortDate(REVIEW.windowStart)} → {shortDate(REVIEW.windowEnd)}
              </div>
            </div>
            <div className="text-right">
              <div className="mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                Day
              </div>
              <div className="mt-1.5 text-2xl font-medium tabular-nums">
                {REVIEW.dayOf}
                <span className="text-base text-muted-foreground"> / {REVIEW.totalDays}</span>
              </div>
            </div>
          </div>
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(REVIEW.dayOf / REVIEW.totalDays) * 100}%`,
                background: "var(--gradient-ember)",
              }}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {left} days left. Gates are read continuously, not just at the end — a measure that
            clears early is a signal to start modelling the reorder.
          </p>
        </Panel>
      </Section>

      {/* GATES */}
      <Section
        title="Measures against their gates"
        hint="Each gate was set before the window opened, so clearing one is a result rather than a rationalisation."
      >
        <Panel className="overflow-hidden">
          {/* The Panel clips for its rounded corners, so the table needs its own
              scroller or the last column is unreachable on a phone. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] text-sm">
              <caption className="sr-only">
                {ACTIVE.property} pilot measures against their program-review gates
              </caption>
              <thead>
                <tr className="mono border-b border-border text-left text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                  <th scope="col" className="px-4 py-3 font-normal">
                    Measure
                  </th>
                  <th scope="col" className="px-4 py-3 font-normal">
                    Gate
                  </th>
                  <th scope="col" className="px-4 py-3 font-normal">
                    Actual
                  </th>
                  <th scope="col" className="px-4 py-3 font-normal">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {REVIEW.gates.map((g) => (
                  <tr key={g.id} className="align-top">
                    <th scope="row" className="px-4 py-3.5 text-left font-medium">
                      {g.measure}
                      <p className="mt-1 max-w-md text-xs leading-relaxed font-normal text-muted-foreground">
                        {g.note}
                      </p>
                    </th>
                    <td className="px-4 py-3.5 tabular-nums text-muted-foreground">{g.target}</td>
                    <td className="px-4 py-3.5 text-base tabular-nums">{g.actual}</td>
                    <td className="px-4 py-3.5">
                      <Pill tone={g.state as Tone} dot={false}>
                        {g.state === "watch" ? (
                          <AlertTriangle className="size-3" aria-hidden />
                        ) : (
                          <Check className="size-3" aria-hidden />
                        )}
                        {GATE_LABEL[g.state]}
                      </Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </Section>

      {/* DECISIONS */}
      <Section
        title="What the review decides"
        hint="The point of the window is not the data. It is these four calls."
        className="border-t border-border"
      >
        <div className="grid gap-3 md:grid-cols-2">
          {REVIEW.decisions.map((d, i) => (
            <Panel key={d.id} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <span className="mono text-[10px] tracking-[0.18em] text-primary uppercase">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <Pill tone={d.recommendation === "Ready" ? "clear" : "primary"} dot={false}>
                  {d.recommendation}
                </Pill>
              </div>
              <h3 className="mt-3 text-base font-medium tracking-tight">{d.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{d.body}</p>
            </Panel>
          ))}
        </div>
      </Section>
    </>
  );
}
