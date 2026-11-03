/**
 * The creator app's page furniture: page width and gutters, headings, a
 * picture banner, sections, notices and empty states. Built on the shared
 * look (src/components/ugc/shared/look.ts) so the admin pages match.
 */
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, type LucideIcon } from "lucide-react";

import { UGC_ART, card, eyebrow } from "@/components/ugc/shared/look";
import { cn } from "@/lib/utils";

/**
 * Scopes the hub's colour tokens to EVADE: teal accent, near-black teal
 * background. A plain <style> so dialogs and toasts (portalled to <body>)
 * pick it up too; it leaves with the page.
 */
export function UgcTheme() {
  return (
    <style>{`
      html{--partner:#3fe6e0;--partner-2:#19affe;--partner-ink:#071014;--ring:#3fe6e0;--background:#05080a;--card:#0b1318;--popover:#0b1318;--border:rgb(255 255 255 / 0.09);--input:rgb(255 255 255 / 0.12);background:#05080a;color-scheme:dark}
      body{background:#05080a}
      ::selection{background:rgb(246 195 68 / 0.45);color:#000}
    `}</style>
  );
}

/** Width and gutters. Bottom padding clears the floating phone tab bar. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-6xl px-4 pt-5 pb-[calc(env(safe-area-inset-bottom)+7.5rem)] sm:px-6 md:pb-16 lg:px-10 lg:pt-9",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHead({
  kicker,
  title,
  children,
  actions,
  className,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-4", className)}>
      <div className="max-w-2xl min-w-0">
        {kicker ? <div className={eyebrow}>{kicker}</div> : null}
        <h1 className="mt-2 text-[28px] leading-[1.05] font-bold tracking-[-0.035em] text-balance sm:text-[34px]">
          {title}
        </h1>
        {children ? (
          <div className="mt-2.5 text-[15px] leading-relaxed text-pretty text-[#c9d1d8]">
            {children}
          </div>
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
  action,
  children,
  className,
  icon: Icon,
}: {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  icon?: LucideIcon;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn("mt-10 scroll-mt-24 sm:mt-12", className)}
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2
            id={`${id}-title`}
            className="flex items-center gap-2 text-lg font-semibold tracking-[-0.02em]"
          >
            {Icon ? <Icon className="size-[18px] text-[#3fe6e0]" aria-hidden /> : null}
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Card({
  children,
  className,
  as: As = "div",
  id,
  labelledBy,
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article" | "li" | "aside";
  id?: string;
  labelledBy?: string;
}) {
  return (
    <As id={id} aria-labelledby={labelledBy} className={cn(card, className)}>
      {children}
    </As>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
  action,
  className,
  icon,
}: {
  tone?: "info" | "warn" | "success" | "gold";
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  icon?: LucideIcon;
}) {
  const t = {
    info: ["border-[#3fe6e0]/30 bg-[#3fe6e0]/[0.06]", "text-[#3fe6e0]", Info],
    warn: ["border-amber-400/40 bg-amber-400/[0.07]", "text-amber-300", AlertTriangle],
    success: ["border-emerald-400/35 bg-emerald-400/[0.07]", "text-emerald-300", CheckCircle2],
    gold: ["border-[#f6c344]/40 bg-[#f6c344]/[0.07]", "text-[#f6c344]", Info],
  } as const;
  const [box, ink, DefaultIcon] = t[tone];
  const Icon = icon ?? DefaultIcon;
  return (
    <div
      className={cn(
        "flex flex-wrap items-start gap-x-3 gap-y-3 rounded-2xl border px-4 py-3.5 text-sm leading-relaxed",
        box,
        className,
      )}
    >
      <Icon className={cn("mt-0.5 size-[18px] shrink-0", ink)} aria-hidden />
      <div className="min-w-0 flex-1 basis-56">
        {title ? <p className="font-semibold text-foreground">{title}</p> : null}
        {children ? <div className="text-[#c9d1d8]">{children}</div> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

/**
 * An empty state with EVADE art floating over a soft teal glow. `art` picks
 * Bobo or the Eclipse can.
 */
export function EmptyState({
  title,
  children,
  action,
  art = "bobo",
  icon: Icon,
  className,
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  art?: "bobo" | "can" | "none";
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "relative isolate flex flex-col items-center overflow-hidden px-6 py-10 text-center sm:py-14",
        className,
      )}
    >
      <span
        aria-hidden
        className="absolute top-2 left-1/2 -z-10 h-48 w-80 -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgb(63_230_224/0.2),transparent_70%)] blur-2xl"
      />
      {art !== "none" ? (
        <img
          src={art === "bobo" ? UGC_ART.bobo : UGC_ART.can}
          alt=""
          aria-hidden
          className={cn(
            "h-28 w-auto drop-shadow-[0_18px_30px_rgb(0_0_0/0.6)] sm:h-32",
            art === "can" && "-rotate-12",
          )}
        />
      ) : Icon ? (
        <span className="grid size-14 place-items-center rounded-2xl bg-[#3fe6e0]/10 text-[#3fe6e0] ring-1 ring-[#3fe6e0]/30 ring-inset">
          <Icon className="size-6" aria-hidden />
        </span>
      ) : null}
      <h2 className="mt-5 text-xl font-semibold tracking-[-0.02em] text-balance">{title}</h2>
      {children ? (
        <div className="mt-2 max-w-md text-sm leading-relaxed text-pretty text-muted-foreground">
          {children}
        </div>
      ) : null}
      {action ? (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">{action}</div>
      ) : null}
    </Card>
  );
}

/** A pulsing placeholder block. */
export function Skel({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("block rounded-xl bg-white/[0.06] motion-safe:animate-pulse", className)}
    />
  );
}
