import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ArStage } from "./ar-stage";
import { HERO_SLIDES } from "./hero-slides";

/**
 * Homepage hero: a phone points at one MEDIALIFE piece at a time and it comes
 * alive (see ar-stage.ts). The WebGL stage is imported on mount, so SSR and the
 * first paint are just the copy over a static poster. The canvas fades in once
 * the first piece has loaded; if WebGL fails the poster simply stays.
 */
export function Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLAnchorElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const stageRef = useRef<ArStage | null>(null);
  const [ready, setReady] = useState(false);
  const [index, setIndex] = useState(0);
  const [alive, setAlive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [score, setScore] = useState(0);
  const [touch, setTouch] = useState(false);
  const slide = HERO_SLIDES[index];
  const magenta = slide.accent === "magenta";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setTouch(matchMedia("(pointer: coarse)").matches);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) setPaused(true);
    let disposed = false;
    let io: IntersectionObserver | null = null;
    let ro: ResizeObserver | null = null;
    let unlisten = () => {};
    const start = Number(new URLSearchParams(location.search).get("slide") ?? 0) || 0;

    import("./ar-stage")
      .then(({ ArStage }) => {
        if (disposed) return;
        const stage = new ArStage(
          canvas,
          HERO_SLIDES,
          {
            onReady: () => setReady(true),
            onSlide: (i) => {
              setIndex(i);
              setAlive(false);
            },
            onAlive: (_i, a) => setAlive(a),
            onScore: (n) => setScore(n),
            onPhone: (x, y, ang, w) => {
              const el = chipRef.current;
              if (!el) return;
              el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) rotate(${ang}rad)`;
              el.style.maxWidth = `${Math.max(132, w * 0.92)}px`;
              el.style.fontSize = `${Math.min(13, Math.max(10, w * 0.062))}px`;
            },
            onLayout: (r) => {
              const el = overlayRef.current;
              if (!el) return;
              el.style.left = `${r.x}px`;
              el.style.top = `${r.y}px`;
              el.style.width = `${r.w}px`;
              el.style.height = `${r.h}px`;
            },
            onProgress: (p) => {
              if (barRef.current) barRef.current.style.transform = `scaleX(${p})`;
            },
          },
          { reducedMotion: reduced, start },
        );
        stageRef.current = stage;

        // Keep the stage clear of the copy.
        const syncCopy = () => {
          const c = copyRef.current?.getBoundingClientRect();
          const s = canvas.getBoundingClientRect();
          if (c)
            stage.setCopyRect({ x: c.left - s.left, y: c.top - s.top, w: c.width, h: c.height });
        };
        ro = new ResizeObserver(syncCopy);
        if (copyRef.current) ro.observe(copyRef.current);
        ro.observe(canvas);
        syncCopy();

        // Only draw while the hero is on screen and the tab is visible.
        let onScreen = true;
        const sync = () => (onScreen && !document.hidden ? stage.start() : stage.stop());
        io = new IntersectionObserver(([e]) => {
          onScreen = e.isIntersecting;
          sync();
        });
        io.observe(canvas);
        document.addEventListener("visibilitychange", sync);
        unlisten = () => document.removeEventListener("visibilitychange", sync);
        sync();
      })
      .catch((err) => console.warn("[hero] WebGL stage unavailable", err));

    return () => {
      disposed = true;
      io?.disconnect();
      ro?.disconnect();
      unlisten();
      stageRef.current?.dispose();
      stageRef.current = null;
    };
  }, []);

  useEffect(() => {
    stageRef.current?.setPaused(paused);
  }, [paused]);

  const onStick = useCallback((x: number, y: number, active: boolean) => {
    stageRef.current?.setStick(x, y, active);
  }, []);

  const game = slide.ar.kind === "bobo";
  const accentText = magenta ? "text-accent" : "text-primary";

  return (
    <section
      ref={sectionRef}
      id="top"
      aria-labelledby="hero-title"
      aria-roledescription="carousel"
      className="hero relative isolate h-[calc(100svh-4rem)] min-h-[620px] max-h-[1100px] overflow-hidden border-b border-white/10 bg-[#05060c]"
    >
      {/* Poster: what you see before WebGL (and if it never comes). */}
      <picture>
        <source media="(max-aspect-ratio: 1/1)" srcSet="/home/hero-poster-tall.webp" />
        <img
          src="/home/hero-poster-wide.webp"
          alt=""
          aria-hidden
          fetchPriority="high"
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${ready ? "opacity-0" : "opacity-100"}`}
        />
      </picture>
      <canvas
        ref={canvasRef}
        aria-hidden
        className={`absolute inset-0 h-full w-full touch-pan-y transition-opacity duration-700 ${ready ? "opacity-100" : "opacity-0"}`}
      />

      {/* The phone's button: what the piece is, and where to see more. Every
          one of these destinations is also linked in the sections below. */}
      <a
        ref={chipRef}
        href={slide.href}
        aria-hidden
        tabIndex={-1}
        className={`absolute left-0 top-0 z-10 inline-flex items-center justify-center gap-1.5 truncate rounded-full px-[1.1em] py-[0.7em] font-semibold text-white shadow-[0_6px_20px_rgba(0,0,0,0.35)] transition-opacity duration-300 ${magenta ? "bg-accent" : "bg-[var(--btn-blue)]"} ${alive && ready ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
        <span className="truncate">{slide.cta}</span>
        <span aria-hidden>→</span>
      </a>

      {/* Stage controls: the carousel tabs, and the joystick on the game. */}
      <div
        ref={overlayRef}
        className="pointer-events-none absolute z-20"
        style={{ left: 0, top: 0 }}
      >
        {game && alive && (
          <div className="pointer-events-auto absolute bottom-16 left-3 sm:left-6 flex items-end gap-3">
            <Joystick onMove={onStick} accent={magenta ? "accent" : "primary"} />
            <div className="lg-chip rounded-2xl px-3 py-2">
              <p className="mono text-[10px] uppercase tracking-[0.2em] text-white/60">Cans</p>
              <p
                className="display text-2xl leading-none text-white tabular-nums"
                aria-live="polite"
              >
                {score}
              </p>
            </div>
          </div>
        )}
        <div className="pointer-events-auto absolute inset-x-0 -bottom-1 flex justify-center px-3">
          <div
            role="group"
            aria-label="Pieces"
            className="lg-chip flex max-w-full items-center gap-1 rounded-full p-1"
          >
            {HERO_SLIDES.map((s, i) => {
              const on = i === index;
              const mg = s.accent === "magenta";
              return (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${s.tab}: ${s.cta}`}
                  onClick={() => stageRef.current?.go(i)}
                  className={`relative overflow-hidden rounded-full px-3 sm:px-4 py-1.5 text-[12px] sm:text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${on ? `${mg ? "bg-accent" : "bg-[var(--btn-blue)]"} text-white` : "text-white/70 hover:text-white hover:bg-white/10"}`}
                >
                  {s.tab}
                  {on && (
                    <span
                      ref={barRef}
                      aria-hidden
                      className="absolute inset-x-2 bottom-0.5 h-px origin-left bg-white/80"
                      style={{ transform: "scaleX(0)" }}
                    />
                  )}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? "Play the slideshow" : "Pause the slideshow"}
              className="grid h-8 w-8 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              {paused ? (
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                  <path d="M3 1.5v9l7.5-4.5z" fill="currentColor" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                  <path d="M2.5 1.5h2.5v9H2.5zM7 1.5h2.5v9H7z" fill="currentColor" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
      <p className="sr-only" aria-live={paused ? "polite" : "off"}>
        {slide.describe}
      </p>

      {/* Copy: bottom-left on wide screens, bottom on phones. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-5 sm:px-8 lg:px-16 pb-7 sm:pb-12 lg:pb-16">
        <div ref={copyRef} className="max-w-[600px]">
          <p className="lg-chip pointer-events-auto inline-flex items-center gap-2.5 rounded-full px-3.5 py-1.5 mono text-[10px] uppercase tracking-[0.22em] text-white/80">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            Immersive products &amp; experiences
          </p>
          <h1
            id="hero-title"
            className="display mt-4 sm:mt-5 text-[clamp(44px,7.6vw,120px)] text-white"
          >
            Everything we touch <span className={accentText}>comes alive.</span>
          </h1>
          <p className="mt-4 sm:mt-5 max-w-[46ch] text-[15px] sm:text-base leading-relaxed text-white/75">
            Merch, print, retail and games for entertainment and gaming IP. Point a phone at it and
            it plays. No app.
          </p>
          <div className="pointer-events-auto mt-6 sm:mt-7 flex flex-wrap items-center gap-3">
            <Link
              to="/contact"
              className="group btn-pill btn-solid px-6 py-3.5 text-sm font-medium"
            >
              Activate your IP
              <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
            <a href="#fan-reactions" className="btn-pill btn-glass px-6 py-3.5 text-sm font-medium">
              See it in action
            </a>
          </div>
          {game && alive && (
            <p className="mt-5 hidden sm:flex items-center gap-2 mono text-[10px] uppercase tracking-[0.2em] text-white/55">
              <span
                className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-glow"
                aria-hidden
              />
              {touch ? "Use the stick to collect cans" : "Drag the stick or use the arrow keys"}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * The on-screen stick for the Bobo game. Drag it (mouse or touch), or focus it
 * and use the arrow keys / WASD.
 */
function Joystick({
  onMove,
  accent,
}: {
  onMove: (x: number, y: number, active: boolean) => void;
  accent: "primary" | "accent";
}) {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const keys = useRef(new Set<string>());
  const drag = useRef<number | null>(null);
  const R = 34;

  const set = useCallback(
    (x: number, y: number, active: boolean) => {
      const k = knobRef.current;
      if (k) k.style.transform = `translate(${x * R}px, ${-y * R}px)`;
      onMove(x, y, active);
    },
    [onMove],
  );

  const fromPointer = (e: React.PointerEvent) => {
    const b = baseRef.current!.getBoundingClientRect();
    let x = (e.clientX - (b.left + b.width / 2)) / R;
    let y = -(e.clientY - (b.top + b.height / 2)) / R;
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    set(x, y, true);
  };

  const fromKeys = () => {
    const k = keys.current;
    const x = (k.has("right") ? 1 : 0) - (k.has("left") ? 1 : 0);
    const y = (k.has("up") ? 1 : 0) - (k.has("down") ? 1 : 0);
    const l = Math.hypot(x, y) || 1;
    set(x / l, y / l, k.size > 0);
  };
  const keyName = (key: string) =>
    ({
      ArrowUp: "up",
      w: "up",
      W: "up",
      ArrowDown: "down",
      s: "down",
      S: "down",
      ArrowLeft: "left",
      a: "left",
      A: "left",
      ArrowRight: "right",
      d: "right",
      D: "right",
    })[key];

  useEffect(() => () => onMove(0, 0, false), [onMove]);

  return (
    <div
      ref={baseRef}
      role="application"
      tabIndex={0}
      aria-label="Move Bobo: drag, or use the arrow keys"
      className="lg-chip relative grid h-[104px] w-[104px] touch-none select-none place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = e.pointerId;
        fromPointer(e);
      }}
      onPointerMove={(e) => drag.current === e.pointerId && fromPointer(e)}
      onPointerUp={() => {
        drag.current = null;
        set(0, 0, false);
      }}
      onPointerCancel={() => {
        drag.current = null;
        set(0, 0, false);
      }}
      onKeyDown={(e) => {
        const n = keyName(e.key);
        if (!n) return;
        e.preventDefault();
        keys.current.add(n);
        fromKeys();
      }}
      onKeyUp={(e) => {
        const n = keyName(e.key);
        if (!n) return;
        keys.current.delete(n);
        fromKeys();
      }}
      onBlur={() => {
        keys.current.clear();
        set(0, 0, false);
      }}
    >
      <div
        ref={knobRef}
        className={`h-11 w-11 rounded-full ${accent === "accent" ? "bg-accent" : "bg-[var(--btn-blue)]"} shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_6px_18px_rgba(0,0,0,0.45)] transition-transform duration-75`}
      />
    </div>
  );
}
