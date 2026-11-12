import { useEffect, useRef, useState } from "react";

/**
 * A printed poster with a "phone lens" over it: inside the lens the poster is
 * alive (the real AR footage), outside it stays print. The lens follows the
 * mouse; on touch it drifts by itself and can be dragged. "See it all" opens
 * the lens over the whole poster (also the keyboard route).
 *
 * The footage's first frame lines up with the print, so the lens reads as the
 * same poster coming alive. The video only loads once the poster is near the
 * screen and only plays while it is on screen. With reduced motion the lens
 * sits still and shows a still frame instead of the video.
 */
export function ScanLens({
  poster,
  video,
  still,
  alt,
  width,
  height,
  label = "Live",
}: {
  poster: string;
  video: string;
  still: string;
  alt: string;
  width: number;
  height: number;
  label?: string;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const lens = useRef<HTMLDivElement | null>(null);
  const vid = useRef<HTMLVideoElement | null>(null);
  const [full, setFull] = useState(false);
  const [anim, setAnim] = useState(false);
  const [calm, setCalm] = useState(false);
  const [fine, setFine] = useState(true);
  const [near, setNear] = useState(false);

  useEffect(() => {
    setCalm(matchMedia("(prefers-reduced-motion: reduce)").matches);
    setFine(matchMedia("(hover: hover) and (pointer: fine)").matches);
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let x = 0.62;
    let y = 0.5;
    let tx = x;
    let ty = y;
    let user = 0; // time the visitor last moved the lens
    let dragging = false;
    let visible = false;
    let raf = 0;
    const t0 = performance.now();

    const put = () => {
      el.style.setProperty("--lx", `${(x * 100).toFixed(2)}%`);
      el.style.setProperty("--ly", `${(y * 100).toFixed(2)}%`);
    };
    const size = () => el.style.setProperty("--lr", `${Math.round(el.clientWidth * 0.25)}px`);
    size();
    put();
    const ro = new ResizeObserver(size);
    ro.observe(el);

    const aim = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      tx = Math.min(0.95, Math.max(0.05, (e.clientX - r.left) / r.width));
      ty = Math.min(0.95, Math.max(0.05, (e.clientY - r.top) / r.height));
      user = performance.now();
      if (reduce) {
        x = tx;
        y = ty;
        put();
      } else loop();
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || dragging) aim(e);
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      dragging = true;
      lens.current?.setPointerCapture(e.pointerId);
      aim(e);
    };
    const onUp = () => {
      dragging = false;
    };
    el.addEventListener("pointermove", onMove);
    const l = lens.current;
    l?.addEventListener("pointerdown", onDown);
    l?.addEventListener("pointerup", onUp);
    l?.addEventListener("pointercancel", onUp);

    const tick = (now: number) => {
      raf = 0;
      // left alone for a while: the lens drifts slowly over the poster
      if (!dragging && now - user > 2600) {
        const t = (now - t0) / 1000;
        tx = 0.5 + 0.22 * Math.sin(t * 0.42);
        ty = 0.47 + 0.2 * Math.sin(t * 0.67 + 0.8);
      }
      x += (tx - x) * 0.09;
      y += (ty - y) * 0.09;
      put();
      if (visible && !document.hidden) loop();
    };
    function loop() {
      if (!raf && !reduce) raf = requestAnimationFrame(tick);
    }

    const io = new IntersectionObserver(
      (es) => {
        const e = es[0];
        if (e.isIntersecting) setNear(true);
        visible = e.intersectionRatio > 0;
        const v = vid.current;
        if (visible) {
          loop();
          v?.play().catch(() => {});
        } else v?.pause();
      },
      { rootMargin: "300px 0px", threshold: [0, 0.01] },
    );
    io.observe(el);
    const onVis = () => {
      if (!document.hidden && visible) loop();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      ro.disconnect();
      io.disconnect();
      el.removeEventListener("pointermove", onMove);
      l?.removeEventListener("pointerdown", onDown);
      l?.removeEventListener("pointerup", onUp);
      l?.removeEventListener("pointercancel", onUp);
      document.removeEventListener("visibilitychange", onVis);
      cancelAnimationFrame(raf);
    };
  }, []);

  // once the source is set, start playing if the poster is already on screen
  useEffect(() => {
    if (near) vid.current?.play().catch(() => {});
  }, [near]);

  const toggle = () => {
    setAnim(true);
    setFull((f) => !f);
    window.setTimeout(() => setAnim(false), 750);
  };

  const clip = full
    ? "circle(150% at var(--lx) var(--ly))"
    : "circle(var(--lr) at var(--lx) var(--ly))";

  return (
    <figure className="relative mx-auto w-full max-w-[460px]">
      <div
        ref={box}
        className="scan-lens relative overflow-hidden rounded-[18px] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.8)] ring-1 ring-white/10"
        style={{ aspectRatio: `${width} / ${height}`, cursor: fine ? "none" : undefined }}
      >
        <img
          src={poster}
          alt={alt}
          width={width}
          height={height}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* the poster, alive: only seen through the lens */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            clipPath: clip,
            WebkitClipPath: clip,
            transition: anim ? "clip-path 0.7s cubic-bezier(.2,.8,.2,1)" : "none",
          }}
        >
          {calm ? (
            <img src={still} alt="" className="h-full w-full object-cover" />
          ) : (
            <video
              ref={vid}
              src={near ? video : undefined}
              poster={still}
              muted
              loop
              playsInline
              preload="none"
              className="h-full w-full object-cover"
            />
          )}
        </div>
        {/* the lens rim */}
        <div
          ref={lens}
          aria-hidden
          className="absolute left-[var(--lx)] top-[var(--ly)] h-[calc(var(--lr)*2)] w-[calc(var(--lr)*2)] -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity duration-300"
          style={{
            opacity: full ? 0 : 1,
            touchAction: "none",
            boxShadow:
              "0 0 0 1.5px rgba(255,255,255,0.85), 0 0 0 7px rgba(255,255,255,0.12), 0 18px 40px -10px rgba(0,0,0,0.6), inset 0 0 30px rgba(25,175,255,0.35)",
          }}
        >
          <span className="absolute -bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/75 px-2.5 py-1 mono text-[9px] uppercase tracking-[0.2em] text-white backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse-glow" />
            {label}
          </span>
        </div>
      </div>
      <figcaption className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <span className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {fine ? "Move over the poster to scan it" : "Drag the lens to scan the poster"}
        </span>
        <button
          type="button"
          onClick={toggle}
          aria-pressed={full}
          className="btn-pill btn-glass px-4 py-2 text-xs font-medium"
        >
          {full ? "Back to print" : "See it all alive"}
        </button>
      </figcaption>
    </figure>
  );
}
