/**
 * The Creator Hub's account chrome: the lockup, the background, the footer, and
 * the split sign-in layout (form left, product panel right on desktop).
 *
 * These pages render without the marketing site's nav and footer (see
 * __root.tsx), so everything a creator needs to orient themselves is here.
 */
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Check } from "lucide-react";

import { Logo } from "@/components/site/Logo";
import { Toaster } from "@/components/ui/sonner";
import { HUB, SKUS } from "@/lib/hub/model";
import { cn } from "@/lib/utils";

export const EYEBROW = "mono text-[10px] tracking-[0.22em] text-muted-foreground uppercase";

/** MEDIALIFE™ · Creator Hub, linking home to the program page. */
export function HubLockup({ className }: { className?: string }) {
  return (
    <Link
      to="/creator-hub"
      className={cn(
        "group inline-flex items-center gap-3 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className,
      )}
      aria-label="MEDIALIFE Creator Hub — program home"
    >
      <Logo className="[&_img]:h-3 sm:[&_img]:h-3.5" />
      <span aria-hidden className="h-4 w-px bg-border" />
      <span className="mono text-[10px] tracking-[0.22em] whitespace-nowrap text-muted-foreground uppercase transition-colors group-hover:text-foreground">
        Creator Hub
      </span>
    </Link>
  );
}

/**
 * The page frame every hub account page sits in: background, header, footer
 * and a toaster (the root layout doesn't mount one).
 */
export function HubChrome({
  children,
  headerRight,
  className,
}: {
  children: ReactNode;
  headerRight?: ReactNode;
  className?: string;
}) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip bg-background text-foreground">
      <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg opacity-40" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--gradient-radial)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 bottom-0 size-[520px] rounded-full opacity-25 blur-3xl"
        style={{ background: "radial-gradient(closest-side, var(--glow), transparent)" }}
      />

      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm focus:not-sr-only focus:absolute focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      <header className="relative z-10 flex items-center justify-between gap-4 px-4 py-4 sm:px-8 sm:py-5">
        <HubLockup />
        {headerRight ? <div className="flex min-w-0 items-center gap-3">{headerRight}</div> : null}
      </header>

      <main id="main" className={cn("relative z-10 flex-1", className)}>
        {children}
      </main>

      <footer className="relative z-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-6 text-xs text-muted-foreground sm:px-8">
        <span>
          Need a hand?{" "}
          <a
            href={`mailto:${HUB.supportEmail}`}
            className="text-foreground underline decoration-border underline-offset-4 hover:decoration-primary"
          >
            {HUB.supportEmail}
          </a>
        </span>
        <span className="mono text-[10px] tracking-[0.18em] uppercase">
          MEDIALIFE™ · {HUB.program}
        </span>
      </footer>

      <Toaster theme="dark" position="top-center" closeButton />
    </div>
  );
}

/**
 * Sign-in, join and the other account pages: the form on the left, the
 * product panel on the right from `lg` up. One column on phones.
 */
export function AuthShell({
  children,
  headerRight,
  aside = true,
}: {
  children: ReactNode;
  headerRight?: ReactNode;
  /** Hide the product panel for pages where it would be noise. */
  aside?: boolean;
}) {
  return (
    <HubChrome headerRight={headerRight}>
      <div
        className={cn(
          "mx-auto grid w-full max-w-6xl gap-10 px-4 pt-4 pb-10 sm:px-8 sm:pt-8 lg:items-center",
          aside ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16" : "",
        )}
      >
        <div className="mx-auto w-full max-w-md">{children}</div>
        {aside ? <ShowcasePanel /> : null}
      </div>
    </HubChrome>
  );
}

/** The card the form sits in. */
export function AuthCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card/70 p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)] backdrop-blur-sm sm:p-8",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function AuthHeading({
  eyebrow,
  title,
  children,
  id,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  id?: string;
}) {
  return (
    <div>
      {eyebrow ? <div className={EYEBROW}>{eyebrow}</div> : null}
      <h1
        id={id}
        className="mt-3 text-2xl font-medium tracking-tight text-balance sm:text-[1.75rem]"
      >
        {title}
      </h1>
      {children ? (
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p>
      ) : null}
    </div>
  );
}

const VALUE_POINTS = [
  {
    title: "We make it with you",
    body: "Design, production, tag programming, shipping and customer service. You approve every step.",
  },
  {
    title: "Fans scan, it comes alive",
    body: "An AR moment, a 3D model, a video or a game opens in the phone browser. No app.",
  },
  {
    title: "Every stage, order and payout",
    body: "Track products from design to live sales, and see your earnings as they land.",
  },
];

/** Right-hand panel: the three products and why the program is worth it. */
export function ShowcasePanel() {
  const items = [SKUS.tee, SKUS.keychain, SKUS.sticker];
  return (
    <aside
      aria-label="About the Activated Merchandise Program"
      className="relative hidden overflow-hidden rounded-3xl border border-border bg-gradient-to-b from-white/[0.04] to-transparent p-8 lg:block xl:p-10"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(ellipse at 70% 20%, oklch(0.68 0.26 350 / 18%), transparent 55%), radial-gradient(ellipse at 20% 80%, oklch(0.72 0.16 240 / 16%), transparent 55%)",
        }}
      />
      <div className="relative">
        <div className="flex items-center gap-2.5 mono text-[10px] tracking-[0.22em] text-muted-foreground uppercase">
          <span className="size-1.5 rounded-full bg-accent motion-safe:animate-pulse-glow" />
          {HUB.program}
        </div>
        <p className="mt-5 text-3xl leading-[1.05] font-medium tracking-tight text-balance xl:text-4xl">
          Merch your fans can <span className="ember-text">experience.</span>
        </p>

        <div className="relative mt-8 grid grid-cols-3 gap-3">
          {items.map((sku, i) => (
            <figure key={sku.id} className={cn("relative", i === 1 && "motion-safe:animate-drift")}>
              <img
                src={sku.image}
                alt={sku.alt}
                loading="lazy"
                decoding="async"
                className="aspect-[4/5] w-full rounded-xl border border-white/10 object-cover shadow-[0_24px_40px_-20px_rgba(0,0,0,0.8)]"
              />
              <figcaption className="mono mt-3 text-center text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                {sku.short}
              </figcaption>
            </figure>
          ))}
        </div>

        <ul className="mt-8 space-y-4">
          {VALUE_POINTS.map((p) => (
            <li key={p.title} className="flex gap-3">
              <span
                aria-hidden
                className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-primary/50 bg-primary/10 text-primary"
              >
                <Check className="size-3" strokeWidth={3} />
              </span>
              <span>
                <span className="block text-sm font-medium">{p.title}</span>
                <span className="block text-sm leading-relaxed text-muted-foreground">
                  {p.body}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
