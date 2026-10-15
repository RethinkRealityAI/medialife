/**
 * The small kit every Creator Hub app screen is built from: page furniture,
 * panels, status pills, empty states and a copy button. Surfaces are raised
 * (a soft drop and a lit top edge) in the same family as the Partner Hub's,
 * src/components/partner/ui.tsx.
 *
 * Creators read these on phones, so labels are words in sentence case, spacing
 * is generous, and every status carries a word as well as a colour.
 */
import { useState, type ReactNode } from "react";
import { Check, Copy, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { IconTile, accentEdge, surface, type TileTone } from "@/components/partner/ui";
import { Button } from "@/components/ui/button";
import { timeAgo, type Tone } from "@/lib/hub/model";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Page furniture
   --------------------------------------------------------------------------- */

/** Width and gutters for every page. The bottom padding clears the floating phone tab bar. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-6xl px-4 pt-5 pb-[calc(env(safe-area-inset-bottom)+7.5rem)] sm:px-6 md:pb-16 lg:px-8 lg:pt-8",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * A page's title. With `image`, it's a banner: the picture behind the title,
 * darkened on the text side (the Partner Hub's banner).
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  image,
  imageClassName,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  image?: string;
  imageClassName?: string;
}) {
  if (image) {
    return (
      <header
        className={cn(
          "relative isolate overflow-hidden rounded-3xl border bg-[var(--partner-ink)]",
          accentEdge,
          "shadow-[0_30px_60px_-34px_color-mix(in_oklab,var(--partner-2)_75%,black)]",
          className,
        )}
      >
        <img
          src={image}
          alt=""
          className={cn(
            "absolute inset-y-0 right-0 -z-10 h-full w-full object-cover object-center opacity-90 [mask-image:linear-gradient(90deg,transparent_0%,rgb(0_0_0/0.55)_35%,black_70%)] sm:w-[75%] @4xl/inset:w-[62%]",
            imageClassName,
          )}
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(8_10_24/0.94)_0%,rgb(8_10_24/0.78)_60%,rgb(8_10_24/0.5)_100%)] sm:bg-[linear-gradient(90deg,rgb(8_10_24/0.6)_0%,transparent_60%)]"
        />
        <div
          aria-hidden
          className="absolute -top-24 -left-16 -z-10 size-72 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--partner)_28%,transparent),transparent_70%)] blur-2xl"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-[var(--partner)] to-transparent opacity-80"
        />
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 p-5 sm:p-7">
          <div className="max-w-xl min-w-0">
            {eyebrow ? (
              <div className="text-[11px] font-semibold tracking-[0.18em] text-[var(--partner)] uppercase">
                {eyebrow}
              </div>
            ) : null}
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              {title}
            </h1>
            {description ? (
              <div className="mt-1.5 text-sm leading-relaxed text-white/75 sm:text-[15px]">
                {description}
              </div>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      </header>
    );
  }
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-4", className)}>
      <div className="max-w-2xl min-w-0">
        {eyebrow ? (
          <div className="text-[11px] font-semibold tracking-[0.18em] text-[var(--partner)] uppercase">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
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
            <h2 id={headingId} className="text-lg font-semibold tracking-tight">
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
  return <As className={cn(surface, className)}>{children}</As>;
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
  image,
}: {
  icon: LucideIcon;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** An optional picture shown softly behind the icon. */
  image?: string;
}) {
  return (
    <Panel
      className={cn(
        "relative isolate flex flex-col items-center overflow-hidden px-6 py-10 text-center sm:py-14",
        className,
      )}
    >
      {image ? (
        <img
          src={image}
          alt=""
          aria-hidden
          className="absolute inset-0 -z-10 size-full object-cover opacity-20 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
        />
      ) : null}
      <span
        aria-hidden
        className="absolute top-0 left-1/2 -z-10 h-40 w-72 -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,color-mix(in_oklab,var(--partner)_22%,transparent),transparent_70%)] blur-2xl"
      />
      <span className="relative">
        <span
          aria-hidden
          className="absolute inset-0 rounded-2xl opacity-60 blur-xl"
          style={{ background: "var(--gradient-ember)" }}
        />
        <span
          className="relative grid size-14 place-items-center rounded-2xl text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.35)] ring-1 ring-white/20"
          style={{ background: "var(--gradient-ember-btn)" }}
        >
          <Icon className="size-6" aria-hidden />
        </span>
      </span>
      <h3 className="mt-5 text-lg font-semibold tracking-tight">{title}</h3>
      {children ? (
        <div className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
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

/** A bento card: a title row (an icon tile when `icon` is set) with one action, and a body that fills the height. */
export function Card({
  title,
  icon,
  tone = "ice",
  action,
  children,
  className,
  bodyClassName,
  labelledBy,
}: {
  title: ReactNode;
  icon?: LucideIcon;
  /** The icon tile's colour. */
  tone?: TileTone;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  labelledBy?: string;
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={cn(surface, "flex min-w-0 flex-col p-4 sm:p-5", className)}
    >
      <div className="flex min-h-8 items-center justify-between gap-3">
        <h2
          id={labelledBy}
          className="flex min-w-0 items-center gap-2.5 text-base font-semibold tracking-tight"
        >
          {icon ? <IconTile icon={icon} tone={tone} size="sm" /> : null}
          <span className="truncate">{title}</span>
        </h2>
        {action}
      </div>
      <div className={cn("mt-4 flex min-h-0 flex-1 flex-col", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Small "View …" link for a card's corner. */
export const cardActionClass =
  "inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-medium text-[var(--partner)] transition-colors hover:bg-[var(--partner)]/10 focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none [&_svg]:size-3.5";
