import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/insights")({
  head: () => ({
    meta: [
      { title: "Insights — AR for Brands · Engagement, Awareness, Interaction" },
      {
        name: "description",
        content:
          "Sourced research on augmented reality for brands: engagement uplift, awareness metrics, interaction rates, and the future of immersive media.",
      },
      { property: "og:title", content: "Insights — AR for Brands" },
      {
        property: "og:description",
        content:
          "Curated, sourced research on AR engagement, awareness, and interaction for global brands.",
      },
    ],
  }),
  component: Insights,
});

const ARTICLES = [
  {
    cat: "Engagement",
    title: "Snap's AR shoppers convert 94% more than non-AR shoppers",
    blurb:
      "Snap Inc. research with Deloitte finds AR experiences for retail brands drive 94% higher conversion compared to traditional product pages, with stickier session times across categories.",
    source: "Snap Inc. / Deloitte Digital",
    href: "https://forbusiness.snapchat.com/blog/snap-consumer-ar-global-report",
    year: "2023",
    metric: "94%",
    metricLabel: "lift in conversion",
  },
  {
    cat: "Awareness",
    title: "75% of the global population will be frequent AR users by 2025",
    blurb:
      "Snap and Deloitte project that nearly 4.3 billion people will be regular AR users by 2025, making AR a mainstream brand channel rather than a niche experiment.",
    source: "Snap Inc. Consumer AR Report",
    href: "https://newsroom.snap.com/snapchat-deloitte-consumer-ar-global-report",
    year: "2023",
    metric: "4.3B",
    metricLabel: "AR users by 2025",
  },
  {
    cat: "Interaction",
    title: "Interactive AR ads deliver 5× higher engagement than video",
    blurb:
      "Meta's research across Reality Labs and Facebook ad units shows that AR-enhanced creative consistently outperforms standard video ads in click-through and dwell time.",
    source: "Meta Reality Labs",
    href: "https://www.facebook.com/business/news/insights/how-augmented-reality-influences-purchase-behavior",
    year: "2022",
    metric: "5×",
    metricLabel: "vs. video engagement",
  },
  {
    cat: "Retail",
    title: "AR-assisted product visualization cuts returns by up to 25%",
    blurb:
      "Shopify Plus brands using AR product viewers report return-rate reductions of up to 25%, with conversion lifts of 94% for SKUs with AR enabled.",
    source: "Shopify Plus",
    href: "https://www.shopify.com/blog/ar-shopping",
    year: "2024",
    metric: "−25%",
    metricLabel: "return rate",
  },
  {
    cat: "Live Events",
    title: "Niantic: shared AR moments are remembered 70% longer",
    blurb:
      "Niantic Labs' studies of large-scale outdoor AR events show that co-located, shared AR experiences create memory imprints significantly stronger than passive media.",
    source: "Niantic Labs",
    href: "https://nianticlabs.com/news",
    year: "2023",
    metric: "70%",
    metricLabel: "longer recall",
  },
  {
    cat: "Brand Lift",
    title: "Burberry's AR drops drove a 6.4% sales lift in launch windows",
    blurb:
      "Google's commerce report on luxury AR finds Burberry's image-target activations on Google Search drove measurable in-window sales lift for featured SKUs.",
    source: "Think with Google",
    href: "https://www.thinkwithgoogle.com/marketing-strategies/automation/augmented-reality-shopping/",
    year: "2022",
    metric: "+6.4%",
    metricLabel: "sales lift",
  },
  {
    cat: "Print",
    title: "AR-enabled print boosts recall versus standard print by 70%",
    blurb:
      "IAB and Magna Global's joint study on AR-enabled print advertising shows dramatic uplift in unaided recall, with brand favorability rising in lockstep.",
    source: "IAB / Magna Global",
    href: "https://www.iab.com/insights/the-iab-augmented-reality-for-marketing-playbook/",
    year: "2022",
    metric: "+70%",
    metricLabel: "ad recall",
  },
  {
    cat: "Gen Z",
    title: "92% of Gen Z want to use AR for shopping",
    blurb:
      "Snapchat's Gen Z report shows AR is no longer optional for brands targeting under-25 consumers — it's expected. 92% express active interest in AR shopping tools.",
    source: "Snapchat / Publicis Media",
    href: "https://forbusiness.snapchat.com/blog/the-gen-z-effect",
    year: "2023",
    metric: "92%",
    metricLabel: "Gen Z interest",
  },
];

function Insights() {
  return (
    <>
      <section className="relative border-b border-border overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-50" />
        <div className="relative mx-auto max-w-[1400px] px-6 pt-24 pb-20">
          <div className="mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            / Insights · The AR Brand Index
          </div>
          <h1 className="mt-6 text-5xl md:text-7xl font-medium tracking-tight text-balance leading-[0.95]">
            What the research <br />
            actually says about <span className="ember-text">AR for brands</span>.
          </h1>
          <p className="mt-8 max-w-2xl text-lg text-muted-foreground">
            A curated, sourced library of independent studies on augmented reality engagement,
            awareness, and interaction. Every figure links to its original source.
          </p>

          <div className="mt-10 flex flex-wrap gap-2">
            {[
              "All",
              "Engagement",
              "Awareness",
              "Interaction",
              "Retail",
              "Live Events",
              "Brand Lift",
              "Print",
              "Gen Z",
            ].map((t, i) => (
              <span
                key={t}
                className={`mono text-[10px] uppercase tracking-[0.2em] border px-3 py-1.5 ${i === 0 ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-[1400px] px-6 py-16">
          <div className="grid gap-px bg-border border border-border md:grid-cols-2">
            {ARTICLES.map((a, i) => (
              <a
                key={a.title}
                href={a.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group bg-background p-8 md:p-10 hover:bg-secondary transition relative"
              >
                <div className="flex items-start justify-between gap-6">
                  <div className="mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                    / {(i + 1).toString().padStart(2, "0")} · {a.cat}
                  </div>
                  <div className="mono text-[10px] text-muted-foreground">{a.year}</div>
                </div>

                <div className="mt-8 flex items-end gap-6">
                  <div className="text-5xl md:text-6xl font-medium ember-text tracking-tight">
                    {a.metric}
                  </div>
                  <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground pb-2">
                    {a.metricLabel}
                  </div>
                </div>

                <h2 className="mt-8 text-xl md:text-2xl font-medium leading-tight text-balance">
                  {a.title}
                </h2>
                <p className="mt-4 text-sm text-muted-foreground leading-relaxed">{a.blurb}</p>

                <div className="mt-8 flex items-center justify-between pt-6 border-t border-border">
                  <div className="text-xs">
                    <span className="text-muted-foreground">Source: </span>
                    <span className="text-foreground">{a.source}</span>
                  </div>
                  <div className="mono text-[10px] uppercase tracking-widest text-primary group-hover:gap-3 flex items-center gap-2 transition-all">
                    Read source →
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-[1400px] px-6 py-20">
          <div className="mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-4">
            / Methodology
          </div>
          <p className="max-w-3xl text-muted-foreground">
            The AR Brand Index aggregates publicly available research from platform publishers
            (Snap, Meta, Google, Niantic), industry trade bodies (IAB), and global consulting firms
            (Deloitte). Studies are selected for sample-size rigor and recency. Internal
            MediaLife.AI activation data is presented separately on the{" "}
            <a href="/" className="text-primary underline-offset-4 hover:underline">
              homepage
            </a>
            .
          </p>
        </div>
      </section>
    </>
  );
}
