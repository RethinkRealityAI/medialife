/** Pieces several Partner Hub pages share: the five-step journey, a creator's status. */
import { Check } from "lucide-react";

import { Pill } from "@/components/hub/app/ui";
import { CREATOR_STATUS, type CreatorStatus } from "@/lib/hub/model";
import { JOURNEY, type JourneyStep } from "@/lib/hub/partners";
import { cn } from "@/lib/utils";

export const journeyIndex = (id: JourneyStep) => JOURNEY.findIndex((s) => s.id === id);

export function CreatorStatusPill({ status }: { status: CreatorStatus }) {
  const s = CREATOR_STATUS[status];
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

/** Where a creator is on the five steps: done, current, to come. */
export function JourneyTrack({
  current,
  status,
  className,
}: {
  current: JourneyStep;
  status?: CreatorStatus;
  className?: string;
}) {
  const at = journeyIndex(current);
  // Not through review yet: step one is in progress, not done.
  const stalled = status === "declined" || status === "waitlist" || status === "paused";
  return (
    <ol className={cn("grid grid-cols-5 gap-1.5", className)} aria-label="Program steps">
      {JOURNEY.map((s, i) => {
        const done = i < at;
        const now = i === at;
        return (
          <li key={s.id} className="min-w-0">
            <div
              className={cn(
                "h-1.5 rounded-full",
                done
                  ? "bg-[var(--partner,var(--primary))]"
                  : now
                    ? stalled
                      ? "bg-amber-400/70"
                      : "bg-[var(--partner,var(--primary))]/55"
                    : "bg-white/10",
              )}
            />
            <div
              className={cn(
                "mt-1.5 flex items-center gap-1 truncate text-[11px]",
                now ? "font-medium text-foreground" : "text-muted-foreground",
              )}
              aria-current={now ? "step" : undefined}
            >
              {done ? <Check className="size-3 shrink-0" aria-hidden /> : null}
              <span className="truncate">{s.short}</span>
              <span className="sr-only">{done ? " (done)" : now ? " (current)" : ""}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** How many creators are at each step. */
export function JourneyFunnel({
  counts,
  onPick,
  active,
}: {
  counts: Record<JourneyStep, number>;
  onPick?: (s: JourneyStep | null) => void;
  active?: JourneyStep | null;
}) {
  return (
    <ol className="grid grid-cols-2 gap-2 @2xl/inset:grid-cols-5">
      {JOURNEY.map((s) => {
        const Tag = onPick ? "button" : "div";
        return (
          <li key={s.id}>
            <Tag
              {...(onPick
                ? {
                    type: "button" as const,
                    onClick: () => onPick(active === s.id ? null : s.id),
                    "aria-pressed": active === s.id,
                  }
                : {})}
              className={cn(
                "flex h-full w-full flex-col rounded-xl border p-3 text-left transition-colors",
                active === s.id
                  ? "border-[var(--partner)] bg-[var(--partner)]/10"
                  : "border-border bg-white/[0.02]",
                onPick &&
                  "hover:border-[var(--partner)]/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              )}
            >
              <span className="text-[11px] text-muted-foreground tabular-nums">Step {s.n}</span>
              <span className="mt-0.5 text-sm font-medium">{s.title}</span>
              <span className="mt-auto pt-2 text-2xl font-semibold tabular-nums">
                {counts[s.id]}
              </span>
            </Tag>
          </li>
        );
      })}
    </ol>
  );
}
