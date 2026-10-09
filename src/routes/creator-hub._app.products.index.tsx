import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Kanban, LayoutGrid, Package, Search } from "lucide-react";
import { z } from "zod";

import { BoardCard, ProductCard } from "@/components/hub/app/product-card";
import { EmptyState, Page, PageHeader } from "@/components/hub/app/ui";
import {
  PHASES,
  phaseOf,
  pipelineOrder,
  useWorkspace,
  type PhaseId,
} from "@/components/hub/app/workspace";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/creator-hub/_app/products/")({
  validateSearch: z.object({
    view: z.enum(["grid", "board"]).optional().catch(undefined),
    phase: z.enum(["design", "making", "live"]).optional().catch(undefined),
  }),
  head: () => ({ meta: [{ title: "Products · Creator Hub | MEDIALIFE" }] }),
  component: Products,
});

function Products() {
  const ws = useWorkspace();
  const { view = "grid", phase } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [campaign, setCampaign] = useState("all");
  const [q, setQ] = useState("");
  const cur = ws.earnings.currency;

  const campaigns = useMemo(
    () => [...new Set(ws.products.map((p) => p.campaign).filter(Boolean))],
    [ws.products],
  );
  const searchable = ws.products.length > 6;
  const base = ws.products
    .filter((p) => campaign === "all" || p.campaign === campaign)
    .filter(
      (p) => !q.trim() || `${p.name} ${p.campaign}`.toLowerCase().includes(q.trim().toLowerCase()),
    )
    .sort(pipelineOrder);
  const shown = phase && view === "grid" ? base.filter((p) => phaseOf(p.stage) === phase) : base;
  const count = (id: PhaseId) => base.filter((p) => phaseOf(p.stage) === id).length;

  const set = (s: { view?: "grid" | "board"; phase?: PhaseId }) =>
    navigate({ search: (prev) => ({ ...prev, ...s }), replace: true, resetScroll: false });

  if (!ws.products.length) {
    return (
      <Page>
        <PageHeader title="Products" />
        <EmptyState icon={Package} title="Your products will appear here" className="mt-6">
          Once you're approved, your manager sets up your first product with you: what it is, the
          look, and what scanning it unlocks. From then on you can follow it here from brief to on
          sale.
        </EmptyState>
      </Page>
    );
  }

  return (
    <Page className="lg:pt-8">
      <PageHeader
        title="Products"
        description={`${ws.products.length} in your program · ${count("live")} on sale`}
        actions={
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => v && set({ view: v as "grid" | "board" })}
            aria-label="Layout"
            className="rounded-lg border border-border p-1"
          >
            <ToggleGroupItem
              value="grid"
              className="h-8 gap-1.5 rounded-md px-3 text-sm data-[state=on]:bg-white/10 data-[state=on]:text-foreground data-[state=on]:text-foreground"
            >
              <LayoutGrid className="size-4" aria-hidden /> Grid
            </ToggleGroupItem>
            <ToggleGroupItem
              value="board"
              className="h-8 gap-1.5 rounded-md px-3 text-sm data-[state=on]:bg-white/10 data-[state=on]:text-foreground data-[state=on]:text-foreground"
            >
              <Kanban className="size-4" aria-hidden /> Board
            </ToggleGroupItem>
          </ToggleGroup>
        }
      />

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {view === "grid" ? (
          <div role="group" aria-label="Filter by phase" className="flex flex-wrap gap-1.5">
            {(
              [
                { id: undefined, label: "All", n: base.length },
                ...PHASES.map((p) => ({ id: p.id, label: p.label, n: count(p.id) })),
              ] as Array<{ id: PhaseId | undefined; label: string; n: number }>
            ).map((c) => (
              <button
                key={c.label}
                type="button"
                aria-pressed={phase === c.id}
                onClick={() => set({ phase: c.id })}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  phase === c.id
                    ? "border-primary/50 bg-primary/12 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {c.label}
                <span className="text-xs tabular-nums opacity-70">{c.n}</span>
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          {searchable ? (
            <label className="relative min-w-40 flex-1 sm:max-w-56">
              <span className="sr-only">Search products</span>
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search"
                className="h-8 pl-8"
              />
            </label>
          ) : null}
          {campaigns.length > 1 ? (
            <select
              aria-label="Campaign"
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <option value="all">All campaigns</option>
              {campaigns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        Showing {shown.length} product{shown.length === 1 ? "" : "s"}
      </p>

      {view === "board" ? (
        <div className="-mx-4 mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] sm:mx-0 sm:px-0 @4xl/inset:grid @4xl/inset:grid-cols-3 @4xl/inset:overflow-visible">
          {PHASES.map((ph) => {
            const items = base.filter((p) => phaseOf(p.stage) === ph.id);
            return (
              <section
                key={ph.id}
                aria-labelledby={`col-${ph.id}`}
                className="w-[82%] shrink-0 snap-start rounded-xl border border-border bg-white/[0.02] p-3 @4xl/inset:w-auto"
              >
                <h2
                  id={`col-${ph.id}`}
                  className="mb-3 flex items-center justify-between px-1 text-sm font-medium"
                >
                  {ph.label}
                  <span className="rounded-full bg-white/[0.06] px-2 text-xs text-muted-foreground tabular-nums">
                    {items.length}
                  </span>
                </h2>
                {items.length ? (
                  <ul className="space-y-2">
                    {items.map((p) => (
                      <BoardCard key={p.id} product={p} currency={cur} />
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    Nothing here right now
                  </p>
                )}
              </section>
            );
          })}
        </div>
      ) : shown.length ? (
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 @3xl/inset:grid-cols-3 @5xl/inset:grid-cols-4 [&>li]:@container">
          {shown.map((p) => (
            <ProductCard key={p.id} product={p} currency={cur} />
          ))}
        </ul>
      ) : (
        <EmptyState icon={Package} title="Nothing here" className="mt-5">
          {phase === "live"
            ? "None of these products is on sale yet. They'll show here the day they go live."
            : "No products match. Try another filter."}
        </EmptyState>
      )}
    </Page>
  );
}
