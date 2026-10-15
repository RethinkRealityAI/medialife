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
          <li key={s.id} className="relative flex gap-4 pb-4 last:pb-0">
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

/**
 * Colour per stage: an ordinal blue ramp, dark to light as a product moves
 * through the pipeline, and green once it's on sale. Ordered data gets an
 * ordered ramp; the legend always names the stage, so colour is never alone.
 */
export const STAGE_COLORS: Record<StageId, string> = {
  brief: "#184f95",
  artwork: "#1c5cab",
  approval: "#256abf",
  sampling: "#2a78d6",
  production: "#3987e5",
  shipping: "#6da7ec",
  live: "#34d399",
};

/** How many products sit in each stage, as one stacked bar with a legend. */
export function StageDistribution({
  stages,
  className,
}: {
  stages: StageId[];
  className?: string;
}) {
  const counts = STAGES.map((s) => ({ ...s, n: stages.filter((x) => x === s.id).length }));
  const total = stages.length || 1;
  return (
    <figure className={cn("m-0", className)}>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {counts
          .filter((c) => c.n)
          .map((c) => (
            <div
              key={c.id}
              title={`${c.name}: ${c.n}`}
              className="h-full first:rounded-l-full last:rounded-r-full motion-safe:transition-[flex-grow] motion-safe:duration-700"
              style={{ flexGrow: c.n / total, flexBasis: 0, background: STAGE_COLORS[c.id] }}
            />
          ))}
      </div>
      <figcaption>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
          {counts.map((c) => (
            <li
              key={c.id}
              className={cn("flex items-center gap-1.5", !c.n && "text-muted-foreground/60")}
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-[3px]"
                style={{ background: c.n ? STAGE_COLORS[c.id] : "var(--color-border)" }}
              />
              <span>{c.name}</span>
              <span className="font-medium tabular-nums">{c.n}</span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
