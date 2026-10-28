/** The MEDIALIFE™ × EVADE lockup used in the creator app's chrome. */
import { UGC_ART } from "@/components/ugc/shared/look";
import { cn } from "@/lib/utils";

export function Lockup({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <img src={UGC_ART.mark} alt="" width={24} height={24} className="size-6 shrink-0" />
      {!compact ? (
        <>
          <b className="text-[13px] font-bold tracking-[0.04em]">
            MEDIALIFE<sup className="text-[0.55em] font-medium">™</sup>
          </b>
          <span className="text-[13px] text-[#5e6a73]" aria-hidden>
            ×
          </span>
        </>
      ) : null}
      <img
        src={UGC_ART.evadeLogo}
        alt="EVADE"
        width={74}
        height={19}
        className={cn("h-auto shrink-0", compact ? "w-[58px]" : "w-[66px]")}
      />
    </span>
  );
}

/** The small "UGC HUB" tag next to the lockup. */
export function HubTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border border-[#f6c344]/35 bg-[#f6c344]/[0.08] px-2.5 font-mono text-[10px] font-medium tracking-[0.18em] whitespace-nowrap text-[#ffe48a] uppercase",
        className,
      )}
    >
      UGC Hub
    </span>
  );
}
