import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ArStage, Track } from "./ar-stage";

import { CANS, HERO_SLIDES, type HeroCta } from "./hero-slides";

/**
 * Homepage hero: the visitor points a phone at one MEDIALIFE piece at a time
 * and it comes alive (see ar-stage.ts). With a mouse the phone follows the
 * pointer; on touch it is dragged through a DOM layer laid over its screen.
 * That layer also carries the phone's UI: hints, the design's own button, the
 * game's joystick and score, and the reward card.
 *
 * The WebGL stage is imported on mount, so SSR and the first paint are just
 * the copy over a static poster. The canvas fades in once the first piece has
 * loaded; if WebGL fails the poster simply stays.
 */
export function Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const ctaRef = useRef<HTMLAnchorElement>(null);
  const hotRef = useRef<HTMLDivElement>(null);
  const sideRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const stageRef = useRef<ArStage | null>(null);
  const dragId = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [index, setIndex] = useState(0);
  const [track, setTrack] = useState<Track>("build");
  const [paused, setPaused] = useState(false);
  const [score, setScore] = useState(0);
  const [reward, setReward] = useState(false);
  const [held, setHeld] = useState(false);
  const [moved, setMoved] = useState(false);
  const [scrW, setScrW] = useState(180);
  const [touch, setTouch] = useState(false);
  const [spot, setSpot] = useState(0);
  const [steered, setSteered] = useState(false);
  const [blocked, setBlocked] = useState(false);
  /** Phones and portrait screens: the stage sits above the copy, under the piece's title */
  const [tall, setTall] = useState<boolean | null>(null);
  const slide = HERO_SLIDES[index];
  const cta = (slide.spots[spot] ?? slide.spots[0]).cta;
  const magenta = slide.accent === "magenta";
  const alive = track === "alive";

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
    let lastW = 0;
    const start = Math.max(
      0,
      Math.min(
        HERO_SLIDES.length - 1,
        Number(new URLSearchParams(location.search).get("slide") ?? 0) || 0,
      ),
    );
    setIndex(start);

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
              setSpot(0);
              setReward(false);
            },
            onSpot: (k) => setSpot(k),
            onBlocked: (b) => setBlocked(b),
            // a click on a live design (mouse): its button
            onActivate: () => ctaRef.current?.click(),
            onHotspot: (h) => {
              const el = hotRef.current;
              if (!el) return;
              if (!h) {
                el.style.opacity = "0";
                return;
              }
              const w = canvasRef.current?.clientWidth ?? 0;
              el.dataset.flip = h.x + h.r + 220 > w ? "1" : "";
              el.style.setProperty("--r", `${h.r}px`);
              el.style.transform = `translate3d(${h.x}px, ${h.y}px, 0)`;
              el.style.opacity = h.covered ? "0" : "1";
            },
            onTrack: (t) => setTrack(t),
            onScore: (n) => setScore(n),
            onReward: () => setReward(true),
            onPhone: (r) => {
              const el = screenRef.current;
              if (!el) return;
              el.style.width = `${r.w}px`;
              el.style.height = `${r.h}px`;
              el.style.transform = `translate3d(${r.x - r.w / 2}px, ${r.y - r.h / 2}px, 0) rotate(${r.angle}rad)`;
              if (Math.abs(r.w - lastW) > 2) {
                lastW = r.w;
                setScrW(r.w);
              }
            },
            onLayout: (r, isTall) => {
              setTall(isTall);
              const el = overlayRef.current;
              if (!el) return;
              el.style.left = `${r.x}px`;
              el.style.top = `${r.y}px`;
              el.style.width = `${r.w}px`;
              el.style.height = `${r.h}px`;
            },
            onSides: (rs) => {
              sideRefs.current.forEach((el, k) => {
                if (!el) return;
                const r = rs[k];
                if (!r) {
                  el.style.visibility = "hidden";
                  return;
                }
                el.style.visibility = "visible";
                el.style.transform = `translate3d(${r.x}px, ${r.y}px, 0)`;
                el.style.width = `${r.w}px`;
                el.style.height = `${r.h}px`;
              });
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
    if (active) setSteered(true);
  }, []);

  /** A pointer position, relative to the canvas. */
  const rel = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const stopDrag = (e: React.PointerEvent) => e.stopPropagation();

  const game = slide.pop?.kind === "bobo";
  const accentText = magenta ? "text-accent" : "text-primary";
  const accentBg = magenta ? "bg-accent" : "bg-[var(--btn-blue)]";
  // the phone's UI scales with its screen
  const fs = Math.min(13, Math.max(9, scrW * 0.062));
  const stick = Math.round(Math.min(104, Math.max(60, scrW * 0.44)));
  const hint =
    track === "lock"
      ? "Scanning…"
      : track === "search" && !held
        ? `${touch ? "Drag" : "Move"} the phone over ${slide.aim}`
        : alive && blocked
          ? `${touch ? "Tap" : "Click"} to play`
          : null;
  // "Activated by MEDIALIFE", top right of the phone, once it's on a design
  const badge = (track === "lock" || alive) && !(game && alive);

  return (
    <section
      ref={sectionRef}
      id="top"
      aria-labelledby="hero-title"
      aria-roledescription="carousel"
      className="hero relative isolate h-[calc(100svh-4rem+96px)] min-h-[760px] max-h-[1100px] overflow-hidden lg:h-[calc(100svh-4rem)] lg:min-h-[620px] border-b border-white/10 bg-[#05060c]"
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

      {/* Phones: what this kind of piece is, over the stage */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 z-20 px-5 pt-3 sm:px-8 ${tall === null ? "lg:hidden" : tall ? "" : "hidden"}`}
      >
        <div key={slide.key} className="animate-fade-in">
          <p className="mono flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-white/55">
            <span className={`h-1.5 w-1.5 rounded-full ${accentBg}`} aria-hidden />
            {String(index + 1).padStart(2, "0")} / {String(HERO_SLIDES.length).padStart(2, "0")}
            <span aria-hidden>·</span>
            {slide.tab}
          </p>
          <p className="display mt-1.5 text-[clamp(28px,8vw,44px)] leading-[0.95] text-white">
            {slide.title.split(" ")[0]}{" "}
            <span className={accentText}>{slide.title.split(" ").slice(1).join(" ")}</span>
          </p>
          <p className="mt-1.5 text-[13px] leading-snug text-white/65">{slide.detail}</p>
        </div>
      </div>

      {/* The NFC hotspot's label, beside the tag on the piece (ar-stage.ts draws the tag). */}
      {slide.spots.some((x) => x.hotspot) && (
        <div
          ref={hotRef}
          aria-hidden
          className="nfc-label pointer-events-none absolute left-0 top-0 z-[5] transition-opacity duration-300"
          style={{ opacity: 0 }}
        >
          {slide.spots.map(
            (x) =>
              x.hotspot && (
                <div
                  key={x.aim}
                  className="nfc-label__box lg-chip rounded-2xl px-3 py-2 text-white"
                >
                  <span className="mono flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.2em] text-white/70">
                    <span className={`h-1.5 w-1.5 rounded-full ${accentBg} animate-pulse-glow`} />
                    {x.hotspot.label}
                  </span>
                  <strong className="mt-0.5 block whitespace-nowrap text-[14px] font-semibold leading-tight">
                    {x.hotspot.sub}
                  </strong>
                </div>
              ),
          )}
        </div>
      )}

      {/* The phone's screen: drag it to point the phone. It also holds the
          phone's own UI, like a real AR experience would. */}
      <div
        ref={screenRef}
        aria-hidden={!(alive || reward)}
        className={`absolute left-0 top-0 z-10 origin-center select-none rounded-[14%/7%] transition-opacity duration-500 ${touch ? `touch-none ${held ? "cursor-grabbing" : "cursor-grab"}` : "pointer-events-none"} ${ready ? "opacity-100" : "pointer-events-none opacity-0"}`}
        style={{ width: 0, height: 0, fontSize: `${fs}px` }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" || e.button !== 0 || dragId.current !== null) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          dragId.current = e.pointerId;
          const p = rel(e);
          stageRef.current?.gesture();
          stageRef.current?.grab(p.x, p.y);
          setHeld(true);
          setMoved(true);
        }}
        onPointerMove={(e) => {
          if (dragId.current !== e.pointerId) return;
          const p = rel(e);
          stageRef.current?.drag(p.x, p.y);
        }}
        onPointerUp={(e) => {
          if (dragId.current !== e.pointerId) return;
          dragId.current = null;
          stageRef.current?.release();
          setHeld(false);
        }}
        onPointerCancel={() => {
          dragId.current = null;
          stageRef.current?.release();
          setHeld(false);
        }}
      >
        {/* hints: what to do, then "scanning" while it locks on */}
        {hint && (
          <p
            className={`pointer-events-none absolute inset-x-[8%] top-[14%] mx-auto w-fit rounded-full bg-black/55 px-[0.9em] py-[0.45em] text-center font-medium leading-tight text-white backdrop-blur-sm transition-opacity ${moved && track === "search" ? "opacity-70" : "opacity-100"}`}
          >
            {hint}
          </p>
        )}

        {/* "Activated by MEDIALIFE", once the phone is on a design */}
        <img
          src="/activated-merch/media/ar/activated-by.webp"
          alt=""
          width={360}
          height={142}
          className={`pointer-events-none absolute right-[7%] top-[6.5%] w-[30%] drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)] transition-opacity duration-500 ${badge ? "opacity-95" : "opacity-0"}`}
        />

        {/* the design's own button, once it's alive. With a mouse the phone
            follows the pointer, so a click anywhere on the live design opens it
            (ar-stage.ts onActivate); the button itself is just what to click. */}
        {!game && (
          <div
            className={`absolute inset-x-0 bottom-[7%] flex justify-center transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.2,1.4,0.35,1)] ${alive ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-[40%] opacity-0"}`}
          >
            <ArCta
              key={cta.theme}
              ref={ctaRef}
              cta={cta}
              tabIndex={alive ? 0 : -1}
              onPointerDown={stopDrag}
              className={touch ? "pointer-events-auto" : "pointer-events-none"}
              style={{ maxWidth: Math.max(scrW * 0.94, 150), fontSize: `${Math.max(10, fs)}px` }}
            />
          </div>
        )}

        {/* the game, like the real thing: its title up top with the score,
            "Activated by MEDIALIFE" at the bottom, the stick between */}
        {game && alive && (
          <div className="pointer-events-none absolute inset-0 animate-fade-in">
            <div className="absolute inset-x-0 top-0 h-[30%] rounded-t-[inherit] bg-gradient-to-b from-black/60 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-[34%] bg-gradient-to-t from-black/60 to-transparent" />
            <img
              src="/home/ar/cola-run-logo.webp"
              alt="EVADE Cola Run"
              width={480}
              height={216}
              className="absolute left-1/2 top-[8%] w-[56%] -translate-x-1/2 drop-shadow-[0_3px_8px_rgba(0,0,0,0.6)]"
            />
            {!reward && (
              <p
                className="absolute left-1/2 top-[22.5%] -translate-x-1/2 whitespace-nowrap rounded-full border border-[#ffd21f]/50 bg-black/65 px-[0.9em] py-[0.35em] font-semibold text-[#ffd21f] tabular-nums"
                aria-live="polite"
              >
                Cans {score}/{CANS}
              </p>
            )}
            <img
              src="/activated-merch/media/ar/activated-by.webp"
              alt="Activated by MEDIALIFE"
              width={360}
              height={142}
              className="absolute bottom-[3.2%] left-1/2 w-[26%] -translate-x-1/2 opacity-90"
            />
          </div>
        )}
        {game && alive && !reward && (
          <div
            className="pointer-events-auto absolute bottom-[10%] left-1/2 flex -translate-x-1/2 flex-col items-center"
            onPointerDown={stopDrag}
          >
            {!steered && (
              <span className="mb-[0.6em] whitespace-nowrap rounded-full bg-black/65 px-[0.8em] py-[0.3em] text-[0.9em] font-medium text-white">
                {touch ? "Drag to move Bobo" : "Drag the stick to move Bobo"}
              </span>
            )}
            <span className={`relative rounded-full ${steered ? "" : "stick-pulse"}`}>
              <Joystick
                onMove={onStick}
                accent={magenta ? "accent" : "primary"}
                size={stick}
                globalKeys
              />
            </span>
          </div>
        )}

        {/* the reward */}
        {game && reward && (
          <div
            role="dialog"
            aria-label="Digital reward unlocked"
            onPointerDown={stopDrag}
            className="reward-pop pointer-events-auto absolute left-1/2 top-1/2 w-[max(86%,190px)] -translate-x-1/2 -translate-y-1/2 cursor-default rounded-[1.4em] border border-white/15 bg-[#0b0d18]/90 p-[1.1em] text-center text-white shadow-[0_18px_50px_rgba(0,0,0,0.55)] backdrop-blur-md"
            style={{ fontSize: `${Math.max(11, fs)}px` }}
          >
            <div
              className={`mx-auto grid h-[3em] w-[3em] place-items-center rounded-full ${accentBg}`}
              aria-hidden
            >
              <svg
                width="55%"
                height="55%"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z" />
              </svg>
            </div>
            <p className="mono mt-[0.8em] text-[0.75em] uppercase tracking-[0.2em] text-white/60">
              {CANS}/{CANS} cans collected
            </p>
            <p className="display mt-[0.3em] text-[1.6em] leading-[0.95]">
              Digital reward unlocked
            </p>
            <ArCta cta={slide.spots[0].cta} className="mt-[1.1em] w-full justify-center" />
          </div>
        )}
      </div>

      {/* The other pieces, as holograms in a column on the right (drawn by the
          stage): click one to bring it up. Wide screens only; the tabs do the
          same everywhere. */}
      {[1, 2].map((d, k) => {
        const i = (index + d) % HERO_SLIDES.length;
        const s = HERO_SLIDES[i];
        if (HERO_SLIDES.length <= d) return null;
        return (
          <button
            key={k}
            ref={(el) => {
              sideRefs.current[k] = el;
            }}
            type="button"
            aria-label={`Show ${s.tab}: ${s.spots.map((x) => x.cta.sub).join(", ")}`}
            onClick={() => stageRef.current?.go(i)}
            onPointerEnter={() => stageRef.current?.setSideHover(k)}
            onPointerLeave={() => stageRef.current?.setSideHover(-1)}
            onFocus={() => stageRef.current?.setSideHover(k)}
            onBlur={() => stageRef.current?.setSideHover(-1)}
            className="group absolute left-0 top-0 z-[6] cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            style={{ visibility: "hidden" }}
          >
            <span
              className={`lg-chip absolute -bottom-12 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-medium text-white/75 transition-colors group-hover:text-white ${s.accent === "magenta" ? "group-hover:bg-accent" : "group-hover:bg-[var(--btn-blue)]"}`}
            >
              {s.tab}
            </span>
          </button>
        );
      })}

      {/* Stage controls: the pieces, point the phone, pause. */}
      <div
        ref={overlayRef}
        className="pointer-events-none absolute z-20"
        style={{ left: 0, top: 0 }}
      >
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
                  aria-label={`${s.tab}: ${s.spots.map((x) => x.cta.sub).join(", ")}`}
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
            <span className="mx-0.5 h-5 w-px bg-white/15" aria-hidden />
            <button
              type="button"
              onClick={() => {
                stageRef.current?.pointAtPiece();
                setMoved(true);
              }}
              aria-label={`Point the phone at ${slide.aim}`}
              title={`Point the phone at ${slide.aim}`}
              className="grid h-8 w-8 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? "Play the tour" : "Pause the tour"}
              title={paused ? "Play the tour" : "Pause the tour"}
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
      <p className="sr-only" aria-live="polite">
        {reward ? "Digital reward unlocked. Claim it on the phone." : ""}
      </p>

      {/* Copy: on the left, vertically centred, on wide screens (the stage sits
          right beside it, in the same centred column); at the bottom on phones. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-5 pb-7 sm:px-8 sm:pb-12 lg:top-0 lg:flex lg:items-center lg:px-12 lg:pb-0">
        <div
          ref={copyRef}
          className="max-w-[600px] lg:mx-[max(0px,calc((100%-1480px+96px)/2))] lg:max-w-[min(540px,38vw)] lg:pt-4"
        >
          <p className="lg-chip pointer-events-auto inline-flex items-center gap-2.5 rounded-full px-3.5 py-1.5 mono text-[10px] uppercase tracking-[0.22em] text-white/80">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            Immersive products &amp; experiences
          </p>
          <h1
            id="hero-title"
            className="display mt-4 sm:mt-5 text-[clamp(44px,7.6vw,120px)] lg:text-[clamp(60px,5.6vw,100px)] text-white"
          >
            We activate <span className={accentText}>everything we touch.</span>
          </h1>
          <p className="mt-4 sm:mt-5 max-w-[46ch] text-[15px] sm:text-base leading-relaxed text-white/75">
            The immersive AI studio for entertainment and gaming IP. App-free experiences with
            real-time analytics built in. Tap or scan, and it plays.
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
          {ready && (
            <p className="mt-5 hidden sm:flex items-center gap-2 mono text-[10px] uppercase tracking-[0.2em] text-white/55">
              <span
                className={`h-1.5 w-1.5 rounded-full ${magenta ? "bg-accent" : "bg-primary"} animate-pulse-glow`}
                aria-hidden
              />
              {game && alive && !reward
                ? "Steer Bobo with the stick on the phone, or the arrow keys"
                : alive && !game
                  ? touch
                    ? "Tap the button on the phone, or drag it to another design"
                    : `Click to ${cta.label.toLowerCase()}, or move to another design`
                  : `${touch ? "Drag" : "Move"} the phone over ${slide.aim} to bring it alive`}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/** The little mark at the start of a design's button. */
function CtaMark({ theme }: { theme: HeroCta["theme"] }) {
  if (theme === "trainwreck")
    // a train ticket
    return (
      <svg viewBox="0 0 24 24">
        <path d="M3 7a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-3a2 2 0 0 0 0-4Z" />
        <path d="M15 6v12" strokeDasharray="1.6 1.6" />
      </svg>
    );
  if (theme === "onepiece")
    // a straw hat
    return (
      <svg viewBox="0 0 24 24" stroke="#141414" strokeWidth="1.4" strokeLinejoin="round">
        <ellipse cx="12" cy="15.5" rx="10.5" ry="3.6" fill="#ecc66e" />
        <path
          d="M6.6 14.6C6.6 9.4 8.9 6.5 12 6.5s5.4 2.9 5.4 8.1c-3.4 1.1-7.4 1.1-10.8 0Z"
          fill="#ecc66e"
        />
        <path d="M6.7 12.6c3.5 1 7.1 1 10.6 0l.1 2c-3.5 1.1-7.3 1.1-10.8 0Z" fill="#d8322b" />
      </svg>
    );
  if (theme === "sakamoto")
    // round specs
    return (
      <svg viewBox="0 0 24 24" stroke="#0b0b0b" strokeWidth="1.8" fill="#f4eef0">
        <circle cx="6.8" cy="12.5" r="4.4" />
        <circle cx="17.2" cy="12.5" r="4.4" />
        <path d="M11.2 12.2c.5-.6 1.1-.6 1.6 0" fill="none" />
      </svg>
    );
  // a can
  return (
    <svg viewBox="0 0 24 24" stroke="#0b0b0b" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M7 5.5h10l.8 1.6v10.8l-.8 1.6H7l-.8-1.6V7.1Z" fill="#0b0b0b" />
      <path d="M8.5 10.5h7v3.4h-7z" fill="#ffd21f" stroke="none" />
    </svg>
  );
}

/** A design's button: styled after its own print (.ar-cta in styles.css). */
function ArCta({ cta, className = "", ...rest }: { cta: HeroCta } & React.ComponentProps<"a">) {
  return (
    <a
      href={cta.href}
      {...(cta.external ? { target: "_blank", rel: "noopener" } : {})}
      {...rest}
      className={`ar-cta ar-cta--${cta.theme} ${className}`}
    >
      <span className="ar-cta__mark" aria-hidden>
        <CtaMark theme={cta.theme} />
      </span>
      <span className="ar-cta__txt">
        <small>{cta.sub}</small>
        <strong>{cta.label}</strong>
      </span>
      <b aria-hidden>→</b>
    </a>
  );
}

/**
 * The on-screen stick for the Bobo game. Drag it (mouse or touch), or focus it
 * and use the arrow keys / WASD. With `globalKeys`, the arrow keys and WASD
 * steer from anywhere on the page while the game is up (not while typing).
 */
function Joystick({
  onMove,
  accent,
  size = 104,
  globalKeys = false,
}: {
  onMove: (x: number, y: number, active: boolean) => void;
  accent: "primary" | "accent";
  size?: number;
  globalKeys?: boolean;
}) {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const keys = useRef(new Set<string>());
  const drag = useRef<number | null>(null);
  const R = size * 0.33;

  const set = useCallback(
    (x: number, y: number, active: boolean) => {
      const k = knobRef.current;
      if (k) k.style.transform = `translate(${x * R}px, ${-y * R}px)`;
      onMove(x, y, active);
    },
    [onMove, R],
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

  useEffect(() => {
    if (!globalKeys) return;
    const typing = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t === baseRef.current || t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const down = (e: KeyboardEvent) => {
      const n = keyName(e.key);
      if (!n || typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      // only while the hero is on screen
      const r = baseRef.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > innerHeight) return;
      e.preventDefault();
      keys.current.add(n);
      fromKeys();
    };
    const up = (e: KeyboardEvent) => {
      const n = keyName(e.key);
      if (!n || !keys.current.has(n)) return;
      keys.current.delete(n);
      fromKeys();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  });

  return (
    <div
      ref={baseRef}
      role="application"
      tabIndex={0}
      aria-label="Move Bobo: drag, or use the arrow keys"
      className="lg-chip relative grid touch-none select-none place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      style={{ width: size, height: size }}
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
        style={{ width: size * 0.42, height: size * 0.42 }}
        className={`rounded-full ${accent === "accent" ? "bg-accent" : "bg-[var(--btn-blue)]"} shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_6px_18px_rgba(0,0,0,0.45)] transition-transform duration-75`}
      />
    </div>
  );
}
