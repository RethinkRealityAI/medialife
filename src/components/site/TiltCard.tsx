import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * 3D tilt driven by pointer position, plus a scroll-linked lean.
 *
 * Notes for anyone changing this:
 * - Both inputs are written to CSS custom properties and composed in a single
 *   transform, so pointer and scroll never fight over the same property.
 * - Scroll work is rAF-throttled and gated on an IntersectionObserver, so
 *   nothing runs while the section is off screen.
 * - Pointer tilt is bound to a pointer-fine media query. On touch there is no
 *   hover, and applying it there would leave the card stuck mid-tilt after a tap.
 * - Everything is disabled under prefers-reduced-motion.
 */
export function TiltCard({
  children,
  className,
  maxTilt = 11,
  scrollLean = 5,
}: {
  children: ReactNode;
  className?: string;
  maxTilt?: number;
  scrollLean?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    setEnabled(!reduced && fine);
    if (reduced) return;

    const el = ref.current;
    if (!el) return;

    let raf = 0;
    let visible = false;

    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!visible || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        // -1 when the card sits at the bottom of the viewport, +1 at the top.
        const progress = 1 - (2 * (r.top + r.height / 2)) / window.innerHeight;
        ref.current.style.setProperty("--scroll-lean", `${(progress * scrollLean).toFixed(2)}deg`);
        ref.current.style.setProperty("--scroll-shift", `${(progress * -14).toFixed(1)}px`);
      });
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) onScroll();
      },
      { threshold: 0 },
    );
    io.observe(el);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [scrollLean]);

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    ref.current.style.setProperty("--tilt-y", `${(px * maxTilt * 2).toFixed(2)}deg`);
    ref.current.style.setProperty("--tilt-x", `${(-py * maxTilt * 2).toFixed(2)}deg`);
    ref.current.style.setProperty("--point-x", `${((px + 0.5) * 100).toFixed(1)}%`);
    ref.current.style.setProperty("--point-y", `${((py + 0.5) * 100).toFixed(1)}%`);
  };

  const reset = () => {
    if (!ref.current) return;
    ref.current.style.setProperty("--tilt-x", "0deg");
    ref.current.style.setProperty("--tilt-y", "0deg");
  };

  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
      className={className}
      style={
        {
          "--tilt-x": "0deg",
          "--tilt-y": "0deg",
          "--scroll-lean": "0deg",
          "--scroll-shift": "0px",
          "--point-x": "50%",
          "--point-y": "50%",
          perspective: "900px",
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}
