/** The one "What's next" card on Home, from ugcNextAction() on the server. */
import { ArrowRight, ExternalLink } from "lucide-react";

import { HubLink } from "@/components/hub/app/hub-link";
import { UGC_ART, btnGhost, btnGold, btnTeal, card, eyebrow } from "@/components/ugc/shared/look";
import type { UgcNextAction } from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

const ART: Record<UgcNextAction["id"], { src: string; cls: string } | null> = {
  paused: null,
  "fix-changes": { src: UGC_ART.bobo, cls: "-rotate-6" },
  "post-live-link": { src: UGC_ART.bobo, cls: "rotate-3" },
  packing: { src: UGC_ART.can, cls: "rotate-12" },
  "on-its-way": { src: UGC_ART.can, cls: "-rotate-12" },
  "film-and-upload": { src: UGC_ART.bobo, cls: "-rotate-3" },
  "in-review": { src: UGC_ART.can, cls: "rotate-6" },
  "enjoy-perks": { src: UGC_ART.bobo, cls: "rotate-6" },
};

const TONE: Record<UgcNextAction["tone"], { box: string; kicker: string; glow: string }> = {
  action: {
    box: "border-[#f6c344]/35",
    kicker: "text-[#f6c344]",
    glow: "bg-[radial-gradient(closest-side,rgb(246_195_68/0.28),transparent)]",
  },
  info: {
    box: "border-[#3fe6e0]/30",
    kicker: "text-[#3fe6e0]",
    glow: "bg-[radial-gradient(closest-side,rgb(63_230_224/0.25),transparent)]",
  },
  success: {
    box: "border-emerald-400/35",
    kicker: "text-emerald-300",
    glow: "bg-[radial-gradient(closest-side,rgb(52_211_153/0.25),transparent)]",
  },
  muted: {
    box: "border-white/10",
    kicker: "text-muted-foreground",
    glow: "bg-[radial-gradient(closest-side,rgb(255_255_255/0.08),transparent)]",
  },
};

export function NextUpCard({ action, className }: { action: UgcNextAction; className?: string }) {
  const t = TONE[action.tone];
  const art = ART[action.id];
  const cta = action.cta;
  const btn = action.tone === "action" ? btnGold : action.tone === "info" ? btnTeal : btnGhost;
  return (
    <section
      aria-labelledby="next-title"
      className={cn(
        card,
        "relative isolate flex flex-col justify-center overflow-hidden p-5 sm:p-7",
        t.box,
        className,
      )}
    >
      <span
        aria-hidden
        className={cn("absolute -top-16 -right-10 -z-10 size-72 blur-2xl", t.glow)}
      />
      {art ? (
        <img
          src={art.src}
          alt=""
          aria-hidden
          className={cn(
            "pointer-events-none absolute -right-3 -bottom-4 -z-10 h-32 w-auto opacity-90 drop-shadow-[0_20px_30px_rgb(0_0_0/0.6)] sm:right-4 sm:bottom-auto sm:top-1/2 sm:h-40 sm:-translate-y-1/2 lg:right-8 lg:h-52",
            art.cls,
          )}
        />
      ) : null}
      <div className={cn(eyebrow, t.kicker)}>What's next</div>
      <h2
        id="next-title"
        className="mt-2 max-w-[17ch] text-[24px] leading-[1.08] font-bold tracking-[-0.03em] text-balance sm:max-w-[22ch] sm:text-[28px]"
      >
        {action.title}
      </h2>
      <p className="mt-2 max-w-[34ch] text-[15px] leading-relaxed text-[#c9d1d8] sm:max-w-md">
        {action.body}
      </p>
      {cta ? (
        <div className="mt-5">
          {cta.external ? (
            <a href={cta.href} target="_blank" rel="noreferrer" className={btn}>
              {cta.label} <ExternalLink aria-hidden />
            </a>
          ) : (
            <HubLink to={cta.href} className={btn}>
              {cta.label} <ArrowRight aria-hidden />
            </HubLink>
          )}
        </div>
      ) : null}
    </section>
  );
}
