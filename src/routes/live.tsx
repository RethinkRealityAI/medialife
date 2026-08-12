import { createFileRoute, Link } from "@tanstack/react-router";
import { PosterViewer } from "@/components/site/PosterViewer";
import {
  liveCampaigns,
  comingSoonCampaigns,
  archivedCampaigns,
  type Campaign,
} from "@/lib/campaigns";

export const Route = createFileRoute("/live")({
  head: () => ({
    meta: [
      { title: "Live Now — Immersive Formats in Market | MEDIALIFE" },
      {
        name: "description",
        content:
          "Immersive formats MEDIALIFE currently has in market, plus programmes in development. Physical-to-digital activation across retail, print, conventions and location-based entertainment.",
      },
      { property: "og:title", content: "Live Now | MEDIALIFE" },
      { property: "og:description", content: "Immersive formats currently in market." },
    ],
    links: [{ rel: "canonical", href: "https://medialife.ai/live" }],
  }),
  component: LiveNow,
});

const EYEBROW = "mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground";

function LiveNow() {
  const live = liveCampaigns();
  const soon = comingSoonCampaigns();
  const archive = archivedCampaigns();

  return (
    <>
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 grid-bg opacity-50" />
        <div className="absolute inset-0" style={{ background: "var(--gradient-radial)" }} />
        <div className="relative w-full px-8 lg:px-16 pt-20 pb-16">
          <div className="flex items-center gap-3 mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-accent animate-pulse-glow" />
            Live Now
          </div>
          <h1 className="mt-8 text-5xl md:text-6xl font-medium tracking-tight text-balance leading-[0.95]">
            Immersive formats <span className="ember-text">currently in market</span>.
          </h1>
          <p className="mt-8 max-w-2xl text-lg text-muted-foreground">
            What MEDIALIFE is deploying right now, and what is in development. Campaigns move into
            selected work when they finish — nothing here is archived away.
          </p>
        </div>
      </section>

      {/* LIVE */}
      <section className="border-b border-border">
        <div className="w-full px-8 lg:px-16 py-16">
          <div className="flex items-center gap-3">
            <span className="mono text-[10px] uppercase tracking-[0.25em] text-accent inline-flex items-center gap-2">
              <span className="animate-pulse-glow" aria-hidden>
                ●
              </span>
              Live
            </span>
            <span className={EYEBROW}>· {live.length} in market</span>
          </div>
          <div className="mt-8 space-y-8">
            {live.map((c) => (
              <CampaignCard key={c.slug} c={c} accent />
            ))}
          </div>
        </div>
      </section>

      {/* IN DEVELOPMENT */}
      {soon.length > 0 && (
        <section className="border-b border-border bg-surface">
          <div className="w-full px-8 lg:px-16 py-16">
            <div className={EYEBROW}>In development</div>
            <p className="mt-3 text-sm text-muted-foreground max-w-xl">
              Programmes in production. Not live, and not available to the public yet.
            </p>
            <div className="mt-8 space-y-8">
              {soon.map((c) => (
                <CampaignCard key={c.slug} c={c} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* SELECTED WORK */}
      {archive.length > 0 && (
        <section className="border-b border-border">
          <div className="w-full px-8 lg:px-16 py-16">
            <div className={EYEBROW}>Selected work</div>
            <div className="mt-8 space-y-8">
              {archive.map((c) => (
                <CampaignCard key={c.slug} c={c} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: "var(--gradient-radial)" }} />
        <div className="relative w-full px-8 lg:px-16 py-20 text-center">
          <h2 className="text-3xl md:text-5xl font-medium tracking-tight text-balance">
            Put your IP <span className="ember-text">in market</span>.
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

function CampaignCard({ c, accent = false }: { c: Campaign; accent?: boolean }) {
  return (
    <article className="border border-border bg-background p-8 lg:p-10 grid lg:grid-cols-12 gap-8 items-center">
      <div className="lg:col-span-8">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`mono text-[10px] uppercase tracking-[0.2em] px-2 py-1 border ${
              accent ? "text-accent border-accent/50" : "text-primary border-primary/50"
            }`}
          >
            {c.statusLabel}
          </span>
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {c.name} · {c.kicker}
          </span>
        </div>

        <h3 className="mt-5 text-2xl md:text-3xl font-medium tracking-tight text-balance">
          {c.headline}
        </h3>

        {c.body.map((p) => (
          <p key={p} className="mt-4 max-w-2xl text-muted-foreground">
            {p}
          </p>
        ))}

        {c.note && (
          <p className="mt-4 mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70 leading-relaxed max-w-2xl">
            {c.note}
          </p>
        )}

        <dl className="mt-7 grid sm:grid-cols-3 gap-px bg-border border border-border max-w-2xl">
          {c.facts.map((f) => (
            <div key={f.k} className="bg-background p-3">
              <dt className="mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                {f.k}
              </dt>
              <dd className="mt-1 text-xs">{f.v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-8 flex flex-wrap items-center gap-5">
          {c.cta && (
            <a
              href={c.cta.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group btn-pill btn-ember px-7 py-3.5 mono text-xs uppercase tracking-[0.2em] font-medium"
            >
              {c.cta.label}
              <span aria-hidden className="transition-transform group-hover:translate-x-1">
                ↗
              </span>
            </a>
          )}
          {c.secondary && (
            <Link
              to={c.secondary.href}
              className="mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-primary transition-colors border-b border-border hover:border-primary pb-1"
            >
              {c.secondary.label} →
            </Link>
          )}
        </div>
      </div>

      <div className="lg:col-span-4">
        {c.image?.large ? (
          <PosterViewer
            src={c.image.src}
            large={c.image.large}
            alt={c.image.alt}
            caption={c.image.caption}
          />
        ) : c.image ? (
          <img
            src={c.image.src}
            alt={c.image.alt}
            loading="lazy"
            className="w-full max-w-[260px] mx-auto"
          />
        ) : (
          /* Type-led plate stands in until approved key art lands — set
             `image` on the campaign in src/lib/campaigns.ts to replace it. */
          <div className="relative border border-border bg-surface overflow-hidden aspect-[4/3] grid place-items-center scan-line">
            <div className="absolute inset-0 grid-bg-sm opacity-40" />
            <div className="relative text-center px-6">
              <div className="mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                Scan to begin
              </div>
              <div className="mt-3 text-2xl md:text-3xl font-medium tracking-tight ember-text">
                {c.name}
              </div>
              <div className="mt-3 mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                No app required
              </div>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
