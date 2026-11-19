import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Reveal } from "@/components/home/Reveal";

/**
 * The site's shared design kit (from the 2026-11 homepage redesign), so every
 * page reads as one system:
 *
 * - SECTION: one centred column, capped at 1280px, so large screens get
 *   margins instead of bigger blocks.
 * - H1 (page heroes) and H2 (sections): the uppercase display face, always
 *   well under the homepage hero title.
 * - Eyebrow: a mono label with a coloured dot.
 * - Hue: highlights alternate between the logo's two colours (blue #19AFFE,
 *   magenta #FF2FAE). The gradient lives only in the logo mark.
 * - Cards use the `lg-card` glass utility with 26px corners.
 */
export const EYEBROW = "mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground";
export const SECTION = "relative mx-auto w-full max-w-[1280px] px-5 sm:px-8 lg:px-16";
/** Page hero titles (inner pages): a step under the homepage hero. */
export const H1 = "display text-[clamp(40px,5.2vw,84px)]";
/** Section titles: about half the homepage hero. */
export const H2 = "display text-[clamp(30px,3.4vw,54px)]";
/** Card titles */
export const H3 = "display text-[clamp(22px,2vw,30px)]";
export const CARD = "lg-card rounded-[26px]";

export type Hue = "blue" | "magenta";
export const TEXT: Record<Hue, string> = { blue: "text-primary", magenta: "text-accent" };
export const DOT: Record<Hue, string> = { blue: "bg-primary", magenta: "bg-accent" };
export const HEX: Record<Hue, string> = { blue: "#19afff", magenta: "#ff2fae" };

export function Eyebrow({
  hue,
  children,
  className = "",
}: {
  hue: Hue;
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={`${EYEBROW} inline-flex items-center gap-2.5 ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[hue]}`} aria-hidden />
      {children}
    </p>
  );
}

/** A section's heading row: eyebrow + title on the left, an optional line on the right. */
export function SectionHead({
  id,
  hue,
  eyebrow,
  title,
  lead,
  className = "",
}: {
  id: string;
  hue: Hue;
  eyebrow: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`grid items-end gap-6 lg:grid-cols-12 ${className}`}>
      <Reveal className={lead ? "lg:col-span-7" : "lg:col-span-12"}>
        <Eyebrow hue={hue}>{eyebrow}</Eyebrow>
        <h2 id={id} className={`mt-5 ${H2}`}>
          {title}
        </h2>
      </Reveal>
      {lead && (
        <Reveal delay={120} className="lg:col-span-5">
          <p className="text-muted-foreground lg:text-lg">{lead}</p>
        </Reveal>
      )}
    </div>
  );
}

/**
 * An inner page's opening: eyebrow, title, a short lead and actions, with an
 * optional visual on the right. The soft glow behind it takes the page's hue.
 */
export function PageHero({
  hue,
  eyebrow,
  title,
  lead,
  actions,
  aside,
  className = "",
}: {
  hue: Hue;
  eyebrow: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`relative overflow-hidden ${className}`}>
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[1100px] max-w-[160vw] -translate-x-1/2 rounded-full opacity-40 blur-[120px]"
        style={{ background: HEX[hue] }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg opacity-25" />
      <div
        className={`${SECTION} grid items-center gap-12 pb-16 pt-16 sm:pt-20 lg:pb-24 ${aside ? "lg:grid-cols-12" : ""}`}
      >
        <div className={aside ? "lg:col-span-6" : "max-w-4xl"}>
          <Reveal>
            <Eyebrow hue={hue}>{eyebrow}</Eyebrow>
            <h1 className={`mt-6 ${H1}`}>{title}</h1>
          </Reveal>
          {lead && (
            <Reveal delay={100}>
              <p className="mt-6 max-w-xl text-muted-foreground lg:text-lg">{lead}</p>
            </Reveal>
          )}
          {actions && (
            <Reveal delay={180} className="mt-9 flex flex-wrap gap-3">
              {actions}
            </Reveal>
          )}
        </div>
        {aside && (
          <Reveal delay={150} className="lg:col-span-6">
            {aside}
          </Reveal>
        )}
      </div>
    </section>
  );
}

/** Primary pill button (internal route or URL). */
export function PillLink({
  to,
  href,
  children,
  variant = "solid",
  external = false,
}: {
  to?: string;
  href?: string;
  children: ReactNode;
  variant?: "solid" | "glass";
  external?: boolean;
}) {
  const cls = `group btn-pill ${variant === "solid" ? "btn-solid" : "btn-glass"} px-7 py-4 text-sm font-medium`;
  const arrow = (
    <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
      {external ? "↗" : "→"}
    </span>
  );
  if (to)
    return (
      <Link to={to} className={cls}>
        {children}
        {variant === "solid" && arrow}
      </Link>
    );
  return (
    <a
      href={href}
      className={cls}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
      {(variant === "solid" || external) && arrow}
      {external && <span className="sr-only">(opens in a new tab)</span>}
    </a>
  );
}

/** The closing call to action every page ends on. */
export function CtaBand({
  id = "cta",
  hue = "magenta",
  eyebrow = "Bring your IP",
  title = (
    <>
      Let's activate <span className="text-accent">your IP.</span>
    </>
  ),
  lead = "For entertainment, gaming, creators and licensed IP. $0 to start: we design, make, sell and fulfil, and you earn a royalty on every unit.",
  actions,
}: {
  id?: string;
  hue?: Hue;
  eyebrow?: ReactNode;
  title?: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className={`${SECTION} border-t border-white/10 py-24 text-center lg:py-32`}
    >
      <Reveal>
        <Eyebrow hue={hue}>{eyebrow}</Eyebrow>
        <h2
          id={`${id}-title`}
          className="display mx-auto mt-5 max-w-4xl text-[clamp(36px,4.8vw,72px)]"
        >
          {title}
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-muted-foreground lg:text-lg">{lead}</p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          {actions ?? (
            <>
              <PillLink to="/contact">Activate your IP</PillLink>
              <PillLink to="/case-studies" variant="glass">
                Case studies
              </PillLink>
            </>
          )}
        </div>
      </Reveal>
    </section>
  );
}

/** A big number with a short label, on glass. */
export function Stat({
  value,
  label,
  hue = "blue",
  note,
}: {
  value: ReactNode;
  label: ReactNode;
  hue?: Hue;
  note?: ReactNode;
}) {
  return (
    <div className={`${CARD} p-5 sm:p-6`}>
      <div className={`display text-[clamp(26px,2.6vw,40px)] ${TEXT[hue]}`}>{value}</div>
      <div className="mt-2 text-sm text-white/85">{label}</div>
      {note && <div className={`mt-1 ${EYEBROW} text-[9px]`}>{note}</div>}
    </div>
  );
}
