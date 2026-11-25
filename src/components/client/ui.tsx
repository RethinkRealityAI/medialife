/**
 * The Client Hub's building blocks. Flat colours only (house rule: no
 * gradients): a card surface, page header, stat tile, empty state, a lettered
 * mark, and small helpers for sizes and dates.
 */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export const card = "rounded-2xl border border-white/[0.08] bg-[#0d1017]";
export const cardHover =
  "transition-colors hover:border-[color-mix(in_oklab,var(--client)_55%,transparent)] focus-visible:ring-2 focus-visible:ring-[var(--client)] focus-visible:outline-none";

export function ClientPage({ children, className }: { children: ReactNode; className?: string }) {
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

export function ClientHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="max-w-2xl min-w-0">
        {eyebrow ? (
          <div className="text-[11px] font-semibold tracking-[0.18em] text-[var(--client)] uppercase">
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

export function ClientSection({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mt-10 first:mt-0", className)}>
      {title ? (
        <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
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

export function Stat({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className={cn(card, "p-4 sm:p-5")}>
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {Icon ? <Icon className="size-4 text-[var(--client)]" aria-hidden /> : null}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export function Empty({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={cn(card, "flex flex-col items-center px-6 py-12 text-center")}>
      <span className="grid size-12 place-items-center rounded-2xl bg-white/[0.05] text-[var(--client)]">
        <Icon className="size-6" aria-hidden />
      </span>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      {children ? (
        <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">{children}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/** Small status label. */
export function Chip({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: "muted" | "accent" | "good" | "warn" | "bad";
  className?: string;
}) {
  const tones = {
    muted: "border-white/10 bg-white/[0.04] text-muted-foreground",
    accent:
      "border-[color-mix(in_oklab,var(--client)_45%,transparent)] bg-[color-mix(in_oklab,var(--client)_14%,transparent)] text-[color-mix(in_oklab,var(--client)_70%,white)]",
    good: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
    warn: "border-amber-400/45 bg-amber-400/10 text-amber-300",
    bad: "border-red-400/45 bg-red-400/10 text-red-300",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Lettered mark in the client's accent (no logo needed). */
export function ClientMark({
  name,
  logo,
  className,
}: {
  name: string;
  logo?: string;
  className?: string;
}) {
  if (logo)
    return (
      <span
        aria-hidden
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--client-ink)] ring-1 ring-white/10",
          className,
        )}
      >
        <img src={logo} alt="" className="size-6 object-contain" />
      </span>
    );
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--client)] text-[11px] font-black tracking-tight text-[var(--client-ink)]",
        className,
      )}
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function Initials({ name, className }: { name: string; className?: string }) {
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
        "grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-semibold text-white",
        className,
      )}
    >
      {letters}
    </span>
  );
}

export function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function duration(s: number | null) {
  if (s == null || !Number.isFinite(s)) return "";
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function compact(n: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function day(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Plain-text body: blank lines become paragraphs, URLs stay text. */
export function Paragraphs({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/\n\s*\n/).filter((p) => p.trim());
  return (
    <div className={cn("grid gap-3", className)}>
      {parts.map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          {p}
        </p>
      ))}
    </div>
  );
}

export const btn =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[var(--client)] focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none disabled:opacity-60";
export const btnPrimary = cn(btn, "bg-[var(--client)] text-[var(--client-ink)] hover:opacity-90");
export const btnGhost = cn(btn, "border border-white/12 bg-white/[0.03] hover:bg-white/[0.07]");
