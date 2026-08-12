import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * 3D tilt driven by pointer position, plus a scroll-linked lean.
 *
 * The perspective is applied as a transform FUNCTION on the transformed element
 * itself — `transform: perspective(900px) rotateX(...)` — not as a `perspective`
 * property on this wrapper. The property only affects DIRECT children, and the
 * element we tilt is a grandchild (wrapper > drift > img), so as a property it
 * did nothing and the rotations rendered as a flat, invisible squash. The
 * transform function is self-contained and survives the intervening drift
 * animation and the image's own `filter`, both of which flatten 3D contexts.
 *
 * Other notes:
 * - Pointer and scroll write separate CSS custom properties, composed once in
 *   the consumer's transform, so the two inputs never overwrite each other.
 * - Scroll work is rAF-throttled and gated on an IntersectionObserver.
 * - Pointer tilt is gated on the pointerType of the actual event, so a tap
 *   never leaves the card stuck mid-tilt, and a trackpad on a touchscreen
 *   laptop still works (the `pointer: fine` media query does not cover that —
 *   it describes only the PRIMARY pointer).
 * - All of it is disabled under prefers-reduced-motion.
 */
export function TiltCard({
  children,
  className,
  maxTilt = 15,
  scrollLean = 7,
  scrollShift = 24,
}: {
  children: ReactNode;
  className?: string;
  maxTilt?: number;
  scrollLean?: number;
  scrollShift?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [reduced, setReduced] = useState(false);
  // Whether a real mouse/pen has been seen on this element. See onPointerMove.
  const finePointer = useRef(false);

  useEffect(() => {
    const isReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduced(isReduced);
    if (isReduced) return;

    const el = ref.current;
    if (!el) return;

    let raf = 0;
    let visible = false;

    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const node = ref.current;
        if (!visible || !node) return;
        const r = node.getBoundingClientRect();
        // +1 when the card sits at the top of the viewport, -1 at the bottom.
        const progress = Math.max(
          -1,
          Math.min(1, 1 - (2 * (r.top + r.height / 2)) / window.innerHeight),
        );
        node.style.setProperty("--scroll-lean", `${(progress * scrollLean).toFixed(2)}deg`);
        node.style.setProperty("--scroll-shift", `${(progress * -scrollShift).toFixed(1)}px`);
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
    window.addEventListener("resize", onScroll, { passive: true });
    onScroll();

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [scrollLean, scrollShift]);

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const node = ref.current;
    if (reduced || !node) return;

    // Gate on the ACTUAL pointer that moved, not on a media query.
    //
    // This previously gated on `(hover: hover) and (pointer: fine)`. Those
    // queries describe the device's PRIMARY pointer — on a Windows laptop with
    // a touchscreen the primary pointer is touch, so both evaluate false and
    // the tilt was dead even when the user was driving a trackpad. That is why
    // it worked in Safari on a Mac and not in Chrome on a touch laptop: a
    // device difference, not an engine difference. `any-pointer` would be
    // closer, but reading pointerType off the event is exact.
    if (e.pointerType === "touch") return;
    finePointer.current = true;
    const r = node.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    node.style.setProperty("--tilt-y", `${(px * maxTilt * 2).toFixed(2)}deg`);
    node.style.setProperty("--tilt-x", `${(-py * maxTilt * 2).toFixed(2)}deg`);
    node.style.setProperty("--point-x", `${((px + 0.5) * 100).toFixed(1)}%`);
    node.style.setProperty("--point-y", `${((py + 0.5) * 100).toFixed(1)}%`);
    node.style.setProperty("--glare", "1");
  };

  const reset = () => {
    const node = ref.current;
    if (!node || !finePointer.current) return;
    node.style.setProperty("--tilt-x", "0deg");
    node.style.setProperty("--tilt-y", "0deg");
    node.style.setProperty("--glare", "0");
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
          "--glare": "0",
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}
