import { useEffect, useRef, useState } from "react";
import type { Clip } from "@/lib/case-studies";

/**
 * A silent, looping clip.
 *
 * Three things this has to get right, in order of how badly they bite:
 *
 * 1. WCAG 2.2.2 — anything that moves, blinks or scrolls for more than five
 *    seconds needs a mechanism to pause it. These loop forever, so the
 *    play/pause control is not decoration; it is the reason the component is
 *    stateful at all.
 * 2. prefers-reduced-motion — we never autoplay for those users. They get the
 *    poster frame and an explicit play control, so the content is still
 *    reachable, just not thrown at them.
 * 3. Bandwidth — `preload="none"` plus an IntersectionObserver means a clip
 *    below the fold costs nothing until it is nearly on screen, and pauses
 *    again once it leaves. On a case-studies page carrying five clips that is
 *    the difference between a few hundred KB and several MB on load.
 *
 * The clips carry no audio track at all, so `muted` here is about autoplay
 * policy (every browser blocks unmuted autoplay), not about silencing sound.
 */
export function LoopClip({
  clip,
  className,
  rounded = false,
  fill = false,
}: {
  clip: Clip;
  className?: string;
  rounded?: boolean;
  /**
   * In a bento grid the row span — not the source footage — decides the box,
   * so honouring the clip's own aspect ratio there leaves two neighbouring
   * cells at different heights. `fill` hands height back to the grid.
   */
  fill?: boolean;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [reduced, setReduced] = useState(false);
  const [playing, setPlaying] = useState(false);
  const wanted = useRef(true);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setReduced(mq.matches);
      wanted.current = !mq.matches;
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (wanted.current) {
            // A rejected play() promise is normal (tab backgrounded, low power
            // mode). Swallow it and leave the poster showing rather than
            // throwing an unhandled rejection into the console.
            node.play().catch(() => setPlaying(false));
          }
        } else {
          node.pause();
        }
      },
      { rootMargin: "200px 0px", threshold: 0.01 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  const toggle = () => {
    const node = ref.current;
    if (!node) return;
    if (node.paused) {
      wanted.current = true;
      node.play().catch(() => setPlaying(false));
    } else {
      wanted.current = false;
      node.pause();
    }
  };

  return (
    <div
      className={`relative overflow-hidden border border-border bg-secondary group ${
        rounded ? "rounded-lg" : ""
      } ${fill ? "h-full min-h-0" : ""} ${className ?? ""}`}
      style={fill ? undefined : { aspectRatio: clip.ratio }}
    >
      <video
        ref={ref}
        poster={clip.poster}
        muted
        loop
        playsInline
        preload="none"
        aria-label={clip.alt}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
      >
        <source src={clip.src} type="video/mp4" />
      </video>

      {/* Reduced-motion users land on the poster; this is their way in. */}
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? `Pause: ${clip.alt}` : `Play: ${clip.alt}`}
        className={`absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-full border border-white/25 bg-black/55 text-white backdrop-blur transition
          hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
          ${playing && !reduced ? "opacity-0 group-hover:opacity-100 focus-visible:opacity-100" : "opacity-100"}`}
      >
        <span aria-hidden className="text-[11px] leading-none">
          {playing ? "❙❙" : "▶"}
        </span>
      </button>
    </div>
  );
}
