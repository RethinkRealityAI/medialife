import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { PageHeader, Panel, Pill, Section, StageBar, type Tone } from "@/components/portal/kit";
import { PROGRAM, SUBMISSIONS, compact, shortDate } from "@/lib/roblox-portal";

export const Route = createFileRoute("/roblox/portal/submissions")({
  component: Submissions,
});

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  "in-review": "In review",
  approved: "Approved",
  "needs-info": "Needs info",
};

function Submissions() {
  return (
    <>
      <PageHeader
        eyebrow="Program / My submissions"
        title="Every property you have put forward."
        lede="One row per property, with where it sits in the program and what it is waiting on. Properties that do not qualify get a written reason here, not silence."
        actions={
          <Link
            to="/roblox/portal/apply"
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-white transition-transform hover:scale-[1.02]"
            style={{ background: "var(--gradient-ember-btn)" }}
          >
            New submission <ArrowRight className="size-4" aria-hidden />
          </Link>
        }
      />

      <Section>
        <div className="space-y-3">
          {SUBMISSIONS.map((s) => (
            <Panel key={s.id} className="p-4 transition-colors hover:border-primary/40">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3.5">
                  <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface">
                    {s.logo ? (
                      <img
                        src={s.logo}
                        alt=""
                        width={44}
                        height={44}
                        className="size-full object-contain p-1"
                      />
                    ) : (
                      <span className="mono text-xs font-semibold text-muted-foreground">
                        {s.property.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="text-base font-medium tracking-tight">{s.property}</h3>
                      <Pill tone={s.status as Tone}>{STATUS_LABEL[s.status]}</Pill>
                    </div>
                    <p className="mono mt-1 text-[10px] tracking-[0.1em] text-muted-foreground uppercase">
                      {s.studio} · {s.genre} · Submitted {shortDate(s.submitted)}
                    </p>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                      {s.note}
                    </p>
                  </div>
                </div>

                <dl className="flex shrink-0 gap-6">
                  <div>
                    <dt className="mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                      Visits
                    </dt>
                    <dd className="mt-1 text-sm tabular-nums">{compact(s.monthlyVisits)}</dd>
                  </div>
                  <div>
                    <dt className="mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                      SKUs
                    </dt>
                    <dd className="mt-1 text-sm tabular-nums">{s.skus || "—"}</dd>
                  </div>
                  <div>
                    <dt className="mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                      Stage
                    </dt>
                    <dd className="mt-1 text-sm">
                      {PROGRAM.stages.find((x) => x.id === s.stage)?.name}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="mt-4 border-t border-border pt-4">
                <StageBar stage={s.stage} progress={s.stageProgress} compact />
              </div>
            </Panel>
          ))}
        </div>
      </Section>
    </>
  );
}
