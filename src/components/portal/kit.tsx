/**
 * The small set of pieces every portal screen is built from.
 *
 * Ten screens sharing one page header, one panel and one stat tile is what
 * makes the portal read as an application rather than ten pages that happen to
 * sit behind the same sidebar.
 */
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Check, Minus } from "lucide-react";

import { cn } from "@/lib/utils";
import { PROGRAM, type StageId, daysSince, shortDate, stageIndex } from "@/lib/roblox-portal";

/* ---------------------------------------------------------------------------
   Page furniture
   --------------------------------------------------------------------------- */

export function PageHeader({
  eyebrow,
  title,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6 border-b border-border px-4 py-8 sm:px-6 lg:px-8">
      <div className="min-w-0 max-w-3xl">
        <div className="mono text-[10px] tracking-[0.22em] text-muted-foreground uppercase">
          {eyebrow}
        </div>
        <h1 className="mt-3 text-3xl font-medium tracking-tight text-balance md:text-4xl">
          {title}
        </h1>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Section({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("px-4 py-8 sm:px-6 lg:px-8", className)}>
      {title ? (
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <h2 className="min-w-0 text-lg font-medium tracking-tight">{title}</h2>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Panel({
  children,
  className,
  glow = false,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-gradient-to-b from-white/[0.03] to-transparent",
        glow && "shadow-[0_0_60px_-24px_var(--color-glow)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Status
   --------------------------------------------------------------------------- */

const TONES = {
  live: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  active: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  clear: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  primary: "border-primary/45 bg-primary/12 text-primary",
  "in-review": "border-primary/45 bg-primary/12 text-primary",
  sampling: "border-primary/45 bg-primary/12 text-primary",
  "on-track": "border-primary/45 bg-primary/12 text-primary",
  accent: "border-accent/45 bg-accent/12 text-accent",
  design: "border-accent/45 bg-accent/12 text-accent",
  watch: "border-amber-400/45 bg-amber-400/10 text-amber-300",
  "needs-info": "border-amber-400/45 bg-amber-400/10 text-amber-300",
  muted: "border-border bg-white/[0.03] text-muted-foreground",
  proposed: "border-border bg-white/[0.03] text-muted-foreground",
  approved: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
} as const;

export type Tone = keyof typeof TONES;

export function Pill({
  tone = "muted",
  children,
  className,
  dot = true,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "mono inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] tracking-[0.1em] whitespace-nowrap uppercase",
        TONES[tone] ?? TONES.muted,
        className,
      )}
    >
      {dot ? <span aria-hidden className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------------------
   Numbers
   --------------------------------------------------------------------------- */

/**
 * A single measure. `delta` is the change against the previous 30 days; for a
 * measure where down is the good direction — reorder velocity in days — pass
 * `lowerIsBetter` so the colour still means "good".
 */
export function Stat({
  label,
  value,
  delta,
  hint,
  lowerIsBetter = false,
}: {
  label: string;
  value: string;
  delta?: number | null;
  hint?: string;
  lowerIsBetter?: boolean;
}) {
  const good = delta == null ? null : lowerIsBetter ? delta < 0 : delta > 0;
  const Icon = delta == null || delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <Panel className="p-4">
      <div className="mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-medium tracking-tight tabular-nums">{value}</span>
        {delta != null ? (
          <span
            className={cn(
              "mono inline-flex items-center gap-0.5 text-[11px]",
              good === null
                ? "text-muted-foreground"
                : good
                  ? "text-emerald-400"
                  : "text-amber-400",
            )}
          >
            <Icon className="size-3" aria-hidden />
            {Math.abs(delta) < 1
              ? `${(Math.abs(delta) * 100).toFixed(Math.abs(delta) < 0.01 ? 1 : 0)}%`
              : Math.abs(delta).toFixed(1)}
          </span>
        ) : null}
      </div>
      {hint ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
    </Panel>
  );
}

/* ---------------------------------------------------------------------------
   The pipeline
   --------------------------------------------------------------------------- */

/**
 * Where a property sits in the program, as a four-stage bar.
 *
 * `compact` drops the per-stage copy for use inside a table row; the full form
 * is what the status screen shows.
 */
/**
 * The same four stages as StageSteps, but as cards carrying each stage's copy —
 * for the screens that have to explain the pipeline rather than just locate a
 * property in it.
 *
 * The fill is a solid colour, not a gradient. A gradient reads as decoration and
 * gives the eye nothing to measure 40% against 60% with.
 */
export function StageBar({
  stage,
  progress,
  compact = false,
}: {
  stage: StageId;
  progress: number;
  compact?: boolean;
}) {
  const at = stageIndex(stage);

  return (
    <ol className={cn("grid gap-2", compact ? "grid-cols-4" : "gap-3 md:grid-cols-4")}>
      {PROGRAM.stages.map((s, i) => {
        const done = i < at;
        const here = i === at;
        return (
          <li
            key={s.id}
            className={cn(
              compact ? "" : "rounded-lg border p-4",
              !compact &&
                (here
                  ? "border-primary/45 bg-primary/[0.07]"
                  : done
                    ? "border-border bg-white/[0.02]"
                    : "border-border/60"),
            )}
          >
            <div
              className="h-1 w-full overflow-hidden rounded-full bg-white/10"
              role="presentation"
            >
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-500",
                  done || here ? "bg-primary" : "bg-transparent",
                )}
                style={{ width: done ? "100%" : here ? `${Math.max(6, progress)}%` : "0%" }}
              />
            </div>
            <div
              className={cn(
                "mono mt-2 flex items-center gap-1.5 text-[10px] tracking-[0.12em] uppercase",
                here
                  ? "text-foreground"
                  : done
                    ? "text-muted-foreground"
                    : "text-muted-foreground/60",
              )}
            >
              {done ? (
                <Check className="size-3 shrink-0 text-primary" strokeWidth={3} aria-hidden />
              ) : null}
              {compact ? s.short : `0${i + 1} · ${s.name}`}
            </div>
            {!compact ? (
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{s.blurb}</p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The program as a stepper: a node per stage, a solid connector between them,
 * and a determinate fill on the connector leaving the stage a property is in.
 *
 * This replaces a row of gradient-filled bars. A gradient reads as decoration —
 * the eye cannot tell 40% from 60% of a gradient, and four of them side by side
 * say nothing about order. A checked node, a solid line and one partial segment
 * say which steps are done, which one is running and how far through it is.
 */
export function StageSteps({
  stage,
  progress,
  className,
}: {
  stage: StageId;
  progress: number;
  className?: string;
}) {
  const at = stageIndex(stage);
  const last = PROGRAM.stages.length - 1;

  return (
    <ol className={cn("flex items-start", className)}>
      {PROGRAM.stages.map((s, i) => {
        const done = i < at;
        const here = i === at;
        // The connector leaving this node: full once the stage is cleared,
        // partial while the property is working through it, empty ahead.
        const fill = done ? 100 : here ? Math.max(4, Math.min(100, progress)) : 0;

        return (
          <li key={s.id} className={cn("min-w-0", i === last ? "shrink-0" : "flex-1")}>
            <div className="flex items-center">
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors",
                  done
                    ? "border-primary bg-primary text-background"
                    : here
                      ? "border-primary bg-primary/15"
                      : "border-border bg-transparent",
                )}
              >
                {done ? (
                  <Check className="size-3" strokeWidth={3} aria-hidden />
                ) : (
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 rounded-full",
                      here ? "bg-primary" : "bg-muted-foreground/40",
                    )}
                  />
                )}
              </span>

              {i < last ? (
                <span className="mx-1.5 h-0.5 min-w-0 flex-1 rounded-full bg-border">
                  <span
                    className="block h-full rounded-full bg-primary transition-[width] duration-500"
                    style={{ width: `${fill}%` }}
                  />
                </span>
              ) : null}
            </div>

            <div
              className={cn(
                "mono mt-2 truncate pr-2 text-[10px] tracking-[0.1em] uppercase",
                here
                  ? "text-foreground"
                  : done
                    ? "text-muted-foreground"
                    : "text-muted-foreground/55",
              )}
            >
              <span className="sm:hidden">{s.short}</span>
              <span className="hidden sm:inline">{s.name}</span>
            </div>
            {here ? (
              <div className="mono text-[10px] tracking-[0.1em] text-primary tabular-nums">
                {Math.round(progress)}%
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The submission date, given the weight it earns. When a property came in sets
 * every expectation around it, so it gets a block rather than a clause in a
 * line of metadata.
 */
export function DateBlock({ iso, label = "Submitted" }: { iso: string; label?: string }) {
  const d = new Date(`${iso}T12:00:00Z`);
  const days = daysSince(iso);
  return (
    <div className="flex shrink-0 items-center gap-3">
      <div className="grid size-12 shrink-0 place-content-center rounded-lg border border-border bg-white/[0.03] text-center leading-none">
        <span className="mono text-[9px] tracking-[0.12em] text-primary uppercase">
          {d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}
        </span>
        <span className="mt-1 text-base font-medium tabular-nums">
          {d.toLocaleDateString("en-US", { day: "numeric", timeZone: "UTC" })}
        </span>
      </div>
      <div className="min-w-0">
        <div className="mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
          {label}
        </div>
        <div className="text-sm tabular-nums">{shortDate(iso)}</div>
        <div className="mono text-[10px] tracking-[0.1em] text-muted-foreground tabular-nums">
          {days} days ago
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Definition list, for the many key/value readouts
   --------------------------------------------------------------------------- */

export function KeyValues({
  rows,
  className,
}: {
  rows: Array<[label: string, value: ReactNode]>;
  className?: string;
}) {
  return (
    <dl className={cn("divide-y divide-border", className)}>
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-6 py-2.5">
          <dt className="mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            {label}
          </dt>
          <dd className="text-right text-sm tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
