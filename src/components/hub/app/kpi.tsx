import type { ReactNode } from "react";
import { HelpCircle, type LucideIcon } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { Panel } from "./ui";

/** One headline number with its label, and an optional "?" that explains it. */
export function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  explain,
  emphasis = false,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  explain?: string;
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <Panel
      className={cn(
        "min-w-0 p-4 sm:p-5",
        emphasis && "border-primary/40 shadow-[0_0_50px_-30px_var(--color-primary)]",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
        <span className="leading-tight">{label}</span>
        {explain ? <Explain label={label} text={explain} /> : null}
      </div>
      <div className="mt-2 truncate text-xl font-medium tracking-tight tabular-nums sm:text-[1.75rem]">
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</div>
      ) : null}
    </Panel>
  );
}

/** A small "?" that explains a number. A popover rather than a tooltip, so it opens on tap too. */
export function Explain({ label, text }: { label: string; text: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="-m-1 grid grid-cols-1 size-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
