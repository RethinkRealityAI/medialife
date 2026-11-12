import type React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SHOP_URL } from "@/components/site/Nav";
import { PosterViewer } from "@/components/site/PosterViewer";
import { CountUp } from "@/components/site/CountUp";
import { PERFORMANCE, RETAIL_UNITS, AWARD } from "@/lib/capabilities";
import { liveCampaigns } from "@/lib/campaigns";
import { Hero } from "@/components/home/Hero";
import { Reveal } from "@/components/home/Reveal";
import { LogoBand, type PartnerLogo } from "@/components/home/LogoBand";
import { InViewVideo } from "@/components/home/InViewVideo";
import { MarketingCollage } from "@/components/home/MarketingCollage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MEDIALIFE | Immersive products & experiences that come alive" },
      {
        name: "description",
        content:
          "MEDIALIFE is an immersive AI studio that commercializes entertainment and gaming IP with app-free experiences and real-time analytics: activated products, activated print, retail, live events and browser games that open with a tap or scan.",
      },
      { property: "og:title", content: "MEDIALIFE | We activate everything we touch" },
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
/** Sections sit in one centred column, so large screens don't blow everything up. */
const SECTION = "relative mx-auto w-full max-w-[1280px] px-5 sm:px-8 lg:px-16";
/**
 * Section headings stay well under the hero title (which tops out at 100px), so
 * the hero keeps the lead: about half its size.
 */
const H2 = "display text-[clamp(30px,3.4vw,54px)]";

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

/** A service's heading block: icon, tag, title, one line and its flow, step by step. */
function ServiceIntro({ sv, id }: { sv: (typeof SERVICES)[number]; id: string }) {
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <span className="svc-icon grid h-14 w-14 place-items-center rounded-2xl">
          <svg
            viewBox="0 0 48 48"
            width="40"
            height="40"
            fill="none"
            stroke={HEX[sv.hue]}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="draw"
          >
            {sv.icon}
          </svg>
        </span>
        <span
          className={`lg-chip rounded-full px-3 py-1.5 mono text-[10px] uppercase tracking-[0.2em] ${TEXT[sv.hue]}`}
        >
          {sv.tag}
        </span>
      </div>
      <h3 id={id} className="mt-6 display text-[clamp(24px,2.2vw,34px)] text-white">
        {sv.title}
      </h3>
      <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground sm:text-[17px]">
        {sv.line}
      </p>
      <ol
        className="mt-7 flex flex-wrap items-center gap-2"
        aria-label={`${sv.title}, step by step`}
      >
        {sv.flow.map((f, k) => (
          <li key={f} className="flex items-center gap-2">
            <span
              className="svc-step rounded-full border px-3.5 py-2 text-[13px] text-white/85"
              style={{ "--k": k } as React.CSSProperties}
            >
              {f}
            </span>
            {k < sv.flow.length - 1 && (
              <span aria-hidden className="text-white/35">
                →
              </span>
            )}
          </li>
        ))}
      </ol>
    </>
  );
}

/* ─────────────────────────── What we do: two flagship services ─────────────────────────── */

const SERVICES: {
  hue: Hue;
  tag: string;
  title: string;
  line: string;
  flow: string[];
  link: { label: string; href: string };
  icon: React.ReactNode;
}[] = [
  {
    hue: "blue",
    tag: "Flagship",
    title: "Activated products",
    line: "Merch, apparel and collectibles that tie straight back to the IP. One tap opens a mini-game built on the IP, and it sends fans on to the real game, on whatever platform it lives.",
    flow: ["The product", "IP mini-game", "Back to the game"],
    link: { label: "See activated products", href: "/activated-merch/" },
    icon: (
      <>
        <path
          d="M17 7 7 12.5l3.5 8.5 4.5-2.2V41h18V18.8l4.5 2.2 3.5-8.5L31 7c-1.2 3.4-3.8 5.4-7 5.4S18.2 10.4 17 7Z"
          pathLength="1"
        />
        <circle cx="24" cy="26" r="3.2" pathLength="1" />
        <g className="icon-pulse">
          <path d="M29 22.5c1.6 2 1.6 5 0 7" pathLength="1" />
          <path d="M19 22.5c-1.6 2-1.6 5 0 7" pathLength="1" />
        </g>
      </>
    ),
  },
  {
    hue: "magenta",
    tag: "IP launches",
    title: "Immersive marketing",
    line: "Posters, magazines, stickers, retail displays and live events that turn an IP launch into something fans can play with, film and share.",
    flow: ["Print + retail", "AR moment", "Watch, share, buy"],
    link: { label: "Read the case studies", href: "/case-studies" },
    icon: (
      <>
        <rect x="9" y="6" width="24" height="32" rx="2.5" pathLength="1" />
        <path d="M13 31l6-7 4 4 3-3 3 4" pathLength="1" />
        <circle cx="25" cy="15" r="2.6" pathLength="1" />
        <g className="icon-pulse">
          <path d="M38 22v8M34 26h8" pathLength="1" />
          <path d="M40 38v4M38 40h4" pathLength="1" />
        </g>
      </>
    ),
  },
];

/**
 * The experience formats we build. All of them open in the browser. Each card
 * plays a short real clip (public/home/formats/, cut to 4:5 loops). The mini-game,
 * collector hub and fan rewards clips are stand-ins until the gameplay,
 * hub and rewards captures are uploaded.
 */
const FORMATS: {
  hue: Hue;
  title: string;
  line: string;
  icon: React.ReactNode;
  clip: {
    src: string;
    poster: string;
    caption: string;
    label: string;
    /** Vertical focus of the clip (object-position y) where laptops crop it to 4:3 */
    pos?: string;
  };
}[] = [
  {
    hue: "blue",
    title: "Image-tracked AR",
    line: "The artwork is the trigger. Posters, prints and packaging come alive on camera.",
    icon: (
      <>
        <path
          d="M5 13V7a2 2 0 0 1 2-2h6M35 5h6a2 2 0 0 1 2 2v6M43 35v6a2 2 0 0 1-2 2h-6M13 43H7a2 2 0 0 1-2-2v-6"
          pathLength="1"
        />
        <rect x="14" y="12" width="20" height="24" rx="2" pathLength="1" />
        <g className="icon-pulse">
          <path d="M19 30l4-5 3 3 3-4" pathLength="1" />
        </g>
      </>
    ),
    clip: {
      src: "/home/formats/image-tracked.mp4",
      poster: "/home/formats/image-tracked.webp",
      pos: "72%",
      caption: "Convention tee + sport cards",
      label: "A fan scans a creator tee at Anime NYC, then activated sport cards come alive",
    },
  },
  {
    hue: "magenta",
    title: "World-tracked AR",
    line: "Characters step into any room or street and stay put while fans walk around them.",
    icon: (
      <>
        <path d="M6 36l18 8 18-8-18-8z" pathLength="1" />
        <path d="M24 30V12" pathLength="1" />
        <circle cx="24" cy="9" r="4" pathLength="1" />
        <g className="icon-pulse">
          <path d="M14 20c-3 2-3 6 0 8M34 20c3 2 3 6 0 8" pathLength="1" />
        </g>
      </>
    ),
    clip: {
      src: "/home/formats/world-tracked.mp4",
      poster: "/home/formats/world-tracked.webp",
      pos: "78%",
      caption: "EVADE × Bobo · Golden Gate",
      label: "Bobo the cat placed in AR at the Golden Gate Bridge",
    },
  },
  {
    hue: "blue",
    title: "Geospatial",
    line: "Experiences pinned to real places, from city landmarks to convention halls.",
    icon: (
      <>
        <circle cx="24" cy="24" r="17" pathLength="1" />
        <path d="M7 24h34M24 7c-6 5-6 29 0 34M24 7c6 5 6 29 0 34" pathLength="1" />
        <g className="icon-pulse">
          <path d="M33 13a4 4 0 0 1 4 4c0 3-4 7-4 7s-4-4-4-7a4 4 0 0 1 4-4z" pathLength="1" />
        </g>
      </>
    ),
    clip: {
      src: "/home/formats/geospatial.mp4",
      poster: "/home/formats/geospatial.webp",
      pos: "45%",
      caption: "Sakamoto Days × Netflix",
      label: "Sakamoto Days written across a real building in AR",
    },
  },
  {
    hue: "magenta",
    title: "Immersive mini-games",
    line: "Games built on the IP that open straight from the product, like EVADE Cola Run. Nothing to install.",
    icon: (
      <>
        <path
          d="M15 17h18a9 9 0 0 1 9 9v2.5a6.5 6.5 0 0 1-12 3.4L28.5 30h-9L18 31.9a6.5 6.5 0 0 1-12-3.4V26a9 9 0 0 1 9-9Z"
          pathLength="1"
        />
        <path d="M15 21.5v7M11.5 25h7" pathLength="1" />
        <g className="icon-pulse">
          <circle cx="32" cy="23.5" r="1.6" pathLength="1" />
          <circle cx="35.5" cy="27" r="1.6" pathLength="1" />
        </g>
      </>
    ),
    clip: {
      src: "/home/formats/mini-games.mp4",
      poster: "/home/formats/mini-games.webp",
      pos: "85%",
      caption: "EVADE Cola Run",
      label: "Bobo running in EVADE Cola Run, played in the browser",
    },
  },
  {
    hue: "blue",
    title: "3D collector hubs",
    line: "A home for everything a fan owns, where new drops and rewards land first.",
    icon: (
      <>
        <path d="M24 5l17 9v20l-17 9-17-9V14z" pathLength="1" />
        <path d="M7 14l17 9 17-9M24 23v20" pathLength="1" />
        <g className="icon-pulse">
          <path d="M38 4v5M35.5 6.5h5" pathLength="1" />
        </g>
      </>
    ),
    clip: {
      src: "/home/formats/collector-hub.mp4",
      poster: "/home/formats/collector-hub.webp",
      pos: "60%",
      caption: "Bobo's Hideout",
      label: "Bobo's Hideout, the EVADE collector hub, building itself in 3D",
    },
  },
  {
    hue: "magenta",
    title: "Fan rewards",
    line: "Points, giveaways and collectible sets that bring fans back for the next drop.",
    icon: (
      <>
        <path
          d="M24 7l4.6 9.6 10.4 1.4-7.6 7.2 1.9 10.4L24 30.6l-9.3 5 1.9-10.4L9 18l10.4-1.4z"
          pathLength="1"
        />
        <g className="icon-pulse">
          <path d="M8 41h4M36 41h4M22 43h4" pathLength="1" />
        </g>
      </>
    ),
    clip: {
      src: "/home/formats/fan-rewards.mp4",
      poster: "/home/formats/fan-rewards.webp",
      pos: "55%",
      caption: "EVADE keychain unlock",
      label: "Bobo and the Eclipse can popping out of the EVADE keychain",
    },
  },
];

/** What every experience measures, live (from the approved capabilities copy). */
const MEASURES = [
  "Scans + taps",
  "Dwell time",
  "Repeat visits",
  "CTA conversion",
  "Location",
  "Placement",
];

/* ─────────────────────────── Partner logos ─────────────────────────── */

/**
 * Approved partners only (see capabilities.ts). The ONE PIECE, Sakamoto Days
 * and Den of Geek marks are cut from our own campaign art in the Activated
 * Experiences deck. They sit in white so the strip reads as one, and light up
 * in their brand colours (the *-color files) on hover or tap. ONE PIECE is
 * black on parchment in the campaign, so it lights up parchment.
 */
const LOGOS: PartnerLogo[] = [
  {
    src: "/home/logos/netflix.svg",
    color: "/home/logos/netflix-color.svg",
    glow: "#e50914",
    name: "Netflix",
    h: "h-7 sm:h-9",
  },
  {
    src: "/home/logos/onepiece.webp",
    color: "/home/logos/onepiece-color.webp",
    glow: "#f6c26b",
    name: "ONE PIECE",
    h: "h-12 sm:h-16",
  },
  {
    src: "/home/logos/sakamoto.webp",
    color: "/home/logos/sakamoto-color.webp",
    glow: "#e8443a",
    name: "Sakamoto Days",
    h: "h-10 sm:h-12",
  },
  {
    src: "/home/logos/denofgeek.webp",
    color: "/home/logos/denofgeek-color.webp",
    glow: "#e5262d",
    name: "Den of Geek",
    h: "h-5 sm:h-7",
  },
  {
    src: "/home/logos/evade.webp",
    color: "/home/logos/evade-color.webp",
    glow: "#f5c84b",
    name: "EVADE",
    h: "h-7 sm:h-9",
  },
];

/** How every activated product works, in three beats. */
const STEPS: { title: string; line: string; icon: React.ReactNode }[] = [
  {
    title: "Built in",
    line: "NFC and AR are designed into the product itself, never a sticker on top.",
    icon: (
      <>
        <circle cx="16" cy="16" r="10" />
        <circle cx="16" cy="16" r="4" />
        <path d="M16 2v3M16 27v3M2 16h3M27 16h3" />
      </>
    ),
  },
  {
    title: "Tap or scan",
    line: "The experience opens straight in the phone's browser. No app to download.",
    icon: (
      <>
        <rect x="9" y="3" width="14" height="26" rx="3" />
        <path d="M14 7h4" />
        <path d="M26 11c1.6 1.4 1.6 8.6 0 10M5.5 11c-1.6 1.4-1.6 8.6 0 10" />
      </>
    ),
  },
  {
    title: "Play, collect, return",
    line: "Games, rewards and first access bring fans back for the next drop.",
    icon: (
      <>
        <path d="m16 4 3.4 7 7.6 1-5.5 5.3 1.3 7.6L16 21.3l-6.8 3.6 1.3-7.6L5 12l7.6-1Z" />
        <path d="M8 29h16" />
      </>
    ),
  },
];

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
    name: "Hoodies",
    tags: "NFC · AR",
    img: "/activated-merch/posters/sukeban-hoodie.webp",
    alt: "The Sukeban AR hoodie",
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
    span: "",
    cover: true,
  },
];

function Home() {
  const lead = liveCampaigns()[0];
  const perf = [PERFORMANCE[0], PERFORMANCE[1], PERFORMANCE[2], PERFORMANCE[4]].filter(Boolean);

  return (
    <>
      <Hero />

      {/* ─────────────────────────── TRUSTED BY ─────────────────────────── */}
      <section
        aria-labelledby="logos-title"
        className="relative border-y border-white/10 bg-white/[0.025] py-10 sm:py-12"
      >
        <div className={SECTION}>
          <h2 id="logos-title" className={`${EYEBROW} text-center font-normal`}>
            Trusted by the worlds fans love
          </h2>
          <Reveal className="mt-8">
            <LogoBand
              logos={LOGOS}
              className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-8 sm:gap-x-16 lg:justify-between"
            />
          </Reveal>
        </div>
      </section>

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
                  className={`block display text-[clamp(26px,2.6vw,40px)] ${i % 2 ? TEXT.magenta : TEXT.blue}`}
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
          <Reveal className="lg:col-span-8">
            <Eyebrow hue="blue">What we do</Eyebrow>
            <h2 id="what-title" className={`${H2} mt-4`}>
              We commercialize IP through{" "}
              <span className={TEXT.blue}>experiential activations.</span>
            </h2>
          </Reveal>
          <Reveal delay={120} className="lg:col-span-4">
            <p className="text-muted-foreground lg:text-lg">
              MEDIALIFE is an immersive AI studio. We put app-free experiences on the products and
              media fans already love, with real-time analytics in every one, so IP earns more from
              its fans.
            </p>
          </Reveal>
        </div>

        {/* Flagship: activated products (the merch range lives here) */}
        <Reveal className="mt-10">
          <article
            id="merch"
            aria-labelledby="svc-products"
            className="svc-card lg-card grid scroll-mt-24 gap-8 rounded-[32px] p-6 sm:p-8 lg:grid-cols-12 lg:gap-10"
            style={{ "--c": HEX.blue } as React.CSSProperties}
          >
            <div className="flex flex-col lg:col-span-5">
              <ServiceIntro sv={SERVICES[0]} id="svc-products" />
              <p className="mt-5 text-sm leading-relaxed text-white/70">
                A flat NFC disc sits inside the design and the print itself is the AR target, on
                apparel, keychains, stickers and print.
              </p>
              <div className="mt-auto flex flex-wrap gap-3 pt-8">
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
            <ul
              aria-label="Activated products"
              className="grid auto-rows-[150px] grid-cols-2 gap-3 sm:auto-rows-[190px] md:grid-cols-4 lg:col-span-7 lg:auto-rows-[178px]"
            >
              {PRODUCTS.map((p, i) => (
                <li key={p.name} className={`${p.span} min-w-0`}>
                  <a
                    href="/activated-merch/"
                    className="group relative flex h-full overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.03] transition-colors hover:border-white/25"
                  >
                    <img
                      src={p.img}
                      alt={p.alt}
                      loading="lazy"
                      decoding="async"
                      className={`absolute inset-0 h-full w-full transition-transform duration-700 group-hover:scale-[1.05] ${p.cover ? "object-cover object-top opacity-90" : "object-contain p-3"}`}
                    />
                    <span className="lg-chip absolute bottom-2.5 left-2.5 flex flex-col rounded-2xl px-3 py-1.5 text-[12px] font-medium leading-tight text-white">
                      {p.name}
                      <span
                        className={`mono mt-0.5 text-[9px] uppercase tracking-[0.16em] ${i % 2 ? TEXT.magenta : TEXT.blue}`}
                      >
                        {p.tags}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </article>
        </Reveal>

        {/* Immersive marketing for IP launches: the Netflix campaign pieces, shown */}
        <Reveal className="mt-3">
          <article
            aria-labelledby="svc-marketing"
            className="svc-card lg-card grid gap-8 overflow-hidden rounded-[32px] p-6 sm:p-8 lg:grid-cols-12 lg:gap-10"
            style={{ "--c": HEX.magenta } as React.CSSProperties}
          >
            <MarketingCollage className="order-2 aspect-[6/5] w-full lg:order-1 lg:col-span-7 lg:aspect-[16/11]" />
            <div className="order-1 flex flex-col lg:order-2 lg:col-span-5 lg:justify-center">
              <ServiceIntro sv={SERVICES[1]} id="svc-marketing" />
              <p className="mt-5 text-sm leading-relaxed text-white/70">
                For Netflix: activated Den of Geek covers, posters, stickers and life-size standees
                for ONE PIECE and Sakamoto Days, in retail and at conventions.
              </p>
              <div className="mt-8">
                <Link
                  to="/case-studies"
                  className="group btn-pill btn-glass px-6 py-3.5 text-sm font-medium"
                >
                  Read the case studies
                  <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </Link>
              </div>
            </div>
          </article>
        </Reveal>
      </section>

      {/* ─────────────────────────── 3. WHAT WE BUILD ─────────────────────────── */}
      <section
        id="technology"
        aria-labelledby="tech-title"
        className={`${SECTION} scroll-mt-20 pb-20 lg:pb-28`}
      >
        <div className="grid gap-10 lg:grid-cols-12 lg:items-end">
          <Reveal className="lg:col-span-7">
            <Eyebrow hue="magenta">What we build</Eyebrow>
            <h2 id="tech-title" className={`${H2} mt-4`}>
              Every format. <span className={TEXT.magenta}>No app.</span>
            </h2>
          </Reveal>
          <Reveal delay={120} className="lg:col-span-5">
            <p className="text-muted-foreground lg:text-lg">
              We pick the format that fits the IP and the place fans meet it. Every one opens in the
              browser from a tap or a scan.
            </p>
          </Reveal>
        </div>

        <ul className="-mx-5 mt-10 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3">
          {FORMATS.map((f, i) => (
            <Reveal
              as="li"
              key={f.title}
              delay={(i % 3) * 90}
              className="fmt-card lg-card flex w-[80%] shrink-0 snap-start flex-col rounded-[26px] p-3 sm:w-auto"
            >
              <div
                className="fmt-media"
                style={{ "--pos": f.clip.pos ?? "50%" } as React.CSSProperties}
              >
                <InViewVideo src={f.clip.src} poster={f.clip.poster} label={f.clip.label} />
                <span className="lg-chip absolute left-3 top-3 rounded-full px-3 py-1 mono text-[9px] uppercase tracking-[0.16em] text-white/85">
                  {f.clip.caption}
                </span>
              </div>
              <div className="flex gap-3.5 px-2.5 pb-2 pt-4">
                <svg
                  viewBox="0 0 48 48"
                  width="30"
                  height="30"
                  fill="none"
                  stroke={HEX[f.hue]}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  className="draw shrink-0"
                >
                  {f.icon}
                </svg>
                <div>
                  <h3 className="text-base font-medium text-white">{f.title}</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{f.line}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </ul>

        <div className="mt-3 grid gap-3 lg:grid-cols-12">
          <Reveal delay={120} className="lg-card rounded-[28px] p-6 sm:p-8 lg:col-span-7">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h3 className={EYEBROW}>How it works</h3>
              <Link
                to="/technology"
                className="inline-flex items-center gap-2 text-sm text-primary hover:underline underline-offset-4"
              >
                The technology <span aria-hidden>→</span>
              </Link>
            </div>
            <ol className="flow mt-6 grid gap-6 md:grid-cols-3 md:gap-8">
              {STEPS.map((st, i) => (
                <li key={st.title} className="flow-step relative flex gap-4 md:block">
                  <span
                    className="flow-icon relative z-[1] grid h-12 w-12 shrink-0 place-items-center rounded-full border border-white/15 bg-background"
                    style={{ "--c": i % 2 ? HEX.magenta : HEX.blue } as React.CSSProperties}
                  >
                    <svg
                      viewBox="0 0 32 32"
                      width="22"
                      height="22"
                      fill="none"
                      stroke={i % 2 ? HEX.magenta : HEX.blue}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      {st.icon}
                    </svg>
                  </span>
                  <div className="md:mt-5">
                    <h4 className="text-base font-medium text-white">
                      <span className="mono mr-2 text-[11px] text-white/40">0{i + 1}</span>
                      {st.title}
                    </h4>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {st.line}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>

          {/* Real-time analytics: an illustration of the live view, not real numbers. */}
          <Reveal delay={200} className="lg-card rounded-[28px] p-6 sm:p-8 lg:col-span-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className={EYEBROW}>Real-time analytics</h3>
              <span className="inline-flex items-center gap-2 mono text-[10px] uppercase tracking-[0.2em] text-white/70">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse-glow"
                  aria-hidden
                />
                Live
              </span>
            </div>
            <p className="mt-3 text-white/90">
              Every scan and tap reports back as it happens, so you see what works by product, place
              and placement.
            </p>
            <svg
              viewBox="0 0 320 96"
              className="live-chart mt-6 h-24 w-full"
              fill="none"
              aria-hidden
              preserveAspectRatio="none"
            >
              <path d="M0 95.5h320" stroke="rgba(255,255,255,.12)" />
              <path
                className="lc-line"
                pathLength="1"
                d="M0 80 C30 76 42 60 64 62 S100 74 124 52 S160 30 184 40 S220 58 244 30 S286 12 320 16"
                stroke={HEX.blue}
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <path
                className="lc-line lc-line--b"
                pathLength="1"
                d="M0 90 C34 88 50 80 72 82 S110 86 132 72 S170 62 196 66 S232 70 256 56 S292 44 320 46"
                stroke={HEX.magenta}
                strokeWidth="2"
                strokeLinecap="round"
                opacity=".8"
              />
            </svg>
            <ul className="mt-5 flex flex-wrap gap-2">
              {MEASURES.map((m) => (
                <li
                  key={m}
                  className="lg-chip rounded-full px-3 py-1.5 mono text-[10px] uppercase tracking-[0.14em] text-white/75"
                >
                  {m}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ─────────────────────── 4. RESULTS ─────────────────────── */}
      <section
        id="partners"
        aria-labelledby="partners-title"
        className="scroll-mt-20 overflow-hidden pb-20 lg:pb-28"
      >
        <div className={SECTION}>
          <Reveal>
            <Eyebrow hue="magenta">Results</Eyebrow>
            <h2 id="partners-title" className={`${H2} mt-4`}>
              Proven at <span className={TEXT.magenta}>retail scale.</span>
            </h2>
          </Reveal>

          <div className="mt-10 grid gap-3 lg:grid-cols-12">
            <Reveal
              delay={160}
              className="lg-card flex flex-col rounded-3xl p-6 sm:p-8 lg:col-span-7"
            >
              <h3 className="mono text-[10px] font-normal uppercase tracking-[0.2em] text-muted-foreground">
                Netflix / Sakamoto Days
              </h3>
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
              <h3 className={`mt-3 display text-[clamp(24px,2.4vw,38px)] ${TEXT.magenta}`}>
                {AWARD.tier} {AWARD.name}
              </h3>
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

        <div aria-labelledby="cons-title" role="group" className="mt-12">
          <h3 id="cons-title" className={`${SECTION} ${EYEBROW} mb-6 font-normal`}>
            You can find us at
          </h3>
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
                <h3 id="evade-title" className="mt-4 display text-[clamp(24px,2.4vw,38px)]">
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
                  <h3 id="live-title" className="mt-4 display text-[clamp(24px,2.4vw,38px)]">
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

      {/* ─────────────────────────── CONTACT ─────────────────────────── */}
      <section
        id="contact"
        aria-labelledby="contact-title"
        className={`${SECTION} scroll-mt-20 border-t border-white/10 py-24 lg:py-32 text-center`}
      >
        <Eyebrow hue="magenta">Bring your IP</Eyebrow>
        <h2
          id="contact-title"
          className="display mx-auto mt-5 max-w-4xl text-[clamp(36px,4.8vw,72px)]"
        >
          Let's activate <span className={TEXT.magenta}>your IP.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-muted-foreground lg:text-lg">
          For entertainment, gaming, creators and licensed IP. $0 to start: we design, make, sell
          and fulfil, and you earn a royalty on every unit.
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
