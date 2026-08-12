import { useEffect, useRef, useState } from "react";

/**
 * Metric that counts up the first time it scrolls into view.
 *
 * Works on the real approved strings rather than plain numbers — "72–90%",
 * "5.4–6.2×", "1.5–3+ min", "680+" — by tokenising the label, animating every
 * numeric run inside it, and leaving the surrounding characters untouched. That
 * keeps the displayed value byte-identical to the approved copy once settled,
 * which matters here: these figures are contractual.
 *
 * Accessibility: the final value is always in the DOM for assistive tech via an
 * aria-label, and under prefers-reduced-motion nothing animates at all.
 */
export function CountUp({ value, className }: { value: string; className?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [display, setDisplay] = useState(value);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }

    // Split into numeric and non-numeric runs, preserving decimals.
    const parts = value.split(/(\d+\.?\d*)/);
    const hasNumbers = parts.some((p) => /^\d/.test(p));
    if (!hasNumbers) return;

    let raf = 0;
    let start = 0;
    const DURATION = 1100;

    const tick = (now: number) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / DURATION);
      // easeOutExpo — fast out of the gate, long settle. Reads as a counter
      // landing on a figure rather than a linear ramp.
      const e = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);

      setDisplay(
        parts
          .map((p) => {
            if (!/^\d/.test(p)) return p;
            const target = parseFloat(p);
            const decimals = (p.split(".")[1] ?? "").length;
            return (target * e).toFixed(decimals);
          })
          .join(""),
      );

      if (t < 1) raf = requestAnimationFrame(tick);
      else setDisplay(value); // land exactly on the approved string
    };

    // Backstop: rAF can be throttled or dropped (background tab, compositor
    // pressure), which would strand the figure a hair short of its real value.
    // These numbers are contractual, so a timer guarantees the exact string.
    let settle: ReturnType<typeof setTimeout>;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || done.current) return;
        done.current = true;
        io.disconnect();
        raf = requestAnimationFrame(tick);
        settle = setTimeout(() => setDisplay(value), DURATION + 150);
      },
      { threshold: 0.4 },
    );
    io.observe(el);

    return () => {
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
      if (settle) clearTimeout(settle);
    };
  }, [value]);

  return (
    <span ref={ref} className={className} aria-label={value}>
      <span aria-hidden="true" className="tabular-nums">
        {display}
      </span>
    </span>
  );
}
