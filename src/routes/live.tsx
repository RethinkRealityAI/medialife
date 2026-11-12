import { createFileRoute } from "@tanstack/react-router";
import { Reveal } from "@/components/home/Reveal";
import { ScanLens } from "@/components/site/ScanLens";
import {
  CARD,
  CtaBand,
  EYEBROW,
  H3,
  PageHero,
  PillLink,
  SECTION,
  TEXT,
} from "@/components/site/kit";
import { archivedCampaigns, liveCampaigns, type Campaign } from "@/lib/campaigns";

export const Route = createFileRoute("/live")({
  head: () => ({
    meta: [
      { title: "Live Now | MEDIALIFE" },
      {
        name: "description",
        content:
          "MEDIALIFE campaigns fans can try today: the ONE PIECE activated poster and the EVADE × Bobo charm set. Each opens in the phone browser, no app.",
      },
      { property: "og:title", content: "Live Now | MEDIALIFE" },
      { property: "og:description", content: "Activated campaigns fans can try today." },
    ],
    links: [{ rel: "canonical", href: "https://medialife.ai/live" }],
  }),
  component: LiveNow,
});

function LiveNow() {
  const live = liveCampaigns();
  const archive = archivedCampaigns();

  return (
    <>
      <PageHero
        hue="magenta"
        eyebrow={
          <>
            <span className="sr-only">Status:</span>Live now
          </>
        }
        title={
          <>
            Out in the world. <span className={TEXT.magenta}>Go scan it.</span>
          </>
        }
        lead="Campaigns fans can try today. Each one opens straight in the phone browser, with nothing to install."
      />

      <section aria-label="Live campaigns" className={`${SECTION} grid gap-6 pb-24 lg:gap-8`}>
        {live.map((c, i) => (
          <CampaignRow key={c.slug} c={c} flip={i % 2 === 1} />
        ))}
      </section>

      {archive.length > 0 && (
        <section aria-labelledby="archive-title" className={`${SECTION} pb-24`}>
          <h2 id="archive-title" className={EYEBROW}>
            Selected work
          </h2>
          <div className="mt-8 grid gap-6">
            {archive.map((c) => (
              <CampaignRow key={c.slug} c={c} />
            ))}
          </div>
        </section>
      )}

      <CtaBand />
    </>
  );
}

function CampaignRow({ c, flip = false }: { c: Campaign; flip?: boolean }) {
  const evade = c.slug === "evade";
  return (
    <Reveal>
      <article
        id={c.slug}
        aria-labelledby={`${c.slug}-title`}
        className={`${CARD} grid scroll-mt-24 items-center gap-10 overflow-hidden p-6 sm:p-10 lg:grid-cols-12 lg:gap-12 lg:p-14 ${evade ? "border-[#f5c84b]/25" : ""}`}
      >
        <div className={`lg:col-span-6 ${flip ? "lg:order-2" : ""}`}>
          <p
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 mono text-[10px] uppercase tracking-[0.2em] ${
              evade
                ? "border-[#f5c84b]/40 bg-[#f5c84b]/10 text-[#f5c84b]"
                : "border-accent/40 bg-accent/10 text-accent"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full animate-pulse-glow ${evade ? "bg-[#f5c84b]" : "bg-accent"}`}
              aria-hidden
            />
            {c.statusLabel}
          </p>
          <p className={`mt-6 ${EYEBROW}`}>
            {c.name} · {c.kicker}
          </p>
          <h2 id={`${c.slug}-title`} className={`mt-3 ${H3} text-[clamp(28px,2.8vw,44px)]`}>
            {c.headline}
          </h2>
          {c.body.map((p) => (
            <p key={p} className="mt-4 max-w-xl text-muted-foreground">
              {p}
            </p>
          ))}

          <dl className="mt-7 grid max-w-xl gap-2">
            {c.facts.map((f) => (
              <div
                key={f.k}
                className="flex items-baseline justify-between gap-4 border-b border-white/10 pb-2"
              >
                <dt className="mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                  {f.k}
                </dt>
                <dd className="text-right text-sm text-white">{f.v}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-8 flex flex-wrap gap-3">
            {c.cta &&
              (evade ? (
                <a
                  href={c.cta.href}
                  className="group btn-pill bg-[#f5c84b] px-7 py-4 text-sm font-semibold text-[#1a1300] shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_10px_30px_-10px_rgba(245,200,75,0.7)] hover:bg-[#ffd765]"
                >
                  {c.cta.label}
                  <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </a>
              ) : (
                <PillLink href={c.cta.href} external={c.cta.external}>
                  {c.cta.label}
                </PillLink>
              ))}
            {c.secondary && (
              <PillLink href={c.secondary.href} external={c.secondary.external} variant="glass">
                {c.secondary.label}
              </PillLink>
            )}
          </div>
          {c.note && (
            <p className={`mt-6 max-w-xl ${EYEBROW} text-[9px] leading-relaxed`}>{c.note}</p>
          )}
        </div>

        <div className={`lg:col-span-6 ${flip ? "lg:order-1" : ""}`}>
          <CampaignMedia c={c} />
        </div>
      </article>
    </Reveal>
  );
}

function CampaignMedia({ c }: { c: Campaign }) {
  if (c.slug === "one-piece")
    return (
      <ScanLens
        poster="/home/ar/one-piece.webp"
        video="/home/ar/one-piece.mp4"
        still="/home/ar/one-piece-alive.webp"
        alt={c.image?.alt ?? "The ONE PIECE activated poster"}
        width={720}
        height={979}
      />
    );
  if (c.slug === "evade")
    return (
      <div className="relative mx-auto aspect-[5/4] w-full max-w-[560px]">
        <div
          aria-hidden
          className="absolute inset-[12%] rounded-full bg-[#f5c84b] opacity-20 blur-[80px]"
        />
        <img
          src="/evade/creators/assets/img/cola-run-splash-sm.webp"
          alt="Cola Run, the browser game the charms unlock"
          loading="lazy"
          decoding="async"
          className="absolute left-[4%] top-[2%] h-[86%] w-auto -rotate-6 rounded-[24px] border border-white/15 object-cover shadow-2xl transition-transform duration-700 hover:-rotate-3"
        />
        <img
          src={c.image?.src}
          alt={c.image?.alt ?? ""}
          loading="lazy"
          decoding="async"
          className="absolute -bottom-[2%] right-0 w-[64%] animate-drift drop-shadow-[0_30px_40px_rgba(0,0,0,0.6)]"
        />
      </div>
    );
  if (!c.image) return null;
  return (
    <img
      src={c.image.src}
      alt={c.image.alt}
      loading="lazy"
      className="mx-auto w-full max-w-[420px] rounded-[18px]"
    />
  );
}
