import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/**
 * Fades its content up when it scrolls into view, and starts any `.draw`
 * icon strokes inside it.
 *
 * Content renders visible on the server and for anything already on screen,
 * so nothing depends on JavaScript to be readable; only blocks below the fold
 * are hidden (then revealed). Reduced motion: never hidden, never animated.
 */
export function Reveal({
  children,
  className = "",
  delay = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "li" | "section" | "ul";
}) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.dataset.reveal = "in";
      return;
    }
    if (el.getBoundingClientRect().top < innerHeight * 0.92) {
      el.dataset.reveal = "in";
      return;
    }
    el.dataset.reveal = "pending";
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.dataset.reveal = "in";
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref as never} className={className} style={{ "--d": `${delay}ms` } as CSSProperties}>
      {children}
    </Tag>
  );
}
