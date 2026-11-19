import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Reveal } from "@/components/home/Reveal";
import { CARD, CtaBand, EYEBROW, PageHero, SECTION, TEXT, type Hue } from "@/components/site/kit";
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
          { title: `${loaderData.stack.name} | MEDIALIFE Technology` },
          { name: "description", content: loaderData.stack.summary },
          { property: "og:title", content: `${loaderData.stack.name} | MEDIALIFE` },
          { property: "og:description", content: loaderData.stack.tagline },
        ]
      : [],
  }),
  notFoundComponent: () => (
    <div className={`${SECTION} py-32 text-center`}>
      <p className={EYEBROW}>404</p>
      <h1 className="mt-4 display text-4xl">Stack not found</h1>
      <Link to="/technology" className="btn-pill btn-glass mt-8 px-6 py-3 text-sm font-medium">
        Back to Technology
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
  const hue: Hue = Number(stack.num) % 2 === 1 ? "blue" : "magenta";
  const other: Hue = hue === "blue" ? "magenta" : "blue";

  return (
    <>
      <PageHero
        hue={hue}
        eyebrow={
          <>
            <Link to="/technology" className="hover:text-white">
              Technology
            </Link>
            <span aria-hidden>/</span>
            <span>
              {stack.num} · {stack.category}
            </span>
          </>
        }
        title={
          <>
            <span className={TEXT[hue]}>{stack.name}</span>
          </>
        }
        lead={
          <>
            <span className="block text-white">{stack.tagline}</span>
            <span className="mt-4 block">{stack.summary}</span>
          </>
        }
        aside={
          <div className={`${CARD} p-7 sm:p-9`}>
            <p className={EYEBROW}>What it does best</p>
            <p className={`mt-4 display text-[clamp(22px,2.2vw,32px)] ${TEXT[hue]}`}>
              {stack.hero}
            </p>
          </div>
        }
      />

      {/* capabilities */}
      <section aria-labelledby="cap-title" className={`${SECTION} pb-20`}>
        <h2 id="cap-title" className={EYEBROW}>
          Capabilities
        </h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {stack.capabilities.map((c, i) => (
            <Reveal key={c.t} delay={(i % 2) * 80} className={`${CARD} h-full p-7`}>
              <span className={`mono text-[11px] ${TEXT[i % 2 === 0 ? hue : other]}`}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-4 display text-[clamp(20px,1.8vw,26px)]">{c.t}</h3>
              <p className="mt-3 text-muted-foreground">{c.d}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* use cases + specs */}
      <section className={`${SECTION} grid gap-4 pb-20 lg:grid-cols-12`}>
        <div className="lg:col-span-7">
          <h2 className={EYEBROW}>Where it shows up</h2>
          <ol className="mt-6 grid gap-3">
            {stack.useCases.map((u, i) => (
              <li key={u.t} className={`${CARD} flex gap-5 p-6`}>
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/15 mono text-[11px] ${TEXT[i % 2 === 0 ? hue : other]}`}
                >
                  {i + 1}
                </span>
                <span>
                  <span className="block font-semibold text-white">{u.t}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{u.d}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="lg:col-span-5">
          <h2 className={EYEBROW}>Specs</h2>
          <dl className={`${CARD} mt-6 grid gap-0 p-2`}>
            {stack.specs.map((s) => (
              <div
                key={s.k}
                className="flex items-baseline justify-between gap-4 border-b border-white/10 px-4 py-3.5 last:border-b-0"
              >
                <dt className={`${EYEBROW} text-[9px]`}>{s.k}</dt>
                <dd className="text-right text-sm text-white">{s.v}</dd>
              </div>
            ))}
          </dl>
          <h2 className={`mt-8 ${EYEBROW}`}>Built with</h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {stack.partners.map((p) => (
              <li
                key={p}
                className="lg-chip rounded-full px-3 py-1.5 mono text-[10px] uppercase tracking-[0.16em] text-white/85"
              >
                {p}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* the other stacks */}
      <section aria-labelledby="more-title" className={`${SECTION} pb-24`}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="more-title" className={EYEBROW}>
            More of the toolkit
          </h2>
          <Link to="/technology" className="text-sm text-muted-foreground hover:text-white">
            All technology →
          </Link>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {others.map((o) => (
            <Link
              key={o.slug}
              to="/technology/$slug"
              params={{ slug: o.slug }}
              className={`${CARD} group p-5 transition-colors hover:border-white/25`}
            >
              <span className={`${EYEBROW} text-[9px]`}>{o.num}</span>
              <span className="mt-3 block font-semibold text-white transition-colors group-hover:text-primary">
                {o.name}
              </span>
              <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">
                {o.tagline}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <CtaBand
        hue={hue}
        eyebrow="Build with us"
        title={
          <>
            Put {stack.name} <span className={TEXT[hue]}>in your next drop.</span>
          </>
        }
      />
    </>
  );
}
