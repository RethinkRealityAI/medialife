import { createFileRoute, Link } from "@tanstack/react-router";
import { PosterViewer } from "@/components/site/PosterViewer";
import { CountUp } from "@/components/site/CountUp";
import { CASE_STUDIES, type CaseStudy } from "@/lib/case-studies";
import { comingSoonCampaigns } from "@/lib/campaigns";

export const Route = createFileRoute("/case-studies")({
  head: () => ({
    meta: [
      { title: "Case Studies — Immersive Format Production | MEDIALIFE" },
      {
        name: "description",
        content:
          "How MEDIALIFE turns physical touchpoints into immersive media: the award-winning Netflix / Sakamoto Days activated retail and live-event programme, and activated apparel at anime conventions.",
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

function CaseStudies() {
  const soon = comingSoonCampaigns();

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 grid-bg opacity-50" />
        <div className="absolute inset-0" style={{ background: "var(--gradient-radial)" }} />
        <div className="relative w-full px-8 lg:px-16 pt-20 pb-16">
          <div className={EYEBROW}>/ Case studies</div>
          <h1 className="mt-6 text-5xl md:text-6xl font-medium tracking-tight text-balance leading-[0.95]">
            Physical touchpoints, <span className="ember-text">turned into media</span>.
          </h1>
          <p className="mt-8 max-w-2xl text-lg text-muted-foreground">
            Selected programmes across activated print, retail, live events and convention
            distribution — with the measurement that came back from the field.
          </p>
        </div>
      </section>

      {CASE_STUDIES.map((c, i) => (
        <CaseStudyBlock key={c.slug} c={c} index={i} />
      ))}

      {/* Coming soon */}
      {soon.length > 0 && (
        <section className="border-b border-border">
          <div className="w-full px-8 lg:px-16 py-20">
            <div className={EYEBROW}>Coming soon</div>
            <div className="mt-8 grid lg:grid-cols-12 gap-10 items-center border border-border bg-background/40 backdrop-blur p-8 lg:p-10">
              <div className="lg:col-span-8">
                {soon.map((s) => (
                  <div key={s.slug}>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="mono text-[10px] uppercase tracking-[0.2em] text-primary border border-primary/50 px-2 py-1">
                        {s.statusLabel}
                      </span>
                      <span className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        {s.name} · {s.kicker}
                      </span>
                    </div>
                    <h3 className="mt-5 text-2xl md:text-3xl font-medium tracking-tight text-balance">
                      {s.headline}
                    </h3>
                    {s.body.map((p) => (
                      <p key={p} className="mt-4 max-w-2xl text-muted-foreground">
                        {p}
                      </p>
                    ))}
                    {s.note && (
                      <p className="mt-4 mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70 leading-relaxed max-w-2xl">
                        {s.note}
                      </p>
                    )}
                    <Link
                      to="/contact"
                      className="mt-7 inline-flex mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-primary transition-colors border-b border-border hover:border-primary pb-1"
                    >
                      Get notified →
                    </Link>
                  </div>
                ))}
              </div>
              <div className="lg:col-span-4">
                <img
                  src="/work/evade-logo.webp"
                  alt="EVADE"
                  width={560}
                  height={560}
                  loading="lazy"
                  className="w-full max-w-[280px] mx-auto"
                />
              </div>
            </div>
          </div>
        </section>
      )}

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
              Start a project
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
        {/* Header */}
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

        {/* Metrics */}
        <div className="mt-16 grid md:grid-cols-2 gap-10">
          <div className="space-y-8">
            {c.metricGroups.map((grp) => (
              <div key={grp.label}>
                <div className="mono text-[10px] uppercase tracking-[0.2em] text-primary">
                  {grp.label}
                </div>
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
                    <div key={m.l} className="bg-background p-5">
                      <CountUp
                        value={m.v}
                        className="block text-2xl md:text-3xl font-medium tracking-tight ember-text"
                      />
                      <div className="mt-2 text-xs text-muted-foreground">{m.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {c.retail && (
            <div>
              <div className="mono text-[10px] uppercase tracking-[0.2em] text-primary">
                Retail unit engagement · sample data set
              </div>
              <ul className="mt-4 space-y-px bg-border border border-border">
                {c.retail.map((r, i) => (
                  <li key={r.name} className="bg-background px-5 py-4">
                    <div className="mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <div className="mt-2 flex items-baseline justify-between gap-4">
                      <span className="text-sm">
                        {r.name}
                        <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground ml-2">
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

        {/* Gallery */}
        {c.gallery.length > 0 && (
          <div className="mt-16">
            <div className={EYEBROW}>In the field</div>
            <div className="mt-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {c.gallery.map((s) => (
                <figure
                  key={s.src}
                  className="relative overflow-hidden border border-border bg-secondary group"
                >
                  <img
                    src={s.src}
                    alt={s.alt}
                    loading="lazy"
                    className="w-full aspect-[3/4] object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                </figure>
              ))}
            </div>
          </div>
        )}

        {/* Quotes */}
        {c.quotes.length > 0 && (
          <div className="mt-16">
            <div className={EYEBROW}>From the retailers</div>
            <div className="mt-6 grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {c.quotes.map((q) => (
                <figure
                  key={q.who}
                  className="border border-border bg-background p-6 flex flex-col justify-between"
                >
                  <blockquote className="text-sm text-foreground/90 leading-relaxed">
                    “{q.text}”
                  </blockquote>
                  <figcaption className="mt-5 mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {q.who}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
