import { CircleCheck, Loader2, ShoppingBag, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { adminDismissUnmatched } from "@/lib/hub/admin.functions";
import { cn } from "@/lib/utils";

import { formatDateTime } from "../format";
import { EmptyState, Panel, PanelTitle, Tag, surface } from "../kit";
import type { UnmatchedOrder } from "./types";
import { ghostBtn, useRun } from "./ui";

/** Shopify orders whose lines matched no product: nobody earned on them yet. */
export function UnmatchedPanel({ orders }: { orders: UnmatchedOrder[] }) {
  const { pending, run } = useRun();
  return (
    <Panel id="unmatched" className={cn(orders.length && "border-amber-400/30")}>
      <PanelTitle
        className="p-4 sm:p-5"
        icon={ShoppingBag}
        tone="amber"
        title={`Unmatched orders${orders.length ? ` (${orders.length})` : ""}`}
        sub="Shopify orders that matched no product. Add the Shopify product id or SKU to the right product and future orders will match."
      />
      {!orders.length ? (
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          <EmptyState icon={CircleCheck} tone="mint" title="All matched">
            Every Shopify order was credited to a product.
          </EmptyState>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-2 px-4 pb-4 sm:px-5 sm:pb-5">
          {orders.map((o) => (
            <li key={o.id} className={cn(surface, "flex items-start gap-3 rounded-xl p-3 sm:p-4")}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold tabular-nums">#{o.number.replace(/^#/, "")}</span>
                  <Tag>{o.channel}</Tag>
                  <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                    {formatDateTime(o.at)}
                  </span>
                </div>
                <ul className="mt-2 space-y-1 text-xs">
                  {o.lines.map((l, i) => (
                    <li key={i} className="flex flex-wrap gap-x-2">
                      <span>
                        {l.qty} × {l.title || "Untitled item"}
                      </span>
                      {l.sku ? (
                        <span className="mono text-muted-foreground">SKU {l.sku}</span>
                      ) : null}
                      {l.productId ? (
                        <span className="mono text-muted-foreground">product {l.productId}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className={cn("text-muted-foreground", ghostBtn)}
                disabled={pending === o.id}
                onClick={() =>
                  void run(o.id, () => adminDismissUnmatched({ data: { id: o.id } }), "Dismissed")
                }
              >
                {pending === o.id ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <X aria-hidden />
                )}
                Dismiss
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
