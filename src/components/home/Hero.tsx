import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { LensItem, LensStage } from "./lens-stage";
import { LENS_ITEMS } from "./lens-items";

/**
 * Homepage hero: the Activation Lens (see lens-stage.ts).
 *
 * The WebGL stage is imported on mount, so SSR and the first paint are just
 * the copy over a static poster. The canvas fades in once a piece has loaded;
 * if WebGL fails the poster simply stays.
 */
export function Hero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chipRef = useRef<HTMLAnchorElement>(null);
  const stageRef = useRef<LensStage | null>(null);
  const [ready, setReady] = useState(false);
  const [focus, setFocus] = useState<LensItem | null>(null);
  const [touch, setTouch] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setTouch(matchMedia("(pointer: coarse)").matches);
    let disposed = false;
    let io: IntersectionObserver | null = null;
    let unlisten = () => {};
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    import("./lens-stage")
      .then(({ LensStage }) => {
        if (disposed) return;
        const stage = new LensStage(
          canvas,
          LENS_ITEMS,
          {
            onReady: () => setReady(true),
            onFocus: (it) => setFocus(it),
            onLens: (x, y, r) => {
              const el = chipRef.current;
              if (el)
                el.style.transform = `translate3d(${x}px, ${y + r + 14}px, 0) translateX(-50%)`;
            },
          },
          { reducedMotion: reduced, introSrc: "/home/lens-intro.mp4" },
        );
        stageRef.current = stage;
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
      unlisten();
      stageRef.current?.dispose();
      stageRef.current = null;
    };
  }, []);

  return (
    <section
      id="top"
      aria-labelledby="hero-title"
      className="hero relative isolate h-[calc(100svh-4rem)] min-h-[600px] max-h-[1100px] overflow-hidden border-b border-white/10 bg-[#05060c]"
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

      {/* What's under the glass: follows the lens. Decorative for screen
          readers; every one of these destinations is listed in the sections
          below. */}
      <a
        ref={chipRef}
        href={focus?.href ?? "#work"}
        aria-hidden
        tabIndex={-1}
        className={`lg-chip absolute left-0 top-0 z-10 inline-flex items-center gap-2 sm:gap-3 rounded-full px-4 py-2 transition-opacity duration-300 ${focus && ready ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_10px_var(--primary)]" />
        <span className="hidden sm:inline mono text-[10px] uppercase tracking-[0.2em] text-white/70">
          {focus?.kind}
        </span>
        <span className="text-sm font-medium text-white whitespace-nowrap">{focus?.name} →</span>
      </a>

      {/* Copy: bottom-left on wide screens, bottom on phones. The field keeps
          the right / top of the stage clear of it. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-5 sm:px-8 lg:px-16 pb-8 sm:pb-12 lg:pb-16">
        <div className="max-w-[640px]">
          <p className="lg-chip pointer-events-auto inline-flex items-center gap-2.5 rounded-full px-3.5 py-1.5 mono text-[10px] uppercase tracking-[0.22em] text-white/80">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            Immersive products &amp; experiences
          </p>
          <h1 id="hero-title" className="display mt-5 text-[clamp(48px,8.4vw,128px)] text-white">
            Everything we touch <span className="text-primary">comes alive.</span>
          </h1>
          <p className="mt-5 max-w-[46ch] text-[15px] sm:text-base leading-relaxed text-white/75">
            Merch, print, retail, live events and games for entertainment and gaming IP. Tap or scan
            it, and an experience opens. No app.
          </p>
          <div className="pointer-events-auto mt-7 flex flex-wrap items-center gap-3">
            <Link
              to="/contact"
              className="group btn-pill btn-solid px-6 py-3.5 text-sm font-medium"
            >
              Activate your IP
              <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
            <a href="#work" className="btn-pill btn-glass px-6 py-3.5 text-sm font-medium">
              See what we make
            </a>
          </div>
          <p className="mt-6 hidden sm:flex items-center gap-2 mono text-[10px] uppercase tracking-[0.2em] text-white/50">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-glow" aria-hidden />
            {touch ? "Tap a piece to activate it" : "Move the lens over anything"}
          </p>
        </div>
      </div>
    </section>
  );
}
