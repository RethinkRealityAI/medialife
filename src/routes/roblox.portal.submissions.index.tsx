import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ChevronRight, Sparkles } from "lucide-react";

import {
  DateBlock,
  PageHeader,
  Panel,
  Pill,
  Section,
  StageSteps,
  type Tone,
} from "@/components/portal/kit";
import { ACTIVATIONS, LAUNCH_METHODS, PROGRAM, SUBMISSIONS, compact } from "@/lib/roblox-portal";

export const Route = createFileRoute("/roblox/portal/submissions/")({
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
        <ul className="space-y-3">
          {SUBMISSIONS.map((s) => {
            const activation = ACTIVATIONS[s.id];
            return (
              <li key={s.id}>
                {/* The whole row is the target. A property is one thing, so it
                    gets one link rather than a "view" affordance to hunt for. */}
                <Link
                  to="/roblox/portal/submissions/$id"
                  params={{ id: s.id }}
                  className="group block rounded-xl focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
                >
                  <Panel className="p-4 transition-colors group-hover:border-primary/45">
                    {/* A grid rather than flex-wrap: with wrapping, a row whose
                        note is one line short puts its date block on a different
                        line from its neighbours', and four rows meant to be
                        scanned against each other stop lining up. */}
                    <div className="grid gap-x-6 gap-y-4 lg:grid-cols-[minmax(0,1fr)_auto]">
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
                            <h3 className="text-base font-medium tracking-tight group-hover:text-primary">
                              {s.property}
                            </h3>
                            <Pill tone={s.status as Tone}>{STATUS_LABEL[s.status]}</Pill>
                            {activation ? (
                              <Pill tone="primary" dot={false}>
                                <Sparkles className="size-3" aria-hidden />
                                {LAUNCH_METHODS[activation.launch].short} activated
                              </Pill>
                            ) : null}
                          </div>
                          <p className="mono mt-1 text-[10px] tracking-[0.1em] text-muted-foreground uppercase">
                            {s.studio} · {s.genre}
                          </p>
                          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                            {s.note}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-6 gap-y-4 lg:flex-nowrap">
                        <DateBlock iso={s.submitted} />
                        <dl className="flex shrink-0 gap-6">
                          <div>
                            <dt className="mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                              Visits
                            </dt>
                            <dd className="mt-1 text-sm tabular-nums">
                              {compact(s.monthlyVisits)}
                            </dd>
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
                        <ChevronRight
                          className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary lg:ml-0"
                          aria-hidden
                        />
                      </div>
                    </div>

                    <div className="mt-5 border-t border-border pt-4">
                      <StageSteps stage={s.stage} progress={s.stageProgress} />
                    </div>
                  </Panel>
                </Link>
              </li>
            );
          })}
        </ul>
      </Section>
    </>
  );
}
