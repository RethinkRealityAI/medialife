/**
 * Confetti, once: the first time a creator sees an approved upload. Nothing
 * else in the hub animates for show. Skipped for reduced motion; remembered
 * per creator in localStorage so it never repeats.
 */
import { useEffect, useRef, useState } from "react";

import { ParticleField } from "@/components/hub/overlay/confetti";

const COLORS = ["#f6c344", "#ffdf7a", "#3fe6e0", "#19affe", "#ff37ae", "#ffffff"];

export function FirstApprovalConfetti({
  creatorId,
  approved,
}: {
  creatorId: string;
  /** True once any upload is approved or posted. */
  approved: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!approved) return;
    const key = `ugc-confetti:${creatorId}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, String(Date.now()));
    } catch {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setOn(true);
  }, [approved, creatorId]);

  useEffect(() => {
    if (!on || !ref.current) return;
    const canvas = ref.current;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.getContext("2d")?.scale(dpr, dpr);
    const field = new ParticleField(canvas);
    field.celebrate(window.innerWidth, window.innerHeight, COLORS);
    const t = setTimeout(() => setOn(false), 6500);
    return () => {
      clearTimeout(t);
      field.destroy();
    };
  }, [on]);

  if (!on) return null;
  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[90] h-dvh w-screen"
    />
  );
}
