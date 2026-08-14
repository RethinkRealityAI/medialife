import { createFileRoute, Link } from "@tanstack/react-router";
import { PosterViewer } from "@/components/site/PosterViewer";
import { CountUp } from "@/components/site/CountUp";
import { LoopClip } from "@/components/site/LoopClip";
import { CASE_STUDIES, type CaseStudy, type Creator } from "@/lib/case-studies";

export const Route = createFileRoute("/case-studies")({
  head: () => ({
    meta: [
      { title: "Case Studies — Immersive Format Production | MEDIALIFE" },
      {
        name: "description",
        content:
          "How MEDIALIFE turns fandom touchpoints into immersive media: the award-winning Netflix / Sakamoto Days activated retail and live-event programme, and activated apparel at anime conventions.",
      },
      { property: "og:title", content: "Case Studies | MEDIALIFE" },
      {
        property: "og:description",
        content:
          "Award-winning activated print, retail and live-event programmes for entertainment IP.",
      },
      { property: "og:image", content: "https://medialife.ai/work/sakamoto-header.webp" },
    ],
    links: [{ rel: "canonical", href: "https://medialife.ai/case-studies" }],
  }),
  component: CaseStudies,
});

const EYEBROW = "mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground";
const RULE = "mono text-[10px] uppercase tracking-[0.2em] text-primary";

function CaseStudies() {
  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 grid-bg opacity-50" />
        <div className="absolute inset-0" style={{ background: "var(--gradient-radial)" }} />
        <div className="relative w-full px-8 lg:px-16 pt-20 pb-16">
          <div className={EYEBROW}>/ Case studies</div>
          <h1 className="mt-6 text-5xl md:text-6xl font-medium tracking-tight text-balance leading-[0.95]">
            Fandom touchpoints, <span className="ember-text">activated</span>.
          </h1>
          <p className="mt-8 max-w-2xl text-lg text-muted-foreground">
            Selected programmes across activated print, retail, live events and convention
            distribution — with the measurement that came back from the field.
          </p>

          {/* Jump list — two studies today, but the page is built to grow. */}
          <nav aria-label="Case studies" className="mt-10 flex flex-wrap gap-3">
            {CASE_STUDIES.map((c, i) => (
              <a
                key={c.slug}
                href={`#${c.slug}`}
                className="group inline-flex items-baseline gap-3 border border-border bg-background/60 backdrop-blur px-5 py-3 hover:border-primary transition-colors"
              >
                <span className="mono text-[10px] tracking-[0.25em] text-muted-foreground group-hover:text-primary transition-colors">
                  /{String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-sm">{c.client}</span>
              </a>
            ))}
          </nav>
        </div>
      </section>

      {CASE_STUDIES.map((c, i) => (
        <CaseStudyBlock key={c.slug} c={c} index={i} />
      ))}

      {/* CTA */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: "var(--gradient-radial)" }} />
        <div className="relative w-full px-8 lg:px-16 py-20 text-center">
          <h2 className="text-3xl md:text-5xl font-medium tracking-tight text-balance">
            <span className="ember-text">Activate your IP</span>.
          </h2>
          <div className="mt-8 flex justify-center">
            <Link
              to="/contact"
              className="group btn-pill btn-ember px-8 py-4 mono text-xs uppercase tracking-[0.2em] font-medium"
            >
              Activate your IP
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function CaseStudyBlock({ c, index }: { c: CaseStudy; index: number }) {
  const num = String(index + 1).padStart(2, "0");
  return (
    <section
      id={c.slug}
      className={`scroll-mt-20 border-b border-border ${index % 2 === 1 ? "bg-surface" : ""}`}
    >
      <div className="w-full px-8 lg:px-16 py-20">
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="grid lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-7">
            <div className={EYEBROW}>
              / {num} — {c.client}
            </div>
            <h2 className="mt-5 text-3xl md:text-5xl font-medium tracking-tight text-balance leading-[1.02]">
              {c.title}
            </h2>
            <div className="mt-4 mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {c.kicker}
            </div>

            {c.intro.map((p) => (
              <p key={p} className="mt-6 max-w-2xl text-muted-foreground">
                {p}
              </p>
            ))}

            <ul className="mt-8 flex flex-wrap gap-2 max-w-2xl">
              {c.formats.map((f) => (
                <li
                  key={f}
                  className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground border border-border px-3 py-2"
                >
                  {f}
                </li>
              ))}
            </ul>

            {c.award && (
              <a
                href={c.award.href}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-8 inline-flex items-baseline gap-3 border border-border bg-background px-5 py-4 hover:border-primary transition-colors"
              >
                <span className="text-xl font-medium ember-text">
                  {c.award.tier} {c.award.name}
                </span>
                <span className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {c.award.category} ↗
                </span>
              </a>
            )}
          </div>

          {c.hero && (
            <div className="lg:col-span-5">
              {c.hero.large ? (
                <PosterViewer src={c.hero.src} large={c.hero.large} alt={c.hero.alt} />
              ) : (
                <img
                  src={c.hero.src}
                  alt={c.hero.alt}
                  loading="lazy"
                  className="w-full border border-border"
                />
              )}
            </div>
          )}
        </div>

        {/* ── Challenge / Solution / Execution ───────────────────── */}
        {c.approach && (
          <div className="mt-16 grid md:grid-cols-3 gap-px bg-border border border-border">
            {c.approach.map((a, i) => (
              <div key={a.label} className="bg-background p-7 relative overflow-hidden group">
                <span
                  aria-hidden
                  className="absolute -top-3 -right-1 text-7xl font-medium leading-none opacity-[0.06] select-none"
                >
                  {i + 1}
                </span>
                <div className={RULE}>{a.label}</div>
                <p className="mt-4 text-sm text-foreground/85 leading-relaxed relative">{a.body}</p>
                <div
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 h-px opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: "var(--gradient-ember)" }}
                />
              </div>
            ))}
          </div>
        )}

        {/* ── Metrics + retail ───────────────────────────────────── */}
        <div className={`mt-16 grid gap-10 ${c.retail ? "md:grid-cols-2" : ""}`}>
          <div className="space-y-8">
            {c.metricGroups.map((grp) => (
              <div key={grp.label}>
                <div className={RULE}>{grp.label}</div>
                {/* A one-item band must not leave a dead cell beside it. */}
                <div
                  className={`mt-4 grid gap-px bg-border border border-border ${
                    grp.items.length === 1
                      ? "grid-cols-1"
                      : grp.items.length === 2
                        ? "sm:grid-cols-2"
                        : "sm:grid-cols-3"
                  }`}
                >
                  {grp.items.map((m) => (
                    <div
                      key={m.l}
                      className="group relative bg-background p-5 overflow-hidden transition-colors hover:bg-secondary/40"
                    >
                      <div
                        aria-hidden
                        className="absolute inset-x-0 top-0 h-px opacity-40 group-hover:opacity-100 transition-opacity"
                        style={{ background: "var(--gradient-ember)" }}
                      />
                      <CountUp
                        value={m.v}
                        className="block text-3xl md:text-4xl font-medium tracking-tight ember-text"
                      />
                      <div className="mt-2 text-xs text-muted-foreground leading-relaxed">
                        {m.l}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {c.retail && (
            <div>
              <div className={RULE}>Retail unit engagement · sample data set</div>
              <ul className="mt-4 space-y-px bg-border border border-border">
                {c.retail.map((r, i) => (
                  <li key={r.name} className="bg-background px-5 py-4">
                    <div className="mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <div className="mt-2 flex items-baseline justify-between gap-4">
                      {/* City drops to its own line on narrow screens — inline
                          it wraps mid-row and pushes the figure out of line. */}
                      <span className="text-sm min-w-0">
                        {r.name}
                        <span className="block sm:inline mono text-[10px] uppercase tracking-widest text-muted-foreground sm:ml-2">
                          {r.city}
                        </span>
                      </span>
                      <span className="shrink-0">
                        <CountUp
                          value={r.v}
                          className="text-lg font-medium ember-text tabular-nums"
                        />
                        <span className="mono text-[9px] uppercase tracking-widest text-muted-foreground ml-2">
                          unique
                        </span>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ── Creators ───────────────────────────────────────────── */}
        {c.creators && (
          <div className="mt-16">
            <div className={EYEBROW}>{c.creators.label}</div>
            <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {c.creators.items.map((cr) => (
                <CreatorCard key={cr.name} c={cr} />
              ))}
            </div>
          </div>
        )}

        {/* ── Bento: motion + stills ─────────────────────────────── */}
        {(c.motion?.length || c.gallery.length > 0) && (
          <div className="mt-16">
            <div className={EYEBROW}>In the field</div>
            <div
              className="mt-6 grid grid-cols-2 lg:grid-cols-6 gap-3"
              style={{ gridAutoFlow: "dense" }}
            >
              {/* The two motion pieces anchor the grid: two columns wide, three
                  rows tall, which lands at roughly the 1:2 portrait ratio the
                  source clips were shot at — so they fill their slot instead of
                  being cropped to death. */}
              {c.motion?.map((m, i) => (
                <LoopClip
                  key={m.src}
                  clip={m}
                  fill
                  className={
                    i === 0
                      ? "col-span-1 row-span-2 lg:col-span-2 lg:row-span-3 lg:col-start-1 lg:row-start-1"
                      : "col-span-1 row-span-2 lg:col-span-2 lg:row-span-3 lg:col-start-5 lg:row-start-1"
                  }
                />
              ))}

              {c.gallery.map((s, i) => {
                // The tail of the set goes wide, which squares off the bottom
                // band instead of leaving three orphaned cells.
                const wide = c.motion?.length ? i >= c.gallery.length - 3 : false;
                return (
                  <figure
                    key={s.src}
                    className={`relative overflow-hidden border border-border bg-secondary group ${
                      wide ? "lg:col-span-2" : ""
                    }`}
                  >
                    <img
                      src={s.src}
                      alt={s.alt}
                      loading="lazy"
                      className={`w-full object-cover transition-transform duration-700 group-hover:scale-105 ${
                        wide ? "aspect-[3/4] lg:aspect-[3/2]" : "aspect-[3/4]"
                      }`}
                    />
                    <div
                      aria-hidden
                      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                      style={{
                        background: "linear-gradient(to top, oklch(0 0 0 / 0.55), transparent 55%)",
                      }}
                    />
                  </figure>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Quotes ─────────────────────────────────────────────── */}
        {c.quotes.length > 0 && (
          <div className="mt-16">
            <div className={EYEBROW}>From the retailers</div>
            <div className="mt-6 grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {c.quotes.map((q) => (
                <figure
                  key={q.who}
                  className="group relative border border-border bg-background p-6 flex flex-col justify-between overflow-hidden hover:border-primary/40 transition-colors"
                >
                  <blockquote className="text-sm text-foreground/90 leading-relaxed">
                    “{q.text}”
                  </blockquote>
                  <figcaption className="mt-5 mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {q.who}
                  </figcaption>
                  <div
                    aria-hidden
                    className="absolute left-0 top-0 h-full w-px opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: "var(--gradient-ember)" }}
                  />
                </figure>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function CreatorCard({ c }: { c: Creator }) {
  return (
    <article className="group border border-border bg-background overflow-hidden hover:border-primary/40 transition-colors">
      <LoopClip clip={c.clip} className="border-0 border-b border-border" />
      <div className="p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-medium">{c.name}</h3>
          <span className="mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground shrink-0">
            {c.platform}
          </span>
        </div>
        {c.handle && (
          <div className="mt-1 mono text-[11px] text-muted-foreground break-all">{c.handle}</div>
        )}
        <div className="mt-4 flex items-baseline gap-2">
          <CountUp value={c.stat} className="text-2xl font-medium tracking-tight ember-text" />
          <span className="mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
            {c.statLabel}
          </span>
        </div>
        {c.note && <p className="mt-3 text-xs text-muted-foreground leading-relaxed">{c.note}</p>}
      </div>
    </article>
  );
}
