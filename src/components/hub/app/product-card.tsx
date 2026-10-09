/**
 * A product as a compact card (Products grid) and as a slim card (the board).
 * Both answer three questions at a glance — where is it, who is it waiting on,
 * and when does it go on sale (or, once live, what has it earned) — and
 * nothing else: the detail lives on the product's page.
 */
import { Link } from "@tanstack/react-router";
import { Clock, Hand, Sparkles } from "lucide-react";

import { SKUS, compact, money, shortDate, stageOf } from "@/lib/hub/model";
import { cn } from "@/lib/utils";

import { STAGE_COLORS, StageTrack } from "./stage-track";
import { Pill } from "./ui";
import { latestProof, productImage, type WsProduct } from "./workspace";

export function ProductThumb({
  product,
  className,
}: {
  product: Pick<WsProduct, "creatorId" | "imageFileId" | "sku">;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "block shrink-0 overflow-hidden rounded-lg border border-border bg-white/[0.04]",
        className,
      )}
    >
      <img src={productImage(product)} alt="" loading="lazy" className="size-full object-cover" />
    </span>
  );
}

export const waitingOnYou = (p: Pick<WsProduct, "stage" | "waitingOn" | "proofs">) =>
  p.stage !== "live" && (p.waitingOn === "creator" || latestProof(p)?.decision === "pending");

export function WaitingChip({
  product,
  short = false,
}: {
  product: Pick<WsProduct, "stage" | "waitingOn" | "proofs">;
  short?: boolean;
}) {
  if (product.stage === "live") {
    return (
      <Pill tone="live" icon={Sparkles}>
        On sale
      </Pill>
    );
  }
  if (waitingOnYou(product)) {
    return (
      <Pill tone="watch" icon={Hand}>
        {short ? "You" : "Waiting on you"}
      </Pill>
    );
  }
  return (
    <Pill tone="muted" icon={Clock}>
      {short ? "MEDIALIFE" : "Waiting on MEDIALIFE"}
    </Pill>
  );
}

export function StageChip({ stage }: { stage: WsProduct["stage"] }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 text-xs text-muted-foreground">
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ background: STAGE_COLORS[stage] }}
      />
      <span className="truncate">{stageOf(stage).name}</span>
    </span>
  );
}

function Outcome({ product: p, currency }: { product: WsProduct; currency: string }) {
  return p.stage === "live" ? (
    <span className="text-xs tabular-nums">
      <span className="font-medium text-foreground">{money(p.sales.earned, currency)}</span>
      <span className="text-muted-foreground"> · {compact(p.sales.units)} sold</span>
    </span>
  ) : (
    <span className="text-xs text-muted-foreground tabular-nums">
      On sale {p.eta ? <span className="text-foreground">{shortDate(p.eta)}</span> : "date TBC"}
    </span>
  );
}

/** A card in the Products grid. */
export function ProductCard({ product: p, currency }: { product: WsProduct; currency: string }) {
  return (
    <li className="min-w-0">
      <Link
        to="/creator-hub/products/$productId"
        params={{ productId: p.id }}
        className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-white/[0.02] transition-[border-color,transform] hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-safe:hover:-translate-y-0.5"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-white/[0.04]">
          <img
            src={productImage(p)}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.04]"
          />
          <span className="absolute top-2 left-2 rounded-full border border-white/15 bg-background/80 px-2 py-0.5 text-[11px] backdrop-blur">
            {SKUS[p.sku].short}
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-2 p-3">
          <h3 className="truncate text-sm font-medium group-hover:text-primary">{p.name}</h3>
          <StageTrack stage={p.stage} hideLabel />
          <div className="flex min-w-0 items-center justify-between gap-2">
            <StageChip stage={p.stage} />
            {p.stage !== "live" ? (
              <>
                <span className="hidden @[13rem]:inline-flex">
                  <WaitingChip product={p} short />
                </span>
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full border @[13rem]:hidden",
                    waitingOnYou(p)
                      ? "border-amber-400/50 bg-amber-400/10 text-amber-300"
                      : "border-border text-muted-foreground",
                  )}
                  title={waitingOnYou(p) ? "Waiting on you" : "Waiting on MEDIALIFE"}
                >
                  {waitingOnYou(p) ? (
                    <Hand className="size-3.5" aria-hidden />
                  ) : (
                    <Clock className="size-3.5" aria-hidden />
                  )}
                  <span className="sr-only">
                    {waitingOnYou(p) ? "Waiting on you" : "Waiting on MEDIALIFE"}
                  </span>
                </span>
              </>
            ) : null}
          </div>
          <div className="mt-auto truncate">
            <Outcome product={p} currency={currency} />
          </div>
        </div>
      </Link>
    </li>
  );
}

/** A slim card for the board columns. */
export function BoardCard({ product: p, currency }: { product: WsProduct; currency: string }) {
  return (
    <li>
      <Link
        to="/creator-hub/products/$productId"
        params={{ productId: p.id }}
        className="group flex items-center gap-3 rounded-lg border border-border bg-background/60 p-2.5 transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ProductThumb product={p} className="size-12 rounded-md" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="truncate text-sm font-medium group-hover:text-primary">{p.name}</div>
          <div className="flex min-w-0 items-center gap-2">
            <StageChip stage={p.stage} />
            {waitingOnYou(p) ? (
              <span className="flex items-center gap-1 text-xs text-amber-300">
                <Hand className="size-3" aria-hidden /> you
              </span>
            ) : null}
          </div>
          <div className="truncate">
            <Outcome product={p} currency={currency} />
          </div>
        </div>
      </Link>
    </li>
  );
}
