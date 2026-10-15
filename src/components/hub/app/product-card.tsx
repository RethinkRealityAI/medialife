/**
 * A product as a compact card (Products grid) and as a slim card (the board).
 * Both answer three questions at a glance — where is it, who is it waiting on,
 * and when does it go on sale (or, once live, what has it earned) — and
 * nothing else: the detail lives on the product's page.
 */
import { Link } from "@tanstack/react-router";
import { Clock, Hand, Sparkles } from "lucide-react";

import { lift, surface } from "@/components/partner/ui";
import { SKUS, compact, money, shortDate, stageOf } from "@/lib/hub/model";
import { cn } from "@/lib/utils";

import { GoChip } from "./look";
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
  className,
}: {
  product: Pick<WsProduct, "stage" | "waitingOn" | "proofs">;
  short?: boolean;
  className?: string;
}) {
  if (product.stage === "live") {
    return (
      <Pill tone="live" icon={Sparkles} className={className}>
        On sale
      </Pill>
    );
  }
  if (waitingOnYou(product)) {
    return (
      <Pill tone="watch" icon={Hand} className={className}>
        {short ? "You" : "Waiting on you"}
      </Pill>
    );
  }
  return (
    <Pill tone="muted" icon={Clock} className={className}>
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
  const yours = waitingOnYou(p);
  return (
    <li className="min-w-0">
      <Link
        to="/creator-hub/products/$productId"
        params={{ productId: p.id }}
        className={cn(
          surface,
          lift,
          "group flex h-full flex-col overflow-hidden",
          yours && "border-amber-300/35",
        )}
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-[var(--partner-ink)]">
          <img
            src={productImage(p)}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.05] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
          <span
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-[#0b0d1a]/80 via-transparent to-transparent"
          />
          <span className="glass absolute top-2.5 left-2.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium text-white">
            {SKUS[p.sku].short}
          </span>
          <span className="absolute bottom-2.5 left-2.5 max-w-[calc(100%-1.25rem)]">
            <WaitingChip product={p} className="bg-black/65 backdrop-blur-md" />
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-2.5 p-3.5">
          <h3 className="truncate font-medium">{p.name}</h3>
          <StageTrack stage={p.stage} hideLabel />
          <div className="flex min-w-0 items-center justify-between gap-2">
            <StageChip stage={p.stage} />
          </div>
          <div className="mt-auto flex items-end justify-between gap-2">
            <span className="min-w-0 text-xs tabular-nums">
              {p.stage === "live" ? (
                <>
                  <span className="block truncate font-semibold text-foreground">
                    {money(p.sales.earned, currency)}
                  </span>
                  <span className="block truncate text-muted-foreground">
                    {compact(p.sales.units)} sold
                  </span>
                </>
              ) : (
                <>
                  <span className="block truncate text-muted-foreground">On sale</span>
                  <span className="block truncate font-semibold text-foreground">
                    {p.eta ? shortDate(p.eta) : "Date TBC"}
                  </span>
                </>
              )}
            </span>
            <GoChip className="size-7" />
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
        className={cn(
          surface,
          lift,
          "group flex items-center gap-3 rounded-xl p-2.5",
          waitingOnYou(p) && "border-amber-300/35",
        )}
      >
        <ProductThumb product={p} className="size-14 rounded-lg border-white/10" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="truncate text-sm font-medium">{p.name}</div>
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
