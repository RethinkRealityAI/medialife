/**
 * Case studies.
 *
 * Every figure and quote is drawn from MEDIALIFE's own Live AR Media deck
 * (medialife-live-ar-media--04pmr63.gamma.site), from the case-study slides
 * supplied by the client, or from the official 2025 Pinnacle Awards winners
 * page. Do not add retailers, rounds, dates or platform relationships that are
 * not in those sources.
 *
 * All media is self-hosted under /work/. Creator clips are the 5s silent
 * preview loops supplied by the client, re-encoded to H.264 — they carry no
 * audio track, which is why the player is muted-loop rather than a full
 * video player with controls.
 */

export type Metric = { v: string; l: string };
export type Quote = { text: string; who: string };
export type Shot = { src: string; large?: string; alt: string };

/** A silent looping clip: poster frame first, video only on intent. */
export type Clip = {
  poster: string;
  src: string;
  alt: string;
  /** Portrait clips get a taller box; keeps the bento grid honest. */
  ratio: string;
};

export type Creator = {
  name: string;
  platform: string;
  handle?: string;
  stat: string;
  statLabel: string;
  note?: string;
  clip: Clip;
};

export type CaseStudy = {
  slug: string;
  client: string;
  title: string;
  kicker: string;
  award?: { tier: string; name: string; category: string; href: string };
  intro: string[];
  /** Challenge / Solution / Execution, as presented in the source slides. */
  approach?: { label: string; body: string }[];
  /** Grouped so each band can carry its own label, as in the source deck. */
  metricGroups: { label: string; items: Metric[] }[];
  retail?: { name: string; city: string; v: string }[];
  creators?: { label: string; items: Creator[] };
  quotes: Quote[];
  hero?: Shot;
  /** Motion pieces, rendered large at the head of the gallery. */
  motion?: Clip[];
  gallery: Shot[];
  formats: string[];
};

const g = (name: string, alt: string): Shot => ({
  src: `/work/${name}.webp`,
  large: `/work/${name}-large.webp`,
  alt,
});

const clip = (name: string, alt: string, ratio = "9 / 16"): Clip => ({
  poster: `/work/${name}-poster.webp`,
  src: `/work/${name}.mp4`,
  alt,
  ratio,
});

export const CASE_STUDIES: CaseStudy[] = [
  {
    slug: "sakamoto-days",
    client: "Netflix / Sakamoto Days",
    title: "Mr. Sakamoto's transformation, as live app-free AR.",
    kicker: "Activated print · Retail · Live events",
    award: {
      tier: "Platinum",
      name: "Pinnacle Award",
      category: "Experiential Marketing & Communications",
      href: "https://www.pinnacle-award.com/winners-marketing-communications-2025",
    },
    intro: [
      "MEDIALIFE turned Mr. Sakamoto's climactic transformation into a live, app-free augmented reality experience.",
      "We distributed AR-activated magazines, stickers, and posters across 150+ comic and manga retailers, then brought the program out of the living room and directly into fans' lives at Anime Expo, San Diego Comic-Con and Anime NYC — turning the transformation into a live, participatory experience.",
    ],
    approach: [
      {
        label: "Challenge",
        body: "A globally launching series needed a physical presence that fans would actually stop for — one that could be measured, not just admired.",
      },
      {
        label: "Solution",
        body: "We activated the print and retail media that was already going out — magazines, stickers, posters and standees — so a phone camera turns each one into a live AR performance with no app to install.",
      },
      {
        label: "Execution",
        body: "150+ comic and manga retailers across North America, plus live activations at Anime Expo, San Diego Comic-Con and Anime NYC, with engagement measured per unit.",
      },
    ],
    metricGroups: [
      {
        label: "Engagement duration",
        items: [
          { v: "3m 22s", l: "avg engagement · NFC-activated unit" },
          { v: "2m 37s", l: "avg engagement · QR-activated unit" },
        ],
      },
      {
        label: "Repeat engagement",
        items: [{ v: "5.46×", l: "interactions per NFC sticker" }],
      },
      {
        label: "Live event engagement",
        items: [{ v: "1.7", l: "attendees engaging per minute at Anime NYC" }],
      },
      {
        label: "Long-tail impact",
        items: [{ v: "+11%", l: "engagement growth 2+ weeks post distribution" }],
      },
    ],
    retail: [
      { name: "Toy Tokyo", city: "New York City, USA", v: "683" },
      { name: "Forbidden Planet", city: "New York City, USA", v: "490" },
      { name: "Golden Age Collectibles", city: "Vancouver, Canada", v: "356" },
    ],
    quotes: [
      {
        text: "This was a very unique activation. Our patrons loved it. The only issue is that it drove demand for the manga… which we ran out of pretty quickly. Can you get us more of the manga?",
        who: "Store Manager, Austin Books and Comics",
      },
      {
        text: "Mr. Sakamoto is the first thing our customers see when they walk in! Many folks interact with him. We rarely jump in and tell them to use their phones. People are taking the stickers, and we've sold quite a few mangas since he's been up.",
        who: "Store Manager, Pulp Fiction Long Beach",
      },
      {
        text: "We would love to do more activations like this. It's really something different. Please let us know when the next one is, we would really love to be a part of it.",
        who: "CMO, Midtown Comics, Inc",
      },
      {
        text: "The standee has been a really fun attraction for our shoppers and we love it.",
        who: "Shop Owner, Cabrillo Beach Curiosities",
      },
      {
        text: "We love having Mr. Sakamoto here! How long can we keep him up?",
        who: "Store Manager, Manga Spot Chicago",
      },
    ],
    hero: {
      src: "/work/sakamoto-header.webp",
      large: "/work/sakamoto-header-large.webp",
      alt: "Sakamoto Days on Netflix — MEDIALIFE activated character standee artwork and the Platinum Pinnacle Award badge",
    },
    motion: [
      clip(
        "sakamoto-motion-tag",
        "Live AR: a Sakamoto Days tag paints itself across the storefront façade, seen through a phone camera",
        "800 / 1561",
      ),
      clip(
        "sakamoto-motion-character",
        "Live AR: a life-sized Mr. Sakamoto appears in the venue concourse with smoke effects",
        "480 / 816",
      ),
    ],
    gallery: [
      g(
        "sakamoto-cosplay-standee",
        "Cosplayers posing with the Sakamoto Days activated standee at a convention",
      ),
      g(
        "sakamoto-escalator",
        "Fans holding the Den of Geek Sakamoto Days activated poster at Anime NYC",
      ),
      g(
        "sakamoto-standee-pikachu",
        "The Sakamoto Days standee on the convention floor at the Javits Center",
      ),
      g(
        "sakamoto-convention-hall",
        "Cosplayers gathered around the activated standee in the convention hall",
      ),
      g("sakamoto-cosplay-group", "Cosplay group posing with the Sakamoto Days standee"),
      g("sakamoto-fans-two", "Two fans holding the activated Sakamoto Days poster"),
      g("sakamoto-retail-street", "Sakamoto Days retail activation on the street outside a store"),
      g("sakamoto-fans-poster", "Fans outside the convention with the activated poster"),
      g("sakamoto-street-crowd", "Crowd on the street with activated Sakamoto Days posters"),
    ],
    formats: [
      "Activated magazines",
      "Activated stickers",
      "Activated posters",
      "Life-sized standees",
    ],
  },
  {
    slug: "convention-fandom",
    client: "Anime conventions",
    title: "Amplifying fandom immersion at anime conventions.",
    kicker: "Activated Apparel™ · NFC · Live events",
    intro: [
      "Convention exhibitors struggle to create memorable fan experiences that extend beyond the physical event, deliver measurable ROI, and sustain social media visibility.",
    ],
    approach: [
      {
        label: "Challenge",
        body: "Convention exhibitors struggle to create memorable fan experiences that extend beyond the physical event, deliver measurable ROI, and sustain social media visibility.",
      },
      {
        label: "Solution",
        body: "We enhanced print media and pop-culture merch with AR overlays using NFC for frictionless interaction, creating immersive touchpoints that drive repeat engagement & conversion.",
      },
      {
        label: "Execution",
        body: "We distributed AR media at 10+ major conventions: Anime Expo, San Diego Comic Con, Anime NYC, New York Comic Con, AWA, Kawaii Kon, Sakura-Con, Anime North, etc. delivering complete end-to-end implementation.",
      },
    ],
    metricGroups: [
      {
        label: "Conversion & interaction",
        items: [
          { v: "86%", l: "of AR interactions converted to action" },
          { v: "6.2", l: "number of interactions per AR-activated unit" },
          { v: "90%", l: "interaction rate" },
        ],
      },
      {
        label: "Depth & reach",
        items: [
          { v: "2+ min", l: "avg. engagement duration" },
          { v: "50%", l: "of AR experiences are shared with others" },
        ],
      },
    ],
    creators: {
      label: "Creators & community",
      items: [
        {
          name: "Fik-Shun",
          platform: "TikTok",
          handle: "@dance10fikshunofficial",
          stat: "5.8M",
          statLabel: "Followers",
          clip: clip(
            "creator-fikshun",
            "Fik-Shun filming on the Anime NYC convention floor at the Javits Center",
          ),
        },
        {
          name: "Logan Chitwood",
          platform: "TikTok",
          handle: "@theloganchitwood",
          stat: "7M",
          statLabel: "Followers",
          clip: clip(
            "creator-logan-chitwood",
            "Logan Chitwood showing the Yujiro × Animebae activated tee at Anime NYC",
          ),
        },
        {
          name: "Anime Fan Community",
          platform: "Instagram",
          stat: "100k+",
          statLabel: "Anime fans engaged",
          note: "Engaged over 100k anime fans with relatable activated content & merch.",
          clip: clip(
            "creator-anime-community",
            "A fan holding the Sukeban activated card at Anime NYC, shared to Instagram",
          ),
        },
      ],
    },
    quotes: [],
    hero: {
      src: "/work/sukeban-sticker.webp",
      large: "/work/sukeban-sticker-large.webp",
      alt: "Sukeban activated sticker artwork — activated apparel and fandom merchandise for convention audiences",
    },
    gallery: [],
    formats: [
      "Activated Apparel™",
      "NFC stickers",
      "Fandom merchandise",
      "Convention distribution",
    ],
  },
];

export const getCaseStudy = (slug: string) => CASE_STUDIES.find((c) => c.slug === slug);
