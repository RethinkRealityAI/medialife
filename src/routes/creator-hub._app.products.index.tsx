import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Factory,
  Kanban,
  LayoutGrid,
  Layers,
  Package,
  Palette,
  Search,
  Store,
  type LucideIcon,
} from "lucide-react";
import { z } from "zod";

import { ART, Tile, segGroup, segItem, surface, type Tone } from "@/components/hub/app/look";
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

const PHASE_LOOK: Record<PhaseId | "all", { icon: LucideIcon; tone: Tone }> = {
  all: { icon: Layers, tone: "ice" },
  design: { icon: Palette, tone: "violet" },
  making: { icon: Factory, tone: "blue" },
  live: { icon: Store, tone: "mint" },
};

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
        <PageHeader
          image={ART.figure}
          imageClassName="object-[50%_42%]"
          eyebrow="Products"
          title="Your merch, brief to on sale"
        />
        <EmptyState
          icon={Package}
          title="Your products will appear here"
          className="mt-4"
          image={ART.tee}
        >
          After your welcome call, your manager sets up your first product with you. Follow it here
          from brief to on sale.
        </EmptyState>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        image={ART.figure}
        imageClassName="object-[50%_42%]"
        eyebrow="Products"
        title="Your merch, brief to on sale"
        description={`${ws.products.length} in your program · ${count("live")} on sale${
          base.some((p) => p.waitingOn === "creator") ? " · some need you" : ""
        }`}
        actions={
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => v && set({ view: v as "grid" | "board" })}
            aria-label="Layout"
            className={segGroup}
          >
            <ToggleGroupItem value="grid" className={segItem}>
              <LayoutGrid className="size-4" aria-hidden /> Grid
            </ToggleGroupItem>
            <ToggleGroupItem value="board" className={segItem}>
              <Kanban className="size-4" aria-hidden /> Board
            </ToggleGroupItem>
          </ToggleGroup>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {view === "grid" ? (
          <div
            role="group"
            aria-label="Filter by phase"
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden"
          >
            {(
              [
                { id: undefined, label: "All", n: base.length },
                ...PHASES.map((p) => ({ id: p.id, label: p.label, n: count(p.id) })),
              ] as Array<{ id: PhaseId | undefined; label: string; n: number }>
            ).map((c) => {
              const look = PHASE_LOOK[c.id ?? "all"];
              const on = phase === c.id;
              return (
                <button
                  key={c.label}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set({ phase: c.id })}
                  className={cn(
                    surface,
                    "inline-flex h-11 shrink-0 items-center gap-2 rounded-full py-1 pr-3.5 pl-1.5 text-sm whitespace-nowrap transition-[border-color,background] focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none",
                    on
                      ? "border-[var(--partner)]/55 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--partner)_22%,transparent),color-mix(in_oklab,var(--partner-2)_16%,transparent))] text-foreground"
                      : "text-muted-foreground hover:border-white/20 hover:text-foreground",
                  )}
                >
                  <Tile icon={look.icon} tone={look.tone} size="sm" className="rounded-full" />
                  {c.label}
                  <span className="rounded-full bg-white/[0.08] px-1.5 text-xs text-foreground tabular-nums">
                    {c.n}
                  </span>
                </button>
              );
            })}
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
                className="h-10 rounded-full pl-8"
              />
            </label>
          ) : null}
          {campaigns.length > 1 ? (
            <select
              aria-label="Campaign"
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              className="h-10 min-w-0 rounded-full border border-white/10 bg-white/[0.04] px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
            const look = PHASE_LOOK[ph.id];
            return (
              <section
                key={ph.id}
                aria-labelledby={`col-${ph.id}`}
                className={cn(surface, "w-[82%] shrink-0 snap-start p-3 @4xl/inset:w-auto")}
              >
                <h2
                  id={`col-${ph.id}`}
                  className="mb-3 flex items-center gap-2.5 px-1 text-sm font-semibold"
                >
                  <Tile icon={look.icon} tone={look.tone} size="sm" />
                  {ph.label}
                  <span className="ml-auto rounded-full bg-white/[0.08] px-2 text-xs text-muted-foreground tabular-nums">
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
                  <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-muted-foreground">
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
        <EmptyState icon={Package} title="Nothing here" className="mt-5" image={ART.sticker}>
          {phase === "live"
            ? "None of these products is on sale yet. They'll show here the day they go live."
            : "No products match. Try another filter."}
        </EmptyState>
      )}
    </Page>
  );
}
