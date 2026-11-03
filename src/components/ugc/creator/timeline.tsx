/**
 * The creator's journey, top to bottom: Approved → Package packed → Shipped →
 * Delivered → Content due → Submitted → Approved → Posted → Perk unlocked.
 * Done steps are solid with a tick, the current one is lit and carries its
 * detail (tracking, countdown), upcoming ones are hollow; each also says its
 * state in words for screen readers.
 */
import { Check, ExternalLink } from "lucide-react";

import { dayDate } from "@/components/ugc/shared/format";
import type { UgcTimelineStep } from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

const BLURB: Partial<Record<UgcTimelineStep["id"], string>> = {
  approved: "You're in the crew.",
  packed: "We're packing your Bobo + Eclipse can keychain.",
  shipped: "On its way to you.",
  delivered: "Unbox it on camera if you can.",
  "content-due": "Film the shot list and upload here.",
  submitted: "The team is reviewing your upload.",
  "content-approved": "Post it with #ad, then paste your live link.",
  posted: "You're live. Thank you!",
  perk: "Your perk is waiting on the Perks page.",
};

export function TimelineSummary({ steps }: { steps: UgcTimelineStep[] }) {
  const at = Math.max(
    0,
    steps.findIndex((s) => s.state === "current"),
  );
  const allDone = steps.every((s) => s.state === "done");
  const idx = allDone ? steps.length - 1 : at;
  return (
    <div>
      <p className="flex items-baseline gap-1.5 text-xs text-muted-foreground">
        <span className="tabular-nums">
          Step {idx + 1} of {steps.length}
        </span>
        <span aria-hidden>·</span>
        <span className="truncate font-medium text-foreground">{steps[idx]?.label}</span>
      </p>
      <ol className="mt-2 flex gap-1" aria-hidden>
        {steps.map((s) => (
          <li
            key={s.id}
            className={cn(
              "h-1.5 min-w-0 flex-1 rounded-full",
              s.state === "done" && "bg-[linear-gradient(90deg,#19affe,#3fe6e0)]",
              s.state === "current" && "bg-[#3fe6e0]/50 ring-2 ring-[#3fe6e0]/30",
              s.state === "upcoming" && "bg-white/[0.08]",
            )}
          />
        ))}
      </ol>
    </div>
  );
}

export function UgcTimeline({
  steps,
  className,
}: {
  steps: UgcTimelineStep[];
  className?: string;
}) {
  return (
    <ol className={cn("relative", className)} aria-label="Your progress">
      {steps.map((s, i) => {
        const done = s.state === "done";
        const here = s.state === "current";
        const last = i === steps.length - 1;
        return (
          <li key={s.id} className="relative flex gap-3.5 pb-1 last:pb-0">
            {!last ? (
              <span
                aria-hidden
                className={cn(
                  "absolute top-8 bottom-0 left-[15px] w-0.5 rounded-full",
                  done ? "bg-[linear-gradient(180deg,#3fe6e0,#19affe)]" : "bg-white/[0.08]",
                )}
              />
            ) : null}
            <span
              className={cn(
                "relative z-10 mt-1 grid size-8 shrink-0 place-items-center rounded-full border-2",
                done && "border-transparent bg-[#3fe6e0] text-[#04211f]",
                here && "border-[#3fe6e0] bg-[#05080a] shadow-[0_0_0_5px_rgb(63_230_224/0.12)]",
                !done && !here && "border-white/15 bg-[#05080a]",
              )}
            >
              {done ? (
                <Check className="size-4" strokeWidth={3} aria-hidden />
              ) : (
                <span
                  aria-hidden
                  className={cn(
                    "size-2.5 rounded-full",
                    here ? "bg-[#3fe6e0] motion-safe:animate-pulse" : "bg-white/20",
                  )}
                />
              )}
            </span>
            <div
              className={cn(
                "min-w-0 flex-1 py-2.5",
                here &&
                  "my-1 rounded-2xl border border-[#3fe6e0]/30 bg-[linear-gradient(90deg,rgb(63_230_224/0.1),rgb(63_230_224/0.02))] px-3.5 py-3",
              )}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <h3
                  className={cn(
                    "text-[15px] font-medium",
                    !done && !here && "text-muted-foreground",
                    here && "font-semibold",
                  )}
                >
                  {s.label}
                  <span className="sr-only">
                    {done ? " (done)" : here ? " (you are here)" : " (coming up)"}
                  </span>
                </h3>
                {s.at && (done || s.id === "content-due") ? (
                  <time
                    dateTime={new Date(s.at).toISOString()}
                    suppressHydrationWarning
                    className="text-xs text-muted-foreground tabular-nums"
                  >
                    {s.id === "content-due" && !done ? `Due ${dayDate(s.at)}` : dayDate(s.at)}
                  </time>
                ) : null}
              </div>
              {here && BLURB[s.id] ? (
                <p className="mt-1 text-sm leading-relaxed text-[#c9d1d8]">{BLURB[s.id]}</p>
              ) : null}
              {s.detail && (here || s.href) ? (
                <p
                  className={cn(
                    "mt-1 text-xs break-words tabular-nums [overflow-wrap:anywhere]",
                    s.id === "content-due" && /overdue/.test(s.detail)
                      ? "text-rose-300"
                      : "text-[#bff7f4]",
                  )}
                >
                  {s.detail}
                </p>
              ) : null}
              {s.href ? (
                <a
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[#3fe6e0]/35 bg-[#3fe6e0]/[0.07] px-3 text-xs font-medium text-[#bff7f4] transition-colors hover:border-[#3fe6e0]/70 focus-visible:outline-2 focus-visible:outline-[#3fe6e0]"
                >
                  Track package <ExternalLink className="size-3.5" aria-hidden />
                  <span className="sr-only">(opens the carrier's site)</span>
                </a>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
