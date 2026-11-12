import { useEffect, useRef, useState, type CSSProperties } from "react";

export type PartnerLogo = {
  name: string;
  /** The white mark, how the strip normally reads */
  src: string;
  /** The same mark in the brand's own colours, shown when it lights up */
  color: string;
  /** Glow behind the lit mark */
  glow: string;
  /** Tailwind height classes (each mark is optically balanced by hand) */
  h: string;
};

/**
 * The partner strip. Marks sit in white so the row reads as one; each lights
 * up in its brand colours on hover, focus or tap, and while the strip is on
 * screen they light up in turn (paused while the visitor points at one, and
 * off with reduced motion).
 */
export function LogoBand({ logos, className = "" }: { logos: PartnerLogo[]; className?: string }) {
  const [lit, setLit] = useState(-1);
  const ref = useRef<HTMLUListElement | null>(null);
  /** The auto-cycle waits until this time (ms); Infinity while hovered */
  const hold = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let visible = false;
    let k = -1;
    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    const id = window.setInterval(() => {
      if (!visible || document.hidden || Date.now() < hold.current) return;
      k = (k + 1) % logos.length;
      setLit(k);
    }, 1800);
    return () => {
      io.disconnect();
      window.clearInterval(id);
    };
  }, [logos.length]);

  return (
    <ul
      ref={ref}
      className={className}
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        hold.current = Infinity;
        setLit(-1);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse") return;
        hold.current = Date.now() + 1200;
      }}
    >
      {logos.map((l, i) => (
        <li
          key={l.name}
          className={`logo-mark flex items-center ${lit === i ? "is-lit" : ""}`}
          style={{ "--g": l.glow } as CSSProperties}
          onPointerDown={(e) => {
            // a tap lights the mark (a mouse uses hover instead)
            if (e.pointerType === "mouse") return;
            hold.current = Date.now() + 5000;
            setLit(i);
          }}
        >
          <span className="relative inline-flex">
            <img
              src={l.src}
              alt={l.name}
              loading="lazy"
              decoding="async"
              className={`lm-w ${l.h} w-auto select-none`}
              draggable={false}
            />
            <img
              src={l.color}
              alt=""
              aria-hidden
              loading="lazy"
              decoding="async"
              className="lm-c pointer-events-none absolute inset-0 h-full w-full select-none"
              draggable={false}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}
