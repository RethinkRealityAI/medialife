/**
 * The small kit every Creator Hub app screen is built from: page furniture,
 * panels, status pills, empty states and a copy button.
 *
 * Deliberately plainer than the Roblox portal kit: creators read these on
 * phones, so labels are words in sentence case, spacing is generous, and every
 * status carries a word as well as a colour.
 */
import { useState, type ReactNode } from "react";
import { Check, Copy, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { timeAgo, type Tone } from "@/lib/hub/model";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Page furniture
   --------------------------------------------------------------------------- */

/** Width and gutters for every page. The bottom padding clears the phone tab bar. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-6xl px-4 pt-6 pb-32 sm:px-6 md:pb-16 lg:px-8 lg:pt-10",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-4", className)}>
      <div className="min-w-0 max-w-2xl">
        {eyebrow ? <div className="text-sm text-muted-foreground">{eyebrow}</div> : null}
        <h1 className="mt-1 text-2xl font-medium tracking-tight text-balance sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Section({
  id,
  title,
  description,
  actions,
  children,
  className,
}: {
  id?: string;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={title ? headingId : undefined}
      className={cn("mt-10 scroll-mt-28 first:mt-0 sm:mt-12", className)}
    >
      {title ? (
        <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h2 id={headingId} className="text-lg font-medium tracking-tight">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Panel({
  children,
  className,
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "li" | "article" | "section";
}) {
  return (
    <As
      className={cn(
        "rounded-xl border border-border bg-gradient-to-b from-white/[0.035] to-white/[0.01]",
        className,
      )}
    >
      {children}
    </As>
  );
}

/* ---------------------------------------------------------------------------
   Status
   --------------------------------------------------------------------------- */

const TONES: Record<Tone, string> = {
  live: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  primary: "border-primary/45 bg-primary/12 text-primary",
  accent: "border-accent/45 bg-accent/12 text-[oklch(0.8_0.16_350)]",
  watch: "border-amber-400/45 bg-amber-400/10 text-amber-300",
  muted: "border-border bg-white/[0.04] text-muted-foreground",
  danger: "border-red-400/45 bg-red-400/10 text-red-300",
};

export function Pill({
  tone = "muted",
  children,
  icon: Icon,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {Icon ? (
        <Icon className="size-3.5 shrink-0" aria-hidden />
      ) : (
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      )}
      <span className="truncate">{children}</span>
    </span>
  );
}

/* ---------------------------------------------------------------------------
   Empty states
   --------------------------------------------------------------------------- */

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Panel
      className={cn(
        "flex flex-col items-center px-6 py-12 text-center sm:py-16",
        "border-dashed bg-none",
        className,
      )}
    >
      <span className="grid grid-cols-1 size-12 place-items-center rounded-full border border-border bg-white/[0.04]">
        <Icon className="size-5 text-primary" aria-hidden />
      </span>
      <h3 className="mt-4 text-base font-medium">{title}</h3>
      {children ? (
        <div className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          {children}
        </div>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </Panel>
  );
}

/* ---------------------------------------------------------------------------
   Copy to clipboard
   --------------------------------------------------------------------------- */

export async function copyText(value: string, what = "Copied") {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(what);
    return true;
  } catch {
    toast.error("Couldn't copy. Select the text and copy it yourself.");
    return false;
  }
}

export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied",
  toastText = "Copied to clipboard",
  variant = "outline",
  size = "sm",
  className,
  ariaLabel,
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  toastText?: string;
  variant?: "outline" | "default" | "secondary" | "ghost";
  size?: "sm" | "default" | "icon";
  className?: string;
  ariaLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      aria-label={ariaLabel}
      onClick={async () => {
        if (await copyText(value, toastText)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        }
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {size === "icon" ? null : copied ? copiedLabel : label}
    </Button>
  );
}

/** Label/value pairs, stacked tight. */
export function Facts({
  rows,
  className,
}: {
  rows: Array<[label: string, value: ReactNode]>;
  className?: string;
}) {
  return (
    <dl className={cn("divide-y divide-border text-sm", className)}>
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="shrink-0 text-muted-foreground">{label}</dt>
          <dd className="min-w-0 text-right break-words tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The monogram shown when a creator has no avatar. */
export function Monogram({ name, className }: { name: string; className?: string }) {
  const letters =
    name
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "ME";
  return (
    <span
      aria-hidden
      className={cn(
        "grid grid-cols-1 size-8 shrink-0 place-items-center rounded-full text-xs font-semibold text-white",
        className,
      )}
      style={{ background: "var(--gradient-ember-btn)" }}
    >
      {letters}
    </span>
  );
}

/**
 * "3 min ago". The server and the browser render it a moment apart, so the
 * words can differ by a minute: that difference is expected, not a bug.
 */
export function TimeAgo({ ts, className }: { ts: number; className?: string }) {
  return (
    <time dateTime={new Date(ts).toISOString()} className={className} suppressHydrationWarning>
      {timeAgo(ts)}
    </time>
  );
}
