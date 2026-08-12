import { createFileRoute, Link } from "@tanstack/react-router";
import { SHOP_URL } from "@/components/site/Nav";
import { TiltCard } from "@/components/site/TiltCard";
import { PosterViewer } from "@/components/site/PosterViewer";
import { CountUp } from "@/components/site/CountUp";
import { CAPABILITIES, TOUCHPOINTS, PERFORMANCE, RETAIL_UNITS, AWARD } from "@/lib/capabilities";
import { liveCampaigns, comingSoonCampaigns } from "@/lib/campaigns";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MEDIALIFE | Immersive Format Production Studio" },
      {
        name: "description",
        content:
          "MEDIALIFE produces physical-to-digital immersive formats, ACTIVATED MERCHANDISE™, ACTIVATED APPAREL™, app-free AR, gaming integrations, and location-based entertainment for entertainment and gaming IP.",
      },
      { property: "og:title", content: "MEDIALIFE | Immersive Format Production Studio" },
      {
        property: "og:description",
        content:
          "We turn physical touchpoints into immersive media. Format innovation, produced end to end.",
      },
    ],
    links: [
      { rel: "canonical", href: "https://medialife.ai/" },
      ...FAN_GIFS.map((href) => ({
        rel: "preload" as const,
        as: "image" as const,
        href,
        fetchpriority: "high" as const,
      })),
      { rel: "preconnect", href: "https://framerusercontent.com", crossorigin: "anonymous" },
      { rel: "dns-prefetch", href: "https://framerusercontent.com" },
    ],
  }),
  component: Home,
});

const FAN_GIFS = [
  "https://framerusercontent.com/images/NqCy3mPVKQMKDufaM8S8R391MQ.gif",
  "https://framerusercontent.com/images/eRU3BYCVAoDOa97AqKQfyFLWuFg.gif",
  "https://framerusercontent.com/images/nbDc4peZes8YcOMwGUjJn0JxxqQ.gif",
  "https://framerusercontent.com/images/6JPnl8xKolTHId6veAegVcNBAcg.gif",
  "https://framerusercontent.com/images/Fl5k7LHWCXny6RJSOjywigkiX4.gif",
  "https://framerusercontent.com/images/9C7rbeiGjyeI5w32YBlKaPoQU.gif",
];

/**
 * Convention logos for the YOU CAN FIND US AT runner.
 *
 * These are the events already published on the live MEDIALIFE site, i.e. they
 * have passed internal review. Do NOT add an event here on the strength of its
 * prominence — attendance must be confirmed from internal records first.
 */
const CONVENTION_LOGOS = [
  { src: "https://framerusercontent.com/images/qUfRGP9uj07bKO0dNcv0tkhLok.png", name: "Anime NYC" },
  {
    src: "https://framerusercontent.com/images/QQjZpjhhX2YgCrYX1JfTCEnxp04.png",
    name: "San Diego Comic-Con",
  },
  {
    src: "https://framerusercontent.com/images/9ysMaU73GOaKmyu88e2QQveNpg.png",
    name: "Anime Expo",
  },
  { src: "https://framerusercontent.com/images/dFNvgOInEetXdYXwRqulR0Rs.png", name: "Sakura-Con" },
  {
    src: "https://framerusercontent.com/images/QwZ1wzFdXNw9j9qiIKZts1x0YU.png",
    name: "Anime North",
  },
  { src: "https://framerusercontent.com/images/ixAgwiRiUJSQsuysPbqonFzYsFA.png", name: "Otakon" },
  {
    src: "https://framerusercontent.com/images/ptcg7af1bZezBsEpdH52oT1SatE.png",
    name: "Anime Weekend Atlanta",
  },
  {
    src: "https://framerusercontent.com/images/Ib1YTprOlcGUcMubBW9WT9OB21I.png",
    name: "Kawaii Kon",
  },
  { src: "https://framerusercontent.com/images/tddeO2vJbRAtktw5LOsDnxjWwg.png", name: "Otafest" },
];

const EYEBROW = "mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground";

function Home() {
  const live = liveCampaigns();
  const soon = comingSoonCampaigns();
  const lead = live[0];
  const evade = soon.find((c) => c.slug === "evade");

  return (
    <>
      {/* ───────────────────────── HERO ───────────────────────── */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 grid-bg opacity-60" />
        <div className="absolute inset-0" style={{ background: "var(--gradient-radial)" }} />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-[80%] bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />

        <div className="relative w-full px-8 lg:px-16 pt-16 pb-16">
          <div className="flex items-center gap-3 mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-accent animate-pulse-glow" />
            Immersive Format Production Studio
          </div>

          <h1 className="mt-8 text-[1.875rem] md:text-[2.95rem] lg:text-[3.75rem] font-medium tracking-tight text-balance leading-[0.95]">
            We turn physical touchpoints
            <br />
            into <span className="ember-text">immersive media</span>.
          </h1>

          <p className="mt-8 max-w-2xl text-lg text-muted-foreground">
            MEDIALIFE develops and produces app-free immersive formats for entertainment and gaming
            IP across merchandise, retail, print, location-based entertainment, conventions, live
            events, and gaming environments.
          </p>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Physical production, digital experience, commerce, and measurement — built as one
            format.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <a
              href="#capabilities"
              className="group btn-pill btn-ember px-7 py-4 mono text-xs uppercase tracking-[0.2em] font-medium"
            >
              Production Capabilities
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </a>
            <a
              href="#live-now"
              className="btn-pill btn-ember-outline px-7 py-4 mono text-xs uppercase tracking-[0.2em]"
            >
              Live Now
            </a>
            <a
              href={SHOP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-primary transition-colors border-b border-transparent hover:border-primary pb-1 ml-1"
            >
              Shop Activated Merch ↗
            </a>
          </div>
        </div>
      </section>

      {/* ─────────────── 01 · PRODUCTION CAPABILITIES ─────────────── */}
      <section id="capabilities" className="scroll-mt-20 border-b border-border">
        <div className="w-full px-8 lg:px-16 py-24">
          <div className="grid md:grid-cols-12 gap-12">
            <div className="md:col-span-4">
              <div className={EYEBROW}>/ 01 — Production Capabilities</div>
              <h2 className="mt-6 text-4xl md:text-5xl font-medium tracking-tight text-balance">
                Format innovation, <span className="ember-text">produced end to end.</span>
              </h2>
              <p className="mt-6 text-muted-foreground">
                We design and deploy immersive formats that connect physical products, media, and
                places to digital experiences — from concept and production through distribution,
                commerce, and measurement.
              </p>

              {/* Physical touchpoint strip */}
              <ul className="mt-10 flex flex-wrap gap-2">
                {TOUCHPOINTS.map((t) => (
                  <li
                    key={t}
                    className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground border border-border px-3 py-2"
                  >
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <div className="md:col-span-8 grid sm:grid-cols-2 gap-px bg-border border border-border">
              {CAPABILITIES.map((c) => (
                <div key={c.num} className="bg-background p-8 hover:bg-secondary transition group">
                  <div className="flex items-start justify-between">
                    <div className={EYEBROW}>/{c.num}</div>
                    <div className="h-6 w-6 border border-border rounded-full grid place-items-center text-xs group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition">
                      {c.glyph}
                    </div>
                  </div>
                  <h3 className="mt-8 text-xl font-medium">{c.name}</h3>
                  <p className="mt-3 text-sm text-muted-foreground">{c.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────── 02 · LIVE NOW ─────────────────────── */}
      {lead && (
        <section
          id="live-now"
          className="scroll-mt-20 relative border-b border-border overflow-hidden"
        >
          <div className="absolute inset-0 grid-bg opacity-40" />
          <div
            className="pointer-events-none absolute -right-40 top-1/2 -translate-y-1/2 h-[640px] w-[640px] rounded-full blur-3xl opacity-20"
            style={{ background: "var(--gradient-ember)" }}
            aria-hidden
          />

          <div className="relative w-full px-8 lg:px-16 py-20">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <div>
                <div className={EYEBROW}>/ 02 — Live Now</div>
                <h2 className="mt-4 text-4xl md:text-5xl font-medium tracking-tight text-balance">
                  Immersive formats <span className="ember-text">currently in market.</span>
                </h2>
              </div>
              <Link
                to="/live"
                className="mono text-[10px] uppercase tracking-[0.2em] text-primary border-b border-primary pb-1"
              >
                All campaigns →
              </Link>
            </div>

            <div className="mt-12 grid lg:grid-cols-12 gap-10 items-center border border-border bg-background/40 backdrop-blur p-8 lg:p-12">
              <div className="lg:col-span-7">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="mono text-[10px] uppercase tracking-[0.2em] text-accent inline-flex items-center gap-2">
                    <span className="animate-pulse-glow" aria-hidden>
                      ●
                    </span>
                    {lead.statusLabel}
                  </span>
                  <span className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {lead.kicker}
                  </span>
                </div>

                <h3 className="mt-6 text-3xl md:text-4xl font-medium tracking-tight text-balance leading-[1.05]">
                  {lead.headline}
                </h3>

                {lead.body.map((p) => (
                  <p key={p} className="mt-5 max-w-xl text-muted-foreground">
                    {p}
                  </p>
                ))}

                <div className="mt-9 flex flex-wrap items-center gap-5">
                  {lead.cta && (
                    <a
                      href={lead.cta.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group btn-pill btn-ember px-7 py-4 mono text-xs uppercase tracking-[0.2em] font-medium"
                    >
                      {lead.cta.label}
                      <span aria-hidden className="transition-transform group-hover:translate-x-1">
                        ↗
                      </span>
                    </a>
                  )}
                  {lead.secondary && (
                    <Link
                      to={lead.secondary.href}
                      className="group/ip mono text-[11px] uppercase tracking-[0.2em] inline-flex items-center gap-2 border-b border-transparent hover:border-primary pb-1 transition-colors"
                    >
                      <span className="ember-shine font-medium">{lead.secondary.label}</span>
                      <span
                        aria-hidden
                        className="text-primary transition-transform group-hover/ip:translate-x-1"
                      >
                        →
                      </span>
                    </Link>
                  )}
                </div>
              </div>

              {/* Type-led campaign plate. Swap for key art by setting `image` in
                  src/lib/campaigns.ts once assets clear approval. */}
              <div className="lg:col-span-5">
                {lead.image?.large ? (
                  <PosterViewer
                    src={lead.image.src}
                    large={lead.image.large}
                    alt={lead.image.alt}
                    caption={lead.image.caption}
                  />
                ) : lead.image ? (
                  <img
                    src={lead.image.src}
                    alt={lead.image.alt}
                    loading="lazy"
                    className="w-full"
                  />
                ) : (
                  <div className="relative border border-border bg-surface overflow-hidden aspect-[4/3] grid place-items-center scan-line">
                    <div className="absolute inset-0 grid-bg-sm opacity-40" />
                    <div className="relative text-center px-6">
                      <div className="mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                        Scan to begin
                      </div>
                      <div className="mt-4 text-3xl md:text-4xl font-medium tracking-tight ember-text">
                        {lead.name}
                      </div>
                      <div className="mt-4 mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        No app required
                      </div>
                    </div>
                  </div>
                )}
                <dl className="mt-4 grid grid-cols-3 gap-px bg-border border border-border">
                  {lead.facts.map((f) => (
                    <div key={f.k} className="bg-background p-3">
                      <dt className="mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                        {f.k}
                      </dt>
                      <dd className="mt-1 text-xs">{f.v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ──────────────── SELECTED PROOF + AWARD ──────────────── */}
      <section className="border-b border-border bg-surface">
        <div className="w-full px-8 lg:px-16 py-20">
          <div className={EYEBROW}>/ Selected proof</div>

          <div className="mt-10 grid lg:grid-cols-12 gap-10">
            {/* Netflix / Sakamoto Days */}
            <div className="lg:col-span-7 border border-border bg-background p-8 lg:p-10">
              <div className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Netflix / Sakamoto Days
              </div>
              <h3 className="mt-5 text-2xl md:text-3xl font-medium tracking-tight text-balance">
                Physical media, turned into an app-free immersive fandom experience.
              </h3>
              <p className="mt-5 text-muted-foreground">
                Activated magazines, stickers, posters, and life-sized retail displays distributed
                across 150+ comic and manga retailers and three major North American conventions —
                Anime Expo, San Diego Comic-Con and Anime NYC.
              </p>

              <div className="mt-8 grid sm:grid-cols-3 gap-px bg-border border border-border">
                {[
                  ["150+", "comic & manga retailers"],
                  ["3", "major conventions"],
                  ["Platinum", "Pinnacle Award 2025"],
                ].map(([v, l]) => (
                  <div key={l} className="bg-background p-4">
                    <CountUp value={v} className="block text-2xl font-medium ember-text" />
                    <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground mt-2">
                      {l}
                    </div>
                  </div>
                ))}
              </div>

              {/* Named retail units — real locations, real counts */}
              <div className="mt-8">
                <div className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Interactions per activated retail unit
                </div>
                <ul className="mt-4 space-y-px bg-border border border-border">
                  {RETAIL_UNITS.map((r) => (
                    <li
                      key={r.name}
                      className="bg-background px-4 py-3 flex items-baseline justify-between gap-4"
                    >
                      <span className="text-sm">
                        {r.name}
                        <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground ml-2">
                          {r.city}
                        </span>
                      </span>
                      <CountUp
                        value={r.v}
                        className="text-lg font-medium ember-text tabular-nums shrink-0"
                      />
                    </li>
                  ))}
                </ul>
              </div>

              <a
                href="https://medialife-live-ar-media--04pmr63.gamma.site/"
                target="_blank"
                rel="noopener noreferrer"
                className="group/ip mt-8 mono text-[11px] uppercase tracking-[0.2em] inline-flex items-center gap-2 border-b border-transparent hover:border-primary pb-1 transition-colors"
              >
                <span className="ember-shine font-medium">See the full AR media case study</span>
                <span
                  aria-hidden
                  className="text-primary transition-transform group-hover/ip:translate-x-1"
                >
                  ↗
                </span>
              </a>
            </div>

            <div className="lg:col-span-5 flex flex-col gap-10">
              {/* Award — with the official winners list as proof */}
              <div className="border border-border bg-background p-8 relative overflow-hidden">
                <div
                  className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full blur-3xl opacity-25"
                  style={{ background: "var(--gradient-ember)" }}
                  aria-hidden
                />
                <div className="relative">
                  <div className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    Award · {AWARD.year}
                  </div>
                  <div className="mt-4 text-2xl md:text-3xl font-medium tracking-tight ember-text">
                    {AWARD.tier} {AWARD.name}
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">{AWARD.category}</div>

                  <div className="mt-6">
                    <PosterViewer
                      src="/live/pinnacle-winners.webp"
                      large="/live/pinnacle-winners-large.webp"
                      alt="2025 Pinnacle Awards winners, Marketing & Communications — Activated by MEDIALIFE listed alongside EA, Hyundai, Toshiba and ZEISS"
                      caption="Official 2025 winners list · MEDIALIFE highlighted"
                    />
                  </div>

                  <a
                    href={AWARD.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-6 inline-flex mono text-[10px] uppercase tracking-[0.2em] text-primary border-b border-primary pb-1 hover:opacity-80 transition-opacity"
                  >
                    Verify on the Pinnacle Awards site ↗
                  </a>
                </div>
              </div>

              {/* Animebae */}
              <div className="border border-border bg-background p-8">
                <div className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Animebae / Activated Apparel™
                </div>
                <p className="mt-5 text-sm text-muted-foreground">
                  Activated apparel and fandom merchandise distributed directly into anime
                  convention audiences, using physical products as interactive media surfaces.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────── 03 · FAN REACTIONS ─────────────────── */}
      <section id="fan-reactions" className="scroll-mt-20 border-b border-border overflow-hidden">
        <div className="px-8 lg:px-16 pt-16">
          <div className={EYEBROW}>/ 03 — Fan Reactions</div>
          <h2 className="mt-4 text-4xl md:text-5xl font-medium tracking-tight text-balance">
            Fans don't just see it — <span className="ember-text">they experience it.</span>
          </h2>
        </div>

        <div className="mt-10 mb-4 px-8 lg:px-16 mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          Captured in the wild · Fan uploads from Anime Expo, SDCC &amp; Anime NYC
        </div>
        <div
          className="flex gap-4 animate-marquee"
          style={{ width: "max-content", willChange: "transform" }}
        >
          {[...FAN_GIFS, ...FAN_GIFS, ...FAN_GIFS, ...FAN_GIFS].map((src, i) => (
            <div
              key={i}
              className="relative h-[280px] w-[160px] flex-shrink-0 overflow-hidden border border-border bg-secondary"
            >
              <img
                src={src}
                alt="Fan AR reaction"
                loading="eager"
                decoding="async"
                fetchPriority={i < 6 ? ("high" as const) : ("auto" as const)}
                width={160}
                height={280}
                className="h-full w-full object-cover"
              />
              <div className="absolute top-2 left-2 mono text-[9px] uppercase tracking-widest bg-background/80 backdrop-blur px-2 py-0.5">
                / Rec {((i % 9) + 1).toString().padStart(2, "0")}
              </div>
            </div>
          ))}
        </div>

        {/* Performance band */}
        <div className="w-full px-8 lg:px-16 py-16">
          <div className={EYEBROW}>Selected live deployment performance</div>
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border">
            {PERFORMANCE.map((s) => (
              <div key={s.l} className="bg-background p-6 hover:bg-secondary transition-colors">
                <CountUp
                  value={s.v}
                  className="block text-2xl md:text-3xl font-medium tracking-tight ember-text"
                />
                <div className="mt-2 text-xs text-muted-foreground">{s.l}</div>
              </div>
            ))}
          </div>
          <p className="mt-4 mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Ranges across selected deployments · not a single campaign
          </p>
        </div>
      </section>

      {/* ──────────────── YOU CAN FIND US AT ──────────────── */}
      <section className="border-b border-border bg-surface py-12 overflow-hidden">
        <div className="px-8 lg:px-16 mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-8">
          You can find us at
        </div>
        <div
          className="flex gap-16 items-center animate-marquee-slow"
          style={{ width: "max-content" }}
        >
          {[...CONVENTION_LOGOS, ...CONVENTION_LOGOS, ...CONVENTION_LOGOS, ...CONVENTION_LOGOS].map(
            (l, i) => (
              <img
                key={i}
                src={l.src}
                alt={i < CONVENTION_LOGOS.length ? l.name : ""}
                aria-hidden={i >= CONVENTION_LOGOS.length}
                loading="lazy"
                className="h-12 w-auto opacity-50 hover:opacity-100 transition grayscale hover:grayscale-0"
              />
            ),
          )}
        </div>
      </section>

      {/* ───────────────────────── 04 · MERCH ───────────────────────── */}
      <section id="merch" className="scroll-mt-20 relative border-b border-border overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-40" />
        <div
          className="pointer-events-none absolute -left-40 top-1/2 -translate-y-1/2 h-[720px] w-[720px] rounded-full blur-3xl opacity-25"
          style={{ background: "var(--gradient-ember)" }}
          aria-hidden
        />

        <div className="relative mx-auto w-full px-8 lg:px-16 py-16 grid lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          {/* Product */}
          <div className="lg:col-span-5 order-2 lg:order-1">
            <TiltCard className="mx-auto w-full max-w-[400px]">
              <div className="relative w-full animate-drift">
                <div
                  aria-hidden
                  className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-[-30px] h-10 w-[60%] rounded-[50%] blur-2xl opacity-50"
                  style={{ background: "oklch(0.68 0.26 350 / 60%)" }}
                />
                <div
                  className="relative will-change-transform transition-transform duration-200 ease-out"
                  style={{
                    transform:
                      "perspective(900px) rotateX(var(--tilt-x)) rotateY(calc(var(--tilt-y) + var(--scroll-lean))) translateY(var(--scroll-shift))",
                  }}
                >
                  <img
                    src="/merch/keychain-cutout.webp"
                    alt="Activated acrylic keychain set in development with Evade"
                    width={632}
                    height={820}
                    loading="lazy"
                    className="w-full select-none"
                    style={{ filter: "drop-shadow(0 28px 56px oklch(0.68 0.26 350 / 38%))" }}
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 transition-opacity duration-300"
                    style={{
                      opacity: "calc(var(--glare) * 0.5)",
                      background:
                        "radial-gradient(340px circle at var(--point-x) var(--point-y), oklch(1 0 0 / 26%), transparent 62%)",
                      mixBlendMode: "screen",
                    }}
                  />
                </div>
              </div>
            </TiltCard>

            <div className="mt-7 grid grid-cols-2 gap-3 max-w-[400px] mx-auto">
              <figure className="relative overflow-hidden border border-border bg-white">
                <img
                  src="/merch/keychain-qr.webp"
                  alt="Front and reverse of an activated can charm — the back carries a QR activation code"
                  width={900}
                  height={633}
                  loading="lazy"
                  className="w-full aspect-[4/3] object-contain"
                />
                <figcaption className="absolute bottom-0 inset-x-0 bg-background/90 backdrop-blur mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground px-2 py-1.5 truncate">
                  QR activation layer
                </figcaption>
              </figure>
              <figure className="relative overflow-hidden border border-border bg-white">
                <img
                  src="/merch/keychain-hand.webp"
                  alt="Activated acrylic charms held in one hand, showing their scale"
                  width={900}
                  height={982}
                  loading="lazy"
                  className="w-full aspect-[4/3] object-contain"
                />
                <figcaption className="absolute bottom-0 inset-x-0 bg-background/90 backdrop-blur mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground px-2 py-1.5 truncate">
                  Double-sided acrylic
                </figcaption>
              </figure>
            </div>
          </div>

          {/* Copy */}
          <div className="lg:col-span-7 order-1 lg:order-2">
            <div className={EYEBROW}>/ 04 — Merch</div>

            <h2 className="mt-4 text-4xl md:text-5xl font-medium tracking-tight text-balance leading-[0.95]">
              <span className="ember-text">Activated Merchandise™</span>
            </h2>

            <p className="mt-6 max-w-xl text-base md:text-lg text-muted-foreground">
              Physical merchandise can become a media format. MEDIALIFE develops merchandise that
              connects apparel, collectibles, and physical fandom objects to immersive digital
              experiences.
            </p>

            <ul className="mt-8 flex flex-wrap gap-2 max-w-xl">
              {[
                "Activated Apparel™",
                "Keychains / collectibles",
                "Stickers",
                "Print / magazines",
                "Accessories",
              ].map((t) => (
                <li
                  key={t}
                  className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground border border-border px-3 py-2"
                >
                  {t}
                </li>
              ))}
            </ul>

            {/* Evade — in development. Status and claims are constrained; see
                src/lib/campaigns.ts before editing this copy. */}
            {evade && (
              <div className="mt-10 border border-border bg-background/50 backdrop-blur p-6 max-w-xl">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="mono text-[10px] uppercase tracking-[0.2em] text-primary border border-primary/50 px-2 py-1">
                    {evade.statusLabel}
                  </span>
                  <span className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {evade.name} · {evade.kicker}
                  </span>
                </div>
                <p className="mt-4 text-sm text-muted-foreground">{evade.body[0]}</p>
                {evade.note && (
                  <p className="mt-3 mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70 leading-relaxed">
                    {evade.note}
                  </p>
                )}
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-5">
              <a
                href={SHOP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="group btn-pill btn-ember px-8 py-4 mono text-xs uppercase tracking-[0.2em] font-medium"
              >
                Shop Activated Merch
                <span aria-hidden className="transition-transform group-hover:translate-x-1">
                  ↗
                </span>
              </a>
              <Link
                to="/contact"
                className="group/ip mono text-[11px] uppercase tracking-[0.2em] inline-flex items-center gap-2 border-b border-transparent hover:border-primary pb-1 transition-colors"
              >
                <span className="ember-shine font-medium">Build a merch programme</span>
                <span
                  aria-hidden
                  className="text-primary transition-transform group-hover/ip:translate-x-1"
                >
                  →
                </span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────── MANIFESTO ───────────────────────── */}
      <section className="relative border-b border-border overflow-hidden">
        <div className="absolute inset-0 grid-bg-sm opacity-30" />
        <div className="relative w-full px-8 lg:px-16 py-24 grid md:grid-cols-2 gap-16">
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.25em] text-primary">
              / Manifesto
            </div>
            <h2 className="mt-6 text-4xl md:text-6xl font-medium tracking-tight text-balance">
              We play at the edge of <span className="ember-text">new format innovation</span>.
            </h2>
          </div>
          <div className="space-y-8 text-lg text-muted-foreground">
            <p>
              Audiences move fluidly between physical places, products, games, and digital worlds.
              Media formats should do the same.
            </p>
            <p>
              MEDIALIFE connects physical distribution to digital experience, participation,
              commerce, and measurable engagement.
            </p>
            <p className="text-foreground">
              Physical is a distribution channel. Digital is the experience layer. The format
              connects both.
            </p>
          </div>
        </div>
      </section>

      {/* ───────────────────────── 05 · CONTACT ───────────────────────── */}
      <section id="contact" className="scroll-mt-20 relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: "var(--gradient-radial)" }} />
        <div className="relative w-full px-8 lg:px-16 py-24 text-center">
          <div className={EYEBROW}>/ 05 — Contact</div>
          <h2 className="mt-6 text-4xl md:text-6xl font-medium tracking-tight text-balance">
            Build a format <span className="ember-text">with us</span>.
          </h2>
          <p className="mt-6 mx-auto max-w-xl text-muted-foreground">
            Entertainment, gaming, retail, live events, location-based entertainment, and licensed
            IP.
          </p>
          <div className="mt-10 flex justify-center">
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
