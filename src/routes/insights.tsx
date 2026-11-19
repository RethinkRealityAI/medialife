import { createFileRoute } from "@tanstack/react-router";
import { Reveal } from "@/components/home/Reveal";
import {
  CARD,
  CtaBand,
  EYEBROW,
  PageHero,
  PillLink,
  SECTION,
  SectionHead,
  Stat,
  TEXT,
} from "@/components/site/kit";

export const Route = createFileRoute("/insights")({
  head: () => ({
    meta: [
      { title: "AR Research | MEDIALIFE" },
      {
        name: "description",
        content:
          "Sourced research on augmented reality for brands, and the numbers from MEDIALIFE's own activations.",
      },
      { property: "og:title", content: "AR Research | MEDIALIFE" },
      {
        property: "og:description",
        content:
          "What independent research says about AR for brands, every figure linked to its source.",
      },
    ],
    links: [{ rel: "canonical", href: "https://medialife.ai/insights" }],
  }),
  component: Insights,
});

/**
 * Only figures we could trace to a published source. Checked 2026-11-12; four
 * earlier entries (Niantic recall, Burberry sales lift, Meta 5x, Shopify
 * returns) were removed because no source could be found for them.
 */
const ARTICLES = [
  {
    cat: "Conversion",
    title: "Products with AR experiences convert 94% better",
    blurb:
      "Snap's Consumer AR Global Report, produced with Deloitte Digital, found that interacting with products that have AR experiences leads to a 94% higher conversion rate. Survey-based.",
    source: "Snap Inc. / Deloitte Digital",
    href: "https://prnewswire.com/news-releases/deloitte-digital-and-snap-inc-report-reveals-the-rich-untapped-future-of-augmented-reality-for-customer-experience-301290445.html",
    year: "2021",
    metric: "94%",
    metricLabel: "higher conversion",
  },
  {
    cat: "Reach",
    title: "Nearly 75% of people projected to be frequent AR users by 2025",
    blurb:
      "The same Snap and Deloitte report projected that close to three quarters of the global population would be frequent AR users by 2025, mostly through their phones.",
    source: "Snap Inc. / Deloitte Digital",
    href: "https://prnewswire.com/news-releases/deloitte-digital-and-snap-inc-report-reveals-the-rich-untapped-future-of-augmented-reality-for-customer-experience-301290445.html",
    year: "2021",
    metric: "75%",
    metricLabel: "frequent AR users",
  },
  {
    cat: "Gen Z",
    title: "92% of Gen Z on Snapchat want AR tools for shopping",
    blurb:
      "A Snap-commissioned survey of around 16,000 people in 16 markets found 92% of Gen Z respondents want to use AR when they shop.",
    source: "Snap Inc. via Retail Dive",
    href: "https://www.retaildive.com/news/snapchat-92-of-gen-z-want-to-use-ar-for-shopping/621656/",
    year: "2022",
    metric: "92%",
    metricLabel: "want AR shopping",
  },
  {
    cat: "Recall",
    title: "AR lifts ad recall by 70%",
    blurb:
      "A Mindshare UK study reported that augmented reality advertising increases ad recall by 70% compared with standard formats.",
    source: "Mindshare UK via Adweek",
    href: "https://www.adweek.com/sponsored/ar-ads-inspire-higher-quality-attention-than-traditional-formats/",
    year: "2022",
    metric: "+70%",
    metricLabel: "ad recall",
  },
];

function Insights() {
  return (
    <>
      <PageHero
        hue="blue"
        eyebrow="AR research"
        title={
          <>
            What the research says <span className={TEXT.blue}>about AR.</span>
          </>
        }
        lead="Independent and platform studies on AR for brands. Every figure links to where it was published."
      />

      <section aria-label="Research" className={`${SECTION} pb-24`}>
        <ul className="grid gap-4 md:grid-cols-2">
          {ARTICLES.map((a, i) => (
            <Reveal as="li" key={a.title} delay={(i % 2) * 90} className="h-full">
              <a
                href={a.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`${CARD} group flex h-full flex-col p-7 transition-colors hover:border-white/25 sm:p-9`}
              >
                <div className="flex items-start justify-between gap-6">
                  <span className={`${EYEBROW} text-[9px]`}>{a.cat}</span>
                  <span className={`${EYEBROW} text-[9px]`}>{a.year}</span>
                </div>
                <div className="mt-8 flex flex-wrap items-end gap-x-4 gap-y-1">
                  <span
                    className={`display text-[clamp(44px,5vw,72px)] leading-none ${i % 2 === 0 ? TEXT.blue : TEXT.magenta}`}
                  >
                    {a.metric}
                  </span>
                  <span className={`${EYEBROW} pb-2`}>{a.metricLabel}</span>
                </div>
                <h2 className="mt-6 text-xl font-semibold text-white">{a.title}</h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{a.blurb}</p>
                <div className="mt-auto flex items-center justify-between gap-4 border-t border-white/10 pt-5 text-xs">
                  <span>
                    <span className="text-muted-foreground">Source: </span>
                    <span className="text-white">{a.source}</span>
                  </span>
                  <span className="shrink-0 text-muted-foreground transition-colors group-hover:text-primary">
                    Read ↗<span className="sr-only"> (opens in a new tab)</span>
                  </span>
                </div>
              </a>
            </Reveal>
          ))}
        </ul>
      </section>

      <section aria-labelledby="ours-title" className={`${SECTION} pb-24`}>
        <SectionHead
          id="ours-title"
          hue="magenta"
          eyebrow="Our own numbers"
          title={
            <>
              And from <span className={TEXT.magenta}>our activations.</span>
            </>
          }
          lead="Measured on MEDIALIFE programs, not surveys."
          className="mb-10"
        />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat value="3m 22s" label="average on an NFC unit" hue="magenta" note="Sakamoto Days" />
          <Stat
            value="5.46×"
            label="interactions per NFC sticker"
            hue="blue"
            note="Sakamoto Days"
          />
          <Stat
            value="86%"
            label="of AR interactions led to action"
            hue="magenta"
            note="Anime conventions"
          />
          <Stat
            value="50%"
            label="of experiences shared with others"
            hue="blue"
            note="Anime conventions"
          />
        </div>
        <div className="mt-8">
          <PillLink to="/case-studies" variant="glass">
            Read the case studies
          </PillLink>
        </div>
        <p className="mt-10 max-w-3xl text-sm text-muted-foreground">
          How we pick: published research from platforms, agencies and trade press, linked to the
          original. Platform studies are often surveys, so we say so. Figures we could not trace to
          a source are left out.
        </p>
      </section>

      <CtaBand
        hue="blue"
        title={
          <>
            Put the research <span className="text-primary">to work.</span>
          </>
        }
        lead="Tell us about your IP and where fans meet it, and we'll show you the format that fits."
      />
    </>
  );
}
