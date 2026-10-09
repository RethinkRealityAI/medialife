/**
 * Where a product is in the seven-stage pipeline.
 *
 * StageTrack is the compact form for rows and cards: a sentence ("Stage 3 of 7
 * · Design approval") over a thin segmented bar. Done segments are solid, the
 * current one is solid with a ring, upcoming ones are hollow — so the state is
 * readable without colour, and the sentence says it in words.
 *
 * StageTimeline is the full vertical form for a product's page.
 */
import { Check } from "lucide-react";

import { STAGES, shortDate, stageIndex, type Product, type StageId } from "@/lib/hub/model";
import { cn } from "@/lib/utils";

export function StageTrack({
  stage,
  className,
  hideLabel = false,
}: {
  stage: StageId;
  className?: string;
  hideLabel?: boolean;
}) {
  const at = stageIndex(stage);
  const live = stage === "live";
  const current = STAGES[at];

  return (
    <div className={cn("min-w-0", className)}>
      {!hideLabel ? (
        <p className="mb-2 flex min-w-0 items-baseline gap-1.5 text-xs text-muted-foreground">
          {live ? (
            <span className="font-medium text-emerald-300">Live · on sale</span>
          ) : (
            <>
              <span className="shrink-0 tabular-nums">
                Stage {at + 1} of {STAGES.length}
              </span>
              <span aria-hidden>·</span>
              <span className="truncate font-medium text-foreground">{current.name}</span>
            </>
          )}
        </p>
      ) : null}
      <ol className="flex gap-1" aria-label="Production progress">
        {STAGES.map((s, i) => {
          const done = i < at || live;
          const here = i === at && !live;
          return (
            <li
              key={s.id}
              title={s.name}
              className={cn(
                "h-1.5 min-w-0 flex-1 rounded-full",
                done && (live ? "bg-emerald-400/80" : "bg-primary"),
                here && "bg-primary/70 ring-2 ring-primary/35 ring-offset-1 ring-offset-background",
                !done && !here && "border border-white/15 bg-transparent",
              )}
            >
              <span className="sr-only">
                {s.name}: {done ? "done" : here ? "in progress" : "not started"}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Every stage, top to bottom, with the dates from the product's history. */
export function StageTimeline({
  product,
}: {
  product: Pick<Product, "stage" | "history" | "eta" | "waitingOn">;
}) {
  const at = stageIndex(product.stage);
  const live = product.stage === "live";
  const reached = new Map<StageId, number>();
  for (const h of product.history) if (!reached.has(h.stage)) reached.set(h.stage, h.at);

  return (
    <ol className="relative">
      {STAGES.map((s, i) => {
        const done = i < at || (live && i === at);
        const here = i === at && !live;
        const last = i === STAGES.length - 1;
        const when = reached.get(s.id);
        const owner =
          s.owner === "Both"
            ? "You and MEDIALIFE"
            : here && product.waitingOn === "creator"
              ? "You"
              : here && product.waitingOn === "medialife"
                ? "MEDIALIFE"
                : s.owner;
        return (
          <li key={s.id} className="relative flex gap-4 pb-6 last:pb-0">
            {!last ? (
              <span
                aria-hidden
                className={cn(
                  "absolute top-7 bottom-0 left-[13px] w-0.5 rounded-full",
                  i < at ? "bg-primary" : "bg-border",
                )}
              />
            ) : null}
            <span
              className={cn(
                "relative z-10 grid grid-cols-1 size-7 shrink-0 place-items-center rounded-full border-2",
                done &&
                  (live
                    ? "border-emerald-400 bg-emerald-400 text-background"
                    : "border-primary bg-primary text-background"),
                here && "border-primary bg-background",
                !done && !here && "border-border bg-background",
              )}
            >
              {done ? (
                <Check className="size-3.5" strokeWidth={3} aria-hidden />
              ) : (
                <span
                  aria-hidden
                  className={cn(
                    "size-2 rounded-full",
                    here ? "bg-primary motion-safe:animate-pulse" : "bg-muted-foreground/40",
                  )}
                />
              )}
            </span>
            <div
              className={cn(
                "min-w-0 flex-1 pt-0.5",
                here && "-mt-1 rounded-lg border border-primary/40 bg-primary/[0.07] p-3",
              )}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h3
                  className={cn("text-sm font-medium", !done && !here && "text-muted-foreground")}
                >
                  {s.name}
                  <span className="sr-only">
                    {done ? " (done)" : here ? " (current stage)" : " (coming up)"}
                  </span>
                </h3>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {done && when
                    ? shortDate(when)
                    : here
                      ? when
                        ? `Since ${shortDate(when)}`
                        : "In progress"
                      : s.id === "live" && product.eta
                        ? `Expected ${shortDate(product.eta)}`
                        : ""}
                </span>
              </div>
              {here || (live && s.id === "live") ? (
                <>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.blurb}</p>
                  {!live ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Who's on it: <span className="font-medium text-foreground">{owner}</span>
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
