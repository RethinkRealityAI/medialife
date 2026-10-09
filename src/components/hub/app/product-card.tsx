/**
 * A product, as a row on Home and as a card on the Products page. Both answer
 * the same three questions at a glance: where is it, who is it waiting on, and
 * when does it go on sale (or, once it's live, what has it earned).
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight, Clock, Hand, Sparkles } from "lucide-react";

import { SKUS, compact, money, shortDate } from "@/lib/hub/model";
import { cn } from "@/lib/utils";

import { StageTrack } from "./stage-track";
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

export function WaitingChip({
  product,
}: {
  product: Pick<WsProduct, "stage" | "waitingOn" | "proofs">;
}) {
  if (product.stage === "live") {
    return (
      <Pill tone="live" icon={Sparkles}>
        On sale
      </Pill>
    );
  }
  const proof = latestProof(product);
  if (product.waitingOn === "creator" || proof?.decision === "pending") {
    return (
      <Pill tone="watch" icon={Hand}>
        Waiting on you
      </Pill>
    );
  }
  return (
    <Pill tone="muted" icon={Clock}>
      Waiting on MEDIALIFE
    </Pill>
  );
}

export function ProductOutcome({
  product,
  currency,
  align = "right",
}: {
  product: WsProduct;
  currency: string;
  align?: "left" | "right";
}) {
  if (product.stage === "live") {
    return (
      <div className={cn("text-sm", align === "right" && "@3xl:text-right")}>
        <div className="font-medium tabular-nums">
          {money(product.sales.earned, currency)} earned
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {compact(product.sales.units)} sold · {compact(product.scans)} scans
        </div>
      </div>
    );
  }
  return (
    <div className={cn("text-sm", align === "right" && "@3xl:text-right")}>
      <div className="text-xs text-muted-foreground">Expected on sale</div>
      <div className="font-medium tabular-nums">
        {product.eta ? shortDate(product.eta) : "Date to be set"}
      </div>
    </div>
  );
}

/** One row of the pipeline list on Home. */
export function ProductRow({ product, currency }: { product: WsProduct; currency: string }) {
  return (
    <li className="@container">
      <Link
        to="/creator-hub/products/$productId"
        params={{ productId: product.id }}
        className="group grid grid-cols-1 gap-4 rounded-xl border border-border bg-white/[0.02] p-4 transition-colors hover:border-primary/50 hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none @3xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_9rem] @3xl:items-center @3xl:gap-6"
      >
        <div className="flex min-w-0 items-center gap-3">
          <ProductThumb product={product} className="size-14" />
          <div className="min-w-0">
            <div className="truncate font-medium group-hover:text-primary">{product.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {SKUS[product.sku].short}
              {product.campaign ? ` · ${product.campaign}` : ""}
            </div>
          </div>
        </div>
        <div className="min-w-0 space-y-3">
          <StageTrack stage={product.stage} />
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
            <WaitingChip product={product} />
            {product.stage !== "live" && product.nextStep ? (
              <span className="min-w-0 text-sm text-muted-foreground">{product.nextStep}</span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3 @3xl:block @3xl:border-0 @3xl:pt-0">
          <ProductOutcome product={product} currency={currency} />
          <ArrowRight
            className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary @3xl:hidden"
            aria-hidden
          />
        </div>
      </Link>
    </li>
  );
}

/** A card in the Products grid. */
export function ProductCard({ product, currency }: { product: WsProduct; currency: string }) {
  return (
    <li className="@container">
      <Link
        to="/creator-hub/products/$productId"
        params={{ productId: product.id }}
        className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-white/[0.02] transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <div className="relative aspect-[16/9] overflow-hidden bg-white/[0.04] @sm:aspect-[4/3]">
          <img
            src={productImage(product)}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.03]"
          />
          <span className="absolute top-3 left-3 rounded-full border border-white/15 bg-background/80 px-2.5 py-0.5 text-xs backdrop-blur">
            {SKUS[product.sku].short}
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-4 p-4">
          <div className="min-w-0">
            <h3 className="truncate font-medium group-hover:text-primary">{product.name}</h3>
            <p className="truncate text-xs text-muted-foreground">
              {product.campaign || "No campaign yet"}
            </p>
          </div>
          <StageTrack stage={product.stage} />
          <div className="mt-auto flex flex-wrap items-end justify-between gap-3">
            <WaitingChip product={product} />
            <ProductOutcome product={product} currency={currency} align="left" />
          </div>
        </div>
      </Link>
    </li>
  );
}
