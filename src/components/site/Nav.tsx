import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { TECH_STACKS } from "@/lib/tech-stacks";
import SITE_NAV from "@/lib/site-nav.json";
import { Lockup } from "./Logo";

export const SHOP_URL = "https://shop.medialife.ai/";

/**
 * Primary navigation: one list for the whole site.
 *
 * The items live in src/lib/site-nav.json. This component renders them on the
 * React pages, and public/site-nav/site-nav.js renders the same list on the
 * static pages (/evade/, /activated-merch/). `npm run build` copies the JSON
 * into that script, so the two can never drift apart. Edit the JSON only.
 *
 * Contact is deliberately NOT a nav row: the "Activate your IP" pill is the
 * single, higher-intent path to /contact.
 *
 * Width (2026-11-13, Dapo: the menu must not collapse on normal laptops): the
 * inline nav starts at lg (1024px). Between lg and xl it is compact (13px,
 * tighter padding); from xl it is the full size; from 2xl the /0X numbers and
 * long labels show. Below lg it is the Menu button. The bar is 64px tall
 * everywhere, on every page.
 */
type NavItem = {
  label: string;
  num: string;
  short?: string;
  isNew?: boolean;
  kind: "anchor" | "static" | "route" | "external";
  href: string;
};

const NAV = SITE_NAV.items as NavItem[];

const itemCls =
  "group relative px-2 xl:px-3 py-2 text-[13px] xl:text-sm transition-colors hover:text-primary inline-flex items-center whitespace-nowrap";
const numCls =
  "hidden 2xl:inline mono text-[10px] text-muted-foreground mr-2 group-hover:text-primary transition shrink-0";

/** Desktop label: the short form until there is room for the full one. */
function DeskLabel({ item }: { item: NavItem }) {
  if (!item.short) return <>{item.label}</>;
  return (
    <>
      <span className="2xl:hidden">{item.short}</span>
      <span className="hidden 2xl:inline">{item.label}</span>
    </>
  );
}

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
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#05060c]/70 backdrop-blur-xl backdrop-saturate-150 shadow-[inset_0_-1px_0_rgba(255,255,255,0.04)]">
      <div className="mx-auto flex h-16 w-full items-center justify-between px-6 xl:px-10 gap-4">
        <Link to="/" className="flex items-center gap-2 group shrink-0">
          <div className="relative h-6 w-6 shrink-0">
            <div
              className="absolute inset-0 rounded-full opacity-70 blur-sm group-hover:opacity-100 transition"
              style={{ background: "var(--gradient-logo)" }}
            />
            <div className="absolute inset-1 rounded-full border border-primary" />
            <div
              className="absolute inset-2 rounded-full"
              style={{ background: "var(--gradient-logo)" }}
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
              const isCapabilities = item.href === "/#capabilities";
              return (
                <div
                  key={item.href}
                  className="relative"
                  onMouseEnter={isCapabilities ? openMega : () => setMegaOpen(false)}
                >
                  <a href={item.href} className={itemCls} onClick={() => setMegaOpen(false)}>
                    <span className={numCls}>/{item.num}</span>
                    <DeskLabel item={item} />
                    {isCapabilities && <span className="ml-2 text-[10px] opacity-60">▾</span>}
                  </a>
                </div>
              );
            }
            if (item.kind === "static") {
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={itemCls}
                  onMouseEnter={() => setMegaOpen(false)}
                >
                  <span className={numCls}>/{item.num}</span>
                  <DeskLabel item={item} />
                  {item.isNew && (
                    <span
                      className="ml-1.5 h-1.5 w-1.5 rounded-full bg-[#f5c84b]"
                      aria-label="(new)"
                      role="img"
                    />
                  )}
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
                  className={itemCls}
                  onMouseEnter={() => setMegaOpen(false)}
                >
                  <span className={numCls}>/{item.num}</span>
                  <DeskLabel item={item} />
                  <span aria-hidden className="ml-1.5 text-[10px] opacity-60">
                    ↗
                  </span>
                  <span className="sr-only">(opens the MEDIALIFE shop in a new tab)</span>
                </a>
              );
            }
            return (
              <Link
                key={item.href}
                to={item.href}
                className={itemCls}
                activeProps={{ className: "text-primary" }}
                onMouseEnter={() => setMegaOpen(false)}
              >
                <span className={numCls}>/{item.num}</span>
                <DeskLabel item={item} />
              </Link>
            );
          })}
        </nav>

        <div className="hidden lg:flex items-center gap-2 shrink-0">
          <Link
            to="/contact"
            className="btn-pill btn-solid text-[13px] xl:text-sm font-medium px-4 xl:px-5 py-2.5"
          >
            Activate your IP
            <span aria-hidden>→</span>
          </Link>
        </div>

        <button
          aria-label="Menu"
          aria-expanded={open}
          className="lg:hidden mono text-xs uppercase tracking-widest min-h-[44px] px-1"
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
                        <h4 className="mt-1 text-sm font-medium truncate group-hover:text-primary transition-colors">
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
                <div className="absolute inset-0 bg-background/55" />
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
                    key={item.href}
                    href={item.href}
                    className={row}
                    onClick={() => setOpen(false)}
                  >
                    <span>{item.label}</span>
                    <span className="mono text-[10px] text-muted-foreground">/{item.num}</span>
                  </a>
                );
              }
              if (item.kind === "static") {
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    className={row}
                    onClick={() => setOpen(false)}
                  >
                    <span className="inline-flex items-center gap-2">
                      {item.label}
                      {item.isNew && (
                        <span className="rounded-full bg-[#f5c84b] px-1.5 py-0.5 mono text-[9px] uppercase tracking-wider text-[#1a1300]">
                          New
                        </span>
                      )}
                    </span>
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
                <Link key={item.href} to={item.href} className={row} onClick={() => setOpen(false)}>
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
                className="btn-pill btn-solid w-full justify-center text-sm font-medium px-7 py-3.5"
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
