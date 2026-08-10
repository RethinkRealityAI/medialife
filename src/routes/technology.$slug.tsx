import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { TECH_STACKS, getStack, type TechStack } from "@/lib/tech-stacks";

export const Route = createFileRoute("/technology/$slug")({
  loader: ({ params }) => {
    const stack = getStack(params.slug);
    if (!stack) throw notFound();
    return { stack };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.stack.name} — MediaLife.AI Technology` },
          { name: "description", content: loaderData.stack.summary },
          { property: "og:title", content: `${loaderData.stack.name} — MediaLife.AI` },
          { property: "og:description", content: loaderData.stack.tagline },
        ]
      : [],
  }),
  notFoundComponent: () => (
    <div className="mx-auto max-w-[1400px] px-6 py-32 text-center">
      <div className="mono text-xs uppercase tracking-[0.25em] text-muted-foreground">/ 404</div>
      <h1 className="mt-4 text-4xl font-medium">Stack not found</h1>
      <Link
        to="/technology"
        className="mt-8 inline-block mono text-xs uppercase tracking-widest text-primary border-b border-primary"
      >
        Back to Technology →
      </Link>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-[1400px] px-6 py-32 text-center">
      <h1 className="text-2xl">Something went wrong</h1>
      <p className="text-muted-foreground mt-2">{error.message}</p>
    </div>
  ),
  component: StackPage,
});

function StackPage() {
  const { stack } = Route.useLoaderData() as { stack: TechStack };
  const others = TECH_STACKS.filter((s) => s.slug !== stack.slug);

  return (
    <>
      {/* HERO */}
      <section className="relative border-b border-border overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-40" />
        <div className="absolute inset-0" style={{ background: "var(--gradient-radial)" }} />
        <div className="relative mx-auto max-w-[1400px] px-6 pt-16 pb-24">
          <div className="flex items-center gap-4 mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            <Link to="/technology" className="hover:text-primary">
              / Technology
            </Link>
            <span>/</span>
            <span className="text-foreground">
              {stack.num} · {stack.category}
            </span>
          </div>

          <h1 className="mt-8 text-5xl md:text-7xl font-medium tracking-tight text-balance leading-[0.95]">
            <span className="ember-text">{stack.name}</span>
          </h1>
          <p className="mt-6 max-w-2xl text-2xl text-muted-foreground text-balance">
            {stack.tagline}
          </p>

          <div className="mt-12 grid md:grid-cols-12 gap-8">
            <p className="md:col-span-7 text-lg text-muted-foreground leading-relaxed">
              {stack.summary}
            </p>
            <div className="md:col-span-5 border border-border bg-surface p-6">
              <div className="mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                / Hero Capability
              </div>
              <p className="mt-4 text-xl font-medium ember-text">{stack.hero}</p>
            </div>
          </div>
        </div>
      </section>

      {/* CAPABILITIES */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-[1400px] px-6 py-24">
          <div className="mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-10">
            / Capabilities
          </div>
          <div className="grid md:grid-cols-2 gap-px bg-border border border-border">
            {stack.capabilities.map((c, i) => (
              <div key={c.t} className="bg-background p-8 hover:bg-secondary transition group">
                <div className="flex items-start justify-between">
                  <div className="mono text-[10px] uppercase tracking-widest text-primary">
                    /{String(i + 1).padStart(2, "0")}
                  </div>
                </div>
                <h3 className="mt-6 text-2xl font-medium">{c.t}</h3>
                <p className="mt-3 text-muted-foreground">{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SPECS + USE CASES */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-[1400px] px-6 py-24 grid md:grid-cols-12 gap-12">
          <div className="md:col-span-5">
            <div className="mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              / Tech Specs
            </div>
            <div className="mt-8 border border-border bg-background">
              {stack.specs.map((s) => (
                <div
                  key={s.k}
                  className="grid grid-cols-2 border-b border-border last:border-b-0 px-5 py-4"
                >
                  <div className="mono text-[11px] uppercase tracking-widest text-muted-foreground">
                    {s.k}
                  </div>
                  <div className="text-sm">{s.v}</div>
                </div>
              ))}
            </div>

            <div className="mt-10 mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              / Partners & Frameworks
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {stack.partners.map((p) => (
                <span
                  key={p}
                  className="mono text-[10px] uppercase tracking-widest border border-border bg-background px-3 py-1.5"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>

          <div className="md:col-span-7">
            <div className="mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              / Use Cases
            </div>
            <div className="mt-8 space-y-px bg-border border border-border">
              {stack.useCases.map((u, i) => (
                <div
                  key={u.t}
                  className="bg-background p-6 grid grid-cols-12 gap-4 hover:bg-secondary transition"
                >
                  <div className="col-span-1 mono text-xs text-primary">
                    [{String(i + 1).padStart(2, "0")}]
                  </div>
                  <div className="col-span-4 font-medium">{u.t}</div>
                  <div className="col-span-7 text-sm text-muted-foreground">{u.d}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* OTHER STACKS */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-[1400px] px-6 py-20">
          <div className="flex items-end justify-between mb-8">
            <div>
              <div className="mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                / Continue Exploring
              </div>
              <h2 className="mt-3 text-3xl font-medium">Other layers of the stack</h2>
            </div>
            <Link
              to="/technology"
              className="mono text-[10px] uppercase tracking-widest text-primary border-b border-primary pb-1"
            >
              All technology →
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-px bg-border border border-border">
            {others.map((o) => (
              <Link
                key={o.slug}
                to="/technology/$slug"
                params={{ slug: o.slug }}
                className="group bg-background p-5 hover:bg-secondary transition"
              >
                <div className="mono text-[9px] uppercase tracking-widest text-muted-foreground">
                  /{o.num}
                </div>
                <div className="mt-3 font-medium group-hover:ember-text transition">{o.name}</div>
                <div className="mt-2 text-xs text-muted-foreground line-clamp-2">{o.tagline}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-[1400px] px-6 py-20 grid md:grid-cols-2 gap-10 items-center">
          <h2 className="text-3xl md:text-5xl font-medium tracking-tight text-balance">
            Deploy <span className="ember-text">{stack.name}</span> for your brand.
          </h2>
          <div className="flex gap-3 md:justify-end">
            <Link
              to="/contact"
              className="bg-primary text-primary-foreground px-6 py-3 mono text-xs uppercase tracking-[0.2em] hover:bg-accent hover:text-accent-foreground transition"
            >
              Talk to engineering →
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
