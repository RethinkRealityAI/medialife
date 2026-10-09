import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Package } from "lucide-react";

import { ProductCard } from "@/components/hub/app/product-card";
import { EmptyState, Page, PageHeader } from "@/components/hub/app/ui";
import { pipelineOrder, useWorkspace } from "@/components/hub/app/workspace";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/creator-hub/_app/products/")({
  head: () => ({ meta: [{ title: "Products · Creator Hub | MEDIALIFE" }] }),
  component: Products,
});

type Filter = "all" | "production" | "live";

function Products() {
  const ws = useWorkspace();
  const [filter, setFilter] = useState<Filter>("all");
  const [campaign, setCampaign] = useState<string>("all");

  const campaigns = useMemo(
    () => [...new Set(ws.products.map((p) => p.campaign).filter(Boolean))],
    [ws.products],
  );
  const counts = {
    all: ws.products.length,
    production: ws.products.filter((p) => p.stage !== "live").length,
    live: ws.products.filter((p) => p.stage === "live").length,
  };

  const shown = ws.products
    .filter((p) =>
      filter === "all" ? true : filter === "live" ? p.stage === "live" : p.stage !== "live",
    )
    .filter((p) => campaign === "all" || p.campaign === campaign)
    .sort(pipelineOrder);

  return (
    <Page>
      <PageHeader
        title="Products"
        description="Every product in your program, where it is, and what it's earned."
      />

      {ws.products.length ? (
        <>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <ToggleGroup
              type="single"
              value={filter}
              onValueChange={(v) => v && setFilter(v as Filter)}
              aria-label="Show products"
              className="w-full justify-start rounded-lg border border-border bg-white/[0.02] p-1 sm:w-auto"
            >
              {(
                [
                  ["all", "All"],
                  ["production", "In production"],
                  ["live", "Live"],
                ] as Array<[Filter, string]>
              ).map(([v, label]) => (
                <ToggleGroupItem
                  key={v}
                  value={v}
                  className="h-9 flex-1 gap-1.5 rounded-md px-2.5 text-sm whitespace-nowrap data-[state=on]:bg-white/10 data-[state=on]:text-foreground sm:flex-none"
                >
                  {label}
                  <span className="text-xs text-muted-foreground tabular-nums">{counts[v]}</span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            {campaigns.length > 1 ? (
              <div className="flex items-center gap-2">
                <label htmlFor="campaign" className="text-sm text-muted-foreground">
                  Campaign
                </label>
                <select
                  id="campaign"
                  value={campaign}
                  onChange={(e) => setCampaign(e.target.value)}
                  className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:flex-none"
                >
                  <option value="all">All campaigns</option>
                  {campaigns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          <p className="sr-only" aria-live="polite">
            Showing {shown.length} product{shown.length === 1 ? "" : "s"}
          </p>

          {shown.length ? (
            <ul
              className={cn(
                "mt-6 grid grid-cols-1 gap-4",
                "grid-cols-1 @xl/inset:grid-cols-2 @5xl/inset:grid-cols-3",
              )}
            >
              {shown.map((p) => (
                <ProductCard key={p.id} product={p} currency={ws.earnings.currency} />
              ))}
            </ul>
          ) : (
            <EmptyState icon={Package} title="Nothing here" className="mt-6">
              {filter === "live"
                ? "None of these products is on sale yet. They'll show here the day they go live."
                : "No products match. Try another filter."}
            </EmptyState>
          )}
        </>
      ) : (
        <EmptyState icon={Package} title="Your products will appear here" className="mt-8">
          Once you're approved, your manager sets up your first product with you: what it is, the
          look, and what scanning it unlocks. From then on you can follow it here from brief to on
          sale.
        </EmptyState>
      )}
    </Page>
  );
}
