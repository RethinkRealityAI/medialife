import { useEffect, useRef } from "react";

/**
 * A short, silent loop that only loads and plays while it is on screen
 * (and pauses when it scrolls away). With reduced motion it stays on its
 * poster frame.
 */
export function InViewVideo({
  src,
  poster,
  label,
  className = "",
}: {
  src: string;
  poster: string;
  /** What the clip shows, for screen readers */
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          if (v.preload !== "auto") v.preload = "auto";
          v.play().catch(() => {});
        } else v.pause();
      },
      { rootMargin: "100px 0px", threshold: 0.2 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      muted
      loop
      playsInline
      preload="none"
      poster={poster}
      aria-label={label}
      className={className}
    >
      <source src={src} type="video/mp4" />
    </video>
  );
}
