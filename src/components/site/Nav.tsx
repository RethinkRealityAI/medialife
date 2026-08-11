import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { TECH_STACKS } from "@/lib/tech-stacks";

export const SHOP_URL = "https://medialife-shop.myshopify.com/";

// Split around Merch because it leaves the site — TanStack's <Link> is for
// in-app routes only, so the shop needs a plain <a>.
const linksBeforeShop = [
  { to: "/insights", label: "Insights", num: "02" },
  { to: "/fan-reactions", label: "Fan Reactions", num: "03" },
] as const;

const linksAfterShop = [{ to: "/contact", label: "Contact", num: "05" }] as const;

const SHOP_NUM = "04";

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
      <div className="mx-auto flex h-16 w-full items-center justify-between px-6 lg:px-16">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="relative h-6 w-6">
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
          <span className="mono text-xs tracking-[0.2em] uppercase">
            MediaLife<span className="text-primary">.</span>AI
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1" onMouseLeave={closeMega}>
          <div className="relative" onMouseEnter={openMega}>
            <Link
              to="/technology"
              className="group relative px-4 py-2 text-sm transition-colors hover:text-primary inline-flex items-center"
              activeProps={{ className: "text-primary" }}
              onClick={() => setMegaOpen(false)}
            >
              <span className="mono text-[10px] text-muted-foreground mr-2 group-hover:text-primary transition">
                /01
              </span>
              Technology
              <span className="ml-2 text-[10px] opacity-60">▾</span>
            </Link>
          </div>
          {linksBeforeShop.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="group relative px-4 py-2 text-sm transition-colors hover:text-primary"
              activeProps={{ className: "text-primary" }}
              onMouseEnter={() => setMegaOpen(false)}
            >
              <span className="mono text-[10px] text-muted-foreground mr-2 group-hover:text-primary transition">
                /{l.num}
              </span>
              {l.label}
            </Link>
          ))}
          <a
            href={SHOP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative px-4 py-2 text-sm transition-colors hover:text-primary inline-flex items-center"
            onMouseEnter={() => setMegaOpen(false)}
          >
            <span className="mono text-[10px] text-muted-foreground mr-2 group-hover:text-primary transition">
              /{SHOP_NUM}
            </span>
            Merch
            <span aria-hidden className="ml-1.5 text-[10px] opacity-60">
              ↗
            </span>
            <span className="sr-only">(opens the MediaLife shop in a new tab)</span>
          </a>
          {linksAfterShop.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="group relative px-4 py-2 text-sm transition-colors hover:text-primary"
              activeProps={{ className: "text-primary" }}
              onMouseEnter={() => setMegaOpen(false)}
            >
              <span className="mono text-[10px] text-muted-foreground mr-2 group-hover:text-primary transition">
                /{l.num}
              </span>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          <Link
            to="/contact"
            className="btn-pill btn-ember mono text-xs uppercase tracking-[0.18em] font-medium px-7 py-3"
          >
            Deploy AR
            <span aria-hidden>→</span>
          </Link>
        </div>

        <button
          aria-label="Menu"
          className="md:hidden mono text-xs uppercase tracking-widest"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>

      {/* MEGA MENU */}
      {megaOpen && (
        <div
          className="hidden md:block absolute left-0 right-0 top-16 border-t border-border bg-background/95 backdrop-blur-xl shadow-2xl"
          onMouseEnter={openMega}
          onMouseLeave={closeMega}
        >
          <div className="mx-auto w-full px-6 lg:px-16 py-8">
            <div className="flex items-end justify-between mb-6">
              <div>
                <div className="mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  / Technology Stack
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
              {/* Stack list */}
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

              {/* Feature preview pane */}
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
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {featured.partners.slice(0, 4).map((p) => (
                        <span
                          key={p}
                          className="mono text-[9px] uppercase tracking-widest bg-background/80 backdrop-blur border border-border px-1.5 py-0.5"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
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

      {open && (
        <div className="md:hidden border-t border-border bg-background">
          <div className="flex flex-col">
            <Link
              to="/technology"
              className="flex items-center justify-between px-6 py-4 border-b border-border hover:bg-secondary"
              onClick={() => setOpen(false)}
            >
              <span>Technology</span>
              <span className="mono text-[10px] text-muted-foreground">/01</span>
            </Link>
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
            {linksBeforeShop.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="flex items-center justify-between px-6 py-4 border-b border-border hover:bg-secondary"
                onClick={() => setOpen(false)}
              >
                <span>{l.label}</span>
                <span className="mono text-[10px] text-muted-foreground">/{l.num}</span>
              </Link>
            ))}
            <a
              href={SHOP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-6 py-4 border-b border-border hover:bg-secondary"
              onClick={() => setOpen(false)}
            >
              <span>
                Merch{" "}
                <span aria-hidden className="opacity-60 text-xs">
                  ↗
                </span>
                <span className="sr-only">(opens the MediaLife shop in a new tab)</span>
              </span>
              <span className="mono text-[10px] text-muted-foreground">/{SHOP_NUM}</span>
            </a>
            {linksAfterShop.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="flex items-center justify-between px-6 py-4 border-b border-border hover:bg-secondary"
                onClick={() => setOpen(false)}
              >
                <span>{l.label}</span>
                <span className="mono text-[10px] text-muted-foreground">/{l.num}</span>
              </Link>
            ))}
            <div className="p-6">
              <Link
                to="/contact"
                className="btn-pill btn-ember w-full justify-center mono text-xs uppercase tracking-[0.18em] font-medium px-7 py-3.5"
                onClick={() => setOpen(false)}
              >
                Deploy AR
                <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
