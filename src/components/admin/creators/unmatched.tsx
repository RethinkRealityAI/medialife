import { Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { adminDismissUnmatched } from "@/lib/hub/admin.functions";
import { cn } from "@/lib/utils";

import { formatDateTime } from "../format";
import { Panel, PanelTitle } from "../kit";
import type { UnmatchedOrder } from "./types";
import { ghostBtn, useRun } from "./ui";

/** Shopify orders whose lines matched no product: nobody earned on them yet. */
export function UnmatchedPanel({ orders }: { orders: UnmatchedOrder[] }) {
  const { pending, run } = useRun();
  return (
    <Panel id="unmatched" className={cn(orders.length && "border-amber-400/30")}>
      <PanelTitle
        className="p-4 sm:p-5"
        title={`Unmatched orders${orders.length ? ` (${orders.length})` : ""}`}
        sub="Orders from Shopify that matched no product. Add the Shopify product id or SKU to the right product; future orders will match."
      />
      {!orders.length ? (
        <p className="border-t border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Every order matched a product.
        </p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {orders.map((o) => (
            <li key={o.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">#{o.number.replace(/^#/, "")}</span>
                  <span className="text-xs text-muted-foreground">{o.channel}</span>
                  <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                    {formatDateTime(o.at)}
                  </span>
                </div>
                <ul className="mt-1 space-y-0.5 text-xs">
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
