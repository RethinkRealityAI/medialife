import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, CircleDashed, Loader2 } from "lucide-react";

import { KeyValues, PageHeader, Panel, Pill, Section, StageBar } from "@/components/portal/kit";
import {
  ACTIVE,
  PROGRAM,
  RESPONSIBILITIES,
  REVIEW,
  shortDate,
  stageIndex,
} from "@/lib/roblox-portal";

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
      { label: "Design", state: "done" },
      { label: "Sampling", state: "done" },
      { label: "IP approval", state: "doing" },
      { label: "Production", state: "todo" },
      { label: "Fulfilment", state: "todo" },
    ],
  },
  {
    id: "experience",
    name: "Experience",
    sub: "Immersive production",
    accent: "var(--color-accent)",
    steps: [
      { label: "Concept", state: "done" },
      { label: "Asset intake", state: "done" },
      { label: "Build", state: "done" },
      { label: "Reward code", state: "doing" },
      { label: "Device QA", state: "todo" },
    ],
  },
] as const;

const STEP_ICON = { done: CheckCircle2, doing: Loader2, todo: CircleDashed } as const;

function Status() {
  const at = stageIndex(ACTIVE.stage);

  return (
    <>
      <PageHeader
        eyebrow="Program / Project status"
        title={`Where ${ACTIVE.property} sits today.`}
        lede="The four program stages, the two production tracks running inside the current one, and who owes what at each step."
        actions={<Pill tone="active">Day {REVIEW.dayOf} of the validation window</Pill>}
      />

      <Section
        title="Program stages"
        hint="A property only moves on when its measures say it should."
      >
        <StageBar stage={ACTIVE.stage} progress={ACTIVE.stageProgress} />
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {ACTIVE.property} cleared review and product development and is {ACTIVE.stageProgress}%
          through {PROGRAM.stages[at]?.name.toLowerCase()}. Retail consideration opens at the{" "}
          {PROGRAM.reviewDays}-day review on {shortDate(REVIEW.windowEnd)}.
        </p>
      </Section>

      <Section
        title="Two tracks, one launch date"
        hint="Both were staffed the day the agreement was signed. Neither ships without the other."
        className="border-t border-border"
      >
        <div className="grid gap-3 lg:grid-cols-2">
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
                    <li key={s.label} className="flex items-center gap-3 px-4 py-3">
                      <Icon
                        className={
                          s.state === "done"
                            ? "size-4 shrink-0 text-emerald-400"
                            : s.state === "doing"
                              ? "size-4 shrink-0 animate-spin text-primary [animation-duration:3s]"
                              : "size-4 shrink-0 text-muted-foreground/50"
                        }
                        aria-hidden
                      />
                      <span
                        className={s.state === "todo" ? "text-sm text-muted-foreground" : "text-sm"}
                      >
                        {s.label}
                      </span>
                      {s.state === "doing" ? (
                        <span className="mono ml-auto text-[10px] tracking-[0.12em] text-primary uppercase">
                          In progress
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </Panel>
          ))}
        </div>
      </Section>

      <div className="grid border-t border-border lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Section title="This property" className="lg:border-r lg:border-border">
          <Panel className="p-4">
            <KeyValues
              rows={[
                ["Property", ACTIVE.property],
                ["Studio", ACTIVE.studio],
                ["Genre", ACTIVE.genre],
                ["Submitted", shortDate(ACTIVE.submitted)],
                ["Live since", ACTIVE.liveSince ? shortDate(ACTIVE.liveSince) : "—"],
                ["Review closes", shortDate(REVIEW.windowEnd)],
              ]}
            />
          </Panel>
        </Section>

        <Section
          title="Who owes what"
          hint="Explicit at every step, so a creator knows what they owe and Roblox knows where a property sits."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {RESPONSIBILITIES.map((r) => (
              <Panel key={r.party} className="p-4">
                <Pill tone={r.tone}>{r.party}</Pill>
                <ul className="mt-3 space-y-2">
                  {r.items.map((i) => (
                    <li key={i} className="text-xs leading-relaxed text-muted-foreground">
                      {i}
                    </li>
                  ))}
                </ul>
              </Panel>
            ))}
          </div>
        </Section>
      </div>
    </>
  );
}
