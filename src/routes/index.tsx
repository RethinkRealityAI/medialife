import type React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SHOP_URL } from "@/components/site/Nav";
import { PosterViewer } from "@/components/site/PosterViewer";
import { CountUp } from "@/components/site/CountUp";
import { TOUCHPOINTS, PERFORMANCE, RETAIL_UNITS, AWARD } from "@/lib/capabilities";
import { liveCampaigns } from "@/lib/campaigns";
import { Hero } from "@/components/home/Hero";
import { Reveal } from "@/components/home/Reveal";

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

/** Brand highlights alternate between the logo's two colours, never as a gradient. */
type Hue = "blue" | "magenta";
const TEXT: Record<Hue, string> = { blue: "text-primary", magenta: "text-accent" };
const DOT: Record<Hue, string> = { blue: "bg-primary", magenta: "bg-accent" };
const HEX: Record<Hue, string> = { blue: "#19afff", magenta: "#ff2fae" };

function Eyebrow({ hue, children }: { hue: Hue; children: React.ReactNode }) {
  return (
    <p className={`${EYEBROW} inline-flex items-center gap-2.5`}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[hue]}`} aria-hidden />
      {children}
    </p>
  );
}

/* ─────────────────────────── What we do: four pillars ─────────────────────────── */

const PILLARS: { hue: Hue; title: string; line: string; icon: React.ReactNode }[] = [
  {
    hue: "blue",
    title: "Activated products",
    line: "Apparel, keychains, stickers, print and retail displays with NFC and AR built into the design.",
    icon: (
      <>
        <rect x="14" y="6" width="20" height="36" rx="5" pathLength="1" />
        <path d="M21 10h6" pathLength="1" />
        <g className="icon-pulse">
          <path d="M38 17c2.5 2 2.5 12 0 14" pathLength="1" />
          <path d="M42 13c4.5 4 4.5 18 0 22" pathLength="1" />
        </g>
      </>
    ),
  },
  {
    hue: "magenta",
    title: "Immersive experiences",
    line: "Art that comes alive, games anywhere, exclusive content and a 3D collector hub.",
    icon: (
      <>
        <path d="M6 14V8h6M36 8h6v6M42 34v6h-6M12 40H6v-6" pathLength="1" />
        <path d="M24 13l9 5v11l-9 5-9-5V18z" pathLength="1" />
        <path d="M15 18l9 5 9-5M24 23v11" pathLength="1" />
        <g className="icon-pulse">
          <path d="M37 4v4M35 6h4" pathLength="1" />
        </g>
      </>
    ),
  },
  {
    hue: "blue",
    title: "Fan rewards",
    line: "Points, giveaways, collectible sets and first access that bring fans back for the next drop.",
    icon: (
      <>
        <path
          d="M24 7l4.6 9.6 10.4 1.4-7.6 7.2 1.9 10.4L24 30.6l-9.3 5 1.9-10.4L9 18l10.4-1.4z"
          pathLength="1"
        />
        <g className="icon-pulse">
          <path d="M8 40h4M36 40h4M22 42h4" pathLength="1" />
        </g>
      </>
    ),
  },
  {
    hue: "magenta",
    title: "Revenue for IP owners",
    line: "We design, make, sell and fulfil. You earn a royalty on every unit, drop after drop.",
    icon: (
      <>
        <path d="M6 40h36" pathLength="1" />
        <path d="M10 34l9-9 7 6 13-14" pathLength="1" />
        <path d="M32 17h7v7" pathLength="1" />
        <g className="icon-pulse">
          <circle cx="19" cy="25" r="1.6" pathLength="1" />
          <circle cx="26" cy="31" r="1.6" pathLength="1" />
        </g>
      </>
    ),
  },
];

/* ─────────────────────────── Who we've worked with ─────────────────────────── */

/** Names drawn from the site's approved case studies and live campaigns only. */
const PARTNERS = ["Netflix", "ONE PIECE", "Sakamoto Days", "Den of Geek", "EVADE"];

/* ─────────────────────────── Activated products ─────────────────────────── */

/** Real fans with the activated Sakamoto Days posters (from the case study). */
const SAKAMOTO_SHOTS = [
  {
    src: "/work/sakamoto-fans-two.webp",
    alt: "Two fans holding the activated Sakamoto Days poster",
  },
  {
    src: "/work/sakamoto-escalator.webp",
    alt: "Cosplayers with the Den of Geek Sakamoto Days poster",
  },
  {
    src: "/work/sakamoto-street-crowd.webp",
    alt: "Fans on the street as a Sakamoto Days character pops out of the poster in AR",
  },
];

const PRODUCTS: {
  name: string;
  tags: string;
  img: string;
  alt: string;
  span: string;
  cover?: boolean;
}[] = [
  {
    name: "Apparel",
    tags: "NFC · AR",
    img: "/activated-merch/posters/syndicate-tee.webp",
    alt: "The Syndicate AR tee",
    span: "col-span-2 row-span-2",
  },
  {
    name: "Keychains + charms",
    tags: "QR · Game",
    img: "/activated-merch/posters/evade-charms.webp",
    alt: "The EVADE Bobo and Eclipse can charm set",
    span: "",
  },
  {
    name: "Stickers",
    tags: "NFC · AR",
    img: "/activated-merch/posters/ar-stickers.webp",
    alt: "A pack of activated AR stickers",
    span: "",
  },
  {
    name: "Posters + print",
    tags: "AR · QR",
    img: "/live/one-piece-poster.webp",
    alt: "The activated ONE PIECE poster",
    span: "row-span-2",
    cover: true,
  },
  {
    name: "Hoodies",
    tags: "NFC · AR",
    img: "/activated-merch/posters/sukeban-hoodie.webp",
    alt: "The Sukeban AR hoodie",
    span: "row-span-2",
  },
  {
    name: "Collectibles",
    tags: "NFC",
    img: "/medialife/activated-retail/assets/ml_reward_figure.webp",
    alt: "An activated collectible figure with matching charms",
    span: "col-span-2",
    cover: true,
  },
  {
    name: "Desk mats",
    tags: "AR · QR",
    img: "/medialife/activated-retail/assets/ml_mat.webp",
    alt: "An activated desk mat with a scannable print",
    span: "col-span-2 lg:col-span-3",
    cover: true,
  },
  {
    name: "Retail displays",
    tags: "NFC · AR",
    img: "/medialife/activated-retail/page/showcase-poster-sm.webp",
    alt: "The MEDIALIFE activated retail fixture",
    span: "col-span-2 lg:col-span-3",
    cover: true,
  },
];

/* ─────────────────────────── Immersive experiences ─────────────────────────── */

const EXPERIENCES: {
  hue: Hue;
  title: string;
  line: string;
  img: string;
  alt: string;
  href: string;
}[] = [
  {
    hue: "magenta",
    title: "Art that comes alive",
    line: "Point at the print and the design moves, talks and plays.",
    img: "/home/ar/one-piece-alive.webp",
    alt: "The ONE PIECE poster, animated in AR",
    href: "/live",
  },
  {
    hue: "blue",
    title: "Games anywhere",
    line: "A mini-game opens straight from the merch. Cola Run starts from the EVADE charms.",
    img: "/evade/creators/assets/img/cola-run-splash-sm.webp",
    alt: "Cola Run, the browser game unlocked by the EVADE charms",
    href: "/evade/",
  },
  {
    hue: "magenta",
    title: "A collector hub",
    line: "A 3D home that fills up with everything a fan owns, with perks and drops landing there first.",
    img: "/home/hub.webp",
    alt: "Bobo's Hideout, a two-floor 3D collector room shaped like a charm",
    href: "/evade/",
  },
  {
    hue: "blue",
    title: "Shared adventures",
    line: "Fans film Bobo in AR wherever they are and pin the clips on a live world map.",
    img: "/home/bobo-golden-gate.webp",
    alt: "Bobo in AR in front of the Golden Gate Bridge",
    href: "/evade/where-is-bobo/",
  },
];

/* ─────────────────────────── The ecosystem ─────────────────────────── */

const LOOP = ["Buy", "Tap", "Play", "Collect", "Next drop"];

const SIDES: { hue: Hue; who: string; title: string; points: string[] }[] = [
  {
    hue: "magenta",
    who: "For fans",
    title: "Rewarded for playing.",
    points: [
      "Points and giveaways for playing, sharing and referring friends",
      "First access to new drops, perks and secret items in the hub",
      "Sets and rare pieces worth completing",
    ],
  },
  {
    hue: "blue",
    who: "For the IP",
    title: "Every tap leads back to your world.",
    points: [
      "Experiences built around your characters and story",
      "Creator program: kits, briefs and content that sells",
      "Data on who bought, played and came back",
    ],
  },
  {
    hue: "magenta",
    who: "For IP owners",
    title: "A new revenue channel, $0 to start.",
    points: [
      "Design, production and fulfilment, done for you",
      "We fund the launch; you earn a royalty on every unit",
      "Sold where fans are: your store, creators, conventions and specialty retail",
    ],
  },
];

function Home() {
  const lead = liveCampaigns()[0];
  const perf = [PERFORMANCE[0], PERFORMANCE[1], PERFORMANCE[2], PERFORMANCE[4]].filter(Boolean);

  return (
    <>
      <Hero />

      {/* ─────────────── 1. FANS DON'T JUST SEE IT. THEY PLAY IT. ─────────────── */}
      <section
        id="fan-reactions"
        aria-labelledby="fans-title"
        className="scroll-mt-20 overflow-hidden py-20 lg:py-28"
      >
        <div className={`${SECTION} flex flex-wrap items-end justify-between gap-6`}>
          <Reveal>
            <Eyebrow hue="magenta">Fan reactions</Eyebrow>
            <h2 id="fans-title" className={`${H2} mt-4`}>
              Fans don't just see it.
              <br />
              <span className={TEXT.magenta}>They play it.</span>
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="max-w-sm text-muted-foreground">
              Real fans at real conventions, scanning, tapping and filming what happens next.
            </p>
          </Reveal>
        </div>

        <div
          className="mt-10 flex gap-4 animate-marquee motion-reduce:animate-none"
          style={{ width: "max-content", willChange: "transform" }}
        >
          {[...FAN_GIFS, ...FAN_GIFS, ...FAN_GIFS, ...FAN_GIFS].map((src, i) => (
            <div
              key={i}
              aria-hidden={i >= FAN_GIFS.length}
              className="relative h-[300px] w-[172px] flex-shrink-0 overflow-hidden rounded-3xl border border-white/10 bg-secondary"
            >
              <img
                src={src}
                alt={
                  i < FAN_GIFS.length ? "A fan using a MEDIALIFE AR experience at a convention" : ""
                }
                loading="lazy"
                decoding="async"
                width={172}
                height={300}
                className="h-full w-full object-cover"
              />
            </div>
          ))}
        </div>

        <div className={`${SECTION} mt-12`}>
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {perf.map((s, i) => (
              <Reveal as="li" key={s.l} delay={i * 80} className="lg-card rounded-3xl p-5 sm:p-6">
                <CountUp
                  value={s.v}
                  className={`block display text-[clamp(30px,3.6vw,48px)] ${i % 2 ? TEXT.magenta : TEXT.blue}`}
                />
                <div className="mt-2 text-xs text-muted-foreground">{s.l}</div>
              </Reveal>
            ))}
          </ul>
          <p className="mt-4 mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Ranges across selected live deployments · not a single campaign
          </p>
        </div>
      </section>

      {/* ─────────────────────────── 2. WHAT WE DO ─────────────────────────── */}
      <section
        id="capabilities"
        aria-labelledby="what-title"
        className={`${SECTION} scroll-mt-20 pb-20 lg:pb-28`}
      >
        <div className="grid gap-10 lg:grid-cols-12 lg:items-end">
          <Reveal className="lg:col-span-7">
            <Eyebrow hue="blue">What we do</Eyebrow>
            <h2 id="what-title" className={`${H2} mt-4`}>
              We make the things fans buy <span className={TEXT.blue}>come alive.</span>
            </h2>
          </Reveal>
          <Reveal delay={120} className="lg:col-span-5">
            <p className="text-muted-foreground lg:text-lg">
              MEDIALIFE designs, makes and runs activated products for entertainment and gaming IP.
              Each one opens an experience in the browser, so there is no app to download.
            </p>
          </Reveal>
        </div>

        <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((p, i) => (
            <Reveal
              as="li"
              key={p.title}
              delay={i * 110}
              className="lg-card rounded-[28px] p-6 sm:p-7"
            >
              <svg
                viewBox="0 0 48 48"
                width="56"
                height="56"
                fill="none"
                stroke={HEX[p.hue]}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className="draw"
              >
                {p.icon}
              </svg>
              <h3 className="mt-8 text-xl font-medium text-white">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.line}</p>
            </Reveal>
          ))}
        </ul>

        <Reveal delay={200} className="mt-8 flex flex-wrap items-center gap-2">
          {TOUCHPOINTS.map((t) => (
            <span
              key={t}
              className="lg-chip rounded-full px-3 py-1.5 mono text-[10px] uppercase tracking-[0.16em] text-white/75"
            >
              {t}
            </span>
          ))}
          <Link
            to="/technology"
            className="ml-1 inline-flex items-center gap-2 px-2 text-sm text-primary hover:underline underline-offset-4"
          >
            The technology <span aria-hidden>→</span>
          </Link>
        </Reveal>
      </section>

      {/* ─────────────────────── 3. WHO WE'VE WORKED WITH ─────────────────────── */}
      <section
        id="partners"
        aria-labelledby="partners-title"
        className="scroll-mt-20 overflow-hidden pb-20 lg:pb-28"
      >
        <div className={SECTION}>
          <Reveal>
            <Eyebrow hue="magenta">Who we've worked with</Eyebrow>
            <h2 id="partners-title" className={`${H2} mt-4`}>
              Built with the worlds <span className={TEXT.magenta}>fans love.</span>
            </h2>
          </Reveal>

          <Reveal
            delay={100}
            as="ul"
            className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
          >
            {PARTNERS.map((n) => (
              <li
                key={n}
                className="lg-card grid h-24 last:col-span-2 sm:last:col-span-1 place-items-center rounded-3xl px-4 text-center display text-[clamp(20px,2.2vw,30px)] text-white/90"
              >
                {n}
              </li>
            ))}
          </Reveal>

          <div className="mt-3 grid gap-3 lg:grid-cols-12">
            <Reveal
              delay={160}
              className="lg-card flex flex-col rounded-3xl p-6 sm:p-8 lg:col-span-7"
            >
              <p className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Netflix / Sakamoto Days
              </p>
              <p className="mt-3 text-xl sm:text-2xl font-medium tracking-tight text-balance">
                Activated magazines, stickers, posters and life-sized displays across 150+ comic and
                manga retailers and three major conventions.
              </p>
              <ul className="mt-6 grid flex-1 grid-cols-3 gap-2">
                {SAKAMOTO_SHOTS.map((s) => (
                  <li key={s.src} className="min-h-[140px] overflow-hidden rounded-2xl">
                    <img
                      src={s.src}
                      alt={s.alt}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  </li>
                ))}
              </ul>
              <ul className="mt-3 grid gap-2 sm:grid-cols-3">
                {RETAIL_UNITS.map((r) => (
                  <li key={r.name} className="lg-chip rounded-2xl px-4 py-3">
                    <CountUp value={r.v} className="block display text-2xl text-primary" />
                    <span className="mt-1 block text-xs text-white/80">{r.name}</span>
                    <span className="mono text-[9px] uppercase tracking-widest text-muted-foreground">
                      interactions · {r.city}
                    </span>
                  </li>
                ))}
              </ul>
              <Link
                to="/case-studies"
                className="mt-6 inline-flex items-center gap-2 text-sm text-primary hover:underline underline-offset-4"
              >
                Read the case studies <span aria-hidden>→</span>
              </Link>
            </Reveal>
            <Reveal delay={220} className="lg-card rounded-3xl p-6 sm:p-8 lg:col-span-5">
              <p className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Award · {AWARD.year}
              </p>
              <p className={`mt-3 display text-[clamp(32px,3.6vw,52px)] ${TEXT.magenta}`}>
                {AWARD.tier} {AWARD.name}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{AWARD.category}</p>
              <div className="mt-5 overflow-hidden rounded-2xl">
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
                className="mt-5 inline-flex items-center gap-2 text-sm text-primary hover:underline underline-offset-4"
              >
                Verify on the Pinnacle Awards site <span aria-hidden>↗</span>
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </Reveal>
          </div>
        </div>

        <div aria-label="Conventions we attend" role="group" className="mt-12">
          <p className={`${SECTION} ${EYEBROW} mb-6`}>You can find us at</p>
          <div
            className="flex items-center gap-16 animate-marquee-slow motion-reduce:animate-none"
            style={{ width: "max-content" }}
          >
            {[
              ...CONVENTION_LOGOS,
              ...CONVENTION_LOGOS,
              ...CONVENTION_LOGOS,
              ...CONVENTION_LOGOS,
            ].map((l, i) => (
              <img
                key={i}
                src={l.src}
                alt={i < CONVENTION_LOGOS.length ? l.name : ""}
                aria-hidden={i >= CONVENTION_LOGOS.length}
                loading="lazy"
                className="h-11 w-auto opacity-55 grayscale transition hover:opacity-100 hover:grayscale-0"
              />
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────────── 4. LATEST LAUNCHES ─────────────────────────── */}
      <section
        id="launches"
        aria-labelledby="launches-title"
        className={`${SECTION} scroll-mt-20 pb-20 lg:pb-28`}
      >
        <Reveal>
          <Eyebrow hue="blue">Latest launches</Eyebrow>
          <h2 id="launches-title" className={`${H2} mt-4`}>
            Out now. <span className={TEXT.blue}>Go play.</span>
          </h2>
        </Reveal>

        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          {/* EVADE × Bobo */}
          <Reveal delay={80} className="h-full">
            <article
              id="evade"
              aria-labelledby="evade-title"
              className="lg-card flex h-full scroll-mt-24 flex-col overflow-hidden rounded-[32px] border-[#f5c84b]/25"
            >
              <div className="relative aspect-[16/10] overflow-hidden">
                <img
                  src="/evade/creators/assets/img/cola-run-splash-sm.webp"
                  alt="Cola Run, the browser game the charms unlock"
                  loading="lazy"
                  decoding="async"
                  className="absolute left-[8%] top-[8%] h-[120%] w-auto -rotate-6 rounded-[24px] border border-white/15 object-cover shadow-2xl"
                />
                <img
                  src="/activated-merch/posters/evade-charms.webp"
                  alt="The EVADE × Bobo charms: Bobo the cat and the Eclipse can"
                  loading="lazy"
                  decoding="async"
                  className="absolute -bottom-[6%] right-[2%] w-[58%] drop-shadow-[0_30px_40px_rgba(0,0,0,0.6)]"
                />
              </div>
              <div className="flex flex-1 flex-col p-6 sm:p-8">
                <p className="inline-flex w-fit items-center gap-2 rounded-full border border-[#f5c84b]/40 bg-[#f5c84b]/10 px-3 py-1 mono text-[10px] uppercase tracking-[0.2em] text-[#f5c84b]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#f5c84b]" aria-hidden />
                  New · EVADE × Bobo
                </p>
                <h3 id="evade-title" className="mt-4 display text-[clamp(32px,3.4vw,52px)]">
                  Bobo, off the screen.
                </h3>
                <p className="mt-3 max-w-md text-muted-foreground">
                  Bobo and the Eclipse can on one charm set. Scan it and Cola Run opens in the
                  browser, then follow Bobo around the world.
                </p>
                <div className="mt-auto flex flex-wrap items-center gap-3 pt-6">
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
                  <a
                    href="/evade/creators/"
                    className="px-2 text-sm text-white/70 hover:text-white"
                  >
                    Creators: join <span aria-hidden>→</span>
                  </a>
                </div>
              </div>
            </article>
          </Reveal>

          {/* ONE PIECE */}
          {lead && (
            <Reveal delay={160} className="h-full">
              <article
                id="live-now"
                aria-labelledby="live-title"
                className="lg-card grid h-full scroll-mt-24 overflow-hidden rounded-[32px] sm:grid-cols-[1fr_1.1fr]"
              >
                <div className="flex flex-col p-6 sm:p-8">
                  <span className="lg-chip inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 mono text-[10px] uppercase tracking-[0.2em] text-white">
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse-glow"
                      aria-hidden
                    />
                    {lead.statusLabel}
                  </span>
                  <h3 id="live-title" className="mt-4 display text-[clamp(32px,3.4vw,52px)]">
                    <span className={TEXT.magenta}>{lead.name}</span>, activated.
                  </h3>
                  <p className="mt-3 text-muted-foreground">{lead.body[0]}</p>
                  <dl className="mt-5 grid gap-2">
                    {lead.facts.map((f) => (
                      <div
                        key={f.k}
                        className="flex items-baseline justify-between gap-3 border-b border-white/10 pb-2"
                      >
                        <dt className="mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                          {f.k}
                        </dt>
                        <dd className="text-right text-xs text-white">{f.v}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-auto flex flex-wrap items-center gap-3 pt-6">
                    {lead.cta && (
                      <a
                        href={lead.cta.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-pill bg-accent px-6 py-3.5 text-sm font-semibold text-white hover:brightness-110"
                      >
                        {lead.cta.label} <span aria-hidden>↗</span>
                        <span className="sr-only">(opens in a new tab)</span>
                      </a>
                    )}
                    <Link to="/live" className="btn-pill btn-glass px-6 py-3.5 text-sm font-medium">
                      All campaigns
                    </Link>
                  </div>
                </div>
                <div className="p-4 sm:p-5 sm:pl-0">
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
                      className="w-full rounded-2xl"
                    />
                  ) : null}
                </div>
              </article>
            </Reveal>
          )}
        </div>
      </section>

      {/* ─────────────────────────── 5. ACTIVATED PRODUCTS ─────────────────────────── */}
      <section
        id="merch"
        aria-labelledby="merch-title"
        className={`${SECTION} scroll-mt-20 pb-20 lg:pb-28`}
      >
        <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
          <Reveal className="lg:col-span-7">
            <Eyebrow hue="blue">Activated Merchandise™ · Activated Apparel™</Eyebrow>
            <h2 id="merch-title" className={`${H2} mt-4`}>
              Tap it. Scan it.
              <br />
              <span className={TEXT.blue}>It comes alive.</span>
            </h2>
          </Reveal>
          <Reveal delay={120} className="lg:col-span-5">
            <p className="text-muted-foreground lg:text-lg">
              A flat NFC disc sits inside the design and the print itself is the AR target. One tap
              or scan and it plays, on any product fans already love to own.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
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
          </Reveal>
        </div>

        <ul className="mt-10 grid grid-flow-dense auto-rows-[170px] grid-cols-2 gap-3 sm:auto-rows-[200px] md:grid-cols-4 lg:auto-rows-[220px] lg:grid-cols-6">
          {PRODUCTS.map((p, i) => (
            <Reveal as="li" key={p.name} delay={(i % 4) * 70} className={`${p.span} min-w-0`}>
              <a
                href="/activated-merch/"
                className="lg-card group relative flex h-full overflow-hidden rounded-[24px]"
              >
                <img
                  src={p.img}
                  alt={p.alt}
                  loading="lazy"
                  decoding="async"
                  className={`absolute inset-0 h-full w-full transition-transform duration-700 group-hover:scale-[1.05] ${p.cover ? "object-cover opacity-90" : "object-contain p-3"}`}
                />
                <span className="lg-chip absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-medium text-white">
                  {p.name}
                  <span
                    className={`mono text-[9px] uppercase tracking-[0.16em] ${i % 2 ? TEXT.magenta : TEXT.blue}`}
                  >
                    {p.tags}
                  </span>
                </span>
              </a>
            </Reveal>
          ))}
        </ul>
      </section>

      {/* ─────────────────────────── 6. IMMERSIVE EXPERIENCES ─────────────────────────── */}
      <section
        id="experiences"
        aria-labelledby="exp-title"
        className={`${SECTION} scroll-mt-20 pb-20 lg:pb-28`}
      >
        <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
          <Reveal className="lg:col-span-7">
            <Eyebrow hue="magenta">Immersive experiences</Eyebrow>
            <h2 id="exp-title" className={`${H2} mt-4`}>
              One tap, <span className={TEXT.magenta}>many worlds.</span>
            </h2>
          </Reveal>
          <Reveal delay={120} className="lg:col-span-5">
            <p className="text-muted-foreground lg:text-lg">
              Every drop gets the experience that fits the IP, with exclusive videos, music and
              early access layered on top. EVADE × Bobo uses all four.
            </p>
          </Reveal>
        </div>

        <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {EXPERIENCES.map((e, i) => (
            <Reveal as="li" key={e.title} delay={i * 100}>
              <a
                href={e.href}
                className="lg-card group flex h-full flex-col overflow-hidden rounded-[28px]"
              >
                <div className="relative aspect-[4/5] overflow-hidden bg-black/40">
                  <img
                    src={e.img}
                    alt={e.alt}
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.05]"
                  />
                  <span
                    aria-hidden
                    className={`absolute left-4 top-4 grid h-8 w-8 place-items-center rounded-full mono text-[11px] text-white ${DOT[e.hue]}`}
                  >
                    {i + 1}
                  </span>
                </div>
                <div className="p-5 sm:p-6">
                  <h3 className="text-lg font-medium text-white">{e.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{e.line}</p>
                </div>
              </a>
            </Reveal>
          ))}
        </ul>
      </section>

      {/* ─────────────────────────── 7. THE ECOSYSTEM ─────────────────────────── */}
      <section
        id="ecosystem"
        aria-labelledby="eco-title"
        className={`${SECTION} scroll-mt-20 pb-20 lg:pb-28`}
      >
        <div className="lg-card overflow-hidden rounded-[36px] p-6 sm:p-10 lg:p-14">
          <Reveal>
            <Eyebrow hue="blue">The Activated Merch program</Eyebrow>
            <h2 id="eco-title" className={`${H2} mt-4 max-w-5xl`}>
              Fans get rewarded. <span className={TEXT.blue}>Your IP grows.</span>{" "}
              <span className={TEXT.magenta}>You get paid.</span>
            </h2>
            <p className="mt-6 max-w-2xl text-muted-foreground lg:text-lg">
              Every product is a way in. Fans are rewarded for playing, every reward ties back to
              your world, and each drop sells the next one.
            </p>
          </Reveal>

          <Reveal delay={120}>
            <ol
              aria-label="How the program loops"
              className="mt-10 flex flex-wrap items-center gap-2 sm:gap-3"
            >
              {LOOP.map((s, i) => (
                <li key={s} className="flex items-center gap-2 sm:gap-3">
                  <span
                    className="loop-step rounded-full border px-4 py-2 display text-lg sm:text-2xl"
                    style={
                      {
                        "--i": i,
                        "--c": i % 2 ? HEX.magenta : HEX.blue,
                      } as React.CSSProperties
                    }
                  >
                    {s}
                  </span>
                  {i < LOOP.length - 1 && (
                    <span aria-hidden className="text-white/40">
                      →
                    </span>
                  )}
                </li>
              ))}
              <li aria-hidden className="text-white/40">
                ↺
              </li>
            </ol>
          </Reveal>

          <div className="mt-10 grid gap-3 lg:grid-cols-3">
            {SIDES.map((c, i) => (
              <Reveal key={c.who} delay={160 + i * 100} className="lg-chip rounded-3xl p-6">
                <p className={`mono text-[10px] uppercase tracking-[0.22em] ${TEXT[c.hue]}`}>
                  {c.who}
                </p>
                <h3 className="mt-3 text-xl font-medium text-white">{c.title}</h3>
                <ul className="mt-4 grid gap-2.5">
                  {c.points.map((pt) => (
                    <li key={pt} className="flex gap-2.5 text-sm leading-snug text-white/75">
                      <span
                        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${DOT[c.hue]}`}
                        aria-hidden
                      />
                      {pt}
                    </li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </div>

          <Reveal delay={260} className="mt-10 flex flex-wrap gap-3">
            <Link
              to="/contact"
              className="group btn-pill btn-solid px-6 py-3.5 text-sm font-medium"
            >
              Activate your IP
              <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
            <Link
              to="/activated-retail"
              className="btn-pill btn-glass px-6 py-3.5 text-sm font-medium"
            >
              The retail program
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ─────────────────────────── CONTACT ─────────────────────────── */}
      <section
        id="contact"
        aria-labelledby="contact-title"
        className={`${SECTION} scroll-mt-20 border-t border-white/10 py-24 lg:py-32 text-center`}
      >
        <Eyebrow hue="magenta">Bring your IP</Eyebrow>
        <h2
          id="contact-title"
          className="display mx-auto mt-5 max-w-5xl text-[clamp(48px,8vw,128px)]"
        >
          Let's make yours <span className={TEXT.magenta}>come alive.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-muted-foreground">
          Entertainment, gaming, creators, retail and licensed IP.
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
