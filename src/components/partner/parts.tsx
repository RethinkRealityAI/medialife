/** Pieces several Partner Hub pages share: the five-step journey, a creator's status. */
import {
  Check,
  FileSignature,
  Package,
  Palette,
  UserPlus,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { Link } from "@tanstack/react-router";

import { Pill } from "@/components/hub/app/ui";
import { IconTile, accentEdge, lift, surface } from "@/components/partner/ui";
import { CREATOR_STATUS, type CreatorStatus } from "@/lib/hub/model";
import { JOURNEY, type JourneyStep } from "@/lib/hub/partners";
import { cn } from "@/lib/utils";

export const STEP_ICONS: Record<JourneyStep, LucideIcon> = {
  apply: UserPlus,
  sign: FileSignature,
  approve: Palette,
  make: Package,
  paid: Wallet,
};

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

const STEP_TONES = ["ice", "blue", "violet", "mint", "amber"] as const;

/**
 * How many creators are at each step. Pick a step to filter (`onPick`), or
 * follow it to Creators filtered to that step (`linked`).
 */
export function JourneyFunnel({
  counts,
  onPick,
  active,
  linked,
}: {
  counts: Record<JourneyStep, number>;
  onPick?: (s: JourneyStep | null) => void;
  active?: JourneyStep | null;
  linked?: boolean;
}) {
  const max = Math.max(1, ...Object.values(counts));
  return (
    <ol className="-mx-1 flex snap-x gap-2.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] @2xl/inset:grid @2xl/inset:grid-cols-5 @2xl/inset:overflow-visible [&::-webkit-scrollbar]:hidden">
      {JOURNEY.map((s, i) => {
        const Icon = STEP_ICONS[s.id];
        const body = (
          <>
            <span className="flex items-center justify-between gap-2">
              <IconTile icon={Icon} tone={STEP_TONES[i]} size="sm" />
              <span className="text-[11px] text-muted-foreground tabular-nums">Step {s.n}</span>
            </span>
            <span className="mt-3 text-sm font-medium">{s.short}</span>
            <span className="mt-auto pt-1 text-3xl font-semibold tracking-tight tabular-nums">
              {counts[s.id]}
            </span>
            <span aria-hidden className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
              <span
                className="block h-full rounded-full bg-gradient-to-r from-[var(--partner-2)] to-[var(--partner)]"
                style={{ width: `${(counts[s.id] / max) * 100}%` }}
              />
            </span>
          </>
        );
        const cls = cn(
          surface,
          "flex h-full w-full flex-col p-3.5 text-left",
          (onPick || linked) && lift,
          active === s.id && accentEdge,
          active === s.id && "bg-[var(--partner)]/10",
        );
        return (
          <li key={s.id} className="w-36 shrink-0 snap-start @2xl/inset:w-auto">
            {linked ? (
              <Link to="/partner-hub/creators" search={{ step: s.id }} className={cls}>
                {body}
              </Link>
            ) : onPick ? (
              <button
                type="button"
                onClick={() => onPick(active === s.id ? null : s.id)}
                aria-pressed={active === s.id}
                className={cls}
              >
                {body}
              </button>
            ) : (
              <div className={cls}>{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
