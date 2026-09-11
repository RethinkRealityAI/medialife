import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { TECH_STACKS } from "@/lib/tech-stacks";
import { Lockup } from "./Logo";

export const SHOP_URL = "https://shop.medialife.ai/";

/**
 * Primary navigation — the five commercial destinations.
 *
 * Numbers follow the homepage reading order, so /02 in the nav is the second
 * section down the page. Fan Reactions and Production Capabilities are homepage
 * anchors; Live Now and Case Studies are real routes because both need linkable
 * URLs. Merch is external.
 *
 * Contact is deliberately NOT a nav row: the "Activate your IP" pill is the
 * single, higher-intent path to the same /contact route, and one primary CTA
 * beats two competing entry points. /contact is still linked from the footer
 * and from every section CTA, so the Netlify form is not orphaned.
 *
 * The Technology stack pages are still reachable through the Production
 * Capabilities mega-menu, so nothing was orphaned by the nav change.
 */
type NavItem =
  | { kind: "anchor"; hash: string; label: string; num: string }
  | { kind: "route"; to: string; label: string; num: string }
  | { kind: "external"; href: string; label: string; num: string };

const NAV: NavItem[] = [
  { kind: "route", to: "/live", label: "Live Now", num: "01" },
  { kind: "anchor", hash: "fan-reactions", label: "Fan Reactions", num: "02" },
  { kind: "anchor", hash: "capabilities", label: "Production Capabilities", num: "03" },
  { kind: "route", to: "/case-studies", label: "Case Studies", num: "04" },
  { kind: "external", href: SHOP_URL, label: "Merch", num: "05" },
];

const itemCls =
  "group relative px-3 py-2 text-sm transition-colors hover:text-primary inline-flex items-center whitespace-nowrap";
const numCls =
  "mono text-[10px] text-muted-foreground mr-2 group-hover:text-primary transition shrink-0";

export function Nav() {
  const [open, setOpen] = useState(false);
  const [megaOpen, setMegaOpen] = useState(false);
  const [hoveredStack, setHoveredStack] = useState(0);
  const featured = TECH_STACKS[hoveredStack];
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openMega = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setMegaOpen(true);
  };

  const closeMega = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setMegaOpen(false);
      closeTimerRef.current = null;
    }, 200);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full items-center justify-between px-6 lg:px-10 gap-4">
        <Link to="/" className="flex items-center gap-2 group shrink-0">
          <div className="relative h-6 w-6 shrink-0">
            <div
              className="absolute inset-0 rounded-full opacity-70 blur-sm group-hover:opacity-100 transition"
              style={{ background: "var(--gradient-ember)" }}
            />
            <div className="absolute inset-1 rounded-full border border-primary" />
            <div
              className="absolute inset-2 rounded-full"
              style={{ background: "var(--gradient-ember)" }}
            />
          </div>
          {/* 28px, not smaller: the lockup is two lines, and the "ACTIVATED BY"
              rule is only 27% of its height. Below this it stops being legible
              and reads as a smudge above the wordmark. */}
          <Lockup className="h-[28px] w-auto" />
        </Link>

        <nav className="hidden lg:flex items-center gap-0.5" onMouseLeave={closeMega}>
          {NAV.map((item) => {
            if (item.kind === "anchor") {
              const isCapabilities = item.hash === "capabilities";
              return (
                <div
                  key={item.hash}
                  className="relative"
                  onMouseEnter={isCapabilities ? openMega : () => setMegaOpen(false)}
                >
                  <a href={`/#${item.hash}`} className={itemCls} onClick={() => setMegaOpen(false)}>
                    <span className={numCls}>/{item.num}</span>
                    {item.label}
                    {isCapabilities && <span className="ml-2 text-[10px] opacity-60">▾</span>}
                  </a>
                </div>
              );
            }
            if (item.kind === "external") {
              return (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={itemCls}
                  onMouseEnter={() => setMegaOpen(false)}
                >
                  <span className={numCls}>/{item.num}</span>
                  {item.label}
                  <span aria-hidden className="ml-1.5 text-[10px] opacity-60">
                    ↗
                  </span>
                  <span className="sr-only">(opens the MEDIALIFE shop in a new tab)</span>
                </a>
              );
            }
            return (
              <Link
                key={item.to}
                to={item.to}
                className={itemCls}
                activeProps={{ className: "text-primary" }}
                onMouseEnter={() => setMegaOpen(false)}
              >
                <span className={numCls}>/{item.num}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden lg:flex items-center gap-2 shrink-0">
          <Link
            to="/contact"
            className="btn-pill btn-ember mono text-xs uppercase tracking-[0.18em] font-medium px-6 py-3"
          >
            Activate your IP
            <span aria-hidden>→</span>
          </Link>
        </div>

        <button
          aria-label="Menu"
          aria-expanded={open}
          className="lg:hidden mono text-xs uppercase tracking-widest"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>

      {/* MEGA MENU — production capabilities / technology stack */}
      {megaOpen && (
        <div
          className="hidden lg:block absolute left-0 right-0 top-16 border-t border-border bg-background/95 backdrop-blur-xl shadow-2xl"
          onMouseEnter={openMega}
          onMouseLeave={closeMega}
        >
          <div className="mx-auto w-full px-6 lg:px-16 py-8">
            <div className="flex items-end justify-between mb-6">
              <div>
                <div className="mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  / Technology stack
                </div>
                <h3 className="mt-2 text-2xl font-medium">Six layers powering every deployment.</h3>
              </div>
              <Link
                to="/technology"
                className="mono text-[10px] uppercase tracking-[0.2em] text-primary border-b border-primary pb-1"
                onClick={() => setMegaOpen(false)}
              >
                See full architecture →
              </Link>
            </div>

            <div className="grid grid-cols-12 gap-6">
              <div className="col-span-7 grid grid-cols-2 gap-px bg-border border border-border">
                {TECH_STACKS.map((s, idx) => (
                  <Link
                    key={s.slug}
                    to="/technology/$slug"
                    params={{ slug: s.slug }}
                    className={`group bg-background p-4 transition relative overflow-hidden ${hoveredStack === idx ? "bg-secondary" : ""}`}
                    onMouseEnter={() => setHoveredStack(idx)}
                    onClick={() => setMegaOpen(false)}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="h-10 w-10 rounded-md grid place-items-center text-lg shrink-0 text-white"
                        style={{ background: s.accent }}
                      >
                        {s.glyph}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                          /{s.num} · {s.category}
                        </div>
                        <h4 className="mt-1 text-sm font-medium truncate group-hover:ember-text transition-colors">
                          {s.name}
                        </h4>
                        <p className="mt-1 text-[11px] text-muted-foreground line-clamp-1">
                          {s.tagline}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              <Link
                to="/technology/$slug"
                params={{ slug: featured.slug }}
                onClick={() => setMegaOpen(false)}
                className="col-span-5 relative overflow-hidden border border-border group block"
              >
                <div
                  className="absolute inset-0 opacity-90 transition-transform duration-500 group-hover:scale-105"
                  style={{ background: featured.accent }}
                />
                <div className="absolute inset-0 grid-bg opacity-30" />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
                <div className="relative h-full min-h-[260px] p-6 flex flex-col justify-between">
                  <div className="flex items-start justify-between">
                    <div className="text-5xl text-white drop-shadow-lg">{featured.glyph}</div>
                    <span className="mono text-[10px] uppercase tracking-[0.2em] bg-background/70 backdrop-blur border border-border px-2 py-1">
                      /{featured.num}
                    </span>
                  </div>
                  <div>
                    <div className="mono text-[10px] uppercase tracking-[0.25em] text-white/90">
                      {featured.category}
                    </div>
                    <h4 className="mt-2 text-2xl font-medium text-white drop-shadow">
                      {featured.name}
                    </h4>
                    <p className="mt-2 text-sm text-white/90 max-w-sm">{featured.hero}</p>
                    <div className="mt-4 mono text-[10px] uppercase tracking-[0.2em] text-white inline-flex items-center gap-2">
                      Open stack{" "}
                      <span className="transition-transform group-hover:translate-x-1">→</span>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE */}
      {open && (
        <div className="lg:hidden border-t border-border bg-background max-h-[calc(100vh-4rem)] overflow-y-auto">
          <div className="flex flex-col">
            {NAV.map((item) => {
              const row =
                "flex items-center justify-between px-6 py-4 border-b border-border hover:bg-secondary";
              if (item.kind === "anchor") {
                return (
                  <a
                    key={item.hash}
                    href={`/#${item.hash}`}
                    className={row}
                    onClick={() => setOpen(false)}
                  >
                    <span>{item.label}</span>
                    <span className="mono text-[10px] text-muted-foreground">/{item.num}</span>
                  </a>
                );
              }
              if (item.kind === "external") {
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={row}
                    onClick={() => setOpen(false)}
                  >
                    <span>
                      {item.label}{" "}
                      <span aria-hidden className="opacity-60 text-xs">
                        ↗
                      </span>
                      <span className="sr-only">(opens the MEDIALIFE shop in a new tab)</span>
                    </span>
                    <span className="mono text-[10px] text-muted-foreground">/{item.num}</span>
                  </a>
                );
              }
              return (
                <Link key={item.to} to={item.to} className={row} onClick={() => setOpen(false)}>
                  <span>{item.label}</span>
                  <span className="mono text-[10px] text-muted-foreground">/{item.num}</span>
                </Link>
              );
            })}

            {/* Technology stacks stay reachable on mobile */}
            <div className="px-6 pt-5 pb-2 mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              Technology stack
            </div>
            {TECH_STACKS.map((s) => (
              <Link
                key={s.slug}
                to="/technology/$slug"
                params={{ slug: s.slug }}
                className="flex items-center justify-between pl-10 pr-6 py-3 border-b border-border text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
                onClick={() => setOpen(false)}
              >
                <span>{s.name}</span>
                <span className="mono text-[9px]">/{s.num}</span>
              </Link>
            ))}

            <div className="p-6">
              <Link
                to="/contact"
                className="btn-pill btn-ember w-full justify-center mono text-xs uppercase tracking-[0.18em] font-medium px-7 py-3.5"
                onClick={() => setOpen(false)}
              >
                Activate your IP
                <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
