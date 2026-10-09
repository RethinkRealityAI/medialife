import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight, HelpCircle, Minus, type LucideIcon } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { Panel } from "./ui";

type KpiLink = { to: "/creator-hub/earnings" | "/creator-hub/products"; label: string };

/**
 * One headline number: label, value, an optional delta against the previous
 * period, an optional tiny chart, and an optional "?" that explains it. With
 * `link`, the whole tile is clickable (a stretched link, so the "?" still works).
 */
export function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  explain,
  delta,
  deltaLabel = "vs previous 30 days",
  chart,
  link,
  emphasis = false,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  explain?: string;
  /** Fractional change, e.g. 0.12 for +12%. null hides it. */
  delta?: number | null;
  deltaLabel?: string;
  chart?: ReactNode;
  link?: KpiLink;
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <Panel
      className={cn(
        "relative flex min-w-0 flex-col p-4 transition-colors",
        link && "hover:border-primary/45 hover:bg-white/[0.035]",
        emphasis && "border-primary/35 shadow-[0_0_50px_-30px_var(--color-primary)]",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
        <span className="leading-tight">{label}</span>
        {explain ? <Explain label={label} text={explain} /> : null}
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="truncate text-xl font-medium tracking-tight tabular-nums sm:text-2xl">
          {value}
        </span>
        {delta !== undefined ? <Delta value={delta} label={deltaLabel} /> : null}
      </div>
      {hint ? (
        <div className="mt-0.5 text-xs leading-snug text-muted-foreground">{hint}</div>
      ) : null}
      {chart ? <div className="mt-auto pt-2">{chart}</div> : null}
      {link ? (
        <Link
          to={link.to}
          className="absolute inset-0 rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className="sr-only">{link.label}</span>
        </Link>
      ) : null}
    </Panel>
  );
}

export function Delta({ value, label }: { value: number | null; label: string }) {
  if (value === null) {
    return <span className="text-xs text-muted-foreground">new</span>;
  }
  const flat = Math.abs(value) < 0.005;
  const up = value > 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const pctText = `${Math.abs(value * 100).toFixed(Math.abs(value) < 0.1 ? 1 : 0)}%`;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
        flat ? "text-muted-foreground" : up ? "text-emerald-400" : "text-amber-300",
      )}
      title={`${flat ? "No change" : up ? "Up" : "Down"} ${pctText} ${label}`}
    >
      <Icon className="size-3.5" aria-hidden />
      {pctText}
      <span className="sr-only">
        {" "}
        {flat ? "no change" : up ? "up" : "down"} {label}
      </span>
    </span>
  );
}

/** A small "?" that explains a number. A popover rather than a tooltip, so it opens on tap too. */
export function Explain({ label, text }: { label: string; text: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative z-10 -m-1 grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={`What does “${label}” mean?`}
        >
          <HelpCircle className="size-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm leading-relaxed" side="top">
        {text}
      </PopoverContent>
    </Popover>
  );
}
