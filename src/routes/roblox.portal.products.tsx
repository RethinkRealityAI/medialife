import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";

import { PageHeader, Panel, Pill, Section, type Tone } from "@/components/portal/kit";
import { ACTIVE, ECONOMICS, PRODUCTS, money, pct } from "@/lib/roblox-portal";

export const Route = createFileRoute("/roblox/portal/products")({
  component: Products,
});

const STATUS_LABEL: Record<string, string> = {
  live: "Live",
  sampling: "Sampling",
  design: "In design",
  proposed: "Proposed",
};

/** Live SKUs first, then the ones working toward it. */
const ORDER = ["live", "sampling", "design", "proposed"];

function Products() {
  const sorted = [...PRODUCTS].sort(
    (a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || b.price - a.price,
  );
  const live = PRODUCTS.filter((p) => p.status === "live");
  const committed = PRODUCTS.reduce((n, p) => n + p.unitsCommitted, 0);

  return (
    <>
      <PageHeader
        eyebrow="The pilot / Products"
        title={`The ${ACTIVE.property} assortment.`}
        lede={`Six categories are modelled for the program. This property starts deliberately small — a limited assortment against a defined test period — and widens only where the data supports it.`}
        actions={
          <a
            href="/roblox/creators/#studio"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-5 py-2.5 text-sm font-medium transition-colors hover:border-primary"
          >
            Open the Drop Studio <ExternalLink className="size-3.5" aria-hidden />
          </a>
        }
      />

      <Section className="border-b border-border">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Live SKUs", String(live.length)],
            ["In the assortment", String(PRODUCTS.length)],
            ["Units committed", committed.toLocaleString("en-US")],
            ["Price band", `${money(ECONOMICS.priceFloor)}–${money(ECONOMICS.priceCeiling)}`],
          ].map(([label, value]) => (
            <Panel key={label} className="p-4">
              <div className="mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                {label}
              </div>
              <div className="mt-2 text-2xl font-medium tracking-tight tabular-nums">{value}</div>
            </Panel>
          ))}
        </div>
      </Section>

      <Section>
        <div className="space-y-3">
          {sorted.map((p) => (
            <Panel key={p.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div className="min-w-0 max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h3 className="text-base font-medium tracking-tight">{p.name}</h3>
                    <Pill tone={p.status as Tone}>{STATUS_LABEL[p.status]}</Pill>
                  </div>
                  <p className="mono mt-1 text-[10px] tracking-[0.1em] text-muted-foreground uppercase">
                    {p.category} · {p.sourcing} · {p.leadWeeks} weeks
                  </p>
                  <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{p.note}</p>
                  <p className="mt-2.5 flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="mono shrink-0 tracking-[0.12em] text-primary uppercase">
                      Activation
                    </span>
                    <span>{p.activation}</span>
                  </p>
                </div>

                <dl className="flex shrink-0 gap-6">
                  <div>
                    <dt className="mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                      Price
                    </dt>
                    <dd className="mt-1 text-lg tabular-nums">{money(p.price)}</dd>
                  </div>
                  <div>
                    <dt className="mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                      Margin
                    </dt>
                    <dd className="mt-1 text-lg tabular-nums">{pct(p.marginOnPlatform)}</dd>
                  </div>
                  <div>
                    <dt className="mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                      Committed
                    </dt>
                    <dd className="mt-1 text-lg tabular-nums">
                      {p.unitsCommitted ? p.unitsCommitted.toLocaleString("en-US") : "—"}
                    </dd>
                  </div>
                </dl>
              </div>
            </Panel>
          ))}
        </div>

        <p className="mt-6 max-w-3xl text-xs leading-relaxed text-muted-foreground">
          {ECONOMICS.disclaimer}
        </p>
      </Section>
    </>
  );
}
