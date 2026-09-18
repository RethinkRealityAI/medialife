import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, CircleDashed, Loader2 } from "lucide-react";

import { PageHeader, Panel, Pill, Section, StageBar } from "@/components/portal/kit";
import { RequirementsList } from "@/components/portal/requirements";
import { Thread } from "@/components/portal/thread";
import { ACTIVE, REQUIREMENTS, REVIEW, THREAD, requirementSummary } from "@/lib/roblox-portal";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/roblox/portal/status")({
  component: Status,
});

/**
 * The two production tracks, from the onboarding flow. They run at once and
 * land on the same date: a product with no activation is just merch, and an
 * activation with no reward path is a dead end.
 */
const TRACKS = [
  {
    id: "merch",
    name: "Merchandise",
    sub: "Production & sourcing",
    accent: "var(--color-primary)",
    steps: [
      { label: "Design", owner: "MEDIALIFE", state: "done", when: "Jun 2026" },
      { label: "Code placement", owner: "MEDIALIFE", state: "done", when: "Jun 2026" },
      { label: "Sampling", owner: "MEDIALIFE", state: "done", when: "Jul 2026" },
      { label: "IP approval", owner: "Hexagon Development", state: "doing", when: "This week" },
      { label: "Production", owner: "MEDIALIFE", state: "todo", when: "On approval" },
      { label: "Fulfilment", owner: "MEDIALIFE", state: "todo", when: "6–13 weeks after" },
    ],
  },
  {
    id: "experience",
    name: "Experience",
    sub: "Immersive production",
    accent: "var(--color-accent)",
    steps: [
      { label: "Concept", owner: "Together", state: "done", when: "Jun 2026" },
      { label: "Asset intake", owner: "Hexagon Development", state: "done", when: "Jun 2026" },
      { label: "Build", owner: "MEDIALIFE", state: "done", when: "Jul 2026" },
      { label: "Reward integration", owner: "MEDIALIFE", state: "doing", when: "This week" },
      { label: "Device QA", owner: "MEDIALIFE", state: "todo", when: "Before launch" },
    ],
  },
] as const;

const STEP_ICON = { done: CheckCircle2, doing: Loader2, todo: CircleDashed } as const;

function Status() {
  const groups = REQUIREMENTS[ACTIVE.id] ?? [];
  const need = requirementSummary(groups);
  const thread = THREAD[ACTIVE.id] ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Program / Project status"
        title={`Where ${ACTIVE.property} sits today.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {need.outstanding ? (
              <Pill tone="watch">
                {need.outstanding} {need.outstanding === 1 ? "item" : "items"} needed from you
              </Pill>
            ) : null}
            <Pill tone="active">Day {REVIEW.dayOf} of the validation window</Pill>
          </div>
        }
      />

      <Section title="Program stages">
        <StageBar stage={ACTIVE.stage} progress={ACTIVE.stageProgress} />
      </Section>

      <Section title="Two tracks, one launch date" className="border-t border-border">
        {/* items-start: the tracks have different step counts, and stretching the
            shorter one leaves a hole under its last step. */}
        <div className="grid items-start gap-3 lg:grid-cols-2">
          {TRACKS.map((t) => (
            <Panel key={t.id} className="overflow-hidden">
              <div
                className="border-b border-border px-4 py-3"
                style={{ boxShadow: `inset 3px 0 0 0 ${t.accent}` }}
              >
                <div className="text-sm font-medium">{t.name}</div>
                <div className="mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                  {t.sub}
                </div>
              </div>
              <ol className="divide-y divide-border">
                {t.steps.map((s) => {
                  const Icon = STEP_ICON[s.state];
                  return (
                    <li key={s.label} className="flex items-start gap-3 px-4 py-3">
                      <Icon
                        className={
                          s.state === "done"
                            ? "mt-0.5 size-4 shrink-0 text-emerald-400"
                            : s.state === "doing"
                              ? "mt-0.5 size-4 shrink-0 animate-spin text-primary [animation-duration:3s]"
                              : "mt-0.5 size-4 shrink-0 text-muted-foreground/50"
                        }
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <div
                          className={
                            s.state === "todo" ? "text-sm text-muted-foreground" : "text-sm"
                          }
                        >
                          {s.label}
                        </div>
                        <div className="mono mt-0.5 text-[10px] tracking-[0.1em] text-muted-foreground uppercase">
                          {s.owner}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "mono shrink-0 text-[10px] tracking-[0.1em] uppercase",
                          s.state === "doing" ? "text-primary" : "text-muted-foreground",
                        )}
                      >
                        {s.when}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </Panel>
          ))}
        </div>
      </Section>

      <Section title="What we still need" className="border-t border-border">
        <RequirementsList groups={groups} />
      </Section>

      <Section title="Thread" className="border-t border-border">
        <div className="max-w-4xl">
          <Thread comments={thread} />
        </div>
      </Section>
    </>
  );
}
