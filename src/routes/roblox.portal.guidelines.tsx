import { createFileRoute } from "@tanstack/react-router";

import { PageHeader, Panel, Section } from "@/components/portal/kit";
import { GUIDELINES } from "@/lib/roblox-portal";

export const Route = createFileRoute("/roblox/portal/guidelines")({
  component: Guidelines,
});

function Guidelines() {
  return (
    <>
      <PageHeader
        eyebrow="Reference / Guidelines"
        title="The rules, in the open."
        lede="Eligibility, what we need from you, and what we will not do. Published and kept current, so a creator can read them before applying rather than discovering them afterwards."
      />

      <Section>
        <div className="grid gap-3 lg:grid-cols-2">
          {GUIDELINES.map((g, i) => (
            <Panel key={g.id} className="p-5">
              <div className="flex items-baseline gap-3">
                <span className="mono text-[10px] tracking-[0.18em] text-primary uppercase">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h2 className="text-base font-medium tracking-tight">{g.title}</h2>
              </div>
              <ul className="mt-4 space-y-3">
                {g.rules.map((r) => (
                  <li key={r} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
                    <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-primary" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>

        <Panel className="mt-3 p-5">
          <h2 className="text-base font-medium tracking-tight">If a property does not qualify</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            It gets a written reason and a route back — what was missing, and what would change the
            answer. Most properties that do not clear on a first pass are missing asset readiness or
            clear IP ownership, and both are fixable. Nobody is left without a reply.
          </p>
        </Panel>
      </Section>
    </>
  );
}
