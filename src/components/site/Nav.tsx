import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { TECH_STACKS } from "@/lib/tech-stacks";
import { LANGUAGES, useLanguage, useTheme, type LangCode } from "@/lib/theme";

const PHONE_DISPLAY = "+1 (415) 555-0123";
const PHONE_HREF = "tel:+14155550123";

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className="h-8 w-8 grid place-items-center border border-border hover:bg-secondary hover:text-primary transition-colors mono text-xs"
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}

function LanguageSelector() {
  const { lang, setLang } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="mono text-[10px] uppercase tracking-[0.18em] border border-border px-2.5 h-8 inline-flex items-center gap-1.5 hover:bg-secondary hover:text-primary transition-colors"
      >
        <span aria-hidden>🌐</span>
        <span>{lang.toUpperCase()}</span>
        <span className="text-[8px] opacity-60">▾</span>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 top-full mt-1 min-w-[180px] border border-border bg-popover text-popover-foreground shadow-xl z-50 max-h-80 overflow-auto"
        >
          {LANGUAGES.map((l) => (
            <li key={l.code}>
              <button
                role="option"
                aria-selected={lang === l.code}
                onClick={() => {
                  setLang(l.code as LangCode);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-secondary flex items-center justify-between ${lang === l.code ? "text-primary" : ""}`}
              >
                <span>{l.label}</span>
                <span className="mono text-[9px] opacity-60 uppercase">{l.code}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const links = [
  { to: "/insights", label: "Insights", num: "02" },
  { to: "/fan-reactions", label: "Fan Reactions", num: "03" },
  { to: "/contact", label: "Contact", num: "04" },
] as const;

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
          {links.map((l) => (
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
          <a
            href={PHONE_HREF}
            className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1.5"
            aria-label="Call us"
          >
            <span aria-hidden>📞</span>
            <span>{PHONE_DISPLAY}</span>
          </a>
          <LanguageSelector />
          <ThemeToggle />
          <Link
            to="/contact"
            className="mono text-[11px] uppercase tracking-[0.18em] border border-border px-4 py-2 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
          >
            <span className="text-[7px]">Deploy AR →</span>
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
            {links.map((l) => (
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
          </div>
        </div>
      )}
    </header>
  );
}
