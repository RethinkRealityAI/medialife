import { createFileRoute, Link } from "@tanstack/react-router";
import { SHOP_URL } from "@/components/site/Nav";
import { PosterViewer } from "@/components/site/PosterViewer";
import { CountUp } from "@/components/site/CountUp";
import { CAPABILITIES, TOUCHPOINTS, PERFORMANCE, RETAIL_UNITS, AWARD } from "@/lib/capabilities";
import { liveCampaigns } from "@/lib/campaigns";
import { Hero } from "@/components/home/Hero";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MEDIALIFE | Immersive products & experiences that come alive" },
      {
        name: "description",
        content:
          "MEDIALIFE makes immersive products and experiences for entertainment and gaming IP: ACTIVATED MERCHANDISE™ and ACTIVATED APPAREL™, activated print, retail, live events and browser games that open with a tap or scan. No app.",
      },
      { property: "og:title", content: "MEDIALIFE | Everything we touch comes alive" },
      {
        property: "og:description",
        content:
          "Immersive products and experiences for entertainment and gaming IP. Merch, print, retail, live events and games that open with a tap or scan.",
      },
    ],
    links: [
      { rel: "canonical", href: "https://medialife.ai/" },
      // The hero poster is the first paint (the WebGL stage fades in over it).
      {
        rel: "preload",
        as: "image",
        href: "/home/hero-poster-wide.webp",
        media: "(min-aspect-ratio: 1/1)",
        fetchpriority: "high",
      },
      {
        rel: "preload",
        as: "image",
        href: "/home/hero-poster-tall.webp",
        media: "(max-aspect-ratio: 1/1)",
        fetchpriority: "high",
      },
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
const SECTION = "relative px-5 sm:px-8 lg:px-16";
const H2 = "display text-[clamp(40px,6vw,88px)]";

/**
 * Everything MEDIALIFE makes, as one grid. Each tile is a real destination on
 * the site, so the homepage doubles as the map of it.
 */
const FORMATS: {
  kind: string;
  title: string;
  line: string;
  href: string;
  external?: boolean;
  img: string;
  imgAlt: string;
  fit?: "cover" | "contain";
  span: string;
}[] = [
  {
    kind: "Activated Merchandise™ · Apparel™",
    title: "Merch that comes alive",
    line: "Apparel, keychains and stickers with an NFC tag in the design and AR in the print.",
    href: "/activated-merch/",
    img: "/activated-merch/posters/syndicate-tee.webp",
    imgAlt: "The Syndicate AR tee, an activated MEDIALIFE garment",
    fit: "contain",
    span: "lg:col-span-7 lg:row-span-2",
  },
  {
    kind: "Activated Print™",
    title: "Posters and magazines that play",
    line: "Scan the print and the story starts in the browser.",
    href: "/live",
    img: "/live/one-piece-poster.webp",
    imgAlt: "The activated ONE PIECE poster with its scan-to-begin code",
    span: "lg:col-span-5",
  },
  {
    kind: "Activated retail",
    title: "A fixture where every product opens",
    line: "For stores, pop-ups and convention floors.",
    href: "/activated-retail",
    img: "/medialife/activated-retail/page/showcase-poster-sm.webp",
    imgAlt: "The MEDIALIFE activated retail fixture",
    span: "lg:col-span-5",
  },
  {
    kind: "Games",
    title: "Merch that unlocks a game",
    line: "Cola Run opens straight from the EVADE keychain.",
    href: "/evade/",
    img: "/evade/creators/assets/img/cola-run-splash-sm.webp",
    imgAlt: "Cola Run, the browser game unlocked by the EVADE keychain",
    span: "lg:col-span-4",
  },
  {
    kind: "Live events + conventions",
    title: "Fans, in the wild",
    line: "Anime Expo, SDCC, Anime NYC and more.",
    href: "/fan-reactions",
    img: "/activated-merch/media/fan-02.webp",
    imgAlt: "A fan trying an activated experience at a convention",
    span: "lg:col-span-4",
  },
  {
    kind: "Creators + partners",
    title: "Hubs that run the program",
    line: "Creators and IP partners track drops, content and sales.",
    href: "/creator-hub",
    img: "/activated-merch/posters/sukeban-hoodie.webp",
    imgAlt: "The Sukeban AR hoodie, a creator collaboration",
    fit: "contain",
    span: "lg:col-span-4",
  },
];

function Home() {
  const live = liveCampaigns();
  const lead = live[0];

  return (
    <>
      <Hero />

      {/* ───────────────────────── WHAT WE MAKE ───────────────────────── */}
      <section
        id="work"
        aria-labelledby="work-title"
        className={`${SECTION} scroll-mt-20 py-20 lg:py-28`}
      >
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className={EYEBROW}>What we make</p>
            <h2 id="work-title" className={`${H2} mt-4`}>
              Immersive products.
              <br />
              <span className="text-primary">Living experiences.</span>
            </h2>
          </div>
          <p className="max-w-sm text-muted-foreground">
            One studio for the physical piece, the experience it opens, and the numbers behind it.
          </p>
        </div>

        <ul className="mt-12 grid gap-4 lg:grid-cols-12 lg:auto-rows-[260px]">
          {FORMATS.map((f) => (
            <li key={f.title} className={`${f.span} min-h-[320px] lg:min-h-[260px]`}>
              <a
                href={f.href}
                className="lg-card group flex h-full overflow-hidden rounded-[28px] transition-transform duration-300 hover:-translate-y-0.5"
              >
                <div className="relative flex w-full flex-col justify-end p-6 sm:p-7">
                  <img
                    src={f.img}
                    alt={f.imgAlt}
                    loading="lazy"
                    decoding="async"
                    className={`absolute inset-0 h-full w-full transition-transform duration-700 group-hover:scale-[1.04] ${
                      f.fit === "contain"
                        ? "object-contain object-right-top p-4 opacity-95"
                        : "object-cover opacity-80"
                    }`}
                  />
                  {/* Solid scrim panel (no gradient) so the copy always reads. */}
                  <div className="lg-chip relative flex max-w-[26rem] items-end justify-between gap-4 rounded-2xl p-4">
                    <div>
                      <p className="mono text-[10px] uppercase tracking-[0.2em] text-primary">
                        {f.kind}
                      </p>
                      <h3 className="mt-1.5 text-lg sm:text-xl font-medium leading-snug text-white">
                        {f.title}
                      </h3>
                      <p className="mt-1 text-[13px] leading-snug text-white/70">{f.line}</p>
                    </div>
                    <span
                      aria-hidden
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-white transition-transform group-hover:translate-x-0.5"
                    >
                      →
                    </span>
                  </div>
                </div>
              </a>
            </li>
          ))}
        </ul>
      </section>

      {/* ──────────────────── FEATURED · ACTIVATED MERCH ──────────────────── */}
      <section
        aria-labelledby="merch-title"
        id="merch"
        className={`${SECTION} scroll-mt-20 pb-20 lg:pb-28`}
      >
        <div className="lg-card overflow-hidden rounded-[36px]">
          <div className="grid items-center gap-10 p-6 sm:p-10 lg:grid-cols-12 lg:p-14">
            <div className="lg:col-span-5">
              <p className={EYEBROW}>Activated Merchandise™</p>
              <h2 id="merch-title" className={`${H2} mt-4`}>
                Tap it. Scan it.
                <br />
                <span className="text-primary">It comes alive.</span>
              </h2>
              <p className="mt-6 max-w-md text-muted-foreground">
                A small NFC disc sits in the design and the print is the AR target. Tap a phone or
                point a camera, and the character steps off the shirt.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="/activated-merch/"
                  className="group btn-pill btn-solid px-6 py-3.5 text-sm font-medium"
                >
                  See it in 3D
                  <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </a>
                <a
                  href={SHOP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-pill btn-glass px-6 py-3.5 text-sm font-medium"
                >
                  Shop <span aria-hidden>↗</span>
                  <span className="sr-only">(opens the MEDIALIFE shop in a new tab)</span>
                </a>
              </div>
            </div>
            <a
              href="/activated-merch/"
              className="group relative grid grid-cols-3 gap-3 lg:col-span-7"
              aria-label="Open the Activated Merch collection"
            >
              {[
                ["sukeban-hoodie", "Sukeban AR hoodie"],
                ["syndicate-tee", "Syndicate AR tee"],
                ["trainwreck-hoodie", "Trainwreck AR hoodie"],
              ].map(([k, n], i) => (
                <figure
                  key={k}
                  className={`relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] ${i === 1 ? "-translate-y-4" : "translate-y-4"}`}
                >
                  <img
                    src={`/activated-merch/posters/${k}.webp`}
                    alt={n}
                    width={760}
                    height={760}
                    loading="lazy"
                    decoding="async"
                    className="aspect-[3/4] w-full object-contain p-2 transition-transform duration-700 group-hover:scale-105"
                  />
                  <figcaption className="absolute inset-x-2 bottom-2 rounded-full bg-black/60 px-3 py-1 text-center mono text-[9px] uppercase tracking-[0.16em] text-white/80 backdrop-blur">
                    {n}
                  </figcaption>
                </figure>
              ))}
            </a>
          </div>
        </div>
      </section>

      {/* ───────────────────── FEATURED · EVADE LAUNCH ───────────────────── */}
      <section
        aria-labelledby="evade-title"
        id="evade"
        className={`${SECTION} scroll-mt-20 pb-20 lg:pb-28`}
      >
        <div className="lg-card overflow-hidden rounded-[36px] border-[#f5c84b]/25">
          <div className="grid items-center gap-10 p-6 sm:p-10 lg:grid-cols-12 lg:p-14">
            <div className="relative order-2 lg:order-1 lg:col-span-6">
              <div className="relative mx-auto aspect-[5/4] max-w-[560px]">
                <img
                  src="/evade/creators/assets/img/cola-run-splash-sm.webp"
                  alt="Cola Run, the browser game the keychain unlocks"
                  width={540}
                  height={967}
                  loading="lazy"
                  decoding="async"
                  className="absolute left-[6%] top-0 h-full w-auto -rotate-6 rounded-[28px] border border-white/15 object-cover shadow-2xl"
                />
                <img
                  src="/activated-merch/posters/evade-charms.webp"
                  alt="The EVADE × Bobo keychain: Bobo the cat and the Eclipse can"
                  width={760}
                  height={760}
                  loading="lazy"
                  decoding="async"
                  className="absolute right-0 bottom-0 w-[66%] drop-shadow-[0_30px_40px_rgba(0,0,0,0.6)]"
                />
              </div>
            </div>
            <div className="order-1 lg:order-2 lg:col-span-6">
              <p className="inline-flex items-center gap-2 rounded-full border border-[#f5c84b]/40 bg-[#f5c84b]/10 px-3 py-1 mono text-[10px] uppercase tracking-[0.2em] text-[#f5c84b]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#f5c84b]" aria-hidden />
                New partner launch · EVADE
              </p>
              <h2 id="evade-title" className={`${H2} mt-5`}>
                Bobo, off
                <br />
                the screen.
              </h2>
              <p className="mt-6 max-w-md text-muted-foreground">
                EVADE's Bobo and Eclipse can, on one keychain. Scan it and Cola Run opens in the
                browser. Then follow Bobo around the world.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="/evade/"
                  className="group btn-pill px-6 py-3.5 text-sm font-semibold text-[#1a1300] bg-[#f5c84b] hover:bg-[#ffd765] shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_10px_30px_-10px_rgba(245,200,75,0.7)]"
                >
                  See the launch
                  <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </a>
                <a
                  href="/evade/where-is-bobo/"
                  className="btn-pill btn-glass px-6 py-3.5 text-sm font-medium"
                >
                  Where is Bobo?
                </a>
              </div>
              <a
                href="/evade/creators/"
                className="mt-6 inline-flex items-center gap-2 text-sm text-white/70 hover:text-white"
              >
                Creators: join the EVADE program <span aria-hidden>→</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────── LIVE NOW ─────────────────────────── */}
      {lead && (
        <section
          id="live-now"
          aria-labelledby="live-title"
          className={`${SECTION} scroll-mt-20 pb-20 lg:pb-28`}
        >
          <div className="lg-card grid items-center gap-10 overflow-hidden rounded-[36px] p-6 sm:p-10 lg:grid-cols-12 lg:p-14">
            <div className="lg:col-span-7">
              <div className="flex flex-wrap items-center gap-3">
                <span className="lg-chip inline-flex items-center gap-2 rounded-full px-3 py-1 mono text-[10px] uppercase tracking-[0.2em] text-white">
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse-glow"
                    aria-hidden
                  />
                  {lead.statusLabel}
                </span>
                <span className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {lead.kicker}
                </span>
              </div>
              <h2 id="live-title" className={`${H2} mt-6`}>
                {lead.headline.startsWith(lead.name) ? (
                  <>
                    <span className="text-primary">{lead.name}</span>
                    {lead.headline.slice(lead.name.length)}
                  </>
                ) : (
                  lead.headline
                )}
              </h2>
              <p className="mt-6 max-w-xl text-muted-foreground">{lead.body[0]}</p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                {lead.cta && (
                  <a
                    href={lead.cta.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group btn-pill btn-solid px-6 py-3.5 text-sm font-medium"
                  >
                    {lead.cta.label}
                    <span aria-hidden>↗</span>
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                )}
                <Link to="/live" className="btn-pill btn-glass px-6 py-3.5 text-sm font-medium">
                  All campaigns
                </Link>
              </div>
              <dl className="mt-10 grid max-w-xl grid-cols-3 gap-3">
                {lead.facts.map((f) => (
                  <div key={f.k} className="lg-chip rounded-2xl p-3">
                    <dt className="mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                      {f.k}
                    </dt>
                    <dd className="mt-1 text-xs text-white">{f.v}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="lg:col-span-5">
              {lead.image?.large ? (
                <PosterViewer
                  src={lead.image.src}
                  large={lead.image.large}
                  alt={lead.image.alt}
                  caption={lead.image.caption}
                />
              ) : lead.image ? (
                <img src={lead.image.src} alt={lead.image.alt} loading="lazy" className="w-full" />
              ) : null}
            </div>
          </div>
        </section>
      )}

      {/* ─────────────────────────── FAN REACTIONS ─────────────────────────── */}
      <section
        id="fan-reactions"
        aria-labelledby="fans-title"
        className="scroll-mt-20 overflow-hidden pb-20 lg:pb-28"
      >
        <div className={SECTION}>
          <p className={EYEBROW}>Fan reactions</p>
          <h2 id="fans-title" className={`${H2} mt-4`}>
            Fans don't just see it.
            <br />
            <span className="text-primary">They play it.</span>
          </h2>
        </div>

        <div
          className="mt-10 flex gap-4 animate-marquee motion-reduce:animate-none"
          style={{ width: "max-content", willChange: "transform" }}
        >
          {[...FAN_GIFS, ...FAN_GIFS, ...FAN_GIFS, ...FAN_GIFS].map((src, i) => (
            <div
              key={i}
              aria-hidden={i >= FAN_GIFS.length}
              className="relative h-[280px] w-[160px] flex-shrink-0 overflow-hidden rounded-3xl border border-white/10 bg-secondary"
            >
              <img
                src={src}
                alt={
                  i < FAN_GIFS.length ? "A fan using a MEDIALIFE AR experience at a convention" : ""
                }
                loading="lazy"
                decoding="async"
                width={160}
                height={280}
                className="h-full w-full object-cover"
              />
            </div>
          ))}
        </div>

        <div className={`${SECTION} mt-14`}>
          <p className={EYEBROW}>Selected live deployment performance</p>
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {PERFORMANCE.map((s) => (
              <div key={s.l} className="lg-card rounded-3xl p-5 sm:p-6">
                <CountUp
                  value={s.v}
                  className="block display text-[clamp(30px,3.6vw,48px)] text-primary"
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

      {/* ──────────────────────── CAPABILITIES ──────────────────────── */}
      <section
        id="capabilities"
        aria-labelledby="cap-title"
        className={`${SECTION} scroll-mt-20 pb-20 lg:pb-28`}
      >
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <p className={EYEBROW}>Production capabilities</p>
            <h2 id="cap-title" className={`${H2} mt-4`}>
              Produced
              <br />
              <span className="text-primary">end to end.</span>
            </h2>
            <ul className="mt-8 flex flex-wrap gap-2">
              {TOUCHPOINTS.map((t) => (
                <li
                  key={t}
                  className="lg-chip rounded-full px-3 py-1.5 mono text-[10px] uppercase tracking-[0.16em] text-white/75"
                >
                  {t}
                </li>
              ))}
            </ul>
            <Link
              to="/technology"
              className="mt-8 inline-flex items-center gap-2 text-sm text-primary hover:underline underline-offset-4"
            >
              See the technology stack <span aria-hidden>→</span>
            </Link>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:col-span-8">
            {CAPABILITIES.map((c) => (
              <li key={c.num} className="lg-card rounded-3xl p-6">
                <div className="flex items-center justify-between">
                  <span className="mono text-[10px] text-muted-foreground">/{c.num}</span>
                  <span
                    aria-hidden
                    className="grid h-8 w-8 place-items-center rounded-full border border-white/15 text-sm text-primary"
                  >
                    {c.glyph}
                  </span>
                </div>
                <h3 className="mt-6 text-lg font-medium">{c.name}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{c.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ──────────────────────── SELECTED PROOF ──────────────────────── */}
      <section aria-labelledby="proof-title" className={`${SECTION} pb-20 lg:pb-28`}>
        <p className={EYEBROW}>Selected proof</p>
        <div className="mt-6 grid gap-4 lg:grid-cols-12">
          <div className="lg-card rounded-[32px] p-6 sm:p-10 lg:col-span-7">
            <p className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Netflix / Sakamoto Days
            </p>
            <h2
              id="proof-title"
              className="mt-4 text-2xl md:text-3xl font-medium tracking-tight text-balance"
            >
              Physical media, turned into an app-free fandom experience.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Activated magazines, stickers, posters and life-sized displays across 150+ comic and
              manga retailers and three major North American conventions.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                ["150+", "comic & manga retailers"],
                ["3", "major conventions"],
                ["Platinum", "Pinnacle Award 2025"],
              ].map(([v, l]) => (
                <div key={l} className="lg-chip rounded-2xl p-4">
                  <CountUp value={v} className="block display text-3xl text-primary" />
                  <div className="mt-2 mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {l}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-8 mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Interactions per activated retail unit
            </p>
            <ul className="mt-3 grid gap-2">
              {RETAIL_UNITS.map((r) => (
                <li
                  key={r.name}
                  className="lg-chip flex items-baseline justify-between gap-4 rounded-2xl px-4 py-3"
                >
                  <span className="text-sm">
                    {r.name}
                    <span className="ml-2 mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {r.city}
                    </span>
                  </span>
                  <CountUp
                    value={r.v}
                    className="shrink-0 text-lg font-medium tabular-nums text-primary"
                  />
                </li>
              ))}
            </ul>
            <a
              href="https://medialife-live-ar-media--04pmr63.gamma.site/"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-flex items-center gap-2 text-sm text-primary hover:underline underline-offset-4"
            >
              Read the full AR media case study <span aria-hidden>↗</span>
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </div>

          <div className="lg-card rounded-[32px] p-6 sm:p-10 lg:col-span-5">
            <p className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Award · {AWARD.year}
            </p>
            <p className="mt-4 display text-[clamp(34px,4vw,56px)] text-primary">
              {AWARD.tier} {AWARD.name}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{AWARD.category}</p>
            <div className="mt-6 overflow-hidden rounded-2xl">
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
              className="mt-6 inline-flex items-center gap-2 text-sm text-primary hover:underline underline-offset-4"
            >
              Verify on the Pinnacle Awards site <span aria-hidden>↗</span>
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </div>
        </div>
      </section>

      {/* ──────────────────────── YOU CAN FIND US AT ──────────────────────── */}
      <section
        aria-label="Conventions we attend"
        className="overflow-hidden border-y border-white/10 py-12"
      >
        <p className={`${SECTION} ${EYEBROW} mb-8`}>You can find us at</p>
        <div
          className="flex items-center gap-16 animate-marquee-slow motion-reduce:animate-none"
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
                className="h-12 w-auto opacity-50 grayscale transition hover:opacity-100 hover:grayscale-0"
              />
            ),
          )}
        </div>
      </section>

      {/* ─────────────────────────── CONTACT ─────────────────────────── */}
      <section
        id="contact"
        aria-labelledby="contact-title"
        className={`${SECTION} scroll-mt-20 py-24 lg:py-32 text-center`}
      >
        <p className={EYEBROW}>Bring your IP</p>
        <h2
          id="contact-title"
          className="display mx-auto mt-5 max-w-5xl text-[clamp(48px,8vw,128px)]"
        >
          Let's make yours <span className="text-primary">come alive.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-muted-foreground">
          Entertainment, gaming, retail, live events and licensed IP.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link to="/contact" className="group btn-pill btn-solid px-7 py-4 text-sm font-medium">
            Activate your IP
            <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </Link>
          <Link to="/case-studies" className="btn-pill btn-glass px-7 py-4 text-sm font-medium">
            Case studies
          </Link>
        </div>
      </section>
    </>
  );
}
