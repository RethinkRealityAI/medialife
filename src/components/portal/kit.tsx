/**
 * The small set of pieces every portal screen is built from.
 *
 * Ten screens sharing one page header, one panel and one stat tile is what
 * makes the portal read as an application rather than ten pages that happen to
 * sit behind the same sidebar.
 */
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { cn } from "@/lib/utils";
import { PROGRAM, type StageId, stageIndex } from "@/lib/roblox-portal";

/* ---------------------------------------------------------------------------
   Page furniture
   --------------------------------------------------------------------------- */

export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
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
        {lede ? <p className="mt-4 text-muted-foreground md:text-lg">{lede}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Section({
  title,
  hint,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("px-4 py-8 sm:px-6 lg:px-8", className)}>
      {title ? (
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-medium tracking-tight">{title}</h2>
            {hint ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{hint}</p> : null}
          </div>
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
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: done ? "100%" : here ? `${Math.max(6, progress)}%` : "0%",
                  background: done || here ? "var(--gradient-ember)" : "transparent",
                }}
              />
            </div>
            <div
              className={cn(
                "mono mt-2 text-[10px] tracking-[0.12em] uppercase",
                here
                  ? "text-foreground"
                  : done
                    ? "text-muted-foreground"
                    : "text-muted-foreground/60",
              )}
            >
              {compact ? s.name.split(" ")[0] : `0${i + 1} · ${s.name}`}
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
