import { createFileRoute } from "@tanstack/react-router";
import { Reveal } from "@/components/home/Reveal";
import { PosterViewer } from "@/components/site/PosterViewer";
import { CountUp } from "@/components/site/CountUp";
import { LoopClip } from "@/components/site/LoopClip";
import {
  CARD,
  CtaBand,
  EYEBROW,
  Eyebrow,
  H2,
  PageHero,
  PillLink,
  SECTION,
  TEXT,
  type Hue,
} from "@/components/site/kit";
import { CASE_STUDIES, type CaseStudy, type Creator } from "@/lib/case-studies";

export const Route = createFileRoute("/case-studies")({
  head: () => ({
    meta: [
      { title: "Case Studies | MEDIALIFE" },
      {
        name: "description",
        content:
          "How MEDIALIFE turns fandom touchpoints into immersive media: the award-winning Netflix / Sakamoto Days activated retail and live-event program, and activated apparel at anime conventions.",
      },
      { property: "og:title", content: "Case Studies | MEDIALIFE" },
      {
        property: "og:description",
        content:
          "Award-winning activated print, retail and live-event programs for entertainment IP.",
      },
      { property: "og:image", content: "https://medialife.ai/work/sakamoto-header.webp" },
    ],
    links: [{ rel: "canonical", href: "https://medialife.ai/case-studies" }],
  }),
  component: CaseStudies,
});

function CaseStudies() {
  return (
    <>
      <PageHero
        hue="blue"
        eyebrow="Case studies"
        title={
          <>
            Fandom touchpoints, <span className={TEXT.blue}>activated.</span>
          </>
        }
        lead="Selected programs across print, retail, live events and conventions, with the numbers that came back from the field."
        actions={
          <nav aria-label="Case studies" className="flex flex-wrap gap-3">
            {CASE_STUDIES.map((c, i) => (
              <a
                key={c.slug}
                href={`#${c.slug}`}
                className="btn-pill btn-glass gap-3 px-5 py-3 text-sm font-medium"
              >
                <span className="mono text-[10px] tracking-[0.2em] text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {c.client}
              </a>
            ))}
          </nav>
        }
      />

      {CASE_STUDIES.map((c, i) => (
        <CaseStudyBlock key={c.slug} c={c} index={i} />
      ))}

      <CtaBand
        actions={
          <>
            <PillLink to="/contact">Activate your IP</PillLink>
            <PillLink to="/live" variant="glass">
              See what's live
            </PillLink>
          </>
        }
      />
    </>
  );
}

function CaseStudyBlock({ c, index }: { c: CaseStudy; index: number }) {
  const hue: Hue = index % 2 === 0 ? "blue" : "magenta";
  const other: Hue = hue === "blue" ? "magenta" : "blue";
  const metrics = c.metricGroups.flatMap((g) => g.items.map((m) => ({ ...m, group: g.label })));
  const maxRetail = Math.max(...(c.retail ?? []).map((r) => Number(r.v)), 1);

  return (
    <section
      id={c.slug}
      aria-labelledby={`${c.slug}-title`}
      className={`${SECTION} scroll-mt-20 border-t border-white/10 py-20 lg:py-28`}
    >
      {/* Header */}
      <div className="grid items-center gap-12 lg:grid-cols-12">
        <Reveal className="lg:col-span-7">
          <Eyebrow hue={hue}>
            {String(index + 1).padStart(2, "0")} · {c.client}
          </Eyebrow>
          <h2 id={`${c.slug}-title`} className={`mt-5 ${H2}`}>
            {c.title}
          </h2>
          {c.intro.map((p) => (
            <p key={p} className="mt-6 max-w-2xl text-muted-foreground lg:text-lg">
              {p}
            </p>
          ))}
          <ul className="mt-7 flex max-w-2xl flex-wrap gap-2" aria-label="Formats">
            {c.formats.map((f) => (
              <li
                key={f}
                className="lg-chip rounded-full px-3 py-1.5 mono text-[10px] uppercase tracking-[0.16em] text-white/85"
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
              className={`${CARD} mt-8 inline-flex items-center gap-4 px-5 py-4 transition-colors hover:border-white/30`}
            >
              <span
                aria-hidden
                className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-lg"
              >
                ★
              </span>
              <span>
                <span className="block text-sm font-semibold text-white">
                  {c.award.tier} {c.award.name}
                </span>
                <span className={`${EYEBROW} text-[9px]`}>
                  {c.award.category} ↗<span className="sr-only"> (opens in a new tab)</span>
                </span>
              </span>
            </a>
          )}
        </Reveal>

        {c.hero && (
          <Reveal delay={120} className="lg:col-span-5">
            {c.hero.large ? (
              <PosterViewer src={c.hero.src} large={c.hero.large} alt={c.hero.alt} />
            ) : (
              <img src={c.hero.src} alt={c.hero.alt} loading="lazy" className="w-full" />
            )}
          </Reveal>
        )}
      </div>

      {/* Challenge → Solution → Execution */}
      {c.approach && (
        <ol className="mt-16 grid gap-4 md:grid-cols-3">
          {c.approach.map((a, i) => (
            <Reveal as="li" key={a.label} delay={i * 90} className={`${CARD} relative p-7`}>
              <div className="flex items-center gap-3">
                <span
                  className={`grid h-8 w-8 place-items-center rounded-full border border-white/15 mono text-[11px] ${TEXT[i === 1 ? other : hue]}`}
                >
                  {i + 1}
                </span>
                <h3 className="mono text-[11px] uppercase tracking-[0.2em] text-white">
                  {a.label}
                </h3>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-white/80">{a.body}</p>
            </Reveal>
          ))}
        </ol>
      )}

      {/* Results */}
      <div className={`mt-16 grid gap-4 ${c.retail ? "lg:grid-cols-12" : ""}`}>
        <div
          className={`grid gap-4 sm:grid-cols-2 ${c.retail ? "lg:col-span-7" : "lg:grid-cols-5"}`}
        >
          {metrics.map((m, i) => (
            <Reveal
              key={m.l}
              delay={(i % 4) * 70}
              className={`${CARD} p-5 sm:p-6 ${
                c.retail && metrics.length % 2 === 1 && i === metrics.length - 1
                  ? "sm:col-span-2"
                  : ""
              }`}
            >
              <CountUp
                value={m.v}
                className={`display block text-[clamp(30px,3vw,46px)] ${TEXT[i % 2 === 0 ? hue : other]}`}
              />
              <p className="mt-2 text-sm text-white/85">{m.l}</p>
              <p className={`mt-1 ${EYEBROW} text-[9px]`}>{m.group}</p>
            </Reveal>
          ))}
        </div>

        {c.retail && (
          <Reveal delay={120} className={`${CARD} p-6 sm:p-8 lg:col-span-5`}>
            <h3 className="mono text-[11px] uppercase tracking-[0.2em] text-white">
              Unique engagements per store
            </h3>
            <p className={`mt-1 ${EYEBROW} text-[9px]`}>Sample data set</p>
            <ul className="mt-6 grid gap-5">
              {c.retail.map((r, i) => (
                <li key={r.name}>
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="min-w-0 text-sm text-white">
                      {r.name}
                      <span className={`block ${EYEBROW} text-[9px]`}>{r.city}</span>
                    </span>
                    <CountUp
                      value={r.v}
                      className={`display shrink-0 text-2xl tabular-nums ${TEXT[i % 2 === 0 ? hue : other]}`}
                    />
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
                    <div
                      className={`h-full rounded-full ${i % 2 === 0 ? "bg-primary" : "bg-accent"}`}
                      style={{ width: `${(Number(r.v) / maxRetail) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>
        )}
      </div>

      {/* Creators */}
      {c.creators && (
        <div className="mt-16">
          <h3 className={EYEBROW}>{c.creators.label}</h3>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {c.creators.items.map((cr, i) => (
              <Reveal key={cr.name} delay={i * 90}>
                <CreatorCard c={cr} hue={i % 2 === 0 ? hue : other} />
              </Reveal>
            ))}
          </div>
        </div>
      )}

      {/* In the field */}
      {(c.motion?.length || c.gallery.length > 0) && (
        <div className="mt-16">
          <h3 className={EYEBROW}>In the field</h3>
          <div
            className="gallery-round mt-6 grid grid-cols-2 gap-3 lg:grid-cols-6"
            style={{ gridAutoFlow: "dense" }}
          >
            {/* the two motion pieces anchor the grid at roughly their 1:2 portrait shape */}
            {c.motion?.map((m, i) => (
              <LoopClip
                key={m.src}
                clip={m}
                fill
                className={`rounded-[18px] border-white/10 ${
                  i === 0
                    ? "col-span-1 row-span-2 lg:col-span-2 lg:col-start-1 lg:row-span-3 lg:row-start-1"
                    : "col-span-1 row-span-2 lg:col-span-2 lg:col-start-5 lg:row-span-3 lg:row-start-1"
                }`}
              />
            ))}
            {c.gallery.map((s, i) => {
              // the last three go wide, which squares off the bottom row
              const wide = c.motion?.length ? i >= c.gallery.length - 3 : false;
              return (
                <figure
                  key={s.src}
                  className={`group relative overflow-hidden rounded-[18px] bg-secondary ${wide ? "lg:col-span-2" : ""}`}
                >
                  <img
                    src={s.src}
                    alt={s.alt}
                    loading="lazy"
                    className={`w-full object-cover transition-transform duration-700 group-hover:scale-105 ${
                      wide ? "aspect-[3/4] lg:aspect-[3/2]" : "aspect-[3/4]"
                    }`}
                  />
                </figure>
              );
            })}
          </div>
        </div>
      )}

      {/* Quotes: a row you can swipe through */}
      {c.quotes.length > 0 && (
        <div className="mt-16">
          <h3 className={EYEBROW}>From the stores</h3>
          <ul className="-mx-5 mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 sm:-mx-8 sm:px-8 lg:mx-0 lg:px-0 [scrollbar-width:thin]">
            {c.quotes.map((q, i) => (
              <li
                key={q.who}
                className={`${CARD} flex w-[300px] shrink-0 snap-start flex-col justify-between p-6 sm:w-[360px]`}
              >
                <span
                  aria-hidden
                  className={`display text-5xl leading-none ${TEXT[i % 2 === 0 ? hue : other]}`}
                >
                  “
                </span>
                <blockquote className="mt-2 text-sm leading-relaxed text-white/90">
                  {q.text}
                </blockquote>
                <p className={`mt-5 ${EYEBROW} text-[9px]`}>{q.who}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function CreatorCard({ c, hue }: { c: Creator; hue: Hue }) {
  return (
    <article className={`${CARD} overflow-hidden`}>
      <LoopClip clip={c.clip} className="border-0" />
      <div className="p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="text-sm font-semibold text-white">{c.name}</h4>
          <span className={`${EYEBROW} shrink-0 text-[9px]`}>{c.platform}</span>
        </div>
        {c.handle && (
          <p className="mt-1 break-all mono text-[11px] text-muted-foreground">{c.handle}</p>
        )}
        <div className="mt-4 flex items-baseline gap-2">
          <CountUp value={c.stat} className={`display text-3xl ${TEXT[hue]}`} />
          <span className={`${EYEBROW} text-[9px]`}>{c.statLabel}</span>
        </div>
        {c.note && <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{c.note}</p>}
      </div>
    </article>
  );
}
